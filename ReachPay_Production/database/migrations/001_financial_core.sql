-- PostgreSQL 16+ draft migration. Apply only after schema/security review.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE reachpay_tx_status AS ENUM ('INITIATED','PROCESSING','PENDING_POS_CREDIT','CREDITED','CREATED','BALANCE_HELD','SUBMITTED','SUCCESS','FAILED','REFUNDED','REVERSED','RECONCILIATION_REQUIRED');
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_subject text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('USER','OPERATOR','ADMIN','SUPER_ADMIN','AUDITOR')),
  kyc_status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (kyc_status IN ('NOT_STARTED','PENDING','VERIFIED','REJECTED','RESTRICTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid REFERENCES app_users(id),
  wallet_type text NOT NULL CHECK (wallet_type IN ('USER','ADMIN_POS','CLEARING','FEES','TAX','PAYOUT_PROVIDER','BBPS_PROVIDER')),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'), status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallets_owner_idx ON wallets(owner_user_id, created_at DESC);
CREATE TABLE ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_reference text NOT NULL UNIQUE,
  source_type text NOT NULL, source_id uuid NOT NULL, idempotency_key text NOT NULL UNIQUE,
  created_by uuid REFERENCES app_users(id), created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY, journal_id uuid NOT NULL REFERENCES ledger_journals(id), wallet_id uuid NOT NULL REFERENCES wallets(id),
  delta_paise bigint NOT NULL CHECK (delta_paise <> 0), currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ledger_entries_wallet_time_idx ON ledger_entries(wallet_id, created_at DESC, id DESC);
CREATE INDEX ledger_entries_journal_idx ON ledger_entries(journal_id);

CREATE FUNCTION reachpay_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger history is immutable; post a reversing journal instead' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER ledger_journals_immutable BEFORE UPDATE OR DELETE ON ledger_journals
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_ledger_mutation();
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_ledger_mutation();

-- Signed posting convention: positive delta increases an account; negative decreases it.
-- Every journal must sum to zero. Use a deferred constraint trigger so the complete
-- journal can be inserted within one DB transaction before balance is checked.
CREATE FUNCTION reachpay_assert_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal uuid; total bigint;
BEGIN
  journal := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT COALESCE(SUM(delta_paise),0) INTO total FROM ledger_entries WHERE journal_id = journal;
  IF total <> 0 THEN RAISE EXCEPTION 'Unbalanced ledger journal % (% paise)', journal, total USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reachpay_assert_balanced_journal();

CREATE VIEW wallet_balances AS SELECT wallet_id, currency, SUM(delta_paise)::bigint AS book_balance_paise FROM ledger_entries GROUP BY wallet_id,currency;
CREATE TABLE financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_reference text NOT NULL UNIQUE, owner_user_id uuid NOT NULL REFERENCES app_users(id), wallet_id uuid NOT NULL REFERENCES wallets(id),
  kind text NOT NULL CHECK (kind IN ('PAYIN','PAYOUT','BBPS','REFUND','REVERSAL')), status reachpay_tx_status NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0), fee_paise bigint NOT NULL DEFAULT 0 CHECK (fee_paise >= 0), tax_paise bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'), provider text, provider_reference text, idempotency_key text NOT NULL UNIQUE,
  pending_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider,provider_reference)
);
CREATE INDEX financial_transactions_owner_time_idx ON financial_transactions(owner_user_id,created_at DESC,id DESC);
CREATE INDEX financial_transactions_status_time_idx ON financial_transactions(status,created_at);
CREATE TABLE transaction_status_history (
  id bigserial PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES financial_transactions(id), old_status reachpay_tx_status, new_status reachpay_tx_status NOT NULL,
  source text NOT NULL, actor_id uuid REFERENCES app_users(id), request_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE balance_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES app_users(id), wallet_id uuid NOT NULL REFERENCES wallets(id),
  transaction_id uuid NOT NULL UNIQUE REFERENCES financial_transactions(id), amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL CHECK (status IN ('HELD','COMMITTED','RELEASED')), idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX balance_holds_wallet_status_idx ON balance_holds(wallet_id,status);
CREATE TABLE provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, provider_event_id text NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, signature_verified_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  processing_error_code text, UNIQUE(provider,provider_event_id)
);
CREATE TABLE provider_dead_letters (
  id bigserial PRIMARY KEY, provider text NOT NULL, provider_event_id text NOT NULL, failure_code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0, first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolution text, UNIQUE(provider,provider_event_id)
);
CREATE TABLE beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES app_users(id), display_name text NOT NULL,
  destination_token text NOT NULL, destination_last4 char(4), destination_type text NOT NULL CHECK (destination_type IN ('BANK','UPI','WALLET')),
  verification_status text NOT NULL CHECK (verification_status IN ('PENDING','VERIFIED','FAILED','REMOVED')),
  provider_reference text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beneficiaries_owner_idx ON beneficiaries(owner_user_id,created_at DESC);
CREATE TABLE reconciliation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid REFERENCES financial_transactions(id), provider text NOT NULL,
  result text NOT NULL CHECK (result IN ('MATCH','MISSING_CREDIT','MISSING_DEBIT','DUPLICATE','AMOUNT_MISMATCH','STATUS_MISMATCH','ORPHAN','REVIEW_REQUIRED')),
  local_amount_paise bigint, provider_amount_paise bigint, opened_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, resolution text, resolved_by uuid REFERENCES app_users(id)
);
CREATE TABLE billers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, provider_biller_id text NOT NULL,
  category text NOT NULL, display_name text NOT NULL, active boolean NOT NULL DEFAULT false, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz, UNIQUE(provider,provider_biller_id)
);
CREATE INDEX billers_category_active_idx ON billers(category,active,display_name);
CREATE TABLE bill_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES app_users(id), biller_id uuid NOT NULL REFERENCES billers(id),
  provider_reference text, status text NOT NULL, amount_paise bigint CHECK (amount_paise > 0), expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE notification_outbox (
  id bigserial PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES app_users(id), event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP','EMAIL','SMS')), status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY, actor_id uuid REFERENCES app_users(id), action text NOT NULL, target_type text NOT NULL, target_id text,
  request_id text, reason text, ip inet, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_time_idx ON audit_logs(created_at DESC);

-- No mutable wallet balance column exists. Available balance must be computed in a
-- serializable/locked operation over posted journals and outstanding balance holds.
-- This migration defines schema only; it does not enable the API to move money.
