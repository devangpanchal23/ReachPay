-- Promote only the configured, verified, active owner account.
-- Re-running this migration is safe. An existing different owner is never replaced.
DO $$
DECLARE
  configured_owner_email text := nullif(btrim(current_setting('reachpay.owner_email', true)), '');
BEGIN
  IF configured_owner_email IS NULL THEN
    RETURN;
  END IF;

  UPDATE customer_accounts
  SET role = 'owner', access_status = 'approved', updated_at = now()
  WHERE lower(btrim(email)) = lower(btrim(configured_owner_email))
    AND email_verified_at IS NOT NULL
    AND status = 'ACTIVE'
    AND (
      role = 'owner'
      OR NOT EXISTS (SELECT 1 FROM customer_accounts WHERE role = 'owner')
    );
END
$$;
