import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Refusing to migrate this database target. Use a ReachPay database or a Neon PostgreSQL endpoint.');

const { Pool } = await import('pg');
const pool = new Pool(postgresPoolConfig(process.env.DATABASE_URL, { production: process.env.NODE_ENV === 'production', max: 1, connectionTimeoutMillis: 5000 }));
try {
  await pool.query('SELECT 1 FROM financial_service_transactions LIMIT 0');
  await pool.query('SELECT 1 FROM financial_beneficiaries LIMIT 0');
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const sql = await fs.readFile(path.join(directory, '../server/financial/transfer-controls-migration.sql'), 'utf8');
  await pool.query(sql);
  console.log('Transfer controls schema applied.');
} catch (error) {
  process.stderr.write(`Transfer controls migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Connection details were not printed.\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
