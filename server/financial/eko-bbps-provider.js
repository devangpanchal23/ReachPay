import { createHmac } from 'node:crypto';
import { PaymentsProvider } from './provider.js';

const UAT_BASE = 'https://staging.eko.in:25004/ekoapi';
const PRODUCTION_BASE = 'https://api.eko.in:25002/ekoicici';

function config(env = process.env) {
  const apiEnvironment = env.EKO_API_ENV || 'uat';
  const production = apiEnvironment === 'production';
  const prefix = production ? 'EKO_PRODUCTION_' : 'EKO_UAT_';
  const read = (name, legacy = '') => env[`${prefix}${name}`] || (!production && legacy ? env[legacy] : '') || '';
  return {
    production,
    apiEnvironment,
    environmentValid: ['uat','production'].includes(apiEnvironment),
    baseUrl: production ? PRODUCTION_BASE : UAT_BASE,
    developerKey: read('DEVELOPER_KEY','EKO_DEVELOPER_KEY'),
    accessKey: read('ACCESS_KEY','EKO_ACCESS_KEY'),
    initiatorId: read('INITIATOR_ID','EKO_INITIATOR_ID'),
    userCode: read('USER_CODE','EKO_USER_CODE'),
    onboardingConfirmed: (production ? env.EKO_PRODUCTION_ONBOARDING_CONFIRMED : env.EKO_UAT_ONBOARDING_CONFIRMED || env.EKO_ONBOARDING_CONFIRMED) === 'true',
    bbpsApproved: (production ? env.EKO_PRODUCTION_BBPS_APPROVED : env.EKO_UAT_BBPS_APPROVED || env.EKO_BBPS_APPROVED) === 'true',
    rechargeApproved: (production ? env.EKO_PRODUCTION_RECHARGE_APPROVED : env.EKO_UAT_RECHARGE_APPROVED || env.EKO_RECHARGE_APPROVED) === 'true',
    fetchImpl: globalThis.fetch,
  };
}

