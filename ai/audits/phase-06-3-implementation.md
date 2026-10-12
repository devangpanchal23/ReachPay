# Phase 6.3: DMT, Bank Transfers, and Financial Approval

## Summary

ReachPay now has database-backed organization, sender-consent, beneficiary-verification request, transfer-draft, approval, and merchant-limit workflows. External transfer submission remains disabled. No provider API was called and no live financial transaction was initiated.

## Audit findings

- Authentication is the existing account/session system. Organization membership and roles now add transaction-level authorization without replacing account authentication.
- Existing beneficiary, funding-source, POS, provider-status, financial transaction, transaction-history, audit, and reconciliation tables were reused.
- The existing financial transaction state machine remains the transaction ledger. New transfer instructions refer to it; no separate wallet or ledger was created.
- Existing funding-source records do not prove Paytm/PhonePe POS proceeds are available or authorized for remittance. POS balance remains unavailable.
- The transaction submission endpoint remains fail-closed and returns provider unavailable. Approval alone cannot submit money.

## Implemented

- Merchant organizations, owner/admin/maker/checker/viewer memberships, active-member checks, and organization-scoped access.
- Encrypted DMT sender mobile records, masked display, consent version/hash, and append-only consent/KYC/OTP attempt records. DMT KYC and OTP requests record unavailable status; they do not fabricate verification or send codes.
- DMT, own-business bank-transfer, and third-party bank-transfer draft types, persisted as instructions attached to the existing financial transaction.
- Provider-verification request records for saved beneficiaries. Requests are unavailable until a provider is configured; no paid check was called.
- Approval requests and immutable decision history. The database prevents cross-organization approvals, inactive or unauthorized checkers, and maker self-approval. Rejected requests fail the draft and release its limit reservation.
- Organization and per-user daily, monthly, and per-transaction merchant limits. Organization row locking makes reservation atomic under concurrent requests. Provider/regulatory limits can be represented as separate rows and the lowest applicable cap is enforced; no provider limits are assumed or configured.
- Database guards require verified organization, provider, funding authorization/funds evidence, provider-verified beneficiary, provider fee quote, checker approval, limit reservation, and DMT KYC/OTP evidence before a transfer can reach submission states.
- Responsive transfer workspace for organizations, members, limits, sender consent, verification availability, drafts, approvals, and history. It labels provider and funding blockers and does not show balances or fictional transactions.
- Provider-neutral contracts now expose sender onboarding/OTP/KYC, fee quote, account verification, bank transfer, status, reversal, and reconciliation operations. Their default implementation fails closed.

## Database changes

Added additive, repeatable migration `server/financial/transfer-controls-migration.sql` and runner `scripts/migrate-transfer-controls.js` (`npm run db:migrate:transfer-controls`). It adds organization membership/audit, sender consent/KYC/OTP, beneficiary verification, transfer instructions, approval history, limit policies/utilization, funding authorization evidence, and transaction state guards.

Migration execution was restricted to `reachpay_dev` and `reachpay_test`. The existing `reachpay` database was not accessed. No existing financial records were deleted or reset.

## API endpoints

- `GET|POST /api/financial/organizations`
- `GET|POST /api/financial/organizations/:id/members`
- `PATCH /api/financial/organizations/:id/members/:userId`
- `GET|PUT /api/financial/organizations/:id/limits`
- `GET|POST /api/financial/organizations/:id/senders`
- `POST /api/financial/organizations/:id/senders/:senderId/otp`
- `POST /api/financial/organizations/:id/senders/:senderId/kyc`
- `POST /api/financial/organizations/:id/beneficiaries/:beneficiaryId/verification`
- `GET|POST /api/financial/organizations/:id/approvals`
- `POST /api/financial/organizations/:id/approvals/:approvalId`
- Existing `POST /api/financial/transactions` creates DMT or bank-transfer drafts using `organizationId`, `transferProduct`, `senderProfileId` for DMT, `beneficiaryId`, `fundingSourceId`, amount in paise, and an idempotency key.
- Existing `POST /api/financial/transactions/:reference/submit` remains disabled until provider and funding authorization are verified.

All organization write routes require authenticated membership, role checks, and origin validation. Responses do not include encrypted sender or bank data.

## Provider findings and dependencies

