/**
 * PaytmPOSProvider - Official Wireless POS / EDC Integration Adapter for ReachPay
 *
 * Implements Paytm's official Wireless EDC/POS API architecture:
 * - Payment Request: POST /edc-integration-service/payment/request
 * - Transaction Status: POST /edc-integration-service/txn/status
 * - Void: POST /ecr/ext/void (merchant/device contract required)
 * - Signature Generation & Verification via PaytmChecksum
 */

import { generateSignature, verifySignature } from './paytm-checksum.js';

const PAYTM_HOSTS = {
  staging: {
    edc: 'https://securegw-stage.paytm.in',
    gateway: 'https://securegw-stage.paytm.in',
    posAlt: 'https://pos-stage.paytm.in',
  },
  production: {
    edc: 'https://securegw.paytm.in',
    gateway: 'https://securegw.paytm.in',
    posAlt: 'https://pos.paytm.in',
  },
};

/**
 * Format date to Paytm EDC expected format: 'YYYY-MM-DD HH:mm:ss'
 */
function formatPaytmDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export class PaytmPOSProvider {
  constructor(options = {}) {
    this.name = 'paytm_pos';
    this.defaultTimeoutMs = options.timeoutMs || 15_000;
    this.maxRetries = options.maxRetries || 2;
  }

  /**
   * Determine base URL for given environment
   */
  getBaseUrl(environment = 'staging') {
    const env = environment === 'production' ? 'production' : 'staging';
    return PAYTM_HOSTS[env].edc;
  }

  /**
   * Safe fetch with timeout and retry
   */
  async _fetchWithRetry(url, options = {}, retries = this.maxRetries) {
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'ReachPay-POS-Gateway/1.0',
            ...(options.headers || {}),
          },
        });
        clearTimeout(timer);
        return response;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const isAbort = err.name === 'AbortError';
        const isNetworkErr = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'fetch failed'].some((code) =>
          String(err.message || '').includes(code)
        );

        if (attempt < retries && (isAbort || isNetworkErr)) {
          const delay = Math.pow(2, attempt) * 400 + Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Test Connection to Paytm EDC service
   * Verifies credentials format and tests network connectivity to Paytm gateway
   */
  async testConnection({ mid, tid, merchantKey, environment = 'staging' }) {
    if (!mid || !tid || !merchantKey) {
      return {
        connected: false,
        status: 'CREDENTIALS_REQUIRED',
        message: 'Paytm MID, TID (Terminal ID), and Merchant Key are required to connect.',
        details: {
          missing: [
            !mid && 'MID (Merchant ID)',
            !tid && 'TID (Terminal ID)',
            !merchantKey && 'Merchant Key',
          ].filter(Boolean),
        },
      };
    }

    // Paytm's public EDC contract has no non-financial health endpoint.
    // Never send a fabricated transaction reference to probe merchant credentials.
    return {
      connected: false,
      status: 'CONFIGURED_NOT_TESTED',
      message: 'Credentials are present. Paytm provides no documented non-financial EDC health check; terminal connectivity is verified only by a real provider transaction/status response.',
      environment,
      details: { mid, tid, terminalState: 'UNVERIFIED' },
    };
  }

  /**
   * Get Terminal Status
   */
  async getTerminalStatus({ mid, tid, merchantKey, environment = 'staging' }) {
    const conn = await this.testConnection({ mid, tid, merchantKey, environment });
    return {
      mid,
      tid,
      environment,
      online: conn.connected,
      status: conn.status,
      message: conn.message,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  /**
   * Initiate POS Sale Payment Request
   * Pushes payment request to physical/wireless Paytm EDC machine
   */
  async initiateSale({
    mid,
    clientId = 'reachpay',
    merchantKey,
    environment = 'staging',
    merchantTxnId,
    amountPaise,
    customerMobile = null,
    notes = '',
  }) {
    if (!mid || !merchantKey) {
      throw new Error('PAYTM_CREDENTIALS_REQUIRED: MID and Merchant Key are required.');
    }

    if (!merchantTxnId) {
      throw new Error('MERCHANT_TXN_ID_REQUIRED');
    }

    const amount = Number(amountPaise);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('INVALID_AMOUNT: Amount must be greater than zero.');
    }

    const txnDate = formatPaytmDate();
    const baseUrl = this.getBaseUrl(environment);

    const bodyData = {
      txnDate,
      merchantTxnId,
      txnAmount: String(amount),
    };
    bodyData.mid = mid;
    // customerMobile is intentionally not transmitted: it is not part of the
    // documented EDC payment request contract.
    void customerMobile;
    void notes;

    const reqHash = generateSignature(Object.values(bodyData).join('|'), merchantKey);

    const payload = {
        head: {
          clientId,
          reqHash,
      },
      body: bodyData,
    };

    const requestUrl = `${baseUrl}/edc-integration-service/payment/request`;

    try {
      const res = await this._fetchWithRetry(requestUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 15_000,
      }, 0);

      // A gateway/server error may arrive after the terminal accepted the
      // request. Keep this ambiguous so reconciliation, not a retry, decides.
      if (res.status >= 500) {
        return {
          success: false,
          status: 'UNKNOWN',
          cpayId: null,
          merchantTxnId,
          amountPaise: Number(amountPaise),
          currency: 'INR',
          resultCode: `HTTP_${res.status}`,
          message: 'Paytm returned an indeterminate server response. Check transaction status before retrying.',
        };
      }

      const responseText = await res.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON response from Paytm EDC: ${responseText.slice(0, 200)}`);
      }

      const resHead = responseJson.head || {};
      const resBody = responseJson.body || responseJson;
      const resultCode = resBody.resultCode || '';
      const resultMsg = resBody.resultMsg || '';
      const resultStatus = resBody.resultStatus || '';

      const cpayId = resBody.cpayId || resBody.paymentRequestId || null;
      const isSuccessPushed = res.ok && resultStatus === 'SUCCESS' && resultCode === 'S' && Boolean(cpayId);

      const normalizedStatus = isSuccessPushed ? 'PENDING' : 'FAILED';

      return {
        success: isSuccessPushed,
        status: normalizedStatus,
        cpayId,
        merchantTxnId,
        amountPaise: amount,
        currency: 'INR',
        rawStatus: resBody.status || resultStatus,
        resultCode,
        resultMsg,
        providerResponse: {
          head: resHead,
          body: { resultStatus, resultCode, cpayId },
        },
        message: isSuccessPushed
          ? 'Payment request sent to Paytm EDC terminal. Customer can now tap, insert card, or scan UPI.'
          : `Terminal payment initiation failed: ${resultMsg || resultCode || 'Unknown error'}`,
      };
    } catch (err) {
      return {
        success: false,
        status: 'UNKNOWN',
        cpayId: null,
        merchantTxnId,
        amountPaise: amount,
        currency: 'INR',
        resultCode: 'COMMUNICATION_ERROR',
        resultMsg: err.message,
        providerResponse: { errorCode: 'COMMUNICATION_ERROR' },
        message: 'Paytm did not return a definitive response. The payment state is unknown and must be reconciled before retrying.',
      };
    }
  }

  /**
   * Query Transaction Status from Paytm EDC
   */
  async getTransactionStatus({
    mid,
    clientId = 'reachpay',
    merchantKey,
    environment = 'staging',
    merchantTxnId,
    cpayId = null,
    txnDate = null,
  }) {
    if (!mid || !merchantKey) {
      throw new Error('PAYTM_CREDENTIALS_REQUIRED');
    }

    if (!merchantTxnId && !cpayId) {
      throw new Error('TRANSACTION_REFERENCE_REQUIRED: Provide merchantTxnId or cpayId.');
    }

    const baseUrl = this.getBaseUrl(environment);
    const dateFormatted = txnDate ? formatPaytmDate(new Date(txnDate)) : formatPaytmDate();

    if (!cpayId) throw new Error('CPAY_ID_REQUIRED: Paytm status lookup requires the provider CPay ID.');
    const statusHashInput = `${cpayId}${mid}${dateFormatted}`;
    const reqHash = generateSignature(statusHashInput, merchantKey);

    const payload = {
      head: {
        clientId,
        reqHash,
      },
    };

    const statusQuery = new URLSearchParams({ cpayId, mid, txnDate: dateFormatted });
    const statusUrl = `${baseUrl}/edc-integration-service/txn/status?${statusQuery}`;

    try {
      const res = await this._fetchWithRetry(statusUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 12_000,
      }, 0);

      const responseText = await res.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON status response: ${responseText.slice(0, 200)}`);
      }

      const resBody = responseJson.body || responseJson;
      const resultInfo = resBody.resultInfo || {};

      const order = Array.isArray(resBody.Orders) ? resBody.Orders[0] : (resBody.Orders || {});
      const rawStatus = String(resBody.txnStatus || order.status || resultInfo.resultStatus || '').toUpperCase();
      const resultCode = String(resultInfo.resultCode || resBody.resultCode || '');
      const resultMsg = resultInfo.resultMsg || resBody.resultMsg || '';

      // Normalize Paytm status
      let normalizedStatus = 'PENDING';
      if (
        rawStatus === 'COMPLETED' ||
        rawStatus === 'SUCCESS' ||
        rawStatus === 'TXN_SUCCESS' ||
        resultCode === '01' ||
        resultCode === '0000'
      ) {
        normalizedStatus = 'SUCCESS';
      } else if (
        rawStatus === 'FAILED' ||
        rawStatus === 'TXN_FAILURE' ||
        rawStatus === 'EXPIRED' ||
        rawStatus === 'TIMEOUT' ||
        resultCode === '227' ||
        resultCode === '334' ||
        resultCode === '335'
      ) {
        normalizedStatus = 'FAILED';
      } else if (rawStatus === 'CANCELLED' || rawStatus === 'TXN_CANCELLED' || rawStatus === 'VOID') {
        normalizedStatus = 'CANCELLED';
      } else if (rawStatus === 'IN_QUEUE' || rawStatus === 'PENDING' || rawStatus === 'PROCESSING') {
        normalizedStatus = 'PENDING';
      }

      // Safe metadata extraction (Never store or return raw card numbers, CVVs, or PINs)
      const paytmTxnId = resBody.paytmTxnId || resBody.txnId || null;
      const bankTxnId = resBody.bankTxnId || null;
      const rrn = resBody.rrn || resBody.retrievalReferenceNumber || null;
      const authCode = resBody.authCode || null;
      const paymentMode = resBody.paymentMode || resBody.paymentModeName || 'POS_EDC';

      const cardDetails = resBody.cardDetails || {};
      const cardLast4 = cardDetails.cardLast4 || cardDetails.maskedCardNo?.slice(-4) || null;
      const cardNetwork = cardDetails.cardNetwork || cardDetails.cardType || null;

      const settledAmountPaise = resBody.amount ?? order.amount
        ? Number(resBody.amount ?? order.amount)
        : null;

      return {
        success: normalizedStatus === 'SUCCESS',
        status: normalizedStatus,
        rawStatus,
        merchantTxnId: resBody.merchantTxnId || merchantTxnId,
        cpayId: resBody.cpayId || cpayId,
        paytmTxnId: paytmTxnId || order.txnID || null,
        bankTxnId,
        rrn,
        authCode,
        paymentMethod: paymentMode,
        cardLast4,
        cardNetwork,
        amountPaise: settledAmountPaise,
        resultCode,
        resultMsg,
        providerResponse: {
          resultInfo,
          status: rawStatus,
          paytmTxnId,
          rrn,
          paymentMode,
          authCode,
        },
      };
    } catch {
      return {
        success: false,
        status: 'PENDING',
        merchantTxnId,
        cpayId,
        message: 'Paytm status could not be retrieved. The payment remains pending until the next reconciliation attempt.',
      };
    }
  }

  /**
   * Cancel or Void payment on EDC terminal (if supported by terminal state)
   */
  async cancelOrRefund({
    mid,
    tid,
    merchantKey,
    environment = 'staging',
    merchantTxnId,
    cpayId = null,
    amountPaise = null,
  }) {
    if (!mid || !merchantKey) {
      throw new Error('PAYTM_CREDENTIALS_REQUIRED');
    }

    const baseUrl = this.getBaseUrl(environment);
    if (!tid) throw new Error('PAYTM_TID_REQUIRED');
    const bodyData = { mid, tid };
    if (cpayId) bodyData.cpayID = cpayId;
    if (merchantTxnId) bodyData.merchantOrderId = merchantTxnId;
    void amountPaise;
    const reqHash = generateSignature(bodyData, merchantKey);

    const payload = {
      head: {
        reqHash,
      },
      body: bodyData,
    };

    const cancelUrl = `${baseUrl}/ecr/ext/void`;

    try {
      const res = await this._fetchWithRetry(cancelUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 12_000,
      }, 0);

      const responseText = await res.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { raw: responseText };
      }

      const resBody = responseJson.body || responseJson;
      const resultInfo = resBody.resultInfo || {};

      return {
        success: res.ok && (resBody.resultStatus === 'SUCCESS' || resBody.resultCode === '0009'),
        status: res.ok && (resBody.resultStatus === 'SUCCESS' || resBody.resultCode === '0009') ? 'CANCELLED' : 'PENDING',
        merchantTxnId,
        cpayId,
        resultCode: resultInfo.resultCode,
        resultMsg: resultInfo.resultMsg,
        providerResponse: { resultStatus: resBody.resultStatus, resultCode: resBody.resultCode, resultMsg: resBody.resultMsg },
      };
    } catch {
      return {
        success: false,
        status: 'ERROR',
        message: 'Paytm cancellation did not return a definitive response. Check transaction status before retrying.',
      };
    }
  }

  /**
   * Synchronize pending transactions
   */
  async syncTransactions({ mid, tid, merchantKey, environment = 'staging', pendingTransactions = [] }) {
    const results = [];

    for (const txn of pendingTransactions) {
      try {
        const statusRes = await this.getTransactionStatus({
          mid,
          tid,
          merchantKey,
          environment,
          merchantTxnId: txn.merchant_txn_id,
          cpayId: txn.cpay_id,
          txnDate: txn.initiated_at || txn.created_at,
        });

        results.push({
          id: txn.id,
          merchantTxnId: txn.merchant_txn_id,
          previousStatus: txn.status,
          currentStatus: statusRes.status,
          updated: statusRes.status !== txn.status,
          details: statusRes,
        });
      } catch (err) {
        results.push({
          id: txn.id,
          merchantTxnId: txn.merchant_txn_id,
          previousStatus: txn.status,
          currentStatus: txn.status,
          updated: false,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Webhook Signature Verification
   */
  verifyWebhook({ rawBody, signature, merchantKey }) {
    if (!signature || !merchantKey) return false;
    try {
      const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      return verifySignature(payload, merchantKey, signature);
    } catch {
      return false;
    }
  }

  /**
   * Balance / Account Balance Adapter
   * Paytm POS / Wireless EDC API architecture is strictly for card/UPI swipes
   * on point-of-sale hardware terminals and does NOT provide merchant wallet
   * or current account balance endpoints.
   *
   * Per strict requirement:
   * Do NOT create fake/mock wallet balances.
   * Return: 'Balance unavailable through the enabled Paytm API.'
   */
  getAccountBalance() {
    return {
      available: false,
      message: 'Balance unavailable through the enabled Paytm API.',
      reason: 'The enabled Paytm Wireless POS/EDC integration scope is dedicated to terminal payment collection and does not expose unrestricted account balance enquiry.',
    };
  }
}

export const paytmPOSProvider = new PaytmPOSProvider();
