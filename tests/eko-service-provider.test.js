import test from 'node:test';
import assert from 'node:assert/strict';
import { EkoBbpsProvider } from '../server/financial/eko-bbps-provider.js';

test('Eko catalog remains unavailable until credentials and onboarding flags are present', async () => {
  let calls = 0;
  const provider = new EkoBbpsProvider({ env: {}, fetchImpl: async () => { calls += 1; throw new Error('network must not be called'); } });
  assert.equal(provider.getIntegrationStatus().catalogStatus, 'CREDENTIALS_REQUIRED');
  assert.equal(provider.isPaymentSubmissionEnabled(), false);
  await assert.rejects(provider.getServiceCategories(), { message: 'EKO_CATALOG_UNAVAILABLE' });
  assert.equal(calls, 0);
});

test('Eko recharge access requires its own approval, independent from BBPS access', async () => {
  const env = { EKO_DEVELOPER_KEY: 'test-key', EKO_ACCESS_KEY: 'test-access', EKO_INITIATOR_ID: 'initiator', EKO_USER_CODE: 'agent', EKO_ONBOARDING_CONFIRMED: 'true', EKO_BBPS_APPROVED: 'true' };
  const provider = new EkoBbpsProvider({ env, fetchImpl: async () => { throw new Error('network must not be called'); } });
  assert.equal(provider.isBbpsConfigured(), true);
  assert.equal(provider.isRechargeConfigured(), false);
  await assert.rejects(provider.getRechargeOperators('9876543210'), { message: 'EKO_CATALOG_UNAVAILABLE' });
  assert.equal(provider.isPaymentSubmissionEnabled(), false);
});

test('Eko production cannot reuse UAT credentials or approvals', async () => {
  const env = { EKO_API_ENV:'production',EKO_DEVELOPER_KEY:'uat-key',EKO_ACCESS_KEY:'uat-access',EKO_INITIATOR_ID:'uat-initiator',EKO_USER_CODE:'uat-agent',EKO_ONBOARDING_CONFIRMED:'true',EKO_BBPS_APPROVED:'true' };
  let calls=0;
  const provider = new EkoBbpsProvider({ env, fetchImpl: async () => { calls+=1; throw new Error('network must not be called'); } });
  assert.equal(provider.getIntegrationStatus().catalogStatus,'CREDENTIALS_REQUIRED');
  assert.equal(provider.isBbpsConfigured(),false);
  await assert.rejects(provider.getCategories(),{message:'EKO_CATALOG_UNAVAILABLE'});
  assert.equal(calls,0);
});

test('Eko biller and recharge inputs are bounded before URL construction', async () => {
  const provider = new EkoBbpsProvider({ env: {}, fetchImpl: async () => { throw new Error('network must not be called'); } });
  assert.throws(() => provider.getBillerParameters('../escape'), { message: 'INVALID_PROVIDER_BILLER_ID' });
  assert.throws(() => provider.getRechargeOperatorAndCircle('123'), { message: 'INVALID_RECHARGE_MOBILE' });
  assert.throws(() => provider.getRechargePlans('9876543210', 'bad/code', 'circle'), { message: 'INVALID_RECHARGE_PLAN_QUERY' });
  await assert.rejects(provider.submitPayment(), { message: 'PAYMENT_SUBMISSION_DISABLED_POS_FUNDING_NOT_AUTHORIZED' });
});
