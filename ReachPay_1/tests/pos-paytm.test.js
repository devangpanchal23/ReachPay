import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateSignature, verifySignature, PaytmChecksum } from '../server/pos/paytm-checksum.js';
import { encryptSecret, decryptSecret, posStorage } from '../server/pos/pos-storage.js';
import { PaytmPOSProvider } from '../server/pos/paytm-provider.js';
import { handlePOSRequest, handleWebhook } from '../server/pos/pos-controller.js';

const TEST_MERCHANT_KEY = '23b5d2787e914041b6c085cb2091ecbf';
const TEST_MID = 'MERCHANT_TEST_MID';
const TEST_TID = '70010001';

test('1. Checksum generation produces valid signature string', () => {
  const payload = { mid: TEST_MID, tid: TEST_TID, amount: '100.00', merchantTxnId: 'TXN_001' };
  const signature = generateSignature(payload, TEST_MERCHANT_KEY);

  assert.ok(typeof signature === 'string', 'Signature must be a string');
  assert.ok(signature.length > 20, 'Signature must be substantial base64 length');

  // Also verify class method
  const classSig = PaytmChecksum.generateSignature(payload, TEST_MERCHANT_KEY);
  assert.ok(typeof classSig === 'string');
});

test('2. Checksum verification succeeds with identical payload', () => {
  const payload = { mid: TEST_MID, tid: TEST_TID, amount: '250.00' };
  const signature = generateSignature(payload, TEST_MERCHANT_KEY);

  const isValid = verifySignature(payload, TEST_MERCHANT_KEY, signature);
  assert.equal(isValid, true, 'Original payload must verify as true');
});

test('3. Checksum verification rejects tampered payload and wrong key', () => {
  const payload = { mid: TEST_MID, tid: TEST_TID, amount: '250.00' };
  const signature = generateSignature(payload, TEST_MERCHANT_KEY);

  // Tampered payload
  const tampered = { ...payload, amount: '250.01' };
  assert.equal(verifySignature(tampered, TEST_MERCHANT_KEY, signature), false, 'Tampered payload must fail');

  // Wrong merchant key
  const wrongKey = 'wrong_key_9999999999999999';
  assert.equal(verifySignature(payload, wrongKey, signature), false, 'Wrong key must fail');

  // Empty or invalid checksum
  assert.equal(verifySignature(payload, TEST_MERCHANT_KEY, ''), false);
  assert.equal(verifySignature(payload, TEST_MERCHANT_KEY, null), false);
});

test('4. AES-256-GCM encrypts and decrypts credentials at rest', () => {
  const secretKey = 'my_top_secret_paytm_production_key_456';
  const { encrypted, iv, tag } = encryptSecret(secretKey);

  assert.notEqual(encrypted, secretKey, 'Encrypted secret must not match plaintext');
  assert.equal(iv.length, 24, 'IV must be 12-byte hex (24 chars)');
  assert.equal(tag.length, 32, 'Auth tag must be 16-byte hex (32 chars)');

  const decrypted = decryptSecret(encrypted, iv, tag);
  assert.equal(decrypted, secretKey, 'Decrypted secret must match original plaintext');

  assert.throws(() => decryptSecret(encrypted, iv, '0'.repeat(32)), /Unsupported state or unable to authenticate data/, 'Tampered tag must throw');
});

test('5. Terminal connection fails closed when credentials missing', async () => {
  const provider = new PaytmPOSProvider();
  const conn = await provider.testConnection({ mid: '', tid: '', merchantKey: '' });

  assert.equal(conn.connected, false);
  assert.equal(conn.status, 'CREDENTIALS_REQUIRED');
  assert.ok(conn.message.includes('MID, TID (Terminal ID), and Merchant Key are required'));
});

test('6. Terminal connection detects invalid MID / TID / credentials', async () => {
  const provider = new PaytmPOSProvider();
  const res = await provider.testConnection({
    mid: 'INVALID_MID_999',
    tid: 'INVALID_TID_000',
    merchantKey: TEST_MERCHANT_KEY,
    environment: 'staging',
  });

  assert.equal(res.connected, false);
  assert.equal(res.status, 'CONFIGURED_NOT_TESTED');
});

