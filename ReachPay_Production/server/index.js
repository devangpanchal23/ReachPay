import http from 'node:http';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { providerStatus } from '../src/integrations/provider.js';

const port = Number(process.env.PORT || 8789);
const server = http.createServer((req, res) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'GET' && req.url === '/api/health') {
    const providers = providerStatus();
    res.writeHead(200).end(JSON.stringify({ status: 'safe-mode', liveMoneyMovement: false, providers, database: process.env.DATABASE_URL ? 'configured-not-connected' : 'not-configured', authentication: process.env.AUTH_ISSUER && process.env.AUTH_AUDIENCE ? 'configured-not-integrated' : 'not-configured', requestId }));
    return;
  }
  if (req.url?.startsWith('/api/')) {
    res.writeHead(503).end(JSON.stringify({ error: 'SERVICE_NOT_CONFIGURED', message: 'Financial actions are disabled until identity, a transactional database, and authorized providers are integrated.', requestId }));
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: 'NOT_FOUND', requestId }));
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`ReachPay safe-mode API listening at http://127.0.0.1:${port}\n`));
