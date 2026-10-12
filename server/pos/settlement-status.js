/** Normalize settlement evidence without deriving wallet or spendable funds. */
export function classifySettlement({ transaction, providerRecord }) {
  if (!providerRecord) return { status: transaction?.status === 'SUCCESS' ? 'SETTLEMENT_PENDING' : 'NOT_APPLICABLE', verified: false };
  if (!transaction || providerRecord.orderId !== transaction.merchant_txn_id || Number(providerRecord.amountPaise) !== Number(transaction.amount_paise)) {
    return { status: 'RECONCILIATION_MISMATCH', verified: false };
  }
  const providerStatus = String(providerRecord.status || '').toUpperCase();
  if (providerStatus === 'SUCCESS' && providerRecord.payoutId && providerRecord.settledAt) {
    return { status: 'SETTLED', verified: true, payoutId: String(providerRecord.payoutId), settledAt: String(providerRecord.settledAt), settledAmountPaise: Number(providerRecord.settledAmountPaise) };
  }
  if (providerStatus === 'PENDING' || providerStatus === 'SUCCESS') return { status: 'SETTLEMENT_PENDING', verified: false };
  return { status: 'UNKNOWN', verified: false };
}
