import { expireAbandonedTransfers } from '../server/financial/transaction-maintenance.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const databaseUrl = new URL(process.env.DATABASE_URL);
const database = databaseUrl.pathname.replace(/^\//, '');
if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(database)) {
  throw new Error('Refusing to expire transactions outside reachpay, reachpay_dev or reachpay_test.');
}

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const result = await expireAbandonedTransfers(client);
  await client.query('COMMIT');
  console.log(`Expired ${result.expiredCount} abandoned DMT or bank-transfer requests in ${database}.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
