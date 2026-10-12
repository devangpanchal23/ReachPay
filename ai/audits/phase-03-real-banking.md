# ReachPay Phase 3: Real Banking Implementation

Date: 2026-10-12

## Summary

Implemented PostgreSQL-backed beneficiary management for the signed-in account. Bank account numbers are AES-256-GCM encrypted at rest, masked in API responses, and deduplicated with a keyed fingerprint. Beneficiary actions are scoped to the authenticated account and recorded in `financial_audit_logs`.

Bank ownership verification, merchant balances, transfers, and BBPS remain unavailable. No payment or transfer request is submitted, and no wallet or balance is created. Bank detail entry checks format only. A beneficiary is never marked verified by this application.

## Architecture reviewed

- React dashboard: `src/components/FinancialWorkspace.jsx`.
- Node HTTP API: `server/index.js`; authentication and account ownership use `server/auth-controller.js`.
- PostgreSQL authentication, POS transactions, settlement evidence, and reconciliation are separate existing paths. The existing Paytm settlement adapter is read-only and provider-gated.
- Financial provider methods in `server/financial/provider.js` are contract boundaries and fail closed when a provider is not configured.
- The existing authentication and POS schema was preserved. The new additive migration creates only beneficiary and audit-log tables. It does not apply the broader financial-core migration or create wallet/ledger data.

## Existing features preserved

- Paytm POS transaction and status paths remain in place.
- PhonePe Integrated EDC remains partner-access-gated.
- Paytm settlement lookup remains provider-gated and read-only; existing settlement persistence, webhook replay protection, and reconciliation paths were left intact.
- The existing tests for POS and settlement behavior pass as part of the complete suite.

## Implemented

- Add, edit, list, search, and deactivate bank beneficiaries.
- Structural checks for Indian IFSC format and 9–18 digit account numbers. This is not live branch or account validation.
- AES-256-GCM encryption of account details using server-only `BENEFICIARY_ENCRYPTION_KEY`; HMAC fingerprint supports duplicate prevention without storing plaintext account numbers.
- API responses contain only a masked account number. Account number is not returned to the browser during editing.
- Authenticated-user scoping on every read and write; duplicate account/IFSC pairs are rejected by a PostgreSQL unique constraint, including concurrent attempts.
- Beneficiary create, edit, and deactivate events are written transactionally to the audit log. Audit metadata contains no bank account values.
- Banking status endpoint reports verification, settlement funding, merchant balance, transfer, and BBPS integration states as unavailable or not established.
- Removed unsupported dashboard claims about a 20-minute wallet credit and “production-ready” banking status. The dashboard now separates POS payment status from settlement and account-contact verification from KYC.
- Runtime and migration database-name checks allow only `reachpay_dev` and `reachpay_test`.
- The migration refuses to proceed if an older incompatible beneficiary table is present, so it cannot silently leave the service with an unusable schema.

## Provider and funding review

- **Paytm settlement:** The [Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/) is documented as production-only and JWT-authenticated. It looks up a merchant order and reports payout/settlement evidence, including payout ID, settled date, and settled amount. It describes settlement to the merchant bank account. This does not establish a ReachPay wallet balance or show that the funds can be spent through another API.
- **Paytm transfer:** The [Bank Transfer API](https://business.paytm.com/docs/api/bank-transfer-api/) describes disbursing from a Paytm sub-wallet/disbursal account and requires merchant/sub-wallet details and a signed request. Its current documentation explicitly says bank/UPI payout modes are not available. No transfer adapter was implemented.
- **Paytm balance:** The [Fetch Balance Info API](https://business.paytm.com/docs/api/fetch-balance-info-api/) concerns Paytm Wallet, Paytm Payments Bank, and Paytm Postpaid balances tied to a payment transaction token. It is not a merchant POS settlement balance API.
- **Paytm Payouts:** The [Payouts product documentation](https://business.paytm.com/docs/paytm-payouts/introduction-internal) describes separately onboarded payout/disbursal accounts, passbooks, account validation, transfers, and bill-payment capabilities. ReachPay has no verified approval, merchant scope, credentials, or funding linkage for that product.
- **PhonePe:** The [PhonePe developer portal](https://developer.phonepe.com/) documents payment gateway and settlement flows. Public material reviewed did not establish an Integrated EDC API contract that lets this merchant spend POS settlement funds, verify an arbitrary beneficiary account, access a merchant balance, make IMPS/NEFT payouts, or submit BBPS payments. No such adapter was added.
- **Funding source conclusion:** POS settlement tracking is evidence of provider payout to the merchant bank account. It does not create funds inside ReachPay or authorize onward transfer. A separately approved and funded payout/BBPS product, with a provider-confirmed source-of-funds flow, is required before those features can be enabled.

## Database and tests

- Applied the additive beneficiary schema to `reachpay_dev` and `reachpay_test` only.
- Read-only verification confirmed PostgreSQL 18.6 and the beneficiary schema in both databases.
- PostgreSQL integration coverage verifies persistence, encrypted storage, masked responses, duplicate rejection, tenant isolation, edit/deactivate behavior, audit records, and truthful integration status. The beneficiary test removes its own test rows during cleanup.
- Full test suite: **87 passed, 0 failed, 0 skipped**. This includes the PostgreSQL beneficiary lifecycle and existing POS persistence/replay tests against `reachpay_test`.
- `npm run lint`: passed.
- `npm run build`: passed.
- No real-money transactions were submitted. The existing `reachpay` database was not used.

## Modified files

- `.env.example`
- `package.json`
- `server/index.js`
- `server/financial/beneficiaries.js`
- `server/financial/beneficiary-migration.sql`
- `scripts/migrate-beneficiaries.js`
- `src/components/FinancialWorkspace.jsx`
- `src/components/FinancialWorkspace.css`
- `tests/beneficiaries-postgres.test.js`
- `ai/audits/phase-03-real-banking.md`

The local ignored `.env` received a newly generated beneficiary-encryption key and remains excluded from Git. No credential value is included in this report.

## Remaining blockers and next steps

1. Obtain written Paytm confirmation of the enabled payout product, bank transfer availability, source-of-funds path, merchant MID scope, and current production API contract. The published bank transfer page currently marks bank/UPI modes unavailable.
2. Obtain PhonePe merchant-specific Integrated EDC, payout, beneficiary validation, and BBPS documentation, approvals, credentials, callback rules, and production enablement. Public PG settlement docs alone are insufficient.
3. Confirm whether provider settlement proceeds can lawfully and technically fund a separately approved disbursal account. Until then, settlement data must remain reporting-only.
4. Use provider account-validation confirmation before any future `VERIFIED` state exists. IFSC regex acceptance is only a syntax check.
5. Before production, provision the encryption key through managed secret storage, define backup and key rotation, and design merchant organization/user roles if multiple logins must share one merchant's beneficiary book. Current authorization scopes each record to one authenticated ReachPay account.

No live payout, BBPS, bank account verification, merchant balance, or settlement-to-wallet capability is claimed as implemented.
