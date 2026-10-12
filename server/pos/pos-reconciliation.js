/** Process a bounded, retryable reconciliation batch using an authorized provider lookup. */
export async function runReconciliationBatch({ storage, queryProvider, limit = 20, now = Date.now }) {
  const jobs = await storage.claimReconciliationJobs({ limit });
  const result = { checked: 0, matched: 0, mismatched: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    result.checked++;
    try {
      const transaction = await storage.getTransactionByMerchantTxnId(job.merchant_txn_id);
      if (!transaction) throw new Error('TRANSACTION_NOT_FOUND');
      const providerRecord = await queryProvider(transaction);
      if (providerRecord?.settlementMismatch) {
        await storage.updateTransaction(transaction.merchant_txn_id, { reconciliation_status: 'RECONCILIATION_MISMATCH' });
        await storage.completeReconciliationJob(job.id || job.merchant_txn_id);
        result.mismatched++;
        continue;
      }
      if (!providerRecord || providerRecord.status === 'UNKNOWN' || providerRecord.status === 'PENDING') {
        await storage.retryReconciliationJob(job.id || job.merchant_txn_id, { attempts: job.attempts || 1, errorCode: 'PROVIDER_STATUS_PENDING' });
        result.retried++;
        continue;
      }
      const identityMatches = providerRecord.merchantTxnId === transaction.merchant_txn_id
        && providerRecord.mid === transaction.mid
        && Number(providerRecord.amountPaise) === Number(transaction.amount_paise);
      if (!identityMatches) {
        await storage.updateTransaction(transaction.merchant_txn_id, { reconciliation_status: 'RECONCILIATION_MISMATCH' });
        await storage.completeReconciliationJob(job.id || job.merchant_txn_id);
        result.mismatched++;
        continue;
      }
      const status = String(providerRecord.status).toUpperCase();
      if (!['SUCCESS', 'FAILED', 'REFUNDED'].includes(status)) throw new Error('UNSUPPORTED_PROVIDER_STATE');
      const fields = { status, reconciliation_status: 'MATCHED' };
      if (status === 'SUCCESS') fields.settlement_status = transaction.settlement_status === 'SETTLED' ? 'SETTLED' : 'SETTLEMENT_PENDING';
      if (status === 'REFUNDED') {
        fields.refund_status = 'REFUNDED';
        if (Number.isSafeInteger(providerRecord.refundedAmountPaise)) fields.refunded_amount_paise = providerRecord.refundedAmountPaise;
      }
      if (providerRecord.settlementStatus === 'SETTLED' && providerRecord.settlementVerified === true
        && providerRecord.payoutId && providerRecord.settledAt && Number.isFinite(Date.parse(providerRecord.settledAt))
        && Number.isSafeInteger(providerRecord.settledAmountPaise) && providerRecord.settledAmountPaise > 0) {
        fields.settlement_status = 'SETTLED';
        fields.settlement_payout_id = String(providerRecord.payoutId);
        fields.settled_at = String(providerRecord.settledAt);
        fields.settled_amount_paise = providerRecord.settledAmountPaise;
      }
      if (providerRecord.settlementStatus === 'SETTLEMENT_FAILED') fields.settlement_status = 'SETTLEMENT_FAILED';
      await storage.updateTransaction(transaction.merchant_txn_id, fields);
      if (status === 'SUCCESS' && providerRecord.settlementStatus === 'SETTLEMENT_PENDING') {
        await storage.retryReconciliationJob(job.id || job.merchant_txn_id, { attempts: job.attempts || 1, errorCode: 'SETTLEMENT_PENDING' });
        result.retried++;
        continue;
      }
      await storage.completeReconciliationJob(job.id || job.merchant_txn_id);
      result.matched++;
    } catch (error) {
      const attempts = job.attempts || 1;
      await storage.retryReconciliationJob(job.id || job.merchant_txn_id, { attempts, errorCode: error.message || 'PROVIDER_UNAVAILABLE' });
      if (attempts >= 12) result.failed++;
      else result.retried++;
    }
  }
  return { ...result, ranAt: new Date(now()).toISOString() };
}
