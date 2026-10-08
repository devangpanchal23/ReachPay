import { createHash } from 'node:crypto';

const rateBuckets = new Map();

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function localRateAllowed(key) {
  const now = Date.now(); const recent = (rateBuckets.get(key) || []).filter((time) => now - time < 15 * 60_000);
  if (recent.length >= 5) { rateBuckets.set(key, recent); return false; }
  recent.push(now); rateBuckets.set(key, recent);
  if (rateBuckets.size > 5000) for (const [bucket, values] of rateBuckets) if (!values.length || now - values.at(-1) > 15 * 60_000) rateBuckets.delete(bucket);
  return true;
}

async function rateAllowed(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const digest = createHash('sha256').update(key || 'unknown').digest('hex');
    const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";
    try {
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['EVAL', script, '1', `reachpay-contact:${digest}`, '900']) });
      if (!response.ok) return null;
      const result = await response.json();
      return Number(result.result) <= 5;
    } catch { return null; }
  }
  if (process.env.NODE_ENV === 'production') return null;
  return localRateAllowed(key);
}

function validOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  const configured = process.env.PUBLIC_SITE_URL;
  if (configured) { try { return new URL(origin).origin === new URL(configured).origin; } catch { return false; } }
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  try { return new URL(origin).origin === `${protocol}://${host}`; } catch { return false; }
}

export async function handleContact(request, body, clientKey) {
  if (!validOrigin(request)) return { status: 403, body: { error: 'Request origin could not be verified.' } };
  const allowed = await rateAllowed(clientKey || 'unknown');
  if (allowed === null) return { status: 503, body: { error: 'The secure request service is not configured. Please try again later.' } };
  if (!allowed) return { status: 429, body: { error: 'Too many requests. Please try again later.' } };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: 'Invalid request.' } };
  const fields = new Set(['kind', 'name', 'email', 'company', 'role', 'message', 'consent', 'website']);
  if (Object.keys(body).some((field) => !fields.has(field))) return { status: 400, body: { error: 'Request contains unsupported fields.' } };
  const kind = clean(body.kind, 24);
  const allowedKinds = new Set(['contact', 'careers', 'newsletter']);
  if (!allowedKinds.has(kind)) return { status: 400, body: { error: 'Request type is invalid.' } };
  if (clean(body.website, 500)) return { status: 202, body: { ok: true } };
  const email = clean(body.email, 254);
  const name = clean(body.name, 100);
  const consent = body.consent === 'on' || body.consent === true;
  if (!consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (kind !== 'newsletter' && name.length < 2)) return { status: 400, body: { error: 'Enter a valid name and email and provide consent.' } };
  if (kind === 'newsletter') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.CONTACT_FROM_EMAIL;
    const to = process.env.CONTACT_TO_EMAIL;
    if (!apiKey || !from || !to) return { status: 503, body: { error: 'Newsletter requests are not configured yet. Please try again later.' } };
    const html = `<p>Newsletter interest request</p><p>Email: ${escapeHtml(email)}</p><p>Consent: yes</p>`;
    return sendMail({ apiKey, from, to, subject: 'ReachPay product updates request', replyTo: email, html });
  }
  const message = clean(body.message, 4000);
  const company = clean(body.company, 120);
  const role = clean(body.role, 120);
  if (message.length < 10) return { status: 400, body: { error: 'Please add a little more detail to your message.' } };
  if (kind === 'careers' && !role) return { status: 400, body: { error: 'Please add an area of interest.' } };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !from || !to) return { status: 503, body: { error: 'Contact requests are not configured yet. Please try again later.' } };
  const html = `<h2>${kind === 'careers' ? 'Career interest' : 'Business contact request'}</h2><p>Name: ${escapeHtml(name)}</p><p>Email: ${escapeHtml(email)}</p><p>Company: ${escapeHtml(company || 'Not provided')}</p><p>Area: ${escapeHtml(role || 'Not applicable')}</p><p>Message:</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  return sendMail({ apiKey, from, to, subject: kind === 'careers' ? 'ReachPay career interest' : 'ReachPay website enquiry', replyTo: email, html });
}

async function sendMail({ apiKey, from, to, subject, replyTo, html }) {
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html }) });
    if (!response.ok) return { status: 502, body: { error: 'The message service could not accept this request. Please try again later.' } };
    return { status: 202, body: { ok: true } };
  } catch { return { status: 502, body: { error: 'The message service is temporarily unavailable. Please try again later.' } }; }
}
