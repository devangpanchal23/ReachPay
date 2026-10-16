import { randomUUID } from 'node:crypto';
import { authHealthStatus } from '../server/auth-controller.js';

export default async function health(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const requestId = request.headers?.['x-request-id'] || randomUUID();
  try {
    const status = await authHealthStatus();
    const authReady = status.databaseConnected
      && status.schemaReady
      && status.configuration.ownerEmailConfigured
      && status.configuration.publicSiteUrlConfigured
      && status.configuration.rateLimitSecretConfigured
      && status.configuration.otpSecretConfigured
      && status.configuration.emailOtpConfigured
      && status.configuration.smsOtpConfigured;
    return response.status(authReady ? 200 : 503).json({
      status: authReady ? 'ready' : 'needs-configuration',
      liveMoneyMovement: false,
      requestId,
      services: {
        ...status.configuration,
        databaseConnected: status.databaseConnected,
        authSchemaReady: status.schemaReady,
        ownerAccountVerified: status.ownerAccountVerified,
      },
    });
  } catch {
    return response.status(503).json({
      status: 'needs-configuration',
      liveMoneyMovement: false,
      requestId,
      services: {
        databaseConfigured: false,
        ownerEmailConfigured: false,
        otpSecretConfigured: false,
        databaseConnected: false,
        authSchemaReady: false,
        ownerAccountVerified: false,
        rateLimitSecretConfigured: false,
        emailOtpConfigured: false,
        smsOtpConfigured: false,
        beneficiaryEncryptionConfigured: false,
        publicSiteUrlConfigured: false,
        appOriginConfigured: false,
        upstashConfigured: false,
      },
    });
  }
}
