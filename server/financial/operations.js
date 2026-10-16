import { createCipheriv, createHmac, randomBytes, createHash, randomUUID } from 'node:crypto';
import { currentUser, originOk, rateAllowed } from '../auth-controller.js';
import { phonePePOSProvider } from '../pos/phonepe-provider.js';
import { providerStatus } from './provider.js';
import { EkoBbpsProvider } from './eko-bbps-provider.js';
import { serviceCatalogError, syncEkoBillerParameters, syncEkoBillers, syncEkoCategories } from './service-catalog.js';
import { handleTransferControlRequest, reserveTransferLimit } from './transfer-controls.js';
import { hasTransactionAccess } from '../rbac-policy.js';

const SERVICES = new Set(['BBPS', 'DMT', 'BANK_TRANSFER', 'RECHARGE', 'FASTAG']);
const SERVICE_STATES = new Set(['DRAFT', 'VALIDATION_PENDING', 'AUTHORIZATION_PENDING', 'PROVIDER_UNAVAILABLE', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSAL_PENDING', 'REVERSED', 'RECONCILIATION_REQUIRED']);
const SERVICE_TRANSITIONS = Object.freeze({
  DRAFT: ['VALIDATION_PENDING', 'AUTHORIZATION_PENDING', 'FAILED'],
  VALIDATION_PENDING: ['AUTHORIZATION_PENDING', 'PROVIDER_UNAVAILABLE', 'FAILED'],
  AUTHORIZATION_PENDING: ['READY_FOR_SUBMISSION', 'FAILED'],
  PROVIDER_UNAVAILABLE: ['VALIDATION_PENDING', 'FAILED'],
  READY_FOR_SUBMISSION: ['SUBMITTED', 'FAILED'],
  SUBMITTED: ['PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSAL_PENDING', 'RECONCILIATION_REQUIRED'],
  PROCESSING: ['SUCCESSFUL', 'FAILED', 'REVERSAL_PENDING', 'RECONCILIATION_REQUIRED'],
  SUCCESSFUL: ['REVERSAL_PENDING', 'RECONCILIATION_REQUIRED'],
  FAILED: ['RECONCILIATION_REQUIRED'],
  REVERSAL_PENDING: ['REVERSED', 'RECONCILIATION_REQUIRED'],
  RECONCILIATION_REQUIRED: ['SUCCESSFUL', 'FAILED', 'REVERSAL_PENDING', 'REVERSED'],
  REVERSED: [],
});
const ekoProvider = new EkoBbpsProvider();

export function assertServiceTransactionTransition(from, to, evidence = {}) {
  if (!SERVICE_STATES.has(from) || !SERVICE_STATES.has(to)) throw new Error('UNKNOWN_FINANCIAL_TRANSACTION_STATE');
  if (!SERVICE_TRANSITIONS[from]?.includes(to)) throw new Error(`INVALID_FINANCIAL_TRANSACTION_TRANSITION:${from}:${to}`);
  if (to === 'READY_FOR_SUBMISSION' && !(evidence.providerApproved && evidence.fundingApproved && evidence.approvalGranted)) {
    throw new Error('TRANSACTION_SUBMISSION_REQUIREMENTS_NOT_MET');
  }
  if (to === 'SUBMITTED' && !(evidence.providerAccepted === true && evidence.providerReference)) {
    throw new Error('PROVIDER_SUBMISSION_EVIDENCE_REQUIRED');
  }
  if (to === 'SUCCESSFUL' && !(evidence.providerConfirmed === true && evidence.providerReference)) {
    throw new Error('PROVIDER_SUCCESS_EVIDENCE_REQUIRED');
  }
  if (to === 'REVERSED' && !(evidence.providerConfirmed === true && evidence.providerReference)) {
    throw new Error('PROVIDER_REVERSAL_EVIDENCE_REQUIRED');
  }
  return true;
}

let poolPromise;
async function getPool() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_NOT_CONFIGURED'), { code: 'DATABASE_NOT_CONFIGURED' });
  let parsed;
  try { parsed = new URL(process.env.DATABASE_URL); } catch { throw Object.assign(new Error('DATABASE_NOT_CONFIGURED'), { code: 'DATABASE_NOT_CONFIGURED' }); }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(dbName)) throw Object.assign(new Error('DATABASE_NOT_ALLOWED'), { code: 'DATABASE_NOT_ALLOWED' });
  if (!poolPromise) poolPromise = import('pg').then(({ Pool }) => new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 }));
  return poolPromise;
}

function encryptionKey() {
  const value = process.env.FUNDING_SOURCE_ENCRYPTION_KEY;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV !== 'production') {
      return createHash('sha256').update('reachpay_dev_fallback_funding_source_encryption_key_32_b').digest();
    }
    throw Object.assign(new Error('FUNDING_SOURCE_ENCRYPTION_NOT_CONFIGURED'), { code: 'FUNDING_SOURCE_ENCRYPTION_NOT_CONFIGURED' });
  }
  return createHash('sha256').update(value).digest();
}

function encryptReference(reference) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(reference, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}

function fingerprintReference(reference) {
  return createHmac('sha256', encryptionKey()).update(reference).digest('hex');
}

function maskReference(reference) {
  const last = reference.slice(-4);
  return `${'•'.repeat(Math.max(4, Math.min(12, reference.length - 4)))}${last}`;
}

