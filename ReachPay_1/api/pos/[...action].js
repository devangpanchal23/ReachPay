import { handlePOSRequest } from '../../server/pos/pos-controller.js';

export default async function posApi(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  const length = Number(request.headers?.['content-length'] || 0);
  if (length > 32768 || Buffer.byteLength(JSON.stringify(request.body ?? null)) > 32768) {
    return response.status(413).json({ error: 'Request is too large.' });
  }

  const rawUrl = request.url || '';
  const cleanPath = rawUrl.split('?')[0];
  const segments = cleanPath.split('/').filter(Boolean);
  // e.g. /api/pos/paytm/initiate-sale -> segments = ['api', 'pos', 'paytm', 'initiate-sale']
  const providerIdx = segments.findIndex((segment) => ['paytm', 'phonepe'].includes(segment));
  const provider = providerIdx !== -1 ? segments[providerIdx] : 'paytm';
  const action = providerIdx !== -1 && segments[providerIdx + 1] ? segments[providerIdx + 1] : segments.at(-1) || 'config';

  let body = {};
  if (request.body) {
    if (typeof request.body === 'object') {
      body = request.body;
    } else if (typeof request.body === 'string') {
      try {
        body = JSON.parse(request.body);
      } catch {
        const params = new URLSearchParams(request.body);
        body = Object.fromEntries(params.entries());
      }
    }
  }
  const result = await handlePOSRequest(request, action, body, provider);

  for (const [name, value] of Object.entries(result.headers || {})) {
    response.setHeader(name, value);
  }
  return response.status(result.status).json(result.body);
}
