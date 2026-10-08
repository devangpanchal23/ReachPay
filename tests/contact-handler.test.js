import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContact } from '../server/contact-handler.js';
import contactEndpoint from '../api/contact.js';

const makeRequest = (origin = 'https://site.example') => ({ headers: { origin, host: 'site.example' } });
const valid = { kind: 'contact', name: 'Dev Example', email: 'dev@example.com', company: 'Example Co', message: 'Please share supported payment services.', consent: 'on' };

test('contact handler refuses unconfigured delivery instead of reporting false success', async () => {
  process.env.PUBLIC_SITE_URL = 'https://site.example';
  delete process.env.RESEND_API_KEY; delete process.env.CONTACT_FROM_EMAIL; delete process.env.CONTACT_TO_EMAIL;
  const result = await handleContact(makeRequest(), valid, `unconfigured-${crypto.randomUUID()}`);
  assert.equal(result.status, 503);
});

test('production contact handler fails closed without shared rate limiting', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const result = await handleContact(makeRequest(), valid, `production-limit-${crypto.randomUUID()}`);
    assert.equal(result.status, 503);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('contact handler validates origin and consent before sending', async () => {
  process.env.PUBLIC_SITE_URL = 'https://site.example';
  const badOrigin = await handleContact(makeRequest('https://attacker.example'), valid, `origin-${crypto.randomUUID()}`);
  const noConsent = await handleContact(makeRequest(), { ...valid, consent: '' }, `consent-${crypto.randomUUID()}`);
  const unexpected = await handleContact(makeRequest(), { ...valid, accountNumber: 'secret-looking-data' }, `fields-${crypto.randomUUID()}`);
  assert.equal(badOrigin.status, 403); assert.equal(noConsent.status, 400); assert.equal(unexpected.status, 400);
});

test('contact handler sends only sanitized form content using configured mail service', async () => {
  process.env.PUBLIC_SITE_URL = 'https://site.example'; process.env.RESEND_API_KEY = 'test-key'; process.env.CONTACT_FROM_EMAIL = 'ReachPay <web@example.com>'; process.env.CONTACT_TO_EMAIL = 'team@example.com';
  const originalFetch = globalThis.fetch; let sent;
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: true }; };
  try {
    const result = await handleContact(makeRequest(), { ...valid, message: '<script>alert(1)</script> please contact me' }, `sent-${crypto.randomUUID()}`);
    assert.equal(result.status, 202); assert.match(sent.html, /&lt;script&gt;/); assert.doesNotMatch(sent.html, /<script>/); assert.equal(sent.reply_to, valid.email);
  } finally { globalThis.fetch = originalFetch; }
});

test('newsletter interest uses the configured delivery channel and rate limit is bounded', async () => {
  process.env.PUBLIC_SITE_URL = 'https://site.example'; process.env.RESEND_API_KEY = 'test-key'; process.env.CONTACT_FROM_EMAIL = 'ReachPay <web@example.com>'; process.env.CONTACT_TO_EMAIL = 'team@example.com';
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true }); const client = `newsletter-${crypto.randomUUID()}`;
  try {
    const req = await handleContact(makeRequest(), { kind: 'newsletter', email: 'reader@example.com', consent: 'on' }, client);
    assert.equal(req.status, 202);
    const blocked = await Promise.all(Array.from({ length: 6 }, () => handleContact(makeRequest(), valid, `limit-${client}`)));
    assert.equal(blocked.filter((item) => item.status === 429).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('Vercel function rejects unsupported methods, wrong content types and malformed JSON safely', async () => {
  const response = () => ({ headers: {}, statusCode: 200, body: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
  const method = response(); await contactEndpoint({ method: 'GET', headers: {} }, method); assert.equal(method.statusCode, 405);
  const contentType = response(); await contactEndpoint({ method: 'POST', headers: { 'content-type': 'text/plain' } }, contentType); assert.equal(contentType.statusCode, 415);
  const malformed = response(); await contactEndpoint({ method: 'POST', headers: { 'content-type': 'application/json' }, get body() { throw new Error('bad JSON'); } }, malformed); assert.equal(malformed.statusCode, 400);
});

test('Vercel function caps oversized bodies before delivery', async () => {
  const response = () => ({ statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
  const res = response(); await contactEndpoint({ method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20000' } }, res); assert.equal(res.statusCode, 413);
});
