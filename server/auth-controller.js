import process from 'node:process';
import { randomUUID, createHmac } from 'node:crypto';
import { clearSessionCookie, hashOtp, hashPassword, hashToken, newEmailOtp, newSessionToken, normalizeEmail, normalizeMobile, parseCookies, safeEqualHex, sessionCookie, validateRegistration, verifyPassword } from './auth-core.js';
import { smsProvider, validateSmsConfiguration } from './sms/twilio-verify.js';
import { localAuthDb } from './auth-storage.js';
import { canManageTeam, hasCompletedLoginVerification, memberTransition, resolveEffectiveRole } from './rbac-policy.js';
import { authEnvironmentStatus, isAllowedDatabaseUrl, parseDatabaseUrl, postgresPoolConfig } from './database-config.js';

const DEV_FALLBACK_SECRET = 'reachpay_development_auth_secret_key_at_least_32_bytes_long_fallback';

class AuthInputError extends Error {}

function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

const isProduction = () => process.env.NODE_ENV === 'production';
const requiresPostgres = () => isProduction() || process.env.AUTH_REQUIRE_POSTGRES === 'true';

export function authRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value) ? value : randomUUID();
}

let poolPromise;
let migrationPromise;
let poolAvailable = null;

async function autoMigrate(p) {
  if (isProduction()) return;
  let migrationLock;
  try {
    migrationLock = await p.connect();
    await migrationLock.query("SELECT pg_advisory_lock(hashtext('reachpay.schema.auto_migrate'))");
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationFiles = [
      'auth-migration.sql',
      '../database/migrations/004_sms_resend_limits.sql',
      '../database/migrations/005_auth_rate_limit_key_unique.sql',
      '../database/migrations/002_rbac.sql',
      '../database/migrations/003_owner_bootstrap.sql',
      'pos/pos-migration.sql',
      'financial/beneficiary-migration.sql',
      'financial/operations-migration.sql',
      'financial/service-catalog-migration.sql',
      'financial/transfer-controls-migration.sql',
    ];
    for (const rel of migrationFiles) {
      const fullPath = path.join(dirname, rel);
      if (fs.existsSync(fullPath)) {
        try {
          const sql = fs.readFileSync(fullPath, 'utf8');
          if (rel.includes('002_rbac.sql') || rel.includes('003_owner_bootstrap.sql')) {
            const client = await p.connect();
            try {
              await client.query('BEGIN');
              await client.query("SELECT set_config('reachpay.owner_email', $1, true)", [String(process.env.OWNER_EMAIL || '').trim()]);
              await client.query(sql);
              await client.query('COMMIT');
            } catch (error) {
              await client.query('ROLLBACK').catch(() => {});
              throw error;
            } finally { client.release(); }
          } else await p.query(sql);
          console.log(`[ReachPay DB] Schema verified: ${rel}`);
        } catch (mErr) {
          console.warn(JSON.stringify({ level: 'warn', event: 'database.schema_migration_notice', migration: rel, reasonCode: authFailureCategory(mErr) }));
        }
      }
    }
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', event: 'database.auto_migrate_warning', reasonCode: authFailureCategory(err) }));
  } finally {
    if (migrationLock) {
      await migrationLock.query("SELECT pg_advisory_unlock(hashtext('reachpay.schema.auto_migrate'))").catch(() => {});
      migrationLock.release();
    }
  }
}

async function createPool(connectionString) {
  const { Pool } = await import('pg');
  const p = new Pool(postgresPoolConfig(connectionString, {
    production: isProduction(),
    // Keep each warm Vercel function to one client connection; Neon pooling is upstream.
    max: isProduction() ? 1 : 8,
    idleTimeoutMillis: isProduction() ? 10_000 : 30_000,
    connectionTimeoutMillis: 3_000,
  }));
  p.on('error', (err) => {
    logAuthFailure(randomUUID(), err, 'database_pool');
  });
  return p;
}

async function pool() {
  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }
  if (!isPostgresConfigured()) {
    return null;
  }
  if (poolAvailable === false && !requiresPostgres()) {
    return null;
  }
  const databaseTarget = parseDatabaseUrl(process.env.DATABASE_URL);
  if (!databaseTarget) {
    if (requiresPostgres()) throw new Error('DATABASE_URL_INVALID');
    poolAvailable = false;
    return null;
  }
  if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) {
    if (requiresPostgres()) throw new Error('DATABASE_NOT_ALLOWED');
    poolAvailable = false;
    return null;
  }
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        let activeConnString = process.env.DATABASE_URL;
        let p = await createPool(activeConnString);
        try {
          await p.query('SELECT 1');
          poolAvailable = true;
          return p;
        } catch (err) {
          const configuredTarget = parseDatabaseUrl(process.env.DATABASE_URL);
          if (err.code === '3D000' && !requiresPostgres() && configuredTarget?.database === 'reachpay' && !configuredTarget.isNeon) {
            try {
              await p.end().catch(() => {});
              const devUrl = new URL(process.env.DATABASE_URL);
              devUrl.pathname = '/reachpay_dev';
              activeConnString = devUrl.toString();
              p = await createPool(activeConnString);
              await p.query('SELECT 1');
              console.log('[ReachPay DB] Connected to PostgreSQL database "reachpay_dev".');
              poolAvailable = true;
              return p;
            } catch {
              // fallback below
            }
          }
          if (requiresPostgres()) throw err;
          logAuthFailure(randomUUID(), err, 'database_connection');
          poolAvailable = false;
          await p.end().catch(() => {});
          return null;
        }
      } catch (err) {
        if (requiresPostgres()) throw err;
        logAuthFailure(randomUUID(), err, 'database_pool_initialization');
        poolAvailable = false;
        return null;
      }
    })();
  }
  const p = await poolPromise;
  if (!p) return null;
  if (p && !migrationPromise) {
    migrationPromise = autoMigrate(p);
    await migrationPromise;
  }
  return p;
}

function genericError(status = 503) {
  const error = status === 429
    ? 'Too many attempts. Wait a little and try again.'
    : status === 401
      ? 'Authentication required.'
      : status === 403
        ? 'Access forbidden.'
        : 'We could not complete that request. Check your details or try again later.';
  return { status, body: { error } };
}

