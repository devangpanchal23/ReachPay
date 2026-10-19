import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTransactionAccess, canManageTeam, memberTransition, mayRemoveAccount, mayAssignOwner, resolveEffectiveRole, hasCompletedLoginVerification } from '../server/rbac-policy.js';
import { handlePOSRequest } from '../server/pos/pos-controller.js';
import unavailableFinancialApi from '../api/[...path].js';
import { isTransactionPath, canOpenTeamAccessPage, canOpenTransactionPath } from '../src/route-access.js';
import { readFile } from 'node:fs/promises';

const owner = { status: 'ACTIVE', role: 'owner', access_status: 'approved', email_verified_at: 'verified', mobile_verified_at: 'verified' };
const member = { status: 'ACTIVE', role: 'approved_member', access_status: 'approved', email_verified_at: 'verified', mobile_verified_at: 'verified' };

test('transaction access requires both verifications and an active approved role', () => {
  assert.equal(hasTransactionAccess(owner), true);
  assert.equal(hasTransactionAccess({ ...owner, access_status: 'pending' }), true);
  assert.equal(hasTransactionAccess(member), true);
  for (const user of [
    { ...member, access_status: 'pending' },
    { ...member, role: 'limited', access_status: 'revoked' },
    { ...member, role: 'limited', access_status: 'limited' },
    { ...member, role: undefined },
    { ...member, role: 'administrator' },
    { ...owner, status: 'LOCKED' },
  ]) assert.equal(hasTransactionAccess(user), false);
  assert.equal(hasTransactionAccess({ ...owner, mobile_verified_at: null }), false);
  assert.equal(canManageTeam({ ...owner, mobile_verified_at: null }), false);
});

test('configured verified owner resolves on each request without a membership approval state', () => {
  const resolved = resolveEffectiveRole({ ...owner, email: ' DevangPan23@gmail.com ', email_verified_at: '2026-01-01', access_status: 'pending' }, ' devangpan23@gmail.com ');
  assert.equal(resolved.role, 'owner');
  assert.equal(resolved.access_status, 'approved');
  assert.equal(hasTransactionAccess(resolved), true);
  assert.equal(canOpenTeamAccessPage(resolved), true);
  assert.equal(hasCompletedLoginVerification({ ...resolved, mobile_verified_at: 'verified' }), true);
  assert.equal(hasCompletedLoginVerification({ ...resolved, mobile_verified_at: null }), false);
  for (const path of ['/dashboard/pos-wallet', '/dmt', '/bbps', '/banking']) {
    assert.equal(canOpenTransactionPath(path, resolved), true);
  }
});

test('the unique stored owner retains access if OWNER_EMAIL is missing or changed', () => {
  for (const configuredEmail of ['', 'new-owner@example.test']) {
    const resolved = resolveEffectiveRole({ ...owner, email: 'current-owner@example.test' }, configuredEmail, false);
    assert.equal(resolved.role, 'owner');
    assert.equal(hasTransactionAccess(resolved), true);
    assert.equal(canManageTeam(resolved), true);
  }
  assert.equal(resolveEffectiveRole({ ...owner, email: 'current-owner@example.test' }, '', true).role, 'limited');
});

test('unverified, conflicting, non-owner, pending, revoked, and limited accounts cannot gain transaction access', () => {
  const account = { ...owner, email: 'devangpan23@gmail.com', email_verified_at: 'verified' };
  const blocked = [
    resolveEffectiveRole({ ...account, email_verified_at: null }, 'devangpan23@gmail.com'),
    resolveEffectiveRole(account, 'devangpan23@gmail.com', true),
    resolveEffectiveRole({ ...account, email: 'other@example.com' }, 'devangpan23@gmail.com', true),
    resolveEffectiveRole({ ...member, email: 'member@example.com', access_status: 'pending' }, 'devangpan23@gmail.com'),
    resolveEffectiveRole({ ...member, email: 'member@example.com', role: 'limited', access_status: 'revoked' }, 'devangpan23@gmail.com'),
    resolveEffectiveRole({ ...member, email: 'member@example.com', role: 'limited' }, 'devangpan23@gmail.com'),
  ];
  for (const user of blocked) {
    assert.equal(hasTransactionAccess(user), false);
    for (const path of ['/dashboard/pos-wallet', '/dmt', '/bbps', '/banking']) {
      assert.equal(canOpenTransactionPath(path, user), false);
    }
  }
  assert.equal(resolveEffectiveRole(account, '', false).role, 'owner');
  const mobilePendingOwner = resolveEffectiveRole({ ...account, mobile_verified_at: null }, 'devangpan23@gmail.com');
  assert.equal(mobilePendingOwner.role, 'limited');
  assert.equal(canManageTeam(mobilePendingOwner), false);
  assert.equal(hasTransactionAccess(mobilePendingOwner), false);
  assert.equal(canOpenTeamAccessPage(blocked[0]), false);
});

