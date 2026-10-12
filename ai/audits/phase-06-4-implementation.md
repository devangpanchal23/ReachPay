# Phase 6.4: Provider Integration, Security Audit, and Production Readiness

## Executive summary

ReachPay remains in safe mode for financial operations. No live payment, payout, bill payment, account verification, or provider API call was performed during this phase. No provider credentials or merchant activation evidence were available to verify a live integration.

Internal controls were hardened where evidence and existing architecture allowed. The project now supports expiry and user cancellation for eligible transfer drafts, with approval cancellation and reserved-limit release inside the same database transaction. Provider configuration is separated by environment for PhonePe POS and Eko BBPS, and production calls fail closed unless separate production credentials and server-side approval flags are present. These flags are safeguards, not proof of provider authorization.

## Audit findings

- The POS collection and settlement records do not establish spendable provider-wallet funds or permission to fund DMT, BBPS, or third-party transfers.
- The existing Eko BBPS catalog layer is provider-gated. Bill fetch and payment submission are not implemented as active provider operations.
- DMT sender, consent, KYC/OTP request, beneficiary verification, approval, limit, and transaction records are internal workflows. KYC, OTP, fee quote, beneficiary verification, transfer submission, inquiry, and reversal still require provider contracts and merchant access.
- PhonePe POS has a provisional server-side adapter based on an API shape that the public partner material reviewed here does not establish. Calls remain disabled until the private merchant contract is reviewed and confirmed server-side. Merchant credentials, EDC enablement, callback deployment, and UAT evidence are also missing. Adapter tests intercept HTTP and do not verify PhonePe connectivity or an official contract.
- Paytm POS sale initiation and settlement lookup are separate from payout/funding products. Settlement detail is settlement evidence, not an API for spendable balance.
- No approved bank payout provider is selected or configured.
- Financial routes and storage reject database names other than `reachpay_dev` and `reachpay_test`. This deliberate guard means production deployment requires a separately reviewed database configuration and migration plan; production must not be pointed at either development database.

## Changes made

- Added additive transfer expiry fields and indexes. Existing draft/approval rows receive a 24-hour expiry from their creation time.
- Added `POST /api/financial/transactions/:reference/cancel` for an authenticated transaction owner to cancel eligible draft or authorization-pending transfers.
- Added `expireAbandonedTransfers()` with row locking and `SKIP LOCKED`. It cancels pending approvals, records audit/state history, expires eligible drafts, and releases reserved limits atomically.
- Added `npm run financial:expire-transfers`, a manual or scheduler-friendly maintenance command. It refuses database names other than `reachpay_dev` and `reachpay_test`, and reports counts only. No scheduler/monitor is configured in this repository.
- Separated PhonePe POS UAT and production credentials and activation flags. The private-contract confirmation, production-specific confirmation, and server approval are required before calls. Request signing, status, and callback verification use the transaction's selected environment. The public API contract remains unverified.
- Added a server-side Paytm POS production gate.
- Separated Eko BBPS UAT and production credentials. UAT credentials cannot activate production requests.
- Removed raw upstream response bodies from Paytm parsing errors and sanitized provider-originated error text.
- Added production guards to authentication and POS database pools and disabled runtime schema changes in production. Financial services are intentionally not made production-ready by these changes.

## Provider documentation review

### Paytm POS and settlement

Paytm's POS payment-request documentation describes dispatching a payment request to an EDC terminal and separately checking transaction status. The settlement detail API reports settlement data and requires the relevant authenticated merchant access. These contracts do not document a POS-wallet balance debit for BBPS, DMT, or third-party payouts. No funding relationship is inferred.

