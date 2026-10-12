/**
 * Provisional PhonePe Integrated EDC adapter. The public partner material
 * reviewed does not publish an executable API contract. Calls remain gated
 * until the private merchant contract is reviewed and confirmed server-side.
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

  getConfig({ environment } = {}) {
    environment = environment || process.env.PHONEPE_POS_ENV || 'uat';
    const production = environment === 'production';
    return {
      environment,
      baseUrl: production ? 'https://mercury-t2.phonepe.com' : 'https://mercury-uat.phonepe.com/enterprise-sandbox',
      saltKey: production ? process.env.PHONEPE_POS_PRODUCTION_SALT_KEY || '' : process.env.PHONEPE_POS_UAT_SALT_KEY || process.env.PHONEPE_POS_SALT_KEY || '',
      saltIndex: production ? process.env.PHONEPE_POS_PRODUCTION_SALT_INDEX || '' : process.env.PHONEPE_POS_UAT_SALT_INDEX || process.env.PHONEPE_POS_SALT_INDEX || '',
      providerId: production ? process.env.PHONEPE_POS_PRODUCTION_PROVIDER_ID || '' : process.env.PHONEPE_POS_UAT_PROVIDER_ID || process.env.PHONEPE_POS_PROVIDER_ID || '',
      storeId: process.env.PHONEPE_POS_STORE_ID || '',
      callbackUrl: process.env.PHONEPE_POS_CALLBACK_URL || '',
      contractConfirmed: production
        ? process.env.PHONEPE_POS_CONTRACT_CONFIRMED === 'true' && process.env.PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED === 'true'
        : process.env.PHONEPE_POS_UAT_CONTRACT_CONFIRMED === 'true' || process.env.PHONEPE_POS_CONTRACT_CONFIRMED === 'true',
    };
  }

  getIntegrationStatus({ storeId, environment } = {}) {
    const config = this.getConfig({ environment });
    const effectiveStoreId = storeId || config.storeId;
    const credentialsPresent = Boolean(config.saltKey && config.saltIndex && effectiveStoreId);
    const environmentValid = ['uat','staging','production'].includes(config.environment);
    const productionApproved = config.environment !== 'production' || process.env.PHONEPE_POS_PRODUCTION_APPROVED === 'true';
    const configured = credentialsPresent && config.contractConfirmed && environmentValid && productionApproved;
    const status = !environmentValid ? 'UNSUPPORTED_ENVIRONMENT'
      : !productionApproved ? 'PRODUCTION_ACTIVATION_REQUIRED'
        : !config.contractConfirmed ? 'PARTNER_CONTRACT_REQUIRED'
          : configured ? 'CONFIGURED_AWAITING_MERCHANT_ENABLEMENT' : 'CREDENTIALS_REQUIRED';
    return {
      provider: this.name, status, connected: false,
      sandboxTestable: configured && config.environment !== 'production',
      environment: config.environment,
      capabilities: this.capabilities,
      requirements: ['PhonePe Offline Partner onboarding', 'PhonePe-provided private EDC API contract and sandbox details', 'PhonePe-issued EDC credentials and merchant/device enablement', 'Public HTTPS callback URL for event-driven updates', ...(config.environment === 'production' ? ['Separate production contract confirmation and server-side approval after provider UAT and merchant sign-off'] : [])],
      message: configured
        ? 'Credentials are configured. A signed API call is required to verify PhonePe enablement and terminal setup.'
        : !config.contractConfirmed
          ? 'PhonePe partner materials describe onboarding but do not publish an executable EDC API contract. Calls remain disabled until the private merchant contract is reviewed and server-side confirmation is set.'
          : credentialsPresent
            ? 'Credentials are configured, but merchant and terminal enablement still require provider confirmation.'
            : 'Configure PhonePe-issued EDC credentials and obtain merchant and terminal enablement. MID/TID values alone do not authenticate requests.',
    };
  }

  isConfigured({ storeId, environment } = {}) {
    const c = this.getConfig({ environment });
    return Boolean(['uat','staging','production'].includes(c.environment) && (c.environment !== 'production' || process.env.PHONEPE_POS_PRODUCTION_APPROVED === 'true')
      && c.saltKey && c.saltIndex && (storeId || c.storeId) && c.contractConfirmed);
  }

  signature(payload, path, { environment } = {}) {
    const c = this.getConfig({ environment });
    if (!c.saltKey || !c.saltIndex) throw new Error('PHONEPE_CREDENTIALS_REQUIRED');
    const value = payload == null ? '' : (typeof payload === 'string' ? payload : Buffer.from(JSON.stringify(payload)).toString('base64'));
    return `${sha256(`${value}${path}${c.saltKey}`)}###${c.saltIndex}`;
  }

  verifyCallback(response, signature, { environment } = {}) {
    const c = this.getConfig({ environment });
    if (!c.contractConfirmed || !c.saltKey || !c.saltIndex || typeof response !== 'string' || typeof signature !== 'string') return false;
    const [digest, index] = signature.split('###');
    return index === c.saltIndex && constantTimeEqual(digest, sha256(`${response}${c.saltKey}`));
  }

  async request(path, { payload, callbackUrl, storeId, environment } = {}) {
    const c = this.getConfig({ environment });
    if (!c.contractConfirmed) throw new Error('PHONEPE_PARTNER_CONTRACT_REQUIRED');
    if (c.environment === 'production' && process.env.PHONEPE_POS_PRODUCTION_APPROVED !== 'true') throw new Error('PHONEPE_PRODUCTION_ACTIVATION_REQUIRED');
    if (!this.isConfigured({ storeId, environment })) throw new Error(c.environment === 'production' ? 'PHONEPE_PRODUCTION_ACTIVATION_REQUIRED' : 'PHONEPE_CREDENTIALS_REQUIRED');
    const encoded = payload == null ? null : Buffer.from(JSON.stringify(payload)).toString('base64');
    const headers = { 'Content-Type': 'application/json', 'X-VERIFY': this.signature(encoded, path, { environment }) };
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

  async testConnection({ mid, tid, storeId, environment }) {
    if (!this.isConfigured({ storeId, environment })) return this.getIntegrationStatus({ storeId, environment });
    const result = await this.getTransactionStatus({ mid, tid, merchantTxnId: `RP_HEALTH_${Date.now()}`, storeId, environment });
    const authenticated = ['SUCCESS', 'INVALID_TRANSACTION_ID'].includes(result.resultCode);
    return { provider: this.name, connected: authenticated, status: authenticated ? 'API_AUTHENTICATED' : 'CONNECTION_FAILED', message: authenticated ? 'PhonePe authenticated status API responded. This does not prove the terminal has Integrated EDC enabled.' : 'PhonePe status API authentication or merchant configuration failed.', details: { environment: this.getConfig({ environment }).environment, terminalId: tid, result: result.resultCode } };
  }

  async initiateSale({ mid, tid, storeId, environment, merchantTxnId, amountPaise, orderId = merchantTxnId, paymentModes = ['CARD', 'DQR'], callbackUrl }) {
    const c = this.getConfig({ environment });
    const effectiveStoreId = storeId || c.storeId;
    const payload = {
      merchantId: mid, storeId: effectiveStoreId, orderId, terminalId: tid,
      transactionId: merchantTxnId, amount: amountPaise, paymentModes,
      timeAllowedForHandoverToTerminalSeconds: 60,
      integrationMappingType: 'ONE_TO_ONE',
    };
    const result = await this.request(PATHS.init, { payload, callbackUrl, storeId: effectiveStoreId, environment });
    if (!result.httpOk || result.success !== true || result.code !== 'SUCCESS' || result.data?.transactionId !== merchantTxnId) {
      return { success: false, status: !result.httpOk || result.code === 'DUPLICATE_TRANSACTION_ID' ? 'UNKNOWN' : 'FAILED', resultCode: result.code || 'UPSTREAM_ERROR', message: result.message || 'PhonePe did not accept the POS request.' };
    }
    return { success: true, status: 'PENDING', cpayId: merchantTxnId, rawStatus: result.code, resultCode: result.code, message: 'Payment request was accepted by PhonePe EDC.' };
  }

  async getTransactionStatus({ mid, tid, merchantTxnId, storeId, environment }) {
    const path = PATHS.status(mid, merchantTxnId);
    const result = await this.request(path, { storeId, environment });
    if (!result.httpOk || result.success !== true || !result.data || result.data.merchantId !== mid || result.data.transactionId !== merchantTxnId) {
      return { status: 'UNKNOWN', resultCode: result.code || 'INVALID_STATUS_RESPONSE', resultMsg: 'PhonePe status response could not be verified.' };
    }
    const data = result.data;
    if (!tid || !storeId || data.storeId !== storeId || data.terminalId !== tid
      || data.amount == null || !Number.isSafeInteger(Number(data.amount))) {
      return { status: 'UNKNOWN', resultCode: 'STATUS_IDENTITY_OR_AMOUNT_MISMATCH', resultMsg: 'PhonePe status response did not match the configured store, terminal, and amount fields.' };
    }
    const state = String(data.status || '').toUpperCase();
    const mapped = ({ SUCCESS: 'SUCCESS', FAILED: 'FAILED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' })[state] || 'UNKNOWN';
    return { status: mapped, resultCode: data.responseCode || result.code, resultMsg: mapped === 'FAILED' ? 'PhonePe reported a failed POS transaction.' : 'PhonePe transaction status was retrieved.', rrn: data.referenceNumber, paymentMethod: data.paymentMode, rawStatus: state, amountPaise: Number(data.amount), merchantId: data.merchantId, storeId: data.storeId, terminalId: data.terminalId, transactionId: data.transactionId };
  }

  async searchTransaction({ mid, tid, storeId, merchantTxnId, environment }) {
    const path = '/v1/edc/transaction/status';
    const result = await this.request(path, { payload: { merchantId: mid, terminalId: tid, merchantTransactionId: merchantTxnId }, environment });
    const data = Array.isArray(result.data) ? result.data.find((item) => item.merchantId === mid && item.terminalId === tid && item.storeId === storeId && item.transactionId === merchantTxnId) : null;
    if (!result.httpOk || result.success !== true || !data) return null;
    if (data.amount == null || !Number.isSafeInteger(Number(data.amount))) return null;
    return {
      status: ({ SUCCESS: 'SUCCESS', FAILED: 'FAILED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' })[String(data.status).toUpperCase()] || 'UNKNOWN',
      amountPaise: Number(data.amount), rrn: data.referenceNumber, paymentMethod: data.paymentMode,
      merchantId: data.merchantId, storeId: data.storeId, terminalId: data.terminalId, transactionId: data.transactionId,
      resultCode: data.responseCode, rawStatus: data.status,
    };
  }

  async cancelOrRefund() { throw new Error('PHONEPE_EDC_CANCEL_NOT_DOCUMENTED'); }
  async reconcile() { throw new Error('PHONEPE_EDC_RECONCILIATION_REQUIRES_TXN_SEARCH_CONTRACT'); }
}

export const phonePePOSProvider = new PhonePePOSProvider();
