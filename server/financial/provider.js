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
  async getServiceCategories() { throw new ProviderNotConfiguredError('Service catalog'); }
  async getBillers() { throw new ProviderNotConfiguredError('Biller catalog'); }
  async getBillerParameters() { throw new ProviderNotConfiguredError('Biller parameters'); }
  async getRechargeOperators() { throw new ProviderNotConfiguredError('Recharge operator discovery'); }
  async getRechargePlans() { throw new ProviderNotConfiguredError('Recharge plans'); }
  async createCollection() { throw new ProviderNotConfiguredError('Pay-in'); }
  async verifyCollection() { throw new ProviderNotConfiguredError('Pay-in verification'); }
  async createPayout() { throw new ProviderNotConfiguredError('Payout'); }
  async registerDmtSender() { throw new ProviderNotConfiguredError('DMT sender registration'); }
  async sendDmtOtp() { throw new ProviderNotConfiguredError('DMT OTP'); }
  async verifyDmtSenderKyc() { throw new ProviderNotConfiguredError('DMT sender KYC'); }
  async quoteTransferFee() { throw new ProviderNotConfiguredError('Transfer fee quote'); }
  async verifyBankAccount() { throw new ProviderNotConfiguredError('Bank account verification'); }
  async submitBankTransfer() { throw new ProviderNotConfiguredError('Bank transfer'); }
  async verifyBankTransfer() { throw new ProviderNotConfiguredError('Bank transfer status'); }
  async reverseBankTransfer() { throw new ProviderNotConfiguredError('Bank transfer reversal'); }
  async reconcileBankTransfer() { throw new ProviderNotConfiguredError('Bank transfer reconciliation'); }
  async inquireBill() { throw new ProviderNotConfiguredError('BBPS inquiry'); }
  async payBill() { throw new ProviderNotConfiguredError('BBPS payment'); }
  async verifyWebhook() { throw new ProviderNotConfiguredError('Webhook verification'); }
  async fetchBill() { throw new ProviderNotConfiguredError('Bill fetch'); }
  async checkServiceTransaction() { throw new ProviderNotConfiguredError('Service transaction inquiry'); }
  async createComplaint() { throw new ProviderNotConfiguredError('Bill payment complaint'); }
  async reverseServiceTransaction() { throw new ProviderNotConfiguredError('Service reversal'); }
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
