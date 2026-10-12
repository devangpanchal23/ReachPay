import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getPOSProvider, posProviders } from '../server/pos/provider-registry.js';
import { PhonePePOSProvider, phonePePOSProvider } from '../server/pos/phonepe-provider.js';

const envKeys = ['PHONEPE_POS_ENV','PHONEPE_POS_SALT_KEY','PHONEPE_POS_SALT_INDEX','PHONEPE_POS_STORE_ID','PHONEPE_POS_PROVIDER_ID','PHONEPE_POS_CONTRACT_CONFIRMED','PHONEPE_POS_UAT_SALT_KEY','PHONEPE_POS_UAT_SALT_INDEX','PHONEPE_POS_UAT_PROVIDER_ID','PHONEPE_POS_UAT_CONTRACT_CONFIRMED','PHONEPE_POS_PRODUCTION_SALT_KEY','PHONEPE_POS_PRODUCTION_SALT_INDEX','PHONEPE_POS_PRODUCTION_PROVIDER_ID','PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED','PHONEPE_POS_PRODUCTION_APPROVED'];
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
  assert.equal(result.status, 'PARTNER_CONTRACT_REQUIRED');
  assert.equal(result.sandboxTestable, false);
  assert.match(result.message, /do not publish an executable EDC API contract/);
});

test('PhonePe provider calls stay disabled until the private partner contract is confirmed', async () => {
  setEnv({ PHONEPE_POS_SALT_KEY:'test-salt',PHONEPE_POS_SALT_INDEX:'1',PHONEPE_POS_STORE_ID:'store-1' });
  let called=false;
  const provider=new PhonePePOSProvider({fetchImpl:async()=>{called=true;throw new Error('unexpected network call');}});
  assert.equal(provider.isConfigured(),false);
  await assert.rejects(provider.initiateSale({mid:'merchant-1',tid:'terminal-1',merchantTxnId:'RP_TEST',amountPaise:100}),/PHONEPE_PARTNER_CONTRACT_REQUIRED/);
  assert.equal(called,false);
  setEnv({});
});

test('PhonePe callbacks stay unavailable until private contract confirmation', async () => {
  setEnv({});
  const { handlePhonePeWebhook }=await import('../server/pos/pos-controller.js');
  const result=await handlePhonePeWebhook({headers:{'x-verify':'untrusted'}},{response:'untrusted'});
  assert.equal(result.status,503);
  assert.equal(result.body.error,'PHONEPE_PARTNER_CONTRACT_REQUIRED');
});

test('PhonePe API calls require explicit private-contract confirmation', () => {
  setEnv({ PHONEPE_POS_SALT_KEY: 'test-salt', PHONEPE_POS_SALT_INDEX: '1', PHONEPE_POS_STORE_ID: 'store-1' });
  assert.equal(phonePePOSProvider.isConfigured(), false);
  process.env.PHONEPE_POS_CONTRACT_CONFIRMED = 'true';
  assert.equal(phonePePOSProvider.isConfigured(), true);
  setEnv({});
});

test('PhonePe production cannot reuse UAT credentials or activate without server approval', () => {
  setEnv({ PHONEPE_POS_ENV:'production',PHONEPE_POS_SALT_KEY:'uat-only',PHONEPE_POS_SALT_INDEX:'1',PHONEPE_POS_STORE_ID:'store-1',PHONEPE_POS_CONTRACT_CONFIRMED:'true' });
  assert.equal(phonePePOSProvider.isConfigured({storeId:'store-1',environment:'production'}),false);
  assert.equal(phonePePOSProvider.getIntegrationStatus({storeId:'store-1',environment:'production'}).status,'PRODUCTION_ACTIVATION_REQUIRED');
  setEnv({ PHONEPE_POS_ENV:'production',PHONEPE_POS_CONTRACT_CONFIRMED:'true',PHONEPE_POS_PRODUCTION_SALT_KEY:'live-key',PHONEPE_POS_PRODUCTION_SALT_INDEX:'2',PHONEPE_POS_STORE_ID:'store-1',PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED:'true',PHONEPE_POS_PRODUCTION_APPROVED:'true' });
  assert.equal(phonePePOSProvider.isConfigured({storeId:'store-1',environment:'production'}),true);
  setEnv({});
});

test('PhonePe signs requests with the selected environment credentials', () => {
  setEnv({ PHONEPE_POS_CONTRACT_CONFIRMED:'true',PHONEPE_POS_UAT_SALT_KEY:'uat-secret',PHONEPE_POS_UAT_SALT_INDEX:'1',PHONEPE_POS_STORE_ID:'store-1',PHONEPE_POS_UAT_CONTRACT_CONFIRMED:'true',PHONEPE_POS_PRODUCTION_SALT_KEY:'production-secret',PHONEPE_POS_PRODUCTION_SALT_INDEX:'9',PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED:'true',PHONEPE_POS_PRODUCTION_APPROVED:'true' });
  const uat=phonePePOSProvider.signature('encoded','/path',{environment:'uat'});
  const production=phonePePOSProvider.signature('encoded','/path',{environment:'production'});
  assert.equal(uat,`${sha('encoded/pathuat-secret')}###1`);
  assert.equal(production,`${sha('encoded/pathproduction-secret')}###9`);
  assert.notEqual(uat,production);
  setEnv({});
});

