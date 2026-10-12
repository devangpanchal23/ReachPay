import test from 'node:test';
import assert from 'node:assert/strict';
import { PaytmSettlementProvider } from '../server/pos/paytm-settlement-provider.js';

const envKeys = ['PAYTM_SETTLEMENT_API_APPROVED', 'PAYTM_SETTLEMENT_CLIENT_ID', 'PAYTM_SETTLEMENT_CLIENT_SECRET', 'PAYTM_SETTLEMENT_MERCHANT_ID', 'PAYTM_SETTLEMENT_JWT_EMAIL'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
function configure() {
  Object.assign(process.env, {
    PAYTM_SETTLEMENT_API_APPROVED: 'true', PAYTM_SETTLEMENT_CLIENT_ID: 'test-client',
    PAYTM_SETTLEMENT_CLIENT_SECRET: 'test-secret', PAYTM_SETTLEMENT_MERCHANT_ID: 'test-mid',
    PAYTM_SETTLEMENT_JWT_EMAIL: 'merchant@example.test',
  });
}
function response(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}
function successBody(reqMsgId, values = {}) {
  return { head: { reqMsgId }, body: {
    resultCode: '00000000', resultStatus: 'S', transactionType: 'ACQUIRING',
    orderId: 'order-1', originalMid: 'test-mid', amount: '125.00', status: 'SUCCESS',
    payoutId: 'payout-1', settledDate: '2026-10-12T12:00:00+05:30', settledAmount: '123.50', ...values,
  } };
}
function client(fetchImpl, timeoutMs = 30) { return new PaytmSettlementProvider({ fetchImpl, timeoutMs }); }
const request = { mid: 'test-mid', orderId: 'order-1', transactionDate: '2026-10-12', expectedAmountPaise: 12500, environment: 'production' };

test('Paytm settlement adapter is disabled unless approval and credentials are configured', async () => {
  process.env.PAYTM_SETTLEMENT_API_APPROVED = 'false';
  const provider = client(async () => { throw new Error('must not call'); });
  assert.equal(provider.getAvailability({ mid: 'test-mid', environment: 'production' }).enabled, false);
  await assert.rejects(provider.getOrderSettlement(request), { code: 'PAYTM_SETTLEMENT_APPROVAL_OR_CREDENTIALS_REQUIRED' });
});

test('successful acquiring payout validates order, MID, gross amount, payout and timestamp', async () => {
  configure();
  const provider = client(async (_url, init) => {
    const sent = JSON.parse(init.body);
    assert.match(init.headers.Authorization, /^Bearer [\w.-]+$/);
    assert.equal(init.headers.clientId, 'test-client');
    assert.deepEqual(sent.request.body, { mid: 'test-mid', orderId: 'order-1', transactionDate: '2026-10-12' });
    return response(successBody(sent.request.head.reqMsgId));
  });
  const result = await provider.getOrderSettlement(request);
  assert.equal(result.settlementStatus, 'SETTLED');
  assert.equal(result.payoutId, 'payout-1');
  assert.equal(result.settledAmountPaise, 12350);
  assert.equal(result.amountPaise, 12500);
});

test('pending settlement remains pending and does not create payout evidence', async () => {
  configure();
  const provider = client(async (_url, init) => response(successBody(JSON.parse(init.body).request.head.reqMsgId, { status: 'PENDING', payoutId: undefined, settledDate: undefined, settledAmount: undefined })));
  const result = await provider.getOrderSettlement(request);
  assert.equal(result.status, 'SETTLEMENT_PENDING');
  assert.equal(result.payoutId, undefined);
});

test('duplicate provider responses remain deterministic and are independently validated', async () => {
  configure();
  const provider = client(async (_url, init) => response(successBody(JSON.parse(init.body).request.head.reqMsgId)));
  const first = await provider.getOrderSettlement(request);
  const second = await provider.getOrderSettlement(request);
  for (const key of ['merchantTxnId', 'mid', 'amountPaise', 'status', 'settlementStatus', 'payoutId', 'settledAt', 'settledAmountPaise', 'verified']) assert.equal(first[key], second[key]);
});

test('amount mismatch is rejected for reconciliation', async () => {
  configure();
  const provider = client(async (_url, init) => response(successBody(JSON.parse(init.body).request.head.reqMsgId, { amount: '124.99' })));
  await assert.rejects(provider.getOrderSettlement(request), { code: 'PAYTM_SETTLEMENT_RECONCILIATION_MISMATCH' });
});

test('invalid JWT or missing permission is reported without exposing response data', async () => {
  configure();
  const provider = client(async () => response({}, 401));
  await assert.rejects(provider.getOrderSettlement(request), { code: 'PAYTM_SETTLEMENT_INVALID_JWT_OR_PERMISSION' });
});

test('API timeout and provider unavailable are retryable failures', async () => {
  configure();
  const timeoutProvider = client((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), 5);
  await assert.rejects(timeoutProvider.getOrderSettlement(request), { code: 'PAYTM_SETTLEMENT_TIMEOUT' });
  const downProvider = client(async () => response({}, 503));
  await assert.rejects(downProvider.getOrderSettlement(request), { code: 'PAYTM_SETTLEMENT_PROVIDER_UNAVAILABLE' });
});

test('production-only API blocks staging and another merchant MID', () => {
  configure();
  const provider = client(async () => response({}));
  assert.equal(provider.getAvailability({ mid: 'test-mid', environment: 'staging' }).enabled, false);
  assert.equal(provider.getAvailability({ mid: 'other-mid', environment: 'production' }).enabled, false);
});

test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
