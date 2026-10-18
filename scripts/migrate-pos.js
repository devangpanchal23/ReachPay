import process from 'node:process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write('[ReachPay POS DB] DATABASE_URL is required in production.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('[ReachPay POS DB] No DATABASE_URL configured. Local JSON storage is available for development at data/local-pos-store.json.\n');
  }
} else if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) {
  process.stderr.write('[ReachPay POS DB] Refusing to migrate this database target. Use a ReachPay database or a Neon PostgreSQL endpoint.\n');
  process.exitCode = 1;
} else {
  const posSqlUrl = new URL('../server/pos/pos-migration.sql', import.meta.url);
  const pool = new pg.Pool(postgresPoolConfig(process.env.DATABASE_URL, {
    production: process.env.NODE_ENV === 'production',
    max: 1,
    connectionTimeoutMillis: 5000,
  }));

  try {
    const client = await pool.connect();
    try {
      const sql = await readFile(posSqlUrl, 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      process.stdout.write('[ReachPay POS DB] Additive POS schema, webhook event ledger, and reconciliation queue applied successfully.\n');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    process.stderr.write(`[ReachPay POS DB] Migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Check PostgreSQL connectivity, permissions, and schema compatibility.\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
