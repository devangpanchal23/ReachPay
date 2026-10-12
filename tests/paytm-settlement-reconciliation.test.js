import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const temp = await mkdtemp(path.join(os.tmpdir(), 'reachpay-paytm-settlement-'));
process.env.REACHPAY_POS_STORE_FILE = path.join(temp, 'pos.json');
const { posStorage } = await import('../server/pos/pos-storage.js');
const { runReconciliationBatch } = await import('../server/pos/pos-reconciliation.js');

async function setup() {
  const merchantTxnId = `RP_${randomUUID()}`;
  await posStorage.createTransaction({ merchantTxnId, userId: 'settlement-test-user', mid: 'test-mid', tid: 'test-tid', amountPaise: 12500, idempotencyKey: randomUUID(), status: 'PENDING' });
  await posStorage.enqueueReconciliation({ provider: 'paytm', merchantTxnId });
  return merchantTxnId;
}

test('verified payout is persisted and payment success stays distinct', async () => {
  const merchantTxnId = await setup();
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => ({
    merchantTxnId, mid: 'test-mid', amountPaise: 12500, status: 'SUCCESS', settlementStatus: 'SETTLED',
    settlementVerified: true, payoutId: 'paytm-payout-1', settledAt: '2026-10-12T06:30:00.000Z', settledAmountPaise: 12350,
  }) });
  const saved = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(result.matched, 1);
  assert.equal(saved.status, 'SUCCESS');
  assert.equal(saved.settlement_status, 'SETTLED');
  assert.equal(saved.settlement_payout_id, 'paytm-payout-1');
  assert.equal(Number(saved.settled_amount_paise), 12350);
  assert.equal(saved.settled_at, '2026-10-12T06:30:00.000Z');
});

test('pending payout updates only settlement state and remains retryable', async () => {
  const merchantTxnId = await setup();
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => ({
    merchantTxnId, mid: 'test-mid', amountPaise: 12500, status: 'SUCCESS', settlementStatus: 'SETTLEMENT_PENDING',
  }) });
  const saved = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(result.retried, 1);
  assert.equal(saved.status, 'SUCCESS');
  assert.equal(saved.settlement_status, 'SETTLEMENT_PENDING');
  assert.equal(saved.settlement_payout_id, null);
});

test('settlement amount mismatch is recorded without applying payout data', async () => {
  const merchantTxnId = await setup();
  const result = await runReconciliationBatch({ storage: posStorage, queryProvider: async () => ({
    merchantTxnId, mid: 'test-mid', amountPaise: 12500, status: 'SUCCESS', settlementMismatch: true,
  }) });
  const saved = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
  assert.equal(result.mismatched, 1);
  assert.equal(saved.status, 'PENDING');
  assert.equal(saved.reconciliation_status, 'RECONCILIATION_MISMATCH');
  assert.equal(saved.settlement_payout_id, null);
});
