import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mock } from 'node:test';
import { hashOtp, hashPassword, normalizeEmail, normalizeMobile, parseCookies, safeEqualHex, sessionCookie, validateRegistration, verifyPassword } from '../server/auth-core.js';
import { authRequestId, errorHasMigrationSignal, handleAuth, rateAllowed, reportAuthFailure, safeAuthErrorResponse, tryPromoteVerifiedOwner } from '../server/auth-controller.js';
import { validateSmsConfiguration } from '../server/sms/twilio-verify.js';
import unavailableFinancialApi from '../api/[...path].js';
import { cleanNationalInput, emailError, maxNationalDigits, nameError, passwordError, PHONE_COUNTRIES, phoneError } from '../shared/phone-validation.js';

test('Twilio Verify credentials require an AC account SID and reject API key SIDs', () => {
  const valid = { SMS_PROVIDER: 'twilio-verify', TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'private-value', TWILIO_VERIFY_SERVICE_SID: `VA${'b'.repeat(32)}` };
  assert.equal(validateSmsConfiguration(valid).accountSid, valid.TWILIO_ACCOUNT_SID);
  assert.throws(() => validateSmsConfiguration({ ...valid, TWILIO_ACCOUNT_SID: `SK${'a'.repeat(32)}` }), { reasonCode: 'SMS_CREDENTIALS_INVALID' });
  assert.throws(() => validateSmsConfiguration({ ...valid, TWILIO_ACCOUNT_SID: 'not-an-account-sid' }), { reasonCode: 'SMS_CREDENTIALS_INVALID' });
});

test('auth request ids are bounded and reject log injection', () => {
  assert.equal(authRequestId('vercel-trace-123'), 'vercel-trace-123');
  assert.match(authRequestId('bad-id\nreasonCode=FAKE'), /^[0-9a-f-]{36}$/);
  assert.match(authRequestId('x'.repeat(101)), /^[0-9a-f-]{36}$/);
});

test('normalizes email and phone inputs', () => {
  assert.equal(normalizeEmail('  Person@Example.com '), 'person@example.com');
  assert.equal(normalizeMobile('98765 43210'), '+919876543210');
  assert.equal(normalizeMobile('+14155552671'), '+14155552671');
  assert.throws(() => normalizeMobile('123'));
  assert.throws(() => normalizeMobile('98765432101'));
  assert.throws(() => normalizeMobile('98765abc10'));
  assert.equal(normalizeMobile('4155552671', 'US'), '+14155552671');
  assert.equal(maxNationalDigits('IN'), 10);
  assert.equal(cleanNationalInput('+91 98765 43210', 'IN'), '9876543210');
  assert.equal(cleanNationalInput('987654321099', 'IN'), '9876543210');
  assert.equal(cleanNationalInput('+1 (415) 555-2671', 'US'), '4155552671');
  assert.equal(phoneError('9876543210', 'IN'), '');
  assert.notEqual(phoneError('98765432101', 'IN'), '');
  assert.ok(PHONE_COUNTRIES.length > 200);
});

test('signup field validators enforce lengths and required formats', () => {
  assert.equal(emailError('person@example.com'), '');
  assert.notEqual(emailError('not-an-email'), '');
  assert.equal(nameError('Person Example'), '');
  assert.notEqual(nameError('x'.repeat(101)), '');
  assert.equal(passwordError('correct-horse-battery'), '');
  assert.notEqual(passwordError('short'), '');
});

test('registration requires the four requested fields and explicit OTP consent', () => {
  assert.deepEqual(validateRegistration({ name: 'Example User', email: 'USER@example.com', mobile: '9876543210', password: 'a-long-password-1', verificationConsent: true }), {
    name: 'Example User', email: 'user@example.com', mobile: '+919876543210', password: 'a-long-password-1'
  });
  assert.throws(() => validateRegistration({ name: 'A', email: 'user@example.com', mobile: '9876543210', password: 'short' }));
  assert.throws(() => validateRegistration({ name: 'Example User', email: 'user@example.com', mobile: '9876543210', password: 'a-long-password-1' }));
});

