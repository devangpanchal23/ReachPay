# PhonePe Integrated EDC status and setup

Updated 2026-10-08.

## Integration finding

PhonePe's official developer portal publishes an Integrated EDC API. It supports server-side sale requests directed to a merchant, store, and terminal; the paired terminal retrieves the sale request and the customer completes payment on the physical device. The browser must call ReachPay's authenticated backend; it must never receive PhonePe salt credentials.

PhonePe MID/TID, External MID/TID, Store ID, store name, and address are identifiers, not API authentication. The documented X-VERIFY signing scheme requires a PhonePe-issued salt key and salt index. PhonePe must enable EDC Sale API for the merchant and configure the terminal for integrated mode. A successful sale-init response means the request was accepted, not that payment succeeded.

## Implemented here

- `server/pos/phonepe-provider.js`: UAT/production endpoints; request-envelope Base64 encoding; X-VERIFY signing; optional provider ID and callback URL; sale init, status check, signed callback verification, and transaction search.
- `server/pos/pos-controller.js`: authenticated, rate-limited merchant routes; amount validation; per-user terminal and transaction isolation; idempotency; status amount/identity matching; transaction updates; duplicate callback handling; and audit records. A timeout/ambiguous provider response remains UNKNOWN for later status/reconciliation.
- `src/components/FinancialWorkspace.jsx`: existing UI now describes the official PhonePe EDC path and its merchant enablement requirements.
- `.env.example`: lists the server-only PhonePe settings. No credentials are present in the repository.

Cancellation and refund are not implemented because the published Integrated EDC contract reviewed here does not document those operations. Reconciliation uses the published Txn Search API. Reconciliation only updates a record if merchant transaction ID and amount match.

## Production/UAT setup

1. Contact PhonePe Merchant/Offline Partner support or your PhonePe account representative. Ask to enable **Integrated EDC / EDC Sale API** for the existing merchant and terminal, confirm the terminal's integrated mode and one-to-one mapping, and issue the UAT and production `saltKey`, `saltIndex`, PhonePe `storeId`, and (if provider-onboarded) `providerId`.
2. Confirm whether the MID/TID printed on the device are exactly the `merchantId` and `terminalId` values PhonePe's EDC API expects. The API distinguishes `storeId`, `merchantId`, and `terminalId`; do not assume External MID/TID aliases.
3. Add `PHONEPE_POS_ENV=uat`, `PHONEPE_POS_STORE_ID`, `PHONEPE_POS_SALT_KEY`, `PHONEPE_POS_SALT_INDEX`, and optional `PHONEPE_POS_PROVIDER_ID` as deployment secrets. Set `PHONEPE_POS_CALLBACK_URL` to `https://<your-domain>/api/pos/phonepe/webhook` after deploying the app. Keep the salt key out of client-visible variables and logs.
4. In the existing POS workspace, select PhonePe, save PhonePe merchant MID and terminal TID, and use Test Connection. UAT merchant credentials must be configured before calls can reach PhonePe. PhonePe's UAT guide describes mocked EDC Pay API steps for test-mode outcomes.
5. Initiate a small UAT amount and verify that the existing terminal receives it. Complete PhonePe's documented mock-pay UAT flow; verify the signed callback and status endpoint both report the same amount, merchant, and transaction ID.
6. After PhonePe approves production activation, change `PHONEPE_POS_ENV=production`, supply production salt credentials, redeploy, and run a controlled live validation transaction.

The project's existing persistent POS storage is PostgreSQL-backed in production. Ensure `DATABASE_URL` and the normal POS encryption/rate-limit production secrets are configured. Production can only be considered ready after PhonePe merchant enablement, terminal acceptance, callback reachability over HTTPS/443, and a real authorized UAT/live transaction test.

## Test evidence

- `npm test`: 58/58 passing, including mocked PhonePe sale/status/search signing, response mapping, and callback signature verification. These are contract-level tests; they do not prove PhonePe has enabled this merchant or that the physical terminal is reachable.
- `npm run lint`: clean after the final fix.
- No live PhonePe request was sent because this workspace has no PhonePe credentials or merchant enablement evidence.

## Official references

- [EDC Sale Request API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-sale-request-api)
- [EDC S2S Callback API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-s2s-callback-api)
- [EDC StatusCheck API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-status-check-api)
- [EDC Txn Search API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-txn-search-api)
- [EDC UAT Testing](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-uat-testing)
- [PhonePe Offline Partner Program](https://www.phonepe.com/business-solutions/offline-merchant/partner-program/)
