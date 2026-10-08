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
  const posProvider = env.POS_PROVIDER === 'phonepe'
    ? 'phonepe-partner-access-required'
    : (env.POS_PROVIDER === 'paytm' || Boolean(env.PAYTM_POS_MID && env.PAYTM_POS_TID) ? 'paytm-integrated' : 'not-configured');
  return {
    PAYIN_PROVIDER: env.PAYIN_PROVIDER && env.PAYIN_PROVIDER !== 'unconfigured' ? 'configured-but-not-integrated' : 'not-configured',
    POS_PROVIDER: posProvider,
    PAYOUT_PROVIDER: env.PAYOUT_PROVIDER && env.PAYOUT_PROVIDER !== 'unconfigured' ? 'configured-but-not-integrated' : 'not-configured',
    BBPS_PROVIDER: env.BBPS_PROVIDER && env.BBPS_PROVIDER !== 'unconfigured' ? 'configured-but-not-integrated' : 'not-configured',
  };
}
