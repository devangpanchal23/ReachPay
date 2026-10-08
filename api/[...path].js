import { randomUUID } from 'node:crypto';

export default function unavailableFinancialApi(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(503).json({
    error: 'SERVICE_NOT_CONFIGURED',
    message: 'This API is not available until its authenticated service and authorized integrations are implemented.',
    requestId: randomUUID(),
  });
}