- Eko publishes a DMT flow requiring sender/recipient onboarding, OTP, an authenticated transaction request, and status inquiry. Its docs say timed-out transfers must be inquired using the client reference and not treated as failed. The documented refund flow requires customer OTP and credits Eko eValue. This does not establish that Paytm/PhonePe POS funds can fund Eko DMT. No Eko API was called and no adapter was activated. See [Eko DMT initiation](https://developers.eko.in/reference/initiate-transaction-levin), [transaction inquiry](https://developers.eko.in/reference/transaction-inquiry), and [Eko refund process](https://developers.eko.in/docs/refund-process).
- Eko documents bank-account verification as a ₹1 transfer to obtain the account-holder name. This paid operation was not called. See [Eko bank account verification](https://developers.eko.in/reference/bank-account-verification).
- Paytm's public payout material describes separate payout/disbursal accounts and sub-wallet references. Its bank-transfer page also states that bank-transfer/UPI payout modes are not currently available, while listing a bank-transfer interface. This is conflicting product information and does not prove POS settlement proceeds are an eligible source. Obtain written product, account, permission, and funding confirmation from Paytm before integration. See [Paytm Bank Transfer API](https://business.paytm.com/docs/api/bank-transfer-api/) and [Paytm Payouts overview](https://business.paytm.com/docs/paytm-payouts/introduction-internal).
- No PhonePe merchant DMT or payout API, permission, or POS-wallet funding relationship was verified in the official material accessible for this audit. Request the merchant-specific official product/API documentation and written activation confirmation.
- Eko onboarding, merchant eligibility, regulatory approval, provider credentials, service permissions, funding account, limits/fees, webhook signing details, and production approval remain provider/business onboarding blockers.

## Required configuration

- `DMT_DATA_ENCRYPTION_KEY`: required to encrypt sender mobile data. The local ignored `.env` has a private key configured for development; it is not committed or included in this report. Configure a separately managed secret in each deployment environment and plan key rotation/backup before storing production data.
- Provider credentials and merchant permissions are not configured or verified. No provider activation flag is enabled.
- Existing funding-source encryption configuration remains required for funding-source records. It does not itself grant transfer permission.

## Security controls and remaining issues

- Maker and checker roles must be distinct. Only an active organization member with checker permissions may decide an approval.
- Organization, funding-source, beneficiary, and transaction ownership is checked in application logic and reinforced with database triggers.
- Sender information is encrypted using AES-256-GCM and displayed masked. Consent, approval, and organization audit history is append-only.
- Idempotency prevents request replay from creating a second transaction. Limit reservation is atomic and protected by organization-row locking.
- Provider callback signing, live transaction submission, timeout reconciliation, reversal processing, provider fee quotes, sender KYC/OTP verification, and paid account verification are not implemented against a live API. They remain disabled until documentation, credentials, signed callback contract, permissions, and test/sandbox access are supplied.
- Limit reservations are released on checker rejection. An expiry/cancellation worker for abandoned drafts or pending approvals is still needed before production use.
- Provider/regulatory limit records require a trusted ingestion/configuration process and evidence before production. Merchant-configured values alone are not compliance limits.
- Production key custody, organization legal verification workflow, customer KYC retention policy, consent withdrawal workflow, and regulatory/product review still require design and provider confirmation.

## Files changed for Phase 6.3

- `.env.example`
- `package.json`
- `scripts/migrate-transfer-controls.js`
- `server/financial/operations.js`
- `server/financial/provider.js`
- `server/financial/service-catalog-migration.sql`
- `server/financial/transfer-controls-migration.sql`
- `server/financial/transfer-controls.js`
- `src/components/FinancialWorkspace.jsx`
- `src/components/FinancialWorkspace.css`
- `tests/transfer-controls.test.js`
- `ai/audits/phase-06-3-implementation.md`

## Validation

- Focused PostgreSQL transfer-control tests: 2 passed, 0 failed against `reachpay_test`.
- Full test suite: 96 passed, 0 failed against the isolated test database. `DATABASE_URL` was removed for the run; the runner verified `REACHPAY_TEST_DATABASE_URL` names only `reachpay_test`.
- Lint: passed.
- Production build: passed.
- Migration: additive migration applied to `reachpay_dev` and `reachpay_test` only.
- No live provider API requests, account-verification charges, money movement, production DB access, or deployment occurred.

## Phase 6.4 readiness

Internal persistence, authorization, approval, and limit foundations are ready for provider onboarding tests. Live DMT or bank transfers are not ready. Before Phase 6.4 enables a provider, obtain the approved product contract, merchant eligibility/KYC approval, exact permitted funding source, fee/limit rules, API credentials, official sandbox access, callback/status/reversal contract, and explicit approval for any paid verification or live transaction. Keep submission disabled until those items and end-to-end provider evidence are verified.