- [Paytm POS payment request flow](https://business.paytm.com/docs/pos-connection-via-payment-request)
- [Paytm POS payment request API](https://business.paytm.com/docs/api/pos-payment-request-api/), documented POST `/edc-integration-service/payment/request`, with `clientId` and request hash fields.
- [Paytm Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/)

### PhonePe POS

The repository contains a provisional Integrated EDC adapter shape, but the official public partner material reviewed did not publish an executable endpoint/payload/signature contract. The app keeps outbound calls and callback processing disabled until private merchant-contract confirmation is set server-side. No live PhonePe call or sandbox test was performed. Obtain and review the private contract, merchant credentials, UAT permission, terminal activation, callback contract, and production permission before enabling it. No PhonePe POS balance inquiry or permission to fund DMT, BBPS, or payouts was verified.

### Eko BBPS and DMT

Eko's public DMT-Levin API documentation describes a staging transaction endpoint, authenticated request headers, sender OTP and client reference fields, and states that timeouts must be resolved using transaction inquiry rather than treated as failure. Its refund guidance describes an OTP-confirmed flow and credit to the Eko eValue account. That does not prove Paytm or PhonePe POS collections can fund Eko transactions.

- [Eko DMT-Levin initiation](https://developers.eko.in/reference/initiate-transaction-levin)
- [Eko transaction inquiry](https://developers.eko.in/reference/transaction-inquiry)
- [Eko refund process](https://developers.eko.in/docs/refund-process)
- [Eko BBPS guide](https://developers.eko.in/docs/bbps)
- [Eko BBPS bill fetch](https://developers.eko.in/reference/bbps-fetch-bill)
- [Eko BBPS payment](https://developers.eko.in/reference/bbps-pay)

The published Eko staging contracts reviewed list `POST https://staging.eko.in:25004/ekoapi/v3/customer/payment/dmt-levin`, `GET .../ekoapi/v3/customer/payment/bbps/operators`, `GET .../ekoapi/v3/customer/payment/bbps/operator/{operator_id}/parameters`, `GET .../ekoapi/v3/customer/payment/bbps/bill`, and `POST .../ekoapi/v3/customer/payment/bbps`. The docs specify `developer_key`, `secret-key`, and `secret-key-timestamp` headers for these API families. These are provider documentation references only. ReachPay did not call them, and no production service activation is established. Confirm current endpoint versions and merchant-specific credentials with Eko before any adapter is enabled.

Eko docs are not merchant activation. Product access, retailer/merchant onboarding, service activation, approved funding, production credentials, endpoint details, callback/signature rules, fees, limits, and sandbox/UAT access must be confirmed directly for this business. Some billers may not support bill fetch. No bill fetch or payment was called.

## Security and operational controls

- Provider secrets remain server-side. Environment variables are split between UAT and production for the providers covered by this phase.
- PhonePe callback verification uses environment-specific credentials, the reviewed private-contract gate, and exact merchant/store/terminal/amount matching before state updates. The private callback contract still requires merchant verification.
- Transfer cancellation and expiry run in a database transaction. Row locks prevent concurrent expiry work from processing the same transaction, and reserved limit usage is released as part of the state change.
- The expiry command is not automatically scheduled. Production operations must provision a single or safely concurrent scheduler and monitor failures and expired counts.
- The API binds to `127.0.0.1` in this repository. A production reverse proxy must provide HTTPS, security headers, request limits, trusted proxy configuration, and controlled network exposure. This repository alone does not verify a production edge deployment.
- Production backup/restore, secret-manager custody, key rotation, alert delivery, incident recovery, and provider outage runbooks have not been exercised.

## Database changes

The additive transfer-control migration was applied only to `reachpay_dev` and `reachpay_test`. No connection was made to the existing `reachpay` database. The transaction expiry migration preserves existing records and only assigns deadlines to eligible draft/approval states.

## Validation

- `npm test`: 102 passed, 0 failed, against `reachpay_test`. The runner verified the database name and removed `DATABASE_URL` before starting tests.
- `npm run lint`: passed.
- `npm run build`: passed.
- The additive transfer-control migration, including expiry fields and indexes, was applied to `reachpay_dev` and `reachpay_test` only. The existing `reachpay` database was not connected to.
- Initial sandbox test attempt could not connect to local PostgreSQL due to sandbox network restrictions. The same suite then passed with authorized access constrained to `reachpay_test`.
- No provider API call, paid account verification, live transaction, production database access, or deployment occurred.

## Remaining blockers

1. Obtain written Paytm/PhonePe confirmation of product, merchant ownership, POS integration mode, transaction status/callback access, and any permitted funding relationship.
2. Obtain written confirmation of spendable balance APIs, reserved/available balance semantics, permitted BBPS/DMT/payout debits, settlement, chargeback, refund, and reversal treatment. Until then, POS collections cannot fund these services.
3. Select and onboard the authorized BBPS/DMT provider and, separately, any own-business payout provider. Obtain production-specific credentials, permissions, limits, fees, UAT access, callback and inquiry contracts, and onboarding evidence.
4. Complete real provider sandbox/UAT end-to-end verification. No such verification has been possible with the available credentials.
5. Design and review the production database deployment and migration process. Current runtime repositories intentionally allow only development/test database names.
6. Configure and monitor the expiry scheduler, HTTPS reverse proxy, production secrets, backup/recovery, alerting, and incident procedures.
7. Complete legal, compliance, and regulatory review for the intended merchant-operated customer flows before offering or activating them.

## Files changed for this phase

- `.env.example`
- `package.json`
- `scripts/expire-financial-transfers.js`
- `server/auth-controller.js`
- `server/financial/operations.js`
- `server/financial/transaction-maintenance.js`
- `server/financial/transfer-controls.js`
- `server/financial/transfer-controls-migration.sql`
- `server/pos/paytm-provider.js`
- `server/pos/phonepe-provider.js`
- `server/pos/pos-controller.js`
- `server/pos/pos-storage.js`
- `src/components/FinancialWorkspace.jsx`
- `tests/eko-service-provider.test.js`
- `tests/pos-phonepe.test.js`
- `tests/transfer-controls.test.js`
- `ai/audits/phase-06-4-implementation.md`
- `ai/integrations/provider-onboarding-checklist.md`
- `ai/integrations/production-activation-guide.md`
- `ai/security/financial-security-audit.md`
