# Phase 6.2: BBPS, FASTag and Recharge Readiness

Date: 2026-10-12

## Summary

Phase 6.2 adds a provider-backed catalog foundation and a financial-services dashboard view. It does not enable bill fetch, BBPS payments, FASTag recharge, or recharge submission. Those operations remain unavailable because the local Eko credentials and product approvals are missing, and no approved relationship between the Paytm/PhonePe POS funding accounts and Eko services has been verified.

No billers, categories, plans, balances, payments, or receipts are fabricated. The catalog stays empty until a permitted provider catalog sync succeeds. The existing transaction engine remains the system of record for service requests. No ReachPay wallet or duplicate ledger was added.

## Phase 6.1 audit and safety changes

- Reused `financial_service_transactions`, funding-source references, transaction history, audit events, authentication, and idempotency.
- Added service status-transition guards. A successful service transaction now requires a matching provider-confirmed payment attempt and provider reference. A receipt requires the matching successful transaction evidence.
- Disabled accidental execution of the unused legacy wallet migration. The auth migration no longer applies that wallet schema. No wallet tables or financial records were dropped or rewritten.
- Database migration entry points touched by this work restrict targets to `reachpay_dev` and `reachpay_test`.

## Implemented

- Additive PostgreSQL catalog and evidence schema in `server/financial/service-catalog-migration.sql`:
  - versioned provider catalog snapshots and sync timestamps
  - provider categories, billers, and biller input parameters
  - encrypted bill-fetch account references and provider result fields
  - payment attempt records and verified-success constraints
  - deduplicated provider callback event IDs
  - evidence-gated receipts and complaint/reversal tracking
- Provider-neutral catalog, bill inquiry, payment, status, complaint, reversal, and recharge method contracts.
- Eko adapter for documented category, operator, parameter, mobile operator/circle, and plan discovery APIs. Requests use server-side configuration and are gated by product approval flags. The adapter does not expose or implement a payment call.
- Authenticated service endpoints:
  - `GET /api/financial/services/status`
  - `GET /api/financial/services/categories`
  - `POST /api/financial/services/catalog/sync`
  - `GET /api/financial/services/categories/:categoryId/billers`
  - `POST /api/financial/services/categories/sync-billers`
  - `GET /api/financial/services/billers/:billerId/parameters`
  - `GET /api/financial/services/recharge/operator?mobile=...`
  - `GET /api/financial/services/recharge/plans?mobile=...&operatorCode=...&circleId=...`
- The frontend now shows provider activation status, live catalog data when available, provider parameter requirements, and mobile operator discovery. It shows explicit unavailable states; it has no fabricated customer bill or payment.
- Service validation and transaction creation continue to use the Phase 6.1 transaction engine. Submit routes remain blocked and cannot create an external payment.

## Provider capabilities and limits

Official Eko documentation describes BBPS onboarding and service activation, category and operator discovery, biller-specific parameter discovery, bill fetch, bill payment, mobile operator/circle lookup, and recharge plans:

- [Eko BBPS overview and onboarding](https://developers.eko.in/docs/bbps)
- [Eko service activation](https://developers.eko.in/reference/activate-user-service)
- [Eko authentication](https://developers.eko.in/docs/auth)
- [BBPS category discovery](https://developers.eko.in/reference/bbps-get-categories)
- [BBPS operator discovery](https://developers.eko.in/reference/bbps-get-operators)
- [Biller parameter discovery](https://developers.eko.in/reference/bbps-get-operator-parameters)
- [BBPS bill fetch](https://developers.eko.in/reference/bbps-fetch-bill)
- [BBPS bill payment](https://developers.eko.in/reference/bbps-pay)
- [Mobile operator and circle lookup](https://developers.eko.in/reference/operator-and-circle-area)
- [Recharge plan lookup](https://developers.eko.in/reference/get-recharge-plan)
- [Transaction inquiry](https://developers.eko.in/reference/transaction-inquiry)

The code uses only documented catalog and discovery routes. It does not claim live provider verification. The local status is `CREDENTIALS_REQUIRED`; BBPS and recharge are `SERVICE_ACTIVATION_PENDING`.

## Exact blockers

- Missing `EKO_DEVELOPER_KEY`, `EKO_ACCESS_KEY`, `EKO_INITIATOR_ID`, and `EKO_USER_CODE`.
- `EKO_ONBOARDING_CONFIRMED`, `EKO_BBPS_APPROVED`, and `EKO_RECHARGE_APPROVED` are false.
- Eko requires organization KYC, product/service activation, and provider-specific agent configuration. Production access also requires its documented network allowlisting.
- Bill fetch additionally requires provider-required customer and location fields. No customer consent capture or bill presentation/confirmation workflow was activated without that verified response contract and access.
- No provider-approved evidence confirms that the existing Paytm or PhonePe POS wallet/funds can fund Eko BBPS or recharge debits. A POS payment or settlement is not treated as spendable service funding.
- FASTag availability is not assumed. It can appear only if an approved provider catalog returns a supported category/biller. No separate FASTag endpoint or permission was verified.
- DTH and other categories are likewise provider-catalog driven. No static category list is presented.
- Eko complaint, callback signature, and reversal contracts were not sufficiently verified for an active implementation. Those operations remain unavailable.

## Required environment variables

Credentials are server-only and blank in the example file:

- `EKO_API_ENV` (`uat` by default; production only after approval)
- `EKO_DEVELOPER_KEY`
- `EKO_ACCESS_KEY`
- `EKO_INITIATOR_ID`
- `EKO_USER_CODE`
- `EKO_ONBOARDING_CONFIRMED`
- `EKO_BBPS_APPROVED`
- `EKO_RECHARGE_APPROVED`

The approval flags must reflect actual provider onboarding evidence. They are not a substitute for permission. Payment submission remains hard-disabled in the adapter until a separately reviewed implementation verifies funding authorization, amount, status, and reversal behavior.

## Database and files

- Additive schema applied successfully to `reachpay_dev` and `reachpay_test`.
- Automated database fixtures use a transaction and roll back. They do not persist financial test records.
- The existing `reachpay` database was not accessed by this phase.
- Files changed for this phase: `.env.example`, `ai/ARCHITECTURE.md`, `database/migrations/001_financial_core.sql`, `package.json`, `scripts/check-auth-db.js`, `scripts/migrate-auth.js`, `scripts/migrate-pos.js`, `scripts/migrate-service-catalog.js`, `server/financial/eko-bbps-provider.js`, `server/financial/operations.js`, `server/financial/provider.js`, `server/financial/service-catalog.js`, `server/financial/service-catalog-migration.sql`, `src/components/FinancialWorkspace.css`, `src/components/FinancialWorkspace.jsx`, `tests/eko-service-provider.test.js`, and `tests/service-catalog-postgres.test.js`.
- The worktree also contains prior phase files and changes; they were preserved and are not all Phase 6.2 changes.

## Verification

- Full test suite: 94 passed, 0 failed, against `reachpay_test` for PostgreSQL tests.
- Lint: passed.
- Production build: passed.
- Provider configuration check: correctly reports missing Eko credentials and pending BBPS/recharge activation.
- No live provider calls or money movement were made.

## Phase 6.3 readiness

Ready for a later authorized provider integration after ReachPay receives documented Eko access, required service activation, and written confirmation of the funding source and reversal model. Then implement bill fetch and customer consent first, followed by payment initiation/status only after a reviewed and tested provider contract is available. Do not enable customer payments based only on catalog credentials or POS settlement data.
