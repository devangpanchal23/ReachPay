BEGIN;

CREATE TABLE IF NOT EXISTS financial_merchant_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name varchar(180) NOT NULL,
  created_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  verification_status varchar(20) NOT NULL DEFAULT 'UNVERIFIED',
  verification_provider varchar(32),
  verification_reference varchar(128),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE financial_merchant_organizations ADD COLUMN IF NOT EXISTS verification_status varchar(20) NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE financial_merchant_organizations ADD COLUMN IF NOT EXISTS verification_provider varchar(32);
ALTER TABLE financial_merchant_organizations ADD COLUMN IF NOT EXISTS verification_reference varchar(128);
ALTER TABLE financial_merchant_organizations ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE financial_merchant_organizations DROP CONSTRAINT IF EXISTS financial_merchant_org_verification_status_check;
ALTER TABLE financial_merchant_organizations ADD CONSTRAINT financial_merchant_org_verification_status_check
  CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED'));
ALTER TABLE financial_merchant_organizations DROP CONSTRAINT IF EXISTS financial_merchant_org_verification_evidence_check;
ALTER TABLE financial_merchant_organizations ADD CONSTRAINT financial_merchant_org_verification_evidence_check
  CHECK (verification_status <> 'VERIFIED' OR (verification_provider IS NOT NULL AND verification_reference IS NOT NULL AND verified_at IS NOT NULL));