export class EkoBbpsProvider extends PaymentsProvider {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    super();
    this.fetchImpl = fetchImpl;
    this.env = env;
    this.name = 'eko';
  }

  getIntegrationStatus() {
    const c = config(this.env);
    const missing = [
      ['EKO_DEVELOPER_KEY', c.developerKey], ['EKO_ACCESS_KEY', c.accessKey],
      ['EKO_INITIATOR_ID', c.initiatorId], ['EKO_USER_CODE', c.userCode],
    ].filter(([, value]) => !value).map(([key]) => key);
    if (!c.environmentValid) missing.push('EKO_API_ENV');
    const approved = c.onboardingConfirmed && (c.bbpsApproved || c.rechargeApproved);
    const credentialsReady = missing.length === 0;
    return {
      provider: 'eko',
      environment: c.apiEnvironment,
      catalogStatus: !c.environmentValid ? 'UNSUPPORTED_ENVIRONMENT' : !credentialsReady ? 'CREDENTIALS_REQUIRED' : approved ? 'CONFIGURED_NOT_PROVIDER_VERIFIED' : 'ONBOARDING_APPROVAL_REQUIRED',
      bbps: credentialsReady && c.onboardingConfirmed && c.bbpsApproved ? 'CONFIGURED_NOT_PROVIDER_VERIFIED' : 'SERVICE_ACTIVATION_PENDING',
      recharge: credentialsReady && c.onboardingConfirmed && c.rechargeApproved ? 'CONFIGURED_NOT_PROVIDER_VERIFIED' : 'SERVICE_ACTIVATION_PENDING',
      paymentSubmission: 'DISABLED_POS_FUNDING_NOT_AUTHORIZED',
      missingConfiguration: missing,
      requirements: ['Environment-specific Eko credentials', 'Eko organization KYC and production developer key', 'Eko BBPS/recharge service activation (BBPS service code 53)', 'Approved Eko agent/user code and required India IP allowlisting', 'Written confirmation of the permitted funding source and settlement/reversal model'],
    };
  }

  isCatalogConfigured() {
    const c = config(this.env);
    return Boolean(c.environmentValid && c.developerKey && c.accessKey && c.initiatorId && c.userCode && c.onboardingConfirmed && (c.bbpsApproved || c.rechargeApproved));
  }

  isBbpsConfigured() { const c = config(this.env); return Boolean(this.isCatalogConfigured() && c.bbpsApproved); }
  isRechargeConfigured() { const c = config(this.env); return Boolean(this.isCatalogConfigured() && c.rechargeApproved); }

  isPaymentSubmissionEnabled() { return false; }

  headers() {
    const c = config(this.env);
    if (!this.isCatalogConfigured()) throw new Error('EKO_CATALOG_UNAVAILABLE');
    const timestamp = String(Date.now());
    const encodedKey = Buffer.from(c.accessKey, 'utf8').toString('base64');
    const secretKey = createHmac('sha256', Buffer.from(encodedKey, 'base64')).update(timestamp).digest('base64');
    return { developer_key: c.developerKey, 'secret-key': secretKey, 'secret-key-timestamp': timestamp, accept: 'application/json' };
  }

  async request(path, params = {}, product = 'bbps') {
    if (product === 'recharge' ? !this.isRechargeConfigured() : !this.isBbpsConfigured()) throw new Error('EKO_CATALOG_UNAVAILABLE');
    const c = config(this.env);
    const url = new URL(`${c.baseUrl}${path}`);
    url.searchParams.set('initiator_id', c.initiatorId);
    if (c.userCode && params.user_code !== false) url.searchParams.set('user_code', c.userCode);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && key !== 'user_code') url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await this.fetchImpl(url, { method: 'GET', headers: this.headers(), signal: controller.signal });
      if (!response.ok) throw new Error('EKO_PROVIDER_UNAVAILABLE');
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data) && !Array.isArray(payload.dependent_params)) throw new Error('EKO_INVALID_PROVIDER_RESPONSE');
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('EKO_REQUEST_TIMEOUT', { cause: error });
      throw error;
    } finally { clearTimeout(timeout); }
  }

  getCategories() { return this.request('/v3/customer/payment/bbps/categories'); }
  getBillers({ category, location } = {}) { return this.request('/v3/customer/payment/bbps/operators', { category, location }); }
  getBillerParameters(billerId) {
    if (!/^\d{1,12}$/.test(String(billerId))) throw new Error('INVALID_PROVIDER_BILLER_ID');
    return this.request(`/v3/customer/payment/bbps/operator/${encodeURIComponent(billerId)}/parameters`);
  }
  getRechargeOperatorAndCircle(mobile) {
    if (!/^\d{10}$/.test(String(mobile))) throw new Error('INVALID_RECHARGE_MOBILE');
    return this.request(`/v3/customer/payment/bbps/recharge/${encodeURIComponent(mobile)}/operator`, {}, 'recharge');
  }
  getRechargePlans(mobile, operatorCode, circleId) {
    if (!/^\d{10}$/.test(String(mobile)) || !/^\d{1,12}$/.test(String(operatorCode)) || !/^[A-Za-z0-9_-]{1,32}$/.test(String(circleId))) throw new Error('INVALID_RECHARGE_PLAN_QUERY');
    return this.request(`/v3/customer/payment/bbps/recharge/${encodeURIComponent(mobile)}/operator/plans`, { phone_operator_code: operatorCode, circleid: circleId }, 'recharge');
  }

  getServiceCategories() { return this.getCategories(); }
  getRechargeOperators(mobile) { return this.getRechargeOperatorAndCircle(mobile); }

  async fetchBill() { throw new Error('BILL_FETCH_REQUIRES_PROVIDER_APPROVAL_AND_MERCHANT_LOCATION'); }
  async submitPayment() { throw new Error('PAYMENT_SUBMISSION_DISABLED_POS_FUNDING_NOT_AUTHORIZED'); }
  async transactionStatus() { throw new Error('STATUS_ENQUIRY_REQUIRES_ACTIVATED_PROVIDER_ACCESS'); }
  async lodgeComplaint() { throw new Error('COMPLAINT_API_REQUIRES_VERIFIED_PROVIDER_CONTRACT'); }
  async reversePayment() { throw new Error('REVERSAL_API_REQUIRES_VERIFIED_PROVIDER_CONTRACT'); }
}

export const ekoBbpsProvider = new EkoBbpsProvider();
