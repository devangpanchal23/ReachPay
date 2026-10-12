# Phase 2.2: Paytm Settlement Integration

## Summary

Added a provider-gated, read-only Paytm Settlement Order Detail adapter and connected it to the existing reconciliation worker. The adapter does not initiate payments, refunds, transfers, or wallet credits. Payment success and merchant-bank settlement remain separate states.

## Official contract reviewed

- Paytm documents `POST https://secure.paytmpayments.com/merchant-settlement/SettlementTransactionDetail` as production-only. The request includes `mid`, `orderId`, and the order creation `transactionDate`, with a unique `reqMsgId`.
- Authentication uses the merchant's `clientId` header and a Bearer JWT signed with the merchant `clientSecret`. The documented JWT uses `email`, issuer `PAYTM`, issued-at time, and HMAC256.
- The documented response includes `orderId`, `originalMid`, transaction `amount`, `transactionType`, `status`, `payoutId`, `settledDate`, and `settledAmount`. Gross amount and settled amount are checked/stored separately because Paytm documents them as separate values.
- Paytm's public docs describe unique per-merchant client credentials but do not name an API permission/scope. Merchant API entitlement, exact permitted MID mapping, and JWT email must be confirmed with Paytm before enabling.
- References: [Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/) and [Settlement API Authentication Process](https://paytmpayments.com/docs/settlement-api-authentication-process).

## Existing and implemented behavior

- Existing Paytm POS payment status lookup remains intact.
- Settlement lookup runs only for a Paytm payment confirmed successful by the existing payment status API.
- The adapter is disabled unless `PAYTM_SETTLEMENT_API_APPROVED=true`, server-side credentials are present, the MID matches configured merchant ID, and the environment is `production`.
- It validates response request ID, acquiring transaction type, order ID, MID, gross amount, payout ID, settled amount, and settlement timestamp.
- Reconciliation persists verified payout ID, settled amount, settlement timestamp, and settlement state using the existing transaction fields. A pending or unavailable lookup keeps payment `SUCCESS` while settlement stays pending and retryable.
- A confirmed mismatch is recorded as `RECONCILIATION_MISMATCH`; no payout data is applied.
- Dashboard already renders settlement status and timestamp from persisted transaction data.

## Changed files

- `.env.example`
- `server/pos/paytm-provider.js`
- `server/pos/paytm-settlement-provider.js`
- `server/pos/pos-storage.js`
- `server/pos/pos-reconciliation.js`
- `scripts/reconcile-pos.js`
- `tests/paytm-settlement.test.js`
- `tests/paytm-settlement-reconciliation.test.js`
- `ai/audits/phase-02-2.md`

## Test and environment results

- Adapter tests cover successful settlement, pending settlement, duplicate response behavior, amount mismatch, invalid JWT/permission, timeout, provider unavailable, disabled configuration, staging block, and MID mismatch.
- Reconciliation tests cover verified payout persistence, pending settlement retry, and mismatch handling.
- Tests use mocked provider responses. No live Paytm API or financial transaction was invoked.
- PostgreSQL-backed persistence is not verified in this environment because `DATABASE_URL` is not configured. Existing phase 2.1 audit records this blocker. No migration or production data was touched.
- Credentials and merchant permission are not present, so live settlement verification remains blocked and the adapter stays disabled by default.

## Remaining blockers and next steps

1. Obtain Paytm's written confirmation that Settlement Order Detail API access is enabled for the merchant, including permitted MID and required JWT email/claim expectations.
2. Store the approved client ID, client secret, merchant ID, and email in server-side secret storage. Keep approval false until the merchant confirms authorization.
3. Configure a test database and run the existing PostgreSQL integration suite before relying on durable settlement persistence.
4. After access approval, verify against an authorized production account using read-only settlement lookup. Do not treat a reported settlement as spendable balance.