function authFailureCategory(error) {
  if (error instanceof AuthInputError) return 'INVALID_AUTH_INPUT';
  const errors = [];
  for (let current = error; current && errors.length < 4; current = current.cause) errors.push(current);
  const messages = errors.map((entry) => String(entry?.message || ''));
  const codes = errors.map((entry) => String(entry?.code || ''));
  if (messages.includes('DATABASE_NOT_CONFIGURED')) return 'DATABASE_NOT_CONFIGURED';
  if (messages.includes('DATABASE_URL_INVALID')) return 'DATABASE_URL_INVALID';
  if (messages.includes('DATABASE_NOT_ALLOWED')) return 'DATABASE_NOT_ALLOWED';
  if (messages.includes('DATABASE_MIGRATION_REQUIRED') || codes.some((code) => ['42P01', '42703', '42P10', '42704', '42883'].includes(code))) return 'DATABASE_MIGRATION_REQUIRED';
  if (codes.some((code) => ['28P01', '28000'].includes(code))) return 'DATABASE_CREDENTIALS_REJECTED';
  if (codes.includes('3D000')) return 'DATABASE_NOT_FOUND';
  if (messages.includes('DATABASE_UNAVAILABLE') || codes.some((code) => code.startsWith('08') || ['53300', '53400', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code))) return 'DATABASE_UNAVAILABLE';
  if (messages.includes('DATABASE_QUERY_FAILED') || codes.some((code) => /^[0-9A-Z]{5}$/.test(code))) return 'DATABASE_QUERY_FAILED';
  if (messages.includes('AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED')) return 'AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED';
  if (messages.includes('EMAIL_OTP_NOT_CONFIGURED')) return 'EMAIL_OTP_NOT_CONFIGURED';
  if (messages.includes('SMS_OTP_NOT_CONFIGURED')) return 'SMS_OTP_NOT_CONFIGURED';
  if (messages.includes('EMAIL_DELIVERY_FAILED')) return 'EMAIL_DELIVERY_FAILED';
  if (messages.includes('SMS_DELIVERY_FAILED')) return 'SMS_DELIVERY_FAILED';
  if (error?.reasonCode && ['SMS_NOT_CONFIGURED','SMS_CREDENTIALS_INVALID','SMS_PROVIDER_ERROR','SMS_NUMBER_NOT_ALLOWED','SMS_RATE_LIMITED','INVALID_PHONE'].includes(error.reasonCode)) return error.reasonCode;
  if (messages.includes('SMS_CREDENTIALS_INVALID')) return 'SMS_CREDENTIALS_INVALID';
  if (messages.includes('RATE_LIMIT')) return 'RATE_LIMITED';
  return 'INTERNAL_AUTH_ERROR';
}

function databaseOperationError(error) {
  const reasonCode = authFailureCategory(error);
  const safeReason = ['DATABASE_MIGRATION_REQUIRED', 'DATABASE_UNAVAILABLE', 'DATABASE_CREDENTIALS_REJECTED', 'DATABASE_NOT_FOUND'].includes(reasonCode)
    ? reasonCode
    : 'DATABASE_QUERY_FAILED';
  return new Error(safeReason, { cause: error });
}

export function errorHasMigrationSignal(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    if (['42P01', '42703', '42P10', '42704', '42883'].includes(String(current.code || '')) || current.message === 'DATABASE_MIGRATION_REQUIRED') return true;
  }
  return false;
}

function errorHasDatabaseAvailabilitySignal(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    if (current.message === 'DATABASE_UNAVAILABLE' || String(current.code || '').startsWith('08') || ['28P01', '28000', '3D000', '53300', '53400', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(String(current.code || ''))) return true;
  }
  return false;
}

export function safeAuthErrorResponse(error, requestId) {
  const headers = requestId ? { 'X-Request-Id': requestId } : undefined;
  if (error instanceof AuthInputError) return { status: 400, body: { error: error.message, reasonCode: 'INVALID_AUTH_INPUT' }, ...(headers ? { headers } : {}) };
  if (errorHasMigrationSignal(error)) {
    return { status: 503, body: { error: 'Account service setup is incomplete. Please contact support.', reasonCode: 'DATABASE_MIGRATION_REQUIRED' }, ...(headers ? { headers } : {}) };
  }
  if (['DATABASE_NOT_CONFIGURED', 'DATABASE_URL_INVALID', 'DATABASE_NOT_ALLOWED', 'AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED'].includes(error.message)) {
    return { status: 503, body: { error: 'Account service is temporarily unavailable.', reasonCode: authFailureCategory(error) }, ...(headers ? { headers } : {}) };
  }
  if (String(error.message).includes('RATE_LIMIT')) return { status: 429, body: { error: 'Too many attempts. Wait a little and try again.' }, ...(headers ? { headers } : {}) };
  if (errorHasDatabaseAvailabilitySignal(error)) {
    return { status: 503, body: { error: 'Account service is temporarily unavailable.', reasonCode: authFailureCategory(error) }, ...(headers ? { headers } : {}) };
  }
  return { status: 500, body: { error: 'The account service could not complete the request.', reasonCode: 'INTERNAL_AUTH_ERROR' }, ...(headers ? { headers } : {}) };
}

export function reportAuthFailure(error, requestId, context = 'request') {
  logAuthFailure(requestId, error, context);
  return safeAuthErrorResponse(error, requestId);
}

function logAuthFailure(requestId, error, context = 'request') {
  console.error(JSON.stringify({ level: 'error', event: 'auth.failure', requestId, context, reasonCode: authFailureCategory(error) }));
}

export async function authHealthStatus() {
  const configuration = authEnvironmentStatus();
  let databaseConnected = false;
  let schemaReady = false;
  let ownerAccountVerified = false;
  try {
    const p = await pool();
    if (p) {
      databaseConnected = true;
      const { rows } = await p.query(`SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
        FROM unnest($1::text[]) AS required(name)`, [[
          'customer_accounts', 'customer_sessions', 'email_otp_challenges',
          'phone_otp_challenges', 'auth_rate_limits', 'auth_audit_events',
          'rbac_audit_events',
        ]]);
      schemaReady = rows.length === 7 && rows.every((row) => row.present);
      if (schemaReady && configuration.ownerEmailConfigured) {
        const owner = await p.query(`SELECT EXISTS (
          SELECT 1 FROM customer_accounts
          WHERE lower(btrim(email))=lower(btrim($1)) AND role='owner'
            AND email_verified_at IS NOT NULL AND status='ACTIVE'
        ) AS verified`, [process.env.OWNER_EMAIL]);
        ownerAccountVerified = Boolean(owner.rows[0]?.verified);
      }
    }
  } catch (error) {
    logAuthFailure(randomUUID(), error, 'health_database');
  }
  return {
    configuration,
    databaseConnected,
    schemaReady,
    ownerAccountVerified,
  };
}