function requestId(req) {
  const id = String(req.headers?.['x-request-id'] || '').slice(0, 128);
  return id || null;
}

function pagination(url) {
  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('limit') || '25', 10) || 25));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  return { limit, offset };
}

function safeProviderAvailability() {
  const statuses = providerStatus();
  const phonepe = phonePePOSProvider.getIntegrationStatus();
  const paytmConfigured = Boolean(process.env.PAYTM_POS_MERCHANT_KEY && (process.env.PAYTM_POS_MID || process.env.PAYTM_MID));
  return {
    pos: {
      paytm: { status: paytmConfigured ? 'CONFIGURED_NOT_VERIFIED' : 'CREDENTIALS_REQUIRED', collection: 'provider-gated', balance: 'unavailable' },
      phonepe: { status: phonepe.status, collection: 'partner-approval-required', balance: 'unavailable' },
    },
    services: {
      bankVerification: 'unavailable-provider-not-configured',
      bankTransfer: 'unavailable-provider-not-configured',
      dmt: 'unavailable-provider-not-configured',
      bbps: 'unavailable-provider-not-configured',
      recharge: 'unavailable-provider-not-configured',
      fastag: 'unavailable-provider-not-configured',
    },
    configuredProviders: statuses,
    merchantBalance: 'unavailable-no-approved-pos-balance-api',
  };
}

async function audit(db, { actor, event, targetType, targetId, reasonCode, requestId: reqId, metadata = {} }) {
  await db.query(`INSERT INTO financial_operations_audit_events
    (actor_user_id,event_type,target_type,target_id,request_id,reason_code,safe_metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [actor, event, targetType, targetId || null, reqId, reasonCode || null, JSON.stringify(metadata)]);
}

async function getDashboard(db, userId) {
  const [pos, services, terminals, recent, reconciliation] = await Promise.all([
    db.query(`SELECT
        COUNT(*) FILTER (WHERE status IN ('INITIATED','IN_QUEUE','PENDING','UNKNOWN'))::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS successful_count,
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'SUCCESS'),0)::text AS successful_amount_paise,
        COUNT(*) FILTER (WHERE status IN ('FAILED','CANCELLED','EXPIRED'))::int AS failed_count,
        COUNT(*) FILTER (WHERE settlement_status IN ('SETTLEMENT_PENDING','NOT_AVAILABLE'))::int AS settlement_pending_count,
        COUNT(*) FILTER (WHERE settlement_status = 'SETTLED')::int AS settled_count
      FROM pos_transactions WHERE user_id=$1`, [userId]),
    db.query(`SELECT COUNT(*)::int AS pending_count FROM financial_service_transactions
      WHERE user_id=$1 AND status IN ('DRAFT','VALIDATION_PENDING','AUTHORIZATION_PENDING','PROVIDER_UNAVAILABLE','READY_FOR_SUBMISSION','SUBMITTED','PROCESSING','REVERSAL_PENDING','RECONCILIATION_REQUIRED')`, [userId]),
    db.query(`SELECT COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE status IN ('ONLINE','CONNECTED'))::int AS provider_reported_online_count,
        COUNT(*) FILTER (WHERE status='INACTIVE')::int AS disabled_count
      FROM pos_terminals WHERE user_id=$1`, [userId]),
    db.query(`SELECT merchant_txn_id AS reference, provider, 'POS'::text AS transaction_type, amount_paise,
        status, settlement_status, reconciliation_status, initiated_at AS created_at
      FROM pos_transactions WHERE user_id=$1
      UNION ALL
      SELECT public_reference AS reference, COALESCE(provider,'') AS provider, service_type AS transaction_type,
        amount_paise, status, NULL::text AS settlement_status, NULL::text AS reconciliation_status, created_at
      FROM financial_service_transactions WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 10`, [userId]),
    db.query(`SELECT
        (SELECT COUNT(*) FROM pos_transactions WHERE user_id=$1 AND reconciliation_status='RECONCILIATION_MISMATCH')::int
        + (SELECT COUNT(*) FROM financial_reconciliation_records WHERE user_id=$1 AND status IN ('OPEN','IN_REVIEW'))::int AS open_count`, [userId]),
  ]);
  const p = pos.rows[0] || {};
  const t = terminals.rows[0] || {};
  return {
    collections: {
      confirmedCount: p.successful_count || 0,
      confirmedAmountPaise: p.successful_amount_paise || '0',
      pendingCount: p.pending_count || 0,
      failedCount: p.failed_count || 0,
    },
    settlements: { pendingCount: p.settlement_pending_count || 0, settledCount: p.settled_count || 0, spendableBalancePaise: null },
    terminals: { totalCount: t.total_count || 0, providerReportedOnlineCount: t.provider_reported_online_count || 0, disabledCount: t.disabled_count || 0 },
    providerAvailability: safeProviderAvailability(),
    pendingFinancialRequestCount: services.rows[0]?.pending_count || 0,
    reconciliationExceptionCount: reconciliation.rows[0]?.open_count || 0,
    recentTransactions: recent.rows,
    databaseSource: 'postgresql',
  };
}

async function listTransactions(db, userId, url) {
  const { limit, offset } = pagination(url);
  const status = String(url.searchParams.get('status') || '').trim().toUpperCase().slice(0, 32);
  const type = String(url.searchParams.get('type') || '').trim().toUpperCase().slice(0, 24);
  const base = `SELECT reference, provider, transaction_type, amount_paise, status, settlement_status, reconciliation_status, created_at
    FROM (
      SELECT merchant_txn_id AS reference, provider, 'POS'::text AS transaction_type, amount_paise, status, settlement_status, reconciliation_status, initiated_at AS created_at
      FROM pos_transactions WHERE user_id=$1
      UNION ALL
      SELECT public_reference AS reference, COALESCE(provider,'') AS provider, service_type AS transaction_type, amount_paise, status, NULL::text AS settlement_status, NULL::text AS reconciliation_status, created_at
      FROM financial_service_transactions WHERE user_id=$1
    ) records
    WHERE ($2='' OR status=$2) AND ($3='' OR transaction_type=$3)`;
  const [countResult, dataResult] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM (${base}) filtered`, [userId, status, type]),
    db.query(`${base} ORDER BY created_at DESC LIMIT $4 OFFSET $5`, [userId, status, type, limit, offset]),
  ]);
  return { transactions: dataResult.rows, pagination: { limit, offset, total: countResult.rows[0]?.total || 0 } };
}