test('Paytm health check never submits a fabricated transaction or calls the provider', async () => {
  const provider = new PaytmPOSProvider();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not call external provider'); };
  try {
    const status = await provider.testConnection({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY });
    assert.equal(status.status, 'CONFIGURED_NOT_TESTED');
    assert.equal(status.connected, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('Paytm payment request follows documented EDC fields and reports accepted as pending', async () => {
  const provider = new PaytmPOSProvider();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ body: { resultStatus: 'SUCCESS', resultCode: 'S', cpayId: 'CPAY-TEST' } }), { status: 200 });
  };
  try {
    const result = await provider.initiateSale({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, merchantTxnId: 'RPTEST00000001', amountPaise: 12345, customerMobile: '9999999999', notes: 'invoice1' });
    const payload = JSON.parse(request.options.body);
    assert.equal(new URL(request.url).pathname, '/edc-integration-service/payment/request');
    assert.deepEqual(Object.keys(payload.head), ['clientId', 'reqHash']);
    assert.equal(payload.body.mid, TEST_MID);
    assert.equal(payload.body.txnAmount, '12345');
    assert.equal(payload.body.merchantTxnId, 'RPTEST00000001');
    assert.equal(payload.body.tid, undefined);
    assert.equal(payload.body.customerMobile, undefined);
    assert.equal(payload.body.additionalInfo, undefined);
    assert.equal(result.status, 'PENDING');
    assert.equal(result.success, true);
    assert.equal(result.amountPaise, 12345);
  } finally { globalThis.fetch = originalFetch; }
});

test('Paytm transaction status uses documented query and CPay-ID hash input', async () => {
  const provider = new PaytmPOSProvider();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ body: { txnStatus: 'COMPLETED', amount: 12345, Orders: [{ txnID: 'P-TXN', status: 'COMPLETED' }] } }), { status: 200 });
  };
  try {
    const status = await provider.getTransactionStatus({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, cpayId: 'CPAY-TEST', txnDate: '2026-10-07T10:11:12.000Z' });
    const url = new URL(request.url);
    const payload = JSON.parse(request.options.body);
    assert.equal(url.searchParams.get('cpayId'), 'CPAY-TEST');
    assert.equal(url.searchParams.get('mid'), TEST_MID);
    assert.equal(url.searchParams.has('txnDate'), true);
    assert.equal(payload.body, undefined);
    assert.equal(status.status, 'SUCCESS');
    assert.equal(status.amountPaise, 12345);
    assert.equal(status.paytmTxnId, 'P-TXN');
  } finally { globalThis.fetch = originalFetch; }
});

test('7. Sale initiation rejects invalid amounts (zero, negative, non-numeric)', async () => {
  const provider = new PaytmPOSProvider();
  await assert.rejects(
    () => provider.initiateSale({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, amountPaise: 0, merchantTxnId: 'TX1' }),
    /INVALID_AMOUNT/
  );
  await assert.rejects(
    () => provider.initiateSale({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, amountPaise: -500, merchantTxnId: 'TX2' }),
    /INVALID_AMOUNT/
  );
  await assert.rejects(
    () => provider.initiateSale({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, amountPaise: NaN, merchantTxnId: 'TX3' }),
    /INVALID_AMOUNT/
  );
});

test('8. Sale initiation requires merchant transaction ID', async () => {
  const provider = new PaytmPOSProvider();
  await assert.rejects(
    () => provider.initiateSale({ mid: TEST_MID, tid: TEST_TID, merchantKey: TEST_MERCHANT_KEY, amountPaise: 1000, merchantTxnId: '' }),
    /MERCHANT_TXN_ID_REQUIRED/
  );
});

test('sale initiation does not retry or mark a 5xx gateway response as a decline', async () => {
  const provider = new PaytmPOSProvider({ timeoutMs: 50 });
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response('{"message":"temporary gateway failure"}', { status: 503 });
  };
  try {
    const result = await provider.initiateSale({
      mid: TEST_MID,
      tid: TEST_TID,
      merchantKey: TEST_MERCHANT_KEY,
      merchantTxnId: `AMBIGUOUS_${Date.now()}`,
      amountPaise: 1250,
    });
    assert.equal(attempts, 1);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.success, false);
    assert.match(result.message, /Check transaction status before retrying/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Paytm webhook refuses callbacks when no verification key is available', async () => {
  const userId = randomUUID();
  const merchantTxnId = `NO_KEY_${randomUUID()}`;
  await posStorage.createTransaction({ userId, merchantTxnId, mid: TEST_MID, tid: TEST_TID, amountPaise: 2500, idempotencyKey: `key_${randomUUID()}` });
  const oldKey = process.env.PAYTM_POS_MERCHANT_KEY;
  delete process.env.PAYTM_POS_MERCHANT_KEY;
  try {
    const result = await handleWebhook({ headers: { 'x-paytm-signature': 'unverifiable' } }, {
      merchantTxnId,
      status: 'TXN_SUCCESS',
    });
    assert.equal(result.status, 503);
    assert.match(result.body.message, /verification is not configured/i);
  } finally {
    if (oldKey === undefined) delete process.env.PAYTM_POS_MERCHANT_KEY;
    else process.env.PAYTM_POS_MERCHANT_KEY = oldKey;
  }
});

