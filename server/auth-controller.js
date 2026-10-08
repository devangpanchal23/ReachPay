import process from 'node:process';
import { randomUUID, createHmac } from 'node:crypto';
import { clearSessionCookie, hashOtp, hashPassword, hashToken, newEmailOtp, newSessionToken, normalizeMobile, parseCookies, safeEqualHex, sessionCookie, validateRegistration, verifyPassword } from './auth-core.js';
import { checkPhoneOtp, sendPhoneOtp } from './sms/twilio-verify.js';
import { localAuthDb } from './auth-storage.js';

const DEV_FALLBACK_SECRET = 'reachpay_development_auth_secret_key_at_least_32_bytes_long_fallback';

function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

const isProduction = () => process.env.NODE_ENV === 'production';
const requiresPostgres = () => isProduction() || process.env.AUTH_REQUIRE_POSTGRES === 'true';

let poolPromise;
let migrationPromise;

async function autoMigrate(p) {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const authSqlPath = path.join(dirname, 'auth-migration.sql');
    if (fs.existsSync(authSqlPath)) {
      const sql = fs.readFileSync(authSqlPath, 'utf8');
      await p.query(sql);
      console.log('[ReachPay DB] PostgreSQL customer authentication schema verified and ready.');
    }
  } catch (err) {
    console.warn('[ReachPay DB] Auto-migrate check warning:', err.message);
  }
}

async function pool() {
  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }
  if (!isPostgresConfigured()) {
    return null;
  }
  if (!poolPromise) {
    poolPromise = import('pg').then(({ Pool }) => {
      const p = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
        max: 8,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
      p.on('error', (err) => {
        console.error('[ReachPay DB Pool error]:', err.message);
      });
      return p;
    }).catch((err) => {
      console.warn('[ReachPay DB] Could not initialize PostgreSQL Pool:', err.message);
      return null;
    });
  }
  const p = await poolPromise;
  if (p && !migrationPromise) {
    migrationPromise = autoMigrate(p);
    await migrationPromise;
  }
  return p;
}

function genericError(status = 503) {
  return { status, body: { error: status === 429 ? 'Too many attempts. Wait a little and try again.' : 'We could not complete that request. Check your details or try again later.' } };
}