async function getTransaction(db, userId, reference) {
  const { rows } = await db.query(`SELECT public_reference AS reference, service_type AS transaction_type, service_category,
      provider, provider_reference, funding_source_id, beneficiary_id, status, amount_paise, currency,
      idempotency_key, blocker_code, safe_metadata, created_at, updated_at, submitted_at, completed_at
    FROM financial_service_transactions WHERE user_id=$1 AND public_reference=$2`, [userId, reference]);
  if (rows[0]) return { ...rows[0], source: 'financial_service_request' };
  const pos = await db.query(`SELECT merchant_txn_id AS reference, provider, 'POS'::text AS transaction_type,
      amount_paise, currency, status, settlement_status, settlement_payout_id, settled_amount_paise,
      settled_at, reconciliation_status, refund_status, refunded_amount_paise, payment_method, rrn,
      initiated_at AS created_at, completed_at
    FROM pos_transactions WHERE user_id=$1 AND merchant_txn_id=$2`, [userId, reference]);
  return pos.rows[0] ? { ...pos.rows[0], source: 'pos' } : null;
}

async function createServiceTransaction(db, userId, req, body) {
  const serviceType = String(body.serviceType || '').trim().toUpperCase();
  const amountPaise = Number(body.amountPaise);
  const key = String(req.headers?.['idempotency-key'] || body.idempotencyKey || '').trim();
  const sourceId = body.fundingSourceId ? String(body.fundingSourceId) : null;
  const beneficiaryId = body.beneficiaryId ? String(body.beneficiaryId) : null;
  const organizationId = body.organizationId ? String(body.organizationId) : null;
  const transferProduct = String(body.transferProduct || '').trim().toUpperCase();
  const senderProfileId = body.senderProfileId ? String(body.senderProfileId) : null;
  const category = body.serviceCategory ? String(body.serviceCategory).trim().toUpperCase().slice(0, 32) : null;
  if (!SERVICES.has(serviceType)) return { status: 400, body: { error: 'INVALID_SERVICE_TYPE' } };
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > 100_000_000) return { status: 400, body: { error: 'INVALID_AMOUNT_PAISA' } };
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) return { status: 400, body: { error: 'IDEMPOTENCY_KEY_REQUIRED' } };
  if (sourceId && !/^[0-9a-f-]{36}$/i.test(sourceId)) return { status: 400, body: { error: 'INVALID_FUNDING_SOURCE' } };
  if (beneficiaryId && !/^[0-9a-f-]{36}$/i.test(beneficiaryId)) return { status: 400, body: { error: 'INVALID_BENEFICIARY' } };
  if (['DMT','BANK_TRANSFER'].includes(serviceType) && !beneficiaryId) return { status: 400, body: { error: 'BENEFICIARY_REQUIRED' } };
  if (['DMT','BANK_TRANSFER'].includes(serviceType) && !sourceId) return { status: 400, body: { error: 'FUNDING_SOURCE_REQUIRED' } };
  if (['DMT','BANK_TRANSFER'].includes(serviceType) && (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId))) return { status: 400, body: { error: 'ORGANIZATION_REQUIRED' } };
  if (serviceType === 'DMT' && (!senderProfileId || !/^[0-9a-f-]{36}$/i.test(senderProfileId) || transferProduct !== 'DMT')) return { status: 400, body: { error: 'DMT_SENDER_AND_PRODUCT_REQUIRED' } };
  if (serviceType === 'BANK_TRANSFER' && !['OWN_BUSINESS','THIRD_PARTY'].includes(transferProduct)) return { status: 400, body: { error: 'BANK_TRANSFER_PRODUCT_REQUIRED' } };
  await db.query('BEGIN');
  try {
    if (organizationId) {
      const membership = await db.query(`SELECT m.role FROM financial_organization_members m
        JOIN financial_merchant_organizations o ON o.id=m.organization_id
        WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND o.status='ACTIVE' FOR SHARE OF m,o`, [organizationId,userId]);
      if (!membership.rows[0] || !['OWNER','ADMIN','MAKER'].includes(membership.rows[0].role)) { await db.query('ROLLBACK'); return { status:403,body:{error:'TRANSFER_MAKER_REQUIRED'} }; }
    }
    if (sourceId) {
      const source = await db.query('SELECT id FROM financial_funding_sources WHERE id=$1 AND user_id=$2', [sourceId, userId]);
      if (!source.rows[0]) { await db.query('ROLLBACK'); return { status: 404, body: { error: 'FUNDING_SOURCE_NOT_FOUND' } }; }
    }
    if (beneficiaryId) {
      const beneficiary = await db.query(`SELECT id FROM financial_beneficiaries WHERE id=$1 AND user_id=$2 AND verification_status <> 'DISABLED'`, [beneficiaryId, userId]);
      if (!beneficiary.rows[0]) { await db.query('ROLLBACK'); return { status: 404, body: { error: 'BENEFICIARY_NOT_FOUND' } }; }
    }
    const existing = await db.query(`SELECT * FROM financial_service_transactions WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`, [userId, key]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      let transferMatches=true;
      if(['DMT','BANK_TRANSFER'].includes(serviceType)) {
        const instruction=await db.query(`SELECT product,sender_profile_id FROM financial_transfer_instructions WHERE transaction_id=$1`,[row.id]);
        transferMatches=instruction.rows[0]?.product===(serviceType==='DMT'?'DMT':transferProduct)
          && instruction.rows[0]?.sender_profile_id===(senderProfileId||null);
      }
      const same = row.service_type === serviceType && Number(row.amount_paise) === amountPaise && row.funding_source_id === sourceId
        && row.beneficiary_id === beneficiaryId && row.service_category === category && row.organization_id === organizationId && transferMatches;
      await db.query('ROLLBACK');
      return same ? { status: 200, body: { transaction: row, idempotentReplay: true } } : { status: 409, body: { error: 'IDEMPOTENCY_KEY_CONFLICT' } };
    }
    const reference = `RPFS_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const result = await db.query(`INSERT INTO financial_service_transactions
      (public_reference,user_id,organization_id,service_type,service_category,funding_source_id,beneficiary_id,status,amount_paise,idempotency_key,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,now()+interval '24 hours') RETURNING *`, [reference, userId, organizationId, serviceType, category, sourceId, beneficiaryId, amountPaise, key]);
    const transaction = result.rows[0];
    let transferBlockers=[];
    if (['DMT','BANK_TRANSFER'].includes(serviceType)) {
      const instructionProduct=serviceType==='DMT'?'DMT':transferProduct;
      const sender=senderProfileId ? await db.query(`SELECT id,kyc_status FROM financial_dmt_sender_profiles WHERE id=$1 AND organization_id=$2`,[senderProfileId,organizationId]) : {rows:[]};
      if(serviceType==='DMT'&&!sender.rows.length) { await db.query('ROLLBACK'); return {status:404,body:{error:'DMT_SENDER_NOT_FOUND'}}; }
      const consent=senderProfileId ? await db.query(`SELECT id FROM financial_dmt_sender_consents WHERE sender_profile_id=$1 AND organization_id=$2 AND revoked_at IS NULL ORDER BY consented_at DESC LIMIT 1`,[senderProfileId,organizationId]) : {rows:[]};
      const target=await db.query(`SELECT verification_status FROM financial_beneficiaries WHERE id=$1 AND user_id=$2`,[beneficiaryId,userId]);
      if(!target.rows.length) { await db.query('ROLLBACK'); return {status:404,body:{error:'BENEFICIARY_NOT_FOUND'}}; }
      if(serviceType==='DMT'&&sender.rows[0].kyc_status!=='VERIFIED') transferBlockers.push('SENDER_KYC_NOT_VERIFIED');
      if(serviceType==='DMT'&&!consent.rows.length) transferBlockers.push('DMT_CONSENT_REQUIRED');
      if(target.rows[0].verification_status!=='VERIFIED') transferBlockers.push('BENEFICIARY_VERIFICATION_REQUIRED');
      const source=await db.query(`SELECT verification_status,activation_status,funding_permissions,supported_services FROM financial_funding_sources WHERE id=$1 AND user_id=$2`,[sourceId,userId]);
      if(!source.rows[0]||source.rows[0].verification_status!=='VERIFIED'||source.rows[0].activation_status!=='ACTIVE'
        ||!source.rows[0].funding_permissions?.includes(serviceType)||!source.rows[0].supported_services?.includes(serviceType)) transferBlockers.push('FUNDING_SOURCE_NOT_APPROVED');
      transferBlockers.push('SERVICE_PROVIDER_NOT_APPROVED','PROVIDER_FEE_NOT_AVAILABLE');
      const limit=await reserveTransferLimit(db,{organizationId,userId,serviceType,amountPaise,transactionId:transaction.id});
      if(!limit.ok) transferBlockers.push(limit.blocker);
      await db.query(`INSERT INTO financial_transfer_instructions(organization_id,transaction_id,product,sender_profile_id,beneficiary_id,created_by,blocker_code)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[organizationId,transaction.id,instructionProduct,senderProfileId,beneficiaryId,userId,transferBlockers[0]||'PROVIDER_AND_FUNDING_REVIEW_REQUIRED']);
      await db.query(`UPDATE financial_service_transactions SET blocker_code=$2 WHERE id=$1`,[transaction.id,transferBlockers[0]||'PROVIDER_AND_FUNDING_REVIEW_REQUIRED']);
      await audit(db,{actor:userId,event:'TRANSFER_INSTRUCTION_CREATED',targetType:'SERVICE_TRANSACTION',targetId:transaction.id,
        reasonCode:transferBlockers[0]||'PROVIDER_AND_FUNDING_REVIEW_REQUIRED',requestId:requestId(req),metadata:{serviceType,transferProduct:instructionProduct,limitReserved:limit.ok}});
    }
    await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,to_status,actor_user_id,reason_code,request_id)
      VALUES($1,'DRAFT',$2,'REQUEST_CREATED',$3)`, [transaction.id, userId, requestId(req)]);
    await audit(db, { actor: userId, event: 'FINANCIAL_REQUEST_CREATED', targetType: 'SERVICE_TRANSACTION', targetId: transaction.id, requestId: requestId(req), metadata: { serviceType, amountPaise } });
    await db.query('COMMIT');
    return { status: 201, body: { transaction, idempotentReplay: false, submission: 'NOT_SUBMITTED', blockers:transferBlockers } };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return { status: 409, body: { error: 'DUPLICATE_FINANCIAL_REQUEST' } };
    throw error;
  }
}

async function validateServiceRequest(db, userId, req, reference) {
  await db.query('BEGIN');
  try {
    const result = await db.query(`SELECT * FROM financial_service_transactions WHERE user_id=$1 AND public_reference=$2 FOR UPDATE`, [userId, reference]);
    const row = result.rows[0];
    if (!row) { await db.query('ROLLBACK'); return { status: 404, body: { error: 'TRANSACTION_NOT_FOUND' } }; }
    if (row.status !== 'DRAFT' && row.status !== 'PROVIDER_UNAVAILABLE') { await db.query('ROLLBACK'); return { status: 409, body: { error: 'INVALID_TRANSACTION_STATE', status: row.status } }; }
    const from = row.status;
    assertServiceTransactionTransition(from, 'VALIDATION_PENDING');
    await db.query(`UPDATE financial_service_transactions SET status='VALIDATION_PENDING',blocker_code=NULL,updated_at=now() WHERE id=$1`, [row.id]);
    await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,from_status,to_status,actor_user_id,reason_code,request_id)
      VALUES($1,$2,'VALIDATION_PENDING',$3,'LOCAL_VALIDATION_REQUESTED',$4)`, [row.id, from, userId, requestId(req)]);
    const source = row.funding_source_id
      ? await db.query(`SELECT verification_status,activation_status,funding_permissions,supported_services FROM financial_funding_sources WHERE id=$1 AND user_id=$2`, [row.funding_source_id, userId])
      : { rows: [] };
    const sourceReady = source.rows[0]?.verification_status === 'VERIFIED' && source.rows[0]?.activation_status === 'ACTIVE'
      && source.rows[0]?.supported_services?.includes(row.service_type) && source.rows[0]?.funding_permissions?.includes(row.service_type);
    const { rows: integration } = await db.query(`SELECT id FROM financial_provider_integrations WHERE user_id=$1 AND status='ACTIVE' AND product=$2 LIMIT 1`, [userId, row.service_type]);
    const blocker = !sourceReady ? 'FUNDING_SOURCE_NOT_APPROVED' : !integration.length ? 'SERVICE_PROVIDER_NOT_APPROVED' : 'PROVIDER_ADAPTER_NOT_IMPLEMENTED';
    const to = 'PROVIDER_UNAVAILABLE';
    assertServiceTransactionTransition('VALIDATION_PENDING', to);
    const updated = await db.query(`UPDATE financial_service_transactions SET status=$2,blocker_code=$3,updated_at=now() WHERE id=$1 RETURNING *`, [row.id, to, blocker]);
    await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,from_status,to_status,actor_user_id,reason_code,request_id)
      VALUES($1,'VALIDATION_PENDING',$2,$3,$4,$5)`, [row.id, to, userId, blocker, requestId(req)]);
    await audit(db, { actor: userId, event: 'FINANCIAL_REQUEST_BLOCKED', targetType: 'SERVICE_TRANSACTION', targetId: row.id, reasonCode: blocker, requestId: requestId(req), metadata: { serviceType: row.service_type } });
    await db.query('COMMIT');
    return { status: 200, body: { transaction: updated.rows[0], submitted: false, blocker } };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function createFundingSource(db, userId, req, body) {
  const provider = String(body.provider || '').trim().toLowerCase();
  const reference = String(body.accountReference || '').trim();
  if (!['paytm','phonepe','eko','razorpayx','cashfree','bank','other'].includes(provider)) return { status: 400, body: { error: 'INVALID_FUNDING_PROVIDER' } };
  if (reference.length < 4 || reference.length > 120 || /[\r\n]/.test(reference)) return { status: 400, body: { error: 'INVALID_ACCOUNT_REFERENCE' } };
  const encrypted = encryptReference(reference);
  const fingerprint = fingerprintReference(reference);
  const masked = maskReference(reference);
  await db.query('BEGIN');
  try {
  const result = await db.query(`INSERT INTO financial_funding_sources
    (user_id,provider,account_reference_ciphertext,account_reference_iv,account_reference_tag,account_reference_fingerprint,masked_reference)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,provider,masked_reference,verification_status,funding_permissions,supported_services,activation_status,last_verified_at,created_at,updated_at`,
  [userId, provider, encrypted.ciphertext, encrypted.iv, encrypted.tag, fingerprint, masked]).catch((error) => {
    if (error.code === '23505') return { duplicate: true };
    throw error;
  });
  if (result.duplicate) { await db.query('ROLLBACK'); return { status: 409, body: { error: 'DUPLICATE_FUNDING_SOURCE' } }; }
  await audit(db, { actor: userId, event: 'FUNDING_SOURCE_REGISTERED', targetType: 'FUNDING_SOURCE', targetId: result.rows[0].id, reasonCode: 'UNVERIFIED_REFERENCE_ONLY', requestId: requestId(req), metadata: { provider, activationStatus: 'INACTIVE' } });
  await db.query('COMMIT');
  return { status: 201, body: { fundingSource: result.rows[0], notice: 'Reference saved only. Ownership, permissions, and spendable balance are not verified.' } };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function cancelTransferRequest(db, userId, req, reference) {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(`SELECT id,status,organization_id FROM financial_service_transactions
      WHERE user_id=$1 AND public_reference=$2 AND service_type IN ('DMT','BANK_TRANSFER') FOR UPDATE`, [userId, reference]);
    const transaction = rows[0];
    if (!transaction) { await db.query('ROLLBACK'); return { status:404, body:{ error:'TRANSACTION_NOT_FOUND' } }; }
    if (!['DRAFT','AUTHORIZATION_PENDING'].includes(transaction.status)) {
      await db.query('ROLLBACK');
      return { status:409, body:{ error:'TRANSACTION_CANNOT_BE_CANCELLED', status:transaction.status } };
    }
    await db.query(`UPDATE financial_service_transactions SET status='FAILED',blocker_code='REQUEST_CANCELLED',updated_at=now(),completed_at=now() WHERE id=$1`, [transaction.id]);
    await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,from_status,to_status,actor_user_id,reason_code,request_id)
      VALUES($1,$2,'FAILED',$3,'REQUEST_CANCELLED',$4)`, [transaction.id,transaction.status,userId,requestId(req)]);
    const approvals = await db.query(`UPDATE financial_transaction_approvals
      SET status='CANCELLED',decision_reason='REQUEST_CANCELLED',decided_at=now(),decision_request_id=$2
      WHERE transaction_id=$1 AND status='PENDING' RETURNING id,organization_id`, [transaction.id,requestId(req)]);
    for (const approval of approvals.rows) {
      await db.query(`INSERT INTO financial_approval_history(approval_id,organization_id,actor_user_id,action,reason,request_id)
        VALUES($1,$2,$3,'CANCELLED','REQUEST_CANCELLED',$4)`, [approval.id,approval.organization_id,userId,requestId(req)]);
    }
    await db.query(`UPDATE financial_limit_utilization SET status='RELEASED',updated_at=now() WHERE transaction_id=$1 AND status='RESERVED'`, [transaction.id]);
    if (transaction.organization_id) await db.query(`INSERT INTO financial_organization_audit_events
      (organization_id,actor_user_id,event_type,target_type,target_id,reason_code,request_id)
      VALUES($1,$2,'TRANSFER_CANCELLED','SERVICE_TRANSACTION',$3,'REQUEST_CANCELLED',$4)`, [transaction.organization_id,userId,transaction.id,requestId(req)]);
    await audit(db,{actor:userId,event:'TRANSFER_CANCELLED',targetType:'SERVICE_TRANSACTION',targetId:transaction.id,reasonCode:'REQUEST_CANCELLED',requestId:requestId(req)});
    await db.query('COMMIT');
    return { status:200, body:{ cancelled:true, transactionReference:reference, status:'FAILED', limitReservation:'RELEASED' } };
  } catch (error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
}

