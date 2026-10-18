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
  const pool = new pg.Pool(postgresPoolConfig(process.env.DATABASE_URL, { production: process.env.NODE_ENV === 'production', max: 1, connectionTimeoutMillis: 5000 }));
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
    const constraints = [
      'customer_accounts_pkey', 'customer_accounts_email_key', 'customer_accounts_mobile_e164_key',
      'customer_sessions_pkey', 'customer_sessions_user_id_fkey',
      'email_otp_challenges_pkey', 'email_otp_challenges_user_id_fkey',
      'phone_otp_challenges_pkey', 'phone_otp_challenges_user_id_fkey',
      'auth_rate_limits_pkey', 'auth_audit_events_pkey', 'rbac_audit_events_pkey',
    ];
    const constraintRows = await pool.query(`SELECT conname FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conname = ANY($1::text[]) AND convalidated`, [constraints]);
    const foundConstraints = new Set(constraintRows.rows.map((row) => row.conname));
    for (const constraint of constraints) {
      const presentConstraint = foundConstraints.has(constraint);
      if (!presentConstraint) missingCount += 1;
      process.stdout.write(`${constraint}: ${presentConstraint ? 'OK' : 'MISSING'}\n`);
    }
    const checks = [
      ['auth_rate_limits.key_hash unique', `SELECT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        WHERE t.oid = to_regclass('public.auth_rate_limits') AND i.indisunique
          AND i.indisvalid AND i.indnkeyatts = 1 AND a.attname = 'key_hash'
      ) AS present`],
      ['auth_rate_limits_window_idx', `SELECT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        WHERE x.relname = 'auth_rate_limits_window_idx' AND t.oid = to_regclass('public.auth_rate_limits')
          AND i.indisvalid AND i.indnkeyatts = 1 AND a.attname = 'window_started_at'
      ) AS present`],
      ['customer_accounts_single_owner_idx', `SELECT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE x.relname = 'customer_accounts_single_owner_idx' AND a.attname = 'role' AND i.indnkeyatts = 1
          AND i.indrelid = to_regclass('public.customer_accounts') AND i.indisunique AND i.indisvalid
          AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%role%owner%'
      ) AS present`],
      ['customer_accounts_owner_guard', `SELECT EXISTS (
        SELECT 1 FROM pg_trigger g WHERE g.tgrelid = to_regclass('public.customer_accounts')
          AND g.tgname = 'customer_accounts_owner_guard' AND NOT g.tgisinternal AND g.tgenabled IN ('O','A')
      ) AS present`],
      ['customer_accounts_owner_guard function', `SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'reachpay_protect_owner_account'
      ) AS present`],
      ['customer_accounts_role_check', `SELECT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.customer_accounts')
          AND c.conname = 'customer_accounts_role_check' AND c.contype = 'c' AND c.convalidated
          AND pg_get_constraintdef(c.oid) ILIKE '%owner%approved_member%limited%'
      ) AS present`],
      ['customer_accounts_access_status_check', `SELECT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.customer_accounts')
          AND c.conname = 'customer_accounts_access_status_check' AND c.contype = 'c' AND c.convalidated
          AND pg_get_constraintdef(c.oid) ILIKE '%approved%pending%revoked%limited%'
      ) AS present`],
    ];
    for (const [name, sql] of checks) {
      const { rows: checkRows } = await pool.query(sql);
      const presentItem = Boolean(checkRows[0]?.present);
      if (!presentItem) missingCount += 1;
      process.stdout.write(`${name}: ${presentItem ? 'OK' : 'MISSING'}\n`);
    }
    process.stdout.write(missingCount ? `Schema check failed: ${missingCount} required schema item(s) missing.\n` : 'Schema check passed.\n');
    if (missingCount) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Schema check failed${error?.code ? ` (PostgreSQL ${error.code})` : ''}: database connection or metadata query unavailable. No connection details were printed.\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
