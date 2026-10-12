import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const url = new URL(process.env.DATABASE_URL);
const database = url.pathname.replace(/^\//, '');
if (!['reachpay_dev', 'reachpay_test'].includes(database)) throw new Error('Refusing to migrate any database except reachpay_dev or reachpay_test.');

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  await pool.query('SELECT 1 FROM financial_service_transactions LIMIT 0');
  await pool.query('SELECT 1 FROM financial_beneficiaries LIMIT 0');
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sql = await fs.readFile(path.join(directory, '../server/financial/transfer-controls-migration.sql'), 'utf8');
  await pool.query(sql);
  console.log(`Transfer controls schema applied to ${database}.`);
} finally {
  await pool.end();
}
