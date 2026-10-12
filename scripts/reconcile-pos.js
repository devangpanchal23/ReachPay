import { posStorage, decryptSecret } from '../server/pos/pos-storage.js';
import { paytmPOSProvider } from '../server/pos/paytm-provider.js';
import { phonePePOSProvider } from '../server/pos/phonepe-provider.js';
import { runReconciliationBatch } from '../server/pos/pos-reconciliation.js';

if (!process.env.DATABASE_URL) {
  process.stderr.write('[ReachPay POS] DATABASE_URL is required for durable reconciliation.\n');
  process.exitCode = 1;
} else if (!['reachpay_dev', 'reachpay_test'].includes(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''))) {
  process.stderr.write('[ReachPay POS] Refusing reconciliation outside reachpay_dev or reachpay_test.\n');
  process.exitCode = 1;
} else {
  try {
    const candidates = [
      ...await posStorage.getPendingTransactions({ limit: 500 }),
      ...await posStorage.getSettlementPendingTransactions({ limit: 500 }),
    ];
    for (const transaction of candidates) {
      await posStorage.enqueueReconciliation({ provider: transaction.provider || 'paytm', merchantTxnId: transaction.merchant_txn_id });
    }
    const result = await runReconciliationBatch({
      storage: posStorage,
      queryProvider: async (transaction) => {
        if (transaction.provider === 'phonepe') {
          if (!phonePePOSProvider.isConfigured()) throw new Error('PHONEPE_CONTRACT_OR_CREDENTIALS_REQUIRED');
          const response = await phonePePOSProvider.getTransactionStatus({ mid: transaction.mid, merchantTxnId: transaction.merchant_txn_id });
          return { merchantTxnId: response.transactionId, mid: response.merchantId, amountPaise: response.amountPaise, status: response.status };
        }
        const terminal = await posStorage.getTerminal(transaction.user_id, 'paytm', { mid: transaction.mid, tid: transaction.tid, environment: transaction.environment });
        const merchantKey = terminal?.encrypted_merchant_key
          ? decryptSecret(terminal.encrypted_merchant_key, terminal.encrypted_merchant_key_iv, terminal.encrypted_merchant_key_tag)
          : process.env.PAYTM_POS_MERCHANT_KEY;
        if (!merchantKey) throw new Error('PAYTM_CREDENTIALS_REQUIRED');
        const response = await paytmPOSProvider.getTransactionStatus({
          mid: transaction.mid, tid: transaction.tid, merchantKey,
          environment: transaction.environment, merchantTxnId: transaction.merchant_txn_id,
          cpayId: transaction.cpay_id, txnDate: transaction.initiated_at,
          clientId: terminal?.client_id || 'reachpay',
        });
        const paymentRecord = { merchantTxnId: response.merchantTxnId, mid: transaction.mid, amountPaise: response.amountPaise, status: response.status };
        if (String(response.status).toUpperCase() !== 'SUCCESS') return paymentRecord;
        const settlementAccess = paytmPOSProvider.getSettlementAvailability({ mid: transaction.mid, environment: transaction.environment });
        if (!settlementAccess.enabled) return { ...paymentRecord, settlementStatus: 'SETTLEMENT_PENDING' };
        try {
          const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(transaction.initiated_at));
          const settlement = await paytmPOSProvider.getOrderSettlement({
            mid: transaction.mid, orderId: transaction.merchant_txn_id, transactionDate: date,
            expectedAmountPaise: Number(transaction.amount_paise), environment: transaction.environment,
          });
          return { ...paymentRecord, settlementStatus: settlement.settlementStatus || (settlement.status === 'SETTLEMENT_FAILED' ? 'SETTLEMENT_FAILED' : 'SETTLEMENT_PENDING'), payoutId: settlement.payoutId, settledAt: settlement.settledAt, settledAmountPaise: settlement.settledAmountPaise, settlementVerified: settlement.verified };
        } catch (error) {
          if (error.code === 'PAYTM_SETTLEMENT_RECONCILIATION_MISMATCH') return { ...paymentRecord, settlementMismatch: true };
          return { ...paymentRecord, settlementStatus: 'SETTLEMENT_PENDING' };
        }
      },
    });
    process.stdout.write(`[ReachPay POS] Reconciliation batch: ${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`[ReachPay POS] Reconciliation failed: ${error.code || error.message}\n`);
    process.exitCode = 1;
  }
}
