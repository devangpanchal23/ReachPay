import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTransactionAccess, canManageTeam, memberTransition, mayRemoveAccount, mayAssignOwner, resolveEffectiveRole, hasCompletedLoginVerification } from '../server/rbac-policy.js';
import { handlePOSRequest } from '../server/pos/pos-controller.js';
import unavailableFinancialApi from '../api/[...path].js';
import { isTransactionPath, canOpenTeamAccessPage, canOpenTransactionPath } from '../src/route-access.js';
import { readFile } from 'node:fs/promises';
import { hashPassword } from '../server/auth-core.js';
import { performOwnerRoleChange, tryPromoteVerifiedOwner } from '../server/auth-controller.js';
import { localAuthDb } from '../server/auth-storage.js';
import { handleBeneficiaryRequest } from '../server/financial/beneficiaries.js';
import { handleFinancialOperationsRequest } from '../server/financial/operations.js';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const owner = { status: 'ACTIVE', role: 'owner', access_status: 'approved', email_verified_at: 'verified', mobile_verified_at: 'verified' };
const member = { status: 'ACTIVE', role: 'member', access_status: 'approved', email_verified_at: 'verified', mobile_verified_at: 'verified' };

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

test('stored verified owner resolves on each request, configured email does not grant role by itself', () => {
  const resolved = resolveEffectiveRole({ ...owner, email: 'owner@example.test', email_verified_at: '2026-01-01', access_status: 'pending' });
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
  assert.equal(resolveEffectiveRole({ ...owner, email: 'current-owner@example.test' }, '', true).role, 'owner');
});