test('passwords are salted, stored as derived hashes and verified in constant time', async () => {
  const password = await hashPassword('a-long-password-1');
  assert.notEqual(password.hash, 'a-long-password-1');
  assert.equal(await verifyPassword('a-long-password-1', password.salt, password.hash), true);
  assert.equal(await verifyPassword('another-long-password', password.salt, password.hash), false);
});

test('email OTP code is HMACed before storage and cookies are HTTP-only', () => {
  const digest = hashOtp('123456', 'a-test-secret-that-is-long-enough');
  assert.notEqual(digest, '123456');
  assert.equal(safeEqualHex(digest, hashOtp('123456', 'a-test-secret-that-is-long-enough')), true);
  assert.equal(safeEqualHex(digest, hashOtp('654321', 'a-test-secret-that-is-long-enough')), false);
  const cookie = sessionCookie('test-token', true);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
  assert.equal(parseCookies(`a=b; reachpay_session=${encodeURIComponent('test-token')}`).reachpay_session, 'test-token');
  assert.equal(parseCookies('reachpay_session=%E0%A4%A').reachpay_session, '');
});

test('auth mutations fail closed when PostgreSQL is explicitly required and not configured', async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousOrigin = process.env.PUBLIC_SITE_URL;
  const previousReq = process.env.AUTH_REQUIRE_POSTGRES;
  process.env.AUTH_REQUIRE_POSTGRES = 'true';
  delete process.env.DATABASE_URL;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';
  try {
    const result = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'signup', {
      name: 'Example User', email: 'example@example.com', mobile: '9876543210', password: 'a-long-password-1', verificationConsent: true
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'Account service is temporarily unavailable.');
    assert.equal(result.headers['X-Request-Id'].length > 0, true);
  } finally {
    if (previousReq === undefined) delete process.env.AUTH_REQUIRE_POSTGRES; else process.env.AUTH_REQUIRE_POSTGRES = previousReq;
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previousOrigin;
  }
});

