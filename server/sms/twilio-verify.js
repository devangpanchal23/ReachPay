import process from 'node:process';

const form = (fields) => new URLSearchParams(fields);

export function validateSmsConfiguration(env = process.env) {
  if ((env.SMS_PROVIDER || 'twilio-verify') !== 'twilio-verify') throw Object.assign(new Error('SMS_NOT_CONFIGURED'), { reasonCode: 'SMS_NOT_CONFIGURED' });
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) throw Object.assign(new Error('SMS_NOT_CONFIGURED'), { reasonCode: 'SMS_NOT_CONFIGURED' });
  if (!/^AC[0-9a-fA-F]{32}$/.test(TWILIO_ACCOUNT_SID) || !/^VA[0-9a-fA-F]{32}$/.test(TWILIO_VERIFY_SERVICE_SID) || /^SK/i.test(TWILIO_ACCOUNT_SID)) throw Object.assign(new Error('SMS_CREDENTIALS_INVALID'), { reasonCode: 'SMS_CREDENTIALS_INVALID' });
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, serviceSid: TWILIO_VERIFY_SERVICE_SID };
}

function configuration() { return validateSmsConfiguration(); }

async function twilioRequest(path, fields) {
  const { accountSid, authToken, serviceSid } = configuration();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${path}`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(fields), signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reasonCode = response.status === 429 || data.code === 60203 ? 'SMS_RATE_LIMITED' : 'SMS_PROVIDER_ERROR';
    throw Object.assign(new Error(reasonCode), { reasonCode, providerCode: Number.isInteger(data.code) ? data.code : undefined });
  }
  return data;
}

export async function sendPhoneOtp(phone) {
  const result = await twilioRequest('Verifications', { To: phone, Channel: 'sms' });
  return { status: result.status || 'pending' };
}

export async function checkPhoneOtp(phone, code) {
  const result = await twilioRequest('VerificationCheck', { To: phone, Code: code });
  return result.status === 'approved';
}

export const smsProvider = Object.freeze({ send: sendPhoneOtp, verify: checkPhoneOtp });
