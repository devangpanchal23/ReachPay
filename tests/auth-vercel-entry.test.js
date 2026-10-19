import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/auth/[action].js';

test('Vercel auth action forwards parsed POST JSON to signup and preserves request id', async () => {
  const previous = {
    requirePostgres: process.env.AUTH_REQUIRE_POSTGRES,
    databaseUrl: process.env.DATABASE_URL,
    publicSiteUrl: process.env.PUBLIC_SITE_URL,
  };
  process.env.AUTH_REQUIRE_POSTGRES = 'true';
  delete process.env.DATABASE_URL;
  process.env.PUBLIC_SITE_URL = 'http://localhost:5173';
  const headers = {};
  const originalConsoleError = console.error;
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args.join(' '));
  let statusCode;
  let payload;
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; },
  };
  const request = {
    method: 'POST',
    url: '/api/auth/signup',
    query: { action: 'signup' },
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', host: 'localhost:5173', 'x-request-id': 'safe-test-request' },
    body: { name: 'Example User', email: 'user@example.test', mobile: '9876543210', password: 'a-safe-test-password', verificationConsent: true },
    socket: { remoteAddress: '127.0.0.1' },
  };

  try {
    await auth(request, response);
    assert.equal(statusCode, 503);
    assert.equal(payload.error, 'Account service is temporarily unavailable.');
    assert.equal(headers['X-Request-Id'], 'safe-test-request');
    assert.match(errorLogs.join(' '), /"event":"auth\.register_failure","step":"register\.request","name":"Error","code":""/);
    assert.doesNotMatch(errorLogs.join(' '), /a-safe-test-password|user@example\.test/);
  } finally {
    console.error = originalConsoleError;
    if (previous.requirePostgres === undefined) delete process.env.AUTH_REQUIRE_POSTGRES;
    else process.env.AUTH_REQUIRE_POSTGRES = previous.requirePostgres;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.publicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previous.publicSiteUrl;
  }
});
