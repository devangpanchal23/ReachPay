import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

const urlText = process.env.DATABASE_URL;
if (!urlText) throw new Error('DATABASE_URL is required.');
if (!isAllowedDatabaseUrl(urlText)) throw new Error('Refusing to migrate this database target. Use a ReachPay database or a Neon PostgreSQL endpoint.');

const { Pool } = await import('pg');
const pool = new Pool(postgresPoolConfig(urlText, { production: process.env.NODE_ENV === 'production', max: 1, connectionTimeoutMillis: 5000 }));
try {
  await pool.query('SELECT 1 FROM customer_accounts LIMIT 0');
  await pool.query('SELECT 1 FROM pos_terminals LIMIT 0');
  await pool.query('SELECT 1 FROM financial_beneficiaries LIMIT 0');
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const migration = await fs.readFile(path.join(scriptDirectory, '../server/financial/operations-migration.sql'), 'utf8');
  await pool.query(migration);
  console.log('Financial operations schema applied.');
} catch (error) {
  process.stderr.write(`Financial operations migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Connection details were not printed.\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