CREATE TABLE IF NOT EXISTS financial_organization_members (
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  role varchar(16) NOT NULL CHECK (role IN ('OWNER','ADMIN','MAKER','CHECKER','VIEWER')),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS financial_org_members_user_idx ON financial_organization_members(user_id,status,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS financial_org_single_owner_idx ON financial_organization_members(organization_id) WHERE role='OWNER' AND status='ACTIVE';

CREATE TABLE IF NOT EXISTS financial_organization_audit_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  event_type varchar(64) NOT NULL,
  target_type varchar(48) NOT NULL,
  target_id varchar(128),
  reason_code varchar(64),
  request_id varchar(128),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_dmt_sender_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32),
  provider_sender_reference varchar(128),
  full_name varchar(160) NOT NULL,
  mobile_ciphertext text NOT NULL,
  mobile_iv char(24) NOT NULL,
  mobile_tag char(32) NOT NULL,
  mobile_fingerprint char(64) NOT NULL,
  masked_mobile varchar(24) NOT NULL,
  kyc_status varchar(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK (kyc_status IN ('NOT_STARTED','PENDING','VERIFIED','REJECTED','EXPIRED','UNAVAILABLE')),
  kyc_provider_reference varchar(128),
  kyc_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,mobile_fingerprint),
  CHECK (kyc_status <> 'VERIFIED' OR (provider IS NOT NULL AND kyc_provider_reference IS NOT NULL AND kyc_verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_dmt_sender_org_idx ON financial_dmt_sender_profiles(organization_id,created_at DESC);

CREATE TABLE IF NOT EXISTS financial_dmt_kyc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  sender_profile_id uuid NOT NULL REFERENCES financial_dmt_sender_profiles(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32),
  provider_reference varchar(128),
  status varchar(20) NOT NULL CHECK(status IN ('REQUESTED','PENDING','VERIFIED','REJECTED','EXPIRED','UNAVAILABLE')),
  blocker_code varchar(64),
  verified_at timestamptz,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'VERIFIED' OR (provider IS NOT NULL AND provider_reference IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_dmt_kyc_sender_idx ON financial_dmt_kyc_records(sender_profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS financial_dmt_sender_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_profile_id uuid NOT NULL REFERENCES financial_dmt_sender_profiles(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  consent_version varchar(32) NOT NULL,
  consent_text_sha256 char(64) NOT NULL,
  consented_at timestamptz NOT NULL,
  revoked_at timestamptz,
  request_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_dmt_otp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  sender_profile_id uuid NOT NULL REFERENCES financial_dmt_sender_profiles(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32),
  provider_reference varchar(128),
  status varchar(20) NOT NULL CHECK(status IN ('REQUESTED','SENT','VERIFIED','FAILED','EXPIRED','UNAVAILABLE')),
  blocker_code varchar(64),
  verified_at timestamptz,
  request_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'VERIFIED' OR (provider IS NOT NULL AND provider_reference IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_dmt_otp_sender_idx ON financial_dmt_otp_attempts(sender_profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS financial_beneficiary_verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  beneficiary_id uuid NOT NULL REFERENCES financial_beneficiaries(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32),
  status varchar(20) NOT NULL CHECK (status IN ('REQUESTED','PENDING','VERIFIED','FAILED','INCONCLUSIVE','UNAVAILABLE')),
  account_holder_name varchar(160),
  provider_reference varchar(128),
  verified_at timestamptz,
  blocker_code varchar(64),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'VERIFIED' OR (provider IS NOT NULL AND provider_reference IS NOT NULL AND verified_at IS NOT NULL AND account_holder_name IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_beneficiary_verification_org_idx ON financial_beneficiary_verification_records(organization_id,beneficiary_id,created_at DESC);

ALTER TABLE financial_service_transactions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT;
ALTER TABLE financial_service_transactions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE financial_service_transactions SET expires_at=created_at + interval '24 hours'
  WHERE status IN ('DRAFT','AUTHORIZATION_PENDING') AND expires_at IS NULL;
ALTER TABLE financial_transaction_approvals ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT;
ALTER TABLE financial_transaction_approvals ADD COLUMN IF NOT EXISTS request_id varchar(128);
ALTER TABLE financial_transaction_approvals ADD COLUMN IF NOT EXISTS decision_request_id varchar(128);
ALTER TABLE financial_transaction_approvals ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE financial_transaction_approvals SET expires_at=created_at + interval '24 hours'
  WHERE status='PENDING' AND expires_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_tx_org_idx ON financial_service_transactions(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS financial_tx_expiry_idx ON financial_service_transactions(status,expires_at) WHERE status IN ('DRAFT','AUTHORIZATION_PENDING');
CREATE INDEX IF NOT EXISTS financial_tx_approvals_org_idx ON financial_transaction_approvals(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS financial_approval_expiry_idx ON financial_transaction_approvals(status,expires_at) WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS financial_transfer_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL UNIQUE REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  product varchar(24) NOT NULL CHECK (product IN ('DMT','OWN_BUSINESS','THIRD_PARTY')),
  sender_profile_id uuid REFERENCES financial_dmt_sender_profiles(id) ON DELETE RESTRICT,
  beneficiary_id uuid NOT NULL REFERENCES financial_beneficiaries(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32),
  provider_fee_paise bigint CHECK (provider_fee_paise IS NULL OR provider_fee_paise >= 0),
  fee_status varchar(20) NOT NULL DEFAULT 'UNAVAILABLE' CHECK (fee_status IN ('UNAVAILABLE','PROVIDER_QUOTED')),
  provider_fee_reference varchar(128),
  fee_quoted_at timestamptz,
  fee_valid_until timestamptz,
  confirmation_at timestamptz,
  consent_id uuid REFERENCES financial_dmt_sender_consents(id) ON DELETE RESTRICT,
  blocker_code varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((product='DMT' AND sender_profile_id IS NOT NULL) OR (product<>'DMT' AND sender_profile_id IS NULL)),
  CHECK (fee_status<>'PROVIDER_QUOTED' OR (provider IS NOT NULL AND provider_fee_paise IS NOT NULL
    AND provider_fee_reference IS NOT NULL AND fee_quoted_at IS NOT NULL AND fee_valid_until IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS financial_transaction_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  service_type varchar(24) NOT NULL CHECK (service_type IN ('DMT','BANK_TRANSFER')),
  user_id uuid REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  max_per_transaction_paise bigint NOT NULL CHECK (max_per_transaction_paise > 0),
  max_per_day_paise bigint NOT NULL CHECK (max_per_day_paise > 0),
  max_per_month_paise bigint NOT NULL CHECK (max_per_month_paise > 0),
  limit_source varchar(16) NOT NULL DEFAULT 'MERCHANT' CHECK (limit_source IN ('MERCHANT','PROVIDER','REGULATORY')),
  evidence_reference varchar(240),
  configured_by uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_per_transaction_paise <= max_per_day_paise AND max_per_day_paise <= max_per_month_paise),
  CHECK (limit_source='MERCHANT' OR evidence_reference IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_tx_limit_scope_unique ON financial_transaction_limits(organization_id,service_type,COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid),limit_source);

CREATE TABLE IF NOT EXISTS financial_limit_utilization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  service_type varchar(24) NOT NULL CHECK (service_type IN ('DMT','BANK_TRANSFER')),
  transaction_id uuid NOT NULL UNIQUE REFERENCES financial_service_transactions(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status varchar(16) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','CONSUMED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_limit_org_period_idx ON financial_limit_utilization(organization_id,service_type,status,created_at);
CREATE INDEX IF NOT EXISTS financial_limit_user_period_idx ON financial_limit_utilization(organization_id,user_id,service_type,status,created_at);

CREATE TABLE IF NOT EXISTS financial_funding_source_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funding_source_id uuid NOT NULL REFERENCES financial_funding_sources(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  provider varchar(32) NOT NULL,
  service_type varchar(24) NOT NULL CHECK(service_type IN ('DMT','BANK_TRANSFER')),
  status varchar(20) NOT NULL CHECK(status IN ('PENDING','VERIFIED','REJECTED','EXPIRED','UNAVAILABLE')),
  funding_authorized boolean NOT NULL DEFAULT false,
  balance_supported boolean NOT NULL DEFAULT false,
  available_balance_paise bigint CHECK(available_balance_paise IS NULL OR available_balance_paise >= 0),
  provider_reference varchar(128),
  verified_at timestamptz,
  valid_until timestamptz,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT balance_supported OR available_balance_paise IS NOT NULL),
  CHECK (status <> 'VERIFIED' OR (funding_authorized=true AND provider_reference IS NOT NULL AND verified_at IS NOT NULL AND valid_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS financial_funding_auth_latest_idx ON financial_funding_source_authorizations(funding_source_id,service_type,created_at DESC);
CREATE OR REPLACE FUNCTION reachpay_guard_funding_authorization_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM financial_funding_sources f WHERE f.id=NEW.funding_source_id AND f.user_id=NEW.user_id AND f.provider=NEW.provider) THEN
    RAISE EXCEPTION 'Funding authorization must match the provider-owned source.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_funding_authorization_owner_guard ON financial_funding_source_authorizations;
CREATE TRIGGER financial_funding_authorization_owner_guard BEFORE INSERT OR UPDATE ON financial_funding_source_authorizations
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_funding_authorization_owner();

CREATE TABLE IF NOT EXISTS financial_approval_history (
  id bigserial PRIMARY KEY,
  approval_id uuid NOT NULL REFERENCES financial_transaction_approvals(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES financial_merchant_organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  action varchar(16) NOT NULL CHECK (action IN ('REQUESTED','APPROVED','REJECTED','CANCELLED')),
  reason varchar(256),
  request_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE financial_approval_history ALTER COLUMN actor_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION reachpay_guard_financial_approval_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE request_role varchar(16); decision_role varchar(16); transaction_org uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  SELECT t.organization_id INTO transaction_org FROM financial_service_transactions t WHERE t.id=NEW.transaction_id;
  IF transaction_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Approval organization must match transaction organization.'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT role INTO request_role FROM financial_organization_members WHERE organization_id=NEW.organization_id AND user_id=NEW.requester_user_id AND status='ACTIVE' FOR SHARE;
    IF request_role IS NULL OR request_role NOT IN ('OWNER','ADMIN','MAKER') THEN RAISE EXCEPTION 'An active maker is required to request approval.'; END IF;
  END IF;
  IF NEW.approver_user_id IS NOT NULL THEN
    IF NEW.approver_user_id=NEW.requester_user_id THEN RAISE EXCEPTION 'A maker cannot approve their own transaction.'; END IF;
    SELECT role INTO decision_role FROM financial_organization_members WHERE organization_id=NEW.organization_id AND user_id=NEW.approver_user_id AND status='ACTIVE' FOR SHARE;
    IF NEW.status IN ('APPROVED','REJECTED') AND (decision_role IS NULL OR decision_role NOT IN ('OWNER','ADMIN','CHECKER')) THEN
      RAISE EXCEPTION 'An active checker is required to decide approval.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_approval_role_guard ON financial_transaction_approvals;
CREATE TRIGGER financial_approval_role_guard BEFORE INSERT OR UPDATE ON financial_transaction_approvals
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_financial_approval_roles();

CREATE OR REPLACE FUNCTION reachpay_guard_service_transaction_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false; service_permitted boolean := false;
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
  IF NEW.status IN ('READY_FOR_SUBMISSION','SUBMITTED') AND NEW.service_type IN ('DMT','BANK_TRANSFER') THEN
    IF NOT EXISTS (SELECT 1 FROM financial_merchant_organizations o WHERE o.id=NEW.organization_id AND o.status='ACTIVE' AND o.verification_status='VERIFIED') THEN
      RAISE EXCEPTION 'Verified merchant organization evidence is required before transfer submission.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM financial_provider_integrations p WHERE p.user_id=NEW.user_id AND p.product=NEW.service_type AND p.status='ACTIVE'
      AND p.verified_at IS NOT NULL AND p.permissions @> ARRAY[NEW.service_type]::text[]) THEN
      RAISE EXCEPTION 'Verified provider transfer permission is required before submission.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM financial_funding_sources f JOIN financial_funding_source_authorizations a ON a.funding_source_id=f.id
      WHERE f.id=NEW.funding_source_id AND f.user_id=NEW.user_id AND f.verification_status='VERIFIED' AND f.activation_status='ACTIVE'
      AND f.funding_permissions @> ARRAY[NEW.service_type]::text[] AND f.supported_services @> ARRAY[NEW.service_type]::text[]
      AND a.user_id=NEW.user_id AND a.service_type=NEW.service_type AND a.status='VERIFIED' AND a.funding_authorized=true
      AND a.valid_until>now() AND (a.balance_supported=false OR a.available_balance_paise >= NEW.amount_paise)) THEN
      RAISE EXCEPTION 'Verified funding-source authorization and available-funds evidence are required.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM financial_beneficiaries b JOIN financial_beneficiary_verification_records v ON v.beneficiary_id=b.id
      WHERE b.id=NEW.beneficiary_id AND b.user_id=NEW.user_id AND b.verification_status='VERIFIED' AND v.status='VERIFIED'
      AND v.provider IS NOT NULL AND v.provider_reference IS NOT NULL AND v.verified_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Provider-verified beneficiary evidence is required before submission.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM financial_transaction_approvals a WHERE a.transaction_id=NEW.id AND a.organization_id=NEW.organization_id
      AND a.status='APPROVED' AND a.requester_user_id<>a.approver_user_id AND a.approver_user_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Independent organization approval is required before submission.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM financial_limit_utilization u WHERE u.transaction_id=NEW.id AND u.status='RESERVED' AND u.amount_paise=NEW.amount_paise) THEN
      RAISE EXCEPTION 'Atomic transaction limit reservation is required before submission.';
    END IF;
    SELECT EXISTS (SELECT 1 FROM financial_transfer_instructions i WHERE i.transaction_id=NEW.id AND i.fee_status='PROVIDER_QUOTED'
      AND i.provider IS NOT NULL AND i.provider_fee_paise IS NOT NULL AND i.provider_fee_reference IS NOT NULL
      AND i.fee_valid_until>now()) INTO service_permitted;
    IF NOT service_permitted THEN RAISE EXCEPTION 'Verified provider transfer fee quote is required before submission.'; END IF;
    IF NEW.service_type='DMT' AND NOT EXISTS (SELECT 1 FROM financial_dmt_sender_profiles s JOIN financial_dmt_otp_attempts o ON o.sender_profile_id=s.id
      WHERE s.id=(SELECT sender_profile_id FROM financial_transfer_instructions WHERE transaction_id=NEW.id) AND s.kyc_status='VERIFIED'
      AND s.kyc_provider_reference IS NOT NULL AND s.kyc_verified_at IS NOT NULL AND o.status='VERIFIED'
      AND o.provider IS NOT NULL AND o.provider_reference IS NOT NULL AND o.verified_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Verified DMT sender KYC and OTP evidence are required before submission.';
    END IF;
  END IF;
  IF NEW.status IN ('SUCCESSFUL','REVERSED') AND NOT EXISTS (
    SELECT 1 FROM financial_service_payment_attempts a WHERE a.service_transaction_id=NEW.id
      AND a.provider=NEW.provider AND a.provider_reference=NEW.provider_reference AND a.provider_confirmed=true
      AND (NEW.status<>'REVERSED' OR (a.reversal_confirmed=true AND a.status='REVERSED'))
      AND (NEW.status<>'SUCCESSFUL' OR a.status='SUCCESSFUL')
  ) THEN RAISE EXCEPTION 'Verified provider evidence is required for successful or reversed service state.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_service_transaction_state_guard ON financial_service_transactions;
CREATE TRIGGER financial_service_transaction_state_guard BEFORE INSERT OR UPDATE OF status ON financial_service_transactions
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_service_transaction_status();

CREATE OR REPLACE FUNCTION reachpay_guard_transfer_transaction_org() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE member_role varchar(16); source_owner uuid; beneficiary_owner uuid;
BEGIN
  IF NEW.service_type NOT IN ('DMT','BANK_TRANSFER') THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL OR NEW.funding_source_id IS NULL OR NEW.beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'Transfers require an organization, funding source, and beneficiary.';
  END IF;
  SELECT role INTO member_role FROM financial_organization_members WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id AND status='ACTIVE' FOR SHARE;
  IF member_role IS NULL OR member_role NOT IN ('OWNER','ADMIN','MAKER') THEN RAISE EXCEPTION 'An active transfer maker is required.'; END IF;
  SELECT user_id INTO source_owner FROM financial_funding_sources WHERE id=NEW.funding_source_id;
  SELECT user_id INTO beneficiary_owner FROM financial_beneficiaries WHERE id=NEW.beneficiary_id;
  IF source_owner IS DISTINCT FROM NEW.user_id OR beneficiary_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Transfer funding source and beneficiary must belong to the requesting account.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS financial_transfer_transaction_org_guard ON financial_service_transactions;
CREATE TRIGGER financial_transfer_transaction_org_guard BEFORE INSERT ON financial_service_transactions
  FOR EACH ROW EXECUTE FUNCTION reachpay_guard_transfer_transaction_org();

CREATE OR REPLACE FUNCTION reachpay_reject_transfer_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Transfer approval history is append-only.'; END; $$;
DROP TRIGGER IF EXISTS financial_approval_history_immutable ON financial_approval_history;
CREATE TRIGGER financial_approval_history_immutable BEFORE UPDATE OR DELETE ON financial_approval_history
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_transfer_audit_mutation();
DROP TRIGGER IF EXISTS financial_org_audit_immutable ON financial_organization_audit_events;
CREATE TRIGGER financial_org_audit_immutable BEFORE UPDATE OR DELETE ON financial_organization_audit_events
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_transfer_audit_mutation();
DROP TRIGGER IF EXISTS financial_consent_immutable ON financial_dmt_sender_consents;
CREATE TRIGGER financial_consent_immutable BEFORE UPDATE OR DELETE ON financial_dmt_sender_consents
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_transfer_audit_mutation();
DROP TRIGGER IF EXISTS financial_dmt_otp_immutable ON financial_dmt_otp_attempts;
CREATE TRIGGER financial_dmt_otp_immutable BEFORE UPDATE OR DELETE ON financial_dmt_otp_attempts
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_transfer_audit_mutation();
DROP TRIGGER IF EXISTS financial_dmt_kyc_immutable ON financial_dmt_kyc_records;
CREATE TRIGGER financial_dmt_kyc_immutable BEFORE UPDATE OR DELETE ON financial_dmt_kyc_records
  FOR EACH ROW EXECUTE FUNCTION reachpay_reject_transfer_audit_mutation();

COMMIT;