test('only owner can manage the team and role changes cannot target the owner', () => {
  assert.equal(canManageTeam(owner), true);
  assert.equal(canManageTeam(member), false);
  assert.deepEqual(memberTransition('approve'), { role: 'approved_member', status: 'approved' });
  assert.deepEqual(memberTransition('revoke'), { role: 'limited', status: 'revoked' });
  assert.equal(memberTransition('approve', 'owner'), null);
  assert.equal(memberTransition('promote', 'limited'), null);
  assert.equal(mayRemoveAccount('owner'), false);
  assert.equal(mayRemoveAccount('approved_member'), true);
  assert.equal(mayAssignOwner(0), true);
  assert.equal(mayAssignOwner(1), false);
});

test('RBAC migration enforces a single protected owner and keeps the owner email server configured', async () => {
  const sql = await readFile(new URL('../database/migrations/002_rbac.sql', import.meta.url), 'utf8');
  assert.match(sql, /customer_accounts_single_owner_idx[\s\S]*WHERE role = 'owner'/);
  assert.match(sql, /reachpay_protect_owner_account/);
  assert.match(sql, /email_verified_at IS NOT NULL AND status='ACTIVE'/);
  assert.match(sql, /OWNER_EMAIL/);
});

test('auth schema checker validates the owner index from its PostgreSQL definition', async () => {
  const checker = await readFile(new URL('../scripts/check-auth-schema.js', import.meta.url), 'utf8');
  assert.match(checker, /pg_get_indexdef\(i\.indexrelid\)/);
  assert.match(checker, /indisunique[\s\S]*indisvalid/);
  assert.match(checker, /role\\s\*=/);
  assert.match(checker, /'owner'/);
});

test('owner bootstrap migration is repeatable, verified-account-only, and never replaces a second owner', async () => {
  const sql = await readFile(new URL('../database/migrations/003_owner_bootstrap.sql', import.meta.url), 'utf8');
  assert.match(sql, /lower\(btrim\(email\)\) = lower\(btrim\(configured_owner_email\)\)/);
  assert.match(sql, /email_verified_at IS NOT NULL/);
  assert.match(sql, /status = 'ACTIVE'/);
  assert.match(sql, /role = 'owner'[\s\S]*NOT EXISTS \(SELECT 1 FROM customer_accounts WHERE role = 'owner'\)/);
  assert.match(sql, /access_status = 'approved'/);
});

test('direct POS and Vercel transaction calls require a session', async () => {
  assert.equal(isTransactionPath('/dashboard/pos-wallet'), true);
  assert.equal(isTransactionPath('/bank-transfers'), true);
  assert.equal(isTransactionPath('/dashboard/profile'), false);
  assert.equal(canOpenTransactionPath('/dashboard/pos-wallet', null), false);
  assert.equal(canOpenTransactionPath('/dashboard/dmt', { role: 'limited', accessStatus: 'limited' }), false);
  const pos = await handlePOSRequest({ method: 'GET', url: '/api/pos/paytm/transactions', headers: {} }, 'transactions', {}, 'paytm');
  assert.equal(pos.status, 401);
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await unavailableFinancialApi({ headers: {}, method: 'GET' }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'AUTHENTICATION_REQUIRED');
});
