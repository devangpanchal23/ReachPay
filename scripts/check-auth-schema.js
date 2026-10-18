import process from 'node:process';
import pg from 'pg';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

const required = {
  customer_accounts: ['id', 'name', 'email', 'mobile_e164', 'password_hash', 'password_salt', 'email_verified_at', 'mobile_verified_at', 'status', 'role', 'access_status'],
  customer_sessions: ['token_hash', 'user_id', 'expires_at'],
  auth_rate_limits: ['key_hash', 'window_started_at', 'attempts'],
  auth_audit_events: ['user_id', 'event_type', 'request_id'],
  phone_otp_challenges: ['user_id', 'provider', 'phone_e164', 'expires_at', 'approved_at'],
  email_otp_challenges: ['user_id', 'code_hmac', 'expires_at', 'attempts', 'consumed_at'],
  rbac_audit_events: ['actor_user_id', 'target_user_id', 'target_email', 'event_type', 'request_id'],
};

if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required. No value was printed.\n');
  process.exitCode = 1;
} else if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) {
  process.stderr.write('Database target is not an allowed ReachPay or Neon database. No value was printed.\n');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool(postgresPoolConfig(process.env.DATABASE_URL, { production: true, max: 1, connectionTimeoutMillis: 5000 }));
  try {
    const { rows } = await pool.query(`SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [Object.keys(required)]);
    const present = new Map();
    for (const row of rows) {
      if (!present.has(row.table_name)) present.set(row.table_name, new Set());
      present.get(row.table_name).add(row.column_name);
    }
    let missingCount = 0;
    for (const [table, columns] of Object.entries(required)) {
      const missing = columns.filter((column) => !present.get(table)?.has(column));
      missingCount += missing.length;
      process.stdout.write(`${table}: ${missing.length ? `MISSING ${missing.join(', ')}` : 'OK'}\n`);
    }
    const indexes = await pool.query(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, [['auth_rate_limits_window_idx', 'customer_accounts_single_owner_idx']]);
    const foundIndexes = new Set(indexes.rows.map((row) => row.indexname));
    for (const index of ['auth_rate_limits_window_idx', 'customer_accounts_single_owner_idx']) {
      if (!foundIndexes.has(index)) missingCount += 1;
      process.stdout.write(`${index}: ${foundIndexes.has(index) ? 'OK' : 'MISSING'}\n`);
    }
    const rateKey = await pool.query(`SELECT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE t.oid = to_regclass('public.auth_rate_limits')
        AND i.indisunique AND i.indisvalid AND i.indnkeyatts = 1 AND a.attname = 'key_hash'
    ) AS present`);
    if (!rateKey.rows[0]?.present) missingCount += 1;
    process.stdout.write(`auth_rate_limits.key_hash unique: ${rateKey.rows[0]?.present ? 'OK' : 'MISSING'}\n`);
    process.stdout.write(missingCount ? `Schema check failed: ${missingCount} required schema item(s) missing.\n` : 'Schema check passed.\n');
    if (missingCount) process.exitCode = 1;
  } catch {
    process.stderr.write('Schema check failed: database connection or metadata query unavailable. No connection details were printed.\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
