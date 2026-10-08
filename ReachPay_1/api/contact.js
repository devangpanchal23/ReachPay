import { handleContact } from '../server/contact-handler.js';

export default async function contact(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ error: 'Method not allowed.' }); }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return response.status(415).json({ error: 'JSON content type is required.' });
  const length = Number(request.headers['content-length'] || 0);
  if (length > 16_384) return response.status(413).json({ error: 'Request is too large.' });
  let body;
  try { body = request.body; } catch { return response.status(400).json({ error: 'Invalid JSON request.' }); }
  const bodyLength = Buffer.byteLength(JSON.stringify(body ?? null));
  if (bodyLength > 16_384) return response.status(413).json({ error: 'Request is too large.' });
  const forwarded = request.headers['x-real-ip'] || request.headers['x-forwarded-for'];
  const key = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || 'unknown').split(',')[0]).trim();
  const result = await handleContact(request, body, key);
  return response.status(result.status).json(result.body);
}
