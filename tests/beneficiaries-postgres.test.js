import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = process.env.REACHPAY_TEST_DATABASE_URL;
const isIsolated = (() => {
  if (!testUrl) return false;
  try { return new URL(testUrl).pathname.replace(/^\//, '') === 'reachpay_test'; } catch { return false; }
})();

test('PostgreSQL beneficiary lifecycle encrypts bank data, enforces owner scope, and never claims verification', { skip: !isIsolated && 'REACHPAY_TEST_DATABASE_URL must point to reachpay_test.' }, async () => {
  process.env.DATABASE_URL = testUrl;
  process.env.AUTH_REQUIRE_POSTGRES = 'true';
  process.env.AUTH_RATE_LIMIT_SECRET ||= 'phase3_integration_test_rate_secret_32_bytes';
  process.env.BENEFICIARY_ENCRYPTION_KEY ||= 'phase3_integration_test_encryption_secret_32_bytes';
  const { Pool } = await import('pg');
  const { hashToken } = await import('../server/auth-core.js');
  const { handleBeneficiaryRequest } = await import('../server/financial/beneficiaries.js');
  const db = new Pool({ connectionString: testUrl, max: 2 });
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const token = randomUUID();
  const otherToken = randomUUID();
  const emailId = randomUUID();
  const mobileSuffix = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  const accountNumber = `91${mobileSuffix}`;
  const request = (method, path, body = {}, session = token) => handleBeneficiaryRequest({
    method,
    headers: { cookie: `reachpay_session=${session}`, origin: 'http://localhost:5173', 'x-request-id': randomUUID() },
  }, new URL(path, 'http://localhost'), body);

  try {
    await db.query(`INSERT INTO customer_accounts(id,name,email,mobile_e164,password_hash,password_salt,status)
      VALUES ($1,'Phase 3 Test',$2,$3,$4,$5,'ACTIVE'),($6,'Phase 3 Other',$7,$8,$4,$5,'ACTIVE')`,
    [userId, `phase3-${emailId}@example.test`, `+1555${mobileSuffix}`, '0'.repeat(128), '0'.repeat(32), otherUserId, `phase3-other-${emailId}@example.test`, `+1666${mobileSuffix}`]);
    await db.query(`INSERT INTO customer_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')`, [hashToken(token), userId, hashToken(otherToken), otherUserId]);

    const invalid = await request('POST', '/api/banking/beneficiaries', { name: 'Test', accountNumber, ifsc: 'INVALID' });
    assert.equal(invalid.status, 400);
    const created = await request('POST', '/api/banking/beneficiaries', { name: 'Vendor Account', accountNumber, ifsc: 'ABCD0123456' });
    assert.equal(created.status, 201);
    assert.equal(created.body.beneficiary.account, `••••${accountNumber.slice(-4)}`);
    assert.equal(created.body.beneficiary.verificationStatus, 'UNVERIFIED');
    assert.equal(JSON.stringify(created.body).includes(accountNumber), false);
    const status = await request('GET', '/api/banking/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.bankAccountVerification, 'unavailable-provider-not-configured');
    assert.equal(status.body.settlementFunding, 'not-established-from-pos-settlement');
    assert.equal(status.body.transfers, 'unavailable-approved-payout-provider-required');
    assert.equal(status.body.bbps, 'unavailable-approved-bill-payment-provider-required');

    const stored = await db.query('SELECT bank_account_ciphertext,bank_account_iv,bank_account_tag,account_fingerprint FROM financial_beneficiaries WHERE id=$1', [created.body.beneficiary.id]);
    assert.notEqual(stored.rows[0].bank_account_ciphertext, Buffer.from(accountNumber).toString('hex'));
    assert.equal(stored.rows[0].bank_account_ciphertext.includes(accountNumber), false);

    const duplicate = await request('POST', '/api/banking/beneficiaries', { name: 'Duplicate', accountNumber, ifsc: 'ABCD0123456' });
    assert.equal(duplicate.status, 409);
    const crossTenant = await request('GET', `/api/banking/beneficiaries/${created.body.beneficiary.id}`, {}, otherToken);
    assert.equal(crossTenant.status, 404);

    const edited = await request('PATCH', `/api/banking/beneficiaries/${created.body.beneficiary.id}`, { name: 'Updated Vendor' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.beneficiary.name, 'Updated Vendor');
    assert.equal(edited.body.beneficiary.verificationStatus, 'UNVERIFIED');

    const listed = await request('GET', '/api/banking/beneficiaries?q=Updated');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.beneficiaries.length, 1);
    assert.equal(listed.body.beneficiaries[0].account, `••••${accountNumber.slice(-4)}`);
    const deactivate = await request('PATCH', `/api/banking/beneficiaries/${created.body.beneficiary.id}`, { action: 'deactivate' });
    assert.equal(deactivate.status, 200);
    assert.equal(deactivate.body.beneficiary.verificationStatus, 'DISABLED');

    const audit = await db.query(`SELECT action FROM financial_audit_logs WHERE actor_user_id=$1 ORDER BY id`, [userId]);
    assert.deepEqual(audit.rows.map((row) => row.action), ['BENEFICIARY_CREATED', 'BENEFICIARY_UPDATED', 'BENEFICIARY_DEACTIVATED']);
  } finally {
    await db.query('DELETE FROM financial_beneficiaries WHERE user_id = ANY($1::uuid[])', [[userId, otherUserId]]).catch(() => {});
    await db.query('DELETE FROM financial_audit_logs WHERE actor_user_id = ANY($1::uuid[])', [[userId, otherUserId]]).catch(() => {});
    await db.query('DELETE FROM customer_sessions WHERE user_id = ANY($1::uuid[])', [[userId, otherUserId]]).catch(() => {});
    await db.query('DELETE FROM customer_accounts WHERE id = ANY($1::uuid[])', [[userId, otherUserId]]).catch(() => {});
    await db.end();
  }
});