function authFailureCategory(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (message === 'DATABASE_NOT_CONFIGURED') return 'database_not_configured';
  if (message === 'AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED') return 'rate_limit_secret_not_configured';
  if (code === '28P01' || code === '28000') return 'database_credentials_rejected';
  if (code === '3D000') return 'database_not_found';
  if (code === '42P01' || code === '42703') return 'database_migration_required';
  if (code.startsWith('08') || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'database_unavailable';
  if (message === 'EMAIL_OTP_NOT_CONFIGURED') return 'email_otp_not_configured';
  if (message === 'EMAIL_DELIVERY_FAILED') return 'email_delivery_failed';
  return 'unexpected_auth_failure';
}

function logAuthFailure(requestId, error, context = 'request') {
  console.error(JSON.stringify({ level: 'error', event: 'auth.failure', requestId, context, category: authFailureCategory(error), code: error?.code || undefined }));
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
      if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
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
      if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
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
        `SELECT a.id, a.name, a.email, a.mobile_e164, a.email_verified_at, a.mobile_verified_at, a.status
         FROM customer_sessions s JOIN customer_accounts a ON a.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)]
      );
      if (rows[0]) return rows[0];
    } catch (error) {
      if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
      // Fallback
    }
  }

  if (requiresPostgres()) return null;
  const localUser = await localAuthDb.getSessionUser(token);
  if (localUser) return localUser;

  if (p) {
    try {
      const store = localAuthDb.getStore();
      const tokenHash = hashToken(token);
      const session = store.sessions.find((s) => s.token_hash === tokenHash && new Date(s.expires_at) > new Date());
      if (session) {
        const { rows } = await p.query(
          `SELECT id, name, email, mobile_e164, email_verified_at, mobile_verified_at, status
           FROM customer_accounts WHERE id = $1`,
          [session.user_id]
        );
        if (rows[0]) return rows[0];
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, mobile: user.mobile_e164, emailVerified: Boolean(user.email_verified_at), mobileVerified: Boolean(user.mobile_verified_at), status: user.status };
}

async function sendEmailCode(user) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL } = process.env;
  const otpSecret = getOtpSecret();
  const code = newEmailOtp();
  const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM_EMAIL && otpSecret && otpSecret.length >= 32);
  if (isProduction() && !isSmtpConfigured) throw new Error('EMAIL_OTP_NOT_CONFIGURED');

  const p = await pool();
  if (p) {
    try {
      await withDb(async (db) => {
        await db.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE', [user.id]);
        await db.query("UPDATE email_otp_challenges SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL", [user.id]);
        await db.query("INSERT INTO email_otp_challenges(user_id,code_hmac,expires_at) VALUES($1,$2,now()+interval '10 minutes')", [user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET)]);
      });
    } catch {
      if (isProduction()) throw new Error('DATABASE_UNAVAILABLE');
      // Fallback
      await localAuthDb.createEmailChallenge(user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET), code);
    }
  } else {
    await localAuthDb.createEmailChallenge(user.id, hashOtp(code, otpSecret || DEV_FALLBACK_SECRET), code);
  }

  if (isSmtpConfigured) {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, requireTLS: Number(SMTP_PORT) === 587, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 10_000 });
    try {
      await transport.sendMail({ from: `ReachPay <${SMTP_FROM_EMAIL}>`, to: user.email, subject: 'Your ReachPay verification code', text: `Your ReachPay email verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`, html: `<p>Use this code to verify your ReachPay email:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. ReachPay will never ask you to share it.</p>` });
      return 'sent';
    } catch (err) {
      console.error('[auth] Email SMTP delivery failed:', err.message);
      // In dev mode, don't block user
      if (process.env.NODE_ENV === 'production') throw new Error('EMAIL_DELIVERY_FAILED', { cause: err });
    } finally {
      transport.close();
    }
  }

  // Development / unconfigured SMTP logging
  if (isProduction()) throw new Error('EMAIL_OTP_NOT_CONFIGURED');
  console.log(`\n======================================================\n[ReachPay Auth] 📩 Verification code for ${user.email}: ${code} (or use dev code: 123456)\n======================================================\n`);
  return 'sent';
}

async function sendPhoneCode(user) {
  const isTwilioConfigured = Boolean(process.env.SMS_PROVIDER === 'twilio-verify' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
  const code = '123456';
  if (isProduction() && !isTwilioConfigured) throw new Error('SMS_OTP_NOT_CONFIGURED');

  const p = await pool();
  if (p) {
    try {
      await p.query("INSERT INTO phone_otp_challenges(user_id,provider,phone_e164,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [user.id, isTwilioConfigured ? 'twilio-verify' : 'local-verify', user.mobile_e164]);
    } catch {
      if (isProduction()) throw new Error('DATABASE_UNAVAILABLE');
      await localAuthDb.createPhoneChallenge(user.id, user.mobile_e164, code);
    }
  } else {
    await localAuthDb.createPhoneChallenge(user.id, user.mobile_e164, code);
  }

  if (isTwilioConfigured) {
    try {
      await sendPhoneOtp(user.mobile_e164);
      return 'sent';
    } catch (err) {
      console.error('[auth] Twilio SMS delivery failed:', err.message);
      if (process.env.NODE_ENV === 'production') throw err;
    }
  }

  // Development / unconfigured SMS logging
  if (isProduction()) throw new Error('SMS_OTP_NOT_CONFIGURED');
  console.log(`\n======================================================\n[ReachPay Auth] 📱 SMS verification code for ${user.mobile_e164}: ${code} (or use dev code: 123456)\n======================================================\n`);
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
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function signup(req, body, requestId) {
  const input = validateRegistration(body);
  if (!await rateAllowed(`signup:ip:${clientIp(req)}`, 10, 60) || !await rateAllowed(`signup:email:${input.email}`, 5, 60) || !await rateAllowed(`signup:mobile:${input.mobile}`, 5, 60)) {
    return genericError(429);
  }

  if (requiresPostgres() && !isPostgresConfigured()) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  if (isProduction()) {
    const emailReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM_EMAIL && process.env.AUTH_OTP_SECRET?.length >= 32);
    const mobileReady = Boolean(process.env.SMS_PROVIDER === 'twilio-verify' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
    if (!emailReady || !mobileReady) return genericError(503);
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

  if (!p || !created) {
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
        `SELECT id, name, email, mobile_e164, password_hash, password_salt, email_verified_at, mobile_verified_at, status
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
    token = await localAuthDb.createSession(user.id);
    await audit(null, user.id, 'LOGIN_SUCCEEDED', requestId);
  }

  const complete = Boolean(user.email_verified_at && user.mobile_verified_at);
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
        await audit(db, user.id, 'EMAIL_VERIFIED', requestId);
        return true;
      });
    } catch (error) {
      if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
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
      approved = await checkPhoneOtp(user.mobile_e164, code);
    } catch {
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
        await db.query("UPDATE phone_otp_challenges SET approved_at=now() WHERE user_id=$1 AND approved_at IS NULL", [user.id]);
        await audit(db, user.id, 'MOBILE_VERIFIED', requestId);
      });
    } catch (error) {
      if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
      // Fallback
    }
  }

  if (!isProduction()) {
    await localAuthDb.updateUser(user.id, {
      mobile_verified_at: new Date().toISOString(),
      status: user.email_verified_at ? 'ACTIVE' : user.status,
    });
    await audit(null, user.id, 'MOBILE_VERIFIED', requestId);
  }

  const refreshed = await currentUser(req);
  return { status: 200, body: { ok: true, user: publicUser(refreshed) } };
}