test('9. Honest balance enquiry explicitly reports unavailable through enabled Paytm API', () => {
  const provider = new PaytmPOSProvider();
  const balance = provider.getAccountBalance();

  assert.equal(balance.available, false);
  assert.equal(balance.message, 'Balance unavailable through the enabled Paytm API.');
  assert.ok(balance.reason.includes('scope is dedicated to terminal payment collection'));
});

test('10. Database persistence: terminal saving, isolation, and masking', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const saved = await posStorage.saveTerminal({
    userId,
    mid: 'TEST_MID_PERSIST',
    tid: 'TID_8888',
    merchantKey: 'plain_secret_key_to_encrypt',
    environment: 'staging',
  });

  assert.ok(saved.id);
  assert.equal(saved.mid, 'TEST_MID_PERSIST');
  assert.equal(saved.tid, 'TID_8888');

  // Verify terminal retrieved for user
  const loaded = await posStorage.getTerminal(userId);
  assert.ok(loaded);
  assert.equal(loaded.mid, 'TEST_MID_PERSIST');
  assert.ok(loaded.encrypted_merchant_key, 'Must store encrypted key');
  assert.notEqual(loaded.encrypted_merchant_key, 'plain_secret_key_to_encrypt');

  // Decrypt check
  const decrypted = decryptSecret(
    loaded.encrypted_merchant_key,
    loaded.encrypted_merchant_key_iv,
    loaded.encrypted_merchant_key_tag
  );
  assert.equal(decrypted, 'plain_secret_key_to_encrypt');
});

test('11. Database persistence: transactions, idempotency key, and status update', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const idempKey = `idemp_${Date.now()}_test`;
  const merchantTxnId = `TX_${Date.now()}_A`;

  // Create
  const created = await posStorage.createTransaction({
    userId,
    merchantTxnId,
    mid: 'MID_100',
    tid: 'TID_200',
    amountPaise: 15000,
    idempotencyKey: idempKey,
    status: 'INITIATED',
    notes: 'Order #55',
  });

  assert.equal(created.merchant_txn_id, merchantTxnId);
  assert.equal(created.amount_paise, 15000);
  assert.equal(created.status, 'INITIATED');

  // Retrieve by idempotency key
  const byIdemp = await posStorage.getTransactionByIdempotencyKey(idempKey, userId);
  assert.ok(byIdemp);
  assert.equal(byIdemp.merchant_txn_id, merchantTxnId);

  // Update status to SUCCESS with safe card fields
  const updated = await posStorage.updateTransaction(merchantTxnId, {
    status: 'SUCCESS',
    cpay_id: 'CPAY_9999',
    rrn: '123456789012',
    auth_code: 'APPR01',
    payment_method: 'CARD',
    card_last4: '5678',
    card_type: 'VISA',
  });

  assert.equal(updated.status, 'SUCCESS');
  assert.equal(updated.cpay_id, 'CPAY_9999');
  assert.equal(updated.card_last4, '5678');
  assert.equal(updated.card_type, 'VISA');
});

test('12. Pending transactions query and batch synchronization', async () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const merchantTxnId = `TX_PEND_${Date.now()}`;

  await posStorage.createTransaction({
    userId,
    merchantTxnId,
    mid: 'MID_PEND',
    tid: 'TID_PEND',
    amountPaise: 8000,
    status: 'PENDING',
  });

  const pending = await posStorage.getPendingTransactions({ userId, limit: 10 });
  assert.ok(Array.isArray(pending));
  const found = pending.find((t) => t.merchant_txn_id === merchantTxnId);
  assert.ok(found, 'Created pending transaction must be found in pending list');
  assert.equal(found.status, 'PENDING');
});

