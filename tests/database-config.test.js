import test from 'node:test';
import assert from 'node:assert/strict';
import { authEnvironmentStatus, isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

test('Neon pooled URLs allow Neon database names and require verified TLS plus channel binding', () => {
  const connectionString = 'postgresql://user:placeholder@ep-example-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
  assert.equal(isAllowedDatabaseUrl(connectionString), true);
  const config = postgresPoolConfig(connectionString, { production: true, max: 1 });
  assert.equal(config.enableChannelBinding, true);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.max, 1);
  assert.equal(new URL(config.connectionString).searchParams.has('channel_binding'), false);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
});

test('non-Neon database targets remain limited to the ReachPay allowlist', () => {
  assert.equal(isAllowedDatabaseUrl('postgresql://user:placeholder@db.example.test/reachpay'), true);
  assert.equal(isAllowedDatabaseUrl('postgresql://user:placeholder@db.example.test/neondb'), false);
  assert.equal(isAllowedDatabaseUrl('https://db.example.test/reachpay'), false);
});

test('auth environment status supports either SMTP or Resend with Twilio and keeps values hidden', () => {
  const base = {
    DATABASE_URL: 'configured',
    OWNER_EMAIL: 'owner@example.test',
    AUTH_OTP_SECRET: 'o'.repeat(32),
    AUTH_RATE_LIMIT_SECRET: 'r'.repeat(32),
    SMS_PROVIDER: 'twilio-verify',
    TWILIO_ACCOUNT_SID: 'sid-placeholder',
    TWILIO_AUTH_TOKEN: 'token-placeholder',
    TWILIO_VERIFY_SERVICE_SID: 'service-placeholder',
    RESEND_API_KEY: 'resend-placeholder',
    CONTACT_FROM_EMAIL: 'ReachPay <verify@example.test>',
  };
  const status = authEnvironmentStatus(base);
  assert.equal(status.emailOtpConfigured, true);
  assert.equal(status.smsOtpConfigured, true);
  assert.equal(status.rateLimitSecretConfigured, true);
  assert.equal(JSON.stringify(status).includes('placeholder'), false);
  assert.equal(authEnvironmentStatus({ ...base, RESEND_API_KEY: '', CONTACT_FROM_EMAIL: '' }).emailOtpConfigured, false);
});
