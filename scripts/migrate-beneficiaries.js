import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { isAllowedDatabaseUrl, postgresPoolConfig } from '../server/database-config.js';

if (!process.env.DATABASE_URL) {
  process.stderr.write('[ReachPay beneficiary DB] DATABASE_URL is required.\n');
  process.exitCode = 1;
} else {
  if (!isAllowedDatabaseUrl(process.env.DATABASE_URL)) {
    process.stderr.write('[ReachPay beneficiary DB] Refusing to migrate this database target. Use a ReachPay database or a Neon PostgreSQL endpoint.\n');
    process.exitCode = 1;
  } else {
    const pool = new pg.Pool(postgresPoolConfig(process.env.DATABASE_URL, { production: process.env.NODE_ENV === 'production', max: 1, connectionTimeoutMillis: 5000 }));
    try {
      const existing = await pool.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='financial_beneficiaries'`);
      if (existing.rowCount) {
        const columns = new Set(existing.rows.map((row) => row.column_name));
        const required = ['bank_account_ciphertext', 'bank_account_iv', 'bank_account_tag', 'ifsc_code', 'account_fingerprint'];
        if (required.some((column) => !columns.has(column))) {
          throw new Error('EXISTING_BENEFICIARY_SCHEMA_REQUIRES_REVIEW');
        }
      }
      const sql = await readFile(new URL('../server/financial/beneficiary-migration.sql', import.meta.url), 'utf8');
      await pool.query(sql);
      process.stdout.write('[ReachPay beneficiary DB] Beneficiary schema applied.\n');
    } catch (error) {
      const reason = error.message === 'EXISTING_BENEFICIARY_SCHEMA_REQUIRES_REVIEW' ? error.message : (error.code || 'unknown error');
      process.stderr.write(`[ReachPay beneficiary DB] Migration failed (${reason}).\n`);
      process.exitCode = 1;
    } finally { await pool.end(); }
  }
}
