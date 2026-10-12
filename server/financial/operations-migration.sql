BEGIN;

-- Financial service requests are not wallet transactions. They have no wallet
-- foreign key and cannot be submitted until a provider and funding source are
-- explicitly approved.
CREATE TABLE IF NOT EXISTS financial_provider_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL CHECK (provider IN ('paytm','phonepe','eko','razorpayx','cashfree','bank','other')),
  product varchar(48) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'UNCONFIGURED' CHECK (status IN ('UNCONFIGURED','CREDENTIALS_REQUIRED','PENDING_APPROVAL','ACTIVE','SUSPENDED','ERROR')),
  verified_at timestamptz,
  secret_reference varchar(200),
  permissions text[] NOT NULL DEFAULT '{}',
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, product)
);

CREATE TABLE IF NOT EXISTS financial_funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL CHECK (provider IN ('paytm','phonepe','eko','razorpayx','cashfree','bank','other')),
  account_reference_ciphertext text NOT NULL,
  account_reference_iv char(24) NOT NULL,
  account_reference_tag char(32) NOT NULL,
  account_reference_fingerprint char(64) NOT NULL,
  masked_reference varchar(40) NOT NULL,
  verification_status varchar(20) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','REJECTED')),
  funding_permissions text[] NOT NULL DEFAULT '{}',
  supported_services text[] NOT NULL DEFAULT '{}',
  activation_status varchar(20) NOT NULL DEFAULT 'INACTIVE' CHECK (activation_status IN ('INACTIVE','PENDING','ACTIVE','SUSPENDED')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_reference_fingerprint),
  CHECK (activation_status <> 'ACTIVE' OR verification_status = 'VERIFIED')
);

CREATE TABLE IF NOT EXISTS financial_service_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference varchar(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  service_type varchar(24) NOT NULL CHECK (service_type IN ('BBPS','DMT','BANK_TRANSFER','RECHARGE','FASTAG')),
  service_category varchar(32),
  funding_source_id uuid REFERENCES financial_funding_sources(id) ON DELETE RESTRICT,
  beneficiary_id uuid REFERENCES financial_beneficiaries(id) ON DELETE RESTRICT,
  provider varchar(32),
  provider_reference varchar(128),
  status varchar(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATION_PENDING','AUTHORIZATION_PENDING','PROVIDER_UNAVAILABLE','READY_FOR_SUBMISSION','SUBMITTED','PROCESSING','SUCCESSFUL','FAILED','REVERSAL_PENDING','REVERSED','RECONCILIATION_REQUIRED')),
  amount_paise bigint CHECK (amount_paise IS NULL OR amount_paise > 0),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  idempotency_key varchar(128) NOT NULL,
  blocker_code varchar(64),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  UNIQUE (user_id, idempotency_key),
  UNIQUE (provider, provider_reference)
);

CREATE TABLE IF NOT EXISTS financial_service_transaction_history (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  from_status varchar(32),
  to_status varchar(32) NOT NULL,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  reason_code varchar(64),
  request_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_transaction_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  approver_user_id uuid REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  decision_reason varchar(256),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (approver_user_id IS NULL OR approver_user_id <> requester_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_transaction_approvals_pending_unique
  ON financial_transaction_approvals(transaction_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS financial_reconciliation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  service_transaction_id uuid REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  pos_transaction_id uuid REFERENCES pos_transactions(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL,
  issue_type varchar(32) NOT NULL CHECK (issue_type IN ('MISSING_PROVIDER_RESULT','AMOUNT_MISMATCH','STATUS_MISMATCH','DUPLICATE','ORPHAN_EVENT','SETTLEMENT_MISMATCH')),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','CLOSED')),
  expected_amount_paise bigint,
  observed_amount_paise bigint,
  provider_reference varchar(128),
  resolution_reference varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (service_transaction_id IS NOT NULL OR pos_transaction_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS financial_operations_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  event_type varchar(64) NOT NULL,
  target_type varchar(48) NOT NULL,
  target_id varchar(128),
  request_id varchar(128),
  reason_code varchar(64),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_provider_integrations_owner_idx ON financial_provider_integrations(user_id, provider, product);
CREATE INDEX IF NOT EXISTS financial_funding_sources_owner_idx ON financial_funding_sources(user_id, activation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_service_transactions_owner_idx ON financial_service_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_service_transactions_state_idx ON financial_service_transactions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_service_history_transaction_idx ON financial_service_transaction_history(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_transaction_approvals_owner_idx ON financial_transaction_approvals(requester_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_reconciliation_owner_idx ON financial_reconciliation_records(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_operations_audit_owner_idx ON financial_operations_audit_events(actor_user_id, created_at DESC);

ALTER TABLE pos_terminals ADD COLUMN IF NOT EXISTS store_id varchar(128);
ALTER TABLE pos_terminals ADD COLUMN IF NOT EXISTS external_mid varchar(64);
ALTER TABLE pos_terminals ADD COLUMN IF NOT EXISTS external_tid varchar(32);
ALTER TABLE pos_terminals ADD COLUMN IF NOT EXISTS provider_verification_status varchar(20) NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_provider_verification_status_check;
ALTER TABLE pos_terminals ADD CONSTRAINT pos_terminals_provider_verification_status_check
  CHECK (provider_verification_status IN ('UNVERIFIED','VERIFIED','REJECTED'));

CREATE OR REPLACE FUNCTION reachpay_reject_financial_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial audit history is append-only.';
END;
$$;
DROP TRIGGER IF EXISTS financial_service_history_immutable ON financial_service_transaction_history;
CREATE TRIGGER financial_service_history_immutable BEFORE UPDATE OR DELETE ON financial_service_transaction_history
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_financial_audit_mutation();
DROP TRIGGER IF EXISTS financial_operations_audit_immutable ON financial_operations_audit_events;
CREATE TRIGGER financial_operations_audit_immutable BEFORE UPDATE OR DELETE ON financial_operations_audit_events
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_financial_audit_mutation();

COMMIT;
