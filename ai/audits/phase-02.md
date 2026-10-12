# Phase 2: POS Wallet and Settlement Integration Audit

## Summary

The repository has Paytm POS request/status operations and a PhonePe Integrated EDC adapter. The current checkout has no provider credentials or database connection configured, so no merchant MID/TID, permission, endpoint reachability, settlement, refund, or live account balance can be verified. No provider calls or financial transactions were made.

Settlement lifecycle fields and a dashboard column were added. Provider-confirmed settlement is not yet integrated end to end. A successful POS payment is shown as `SETTLEMENT_PENDING`; it is never treated as ReachPay wallet funds. ReachPay does not implement a spendable wallet ledger.

## Existing features

- Paytm POS request initiation, status enquiry, webhook checksum checks, idempotency, and pending-transaction synchronization.
- PhonePe Integrated EDC sale, status enquiry, signed callback, and transaction search adapters.
- PostgreSQL-backed POS terminal and transaction storage, with local development storage fallback.
- Existing dashboard transaction history and status actions.
- PhonePe terminal API calls now require `PHONEPE_POS_CONTRACT_CONFIRMED=true` in addition to server-only credentials. This prevents configured-looking MID/TID values from enabling a call without confirming the private merchant contract and permissions.

## Provider contract findings

### Paytm

- Official Wireless EDC docs describe payment request and status verification. An accepted payment request is not proof that the terminal payment completed. [Payment Request API](https://business.paytm.com/docs/api/pos-payment-request-api/)
- The official Settlement Order Detail API returns payout ID, settled amount, settled date, transaction type, and refund/chargeback information. It is production-only and uses JWT bearer authentication plus a client ID. The required JWT/tokenization setup and merchant permission are not present in this checkout, so this API was not called or wired as if it were available. [Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/)
- The enabled Paytm EDC adapter does not support an unrestricted available-merchant-balance endpoint. The wallet balance API in Paytm docs concerns Paytm customer wallet/payment instruments, not the merchant's POS settlement balance. No merchant balance is inferred.
- Refunds can be tracked via Paytm settlement transaction detail or refund APIs when the merchant is enabled. The current checkout has no verified refund permission/configuration; no refund request was sent. [Paytm POS refund flow](https://business.paytm.com/docs/pos-other-supported-flows/)

### PhonePe

- The official Integrated EDC docs publish sale initiation, status check, S2S callback, and transaction search. Status responses include payment status, amount and reference number. [EDC Sale Request](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-sale-request-api), [EDC Status Check](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-status-check-api), [EDC Transaction Search](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-txn-search-api), [EDC S2S Callback](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-s2s-callback-api)
- The reviewed Integrated EDC API set does not publish settlement detail, merchant available balance, or refund operations. These are unsupported in this adapter until PhonePe supplies an approved contract and credentials.
- The contract-confirmation switch is an operational safeguard. It does not verify credentials, merchant activation, terminal mode, callback reachability, or permissions.

## Settlement and status behavior

- A payment status of `SUCCESS` now initializes `settlement_status` as `SETTLEMENT_PENDING`.
- Settlement fields in PostgreSQL include status, payout ID, settled amount, settled timestamp, refund status, and refunded amount. Legacy tables receive additive columns through the existing POS migration.
- The dashboard shows payment status and settlement status separately.
- Settlement classification accepts only a matching provider record with matching merchant order ID and amount, plus payout ID and settlement timestamp, as `SETTLED`. Mismatches classify as `RECONCILIATION_MISMATCH`.
- The classifier currently has unit coverage only. No provider settlement response is fetched or persisted by an operational route yet. Therefore dashboard settlement will remain pending until the official API access and integration are completed.
- No ReachPay wallet credit or spendable balance is created from POS success or settlement status.

## 20-minute claim

Not verified. The reviewed Paytm settlement detail documentation describes provider-returned payout/settlement timestamps but gives no 20-minute guarantee. The reviewed PhonePe EDC pages describe payment status and terminal callbacks/search, not settlement timing. Do not present 20 minutes as a settlement SLA without provider-approved evidence.

## Modified files

- `server/pos/phonepe-provider.js`: requires explicit private contract confirmation before provider calls.
- `server/pos/pos-migration.sql`: additive settlement and refund tracking columns.
- `server/pos/pos-storage.js`: permits settlement field persistence and returns those fields in transaction lists.
- `server/pos/pos-controller.js`: successful payment transitions set settlement state to pending, including callbacks and status refresh.
- `server/pos/settlement-status.js`: validates settlement evidence and detects order/amount mismatches.
- `src/components/FinancialWorkspace.jsx`: displays settlement separately from payment status.
- `tests/pos-phonepe.test.js`, `tests/pos-settlement.test.js`: add contract-gate and settlement lifecycle cases.

## Verification

- `npm test`: 68 passed, 0 failed. This includes mocked provider flows, duplicate Paytm webhook, failed/pending status, PhonePe signed callback/status/search, settlement pending, duplicate settlement classification, timeout/no evidence, refund classification, and reconciliation mismatch.
- `npm run lint`: passed.
- `npm run build`: passed. `.env` was absent and the build completed without it.
- PostgreSQL connectivity and migration execution were not verified because `DATABASE_URL` is not configured in this checkout.
- Provider credentials, MID/TID mapping, JWT settlement scope, PhonePe EDC enablement, callback delivery, and production permissions remain unverified.
- No live money movement, refund, deployment, or external provider request was performed.

## Remaining blockers and next steps

1. Obtain approved Paytm settlement API JWT/tokenization instructions, production client ID, merchant scope, and permission. Then implement a read-only settlement lookup and persist verified provider response fields.
2. Obtain PhonePe confirmation for the private merchant agreement, Store ID, terminal IDs, enabled Integrated EDC solution, and callback signing configuration. Keep the contract switch off until confirmed.
3. Ask each provider whether a merchant balance API and POS refund API are enabled for this account. Do not substitute customer wallet balance APIs.
4. Configure a non-production PostgreSQL database and run the additive migration, then verify transaction and settlement rows against provider-approved test fixtures or sandbox evidence.
5. Add an operational reconciliation job and durable webhook event IDs before enabling production settlement processing. Current webhook duplicate handling is transaction-state based and is not a durable event ledger.
6. Confirm settlement timing in a merchant-specific provider SLA. No 20-minute settlement promise is established by the reviewed public docs.
