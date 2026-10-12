# Phase 6.1: Financial Dashboard, POS Management, and Transaction Engine

## Audit and architecture

- The project uses React/Vite in `src/` and a Node HTTP server in `server/index.js`.
- Existing POS APIs, Paytm and PhonePe adapters, PostgreSQL POS persistence, settlement tracking, reconciliation, authentication, rate limiting, and beneficiary management were retained.
- Correction recorded in Phase 6.2: Phase 6.1 APIs did not use the wallet model, but the pre-existing `scripts/migrate-auth.js` still included the legacy wallet draft. Phase 6.2 removes it from the auth migration path and adds an explicit failing guard to the draft SQL. Existing database objects are not deleted.
- POS payment success and merchant settlement remain separate states. The dashboard does not treat either as spendable funds.
- Existing account authentication is used. New queries are scoped to the signed-in account ID. A multi-user merchant organization and role/maker-checker model is not present and remains required before money movement.

## Implemented

- Added additive schema for provider integration references, encrypted funding-source references, financial service requests, state history, approval records, reconciliation records, append-only audit events, and POS Store ID/external MID/TID/provider-verification fields.
- Added a database migration command that refuses every database name except `reachpay_dev` and `reachpay_test`.
- Added authenticated financial APIs for dashboard aggregates, transaction list/detail/create/validate/submit, funding-source references, provider status, and reconciliation reporting.
- Financial service requests are PostgreSQL-only, idempotent, account-scoped, and begin in `DRAFT`. Validation records the actual blocker. Submission always fails closed while no approved provider/funding route exists. No financial provider transaction is initiated.
- Added an explicit transaction state machine. Ready/submitted/successful/reversed transitions require approval or provider evidence as appropriate.
- Funding-source references are encrypted at rest and returned masked. New references remain unverified and inactive; the API does not accept client-supplied permissions or verification claims.
- Added owner-scoped POS terminal listing and disable endpoints. Terminal output distinguishes configured references from provider verification. PhonePe Store ID, External MID, and External TID can be stored. Store ID is supplied to the PhonePe adapter for terminal-specific calls.
- Replaced overview figures and planned-service labels with PostgreSQL aggregates and provider availability data, including loading, empty, retry, and error states. Merchant balance remains unavailable.

## API endpoints

- `GET /api/financial/dashboard`
- `GET /api/financial/transactions?limit=&offset=&status=&type=`
- `POST /api/financial/transactions` with an idempotency key, creates a draft only
- `GET /api/financial/transactions/:reference`
- `POST /api/financial/transactions/:reference/validate`
- `POST /api/financial/transactions/:reference/submit`, returns unavailable until authorized integration exists
- `GET|POST /api/financial/funding-sources`
- `GET /api/financial/providers`
- `GET /api/financial/reconciliation?limit=&offset=`
- `GET /api/pos/:provider/terminals`
- `POST /api/pos/:provider/terminal-disable`
- Existing `GET|POST /api/pos/phonepe/config` now accepts Store ID and external identifiers.

## Database changes

Migration: `server/financial/operations-migration.sql`

- Applied to `reachpay_dev` and `reachpay_test` only.
- It is additive and preserves existing records. No migration or test connected to the existing `reachpay` database.
- Added owner/state indexes, foreign keys, idempotency uniqueness, audit/history immutability triggers, and terminal identity columns.

## Security controls

- Authenticated account scope, origin check for writes, rate limiting, server-side validation, parameterized SQL, response masking, and idempotency constraints.
- Financial operations reject a database URL whose database name is outside the approved development/test pair.
- Funding-source encryption requires `FUNDING_SOURCE_ENCRYPTION_KEY`; production operations fail closed if missing.
- No card data, provider secrets, or raw funding references are returned from the new APIs.
- No provider transaction was sent and no live-money operation was run.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- Full `npm test` with the database environment constrained to `reachpay_test`: 90 passed, 0 failed, 0 skipped.
- Focused PhonePe and financial operation tests: 10 passed, 0 failed.
- PostgreSQL test verified request persistence within a transaction, idempotency uniqueness, history writes, and rollback against `reachpay_test`.
- Both schema applications completed successfully. No credentials were printed in the report.

## Provider dependencies and blockers

- Paytm/PhonePe POS provider activation still depends on provider-issued credentials, merchant enablement, and permissions. Configured MID/TID/Store ID values do not prove provider ownership or terminal connectivity.
- No approved merchant spendable-balance API or funding permission is established. Settlement reports remain evidence of settlement only.
- BBPS, DMT, bank transfer, recharge, FASTag, bank verification, and live funding-source verification remain unavailable until an authorized provider contract, credentials, product permissions, and funding rules are verified.
- The new provider integration table is merchant/account-scoped but intentionally has no public activation API. Provider approval cannot be self-asserted through the frontend.
- Multi-user merchant roles, transaction approval workflows, transaction limits, and live-provider webhooks/status reconciliation for these new service requests need provider-specific design before submissions are enabled.

## Next phase readiness

Phase 6.2 can begin with provider onboarding evidence and a selected approved service provider. Implement one service adapter at a time, add provider-specific signed webhooks and status confirmation, then enable approved funding and maker-checker rules. Keep all live submissions disabled until those controls and provider evidence are in place.