async function resend(req, body) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  const channel = body?.channel;
  if (!['email', 'mobile'].includes(channel)) return { status: 400, body: { error: 'Choose email or mobile verification.' } };
  if ((channel === 'email' && user.email_verified_at) || (channel === 'mobile' && user.mobile_verified_at)) return { status: 409, body: { error: 'This contact method is already verified.' } };
  if (!await rateAllowed(`resend-once:${channel}:${user.id}`, 2, 1)) return genericError(429);
  if (!await rateAllowed(`resend:${channel}:${user.id}`, 5, 15)) return genericError(429);
  try {
    const delivery = channel === 'email' ? await sendEmailCode(user) : await sendPhoneCode(user);
    return { status: 202, body: { ok: true, delivery, message: 'A new verification code was sent (use 123456 in dev mode).' } };
  } catch {
    return genericError(503);
  }
}

async function me(req) {
  const user = await currentUser(req);
  if (!user) return genericError(401);
  return {
    status: 200,
    body: {
      user: publicUser(user),
      dashboardAllowed: Boolean(user.email_verified_at && user.mobile_verified_at && user.status === 'ACTIVE'),
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
        if (requiresPostgres()) throw new Error('DATABASE_UNAVAILABLE', { cause: error });
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
  const requestId = req.headers?.['x-request-id'] || randomUUID();
  const act = canonicalAction(action);
  const method = req.method ? req.method.toUpperCase() : 'GET';

  if (!(method === 'GET' && act === 'me') && !originOk(req)) {
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
        result = await resend(req, body);
      }
    } else if (act === 'logout') {
      result = await logout(req);
    } else {
      result = { status: 404, body: { error: `Authentication route "${action}" not found.` } };
    }
    result.headers = { 'X-Request-Id': requestId, ...(result.headers || {}) };
    return result;
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) return { status: 400, body: { error: error.message } };
    logAuthFailure(requestId, error);
    if (['DATABASE_NOT_CONFIGURED', 'AUTH_RATE_LIMIT_SECRET_NOT_CONFIGURED'].includes(error.message)) {
      return { status: 503, body: { error: 'Account setup is incomplete. Please contact the administrator.' }, headers: { 'X-Request-Id': requestId } };
    }
    if (String(error.message).includes('RATE_LIMIT')) return genericError(429);
    return { ...genericError(503), headers: { 'X-Request-Id': requestId } };
  }
}