test('production Vercel login and logout do not create or use the local auth filesystem store', async () => {
  const keys = ['NODE_ENV', 'VERCEL', 'DATABASE_URL', 'AUTH_REQUIRE_POSTGRES', 'AUTH_RATE_LIMIT_SECRET'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const mkdirSync = mock.method(fs, 'mkdirSync');
  process.env.NODE_ENV = 'production';
  process.env.VERCEL = '1';
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_REQUIRE_POSTGRES;
  delete process.env.AUTH_RATE_LIMIT_SECRET;
  try {
    const headers = { origin: 'http://localhost:5173', host: 'localhost:5173' };
    const login = await handleAuth({ method: 'POST', headers }, 'login', { identifier: 'person@example.test', password: 'test-password' });
    assert.equal(login.status, 500);
    assert.deepEqual(login.body, { error: 'The account service could not complete the request.', reasonCode: 'INTERNAL_AUTH_ERROR' });
    const logout = await handleAuth({ method: 'POST', headers: { ...headers, cookie: 'reachpay_session=fake-session-token' } }, 'logout', {});
    assert.equal(logout.status, 500);
    assert.deepEqual(logout.body, { error: 'The account service could not complete the request.', reasonCode: 'INTERNAL_AUTH_ERROR' });
    assert.equal(mkdirSync.mock.callCount(), 0);
  } finally {
    mkdirSync.mock.restore();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('wrapped PostgreSQL missing table and column failures are identified as migration errors', () => {
  assert.equal(errorHasMigrationSignal(Object.assign(new Error('missing relation'), { code: '42P01' })), true);
  assert.equal(errorHasMigrationSignal(new Error('DATABASE_UNAVAILABLE', { cause: Object.assign(new Error('missing column'), { code: '42703' }) })), true);
  assert.equal(errorHasMigrationSignal(Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' })), false);
  const response = safeAuthErrorResponse(new Error('DATABASE_UNAVAILABLE', { cause: Object.assign(new Error('missing relation'), { code: '42P01' }) }), 'migration-test');
  assert.equal(response.status, 503);
  assert.equal(response.body.reasonCode, 'DATABASE_MIGRATION_REQUIRED');
  assert.equal(response.headers['X-Request-Id'], 'migration-test');
  assert.doesNotMatch(JSON.stringify(response), /missing relation|42P01/);
  const conflictTarget = safeAuthErrorResponse(Object.assign(new Error('no unique or exclusion constraint matching the ON CONFLICT specification'), { code: '42P10' }), 'constraint-test');
  assert.equal(conflictTarget.status, 503);
  assert.equal(conflictTarget.body.reasonCode, 'DATABASE_MIGRATION_REQUIRED');
  for (const code of ['42501', '40001', '40P01']) {
    const unavailable = safeAuthErrorResponse(Object.assign(new Error('private database detail'), { code }), 'sqlstate-test');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.reasonCode, 'DATABASE_UNAVAILABLE');
  }
});

test('unexpected database failures return safe 500 and log the step and SQLSTATE without secrets', () => {
  const oldError = console.error;
  const entries = [];
  console.error = (...args) => entries.push(args);
  try {
    const raw = Object.assign(new Error('private database detail token=fake-session-token otp=654321 cookie=fake-cookie'), { code: '23505', detail: 'private constraint data' });
    raw.authStep = 'login.session_insert';
    const result = reportAuthFailure(raw, 'unexpected-db-test', 'test_auth_route');
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: 'The account service could not complete the request.', reasonCode: 'INTERNAL_AUTH_ERROR' });
    assert.equal(entries.length, 2);
    const authFailure = entries.find(([event]) => typeof event === 'string' && event.startsWith('{'));
    const authInternal = entries.find(([event]) => event === 'auth.internal');
    assert.ok(authFailure);
    assert.ok(authInternal);
    const authFailureFields = JSON.parse(authFailure[0]);
    assert.equal(authFailureFields.event, 'auth.failure');
    assert.equal(authFailureFields.requestId, 'unexpected-db-test');
    assert.equal(authFailureFields.reasonCode, 'DATABASE_QUERY_FAILED');
    assert.equal(authFailureFields.context, 'login.session_insert');
    assert.equal(authFailureFields.sqlState, '23505');
    assert.deepEqual(Object.keys(authInternal[1]).sort(), ['code', 'location', 'name']);
    assert.equal(authInternal[1].name, 'Error');
    assert.equal(authInternal[1].code, '23505');
    assert.match(authInternal[1].location, /^at TestContext\./);
    const loggedOutput = JSON.stringify(entries);
    assert.doesNotMatch(loggedOutput + JSON.stringify(result), /password|password hash|otp|token|cookie|session secret|DATABASE_URL|fake-session-token|654321|fake-cookie|private constraint data/i);
  } finally { console.error = oldError; }
});

test('owner promotion failure is logged safely and does not fail login flow', async () => {
  const previous = process.env.OWNER_EMAIL;
  process.env.OWNER_EMAIL = 'owner@example.test';
  const oldError = console.error;
  const entries = [];
  console.error = (...args) => entries.push(args.join(' '));
  try {
    const db = { async query(sql) {
      if (sql.includes('UPDATE customer_accounts')) throw Object.assign(new Error('private owner row detail'), { code: 'P0001', table: 'customer_accounts' });
      return { rows: [] };
    } };
    assert.equal(await tryPromoteVerifiedOwner(db, 'user-id', 'owner-promotion-test'), false);
    assert.match(entries[0], /"context":"login.owner_promote"/);
    assert.match(entries[0], /"reasonCode":"OWNER_PROMOTION_FAILED"/);
    assert.match(entries[0], /"sqlState":"P0001"/);
    assert.doesNotMatch(entries.join(' '), /private owner row detail|owner@example\.test|user-id/);
  } finally {
    console.error = oldError;
    if (previous === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = previous;
  }
});

test('email-verified mobile-pending login succeeds without valid SMS configuration and stays limited', async () => {
  const previous = Object.fromEntries(['DATABASE_URL', 'AUTH_REQUIRE_POSTGRES', 'PUBLIC_SITE_URL', 'OWNER_EMAIL', 'SMS_PROVIDER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'].map((key) => [key, process.env[key]]));
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_REQUIRE_POSTGRES;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';
  process.env.SMS_PROVIDER = 'twilio-verify';
  process.env.TWILIO_ACCOUNT_SID = 'invalid-account-sid';
  process.env.TWILIO_AUTH_TOKEN = 'invalid-test-token';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'invalid-service-sid';
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const email = `partial_${suffix}@example.test`;
  process.env.OWNER_EMAIL = email;
  const password = 'a-safe-regression-password';
  const headers = { origin: 'http://localhost:5173', host: 'localhost:5173' };
  try {
    const created = await handleAuth({ method: 'POST', headers, socket: { remoteAddress: `198.51.100.${Math.floor(Math.random() * 200) + 1}` } }, 'signup', {
      name: 'Partial Verification', email, mobile: `9${String(Date.now()).slice(-9)}`, password, verificationConsent: true,
    });
    assert.equal(created.status, 201);
    const cookie = created.headers['Set-Cookie'].split(';')[0];
    const verifiedEmail = await handleAuth({ method: 'POST', headers: { ...headers, cookie }, socket: { remoteAddress: '198.51.100.12' } }, 'verify-email', { code: '123456' });
    assert.equal(verifiedEmail.status, 200);
    const wrongPassword = await handleAuth({ method: 'POST', headers, socket: { remoteAddress: '198.51.100.15' } }, 'login', { identifier: email, password: 'not-the-password' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.reasonCode, 'INVALID_CREDENTIALS');
    const login = await handleAuth({ method: 'POST', headers, socket: { remoteAddress: '198.51.100.13' } }, 'login', { identifier: email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.next, '/auth/verify');
    assert.equal(login.body.user.emailVerified, true);
    assert.equal(login.body.user.mobileVerified, false);
    assert.ok(login.headers['Set-Cookie']);
    const loginCookie = login.headers['Set-Cookie'].split(';')[0];
    const me = await handleAuth({ method: 'GET', headers: { ...headers, cookie: loginCookie }, socket: { remoteAddress: '198.51.100.13' } }, 'me');
    assert.equal(me.status, 200);
    assert.equal(me.body.dashboardAllowed, false);
    assert.equal(me.body.user.role, 'limited');
    const financialResponse = { setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await unavailableFinancialApi({ method: 'GET', headers: { cookie: loginCookie } }, financialResponse);
    assert.equal(financialResponse.statusCode, 403);
    const logout = await handleAuth({ method: 'POST', headers: { ...headers, cookie: loginCookie }, socket: { remoteAddress: '198.51.100.13' } }, 'logout');
    assert.equal(logout.status, 200);
    assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);
    delete process.env.SMS_PROVIDER;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    const noSmsLogin = await handleAuth({ method: 'POST', headers, socket: { remoteAddress: '198.51.100.14' } }, 'login', { identifier: email, password });
    assert.equal(noSmsLogin.status, 200);
    assert.equal(noSmsLogin.body.next, '/auth/verify');
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('login returns 429 when its shared IP limit is exhausted', async () => {
  const previous = Object.fromEntries(['DATABASE_URL', 'AUTH_REQUIRE_POSTGRES', 'PUBLIC_SITE_URL'].map((key) => [key, process.env[key]]));
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_REQUIRE_POSTGRES;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';
  const ip = `198.51.100.${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    for (let attempt = 0; attempt < 500; attempt += 1) assert.equal(await rateAllowed(`login:ip:${ip}`, 500, 15), true);
    const result = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: ip } }, 'login', { identifier: 'rate-limit@example.test', password: 'test-password' });
    assert.equal(result.status, 429);
    assert.equal(result.body.reasonCode, 'RATE_LIMITED');
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('signup, login, and verification succeed in local development mode without external database', async () => {
  const previousOrigin = process.env.PUBLIC_SITE_URL;
  delete process.env.AUTH_REQUIRE_POSTGRES;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';
  const testEmail = `tester_${Date.now()}@example.com`;
  const testMobile = `9${Date.now().toString().slice(-9)}`;
  const testIp = `10.0.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const testPassword = 'password-testing-123';
  const originalConsoleLog = console.log;
  const signupLogs = [];

  try {
    // 1. Signup
    console.log = (...args) => signupLogs.push(args.join(' '));
    const signupRes = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: testIp } }, 'signup', {
      name: 'Dev Tester', email: testEmail, mobile: testMobile, password: testPassword, verificationConsent: true
    });
    console.log = originalConsoleLog;
    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.ok, true);
    assert.equal(signupRes.body.next, '/auth/verify');
    assert.ok(signupRes.headers['Set-Cookie']);
    assert.doesNotMatch(signupLogs.join(' '), /\b\d{6}\b|verification code/i);

    const cookieHeader = signupRes.headers['Set-Cookie'].split(';')[0];

    // 2. Verify email with dev code 123456
    const emailRes = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173', cookie: cookieHeader }, socket: { remoteAddress: '127.0.0.1' } }, 'verify-email', {
      code: '123456'
    });
    assert.equal(emailRes.status, 200);
    assert.equal(emailRes.body.user.emailVerified, true);

    // 3. Verify mobile with dev code 123456
    const mobileRes = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173', cookie: cookieHeader }, socket: { remoteAddress: '127.0.0.1' } }, 'verify-mobile', {
      code: '123456'
    });
    assert.equal(mobileRes.status, 200);
    assert.equal(mobileRes.body.user.mobileVerified, true);
    assert.equal(mobileRes.body.user.status, 'ACTIVE');

    // 4. Check me
    const meRes = await handleAuth({ method: 'GET', headers: { origin: 'http://localhost:5173', host: 'localhost:5173', cookie: cookieHeader }, socket: { remoteAddress: '127.0.0.1' } }, 'me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.dashboardAllowed, true);

    // 5. Login with Email
    const loginEmailRes = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login', {
      identifier: testEmail, password: testPassword
    });
    assert.equal(loginEmailRes.status, 200);
    assert.equal(loginEmailRes.body.next, '/dashboard');
    assert.ok(loginEmailRes.headers['Set-Cookie']);

    // 6. Login with 10-digit Mobile
    const loginMobile10Res = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login', {
      identifier: testMobile, password: testPassword
    });
    assert.equal(loginMobile10Res.status, 200);
    assert.equal(loginMobile10Res.body.next, '/dashboard');
    assert.ok(loginMobile10Res.headers['Set-Cookie']);

    // 7. Login with E.164 Mobile (+91...)
    const loginMobileE164Res = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login', {
      identifier: `+91${testMobile}`, password: testPassword
    });
    assert.equal(loginMobileE164Res.status, 200);
    assert.equal(loginMobileE164Res.body.next, '/dashboard');

    // 8. Login with Wrong Password
    const loginWrongPass = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login', {
      identifier: testEmail, password: 'incorrect-password-123'
    });
    assert.equal(loginWrongPass.status, 401);

    // 9. Login with Unknown User
    const loginUnknown = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login', {
      identifier: 'nonexistent@example.com', password: testPassword
    });
    assert.equal(loginUnknown.status, 401);
  } finally {
    console.log = originalConsoleLog;
    if (previousOrigin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previousOrigin;
  }
});

test('auth router resolves route aliases and handles GET requests gracefully', async () => {
  const previousOrigin = process.env.PUBLIC_SITE_URL;
  delete process.env.AUTH_REQUIRE_POSTGRES;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';

  try {
    // GET on signup gives helpful guidance
    const getSignup = await handleAuth({ method: 'GET', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'signup');
    assert.equal(getSignup.status, 200);
    assert.equal(getSignup.body.ok, true);

    // GET on login gives helpful guidance
    const getLogin = await handleAuth({ method: 'GET', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'login');
    assert.equal(getLogin.status, 200);
    assert.equal(getLogin.body.ok, true);

    // Alias 'signin' maps to login
    const signinRes = await handleAuth({ method: 'GET', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'signin');
    assert.equal(signinRes.status, 200);
    assert.equal(signinRes.body.route, 'login');

    // Truly unknown route returns 404 with clear message
    const unknownRes = await handleAuth({ method: 'GET', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, 'unknown-route-xyz');
    assert.equal(unknownRes.status, 404);
    assert.ok(unknownRes.body.error.includes('unknown-route-xyz'));
  } finally {
    if (previousOrigin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previousOrigin;
  }
});
