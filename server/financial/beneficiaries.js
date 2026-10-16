import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { currentUser, originOk, rateAllowed } from '../auth-controller.js';
import { hasTransactionAccess } from '../rbac-policy.js';

let poolPromise;
async function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  let parsed;
  try { parsed = new URL(process.env.DATABASE_URL); } catch { throw new Error('DATABASE_NOT_CONFIGURED'); }
  const database = parsed.pathname.replace(/^\//, '');
  if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(database)) throw new Error('DATABASE_NOT_ALLOWED');
  if (!poolPromise) {
    poolPromise = import('pg').then(({ Pool }) => new Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5000 }));
  }
  return poolPromise;
}

function encryptionKey() {
  const raw = process.env.BENEFICIARY_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV !== 'production') {
      return createHash('sha256').update('reachpay_dev_fallback_beneficiary_encryption_key_32_bytes', 'utf8').digest();
    }
    throw new Error('BENEFICIARY_ENCRYPTION_NOT_CONFIGURED');
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}
function accountFingerprint(account, ifsc) {
  return createHmac('sha256', encryptionKey()).update(`${ifsc}:${account}`).digest('hex');
}
function encryptAccount(account) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(account, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}
function decryptAccount(row) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.bank_account_iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.bank_account_tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(row.bank_account_ciphertext, 'hex')), decipher.final()]).toString('utf8');
}
function mask(account) { return `••••${account.slice(-4)}`; }
function publicBeneficiary(row) {
  return { id: row.id, name: row.display_name, account: row.masked_destination, ifsc: row.ifsc_code, verificationStatus: row.verification_status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function validateInput(body, partial = false) {
  const input = {};
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 100) return null;
    input.name = body.name.trim();
  }
  if (!partial || body.accountNumber !== undefined) {
    if (typeof body.accountNumber !== 'string' || !/^\d{9,18}$/.test(body.accountNumber.trim())) return null;
    input.account = body.accountNumber.trim();
  }
  if (!partial || body.ifsc !== undefined) {
    if (typeof body.ifsc !== 'string' || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(body.ifsc.trim())) return null;
    input.ifsc = body.ifsc.trim().toUpperCase();
  }
  if (partial && !Object.keys(input).length) return null;
  return input;
}

async function audit(db, actor, action, id, requestId) {
  await db.query(`INSERT INTO financial_audit_logs(actor_user_id, action, target_type, target_id, request_id, safe_metadata)
    VALUES ($1,$2,'BENEFICIARY',$3,$4,'{}'::jsonb)`, [actor, action, id, requestId || null]);
}

