import { randomUUID } from 'node:crypto';
import { handleAuth, reportAuthFailure } from '../../server/auth-controller.js';

export default async function auth(request, response) {
  const requestId = request.headers?.['x-request-id'] || randomUUID();
  try {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Request-Id', requestId);
    const length = Number(request.headers?.['content-length'] || 0);
    if (length > 8192 || Buffer.byteLength(JSON.stringify(request.body ?? null)) > 8192) return response.status(413).json({ error: 'Request is too large.' });
    if (request.method === 'POST' && !String(request.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) return response.status(415).json({ error: 'JSON content type is required.' });
    const action = String(request.query?.action || request.url?.split('?')[0].split('/').filter(Boolean).at(-1) || '');
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const result = await handleAuth(request, action, body);
    for (const [name, value] of Object.entries(result.headers || {})) response.setHeader(name, value);
    return response.status(result.status).json(result.body);
  } catch (error) {
    const result = reportAuthFailure(error, requestId, 'vercel_auth_entry');
    for (const [name, value] of Object.entries(result.headers || {})) response.setHeader(name, value);
    return response.status(result.status).json(result.body);
  }
}