test('unverified, non-owner, pending, revoked, and limited accounts cannot gain transaction access', () => {
  const account = { ...owner, email: 'devangpan23@gmail.com', email_verified_at: 'verified' };
  const blocked = [
    resolveEffectiveRole({ ...account, email_verified_at: null }, 'devangpan23@gmail.com'),
    resolveEffectiveRole({ ...account, role: 'member', access_status: 'pending' }),
    resolveEffectiveRole({ ...account, role: 'member', email: 'other@example.com', access_status: 'pending' }),
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
  const mobilePendingOwner = resolveEffectiveRole({ ...account, mobile_verified_at: null }, 'owner@example.test');
  assert.equal(mobilePendingOwner.role, 'limited');
  assert.equal(canManageTeam(mobilePendingOwner), false);
  assert.equal(hasTransactionAccess(mobilePendingOwner), false);
  assert.equal(canOpenTeamAccessPage(blocked[0]), false);
});

test('only owner can manage the team and role changes cannot target the owner', () => {
  assert.equal(canManageTeam(owner), true);
  assert.equal(canManageTeam(member), false);
  assert.deepEqual(memberTransition('approve'), { role: 'member', status: 'approved' });
  assert.deepEqual(memberTransition('revoke'), { role: 'member', status: 'revoked' });
  assert.equal(memberTransition('approve', 'owner'), null);
  assert.equal(memberTransition('promote', 'limited'), null);
  assert.equal(mayRemoveAccount('owner'), false);
  assert.equal(mayRemoveAccount('approved_member'), true);
  assert.equal(mayAssignOwner(0), true);
  assert.equal(mayAssignOwner(1), true);
});

test('RBAC migration supports member role and multiple protected owners', async () => {
  const sql = await readFile(new URL('../database/migrations/002_rbac.sql', import.meta.url), 'utf8');
  assert.match(sql, /role IN \('owner', 'member'/);
  assert.match(sql, /DROP INDEX IF EXISTS customer_accounts_single_owner_idx/);
  assert.match(sql, /reachpay_protect_owner_account/);
  assert.match(sql, /email_verified_at IS NOT NULL AND status='ACTIVE'/);
  assert.match(sql, /OWNER_EMAIL/);
});

test('auth schema checker requires multiple-owner schema without the old unique owner index', async () => {
  const checker = await readFile(new URL('../scripts/check-auth-schema.js', import.meta.url), 'utf8');
  assert.match(checker, /customer_accounts_multiple_owner/);
  assert.match(checker, /customer_accounts_single_owner_idx/);
  assert.match(checker, /old_role[\s\S]*new_role/);
});

test('owner bootstrap migration is repeatable, verified-account-only, and permits multiple owners', async () => {
  const sql = await readFile(new URL('../database/migrations/003_owner_bootstrap.sql', import.meta.url), 'utf8');
  assert.match(sql, /lower\(btrim\(email\)\) = lower\(btrim\(configured_owner_email\)\)/);
  assert.match(sql, /email_verified_at IS NOT NULL/);
  assert.match(sql, /status = 'ACTIVE'/);
  assert.match(sql, /role <> 'owner'/);
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

test('member with pending access gets server-side 403 from POS, banking, and financial routes', async () => {
  const keys = ['NODE_ENV', 'VERCEL', 'DATABASE_URL', 'POSTGRES_URL', 'AUTH_REQUIRE_POSTGRES'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  delete process.env.NODE_ENV; delete process.env.VERCEL; delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.AUTH_REQUIRE_POSTGRES;
  try {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 9);
    const user = await localAuthDb.createUser({ name: 'Pending Member', email: `pending-${suffix}@example.test`, mobile: `+919${suffix}`, passwordHash: 'hash', passwordSalt: 'salt', autoVerify: true });
    const token = await localAuthDb.createSession(user.id);
    const req = { method: 'GET', headers: { cookie: `reachpay_session=${encodeURIComponent(token)}` } };
    const pos = await handlePOSRequest({ ...req, url: '/api/pos/paytm/transactions' }, 'transactions', {}, 'paytm');
    const banking = await handleBeneficiaryRequest(req, new URL('https://example.test/api/banking/status'));
    const financial = await handleFinancialOperationsRequest(req, new URL('https://example.test/api/financial/dashboard'));
    assert.equal(pos.status, 403);
    assert.equal(banking.status, 403);
    assert.equal(financial.status, 403);
  } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});

function ownerDb({ actorCredentials, target, ownerCount = 2 } = {}) {
  const calls = [];
  const db = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('SELECT password_hash')) return { rows: actorCredentials ? [actorCredentials] : [] };
    if (sql.includes('SELECT id,email,role,status,email_verified_at')) return { rows: target ? [target] : [] };
    if (sql.includes('SELECT count(*)::int')) return { rows: [{ count: ownerCount }] };
    return { rows: [], rowCount: 1 };
  } };
  return { db, calls };
}

test('non-owner promote and owner self-promotion are rejected', async () => {
  const hash = await hashPassword('correct-owner-password');
  const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
  const target = { id: '22222222-2222-4222-8222-222222222222', email: 'member@example.test', role: 'member', status: 'ACTIVE', email_verified_at: 'verified' };
  const setup = ownerDb({ actorCredentials: { password_hash: hash.hash, password_salt: hash.salt }, target });
  const nonOwner = await performOwnerRoleChange(setup.db, { ...actor, role: 'member' }, 'promote', target.id, 'correct-owner-password', 'rbac-non-owner');
  assert.equal(nonOwner.status, 403);
  const self = await performOwnerRoleChange(setup.db, actor, 'promote', actor.id, 'correct-owner-password', 'rbac-self');
  assert.equal(self.body.reasonCode, 'OWNER_SELF_CHANGE_FORBIDDEN');
});

test('owner promotion checks password and target verification, then records a secret-free audit', async () => {
  const hash = await hashPassword('correct-owner-password');
  const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
  const target = { id: '22222222-2222-4222-8222-222222222222', email: 'member@example.test', role: 'member', status: 'ACTIVE', email_verified_at: 'verified' };
  const credentials = { password_hash: hash.hash, password_salt: hash.salt };
  const wrong = ownerDb({ actorCredentials: credentials, target });
  assert.equal((await performOwnerRoleChange(wrong.db, actor, 'promote', target.id, 'incorrect-password', 'rbac-wrong-password')).body.reasonCode, 'OWNER_PASSWORD_INVALID');
  const unverified = ownerDb({ actorCredentials: credentials, target: { ...target, email_verified_at: null } });
  assert.equal((await performOwnerRoleChange(unverified.db, actor, 'promote', target.id, 'correct-owner-password', 'rbac-unverified')).body.reasonCode, 'OWNER_TARGET_NOT_ELIGIBLE');
  const setup = ownerDb({ actorCredentials: credentials, target });
  const result = await performOwnerRoleChange(setup.db, actor, 'promote', target.id, 'correct-owner-password', 'rbac-audit-test');
  assert.equal(result.status, 200);
  const audit = setup.calls.find(({ sql }) => sql.includes('INSERT INTO rbac_audit_events'));
  assert.deepEqual(audit.values.slice(0, 7), [actor.id, target.id, target.email, 'OWNER_PROMOTED', 'rbac-audit-test', 'member', 'owner']);
  assert.doesNotMatch(JSON.stringify(audit), /correct-owner-password|password_hash|cookie|token|otp/i);
  assert.ok(setup.calls.some(({ sql }) => sql.includes('DELETE FROM customer_sessions')));
});

test('the last owner cannot be demoted', async () => {
  const hash = await hashPassword('correct-owner-password');
  const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' };
  const target = { id: '22222222-2222-4222-8222-222222222222', email: 'owner2@example.test', role: 'owner', status: 'ACTIVE', email_verified_at: 'verified' };
  const setup = ownerDb({ actorCredentials: { password_hash: hash.hash, password_salt: hash.salt }, target, ownerCount: 1 });
  const result = await performOwnerRoleChange(setup.db, actor, 'demote', target.id, 'correct-owner-password', 'rbac-last-owner');
  assert.equal(result.body.reasonCode, 'LAST_OWNER_REQUIRED');
});

test('OWNER_EMAIL bootstrap targets only its configured verified active account', async () => {
  const previous = process.env.OWNER_EMAIL;
  process.env.OWNER_EMAIL = 'bootstrap@example.test';
  const statements = [];
  try {
    await tryPromoteVerifiedOwner({ async query(sql, values) { statements.push({ sql, values }); return { rows: [] }; } }, 'target-user', 'rbac-bootstrap');
    const update = statements.find(({ sql }) => sql.includes("SET role='owner'"));
    assert.equal(update.values[1], 'bootstrap@example.test');
    assert.match(update.sql, /email_verified_at IS NOT NULL AND status='ACTIVE'/);
    assert.doesNotMatch(update.sql, /NOT EXISTS/);
  } finally { if (previous === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = previous; }
});
