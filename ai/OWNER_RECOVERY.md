# Protected owner recovery

Use this procedure when the configured owner cannot reach owner-only features. Do not delete an account, clear verification fields, or manually change a role. Do not create a second owner.

## 1. Check deployment configuration

In Vercel, confirm `OWNER_EMAIL` is the exact email address of the existing protected owner account. Do not put its value in a ticket, terminal command, or log. Confirm the production deployment uses the intended Neon database and that `db:check:auth-schema` passes.

## 2. Restore access to the existing owner

If the account row already has `role = 'owner'`, keep that row. Correct `OWNER_EMAIL` to match the existing owner email and redeploy. The account must be active and have both email and mobile verified before the server grants owner powers. If mobile is pending, sign in and complete mobile verification first; the limited session cannot access owner features.

If the owner is missing but the configured account exists, make sure it is active and both contact methods are verified, then run `npm run db:migrate:auth` with the production `DATABASE_URL` and `OWNER_EMAIL` set only in that terminal session. The repeat-safe bootstrap promotes the configured account only when no owner already exists.

## 3. If another or inconsistent owner exists

Stop. Do not try to force a second owner or remove the current one. There must be exactly one protected owner, and recovery must not lock out or replace that owner. The unique owner index and database trigger protect the current owner from deletion, demotion, revocation, and locking. Resolve access to the existing owner identity, or arrange a reviewed recovery change that preserves the existing owner continuously and audits the change. Do not run ad hoc SQL against production.

If a login-time owner promotion fails, the account can still sign in under its normal verified or limited access rules. Use the schema check and repeat-safe auth migration to investigate an unassigned configured owner. Never create a second owner to work around the failure.

After access is restored, verify the owner can sign in, complete both verification steps, and open owner-only tools. Confirm a non-owner still receives an access denial. Live financial operations must remain disabled.