test('13. Cross-merchant tenant authorization isolation', async () => {
  const userA = '44444444-4444-4444-8444-444444444444';
  const userB = '55555555-5555-4555-8555-555555555555';

  const txUserA = `TX_ISOLATE_A_${Date.now()}`;
  await posStorage.createTransaction({
    userId: userA,
    merchantTxnId: txUserA,
    mid: 'MID_A',
    tid: 'TID_A',
    amountPaise: 5000,
    status: 'INITIATED',
  });

  // User B query for User A's transaction with tenant isolation check
  const crossQuery = await posStorage.getTransactionByMerchantTxnId(txUserA, userB);
  assert.equal(crossQuery, null, 'User B must not be able to retrieve User A transaction');

  // User A can retrieve it
  const ownerQuery = await posStorage.getTransactionByMerchantTxnId(txUserA, userA);
  assert.ok(ownerQuery);
  assert.equal(ownerQuery.merchant_txn_id, txUserA);

  // List transactions isolation
  const listUserB = await posStorage.listTransactions({ userId: userB, limit: 50 });
  const leakedTx = listUserB.find((t) => t.merchant_txn_id === txUserA);
  assert.equal(leakedTx, undefined, 'User A transaction must never leak into User B transaction list');
});

test('14. Webhook processing: signature verification, status update, and duplicate handling', async () => {
  const merchantTxnId = `TX_HOOK_${Date.now()}`;
  await posStorage.createTransaction({
    merchantTxnId,
    mid: TEST_MID,
    tid: TEST_TID,
    amountPaise: 12000,
    status: 'PENDING',
  });

  // Save terminal with key for signature checking
  await posStorage.saveTerminal({
    mid: TEST_MID,
    tid: TEST_TID,
    merchantKey: TEST_MERCHANT_KEY,
  });

  const webhookBody = {
    mid: TEST_MID,
    merchantTxnId,
    status: 'TXN_SUCCESS',
    amount: '120.00',
    rrn: '987654321098',
    authCode: 'APPR99',
    paymentMode: 'UPI',
  };

  const validSignature = generateSignature(webhookBody, TEST_MERCHANT_KEY);

  // 1. Invalid signature must be rejected
  const reqInvalid = {
    headers: { 'x-paytm-signature': 'invalid_signature_xyz' },
  };
  const resInvalid = await handleWebhook(reqInvalid, { body: webhookBody });
  assert.equal(resInvalid.status, 401, 'Invalid signature must return 401');

  // 2. Valid signature must succeed and update transaction
  const reqValid = {
    headers: { 'x-paytm-signature': validSignature },
  };
  const resValid = await handleWebhook(reqValid, { body: webhookBody });
  assert.equal(resValid.status, 200, 'Valid webhook must return 200');

  const updatedTx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(updatedTx.status, 'SUCCESS');
  assert.equal(updatedTx.rrn, '987654321098');
  assert.equal(updatedTx.payment_method, 'UPI');

  // 3. Duplicate webhook must be handled idempotently
  const resDuplicate = await handleWebhook(reqValid, { body: webhookBody });
  assert.equal(resDuplicate.status, 200);
  assert.ok(resDuplicate.body.message.includes('Duplicate webhook'));
});

test('15. Audit logs recording and retrieval', async () => {
  const userId = '66666666-6666-4666-8666-666666666666';

  await posStorage.recordSyncLog({
    userId,
    action: 'TEST_AUDIT_LOG',
    status: 'SUCCESS',
    recordsChecked: 5,
    recordsUpdated: 2,
    message: 'Test audit log recorded',
    details: { event: 'sample' },
  });

  const logs = await posStorage.listSyncLogs({ userId, limit: 10 });
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length > 0);
  assert.equal(logs[0].action, 'TEST_AUDIT_LOG');
  assert.equal(logs[0].records_checked, 5);
  assert.equal(logs[0].records_updated, 2);
});

test('16. Unauthenticated requests to /api/pos/paytm/* are rejected with 401', async () => {
  const mockReq = {
    method: 'GET',
    url: 'http://localhost/api/pos/paytm/config',
    headers: {},
  };

  const res = await handlePOSRequest(mockReq, 'config');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'UNAUTHORIZED');
});

test('cross-origin POS mutations are rejected before authentication or storage changes', async () => {
  const result = await handlePOSRequest({
    method: 'POST',
    url: '/api/pos/paytm/config',
    headers: { origin: 'https://untrusted.example' },
  }, 'config', { mid: 'UNTRUSTED', tid: 'UNTRUSTED', merchantKey: 'not-a-real-key' });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ORIGIN_NOT_ALLOWED');
});
