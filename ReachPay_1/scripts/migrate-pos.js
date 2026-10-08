import process from 'node:process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  process.stdout.write('[ReachPay POS DB] No DATABASE_URL configured. Local storage fallback active at data/local-pos-store.json.\n');
} else {
  const posSqlUrl = new URL('../server/pos/pos-migration.sql', import.meta.url);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    try {
      const sql = await readFile(posSqlUrl, 'utf8');
      await client.query(sql);
      process.stdout.write('[ReachPay POS DB] Successfully verified and applied pos_terminals, pos_transactions, and pos_sync_logs tables and indexes.\n');
    } finally {
      client.release();
    }
  } catch (error) {
    process.stderr.write(`[ReachPay POS DB] Migration warning: ${error.message}. Local storage fallback remains ready.\n`);
  } finally {
    await pool.end();
  }
}
