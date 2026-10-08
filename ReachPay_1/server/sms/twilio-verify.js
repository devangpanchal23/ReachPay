import process from 'node:process';

const form = (fields) => new URLSearchParams(fields);

function configuration() {
  if (process.env.SMS_PROVIDER !== 'twilio-verify') throw new Error('Mobile OTP provider is not selected.');
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) throw new Error('Mobile OTP service is not configured.');
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, serviceSid: TWILIO_VERIFY_SERVICE_SID };
}

async function twilioRequest(path, fields) {
  const { accountSid, authToken, serviceSid } = configuration();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${path}`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(fields), signal: AbortSignal.timeout(8000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? 'OTP rate limit reached. Wait before trying again.' : 'The mobile verification provider could not complete this request.');
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
