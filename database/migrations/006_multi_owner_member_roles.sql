-- Allow multiple owners and the member role used by transaction approvals.
ALTER TABLE customer_accounts DROP CONSTRAINT IF EXISTS customer_accounts_role_check;
ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_role_check
  CHECK (role IN ('owner', 'member', 'approved_member', 'limited'));
ALTER TABLE customer_accounts ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE customer_accounts ALTER COLUMN access_status SET DEFAULT 'pending';

DROP INDEX IF EXISTS customer_accounts_single_owner_idx;

ALTER TABLE rbac_audit_events ADD COLUMN IF NOT EXISTS old_role text;
ALTER TABLE rbac_audit_events ADD COLUMN IF NOT EXISTS new_role text;
ALTER TABLE rbac_audit_events DROP CONSTRAINT IF EXISTS rbac_audit_events_event_type_check;
ALTER TABLE rbac_audit_events ADD CONSTRAINT rbac_audit_events_event_type_check
  CHECK (event_type IN ('MEMBER_ADDED','MEMBER_APPROVED','MEMBER_REVOKED','MEMBER_REMOVED','OWNER_PROMOTED','OWNER_DEMOTED','OWNER_BOOTSTRAPPED'));

CREATE OR REPLACE FUNCTION reachpay_protect_owner_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.role='owner' THEN
    RAISE EXCEPTION 'Owner accounts cannot be removed.';
  END IF;
  IF TG_OP='UPDATE' AND OLD.role='owner' AND (NEW.role <> 'owner' OR NEW.status <> 'ACTIVE' OR NEW.access_status <> 'approved') THEN
    PERFORM pg_advisory_xact_lock(hashtext('reachpay.owner.assignment'));
    IF (SELECT count(*) FROM customer_accounts WHERE role='owner' AND status='ACTIVE' AND access_status='approved' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'At least one owner account must remain.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS customer_accounts_owner_guard ON customer_accounts;
CREATE TRIGGER customer_accounts_owner_guard BEFORE UPDATE OR DELETE ON customer_accounts
  FOR EACH ROW EXECUTE FUNCTION reachpay_protect_owner_account();
