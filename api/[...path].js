import { randomUUID } from 'node:crypto';
import { currentUser } from '../server/auth-controller.js';

export default async function unavailableFinancialApi(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  let user;
  try { user = await currentUser(request); }
  catch { return response.status(503).json({ error: 'AUTHENTICATION_STORE_UNAVAILABLE', requestId: randomUUID() }); }
  if (!user) return response.status(401).json({ error: 'AUTHENTICATION_REQUIRED', requestId: randomUUID() });
  if (user.status !== 'ACTIVE' || !['owner', 'member', 'approved_member'].includes(user.role) || (user.role !== 'owner' && user.access_status !== 'approved')) {
    return response.status(403).json({ error: 'ACCESS_FORBIDDEN', requestId: randomUUID() });
  }
  return response.status(503).json({
    error: 'SERVICE_NOT_CONFIGURED',
    message: 'This API is not available until its authenticated service and authorized integrations are implemented.',
    requestId: randomUUID(),
  });
}
