BEGIN;

CREATE TABLE IF NOT EXISTS financial_service_catalog_versions (
  id bigserial PRIMARY KEY,
  provider varchar(32) NOT NULL,
  catalog_name varchar(32) NOT NULL,
  version_number integer NOT NULL,
  content_sha256 char(64) NOT NULL,
  content jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,catalog_name,version_number),
  UNIQUE(provider,catalog_name,content_sha256)
);

CREATE TABLE IF NOT EXISTS financial_service_categories (
  provider varchar(32) NOT NULL,
  provider_category_id varchar(64) NOT NULL,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  catalog_version_id bigint NOT NULL REFERENCES financial_service_catalog_versions(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,provider_category_id)
);

CREATE TABLE IF NOT EXISTS financial_service_billers (
  provider varchar(32) NOT NULL,
  provider_biller_id varchar(96) NOT NULL,
  category_id varchar(64) NOT NULL,
  name varchar(180) NOT NULL,
  supports_bill_fetch boolean NOT NULL DEFAULT false,
  high_commission_channel boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  bbps_member boolean NOT NULL DEFAULT false,
  catalog_version_id bigint NOT NULL REFERENCES financial_service_catalog_versions(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,provider_biller_id),
  FOREIGN KEY(provider,category_id) REFERENCES financial_service_categories(provider,provider_category_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS financial_service_biller_parameters (
  provider varchar(32) NOT NULL,
  provider_biller_id varchar(96) NOT NULL,
  parameter_id varchar(96) NOT NULL,
  parameter_name varchar(96) NOT NULL,
  parameter_label varchar(180) NOT NULL,
  parameter_type varchar(32) NOT NULL,
  validation_regex text,
  error_message varchar(256),
  list_values jsonb,
  required boolean NOT NULL DEFAULT true,
  catalog_version_id bigint NOT NULL REFERENCES financial_service_catalog_versions(id) ON DELETE RESTRICT,
  PRIMARY KEY(provider,provider_biller_id,parameter_id),
  FOREIGN KEY(provider,provider_biller_id) REFERENCES financial_service_billers(provider,provider_biller_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS financial_service_bill_fetch_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  service_transaction_id uuid REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL,
  provider_biller_id varchar(96) NOT NULL,
  client_reference varchar(64) NOT NULL UNIQUE,
  account_reference_ciphertext text NOT NULL,
  account_reference_iv char(24) NOT NULL,
  account_reference_tag char(32) NOT NULL,
  account_fingerprint char(64) NOT NULL,
  masked_account_reference varchar(40) NOT NULL,
  provider_bill_reference_ciphertext text,
  provider_bill_reference_iv char(24),
  provider_bill_reference_tag char(32),
  bill_amount_paise bigint CHECK (bill_amount_paise IS NULL OR bill_amount_paise > 0),
  provider_status varchar(32) NOT NULL CHECK (provider_status IN ('PENDING','VERIFIED','FAILED','EXPIRED')),
  expires_at timestamptz,
  safe_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((provider_bill_reference_ciphertext IS NULL AND provider_bill_reference_iv IS NULL AND provider_bill_reference_tag IS NULL)
      OR (provider_bill_reference_ciphertext IS NOT NULL AND provider_bill_reference_iv IS NOT NULL AND provider_bill_reference_tag IS NOT NULL)),
  CHECK (provider_status <> 'VERIFIED' OR (bill_amount_paise > 0 AND provider_bill_reference_ciphertext IS NOT NULL AND expires_at > created_at))
);

CREATE TABLE IF NOT EXISTS financial_service_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_transaction_id uuid NOT NULL REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  provider varchar(32) NOT NULL,
  client_reference varchar(64) NOT NULL UNIQUE,
  provider_reference varchar(128),
  status varchar(32) NOT NULL CHECK (status IN ('READY','SUBMITTED','PROCESSING','SUCCESSFUL','FAILED','UNKNOWN','REVERSAL_PENDING','REVERSED')),
  provider_confirmed boolean NOT NULL DEFAULT false,
  reversal_confirmed boolean NOT NULL DEFAULT false,
  request_sha256 char(64) NOT NULL,
  safe_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_transaction_id,attempt_number),
  UNIQUE(provider,provider_reference)
);

ALTER TABLE financial_service_payment_attempts ADD COLUMN IF NOT EXISTS provider_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE financial_service_payment_attempts ADD COLUMN IF NOT EXISTS reversal_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE financial_service_payment_attempts DROP CONSTRAINT IF EXISTS financial_service_payment_attempts_success_evidence_check;
ALTER TABLE financial_service_payment_attempts ADD CONSTRAINT financial_service_payment_attempts_success_evidence_check
  CHECK (status <> 'SUCCESSFUL' OR (provider_confirmed=true AND provider_reference IS NOT NULL));
ALTER TABLE financial_service_payment_attempts DROP CONSTRAINT IF EXISTS financial_service_payment_attempts_reversal_evidence_check;
ALTER TABLE financial_service_payment_attempts ADD CONSTRAINT financial_service_payment_attempts_reversal_evidence_check
  CHECK (status <> 'REVERSED' OR (provider_confirmed=true AND reversal_confirmed=true AND provider_reference IS NOT NULL));

CREATE TABLE IF NOT EXISTS financial_service_provider_callbacks (
  id bigserial PRIMARY KEY,
  provider varchar(32) NOT NULL,
  provider_event_id varchar(160) NOT NULL,
  service_transaction_id uuid REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  signature_verified boolean NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_event_id),
  CHECK (NOT applied OR signature_verified)
);

