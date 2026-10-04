import process from 'node:process';

/** Contract boundary only. Live operations must not default to a simulated provider. */
export class ProviderNotConfiguredError extends Error {
  constructor(capability) {
    super(`${capability} provider is not configured. No transaction was submitted.`);
    this.code = 'PROVIDER_NOT_CONFIGURED';
    this.statusCode = 503;
  }
}

export class PaymentsProvider {
  async createCollection() { throw new ProviderNotConfiguredError('Pay-in'); }
  async verifyCollection() { throw new ProviderNotConfiguredError('Pay-in verification'); }
  async createPayout() { throw new ProviderNotConfiguredError('Payout'); }
  async inquireBill() { throw new ProviderNotConfiguredError('BBPS inquiry'); }
  async payBill() { throw new ProviderNotConfiguredError('BBPS payment'); }
  async verifyWebhook() { throw new ProviderNotConfiguredError('Webhook verification'); }
}

export function providerStatus(env = process.env) {
  return Object.fromEntries(['PAYIN_PROVIDER', 'POS_PROVIDER', 'PAYOUT_PROVIDER', 'BBPS_PROVIDER'].map((key) => [key, env[key] && env[key] !== 'unconfigured' ? 'configured-but-not-integrated' : 'not-configured']));
}
