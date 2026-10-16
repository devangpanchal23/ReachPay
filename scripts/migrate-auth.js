import process from 'node:process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required to apply ReachPay schemas.\n');
  process.exitCode = 1;
} else if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''))) {
  process.stderr.write('Refusing to migrate any database except reachpay, reachpay_dev or reachpay_test.\n');
  process.exitCode = 1;
} else {
  const migrations = [
    ['customer authentication', new URL('../server/auth-migration.sql', import.meta.url)],
    ['role-based access control', new URL('../database/migrations/002_rbac.sql', import.meta.url)],
    ['owner account bootstrap', new URL('../database/migrations/003_owner_bootstrap.sql', import.meta.url)],
  ];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('reachpay.owner_email', $1, true)", [String(process.env.OWNER_EMAIL || '').trim()]);
    for (const [name, path] of migrations) {
      await client.query(await readFile(path, 'utf8'));
      process.stdout.write(`Applied ${name} schema.\n`);
    }
    await client.query('COMMIT');
    process.stdout.write('ReachPay customer authentication schema is ready.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    process.stderr.write(`ReachPay schema migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Check database connectivity, PostgreSQL version, and migration permissions.\n`);
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
}
