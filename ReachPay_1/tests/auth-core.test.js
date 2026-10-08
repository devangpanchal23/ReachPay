import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOtp, hashPassword, normalizeEmail, normalizeMobile, parseCookies, safeEqualHex, sessionCookie, validateRegistration, verifyPassword } from '../server/auth-core.js';
import { handleAuth } from '../server/auth-controller.js';
import { cleanNationalInput, emailError, maxNationalDigits, nameError, passwordError, PHONE_COUNTRIES, phoneError } from '../shared/phone-validation.js';

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
    assert.equal(result.body.error, 'Account setup is incomplete. Please contact the administrator.');
    assert.equal(result.headers['X-Request-Id'].length > 0, true);
  } finally {
    if (previousReq === undefined) delete process.env.AUTH_REQUIRE_POSTGRES; else process.env.AUTH_REQUIRE_POSTGRES = previousReq;
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previousOrigin;
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

  try {
    // 1. Signup
    const signupRes = await handleAuth({ method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:5173' }, socket: { remoteAddress: testIp } }, 'signup', {
      name: 'Dev Tester', email: testEmail, mobile: testMobile, password: testPassword, verificationConsent: true
    });
    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.ok, true);
    assert.equal(signupRes.body.next, '/auth/verify');
    assert.ok(signupRes.headers['Set-Cookie']);

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
