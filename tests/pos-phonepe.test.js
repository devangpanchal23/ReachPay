import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getPOSProvider, posProviders } from '../server/pos/provider-registry.js';
import { PhonePePOSProvider, phonePePOSProvider } from '../server/pos/phonepe-provider.js';

const envKeys = ['PHONEPE_POS_ENV', 'PHONEPE_POS_SALT_KEY', 'PHONEPE_POS_SALT_INDEX', 'PHONEPE_POS_STORE_ID', 'PHONEPE_POS_PROVIDER_ID'];
function setEnv(values) { for (const key of envKeys) { if (key in values) process.env[key] = values[key]; else delete process.env[key]; } }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }

test('registry retains both payment terminal providers', () => {
  assert.equal(getPOSProvider('phonepe'), phonePePOSProvider);
  assert.deepEqual(Object.keys(posProviders).sort(), ['paytm', 'phonepe']);
  assert.throws(() => getPOSProvider('unknown'), /POS_PROVIDER_UNSUPPORTED/);
});

test('PhonePe provider reports exactly which merchant credentials and enablement are required', () => {
  setEnv({});
  const result = phonePePOSProvider.getIntegrationStatus();
  assert.equal(result.connected, false);
  assert.equal(result.status, 'CREDENTIALS_REQUIRED');
  assert.equal(result.sandboxTestable, false);
  assert.match(result.message, /MID\/TID references do not authenticate/);
});

test('PhonePe EDC sale uses documented endpoint, payload and X-VERIFY construction', async () => {
  setEnv({ PHONEPE_POS_ENV: 'uat', PHONEPE_POS_SALT_KEY: 'test-salt', PHONEPE_POS_SALT_INDEX: '1', PHONEPE_POS_STORE_ID: 'store-1' });
  let sent;
  const provider = new PhonePePOSProvider({ fetchImpl: async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => ({ success: true, code: 'SUCCESS', data: { transactionId: 'RP_TX_123' } }) };
  } });
  const result = await provider.initiateSale({ mid: 'merchant-1', tid: 'terminal-1', merchantTxnId: 'RP_TX_123', amountPaise: 1250 });
  assert.equal(result.status, 'PENDING');
  assert.equal(sent.url, 'https://mercury-uat.phonepe.com/enterprise-sandbox/v1/edc/transaction/init');
  const payload = JSON.parse(Buffer.from(JSON.parse(sent.body).request, 'base64').toString('utf8'));
  assert.equal(payload.storeId, 'store-1');
  assert.equal(payload.amount, 1250);
  assert.equal(payload.integrationMappingType, 'ONE_TO_ONE');
  const encoded = JSON.parse(sent.body).request;
  assert.equal(sent.headers['X-VERIFY'], `${sha(`${encoded}/v1/edc/transaction/inittest-salt`)}###1`);
});

test('PhonePe status signature and status mapping match the documented contract', async () => {
  setEnv({ PHONEPE_POS_ENV: 'production', PHONEPE_POS_SALT_KEY: 'test-salt', PHONEPE_POS_SALT_INDEX: '2', PHONEPE_POS_STORE_ID: 'store-1' });
  let sent;
  const provider = new PhonePePOSProvider({ fetchImpl: async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => ({ success: true, code: 'SUCCESS', data: { merchantId: 'merchant-1', transactionId: 'txn-1', amount: 1250, status: 'SUCCESS', referenceNumber: 'rrn-1' } }) };
  } });
  const result = await provider.getTransactionStatus({ mid: 'merchant-1', merchantTxnId: 'txn-1' });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.amountPaise, 1250);
  assert.equal(result.rrn, 'rrn-1');
  const path = '/v1/edc/transaction/merchant-1/txn-1/status';
  assert.equal(sent.url, `https://mercury-t2.phonepe.com${path}`);
  assert.equal(sent.headers['X-VERIFY'], `${sha(`${path}test-salt`)}###2`);
});

test('PhonePe callbacks require matching X-VERIFY salt index and digest', () => {
  setEnv({ PHONEPE_POS_SALT_KEY: 'callback-salt', PHONEPE_POS_SALT_INDEX: '7' });
  const response = Buffer.from(JSON.stringify({ success: true })).toString('base64');
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}callback-salt`)}###7`), true);
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}wrong`)}###7`), false);
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}callback-salt`)}###8`), false);
  setEnv({});
});

test('PhonePe reconciliation uses documented search request envelope and maps authoritative status', async () => {
  setEnv({ PHONEPE_POS_ENV: 'uat', PHONEPE_POS_SALT_KEY: 'search-salt', PHONEPE_POS_SALT_INDEX: '3', PHONEPE_POS_STORE_ID: 'store-1' });
  let sent;
  const provider = new PhonePePOSProvider({ fetchImpl: async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => ({ success: true, code: 'SUCCESS', data: [{ merchantId: 'merchant-1', transactionId: 'txn-1', amount: 1250, status: 'SUCCESS' }] }) };
  } });
  const result = await provider.searchTransaction({ mid: 'merchant-1', tid: 'terminal-1', merchantTxnId: 'txn-1' });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.amountPaise, 1250);
  assert.equal(sent.url, 'https://mercury-uat.phonepe.com/enterprise-sandbox/v1/edc/transaction/status');
  const encoded = JSON.parse(sent.body).request;
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString()), { merchantId: 'merchant-1', terminalId: 'terminal-1', merchantTransactionId: 'txn-1' });
  assert.equal(sent.headers['X-VERIFY'], `${sha(`${encoded}/v1/edc/transaction/statussearch-salt`)}###3`);
  setEnv({});
});
