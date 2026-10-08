import process from 'node:process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required to apply ReachPay schemas.\n');
  process.exitCode = 1;
} else {
  const migrations = [
    ['customer authentication', new URL('../server/auth-migration.sql', import.meta.url)],
    ['financial foundation', new URL('../database/migrations/001_financial_core.sql', import.meta.url)],
  ];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [name, path] of migrations) {
      await client.query(await readFile(path, 'utf8'));
      process.stdout.write(`Applied ${name} schema.\n`);
    }
    await client.query('COMMIT');
    process.stdout.write('ReachPay authentication and financial foundation schemas are ready.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    process.stderr.write(`ReachPay schema migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Check database connectivity, PostgreSQL version, and migration permissions.\n`);
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
}
