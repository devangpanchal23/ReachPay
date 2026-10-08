import { paytmPOSProvider } from './paytm-provider.js';
import { phonePePOSProvider } from './phonepe-provider.js';

/** Provider adapters expose the same POS lifecycle surface. */
export const posProviders = Object.freeze({
  paytm: paytmPOSProvider,
  phonepe: phonePePOSProvider,
});

export function getPOSProvider(name = 'paytm') {
  const provider = posProviders[String(name).toLowerCase()];
  if (!provider) throw new Error('POS_PROVIDER_UNSUPPORTED');
  return provider;
}
