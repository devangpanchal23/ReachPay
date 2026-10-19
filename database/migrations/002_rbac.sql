ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'limited',
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'limited';
ALTER TABLE customer_accounts ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE customer_accounts ALTER COLUMN access_status SET DEFAULT 'pending';

ALTER TABLE customer_accounts ALTER COLUMN mobile_e164 DROP NOT NULL;

ALTER TABLE customer_accounts DROP CONSTRAINT IF EXISTS customer_accounts_role_check;
ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_role_check
  CHECK (role IN ('owner', 'member', 'approved_member', 'limited'));
ALTER TABLE customer_accounts DROP CONSTRAINT IF EXISTS customer_accounts_access_status_check;
ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_access_status_check
  CHECK (access_status IN ('approved', 'pending', 'revoked', 'limited'));

DROP INDEX IF EXISTS customer_accounts_single_owner_idx;

CREATE TABLE IF NOT EXISTS rbac_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES customer_accounts(id) ON DELETE SET NULL,
  target_email varchar(254),
  event_type text NOT NULL CHECK (event_type IN ('MEMBER_ADDED','MEMBER_APPROVED','MEMBER_REVOKED','MEMBER_REMOVED','OWNER_PROMOTED','OWNER_DEMOTED','OWNER_BOOTSTRAPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  old_role text,
  new_role text
);
ALTER TABLE rbac_audit_events ADD COLUMN IF NOT EXISTS old_role text;
ALTER TABLE rbac_audit_events ADD COLUMN IF NOT EXISTS new_role text;
ALTER TABLE rbac_audit_events DROP CONSTRAINT IF EXISTS rbac_audit_events_event_type_check;
ALTER TABLE rbac_audit_events ADD CONSTRAINT rbac_audit_events_event_type_check
  CHECK (event_type IN ('MEMBER_ADDED','MEMBER_APPROVED','MEMBER_REVOKED','MEMBER_REMOVED','OWNER_PROMOTED','OWNER_DEMOTED','OWNER_BOOTSTRAPPED'));
CREATE INDEX IF NOT EXISTS rbac_audit_target_time_idx ON rbac_audit_events(target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION reachpay_capture_rbac_target_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_user_id IS NOT NULL AND NEW.target_email IS NULL THEN
    SELECT email INTO NEW.target_email FROM customer_accounts WHERE id=NEW.target_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rbac_audit_capture_target_email ON rbac_audit_events;
CREATE TRIGGER rbac_audit_capture_target_email BEFORE INSERT ON rbac_audit_events
  FOR EACH ROW EXECUTE FUNCTION reachpay_capture_rbac_target_email();

-- OWNER_EMAIL is provided by the migration runner. Only the configured verified account is promoted.
DO $$ BEGIN
  IF current_setting('reachpay.owner_email', true) IS NOT NULL
    AND btrim(current_setting('reachpay.owner_email', true)) <> '' THEN
    UPDATE customer_accounts SET role='owner', access_status='approved', updated_at=now()
      WHERE lower(btrim(email))=lower(btrim(current_setting('reachpay.owner_email', true)))
        AND email_verified_at IS NOT NULL AND status='ACTIVE'
        AND role <> 'owner';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reachpay_protect_owner_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.role='owner' THEN
    RAISE EXCEPTION 'The owner account cannot be removed.';
  END IF;
  IF TG_OP='UPDATE' AND OLD.role='owner' AND (NEW.role <> 'owner' OR NEW.status <> 'ACTIVE' OR NEW.access_status <> 'approved') THEN
    PERFORM pg_advisory_xact_lock(hashtext('reachpay.owner.assignment'));
    IF (SELECT count(*) FROM customer_accounts WHERE role='owner' AND status='ACTIVE' AND access_status='approved' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'At least one active owner account must remain.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customer_accounts_owner_guard ON customer_accounts;
CREATE TRIGGER customer_accounts_owner_guard BEFORE UPDATE OR DELETE ON customer_accounts
  FOR EACH ROW EXECUTE FUNCTION reachpay_protect_owner_account();
