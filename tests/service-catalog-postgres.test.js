import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = process.env.REACHPAY_TEST_DATABASE_URL;
const isolated = (() => { try { return testUrl && new URL(testUrl).pathname.replace(/^\//, '') === 'reachpay_test'; } catch { return false; } })();

test('service catalog and payment evidence schemas enforce references and roll back test fixtures', { timeout: 20000, skip: !isolated && 'REACHPAY_TEST_DATABASE_URL must target reachpay_test.' }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: testUrl, max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000 });
  const client = await pool.connect();
  const userId = randomUUID();
  try {
    await client.query('BEGIN');
    const account = await client.query(`INSERT INTO customer_accounts(id,name,email,mobile_e164,password_hash,password_salt,status)
      VALUES($1,'Phase 6.2 catalog schema fixture',$2,$3,$4,$5,'ACTIVE') RETURNING id`, [userId,`phase62-${userId}@example.test`,`+1999${userId.replaceAll('-','').slice(0,10)}`,'0'.repeat(128),'0'.repeat(32)]);
    assert.equal(account.rowCount, 1);
    const version = await client.query(`INSERT INTO financial_service_catalog_versions(provider,catalog_name,version_number,content_sha256,content)
      VALUES('eko','test-fixture',1,$1,'{"fixture":true}'::jsonb) RETURNING id`, ['a'.repeat(64)]);
    const category = await client.query(`INSERT INTO financial_service_categories(provider,provider_category_id,name,catalog_version_id)
      VALUES('eko','fixture-category','TEST FIXTURE CATEGORY',$1) RETURNING provider_category_id`, [version.rows[0].id]);
    assert.equal(category.rows[0].provider_category_id, 'fixture-category');
    await client.query(`INSERT INTO financial_service_billers(provider,provider_biller_id,category_id,name,supports_bill_fetch,catalog_version_id)
      VALUES('eko','fixture-biller','fixture-category','TEST FIXTURE BILLER',true,$1)`, [version.rows[0].id]);
    await client.query(`INSERT INTO financial_service_biller_parameters(provider,provider_biller_id,parameter_id,parameter_name,parameter_label,parameter_type,catalog_version_id)
      VALUES('eko','fixture-biller','account','account','Account reference','Numeric',$1)`, [version.rows[0].id]);
    const tx = await client.query(`INSERT INTO financial_service_transactions(public_reference,user_id,service_type,provider,status,amount_paise,idempotency_key)
      VALUES('RPFS_TEST_FIXTURE',$1,'BBPS','eko','DRAFT',100,'phase62-fixture-key') RETURNING id`, [userId]);
    const fetchRecord = await client.query(`INSERT INTO financial_service_bill_fetch_records
      (user_id,service_transaction_id,provider,provider_biller_id,client_reference,account_reference_ciphertext,account_reference_iv,account_reference_tag,account_fingerprint,masked_account_reference,provider_status)
      VALUES($1,$2,'eko','fixture-biller','FETCH_TEST_FIXTURE','ciphertext','000000000000000000000000','00000000000000000000000000000000',$3,'••••1234','PENDING') RETURNING id`, [userId,tx.rows[0].id,'b'.repeat(64)]);
    const attempt = await client.query(`INSERT INTO financial_service_payment_attempts(service_transaction_id,attempt_number,provider,client_reference,status,request_sha256)
      VALUES($1,1,'eko','PAY_TEST_FIXTURE','READY',$2) RETURNING id`, [tx.rows[0].id,'c'.repeat(64)]);
    await client.query(`INSERT INTO financial_service_provider_callbacks(provider,provider_event_id,service_transaction_id,signature_verified)
      VALUES('eko','CALLBACK_TEST_FIXTURE',$1,false)`, [tx.rows[0].id]);
    await client.query('SAVEPOINT reject_unverified_receipt');
    await assert.rejects(client.query(`INSERT INTO financial_service_receipts(service_transaction_id,payment_attempt_id,provider,amount_paise,issued_at,verified_provider_response)
      VALUES($1,$2,'eko',100,now(),'{}'::jsonb)`, [tx.rows[0].id,attempt.rows[0].id]), /matching provider-confirmed successful transaction/);
    await client.query('ROLLBACK TO SAVEPOINT reject_unverified_receipt');
    await client.query(`INSERT INTO financial_service_complaints(service_transaction_id,provider,issue_type,status)
      VALUES($1,'eko','TEST_FIXTURE','DRAFT')`, [tx.rows[0].id]);
    assert.ok(fetchRecord.rows[0].id);
    await client.query('ROLLBACK');
    const absent = await client.query(`SELECT COUNT(*)::int AS count FROM financial_service_transactions WHERE public_reference='RPFS_TEST_FIXTURE'`);
    assert.equal(absent.rows[0].count, 0);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
});
