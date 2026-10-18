import process from 'node:process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required to apply ReachPay schemas.\n');
  process.exitCode = 1;
} else if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) {
  process.stderr.write('Refusing to migrate this database target. Use a ReachPay database or a Neon PostgreSQL endpoint.\n');
  process.exitCode = 1;
} else {
  const migrations = [
    ['customer authentication', new URL('../server/auth-migration.sql', import.meta.url)],
    ['role-based access control', new URL('../database/migrations/002_rbac.sql', import.meta.url)],
    ['owner account bootstrap', new URL('../database/migrations/003_owner_bootstrap.sql', import.meta.url)],
    ['SMS resend limit support', new URL('../database/migrations/004_sms_resend_limits.sql', import.meta.url)],
    ['Auth rate-limit key uniqueness', new URL('../database/migrations/005_auth_rate_limit_key_unique.sql', import.meta.url)],
  ];
  const pool = new pg.Pool(postgresPoolConfig(process.env.DATABASE_URL, { production: process.env.NODE_ENV === 'production', max: 1, connectionTimeoutMillis: 5000 }));
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('reachpay.owner_email', $1, true)", [String(process.env.OWNER_EMAIL || '').trim()]);
    for (const [name, path] of migrations) {
      await client.query(await readFile(path, 'utf8'));
      process.stdout.write(`Applied ${name} schema.\n`);
    }
    await client.query('COMMIT');
    process.stdout.write('ReachPay customer authentication schema is ready.\n');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    process.stderr.write(`ReachPay schema migration failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}. Check database connectivity, PostgreSQL version, and migration permissions.\n`);
    process.exitCode = 1;
  } finally { client?.release(); await pool.end(); }
}
