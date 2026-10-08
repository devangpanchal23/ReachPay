import http from 'node:http';
import { handleContact } from './contact-handler.js';
import { handleAuth } from './auth-controller.js';
import { providerStatus } from './financial/provider.js';

import { handlePOSRequest } from './pos/pos-controller.js';

if (process.env.NODE_ENV !== 'production' && !process.env.PUBLIC_SITE_URL) process.env.PUBLIC_SITE_URL = 'http://localhost:5173';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const providers = providerStatus();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'safe-mode', liveMoneyMovement: false, providers, database: process.env.DATABASE_URL ? 'postgresql-configured-not-verified' : 'local-persistent-store', authentication: 'ReachPay customer sessions', requestId: req.headers['x-request-id'] || null }));
  }
  if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const action = segments.length > 2 ? segments[2] : (req.method === 'GET' ? 'me' : 'login');
    let body = {};
    if (req.method === 'POST') {
      try {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 8192) {
            res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Request is too large.' }));
          }
        }
        if (raw.trim()) {
          body = JSON.parse(raw);
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Invalid JSON request.' }));
      }
    }
    const result = await handleAuth(req, action, body);
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', ...result.headers });
    return res.end(JSON.stringify(result.body));
  }
  if (url.pathname === '/api/pos' || url.pathname.startsWith('/api/pos/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const providerIndex = segments.findIndex((segment) => ['paytm', 'phonepe'].includes(segment));
    const provider = providerIndex < 0 ? 'paytm' : segments[providerIndex];
    const action = providerIndex < 0 ? 'config' : segments[providerIndex + 1] || 'config';
    let body = {};
    if (req.method === 'POST') {
      try {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 32768) {
            res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: 'Request is too large.' }));
          }
        }
        if (raw.trim()) {
          const contentType = String(req.headers['content-type'] || '').toLowerCase();
          if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(raw);
            body = Object.fromEntries(params.entries());
          } else {
            body = JSON.parse(raw);
          }
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Invalid request body.' }));
      }
    }
    const result = await handlePOSRequest(req, action, body, provider);
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', ...(result.headers || {}) });
    return res.end(JSON.stringify(result.body));
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'SERVICE_NOT_CONFIGURED', message: 'Financial actions remain disabled until database repositories and authorized providers are integrated.' }));
  }
  if (req.method !== 'POST' || url.pathname !== '/api/contact') { res.writeHead(404); return res.end(); }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { res.writeHead(415); return res.end(JSON.stringify({ error: 'JSON content type is required.' })); }
  let raw = '';
  try {
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16_384) { res.writeHead(413); return res.end(JSON.stringify({ error: 'Request is too large.' })); } }
    const result = await handleContact(req, JSON.parse(raw), req.socket.remoteAddress || 'unknown');
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result.body));
  } catch { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'Invalid request.' })); }
});

const port = Number(process.env.PORT || 8788);
server.once('error', (error) => {
  console.error(`[api] Could not listen on 127.0.0.1:${port}: ${error.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`ReachPay local API listening on 127.0.0.1:${port}`));
