import process from 'node:process';
import pg from 'pg';

const requiredTables = [
  'customer_accounts',
  'customer_sessions',
  'email_otp_challenges',
  'phone_otp_challenges',
  'auth_rate_limits',
  'auth_audit_events',
  'financial_wallets',
  'financial_user_controls',
  'financial_ledger_accounts',
  'financial_transactions',
  'financial_journals',
  'financial_ledger_entries',
  'financial_transaction_status_history',
  'financial_provider_events',
  'financial_beneficiaries',
  'financial_reconciliation_cases',
  'financial_audit_logs',
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Add your PostgreSQL connection string to .env.');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query(
      "SELECT table_name AS name, to_regclass('public.' || table_name) IS NOT NULL AS exists FROM unnest($1::text[]) AS required(table_name)",
      [requiredTables],
    );
    const missing = result.rows.filter((row) => !row.exists).map((row) => row.name);
    if (missing.length) {
      console.error(`PostgreSQL is reachable, but the ReachPay schema is incomplete (${missing.join(', ')}). Run: npm run db:migrate:auth`);
      process.exitCode = 1;
    } else {
      console.log('PostgreSQL connection, customer-auth schema, and financial foundation schema are ready.');
    }
  } catch (error) {
    const code = String(error?.code || '');
    const message = code === '28P01' ? 'PostgreSQL rejected the configured username/password.'
      : code === '3D000' ? 'The configured PostgreSQL database does not exist.'
        : ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code) ? 'PostgreSQL could not be reached. Check that the service is running and the host/port are correct.'
          : 'PostgreSQL check failed. Confirm the connection settings and database permissions.';
    console.error(message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
