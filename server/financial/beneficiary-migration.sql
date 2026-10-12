BEGIN;

CREATE TABLE IF NOT EXISTS financial_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  display_name varchar(100) NOT NULL,
  destination_type text NOT NULL DEFAULT 'BANK' CHECK (destination_type = 'BANK'),
  bank_account_ciphertext text NOT NULL,
  bank_account_iv char(24) NOT NULL,
  bank_account_tag char(32) NOT NULL,
  ifsc_code char(11) NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  account_fingerprint char(64) NOT NULL,
  masked_destination varchar(32) NOT NULL,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','FAILED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_fingerprint, ifsc_code)
);

CREATE INDEX IF NOT EXISTS financial_beneficiaries_owner_time_idx
  ON financial_beneficiaries(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS financial_beneficiaries_owner_name_idx
  ON financial_beneficiaries(user_id, lower(display_name));

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

CREATE INDEX IF NOT EXISTS financial_audit_actor_time_idx
  ON financial_audit_logs(actor_user_id, created_at DESC);

COMMIT;
