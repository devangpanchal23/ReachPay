import { providerStatus } from '../server/financial/provider.js';
import process from 'node:process';

export default function health(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(200).json({
    status: 'safe-mode',
    liveMoneyMovement: false,
    providers: providerStatus(),
    database: process.env.DATABASE_URL ? 'configured-not-connected' : 'not-configured',
  });
}
