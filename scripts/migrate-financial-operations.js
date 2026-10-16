import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const urlText = process.env.DATABASE_URL;
if (!urlText) throw new Error('DATABASE_URL is required.');
const url = new URL(urlText);
const databaseName = url.pathname.replace(/^\//, '');
if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(databaseName)) {
  throw new Error('Refusing to migrate any database except reachpay, reachpay_dev or reachpay_test.');
}

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: urlText, max: 1, connectionTimeoutMillis: 5000 });
try {
  await pool.query('SELECT 1 FROM customer_accounts LIMIT 0');
  await pool.query('SELECT 1 FROM pos_terminals LIMIT 0');
  await pool.query('SELECT 1 FROM financial_beneficiaries LIMIT 0');
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const migration = await fs.readFile(path.join(scriptDirectory, '../server/financial/operations-migration.sql'), 'utf8');
  await pool.query(migration);
  console.log(`Financial operations schema applied to ${databaseName}.`);
} finally {
  await pool.end();
}
