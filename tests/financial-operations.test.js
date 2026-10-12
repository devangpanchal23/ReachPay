import test from 'node:test';
import assert from 'node:assert/strict';
import { assertServiceTransactionTransition } from '../server/financial/operations.js';

test('financial service state machine requires provider evidence before success', () => {
  assert.equal(assertServiceTransactionTransition('DRAFT', 'VALIDATION_PENDING'), true);
  assert.equal(assertServiceTransactionTransition('VALIDATION_PENDING', 'PROVIDER_UNAVAILABLE'), true);
  assert.throws(() => assertServiceTransactionTransition('READY_FOR_SUBMISSION', 'SUBMITTED'), /PROVIDER_SUBMISSION_EVIDENCE_REQUIRED/);
  assert.throws(() => assertServiceTransactionTransition('PROCESSING', 'SUCCESSFUL'), /PROVIDER_SUCCESS_EVIDENCE_REQUIRED/);
  assert.equal(assertServiceTransactionTransition('PROCESSING', 'SUCCESSFUL', { providerConfirmed: true, providerReference: 'provider-ref' }), true);
  assert.throws(() => assertServiceTransactionTransition('DRAFT', 'SUCCESSFUL'), /INVALID_FINANCIAL_TRANSACTION_TRANSITION/);
});

test('financial service cannot be marked ready without approved provider, funding, and approval', () => {
  assert.throws(() => assertServiceTransactionTransition('AUTHORIZATION_PENDING', 'READY_FOR_SUBMISSION'), /TRANSACTION_SUBMISSION_REQUIREMENTS_NOT_MET/);
  assert.equal(assertServiceTransactionTransition('AUTHORIZATION_PENDING', 'READY_FOR_SUBMISSION', { providerApproved: true, fundingApproved: true, approvalGranted: true }), true);
});
