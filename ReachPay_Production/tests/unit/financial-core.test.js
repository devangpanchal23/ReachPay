import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBalanced, formatINR, toPaise } from '../../src/domain/money.js';
import { assertTransition, holdPayout } from '../../src/domain/states.js';
import { PaymentsProvider, ProviderNotConfiguredError } from '../../src/integrations/provider.js';

test('converts INR exactly into integer paise', () => {
  assert.equal(toPaise('100000'), 10_000_000);
  assert.equal(toPaise('1.05'), 105);
  assert.equal(formatINR(10_000_000), '₹1,00,000.00');
  for (const input of ['1.001', '-1', '1e5', '0.99', '']) assert.throws(() => toPaise(input));
});

test('ledger journals must balance in signed integer paise', () => {
  assert.equal(assertBalanced([{ deltaPaise: 1000 }, { deltaPaise: -1000 }]), true);
  assert.throws(() => assertBalanced([{ deltaPaise: 1000 }, { deltaPaise: -999 }]), /not balanced/);
  assert.throws(() => assertBalanced([{ deltaPaise: 1.5 }, { deltaPaise: -1.5 }]));
});

test('state machine rejects invalid money transitions and allows explicit reconciliation recovery', () => {
  assert.equal(assertTransition('payin', 'PROCESSING', 'PENDING_POS_CREDIT'), true);
  assert.throws(() => assertTransition('payin', 'FAILED', 'CREDITED'), /Invalid/);
  assert.equal(assertTransition('payin', 'FAILED', 'CREDITED', true), true);
  assert.throws(() => assertTransition('settlement', 'CREATED', 'SUCCESS'), /Invalid/);
});

test('payout hold rejects overdrafts', () => {
  assert.equal(holdPayout(2500, 10000), 7500);
  assert.throws(() => holdPayout(10001, 10000), /Insufficient/);
});

test('provider boundary fails closed and never synthesizes a success', async () => {
  const provider = new PaymentsProvider();
  await assert.rejects(() => provider.createCollection(), ProviderNotConfiguredError);
  await assert.rejects(() => provider.createPayout(), (error) => error.code === 'PROVIDER_NOT_CONFIGURED' && error.statusCode === 503);
});
