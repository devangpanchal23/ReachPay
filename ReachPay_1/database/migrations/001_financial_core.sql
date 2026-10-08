-- ReachPay financial foundation. Requires server/auth-migration.sql first.
-- Ledger entries use signed integer paise; entries are append-only and every
-- journal must net to zero before the containing transaction can commit.

CREATE TABLE IF NOT EXISTS financial_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status text NOT NULL DEFAULT 'RESTRICTED' CHECK (status IN ('RESTRICTED','ACTIVE','FROZEN','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);

CREATE TABLE IF NOT EXISTS financial_user_controls (
  user_id uuid PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  kyc_status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (kyc_status IN ('NOT_STARTED','PENDING','VERIFIED','REJECTED')),
  risk_status text NOT NULL DEFAULT 'NORMAL' CHECK (risk_status IN ('NORMAL','REVIEW','RESTRICTED')),
  daily_collection_limit_paise bigint CHECK (daily_collection_limit_paise IS NULL OR daily_collection_limit_paise >= 0),
  daily_payout_limit_paise bigint CHECK (daily_payout_limit_paise IS NULL OR daily_payout_limit_paise >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES financial_wallets(id) ON DELETE RESTRICT,
  account_code text NOT NULL UNIQUE,
  account_type text NOT NULL CHECK (account_type IN ('CUSTOMER_WALLET','COLLECTION_CLEARING','PAYOUT_CLEARING','FEE_REVENUE','TAX_PAYABLE','SUSPENSE')),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((account_type = 'CUSTOMER_WALLET') = (wallet_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES financial_wallets(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('PAYIN','PAYOUT','BBPS','REFUND','REVERSAL','ADJUSTMENT')),
  status text NOT NULL CHECK (status IN ('INITIATED','PROCESSING','PENDING_POS_CREDIT','CREDITED','CREATED','BALANCE_HELD','SUBMITTED','SUCCESS','FAILED','REFUNDED','REVERSED','RECONCILIATION_REQUIRED')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  fee_paise bigint NOT NULL DEFAULT 0 CHECK (fee_paise >= 0),
  tax_paise bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  provider text,
  provider_reference text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, transaction_type, idempotency_key),
  UNIQUE (provider, provider_reference)
);

CREATE TABLE IF NOT EXISTS financial_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  journal_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, journal_type)
);

CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES financial_journals(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES financial_ledger_accounts(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise <> 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_transaction_status_history (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  reason text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_digest char(64) NOT NULL,
  transaction_id uuid REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error_code text,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS financial_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  display_name varchar(100) NOT NULL,
  destination_type text NOT NULL CHECK (destination_type IN ('BANK','UPI','WALLET')),
  provider_token text,
  masked_destination text NOT NULL,
  verification_status text NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','FAILED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('MISSING_CREDIT','MISSING_DEBIT','DUPLICATE','AMOUNT_MISMATCH','STATUS_MISMATCH','ORPHAN_PROVIDER_EVENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','CLOSED')),
  expected_amount_paise bigint,
  observed_amount_paise bigint,
  resolution_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  reason text,
  request_id text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_wallets_user_idx ON financial_wallets(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS financial_customer_wallet_account_unique ON financial_ledger_accounts(wallet_id) WHERE account_type = 'CUSTOMER_WALLET';
CREATE INDEX IF NOT EXISTS financial_transactions_user_time_idx ON financial_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_status_time_idx ON financial_transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_transactions_wallet_time_idx ON financial_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_entries_journal_idx ON financial_ledger_entries(journal_id);
CREATE INDEX IF NOT EXISTS financial_entries_account_time_idx ON financial_ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_provider_events_pending_idx ON financial_provider_events(received_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_reconciliation_open_idx ON financial_reconciliation_cases(created_at DESC) WHERE status IN ('OPEN','IN_REVIEW');
CREATE INDEX IF NOT EXISTS financial_audit_actor_time_idx ON financial_audit_logs(actor_user_id, created_at DESC);

CREATE OR REPLACE VIEW financial_wallet_balances AS
SELECT w.id AS wallet_id,
       w.user_id,
       w.currency,
       w.status,
       COALESCE(SUM(e.amount_paise), 0) AS ledger_balance_paise
FROM financial_wallets w
LEFT JOIN financial_ledger_accounts a ON a.wallet_id = w.id AND a.account_type = 'CUSTOMER_WALLET'
LEFT JOIN financial_ledger_entries e ON e.account_id = a.id
GROUP BY w.id, w.user_id, w.currency, w.status;

CREATE OR REPLACE FUNCTION financial_reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial journals and ledger records are immutable; use a reversal journal.';
END;
$$;

DROP TRIGGER IF EXISTS financial_journals_immutable ON financial_journals;
CREATE TRIGGER financial_journals_immutable
BEFORE UPDATE OR DELETE ON financial_journals
FOR EACH ROW EXECUTE FUNCTION financial_reject_ledger_mutation();

DROP TRIGGER IF EXISTS financial_ledger_entries_immutable ON financial_ledger_entries;
CREATE TRIGGER financial_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON financial_ledger_entries
FOR EACH ROW EXECUTE FUNCTION financial_reject_ledger_mutation();

CREATE OR REPLACE FUNCTION financial_assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_journal uuid;
  entry_count bigint;
  balance_paise numeric;
BEGIN
  IF TG_TABLE_NAME = 'financial_journals' THEN
    target_journal := NEW.id;
  ELSE
    target_journal := COALESCE(NEW.journal_id, OLD.journal_id);
  END IF;
  SELECT COUNT(*), COALESCE(SUM(amount_paise), 0)
    INTO entry_count, balance_paise
    FROM financial_ledger_entries
   WHERE journal_id = target_journal;
  IF entry_count < 2 OR balance_paise <> 0 THEN
    RAISE EXCEPTION 'Financial journal % must contain at least two balanced entries.', target_journal;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS financial_ledger_journal_balance ON financial_ledger_entries;
CREATE CONSTRAINT TRIGGER financial_ledger_journal_balance
AFTER INSERT ON financial_ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_assert_journal_balanced();

DROP TRIGGER IF EXISTS financial_journal_must_balance ON financial_journals;
CREATE CONSTRAINT TRIGGER financial_journal_must_balance
AFTER INSERT ON financial_journals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_assert_journal_balanced();
