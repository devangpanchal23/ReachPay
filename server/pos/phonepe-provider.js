/**
 * PhonePe Integrated EDC adapter. Contract follows PhonePe's published
 * Integrated EDC Sale, StatusCheck and S2S Callback APIs. Salt credentials are
 * server-only environment secrets; a MID/TID alone never authenticates a call.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const PATHS = Object.freeze({
  init: '/v1/edc/transaction/init',
  status: (merchantId, transactionId) => `/v1/edc/transaction/${encodeURIComponent(merchantId)}/${encodeURIComponent(transactionId)}/status`,
});

function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export class PhonePePOSProvider {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.name = 'phonepe';
    this.fetchImpl = fetchImpl;
    this.capabilities = Object.freeze({
      terminalManagement: 'merchant_onboarding_and_integrated_mode_required',
      healthCheck: true,
      paymentInitiation: true,
      statusPolling: true,
      callbacks: true,
      cancellation: false,
      refunds: false,
      reconciliation: 'transaction_search_api_available_onboarding_required',
    });
  }

  getConfig() {
    const environment = process.env.PHONEPE_POS_ENV || 'uat';
    const production = environment === 'production';
    return {
      environment,
      baseUrl: production ? 'https://mercury-t2.phonepe.com' : 'https://mercury-uat.phonepe.com/enterprise-sandbox',
      saltKey: process.env.PHONEPE_POS_SALT_KEY || '',
      saltIndex: process.env.PHONEPE_POS_SALT_INDEX || '',
      providerId: process.env.PHONEPE_POS_PROVIDER_ID || '',
      storeId: process.env.PHONEPE_POS_STORE_ID || '',
      callbackUrl: process.env.PHONEPE_POS_CALLBACK_URL || '',
    };
  }

  getIntegrationStatus() {
    const config = this.getConfig();
    const configured = Boolean(config.saltKey && config.saltIndex && config.storeId);
    const status = configured ? 'CONFIGURED_AWAITING_MERCHANT_ENABLEMENT' : 'CREDENTIALS_REQUIRED';
    return {
      provider: this.name, status, connected: false,
      sandboxTestable: configured && config.environment !== 'production',
      environment: config.environment,
      capabilities: this.capabilities,
      requirements: ['PhonePe-issued EDC salt key and salt index', 'PhonePe-generated Store ID', 'EDC Sale API enabled for merchant', 'Terminal configured in integrated mode', 'Public HTTPS callback URL for event-driven updates'],
      message: configured
        ? 'Credentials are configured. A signed API call is required to verify PhonePe enablement and terminal setup.'
        : 'PhonePe Integrated EDC is documented, but MID/TID references do not authenticate requests. Configure the PhonePe-issued salt key/index and Store ID on the server, and have PhonePe enable Integrated EDC for this merchant and terminal.',
    };
  }

  isConfigured() {
    const c = this.getConfig();
    return Boolean(c.saltKey && c.saltIndex && c.storeId);
  }

  signature(payload, path) {
    const c = this.getConfig();
    if (!c.saltKey || !c.saltIndex) throw new Error('PHONEPE_CREDENTIALS_REQUIRED');
    const value = payload == null ? '' : (typeof payload === 'string' ? payload : Buffer.from(JSON.stringify(payload)).toString('base64'));
    return `${sha256(`${value}${path}${c.saltKey}`)}###${c.saltIndex}`;
  }

  verifyCallback(response, signature) {
    const c = this.getConfig();
    if (!c.saltKey || !c.saltIndex || typeof response !== 'string' || typeof signature !== 'string') return false;
    const [digest, index] = signature.split('###');
    return index === c.saltIndex && constantTimeEqual(digest, sha256(`${response}${c.saltKey}`));
  }

  async request(path, { payload, callbackUrl } = {}) {
    const c = this.getConfig();
    if (!this.isConfigured()) throw new Error('PHONEPE_CREDENTIALS_REQUIRED');
    const encoded = payload == null ? null : Buffer.from(JSON.stringify(payload)).toString('base64');
    const headers = { 'Content-Type': 'application/json', 'X-VERIFY': this.signature(encoded, path) };
    if (c.providerId) headers['X-PROVIDER-ID'] = c.providerId;
    if (callbackUrl || c.callbackUrl) headers['X-CALLBACK-URL'] = callbackUrl || c.callbackUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await this.fetchImpl(`${c.baseUrl}${path}`, {
        method: 'POST', headers, body: encoded ? JSON.stringify({ request: encoded }) : undefined,
        signal: controller.signal,
      });
      const result = await response.json();
      return { httpOk: response.ok, ...result };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('PHONEPE_REQUEST_TIMEOUT', { cause: error });
      throw new Error('PHONEPE_UPSTREAM_UNAVAILABLE', { cause: error });
    } finally { clearTimeout(timeout); }
  }

  async testConnection({ mid, tid }) {
    if (!this.isConfigured()) return this.getIntegrationStatus();
    const result = await this.getTransactionStatus({ mid, merchantTxnId: `RP_HEALTH_${Date.now()}` });
    const authenticated = ['SUCCESS', 'INVALID_TRANSACTION_ID'].includes(result.resultCode);
    return { provider: this.name, connected: authenticated, status: authenticated ? 'API_AUTHENTICATED' : 'CONNECTION_FAILED', message: authenticated ? 'PhonePe authenticated status API responded. This does not prove the terminal has Integrated EDC enabled.' : 'PhonePe status API authentication or merchant configuration failed.', details: { environment: this.getConfig().environment, terminalId: tid, result: result.resultCode } };
  }

  async initiateSale({ mid, tid, merchantTxnId, amountPaise, orderId = merchantTxnId, paymentModes = ['CARD', 'DQR'], callbackUrl }) {
    const c = this.getConfig();
    const payload = {
      merchantId: mid, storeId: c.storeId, orderId, terminalId: tid,
      transactionId: merchantTxnId, amount: amountPaise, paymentModes,
      timeAllowedForHandoverToTerminalSeconds: 60,
      integrationMappingType: 'ONE_TO_ONE',
    };
    const result = await this.request(PATHS.init, { payload, callbackUrl });
    if (!result.httpOk || result.success !== true || result.code !== 'SUCCESS' || result.data?.transactionId !== merchantTxnId) {
      return { success: false, status: !result.httpOk || result.code === 'DUPLICATE_TRANSACTION_ID' ? 'UNKNOWN' : 'FAILED', resultCode: result.code || 'UPSTREAM_ERROR', message: result.message || 'PhonePe did not accept the POS request.' };
    }
    return { success: true, status: 'PENDING', cpayId: merchantTxnId, rawStatus: result.code, resultCode: result.code, message: result.message || 'Payment request sent to PhonePe EDC terminal.' };
  }

  async getTransactionStatus({ mid, merchantTxnId }) {
    const path = PATHS.status(mid, merchantTxnId);
    const result = await this.request(path);
    if (!result.httpOk || result.success !== true || !result.data || result.data.merchantId !== mid || result.data.transactionId !== merchantTxnId) {
      return { status: 'UNKNOWN', resultCode: result.code || 'INVALID_STATUS_RESPONSE', resultMsg: 'PhonePe status response could not be verified.' };
    }
    const data = result.data;
    const state = String(data.status || '').toUpperCase();
    const mapped = ({ SUCCESS: 'SUCCESS', FAILED: 'FAILED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' })[state] || 'UNKNOWN';
    return { status: mapped, resultCode: data.responseCode || result.code, resultMsg: result.message, rrn: data.referenceNumber, paymentMethod: data.paymentMode, rawStatus: state, amountPaise: Number(data.amount), merchantId: data.merchantId, transactionId: data.transactionId };
  }

  async searchTransaction({ mid, tid, merchantTxnId }) {
    const path = '/v1/edc/transaction/status';
    const result = await this.request(path, { payload: { merchantId: mid, terminalId: tid, merchantTransactionId: merchantTxnId } });
    const data = Array.isArray(result.data) ? result.data.find((item) => item.merchantId === mid && item.transactionId === merchantTxnId) : null;
    if (!result.httpOk || result.success !== true || !data) return null;
    return {
      status: ({ SUCCESS: 'SUCCESS', FAILED: 'FAILED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' })[String(data.status).toUpperCase()] || 'UNKNOWN',
      amountPaise: Number(data.amount), rrn: data.referenceNumber, paymentMethod: data.paymentMode,
      resultCode: data.responseCode, rawStatus: data.status,
    };
  }

  async cancelOrRefund() { throw new Error('PHONEPE_EDC_CANCEL_NOT_DOCUMENTED'); }
  async reconcile() { throw new Error('PHONEPE_EDC_RECONCILIATION_REQUIRES_TXN_SEARCH_CONTRACT'); }
}

export const phonePePOSProvider = new PhonePePOSProvider();