function statusError(error) {
  if (['DATABASE_NOT_CONFIGURED','DATABASE_NOT_ALLOWED','FUNDING_SOURCE_ENCRYPTION_NOT_CONFIGURED','DMT_DATA_ENCRYPTION_NOT_CONFIGURED'].includes(error.code)) return { status: 503, body: { error: error.code } };
  if (error.code === '42P01') return { status: 503, body: { error: 'FINANCIAL_OPERATIONS_MIGRATION_REQUIRED' } };
  return { status: 503, body: { error: 'FINANCIAL_SERVICE_UNAVAILABLE' } };
}

export async function handleFinancialOperationsRequest(req, url, body = {}) {
  const method = String(req.method || 'GET').toUpperCase();
  const organizationRoute = url.pathname.startsWith('/api/financial/organizations');
  if (!['GET','POST',...(organizationRoute ? ['PATCH','PUT'] : [])].includes(method)) return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (method === 'POST' && !originOk(req)) return { status: 403, body: { error: 'ORIGIN_NOT_ALLOWED' } };
  let user;
  try { user = await currentUser(req); } catch { return { status: 503, body: { error: 'AUTHENTICATION_STORE_UNAVAILABLE' } }; }
  if (!user) return { status: 401, body: { error: 'AUTHENTICATION_REQUIRED' } };
  if (user.status !== 'ACTIVE') return { status: 403, body: { error: 'ACCOUNT_NOT_ACTIVE' } };
  if (!hasTransactionAccess(user)) return { status: 403, body: { error: 'ACCESS_FORBIDDEN' } };
  try { if (!await rateAllowed(`financial_operations:${user.id}`, 60, 1)) return { status: 429, body: { error: 'RATE_LIMITED' } }; }
  catch { return { status: 503, body: { error: 'RATE_LIMIT_STORE_UNAVAILABLE' } }; }

  const parts = url.pathname.split('/').filter(Boolean).slice(2);
  const resource = parts[0] || '';
  const reference = parts[1] || '';
  let client;
  try {
    const pool = await getPool();
    client = await pool.connect();
    const db = client;
    await db.query('SELECT 1 FROM financial_service_transactions LIMIT 0');
    if(resource==='organizations') {
      const result=await handleTransferControlRequest(req,url,body,user,db);
      if(result)return result;
    }
    if (resource === 'dashboard' && method === 'GET') return { status: 200, body: await getDashboard(db, user.id) };
    if (resource === 'services' && parts[1] === 'status' && method === 'GET') {
      const [categories,counters] = await Promise.all([
        db.query(`SELECT COUNT(*)::int AS count,MAX(cv.synced_at) AS synced_at FROM financial_service_categories c
          JOIN financial_service_catalog_versions cv ON cv.id=c.catalog_version_id WHERE c.provider='eko' AND c.active=true`),
        db.query(`SELECT COUNT(*)::int AS billers FROM financial_service_billers WHERE provider='eko' AND active=true`),
      ]);
      return { status: 200, body: { provider: ekoProvider.getIntegrationStatus(), catalog: { categories: categories.rows[0].count, billers: counters.rows[0].billers, lastSyncedAt: categories.rows[0].synced_at }, paymentFunding: 'UNAVAILABLE_POS_FUNDING_NOT_AUTHORIZED', billFetch: 'UNAVAILABLE_PROVIDER_CREDENTIALS_OR_LOCATION_REQUIRED', paymentSubmission: 'DISABLED_POS_FUNDING_NOT_AUTHORIZED' } };
    }
    if (resource === 'services' && parts[1] === 'categories' && parts.length === 2 && method === 'GET') {
      const { rows } = await db.query(`SELECT c.provider_category_id AS id,c.name,c.active,cv.version_number AS version,cv.synced_at
        FROM financial_service_categories c JOIN financial_service_catalog_versions cv ON cv.id=c.catalog_version_id
        WHERE c.provider='eko' AND c.active=true ORDER BY c.name`);
      return { status: 200, body: { categories: rows, availability: rows.length ? 'PROVIDER_CATALOG' : 'SERVICE_ACTIVATION_PENDING' } };
    }
    if (resource === 'services' && parts[1] === 'catalog' && parts[2] === 'sync' && method === 'POST') {
      try { return { status: 200, body: { result: await syncEkoCategories(db) } }; }
      catch (error) { return serviceCatalogError(error); }
    }
    if (resource === 'services' && parts[1] === 'categories' && parts[3] === 'billers' && method === 'GET') {
      const categoryId = parts[2];
      const { rows } = await db.query(`SELECT provider_biller_id AS id,name,supports_bill_fetch,high_commission_channel,bbps_member,catalog_version_id
        FROM financial_service_billers WHERE provider='eko' AND category_id=$1 AND active=true ORDER BY name`, [categoryId]);
      return { status: 200, body: { billers: rows, availability: rows.length ? 'PROVIDER_CATALOG' : 'CATALOG_NOT_SYNCED' } };
    }
    if (resource === 'services' && parts[1] === 'billers' && parts[3] === 'parameters' && method === 'GET') {
      const billerId = parts[2];
      let { rows } = await db.query(`SELECT parameter_id AS id,parameter_name AS name,parameter_label AS label,parameter_type AS type,
        validation_regex AS regex,error_message AS error,list_values AS values,required
        FROM financial_service_biller_parameters WHERE provider='eko' AND provider_biller_id=$1 ORDER BY parameter_id`, [billerId]);
      if (!rows.length) {
        try { return { status: 200, body: await syncEkoBillerParameters(db,billerId) }; }
        catch (error) { return serviceCatalogError(error); }
      }
      return { status: 200, body: { parameters: rows, availability: 'PROVIDER_CATALOG' } };
    }
    if (resource === 'services' && parts[1] === 'categories' && parts[2] === 'sync-billers' && method === 'POST') {
      try { return { status: 200, body: await syncEkoBillers(db,String(body.categoryId || '')) }; }
      catch (error) { return serviceCatalogError(error); }
    }
    if (resource === 'services' && parts[1] === 'recharge' && parts[2] === 'operator' && method === 'GET') {
      if (!ekoProvider.isRechargeConfigured()) return { status: 503, body: { error: 'EKO_CATALOG_UNAVAILABLE', status: 'SERVICE_ACTIVATION_PENDING' } };
      try { const payload = await ekoProvider.getRechargeOperatorAndCircle(String(url.searchParams.get('mobile') || '')); return { status: 200, body: { dependentParams: payload.dependent_params || [], status: payload.status, message: payload.message } }; }
      catch (error) { return serviceCatalogError(error); }
    }
    if (resource === 'services' && parts[1] === 'recharge' && parts[2] === 'plans' && method === 'GET') {
      if (!ekoProvider.isRechargeConfigured()) return { status: 503, body: { error: 'EKO_CATALOG_UNAVAILABLE', status: 'SERVICE_ACTIVATION_PENDING' } };
      try { const payload = await ekoProvider.getRechargePlans(String(url.searchParams.get('mobile') || ''),String(url.searchParams.get('operatorCode') || ''),String(url.searchParams.get('circleId') || '')); return { status: 200, body: { dependentParams: payload.dependent_params || [], status: payload.status, message: payload.message } }; }
      catch (error) { return serviceCatalogError(error); }
    }
    if (resource === 'transactions' && !reference && method === 'GET') return { status: 200, body: await listTransactions(db, user.id, url) };
    if (resource === 'transactions' && !reference && method === 'POST') return await createServiceTransaction(db, user.id, req, body);
    if (resource === 'transactions' && reference && parts.length === 2 && method === 'GET') {
      const transaction = await getTransaction(db, user.id, reference);
      return transaction ? { status: 200, body: { transaction } } : { status: 404, body: { error: 'TRANSACTION_NOT_FOUND' } };
    }
    if (resource === 'transactions' && reference && parts[2] === 'cancel' && method === 'POST') return await cancelTransferRequest(db,user.id,req,reference);
    if (resource === 'transactions' && reference && parts[2] === 'validate' && method === 'POST') return await validateServiceRequest(db, user.id, req, reference);
    if (resource === 'transactions' && reference && parts[2] === 'submit' && method === 'POST') return { status: 503, body: { error: 'PROVIDER_UNAVAILABLE', message: 'No approved provider and funding source are enabled. No transaction was submitted.' } };
    if (resource === 'funding-sources' && method === 'GET') {
      const { rows } = await db.query(`SELECT id,provider,masked_reference,verification_status,funding_permissions,supported_services,activation_status,last_verified_at,created_at,updated_at
        FROM financial_funding_sources WHERE user_id=$1 ORDER BY created_at DESC`, [user.id]);
      return { status: 200, body: { fundingSources: rows } };
    }
    if (resource === 'funding-sources' && method === 'POST') return await createFundingSource(db, user.id, req, body);
    if (resource === 'providers' && method === 'GET') {
      const { rows } = await db.query(`SELECT provider,product,status,verified_at,permissions,safe_metadata,updated_at
        FROM financial_provider_integrations WHERE user_id=$1 ORDER BY provider,product`, [user.id]);
      return { status: 200, body: { integrations: rows, availability: safeProviderAvailability() } };
    }
    if (resource === 'reconciliation' && method === 'GET') {
      const { limit, offset } = pagination(url);
      const { rows } = await db.query(`SELECT id,service_transaction_id,pos_transaction_id,provider,issue_type,status,expected_amount_paise,observed_amount_paise,provider_reference,resolution_reference,created_at,resolved_at
        FROM financial_reconciliation_records WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [user.id, limit, offset]);
      const { rows: posRows } = await db.query(`SELECT merchant_txn_id AS reference,provider,amount_paise,status,reconciliation_status,settlement_status,initiated_at
        FROM pos_transactions WHERE user_id=$1 AND reconciliation_status IN ('RECONCILIATION_MISMATCH','RECONCILIATION_REQUIRED') ORDER BY initiated_at DESC LIMIT $2 OFFSET $3`, [user.id, limit, offset]);
      return { status: 200, body: { serviceExceptions: rows, posExceptions: posRows, pagination: { limit, offset } } };
    }
    return { status: 404, body: { error: 'ROUTE_NOT_FOUND' } };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && method === 'GET') {
      if (resource === 'dashboard') {
        return {
          status: 200,
          body: {
            summary: { totalVolumePaise: 0, successfulCount: 0, pendingCount: 0, failedCount: 0 },
            recentTransactions: [],
            services: [
              { name: 'BBPS', status: 'READY_IN_DEV' },
              { name: 'DMT', status: 'READY_IN_DEV' },
              { name: 'BANK_TRANSFER', status: 'READY_IN_DEV' },
              { name: 'RECHARGE', status: 'READY_IN_DEV' },
              { name: 'FASTAG', status: 'READY_IN_DEV' },
            ],
            organizations: [],
          },
        };
      }
      if (resource === 'organizations') {
        return { status: 200, body: { organizations: [] } };
      }
      if (resource === 'services' && parts[1] === 'status') {
        return {
          status: 200,
          body: {
            provider: ekoProvider.getIntegrationStatus(),
            catalog: { categories: 0, billers: 0, lastSyncedAt: null },
            paymentFunding: 'UNAVAILABLE_POS_FUNDING_NOT_AUTHORIZED',
            billFetch: 'UNAVAILABLE_PROVIDER_CREDENTIALS_OR_LOCATION_REQUIRED',
            paymentSubmission: 'DISABLED_POS_FUNDING_NOT_AUTHORIZED',
          },
        };
      }
      if (resource === 'services' && parts[1] === 'categories') {
        return { status: 200, body: { categories: [], availability: 'SERVICE_ACTIVATION_PENDING' } };
      }
      if (resource === 'providers') {
        return { status: 200, body: { integrations: [], availability: safeProviderAvailability() } };
      }
      if (resource === 'reconciliation') {
        return { status: 200, body: { serviceExceptions: [], posExceptions: [], pagination: { limit: 30, offset: 0 } } };
      }
    }
    return statusError(error);
  } finally {
    client?.release();
  }
}
