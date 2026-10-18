import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const temp = await mkdtemp(path.join(os.tmpdir(), 'reachpay-webhook-replay-'));
process.env.REACHPAY_POS_STORE_FILE = path.join(temp, 'pos.json');
const { posStorage } = await import('../server/pos/pos-storage.js');
const { runReconciliationBatch } = await import('../server/pos/pos-reconciliation.js');

test('webhook replay and concurrent delivery produce one durable local application', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-a', mid: 'mid-a', tid: 'tid-a', amountPaise: 2300, idempotencyKey: randomUUID(), status: 'PENDING' });
  const event = { provider: 'paytm', eventId: 'sha256:event-1', merchantTxnId, fields: { status: 'SUCCESS', settlement_status: 'SETTLEMENT_PENDING' } };
  const results = await Promise.all([posStorage.applyWebhookEvent(event), posStorage.applyWebhookEvent(event)]);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
  assert.equal((await posStorage.getTransactionByMerchantTxnId(merchantTxnId)).status, 'SUCCESS');
});

test('a webhook event with no transaction is not claimed and can be retried after recovery', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  const eventId = `recovery:${randomUUID()}`;
  await assert.rejects(posStorage.applyWebhookEvent({ provider: 'phonepe', eventId, merchantTxnId, fields: { status: 'SUCCESS' } }), /WEBHOOK_TRANSACTION_NOT_FOUND/);
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-b', mid: 'mid-b', tid: 'tid-b', amountPaise: 900, idempotencyKey: randomUUID(), status: 'PENDING', provider: 'phonepe' });
  const retried = await posStorage.applyWebhookEvent({ provider: 'phonepe', eventId, merchantTxnId, fields: { status: 'SUCCESS' } });
  assert.equal(retried.duplicate, false);
  assert.equal((await posStorage.getTransactionByMerchantTxnId(merchantTxnId)).status, 'SUCCESS');
});

test('terminal transaction state cannot be regressed by a later distinct callback', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-c', mid: 'mid-c', tid: 'tid-c', amountPaise: 100, idempotencyKey: randomUUID(), status: 'SUCCESS' });
  const result = await posStorage.applyWebhookEvent({ provider: 'paytm', eventId: `later:${randomUUID()}`, merchantTxnId, fields: { status: 'FAILED' } });
  assert.equal(result.ignoredTransition, true);
  assert.equal((await posStorage.getTransactionByMerchantTxnId(merchantTxnId)).status, 'SUCCESS');
});

test('reconciliation persists only matching provider payment data', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-d', mid: 'mid-d', tid: 'tid-d', amountPaise: 8800, idempotencyKey: randomUUID(), status: 'PENDING' });
  await posStorage.enqueueReconciliation({ provider: 'paytm', merchantTxnId });
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => ({ merchantTxnId, mid: 'mid-d', amountPaise: 8800, status: 'SUCCESS' }) });
  const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(result.matched, 1);
  assert.equal(tx.status, 'SUCCESS');
  assert.equal(tx.settlement_status, 'SETTLEMENT_PENDING');
  assert.equal(tx.reconciliation_status, 'MATCHED');
});

test('reconciliation mismatch is recorded without promoting the payment', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-e', mid: 'mid-e', tid: 'tid-e', amountPaise: 8800, idempotencyKey: randomUUID(), status: 'PENDING' });
  await posStorage.enqueueReconciliation({ provider: 'paytm', merchantTxnId });
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => ({ merchantTxnId, mid: 'mid-e', amountPaise: 8799, status: 'SUCCESS' }) });
  const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(result.mismatched, 1);
  assert.equal(tx.status, 'PENDING');
  assert.equal(tx.reconciliation_status, 'RECONCILIATION_MISMATCH');
});

test('provider timeout requeues reconciliation with bounded retry delay', async () => {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'user-f', mid: 'mid-f', tid: 'tid-f', amountPaise: 8800, idempotencyKey: randomUUID(), status: 'PENDING' });
  await posStorage.enqueueReconciliation({ provider: 'paytm', merchantTxnId });
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => { throw new Error('PROVIDER_TIMEOUT'); } });
  assert.equal(result.retried, 1);
});