test('Provisional PhonePe request contract is exercised only behind private contract confirmation', async () => {
  setEnv({ PHONEPE_POS_ENV: 'uat', PHONEPE_POS_SALT_KEY: 'test-salt', PHONEPE_POS_SALT_INDEX: '1', PHONEPE_POS_STORE_ID: 'store-1', PHONEPE_POS_CONTRACT_CONFIRMED: 'true' });
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

test('Provisional PhonePe status contract requires exact terminal and amount evidence', async () => {
  setEnv({ PHONEPE_POS_ENV: 'production', PHONEPE_POS_CONTRACT_CONFIRMED:'true', PHONEPE_POS_PRODUCTION_SALT_KEY: 'test-salt', PHONEPE_POS_PRODUCTION_SALT_INDEX: '2', PHONEPE_POS_STORE_ID: 'store-1', PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED: 'true', PHONEPE_POS_PRODUCTION_APPROVED: 'true' });
  let sent;
  const provider = new PhonePePOSProvider({ fetchImpl: async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => ({ success: true, code: 'SUCCESS', data: { merchantId: 'merchant-1', storeId:'store-1', terminalId:'terminal-1', transactionId: 'txn-1', amount: 1250, status: 'SUCCESS', referenceNumber: 'rrn-1' } }) };
  } });
  const result = await provider.getTransactionStatus({ mid: 'merchant-1', tid:'terminal-1', storeId:'store-1', merchantTxnId: 'txn-1' });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.amountPaise, 1250);
  assert.equal(result.rrn, 'rrn-1');
  const path = '/v1/edc/transaction/merchant-1/txn-1/status';
  assert.equal(sent.url, `https://mercury-t2.phonepe.com${path}`);
  assert.equal(sent.headers['X-VERIFY'], `${sha(`${path}test-salt`)}###2`);
});

test('PhonePe status remains UNKNOWN when the terminal identity or amount is incomplete', async () => {
  setEnv({ PHONEPE_POS_ENV:'uat',PHONEPE_POS_SALT_KEY:'test-salt',PHONEPE_POS_SALT_INDEX:'2',PHONEPE_POS_STORE_ID:'store-1',PHONEPE_POS_CONTRACT_CONFIRMED:'true' });
  const provider = new PhonePePOSProvider({ fetchImpl: async () => ({
    ok:true,
    json:async()=>({success:true,code:'SUCCESS',data:{merchantId:'merchant-1',transactionId:'txn-1',status:'SUCCESS'}}),
  }) });
  const result=await provider.getTransactionStatus({mid:'merchant-1',tid:'terminal-1',storeId:'store-1',merchantTxnId:'txn-1'});
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.resultCode,'STATUS_IDENTITY_OR_AMOUNT_MISMATCH');
  setEnv({});
});

test('PhonePe callbacks require matching X-VERIFY salt index and digest', () => {
  setEnv({ PHONEPE_POS_SALT_KEY: 'callback-salt', PHONEPE_POS_SALT_INDEX: '7', PHONEPE_POS_CONTRACT_CONFIRMED:'true' });
  const response = Buffer.from(JSON.stringify({ success: true })).toString('base64');
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}callback-salt`)}###7`), true);
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}wrong`)}###7`), false);
  assert.equal(phonePePOSProvider.verifyCallback(response, `${sha(`${response}callback-salt`)}###8`), false);
  setEnv({});
});

test('Provisional PhonePe search request requires exact store, terminal, and amount evidence', async () => {
  setEnv({ PHONEPE_POS_ENV: 'uat', PHONEPE_POS_SALT_KEY: 'search-salt', PHONEPE_POS_SALT_INDEX: '3', PHONEPE_POS_STORE_ID: 'store-1', PHONEPE_POS_CONTRACT_CONFIRMED: 'true' });
  let sent;
  const provider = new PhonePePOSProvider({ fetchImpl: async (url, options) => {
    sent = { url, ...options };
    return { ok: true, json: async () => ({ success: true, code: 'SUCCESS', data: [{ merchantId: 'merchant-1', storeId:'store-1', terminalId:'terminal-1', transactionId: 'txn-1', amount: 1250, status: 'SUCCESS' }] }) };
  } });
  const result = await provider.searchTransaction({ mid: 'merchant-1', tid: 'terminal-1', storeId:'store-1', merchantTxnId: 'txn-1' });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.amountPaise, 1250);
  assert.equal(sent.url, 'https://mercury-uat.phonepe.com/enterprise-sandbox/v1/edc/transaction/status');
  const encoded = JSON.parse(sent.body).request;
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString()), { merchantId: 'merchant-1', terminalId: 'terminal-1', merchantTransactionId: 'txn-1' });
  assert.equal(sent.headers['X-VERIFY'], `${sha(`${encoded}/v1/edc/transaction/statussearch-salt`)}###3`);
  setEnv({});
});
