import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySettlement } from '../server/pos/settlement-status.js';

const transaction = { merchant_txn_id: 'rp-1', amount_paise: 5000, status: 'SUCCESS' };
const settled = { orderId: 'rp-1', amountPaise: 5000, status: 'SUCCESS', payoutId: 'payout-1', settledAt: '2026-10-12T10:00:00Z', settledAmountPaise: 4900 };

test('provider-confirmed matching payout is Settled, without implying wallet credit', () => {
  assert.deepEqual(classifySettlement({ transaction, providerRecord: settled }), { status: 'SETTLED', verified: true, payoutId: 'payout-1', settledAt: settled.settledAt, settledAmountPaise: 4900 });
});
test('successful POS payment without payout evidence remains Settlement Pending', () => {
  assert.deepEqual(classifySettlement({ transaction, providerRecord: null }), { status: 'SETTLEMENT_PENDING', verified: false });
});
test('duplicate settlement delivery classifies deterministically', () => {
  assert.deepEqual(classifySettlement({ transaction, providerRecord: settled }), classifySettlement({ transaction, providerRecord: settled }));
});
test('failed payment does not receive a settlement state', () => {
  assert.equal(classifySettlement({ transaction: { ...transaction, status: 'FAILED' }, providerRecord: null }).status, 'NOT_APPLICABLE');
});
test('refund is not falsely represented as settlement', () => {
  assert.equal(classifySettlement({ transaction, providerRecord: { ...settled, status: 'REFUND' } }).status, 'UNKNOWN');
});
test('provider timeout with no evidence stays pending', () => {
  assert.equal(classifySettlement({ transaction, providerRecord: null }).verified, false);
});
test('payout amount or order mismatch is a reconciliation mismatch', () => {
  assert.equal(classifySettlement({ transaction, providerRecord: { ...settled, amountPaise: 4999 } }).status, 'RECONCILIATION_MISMATCH');
  assert.equal(classifySettlement({ transaction, providerRecord: { ...settled, orderId: 'other' } }).status, 'RECONCILIATION_MISMATCH');
});
