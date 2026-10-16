import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';

test('health reports boolean service status without exposing configured values', async () => {
  const keys = ['DATABASE_URL', 'OWNER_EMAIL', 'AUTH_OTP_SECRET', 'AUTH_RATE_LIMIT_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'RESEND_API_KEY', 'CONTACT_FROM_EMAIL', 'SMS_PROVIDER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const previousNodeEnv = process.env.NODE_ENV;
  for (const key of keys) delete process.env[key];
  delete process.env.NODE_ENV;
  const headers = {};
  let statusCode;
  let payload;
  const response = {
    setHeader(name, value) { headers[name] = value; return this; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; },
  };

  try {
    await health({ headers: {} }, response);
    assert.equal(statusCode, 503);
    assert.equal(payload.liveMoneyMovement, false);
    assert.ok(payload.services);
    for (const value of Object.values(payload.services)) assert.equal(typeof value, 'boolean');
    assert.equal(JSON.stringify(payload).includes('placeholder'), false);
    assert.equal(headers['Cache-Control'], 'no-store');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
