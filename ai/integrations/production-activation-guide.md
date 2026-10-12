# ReachPay Production Activation Guide

Production activation is blocked until provider authorization, funding permission, production database deployment, and independent operational controls are verified. Environment flags alone do not approve activation.

## Current state

- Financial transaction submission is fail-closed.
- Paytm POS production initiation requires `PAYTM_POS_PRODUCTION_APPROVED=true` in server environment, plus valid provider configuration and merchant authorization.
- PhonePe POS production requires separate production salt key/index/provider ID, `PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED=true`, and `PHONEPE_POS_PRODUCTION_APPROVED=true`.
- Eko BBPS production must use separate `EKO_PRODUCTION_*` credentials and production approval configuration. UAT credentials are not accepted as production credentials.
- No production provider access, POS-funding permission, BBPS/DMT activation, payout provider, or production database has been verified.
- Runtime repositories currently permit only `reachpay_dev` and `reachpay_test`. A production database path needs a separate reviewed implementation and deployment plan.

## Activation sequence

1. **Legal and product approval**: confirm the business entity, merchant eligibility, customer flows, product permissions, and required regulatory approvals with counsel and each provider.
2. **Funding authorization**: identify the exact debit account for each service. Obtain written provider evidence that the account can fund that service. Do not use POS collections based on card-payment success or settlement status.
3. **Provider evidence**: complete [the onboarding checklist](provider-onboarding-checklist.md), record contract versions and permission scopes, and independently review all credentials and callback contracts.
4. **UAT**: run end-to-end cases using the provider's official sandbox/UAT and non-live test accounts. Verify callbacks, inquiries, idempotency, timeouts, duplicate delivery, refunds/reversals, reconciliation, and outage behavior.
5. **Production architecture**: implement a production database configuration that is separate from development/test, reviewed additive migrations, role separation, encrypted transport, pooling limits, backups, restore drills, and access audit. Never point production at `reachpay_dev` or `reachpay_test`.
6. **Secrets and network**: place credentials in an approved secret manager, split UAT/production, restrict network access and provider IP allowlists, deploy HTTPS and verified proxy/security headers, and rehearse rotation/revocation.
7. **Operations**: schedule and monitor `npm run financial:expire-transfers`; configure alerts for failed runs, stuck approvals, stale pending provider transactions, reconciliation mismatches, callback signature failures, and provider outages. Establish named on-call and provider escalation coverage.
8. **Controlled enablement**: require two-person review of provider evidence, set conservative approved limits, enable one service/provider at a time, and observe shadow/UAT or provider-approved limited production monitoring before increasing limits.
9. **Rollback**: document an immediate kill switch, disable new submissions without deleting records, continue status inquiry/reconciliation for in-flight transactions, and preserve provider evidence and audit logs.

## Required go-live sign-offs

- Business owner and compliance/legal approval.
- Provider-issued production approval and product permissions.
- Written funding source authorization for each transaction type.
- Security reviewer approval of credentials, callback verification, key rotation, limits, and role separation.
- Database and backup/recovery reviewer approval.
- Successful UAT report and reconciliation evidence.
- Operations owner, alert delivery, outage plan, and rollback rehearsal.

Do not mark a capability live until the relevant sign-offs and provider-confirmed production evidence are recorded. Never test by initiating an unauthorized live-money transaction.
