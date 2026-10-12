import { createHmac, randomUUID } from 'node:crypto';

const SETTLEMENT_ORDER_DETAIL_URL = 'https://secure.paytmpayments.com/merchant-settlement/SettlementTransactionDetail';

function toPaise(value) {
  const amount = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [rupees, fraction = ''] = amount.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

function createJwt({ clientSecret, email, issuedAt = Math.floor(Date.now() / 1000) }) {
  const base64url = (value) => Buffer.from(value).toString('base64url');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ email, iss: 'PAYTM', iat: issuedAt }));
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', clientSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export class PaytmSettlementProvider {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 12_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  getConfig() {
    return {
      approved: process.env.PAYTM_SETTLEMENT_API_APPROVED === 'true',
      clientId: process.env.PAYTM_SETTLEMENT_CLIENT_ID || '',
      clientSecret: process.env.PAYTM_SETTLEMENT_CLIENT_SECRET || '',
      merchantId: process.env.PAYTM_SETTLEMENT_MERCHANT_ID || '',
      jwtEmail: process.env.PAYTM_SETTLEMENT_JWT_EMAIL || '',
    };
  }

  getAvailability({ mid, environment } = {}) {
    const config = this.getConfig();
    const ready = config.approved && config.clientId && config.clientSecret && config.merchantId && config.jwtEmail;
    if (!ready) return { enabled: false, status: 'APPROVAL_OR_CREDENTIALS_REQUIRED' };
    if (environment !== 'production') return { enabled: false, status: 'PRODUCTION_API_ONLY' };
    if (String(mid || '') !== config.merchantId) return { enabled: false, status: 'MERCHANT_SCOPE_MISMATCH' };
    return { enabled: true, status: 'READY' };
  }

  async getOrderSettlement({ mid, orderId, transactionDate, expectedAmountPaise, environment }) {
    const availability = this.getAvailability({ mid, environment });
    if (!availability.enabled) {
      const error = new Error(`PAYTM_SETTLEMENT_${availability.status}`);
      error.code = `PAYTM_SETTLEMENT_${availability.status}`;
      throw error;
    }
    if (typeof orderId !== 'string' || !orderId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(transactionDate || ''))
      || !Number.isSafeInteger(expectedAmountPaise) || expectedAmountPaise <= 0) {
      const error = new Error('PAYTM_SETTLEMENT_INVALID_REQUEST');
      error.code = 'PAYTM_SETTLEMENT_INVALID_REQUEST';
      throw error;
    }

    const config = this.getConfig();
    const reqMsgId = `${randomUUID()}${mid}`;
    const request = { request: { head: { reqMsgId }, body: { mid, orderId, transactionDate } } };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(SETTLEMENT_ORDER_DETAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          clientId: config.clientId,
          Authorization: `Bearer ${createJwt({ clientSecret: config.clientSecret, email: config.jwtEmail })}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      const code = error?.name === 'AbortError' ? 'PAYTM_SETTLEMENT_TIMEOUT' : 'PAYTM_SETTLEMENT_PROVIDER_UNAVAILABLE';
      throw Object.assign(new Error(code), { code, cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) throw Object.assign(new Error('PAYTM_SETTLEMENT_INVALID_JWT_OR_PERMISSION'), { code: 'PAYTM_SETTLEMENT_INVALID_JWT_OR_PERMISSION' });
    if (!response.ok) throw Object.assign(new Error('PAYTM_SETTLEMENT_PROVIDER_UNAVAILABLE'), { code: 'PAYTM_SETTLEMENT_PROVIDER_UNAVAILABLE' });
    let payload;
    try { payload = await response.json(); } catch (error) {
      throw Object.assign(new Error('PAYTM_SETTLEMENT_INVALID_RESPONSE'), { code: 'PAYTM_SETTLEMENT_INVALID_RESPONSE', cause: error });
    }
    const head = payload?.head;
    const body = payload?.body;
    if (!head || head.reqMsgId !== reqMsgId || !body || typeof body !== 'object') {
      throw Object.assign(new Error('PAYTM_SETTLEMENT_INVALID_RESPONSE'), { code: 'PAYTM_SETTLEMENT_INVALID_RESPONSE' });
    }
    if (body.resultCode === '10010007') return { merchantTxnId: orderId, mid, status: 'SETTLEMENT_PENDING', verified: true };
    if (body.resultCode !== '00000000' || body.resultStatus !== 'S') {
      throw Object.assign(new Error('PAYTM_SETTLEMENT_PROVIDER_REJECTED'), { code: 'PAYTM_SETTLEMENT_PROVIDER_REJECTED' });
    }
    const grossAmountPaise = toPaise(body.amount);
    if (body.orderId !== orderId || body.originalMid !== mid || grossAmountPaise !== expectedAmountPaise
      || body.transactionType !== 'ACQUIRING') {
      throw Object.assign(new Error('PAYTM_SETTLEMENT_RECONCILIATION_MISMATCH'), { code: 'PAYTM_SETTLEMENT_RECONCILIATION_MISMATCH' });
    }
    const status = String(body.status || '').toUpperCase();
    if (status === 'PENDING') return { merchantTxnId: body.orderId, mid: body.originalMid, amountPaise: grossAmountPaise, status: 'SETTLEMENT_PENDING', verified: true };
    if (status === 'FAILURE') return { merchantTxnId: body.orderId, mid: body.originalMid, amountPaise: grossAmountPaise, status: 'SETTLEMENT_FAILED', verified: true };
    if (status !== 'SUCCESS') throw Object.assign(new Error('PAYTM_SETTLEMENT_INVALID_RESPONSE'), { code: 'PAYTM_SETTLEMENT_INVALID_RESPONSE' });

    const settledAmountPaise = toPaise(body.settledAmount);
    const settledAt = body.settledDate;
    if (typeof body.payoutId !== 'string' || !body.payoutId.trim() || settledAmountPaise == null || settledAmountPaise <= 0
      || typeof settledAt !== 'string' || !Number.isFinite(Date.parse(settledAt))) {
      return { merchantTxnId: body.orderId, mid: body.originalMid, amountPaise: grossAmountPaise, status: 'SETTLEMENT_PENDING', verified: true };
    }
    return {
      merchantTxnId: body.orderId,
      mid: body.originalMid,
      amountPaise: grossAmountPaise,
      status: 'SUCCESS',
      settlementStatus: 'SETTLED',
      payoutId: body.payoutId,
      settledAt: new Date(settledAt).toISOString(),
      settledAmountPaise,
      verified: true,
    };
  }
}

export const paytmSettlementProvider = new PaytmSettlementProvider();
