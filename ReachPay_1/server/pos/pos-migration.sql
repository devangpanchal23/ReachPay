-- Paytm POS / Wireless EDC Schema Migration for ReachPay
-- Compatible with PostgreSQL 13+

CREATE TABLE IF NOT EXISTS pos_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL DEFAULT 'paytm',
  environment varchar(16) NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging', 'production')),
  mid varchar(64) NOT NULL,
  tid varchar(32) NOT NULL,
  client_id varchar(64) DEFAULT 'reachpay',
  encrypted_merchant_key text,
  encrypted_merchant_key_iv varchar(32),
  encrypted_merchant_key_tag varchar(32),
  status varchar(24) NOT NULL DEFAULT 'UNTESTED',
  last_tested_at timestamptz,
  last_status_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mid, tid, environment)
);

-- Preserve existing Paytm rows while allowing partner-managed providers whose
-- credentials are not yet issued to be represented without fabricated secrets.
ALTER TABLE pos_terminals ALTER COLUMN encrypted_merchant_key DROP NOT NULL;
ALTER TABLE pos_terminals ALTER COLUMN encrypted_merchant_key_iv DROP NOT NULL;
ALTER TABLE pos_terminals ALTER COLUMN encrypted_merchant_key_tag DROP NOT NULL;
ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_mid_tid_environment_key;
CREATE UNIQUE INDEX IF NOT EXISTS pos_terminals_provider_mid_tid_env_uidx
  ON pos_terminals(provider, mid, tid, environment);

-- Ensure check constraint on pos_terminals is up to date
DO $$
BEGIN
  ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_status_check;
  ALTER TABLE pos_terminals ADD CONSTRAINT pos_terminals_status_check
    CHECK (status IN ('CONNECTED', 'ONLINE', 'DISCONNECTED', 'OFFLINE', 'UNTESTED', 'ERROR', 'ACTIVE', 'INACTIVE'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pos_terminals_user_idx ON pos_terminals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS pos_terminals_mid_tid_idx ON pos_terminals(mid, tid);

CREATE TABLE IF NOT EXISTS pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  terminal_id uuid REFERENCES pos_terminals(id) ON DELETE SET NULL,
  provider varchar(32) NOT NULL DEFAULT 'paytm',
  environment varchar(16) NOT NULL DEFAULT 'staging',
  merchant_txn_id varchar(64) NOT NULL UNIQUE,
  cpay_id varchar(64),
  mid varchar(64) NOT NULL,
  tid varchar(32) NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency varchar(3) NOT NULL DEFAULT 'INR',
  status varchar(32) NOT NULL DEFAULT 'INITIATED',
  payment_method varchar(32),
  rrn varchar(32),
  auth_code varchar(32),
  invoice_number varchar(32),
  card_last4 varchar(4),
  card_type varchar(16),
  customer_mobile varchar(16),
  notes text,
  idempotency_key varchar(128) UNIQUE,
  error_code varchar(64),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure check constraint on pos_transactions covers all lifecycle states
DO $$
BEGIN
  ALTER TABLE pos_transactions DROP CONSTRAINT IF EXISTS pos_transactions_status_check;
  ALTER TABLE pos_transactions ADD CONSTRAINT pos_transactions_status_check
    CHECK (status IN ('INITIATED', 'IN_QUEUE', 'PENDING', 'SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'TIMEOUT', 'UNKNOWN'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pos_transactions_status_idx ON pos_transactions(status, initiated_at DESC);
CREATE INDEX IF NOT EXISTS pos_transactions_mid_tid_idx ON pos_transactions(mid, tid, initiated_at DESC);
CREATE INDEX IF NOT EXISTS pos_transactions_cpay_idx ON pos_transactions(cpay_id);
CREATE INDEX IF NOT EXISTS pos_transactions_user_idx ON pos_transactions(user_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS pos_transactions_user_status_idx ON pos_transactions(user_id, status, initiated_at DESC);

CREATE TABLE IF NOT EXISTS pos_sync_logs (
  id bigserial PRIMARY KEY,
  terminal_id uuid REFERENCES pos_terminals(id) ON DELETE SET NULL,
  user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  provider varchar(32) NOT NULL DEFAULT 'paytm',
  action varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'SUCCESS',
  records_checked integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure check constraint on pos_sync_logs
DO $$
BEGIN
  ALTER TABLE pos_sync_logs DROP CONSTRAINT IF EXISTS pos_sync_logs_status_check;
  ALTER TABLE pos_sync_logs ADD CONSTRAINT pos_sync_logs_status_check
    CHECK (status IN ('SUCCESS', 'FAILED', 'FAILURE', 'PARTIAL', 'ERROR'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pos_sync_logs_terminal_time_idx ON pos_sync_logs(terminal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_sync_logs_user_time_idx ON pos_sync_logs(user_id, created_at DESC);
