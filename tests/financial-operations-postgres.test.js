import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.REACHPAY_TEST_DATABASE_URL;
const isolated = (() => { try { return url && new URL(url).pathname.replace(/^\//, '') === 'reachpay_test'; } catch { return false; } })();

test('financial operations schema supports durable idempotency and transaction rollback in PostgreSQL', { skip: !isolated && 'REACHPAY_TEST_DATABASE_URL must target reachpay_test.' }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  const userId = randomUUID();
  const email = `phase61-${userId}@example.test`;
  let reference;
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO customer_accounts(id,name,email,mobile_e164,password_hash,password_salt,status)
      VALUES($1,'Phase 6.1 PostgreSQL test',$2,$3,$4,$5,'ACTIVE')`, [userId, email, `+1999${userId.replaceAll('-', '').slice(0, 10)}`, '0'.repeat(128), '0'.repeat(32)]);
    reference = `RPFS_${userId.replaceAll('-', '').toUpperCase()}`;
    const created = await client.query(`INSERT INTO financial_service_transactions
      (public_reference,user_id,service_type,status,amount_paise,idempotency_key)
      VALUES($1,$2,'BBPS','DRAFT',100,'phase61-idem-${userId}') RETURNING id,status`, [reference,userId]);
    assert.equal(created.rows[0].status, 'DRAFT');
    await client.query(`INSERT INTO financial_service_transaction_history(transaction_id,to_status,actor_user_id,reason_code)
      VALUES($1,'DRAFT',$2,'TEST_ROLLBACK')`, [created.rows[0].id,userId]);
    await client.query('SAVEPOINT duplicate_attempt');
    await assert.rejects(client.query(`INSERT INTO financial_service_transactions
      (public_reference,user_id,service_type,status,amount_paise,idempotency_key)
      VALUES($1,$2,'BBPS','DRAFT',100,'phase61-idem-${userId}')`, [`${reference}_DUPLICATE`,userId]), { code: '23505' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_attempt');
    await client.query('ROLLBACK');
    const absent = await pool.query('SELECT COUNT(*)::int AS n FROM financial_service_transactions WHERE public_reference=$1', [reference]);
    assert.equal(absent.rows[0].n, 0);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
});
