-- gen_random_uuid() is built into supported PostgreSQL versions (13+); no extension privilege required.

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  mobile_e164 varchar(16) NOT NULL UNIQUE,
  password_hash char(128) NOT NULL,
  password_salt char(32) NOT NULL,
  email_verified_at timestamptz,
  mobile_verified_at timestamptz,
  verification_messages_consent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','LOCKED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_accounts_status_idx ON customer_accounts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_user_idx ON customer_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  code_hmac char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5), consumed_at timestamptz, delivery_status text NOT NULL DEFAULT 'QUEUED'
);
CREATE INDEX IF NOT EXISTS email_otp_user_time_idx ON email_otp_challenges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL, phone_e164 varchar(16) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS phone_otp_user_time_idx ON phone_otp_challenges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash char(64) PRIMARY KEY, window_started_at timestamptz NOT NULL, attempts integer NOT NULL CHECK (attempts >= 0)
);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), request_id text
);
CREATE INDEX IF NOT EXISTS auth_audit_user_time_idx ON auth_audit_events(user_id, created_at DESC);