const isolatedPgUrl = process.env.REACHPAY_TEST_DATABASE_URL;
const canUseIsolatedPg = (() => {
  if (!isolatedPgUrl) return false;
  try { return /test/i.test(new URL(isolatedPgUrl).pathname); } catch { return false; }
})();
test('PostgreSQL transaction, settlement persistence, webhook concurrency, rollback, and recovery', { skip: !canUseIsolatedPg && 'Set REACHPAY_TEST_DATABASE_URL to an isolated database with test in its name.' }, async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
  process.env.DATABASE_URL = isolatedPgUrl;
  const { posStorage: isolatedStorage } = await import('../server/pos/pos-storage.js');
  const merchantTxnId = `RP_${randomUUID()}`;
  const idempotencyKey = randomUUID();
  await isolatedStorage.createTransaction({ merchantTxnId, mid: 'TEST_MID', tid: 'TEST_TID', amountPaise: 1234, idempotencyKey, status: 'PENDING' });
  const results = await Promise.all([1, 2].map(() => isolatedStorage.applyWebhookEvent({ provider: 'paytm', eventId: `pg-${idempotencyKey}`, merchantTxnId, fields: { status: 'SUCCESS', settlement_status: 'SETTLEMENT_PENDING' } })));
  assert.equal(results.filter((value) => value.duplicate).length, 1);
  assert.equal(results.filter((value) => !value.duplicate).length, 1);
  await isolatedStorage.updateTransaction(merchantTxnId, {
    settlement_status: 'SETTLED', settlement_payout_id: `payout-${idempotencyKey}`,
    settled_amount_paise: 1200, settled_at: '2026-10-12T06:30:00.000Z',
  });
  const persisted = await isolatedStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(persisted.status, 'SUCCESS');
  assert.equal(persisted.settlement_status, 'SETTLED');
  assert.equal(persisted.settlement_payout_id, `payout-${idempotencyKey}`);
  assert.equal(Number(persisted.settled_amount_paise), 1200);
  assert.equal(new Date(persisted.settled_at).toISOString(), '2026-10-12T06:30:00.000Z');

  const missingTxnId = `RP_${randomUUID()}`;
  const recoveryEventId = `pg-recovery-${randomUUID()}`;
  await assert.rejects(
    isolatedStorage.applyWebhookEvent({ provider: 'paytm', eventId: recoveryEventId, merchantTxnId: missingTxnId, fields: { status: 'SUCCESS' } }),
    (error) => error.code === 'POS_DATABASE_UNAVAILABLE' && error.cause?.message === 'WEBHOOK_TRANSACTION_NOT_FOUND'
  );
  await isolatedStorage.createTransaction({ merchantTxnId: missingTxnId, mid: 'TEST_MID', tid: 'TEST_TID', amountPaise: 4321, idempotencyKey: randomUUID(), status: 'PENDING' });
  const recovered = await isolatedStorage.applyWebhookEvent({ provider: 'paytm', eventId: recoveryEventId, merchantTxnId: missingTxnId, fields: { status: 'SUCCESS' } });
  assert.equal(recovered.duplicate, false, 'failed event claim should roll back and allow recovery');

  const concurrentTxnId = `RP_${randomUUID()}`;
  await isolatedStorage.createTransaction({ merchantTxnId: concurrentTxnId, mid: 'TEST_MID', tid: 'TEST_TID', amountPaise: 500, idempotencyKey: randomUUID(), status: 'PENDING' });
  const concurrentResults = await Promise.all([
    isolatedStorage.applyWebhookEvent({ provider: 'paytm', eventId: `pg-success-${randomUUID()}`, merchantTxnId: concurrentTxnId, fields: { status: 'SUCCESS' } }),
    isolatedStorage.applyWebhookEvent({ provider: 'paytm', eventId: `pg-fail-${randomUUID()}`, merchantTxnId: concurrentTxnId, fields: { status: 'FAILED' } }),
  ]);
  assert.equal(concurrentResults.filter((value) => value.ignoredTransition).length, 1);
  assert.ok(['SUCCESS', 'FAILED'].includes((await isolatedStorage.getTransactionByMerchantTxnId(concurrentTxnId)).status));
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
