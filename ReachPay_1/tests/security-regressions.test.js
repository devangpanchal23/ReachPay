import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashOtp } from '../server/auth-core.js';
import { localAuthDb } from '../server/auth-storage.js';
import { encryptSecret, posStorage } from '../server/pos/pos-storage.js';
import { rateAllowed } from '../server/auth-controller.js';

test('production verifier rejects the development OTP even when a stale local challenge contains it', async () => {
  const userId = randomUUID();
  const secret = 'production-otp-test-secret-32-bytes';
  await localAuthDb.createEmailChallenge(userId, hashOtp('654321', secret), '123456');
  await localAuthDb.createPhoneChallenge(userId, '+919876543210', '123456');

  assert.equal(await localAuthDb.verifyEmailChallenge(userId, '123456', secret, false), false);
  assert.equal(await localAuthDb.verifyPhoneChallenge(userId, '123456', false), false);
});

test('production secret encryption fails closed when the dedicated POS key is missing', () => {
  const oldMode = process.env.NODE_ENV;
  const oldKey = process.env.PAYTM_POS_ENCRYPTION_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.PAYTM_POS_ENCRYPTION_SECRET;
  try {
    assert.throws(() => encryptSecret('not-a-real-credential'), /POS_ENCRYPTION_SECRET_NOT_CONFIGURED/);
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode;
    if (oldKey === undefined) delete process.env.PAYTM_POS_ENCRYPTION_SECRET; else process.env.PAYTM_POS_ENCRYPTION_SECRET = oldKey;
  }
});

test('local POS transaction reads do not expose ownerless or cross-tenant records', async () => {
  const firstUser = randomUUID();
  const secondUser = randomUUID();
  const merchantTxnId = `SECURITY_${randomUUID()}`;
  const idempotencyKey = `security-${randomUUID()}`;
  await posStorage.createTransaction({
    userId: firstUser,
    merchantTxnId,
    mid: 'TEST_MID',
    tid: 'TEST_TID',
    amountPaise: 500,
    idempotencyKey,
  });

  assert.equal(await posStorage.getTransactionByMerchantTxnId(merchantTxnId, secondUser), null);
  assert.equal(await posStorage.getTransactionByIdempotencyKey(idempotencyKey, secondUser), null);
  assert.equal((await posStorage.listTransactions({ userId: secondUser })).some((tx) => tx.merchant_txn_id === merchantTxnId), false);
});

test('an owner-scoped POS terminal lookup never returns a global or other tenant terminal', async () => {
  const mid = `OWNERLESS_${randomUUID()}`;
  await posStorage.saveTerminal({ mid, tid: 'OWNERLESS_TID', environment: 'staging' });
  assert.equal(await posStorage.getTerminal(randomUUID(), 'paytm'), null);
  assert.equal((await posStorage.getTerminal(null, 'paytm'))?.mid, mid);
});

test('shared rate limiter blocks requests after the configured threshold', async () => {
  const key = `audit-rate-limit:${randomUUID()}`;
  assert.equal(await rateAllowed(key, 1, 1), true);
  assert.equal(await rateAllowed(key, 1, 1), false);
});

test('concurrent local creates with the same idempotency key return one transaction record', async () => {
  const userId = randomUUID();
  const idempotencyKey = `race-${randomUUID()}`;
  const payload = {
    userId,
    mid: 'TEST_MID',
    tid: 'TEST_TID',
    amountPaise: 1234,
    idempotencyKey,
  };
  const [first, second] = await Promise.all([
    posStorage.createTransaction({ ...payload, merchantTxnId: `RACE_${randomUUID()}` }),
    posStorage.createTransaction({ ...payload, merchantTxnId: `RACE_${randomUUID()}` }),
  ]);
  assert.equal(first.merchant_txn_id, second.merchant_txn_id);
  assert.equal(Boolean(first.idempotentReplay) || Boolean(second.idempotentReplay), true);
});

test('nested provider metadata removes card and credential fields before persistence', async () => {
  const tx = await posStorage.createTransaction({
    userId: randomUUID(),
    merchantTxnId: `META_${randomUUID()}`,
    mid: 'TEST_MID',
    tid: 'TEST_TID',
    amountPaise: 100,
    metadata: {
      providerResponse: {
        cardDetails: { cardNumber: '4111111111111111', cardLast4: '1111', cardNetwork: 'VISA' },
        credentials: { merchantKey: 'secret', bearerToken: 'secret' },
        safeCode: 'approved',
      },
    },
  });
  assert.deepEqual(tx.metadata, { providerResponse: { safeCode: 'approved' } });
});