CREATE TABLE IF NOT EXISTS financial_service_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_transaction_id uuid NOT NULL UNIQUE REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  payment_attempt_id uuid REFERENCES financial_service_payment_attempts(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL,
  provider_receipt_reference varchar(128),
  biller_name varchar(180),
  bill_reference_masked varchar(40),
  amount_paise bigint NOT NULL CHECK(amount_paise > 0),
  issued_at timestamptz NOT NULL,
  verified_provider_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_service_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_transaction_id uuid NOT NULL REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL,
  provider_complaint_reference varchar(128),
  issue_type varchar(64) NOT NULL,
  status varchar(32) NOT NULL CHECK(status IN ('DRAFT','SUBMITTED','OPEN','RESOLVED','REJECTED','REVERSAL_PENDING','REVERSED')),
  resolution_reference varchar(128),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_complaint_reference)
);

CREATE OR REPLACE FUNCTION reachpay_guard_service_transaction_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN RAISE EXCEPTION 'Service requests must start as DRAFT.'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'DRAFT' THEN NEW.status IN ('VALIDATION_PENDING','AUTHORIZATION_PENDING','FAILED')
    WHEN 'VALIDATION_PENDING' THEN NEW.status IN ('AUTHORIZATION_PENDING','PROVIDER_UNAVAILABLE','FAILED')
    WHEN 'AUTHORIZATION_PENDING' THEN NEW.status IN ('READY_FOR_SUBMISSION','FAILED')
    WHEN 'PROVIDER_UNAVAILABLE' THEN NEW.status IN ('VALIDATION_PENDING','FAILED')
    WHEN 'READY_FOR_SUBMISSION' THEN NEW.status IN ('SUBMITTED','FAILED')
    WHEN 'SUBMITTED' THEN NEW.status IN ('PROCESSING','SUCCESSFUL','FAILED','REVERSAL_PENDING','RECONCILIATION_REQUIRED')
    WHEN 'PROCESSING' THEN NEW.status IN ('SUCCESSFUL','FAILED','REVERSAL_PENDING','RECONCILIATION_REQUIRED')
    WHEN 'SUCCESSFUL' THEN NEW.status IN ('REVERSAL_PENDING','RECONCILIATION_REQUIRED')
    WHEN 'FAILED' THEN NEW.status='RECONCILIATION_REQUIRED'
    WHEN 'REVERSAL_PENDING' THEN NEW.status IN ('REVERSED','RECONCILIATION_REQUIRED')
    WHEN 'RECONCILIATION_REQUIRED' THEN NEW.status IN ('SUCCESSFUL','FAILED','REVERSAL_PENDING','REVERSED')
    ELSE false END;
  IF NOT allowed THEN RAISE EXCEPTION 'Invalid financial service state transition: % -> %.', OLD.status, NEW.status; END IF;
  IF NEW.status IN ('SUCCESSFUL','REVERSED') AND NOT EXISTS (
    SELECT 1 FROM financial_service_payment_attempts a WHERE a.service_transaction_id=NEW.id
      AND a.provider=NEW.provider AND a.provider_reference=NEW.provider_reference
      AND a.provider_confirmed=true
      AND (NEW.status<>'REVERSED' OR (a.reversal_confirmed=true AND a.status='REVERSED'))
      AND (NEW.status<>'SUCCESSFUL' OR a.status='SUCCESSFUL')
  ) THEN RAISE EXCEPTION 'Verified provider evidence is required for successful or reversed service state.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_service_transaction_state_guard ON financial_service_transactions;
CREATE TRIGGER financial_service_transaction_state_guard BEFORE INSERT OR UPDATE OF status ON financial_service_transactions
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_service_transaction_status();

CREATE OR REPLACE FUNCTION reachpay_guard_service_receipt() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM financial_service_transactions t
    JOIN financial_service_payment_attempts a ON a.service_transaction_id=t.id
    WHERE t.id=NEW.service_transaction_id AND t.status='SUCCESSFUL'
      AND t.provider=NEW.provider AND a.id=NEW.payment_attempt_id
      AND a.status='SUCCESSFUL' AND a.provider_confirmed=true
      AND a.provider_reference IS NOT NULL AND t.amount_paise=NEW.amount_paise
  ) THEN RAISE EXCEPTION 'A receipt requires a matching provider-confirmed successful transaction.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_service_receipt_evidence_guard ON financial_service_receipts;
CREATE TRIGGER financial_service_receipt_evidence_guard BEFORE INSERT OR UPDATE ON financial_service_receipts
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_service_receipt();

CREATE INDEX IF NOT EXISTS financial_service_catalog_active_idx ON financial_service_categories(provider,active,name);
CREATE INDEX IF NOT EXISTS financial_service_billers_category_idx ON financial_service_billers(provider,category_id,active,name);
CREATE INDEX IF NOT EXISTS financial_service_bill_fetch_owner_idx ON financial_service_bill_fetch_records(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS financial_service_attempts_tx_idx ON financial_service_payment_attempts(service_transaction_id,attempt_number DESC);
CREATE INDEX IF NOT EXISTS financial_service_callbacks_unapplied_idx ON financial_service_provider_callbacks(provider,received_at) WHERE applied=false;
CREATE INDEX IF NOT EXISTS financial_service_complaints_owner_idx ON financial_service_complaints(service_transaction_id,status);

COMMIT;
