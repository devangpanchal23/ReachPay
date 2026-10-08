import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBalanced, formatINR, toPaise } from '../server/financial/money.js';
import { assertTransition, holdPayout } from '../server/financial/states.js';
import { PaymentsProvider, ProviderNotConfiguredError } from '../server/financial/provider.js';

test('converts INR into integer paise and formats with Indian grouping', () => {
  assert.equal(toPaise('100000'), 10_000_000);
  assert.equal(toPaise('1.05'), 105);
  assert.equal(formatINR(10_000_000), '₹1,00,000.00');
  for (const input of ['1.001', '-1', '1e5', '0.99', '']) assert.throws(() => toPaise(input));
});

test('ledger journals accept only balanced integer-paise entries', () => {
  assert.equal(assertBalanced([{ deltaPaise: 1000 }, { deltaPaise: -1000 }]), true);
  assert.throws(() => assertBalanced([{ deltaPaise: 1000 }, { deltaPaise: -999 }]), /not balanced/);
  assert.throws(() => assertBalanced([{ deltaPaise: 1.5 }, { deltaPaise: -1.5 }]));
});

test('payment state machine rejects invalid transitions and requires explicit recovery', () => {
  assert.equal(assertTransition('payin', 'PROCESSING', 'PENDING_POS_CREDIT'), true);
  assert.throws(() => assertTransition('payin', 'FAILED', 'CREDITED'), /Invalid/);
  assert.equal(assertTransition('payin', 'FAILED', 'CREDITED', true), true);
  assert.throws(() => assertTransition('settlement', 'CREATED', 'SUCCESS'), /Invalid/);
});

test('payout hold does not allow an overdraft', () => {
  assert.equal(holdPayout(2500, 10000), 7500);
  assert.throws(() => holdPayout(10001, 10000), /Insufficient/);
});

test('unconfigured payment providers fail closed without fabricating a success', async () => {
  const provider = new PaymentsProvider();
  await assert.rejects(() => provider.createCollection(), ProviderNotConfiguredError);
  await assert.rejects(() => provider.createPayout(), (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.statusCode === 503);
});