export async function handleBeneficiaryRequest(req, url, body = {}) {
  const method = req.method;
  if (!['GET', 'POST', 'PATCH'].includes(method)) return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (method !== 'GET' && !originOk(req)) return { status: 403, body: { error: 'ORIGIN_NOT_ALLOWED' } };
  let user;
  try { user = await currentUser(req); }
  catch { return { status: 503, body: { error: 'AUTHENTICATION_STORE_UNAVAILABLE' } }; }
  if (!user) return { status: 401, body: { error: 'AUTHENTICATION_REQUIRED' } };
  if (user.status !== 'ACTIVE') return { status: 403, body: { error: 'ACCOUNT_NOT_ACTIVE' } };
  if (!hasTransactionAccess(user)) return { status: 403, body: { error: 'ACCESS_FORBIDDEN' } };
  try {
    if (!await rateAllowed(`banking_beneficiaries:${user.id}`, 60, 1)) return { status: 429, body: { error: 'RATE_LIMITED' } };
  } catch { return { status: 503, body: { error: 'RATE_LIMIT_STORE_UNAVAILABLE' } }; }

  if (method === 'GET' && url.pathname === '/api/banking/status') {
    return { status: 200, body: {
      beneficiaries: 'postgresql',
      encryption: encryptionConfigurationStatus().configured ? 'configured' : 'unavailable',
      bankAccountValidation: 'format-only',
      bankAccountVerification: 'unavailable-provider-not-configured',
      posSettlement: 'read-only-settlement-evidence',
      settlementFunding: 'not-established-from-pos-settlement',
      merchantBalance: 'not-integrated',
      transfers: 'unavailable-approved-payout-provider-required',
      bbps: 'unavailable-approved-bill-payment-provider-required',
    } };
  }

  let db;
  try {
    db = await databasePool();
    await db.query('SELECT 1 FROM financial_beneficiaries LIMIT 0');
    if (method === 'GET') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[3];
      const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
      if (id) {
        const { rows } = await db.query(`SELECT id, display_name, masked_destination, ifsc_code, verification_status, created_at, updated_at
          FROM financial_beneficiaries WHERE user_id=$1 AND id=$2`, [user.id, id]);
        return rows[0] ? { status: 200, body: { beneficiary: publicBeneficiary(rows[0]) } } : { status: 404, body: { error: 'BENEFICIARY_NOT_FOUND' } };
      }
      const { rows } = await db.query(`SELECT id, display_name, masked_destination, ifsc_code, verification_status, created_at, updated_at
        FROM financial_beneficiaries WHERE user_id=$1 AND ($2='' OR display_name ILIKE '%' || $2 || '%' OR ifsc_code ILIKE '%' || $2 || '%' OR masked_destination ILIKE '%' || $2 || '%')
        ORDER BY updated_at DESC LIMIT 100`, [user.id, query]);
      return { status: 200, body: { beneficiaries: rows.map(publicBeneficiary), integration: { storage: 'postgresql', accountVerification: 'unavailable', bankTransfer: 'unavailable', bbps: 'unavailable' } } };
    }

    if (method === 'POST') {
      const input = validateInput(body);
      if (!input) return { status: 400, body: { error: 'INVALID_BENEFICIARY_DETAILS', message: 'Enter a name, 9 to 18 digit account number, and structurally valid IFSC.' } };
      const encrypted = encryptAccount(input.account);
      const fingerprint = accountFingerprint(input.account, input.ifsc);
      await db.query('BEGIN');
      try {
        const { rows } = await db.query(`INSERT INTO financial_beneficiaries
          (user_id,display_name,bank_account_ciphertext,bank_account_iv,bank_account_tag,ifsc_code,account_fingerprint,masked_destination)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,display_name,masked_destination,ifsc_code,verification_status,created_at,updated_at`,
        [user.id, input.name, encrypted.ciphertext, encrypted.iv, encrypted.tag, input.ifsc, fingerprint, mask(input.account)]);
        await audit(db, user.id, 'BENEFICIARY_CREATED', rows[0].id, req.headers['x-request-id']);
        await db.query('COMMIT');
        return { status: 201, body: { beneficiary: publicBeneficiary(rows[0]), notice: 'IFSC format checked. Bank ownership has not been verified.' } };
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return { status: 409, body: { error: 'DUPLICATE_BENEFICIARY' } };
        throw error;
      }
    }

    const id = url.pathname.split('/').filter(Boolean)[3];
    if (!id) return { status: 404, body: { error: 'BENEFICIARY_NOT_FOUND' } };
    const action = body.action;
    if (action === 'deactivate') {
      await db.query('BEGIN');
      try {
        const { rows } = await db.query(`UPDATE financial_beneficiaries SET verification_status='DISABLED',updated_at=now()
          WHERE user_id=$1 AND id=$2 AND verification_status <> 'DISABLED'
          RETURNING id,display_name,masked_destination,ifsc_code,verification_status,created_at,updated_at`, [user.id, id]);
        if (!rows[0]) { await db.query('ROLLBACK'); return { status: 404, body: { error: 'BENEFICIARY_NOT_FOUND' } }; }
        await audit(db, user.id, 'BENEFICIARY_DEACTIVATED', id, req.headers['x-request-id']);
        await db.query('COMMIT');
        return { status: 200, body: { beneficiary: publicBeneficiary(rows[0]) } };
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    }

    const input = validateInput(body, true);
    if (!input) return { status: 400, body: { error: 'INVALID_BENEFICIARY_DETAILS' } };
    const existing = await db.query('SELECT * FROM financial_beneficiaries WHERE user_id=$1 AND id=$2', [user.id, id]);
    if (!existing.rows[0]) return { status: 404, body: { error: 'BENEFICIARY_NOT_FOUND' } };
    const row = existing.rows[0];
    const account = input.account || decryptAccount(row);
    const ifsc = input.ifsc || row.ifsc_code.trim();
    const encrypted = input.account ? encryptAccount(account) : { ciphertext: row.bank_account_ciphertext, iv: row.bank_account_iv, tag: row.bank_account_tag };
    const fingerprint = accountFingerprint(account, ifsc);
    await db.query('BEGIN');
    try {
      const { rows } = await db.query(`UPDATE financial_beneficiaries SET display_name=$3,bank_account_ciphertext=$4,bank_account_iv=$5,
        bank_account_tag=$6,ifsc_code=$7,account_fingerprint=$8,masked_destination=$9,verification_status='UNVERIFIED',updated_at=now()
        WHERE user_id=$1 AND id=$2 RETURNING id,display_name,masked_destination,ifsc_code,verification_status,created_at,updated_at`,
      [user.id, id, input.name || row.display_name, encrypted.ciphertext, encrypted.iv, encrypted.tag, ifsc, fingerprint, mask(account)]);
      await audit(db, user.id, 'BENEFICIARY_UPDATED', id, req.headers['x-request-id']);
      await db.query('COMMIT');
      return { status: 200, body: { beneficiary: publicBeneficiary(rows[0]), notice: 'Bank ownership remains unverified.' } };
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return { status: 409, body: { error: 'DUPLICATE_BENEFICIARY' } };
      throw error;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && method === 'GET') {
      return { status: 200, body: { beneficiaries: [], notice: 'Banking storage initializing in development.', integration: { storage: 'dev-fallback', accountVerification: 'unavailable', bankTransfer: 'unavailable', bbps: 'unavailable' } } };
    }
    const unavailable = ['DATABASE_NOT_CONFIGURED', 'DATABASE_NOT_ALLOWED', 'BENEFICIARY_ENCRYPTION_NOT_CONFIGURED'].includes(error.message);
    return { status: 503, body: { error: unavailable ? error.message : 'BANKING_STORAGE_UNAVAILABLE', integration: { beneficiaries: 'unavailable', bankVerification: 'unavailable', transfers: 'unavailable', bbps: 'unavailable' } } };
  }
}

export function encryptionConfigurationStatus() {
  return { configured: Boolean(process.env.BENEFICIARY_ENCRYPTION_KEY && process.env.BENEFICIARY_ENCRYPTION_KEY.length >= 32) };
}