export function originOk(req) {
  const origin = req.headers?.origin;
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    const parsedOrigin = new URL(origin);
    if (process.env.NODE_ENV !== 'production') {
      return parsedOrigin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
    }
    const expected = process.env.PUBLIC_SITE_URL;
    if (expected) return parsedOrigin.origin === new URL(expected).origin;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return parsedOrigin.origin === `${proto}://${host}`;
  } catch { return false; }
}

function clientIp(req) {
  const forwarded = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0];
  return String(forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 100);
}

function getRateLimitSecret() {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET || (requiresPostgres() ? '' : DEV_FALLBACK_SECRET);
  if (!secret || secret.length < 32) throw new Error('AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED');
  return secret;
}

function getOtpSecret() {
  return process.env.AUTH_OTP_SECRET || (requiresPostgres() ? '' : DEV_FALLBACK_SECRET);
}

function rateHash(key) {
  const secret = getRateLimitSecret();
  return createHmac('sha256', secret).update(key).digest('hex');
}

export async function rateAllowed(key, maximum = 6, minutes = 15) {
  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }
  const p = await pool();
  if (p) {
    try {
      const { rows } = await p.query(`INSERT INTO auth_rate_limits(key_hash,window_started_at,attempts) VALUES($1,now(),1)
        ON CONFLICT(key_hash) DO UPDATE SET
          window_started_at=CASE WHEN auth_rate_limits.window_started_at < now()-($2 * interval '1 minute') THEN now() ELSE auth_rate_limits.window_started_at END,
          attempts=CASE WHEN auth_rate_limits.window_started_at < now()-($2 * interval '1 minute') THEN 1 ELSE auth_rate_limits.attempts+1 END
        RETURNING attempts`, [rateHash(key), minutes]);
      return Number(rows[0]?.attempts || maximum + 1) <= maximum;
    } catch (err) {
      if (requiresPostgres()) throw err;
      // Fallback to local rate limiting if pg table is missing or fails
    }
  }
  return localAuthDb.checkRateLimit(rateHash(key), maximum, minutes);
}

async function audit(db, userId, event, requestId) {
  if (db && typeof db.query === 'function') {
    try {
      await db.query('INSERT INTO auth_audit_events(user_id,event_type,request_id) VALUES($1,$2,$3)', [userId || null, event, requestId || null]);
      return;
    } catch (error) {
      if (requiresPostgres()) throw databaseOperationError(error);
      // Fallback to local store
    }
  }
  await localAuthDb.recordAuditEvent(userId, event, requestId);
}

async function issueSession(db, userId) {
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  if (db && typeof db.query === 'function') {
    try {
      await db.query("INSERT INTO customer_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [tokenHash, userId]);
    } catch (error) {
      if (requiresPostgres()) throw databaseOperationError(error);
      // Fallback
    }
  }
  if (!requiresPostgres()) {
    try {
      await localAuthDb.createSession(userId, token);
    } catch {
      // Ignore
    }
  }
  return token;
}

export async function currentUser(req) {
  const token = parseCookies(req.headers?.cookie).reachpay_session;
  if (!token) return null;
  const p = await pool();
  if (p) {
    try {
      const { rows } = await p.query(
        `SELECT a.id, a.name, a.email, a.mobile_e164, a.email_verified_at, a.mobile_verified_at, a.status, a.role, a.access_status,
                EXISTS (SELECT 1 FROM customer_accounts other WHERE other.role='owner' AND other.id<>a.id) AS has_conflicting_owner
         FROM customer_sessions s JOIN customer_accounts a ON a.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)]
      );
      if (rows[0]) return resolveEffectiveRole(rows[0], process.env.OWNER_EMAIL, rows[0].has_conflicting_owner);
    } catch (error) {
      if (requiresPostgres()) throw databaseOperationError(error);
      // Fallback
    }
  }

  if (requiresPostgres()) return null;
  let localUser = await localAuthDb.getSessionUser(token);
  if (localUser?.email_verified_at && localUser.status === 'ACTIVE') {
    await localAuthDb.promoteConfiguredOwner(localUser.id);
    localUser = await localAuthDb.getSessionUser(token);
  }
  if (localUser) {
    const store = localAuthDb.getStore();
    const conflict = store.accounts.some((account) => account.role === 'owner' && account.id !== localUser.id);
    return resolveEffectiveRole(localUser, process.env.OWNER_EMAIL, conflict);
  }

  if (p) {
    try {
      const store = localAuthDb.getStore();
      const tokenHash = hashToken(token);
      const session = store.sessions.find((s) => s.token_hash === tokenHash && new Date(s.expires_at) > new Date());
      if (session) {
        const { rows } = await p.query(
          `SELECT id, name, email, mobile_e164, email_verified_at, mobile_verified_at, status, role, access_status,
                  EXISTS (SELECT 1 FROM customer_accounts other WHERE other.role='owner' AND other.id<>customer_accounts.id) AS has_conflicting_owner
           FROM customer_accounts WHERE id = $1`,
          [session.user_id]
        );
        if (rows[0]) return resolveEffectiveRole(rows[0], process.env.OWNER_EMAIL, rows[0].has_conflicting_owner);
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, mobile: user.mobile_e164, emailVerified: Boolean(user.email_verified_at), mobileVerified: Boolean(user.mobile_verified_at), status: user.status, role: user.role || 'limited', accessStatus: user.access_status || 'limited' };
}

async function promoteVerifiedOwner(db, userId) {
  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim();
  if (!ownerEmail) return;
  await db.query("SELECT pg_advisory_xact_lock(hashtext('reachpay.owner.assignment'))");
  await db.query(`UPDATE customer_accounts SET role='owner',access_status='approved',updated_at=now()
    WHERE id=$1 AND lower(btrim(email))=lower(btrim($2)) AND email_verified_at IS NOT NULL AND status='ACTIVE'
    AND (role='owner' OR NOT EXISTS (SELECT 1 FROM customer_accounts WHERE role='owner'))`, [userId, ownerEmail]);
}

async function ownerRequest(req) {
  let user;
  try { user = await currentUser(req); } catch { return { status: 503, body: { error: 'AUTHENTICATION_STORE_UNAVAILABLE' } }; }
  if (!user) return genericError(401);
  if (!canManageTeam(user)) return genericError(403);
  return { user };
}

async function teamRequest(req, action, body, requestId) {
  const auth = await ownerRequest(req);
  if (auth.status) return auth;
  const { user } = auth;
  try { if (!await rateAllowed(`team:${user.id}`, 20, 15)) return genericError(429); }
  catch { return { status: 503, body: { error: 'RATE_LIMIT_STORE_UNAVAILABLE' } }; }
  const p = await pool();
  const id = String(body?.id || '').trim();
  if (action === 'team') {
    if (req.method === 'GET') {
      if (p) {
        const { rows } = await p.query("SELECT id,name,email,role,access_status AS status,created_at FROM customer_accounts WHERE role <> 'owner' AND access_status IN ('pending','approved','revoked') ORDER BY created_at DESC LIMIT 500");
        return { status: 200, body: { members: rows } };
      }
      return { status: 200, body: { members: await localAuthDb.listMembers() } };
    }
    if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < 12 || password.length > 128) return { status: 400, body: { error: 'Password must be 12–128 characters.' } };
    if (!await rateAllowed(`team-add:${user.id}`, 5, 60)) return genericError(429);
    const passwordRecord = await hashPassword(password);
    const name = email.split('@')[0].slice(0, 100) || 'Member';
    let member;
    if (p) {
      const { rows } = await p.query(`INSERT INTO customer_accounts(name,email,mobile_e164,password_hash,password_salt,email_verified_at,status,role,access_status)
        VALUES($1,$2,NULL,$3,$4,now(),'ACTIVE','limited','pending') ON CONFLICT DO NOTHING
        RETURNING id,name,email,role,access_status AS status,created_at`, [name,email,passwordRecord.hash,passwordRecord.salt]);
      member = rows[0];
      if (member) await p.query("INSERT INTO rbac_audit_events(actor_user_id,target_user_id,event_type,request_id) VALUES($1,$2,'MEMBER_ADDED',$3)",[user.id,member.id,requestId]);
    } else {
      member = await localAuthDb.addMember({ name,email,passwordHash:passwordRecord.hash,passwordSalt:passwordRecord.salt });
      if (member) await localAuthDb.recordRbacAudit(user.id,member.id,'MEMBER_ADDED',requestId,email);
    }
    if (!member) return { status: 409, body: { error: 'ACCOUNT_ALREADY_EXISTS' } };
    const safeMember = { id: member.id, name: member.name, email: member.email, role: member.role || 'limited', status: member.status || member.access_status || 'pending', created_at: member.created_at };
    return { status: 201, body: { member: safeMember } };
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { status: 400, body: { error: 'INVALID_MEMBER_ID' } };
  if (action === 'team-approve' || action === 'team-revoke') {
    if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    if (action === 'team-approve' && !await rateAllowed(`team-approve:${user.id}`, 20, 15)) return genericError(429);
    if (p) {
      const transition = memberTransition(action === 'team-approve' ? 'approve' : 'revoke');
      const { role, status } = transition;
      const result = await p.query("UPDATE customer_accounts SET role=$2,access_status=$3,updated_at=now() WHERE id=$1 AND role <> 'owner' AND access_status IN ('pending','approved','revoked') RETURNING id",[id,role,status]);
      if (!result.rowCount) return { status: 404, body: { error: 'MEMBER_NOT_FOUND' } };
      await p.query('DELETE FROM customer_sessions WHERE user_id=$1',[id]);
      await p.query('INSERT INTO rbac_audit_events(actor_user_id,target_user_id,event_type,request_id) VALUES($1,$2,$3,$4)',[user.id,id,action === 'team-approve' ? 'MEMBER_APPROVED' : 'MEMBER_REVOKED',requestId]);
      return { status: 200, body: { ok: true } };
    }
    const transition = memberTransition(action === 'team-approve' ? 'approve' : 'revoke');
    const changed = await localAuthDb.updateMember(id, transition.role, transition.status);
    if (!changed) return { status: 404, body: { error: 'MEMBER_NOT_FOUND' } };
    if (action === 'team-revoke') await localAuthDb.revokeMemberSessions(id);
    await localAuthDb.recordRbacAudit(user.id,id,action === 'team-approve' ? 'MEMBER_APPROVED' : 'MEMBER_REVOKED',requestId,changed.email);
    return { status: 200, body: { ok: true } };
  }
  if (action === 'team-remove') {
    if (req.method !== 'DELETE' && req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    if (p) {
      const removed = await withDb(async (db) => {
        const found = await db.query("SELECT email FROM customer_accounts WHERE id=$1 AND role <> 'owner' AND access_status IN ('pending','approved','revoked') FOR UPDATE", [id]);
        if (!found.rows[0]) return false;
        await db.query("INSERT INTO rbac_audit_events(actor_user_id,target_user_id,target_email,event_type,request_id) VALUES($1,$2,$3,'MEMBER_REMOVED',$4)",[user.id,id,found.rows[0].email,requestId]);
        await db.query("DELETE FROM customer_accounts WHERE id=$1 AND role <> 'owner' AND access_status IN ('pending','approved','revoked')",[id]);
        return true;
      });
      if (!removed) return { status: 404, body: { error: 'MEMBER_NOT_FOUND' } };
    } else {
      const removed = await localAuthDb.removeMember(id);
      if (!removed) return { status: 404, body: { error: 'MEMBER_NOT_FOUND' } };
      await localAuthDb.recordRbacAudit(user.id,id,'MEMBER_REMOVED',requestId,removed.email);
    }
    return { status: 200, body: { ok: true } };
  }
  return { status: 404, body: { error: 'ROUTE_NOT_FOUND' } };
}

async function sendEmailCode(user) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL } = process.env;
  const otpSecret = getOtpSecret();
  const code = newEmailOtp();
  const smtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM_EMAIL);
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL);
  const emailConfigured = Boolean((smtpConfigured || resendConfigured) && otpSecret && otpSecret.length >= 32);
  if (isProduction() && !emailConfigured) throw new Error('EMAIL_OTP_NOT_CONFIGURED');

  const p = await pool();
  if (p) {
    try {
      await withDb(async (db) => {
        await db.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE', [user.id]);
        await db.query("UPDATE email_otp_challenges SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL", [user.id]);
        await db.query("INSERT INTO email_otp_challenges(user_id,code_hmac,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET)]);
      });
    } catch (error) {
      if (isProduction()) throw databaseOperationError(error);
      // Fallback
      await localAuthDb.createEmailChallenge(user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET), code);
    }
  } else {
    await localAuthDb.createEmailChallenge(user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET), code);
  }

  if (smtpConfigured) {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, requireTLS: Number(SMTP_PORT) === 587, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 10_000 });
    try {
      await transport.sendMail({ from: `ReachPay <${SMTP_FROM_EMAIL}>`, to: user.email, subject: 'Your ReachPay verification code', text: `Your ReachPay email verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`, html: `<p>Use this code to verify your ReachPay email:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. ReachPay will never ask you to share it.</p>` });
      return 'sent';
    } catch (err) {
      if (isProduction()) throw new Error('EMAIL_DELIVERY_FAILED', { cause: err });
      return 'sent';
    } finally {
      transport.close();
    }
  }

  if (resendConfigured) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL,
          to: [user.email],
          subject: 'Your ReachPay verification code',
          text: `Your ReachPay verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
          html: `<p>Use this code to verify your ReachPay email:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. ReachPay will never ask you to share it.</p>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('RESEND_REQUEST_REJECTED');
      return 'sent';
    } catch (err) {
      if (isProduction()) throw new Error('EMAIL_DELIVERY_FAILED', { cause: err });
    }
  }

  // Development verification accepts the fixed local-only code without logging challenge values.
  if (isProduction()) throw new Error('EMAIL_OTP_NOT_CONFIGURED');
  return 'sent';
}

async function sendPhoneCode(user) {
  let isTwilioConfigured = false;
  try { validateSmsConfiguration(); isTwilioConfigured = true; }
  catch (error) { if (isProduction()) throw error; }
  const code = '123456';
  if (isProduction() && !isTwilioConfigured) throw new Error('SMS_OTP_NOT_CONFIGURED');

  const p = await pool();
  if (p) {
    try {
      await p.query("INSERT INTO phone_otp_challenges(user_id,provider,phone_e164,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [user.id, isTwilioConfigured ? 'twilio-verify' : 'local-verify', user.mobile_e164]);
    } catch (error) {
      if (isProduction()) throw databaseOperationError(error);
      await localAuthDb.createPhoneChallenge(user.id, user.mobile_e164, code);
    }
  } else {
    await localAuthDb.createPhoneChallenge(user.id, user.mobile_e164, code);
  }

  if (isTwilioConfigured) {
    try {
      await smsProvider.send(user.mobile_e164);
      return 'sent';
    } catch (err) {
      if (isProduction()) throw Object.assign(new Error(err.reasonCode || 'SMS_PROVIDER_ERROR'), { reasonCode: err.reasonCode || 'SMS_PROVIDER_ERROR', cause: err });
    }
  }

  // Development verification accepts the fixed local-only code without logging challenge values.
  if (isProduction()) throw new Error('SMS_OTP_NOT_CONFIGURED');
  return 'sent';
}

async function withDb(work) {
  const p = await pool();
  if (!p) throw new Error('DATABASE_NOT_CONFIGURED');
  const db = await p.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    try { db.release(); } catch { /* ignore */ }
  }
}

async function signup(req, body, requestId) {
  let input;
  try { input = validateRegistration(body); }
  catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) throw new AuthInputError(error.message);
    throw error;
  }
  if (!await rateAllowed(`signup:ip:${clientIp(req)}`, 10, 60) || !await rateAllowed(`signup:email:${input.email}`, 5, 60) || !await rateAllowed(`signup:mobile:${input.mobile}`, 5, 60)) {
    return genericError(429);
  }

  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  if (isProduction()) {
    const environment = authEnvironmentStatus();
    const emailReady = environment.emailOtpConfigured;
    const mobileReady = environment.smsOtpConfigured;
    if (!emailReady || !mobileReady) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'auth.signup_unavailable',
        requestId,
        category: 'verification_delivery_not_configured',
        databaseConfigured: environment.databaseConfigured,
        ownerEmailConfigured: environment.ownerEmailConfigured,
        rateLimitSecretConfigured: environment.rateLimitSecretConfigured,
        otpSecretConfigured: environment.otpSecretConfigured,
        beneficiaryEncryptionConfigured: environment.beneficiaryEncryptionConfigured,
        publicOriginConfigured: environment.publicOriginConfigured,
        emailReady,
        mobileReady,
      }));
      return {
        status: 503,
        body: { error: 'Account creation is temporarily unavailable. Please contact ReachPay support.' },
        headers: { 'X-Request-Id': requestId },
      };
    }
  }

  const password = await hashPassword(input.password);
  let created = null;

  let p = await pool();
  if (p) {
    try {
      created = await withDb(async (db) => {
        const insert = await db.query(`INSERT INTO customer_accounts(name,email,mobile_e164,password_hash,password_salt,verification_messages_consent_at)
          VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING RETURNING id,name,email,mobile_e164,email_verified_at,mobile_verified_at,status`, [input.name, input.email, input.mobile, password.hash, password.salt]);
        if (!insert.rows[0]) return null;
        const user = insert.rows[0];
        const token = await issueSession(db, user.id);
        await audit(db, user.id, 'ACCOUNT_CREATED', requestId);
        await audit(db, user.id, 'VERIFICATION_MESSAGES_CONSENTED', requestId);
        return { user, token };
      });
      if (created?.user && !requiresPostgres()) {
        try {
          const store = localAuthDb.getStore();
          const existing = store.accounts.find((u) => u.id === created.user.id || u.email.toLowerCase() === input.email.toLowerCase() || u.mobile_e164 === input.mobile);
          if (!existing) {
            store.accounts.push({
              id: created.user.id,
              name: input.name,
              email: input.email.toLowerCase(),
              mobile_e164: input.mobile,
              password_hash: password.hash,
              password_salt: password.salt,
              email_verified_at: null,
              mobile_verified_at: null,
              verification_messages_consent_at: new Date().toISOString(),
              status: 'PENDING_VERIFICATION',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch {
          // Ignore sync error
        }
      }
    } catch (err) {
      if (requiresPostgres()) throw err;
      // Fall back to local store
      p = null;
    }
  }

  if (p && !created) {
    return { status: 202, body: { ok: true, message: 'If an account can be created, verification instructions will be sent. If you already registered, sign in.' } };
  }

  if (!created) {
    if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE');
    const existing = await localAuthDb.findUserByEmailOrMobile(input.email, input.mobile);
    if (existing) {
      return { status: 202, body: { ok: true, message: 'If an account can be created, verification instructions will be sent. If you already registered, sign in.' } };
    }
    const user = await localAuthDb.createUser({
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      passwordHash: password.hash,
      passwordSalt: password.salt,
    });
    const token = await localAuthDb.createSession(user.id);
    await audit(null, user.id, 'ACCOUNT_CREATED', requestId);
    await audit(null, user.id, 'VERIFICATION_MESSAGES_CONSENTED', requestId);
    created = { user, token };
  }

  const [email, mobile] = await Promise.allSettled([sendEmailCode(created.user), sendPhoneCode(created.user)]);
  for (const [channel, delivery] of [['email', email], ['mobile', mobile]]) {
    if (delivery.status === 'rejected') logAuthFailure(requestId, delivery.reason, `${channel}_otp_delivery`);
  }

  return {
    status: 201,
    headers: { 'Set-Cookie': sessionCookie(created.token) },
    body: {
      ok: true,
      next: '/auth/verify',
      user: publicUser(created.user),
      delivery: {
        email: email.status === 'fulfilled' ? 'sent' : 'unavailable',
        mobile: mobile.status === 'fulfilled' ? 'sent' : 'unavailable',
      },
      message: isProduction() ? 'Account created. Verify both contact methods to open the dashboard.' : 'Account created. Verify both contact methods to open the dashboard (code 123456 in dev mode).',
    },
  };
}

async function login(req, body, requestId) {
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!identifier || !password || password.length > 128) {
    return { status: 401, body: { error: 'Please enter both your email or mobile number and password.' } };
  }

  // Rate limiting: relaxed in development to prevent lockouts during testing
  const ipMax = isProduction() ? 10 : 500;
  const idMax = isProduction() ? 8 : 500;
  if (!await rateAllowed(`login:ip:${clientIp(req)}`, ipMax, 15) || !await rateAllowed(`login:id:${identifier.toLowerCase()}`, idMax, 15)) {
    return genericError(429);
  }

  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  const isEmail = identifier.includes('@');
  const searchEmail = isEmail ? identifier.toLowerCase().trim() : null;
  const cleanDigits = identifier.replace(/\D/g, '');
  const cleanDigits10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

  let normalizedMobile = null;
  if (!isEmail) {
    try {
      if (identifier.startsWith('+')) {
        normalizedMobile = normalizeMobile(identifier);
      } else if (cleanDigits.length === 10) {
        normalizedMobile = normalizeMobile(identifier, 'IN');
      } else if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
        normalizedMobile = normalizeMobile(`+${cleanDigits}`);
      } else {
        normalizedMobile = normalizeMobile(identifier);
      }
    } catch {
      // If strict phone parsing throws, construct reasonable mobile candidates
      if (cleanDigits.length === 10) {
        normalizedMobile = `+91${cleanDigits}`;
      } else if (cleanDigits.startsWith('91') && cleanDigits.length === 12) {
        normalizedMobile = `+${cleanDigits}`;
      } else if (cleanDigits.length > 0) {
        normalizedMobile = `+${cleanDigits}`;
      }
    }
  }

  let user = null;
  let token = null;

  const p = await pool();
  if (p) {
    try {
      // Resilient SQL query supporting email OR mobile (E.164, 10 digits, +91 prefix)
      const { rows } = await p.query(
        `SELECT id, name, email, mobile_e164, password_hash, password_salt, email_verified_at, mobile_verified_at, status, role, access_status,
                EXISTS (SELECT 1 FROM customer_accounts other WHERE other.role='owner' AND other.id<>customer_accounts.id) AS has_conflicting_owner
         FROM customer_accounts
         WHERE (
           ($1::text IS NOT NULL AND LOWER(email) = LOWER($1))
           OR
           ($2::text IS NOT NULL AND (
             mobile_e164 = $2
             OR ($3::text IS NOT NULL AND (
               mobile_e164 = '+' || $3
               OR mobile_e164 = '+91' || $3
               OR mobile_e164 = $3
               OR REPLACE(REPLACE(mobile_e164, '+', ''), ' ', '') = $3
               OR (LENGTH($3) >= 10 AND RIGHT(REPLACE(mobile_e164, '+', ''), 10) = RIGHT($3, 10))
             ))
           ))
           OR
           ($3::text IS NOT NULL AND LENGTH($3) >= 10 AND (
             RIGHT(REPLACE(mobile_e164, '+', ''), 10) = RIGHT($3, 10)
           ))
         )
         LIMIT 1`,
        [searchEmail, normalizedMobile, cleanDigits10 || null]
      );

      user = rows[0];
      if (user) {
        if (user.status === 'LOCKED' || user.status === 'DISABLED') {
          return { status: 403, body: { error: 'This account has been locked or disabled. Please contact support.' } };
        }
        const passwordMatches = await verifyPassword(password, user.password_salt, user.password_hash);
        if (!passwordMatches) {
          return { status: 401, body: { error: 'Incorrect email/mobile number or password. Please check your credentials.' } };
        }
        if (user.email_verified_at && user.mobile_verified_at) await withDb(async (db) => promoteVerifiedOwner(db, user.id));
        user = resolveEffectiveRole(user, process.env.OWNER_EMAIL, user.has_conflicting_owner);
        token = await withDb(async (db) => {
          const session = await issueSession(db, user.id);
          await audit(db, user.id, 'LOGIN_SUCCEEDED', requestId);
          return session;
        });
      }
    } catch (err) {
      if (requiresPostgres()) throw err;
      user = null;
    }
  }

  if (!user) {
    user = await localAuthDb.findUserByEmailOrMobile(searchEmail, normalizedMobile, cleanDigits10);
    if (!user) {
      return { status: 401, body: { error: 'Incorrect email/mobile number or password. Please check your credentials.' } };
    }
    if (user.status === 'LOCKED' || user.status === 'DISABLED') {
      return { status: 403, body: { error: 'This account has been locked or disabled. Please contact support.' } };
    }
    const passwordMatches = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!passwordMatches) {
      return { status: 401, body: { error: 'Incorrect email/mobile number or password. Please check your credentials.' } };
    }
    if (user.email_verified_at && user.mobile_verified_at) await localAuthDb.promoteConfiguredOwner(user.id);
    const store = localAuthDb.getStore();
    const conflict = store.accounts.some((account) => account.role === 'owner' && account.id !== user.id);
    user = resolveEffectiveRole(user, process.env.OWNER_EMAIL, conflict);
    token = await localAuthDb.createSession(user.id);
    await audit(null, user.id, 'LOGIN_SUCCEEDED', requestId);
  }

  const complete = hasCompletedLoginVerification(user);
  return {
    status: 200,
    headers: { 'Set-Cookie': sessionCookie(token) },
    body: {
      ok: true,
      next: complete ? '/dashboard' : '/auth/verify',
      user: publicUser(user),
      message: complete ? 'Signed in.' : 'Verify your email and mobile number to unlock the dashboard.',
    },
  };
}

async function verifyEmail(req, body, requestId) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  if (user.email_verified_at) return { status: 200, body: { ok: true, user: publicUser(user) } };

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) return { status: 400, body: { error: 'Enter the six-digit code from your email.' } };
  if (!await rateAllowed(`email-verify:${user.id}`, 8, 15)) return genericError(429);

  const secret = getOtpSecret();

  let outcome = false;
  const p = await pool();
  if (p) {
    try {
      outcome = await withDb(async (db) => {
        if (!isProduction() && code === '123456') {
          await db.query("UPDATE customer_accounts SET email_verified_at=now(),status=CASE WHEN status='PENDING_VERIFICATION' AND mobile_verified_at IS NOT NULL THEN 'ACTIVE' ELSE status END,updated_at=now() WHERE id=$1", [user.id]);
          await promoteVerifiedOwner(db, user.id);
          await audit(db, user.id, 'EMAIL_VERIFIED', requestId);
          return true;
        }
        const found = await db.query("SELECT id,code_hmac,attempts FROM email_otp_challenges WHERE user_id=$1 AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [user.id]);
        const challenge = found.rows[0];
        if (!challenge || Number(challenge.attempts) >= 5) return false;
        if (!safeEqualHex(hashOtp(code, secret), challenge.code_hmac)) {
          await db.query('UPDATE email_otp_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
          return false;
        }
        await db.query('UPDATE email_otp_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
        await db.query("UPDATE customer_accounts SET email_verified_at=now(),status=CASE WHEN status='PENDING_VERIFICATION' AND mobile_verified_at IS NOT NULL THEN 'ACTIVE' ELSE status END,updated_at=now() WHERE id=$1", [user.id]);
        await promoteVerifiedOwner(db, user.id);
        await audit(db, user.id, 'EMAIL_VERIFIED', requestId);
        return true;
      });
    } catch (error) {
      if (requiresPostgres()) throw databaseOperationError(error);
      // Fallback
      outcome = false;
    }
  }

  if (!outcome && !isProduction()) {
    outcome = await localAuthDb.verifyEmailChallenge(user.id, code, secret, !isProduction());
    if (outcome) {
      await audit(null, user.id, 'EMAIL_VERIFIED', requestId);
    }
  }

  if (outcome && !isProduction()) {
    await localAuthDb.updateUser(user.id, {
      email_verified_at: new Date().toISOString(),
      status: user.mobile_verified_at ? 'ACTIVE' : user.status,
    });
    await localAuthDb.promoteConfiguredOwner(user.id);
  }

  if (!outcome) return { status: 400, body: { error: 'That code is invalid or expired. Request a new code and try again.' } };
  const refreshed = await currentUser(req);
  return { status: 200, body: { ok: true, user: publicUser(refreshed) } };
}

async function verifyMobile(req, body, requestId) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  if (user.mobile_verified_at) return { status: 200, body: { ok: true, user: publicUser(user) } };

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!/^\d{4,10}$/.test(code)) return { status: 400, body: { error: 'Enter the verification code from your SMS.' } };
  if (!await rateAllowed(`mobile-verify:${user.id}`, 6, 15)) return genericError(429);

  let approved = !isProduction() && code === '123456';
  const isTwilioConfigured = Boolean(process.env.SMS_PROVIDER === 'twilio-verify' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);

  if (!approved && isTwilioConfigured) {
    try {
      approved = await smsProvider.verify(user.mobile_e164, code);
    } catch (error) {
      if (error.reasonCode) return { status: error.reasonCode === 'SMS_RATE_LIMITED' ? 429 : 503, body: { error: error.reasonCode, reasonCode: error.reasonCode } };
      approved = false;
    }
  }

  if (!approved && !isProduction()) {
    approved = await localAuthDb.verifyPhoneChallenge(user.id, code, true);
  }

  if (!approved) return { status: 400, body: { error: 'That mobile code is invalid or expired.' } };

  const p = await pool();
  if (p) {
    try {
      await withDb(async (db) => {
        await db.query("UPDATE customer_accounts SET mobile_verified_at=now(),status=CASE WHEN status='PENDING_VERIFICATION' AND email_verified_at IS NOT NULL THEN 'ACTIVE' ELSE status END,updated_at=now() WHERE id=$1", [user.id]);
        await promoteVerifiedOwner(db, user.id);
        await db.query("UPDATE phone_otp_challenges SET approved_at=now() WHERE user_id=$1 AND approved_at IS NULL", [user.id]);
        await audit(db, user.id, 'MOBILE_VERIFIED', requestId);
      });
    } catch (error) {
      if (requiresPostgres()) throw databaseOperationError(error);
      // Fallback
    }
  }

  if (!isProduction()) {
    await localAuthDb.updateUser(user.id, {
      mobile_verified_at: new Date().toISOString(),
      status: user.email_verified_at ? 'ACTIVE' : user.status,
    });
    await localAuthDb.promoteConfiguredOwner(user.id);
    await audit(null, user.id, 'MOBILE_VERIFIED', requestId);
  }

  const refreshed = await currentUser(req);
  return { status: 200, body: { ok: true, user: publicUser(refreshed) } };
}

async function resend(req, body, requestId) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  const channel = body?.channel;
  if (!['email', 'mobile'].includes(channel)) return { status: 400, body: { error: 'Choose email or mobile verification.' } };
  if ((channel === 'email' && user.email_verified_at) || (channel === 'mobile' && user.mobile_verified_at)) return { status: 409, body: { error: 'This contact method is already verified.' } };
  if (!await rateAllowed(`resend-once:${channel}:${user.id}`, 2, 1)) return genericError(429);
  if (!await rateAllowed(`resend:${channel}:${user.id}`, 5, 15)) return genericError(429);
  if (channel === 'mobile' && (!await rateAllowed(`sms-resend:account:${user.id}`, 5, 1440) || !await rateAllowed(`sms-resend:ip:${clientIp(req)}`, 20, 1440))) return { status: 429, body: { error: 'Please wait before requesting another mobile code.', reasonCode: 'SMS_RATE_LIMITED' } };
  try {
    const delivery = channel === 'email' ? await sendEmailCode(user) : await sendPhoneCode(user);
    return { status: 202, body: { ok: true, delivery, message: 'A new verification code was sent.' } };
  } catch (error) {
    logAuthFailure(requestId, error, `${channel}_otp_delivery`);
    const reasonCode = error.reasonCode || 'SMS_PROVIDER_ERROR';
    return { status: reasonCode === 'SMS_RATE_LIMITED' ? 429 : 503, body: { error: reasonCode === 'SMS_RATE_LIMITED' ? 'Please wait before requesting another code.' : 'We could not send a code right now. Please try again later.', reasonCode } };
  }
}

async function me(req) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  return {
    status: 200,
    body: {
      user: publicUser(user),
      dashboardAllowed: hasCompletedLoginVerification(user),
    },
  };
}

async function logout(req) {
  const token = parseCookies(req.headers?.cookie).reachpay_session;
  if (token) {
    if (requiresPostgres() || isPostgresConfigured()) {
      try {
        const p = await pool();
        if (p) await p.query('DELETE FROM customer_sessions WHERE token_hash=$1', [hashToken(token)]);
      } catch (error) {
        if (requiresPostgres()) throw databaseOperationError(error);
      }
    }
    await localAuthDb.deleteSession(token);
  }
  return { status: 200, headers: { 'Set-Cookie': clearSessionCookie() }, body: { ok: true } };
}

function canonicalAction(raw) {
  const norm = String(raw || '').toLowerCase().trim().replace(/[-_]/g, '');
  if (['signup', 'register', 'createaccount'].includes(norm)) return 'signup';
  if (['login', 'signin', 'authenticate', 'auth'].includes(norm)) return 'login';
  if (['logout', 'signout'].includes(norm)) return 'logout';
  if (['me', 'user', 'session', 'currentuser', 'profile', 'whoami', ''].includes(norm)) return 'me';
  if (['verifyemail', 'emailverify', 'confirmemail'].includes(norm)) return 'verify-email';
  if (['verifymobile', 'verifyphone', 'phoneverify', 'mobileverify', 'confirmmobile'].includes(norm)) return 'verify-mobile';
  if (['resend', 'resendcode', 'resendotp'].includes(norm)) return 'resend';
  return String(raw || '').toLowerCase().trim();
}

export async function handleAuth(req, action, body = {}) {
  const requestId = authRequestId(req.headers?.['x-request-id']);
  const act = canonicalAction(action);
  const method = req.method ? req.method.toUpperCase() : 'GET';

  if (!(method === 'GET' && ['me', 'team'].includes(act)) && !originOk(req)) {
    return { status: 403, body: { error: 'Request origin could not be verified.' } };
  }
  const readActions = new Set(['me', 'signup', 'login', 'verify-email', 'verify-mobile', 'resend']);
  const knownActions = new Set([...readActions, 'logout']);
  if (knownActions.has(act) && (readActions.has(act) ? !['GET', 'POST'].includes(method) : method !== 'POST')) {
    return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' }, headers: { Allow: readActions.has(act) ? 'GET, POST' : 'POST' } };
  }
  try {
    let result;
    if (act === 'me') {
      result = await me(req);
    } else if (act === 'signup') {
      if (method === 'GET') {
        result = { status: 200, body: { ok: true, route: 'signup', message: 'Send a POST request with name, email, mobile, password, and verificationConsent.' } };
      } else {
        result = await signup(req, body, requestId);
      }
    } else if (act === 'login') {
      if (method === 'GET') {
        result = { status: 200, body: { ok: true, route: 'login', message: 'Send a POST request with identifier (email or mobile) and password.' } };
      } else {
        result = await login(req, body, requestId);
      }
    } else if (act === 'verify-email') {
      if (method === 'GET') {
        result = { status: 200, body: { ok: true, route: 'verify-email', message: 'Send a POST request with { code } to verify email.' } };
      } else {
        result = await verifyEmail(req, body, requestId);
      }
    } else if (act === 'verify-mobile') {
      if (method === 'GET') {
        result = { status: 200, body: { ok: true, route: 'verify-mobile', message: 'Send a POST request with { code } to verify mobile.' } };
      } else {
        result = await verifyMobile(req, body, requestId);
      }
    } else if (act === 'resend') {
      if (method === 'GET') {
        result = { status: 200, body: { ok: true, route: 'resend', message: 'Send a POST request with { channel: "email" | "mobile" } to resend code.' } };
      } else {
        result = await resend(req, body, requestId);
      }
    } else if (act === 'logout') {
      result = await logout(req);
    } else if (['team','team-approve','team-revoke','team-remove'].includes(act)) {
      result = await teamRequest(req, act, body, requestId);
    } else {
      result = { status: 404, body: { error: `Authentication route "${action}" not found.` } };
    }
    result.headers = { 'X-Request-Id': requestId, ...(result.headers || {}) };
    return result;
  } catch (error) {
    return reportAuthFailure(error, requestId);
  }
}
