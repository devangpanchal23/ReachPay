# ReachPay Phase 5: POS Wallet and Financial Services Integration

Date: 2026-10-12

## Outcome

**POS card collection and settlement reporting exist. A provider wallet balance and direct POS-settlement funding path do not.** The official material reviewed did not establish a spendable Paytm or PhonePe POS wallet API that can fund ReachPay payouts, DMT, BBPS, recharges, or FASTag. Therefore no wallet, payout, BBPS, DMT, bank-transfer, or recharge adapter was enabled in this phase.

This is a provider authorization and funding-source blocker, not a missing code credential alone. MID/TID/Store ID values do not establish product entitlement or ownership. No real provider API was called and no live financial action was submitted. `reachpay` was not accessed or modified.

## Existing ReachPay functionality audited

| Component | Existing capability | Phase 5 status |
|---|---|---|
| Paytm POS | Server-side EDC sale request and status handling, signed request, idempotency, webhook verification, transaction storage, and reconciliation. | Payment collection only. The provider's published POS request flow pushes the payment request to a terminal. It does not document a spendable POS wallet balance. [Paytm POS Payment Request API](https://business.paytm.com/docs/api/pos-payment-request-api/) |
| PhonePe POS | Integrated EDC sale request, `merchantId`, PhonePe-generated `storeId`, PhonePe-generated `terminalId`, signed `X-VERIFY`, callback/status/search paths. The production API requires merchant enablement and Integrated Mode on the terminal. | EDC collection/status only. The reviewed Integrated EDC APIs do not document a merchant-wallet balance or payout funding endpoint. [PhonePe EDC Sale Request API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-sale-request-api) |
| Device linking | Authenticated POS configuration saves provider MID/TID references and scopes terminal records to the signed-in account. | This is configuration storage, not proof of ownership. PhonePe `storeId` currently comes from server configuration rather than a per-terminal database field. PhonePe's documented EDC request requires merchant ID, store ID, and terminal ID. The current table has no separate external MID/TID fields. Public docs do not explain an official mapping for the user's “External MID/TID” labels, so they must be clarified with PhonePe before those values are stored or sent. |
| Settlement | Paytm Settlement Order Detail lookup is provider-gated and read-only. Settlement and payout evidence is persisted separately from payment status. | A settlement record means funds were transferred to the merchant bank account; it is not a ReachPay wallet credit or proof of current spendable funds. [Paytm Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/) |
| Beneficiaries | Authenticated PostgreSQL CRUD, account encryption/masking, duplicate checks, owner isolation, audit logging. | Bank-account entry checks format only. Bank ownership verification is unavailable. |
| Transaction safety | POS idempotency, provider status confirmation, signed webhook checks, duplicate-event protection, durable records, reconciliation, and refund/settlement states are present. | This protects the POS lifecycle. It does not provide a financial-service ledger or authorize payouts. |
| Financial service boundary | Unconfigured payout and BBPS services fail closed. No balance or transfer is inferred from POS or settlement. | Correct safe state retained. No independent ReachPay wallet was added. |

## Provider wallet and funding verification

### PhonePe

The official Integrated EDC sale contract documents terminal payment requests and uses PhonePe-issued merchant, store, and terminal identifiers plus a PhonePe-issued salt key/index. It also documents merchant solution enablement and the terminal's Integrated Mode. The reviewed EDC documentation does not establish an API for reading a spendable POS merchant wallet balance or using POS collections to pay BBPS/DMT or bank transfers.

**Blocker:** PhonePe must provide ReachPay's merchant-specific documentation and written approval for (a) balance/passbook access, if available, (b) exact funding account and permitted debit use, and (c) any POS settlement sweep or transfer to the financial-service provider. It must also define the External MID/TID mapping and ownership verification mechanism. Until then, the existing MID/TID/Store ID values are references only.

### Paytm

- The enabled Paytm Wireless EDC contract is for terminal payment collection. ReachPay's `getAccountBalance()` deliberately returns unavailable.
- Paytm's [Fetch Balance Info API](https://business.paytm.com/docs/api/fetch-balance-info-api/) is tied to a payment/subscription transaction token and describes Paytm Wallet, Paytm Payments Bank, and Paytm Postpaid balance options. It is not documented as a merchant POS or settlement balance API.
- Paytm's [Payouts product](https://business.paytm.com/docs/paytm-payouts/introduction-internal) describes separate payout/disbursal accounts, passbooks, merchant onboarding, and business disbursals. That product may be considered only after Paytm explicitly enables it for ReachPay and confirms funding and permitted use.
- Paytm's public [Bank Transfer API](https://business.paytm.com/docs/api/bank-transfer-api/) currently says bank/UPI payout modes are unavailable. The product overview is not proof that the API is enabled for this MID or that POS settlements fund it.
- The existing [Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/) reports settlement to the merchant bank account. It is a read-only settlement lookup, not a balance inquiry or transfer operation.

**Blocker:** No approved Paytm Payouts/disbursal account, API permission, balance API scope, or settlement-to-payout funding link was provided. Do not call the consumer balance API to represent merchant funds.

### Authorized service providers

Eko publicly documents IMPS/NEFT remittance, DMT, bank verification, and BBPS services. The DMT flows require agent and sender onboarding/KYC, recipient setup, and customer OTP. BBPS service activation is for onboarded retailers/merchants. Production credentials require organization KYC and UAT sign-off, and production access is subject to India IP allowlisting. These capabilities do not prove that ReachPay is eligible, that they draw on a POS provider's wallet, or that any of the user's existing POS funds are accessible to Eko. [Eko integration onboarding](https://developers.eko.in/docs/how-to-integrate), [authentication and production key prerequisites](https://developers.eko.in/v1/docs/authentication), [DMT flow](https://developers.eko.in/reference/levin-dmt-flow), [BBPS APIs](https://developers.eko.in/v1.0/docs/bbps)

For own-business vendor payouts, RazorpayX advertises separate business payout and account-validation products. Public product material does not establish a link to ReachPay's Paytm/PhonePe POS settlement balance. It is an alternative only if ReachPay explicitly approves the separate funding account/product and its use. [RazorpayX Payouts](https://razorpay.com/x/payouts/)

## Workflow currently supported

1. An authenticated ReachPay user configures the POS provider references and server-side provider credentials/permissions.
2. ReachPay submits a POS sale request using the provider's collection API.
3. POS callback or provider status lookup updates the transaction record with replay protection and idempotency.
4. Reconciliation confirms the final provider payment state.
5. Paytm settlement lookup, when approved and configured, records settlement evidence.
6. The dashboard shows POS transactions and settlement states. It does not convert them to a wallet balance.

## Requested services: readiness

| Service | Current state | Additional requirements before implementation |
|---|---|---|
| Verified spendable POS wallet balance | Unavailable for Paytm EDC and not established for PhonePe Integrated EDC. | Official merchant-specific balance/passbook API, product scope, approved credentials, ownership check, definition of “available” versus reserved/settlement-pending, and provider confirmation of allowed funding use. |
| Electricity, water, gas, FASTag, mobile/DTH via BBPS/recharge | Unavailable. | Approved BBPS/BBPOU or provider relationship; merchant/agent eligibility; service activation; biller/catalog/transaction API scope; prefunding account, settlement, reversal, refund, and reconciliation rules. A bill-payment offering is not enabled just because a provider advertises it publicly. |
| Customer DMT | Unavailable. | Authorized provider/agent onboarding; business/legal role; customer and sender KYC, OTP/consent, limits, monitoring, complaint/reversal workflow, provider settlement funding and written production permission. Confirm applicable RBI requirements with the regulated provider and counsel. |
| Own bank transfers | Unavailable. | Approved business payout product or bank corporate API, verified funding account, credentials, payee validation, transaction limits, maker-checker controls, status/reversal callbacks, and reconciled statements. |
| Third-party beneficiary transfer | Unavailable. | Above plus explicit approval for third-party payout use, verified beneficiary ownership, consent, and transaction authorization controls. |
| Bank-account verification | Format validation only. | Approved provider verification API and merchant access. Confirm whether the method debits a small amount, consent requirements, name-match semantics, and treatment of inconclusive results. |

No amount or service is enabled by this report. No alternative account is silently substituted for the requested POS funds.

## Security and database handling

- Provider credentials remain server-side; never place secrets in React or return them in configuration responses.
- Continue using authenticated merchant scoping, idempotency, signed webhooks, durable event IDs, transaction-state validation, reconciliation, and audit events for POS flows.
- Before any financial-service launch, add business-level roles and maker-checker approval, per-service limits, consent records, provider transaction references, timeout recovery, reversal/refund states, reconciliation reports, and safe handling for provider outages.
- Existing database-name guards and the `.env` file were not changed. Automated PostgreSQL tests ran against `reachpay_test` only. No connection or migration was made to `reachpay` or `reachpay_dev` during this phase.

## Implementation, blockers, and next steps

### Completed or reused

- Existing Paytm/PhonePe POS collection adapters and transaction records were preserved.
- Existing beneficiary management, settlement tracking, duplicate webhook protection, idempotency, reconciliation, authentication, and audit logging remain available.
- Existing dashboard already labels Paytm merchant balance unavailable, distinguishes settlement/transactions from wallet funds, and shows that bank transfers and BBPS require provider approval.
- Existing provider methods fail closed; no dummy balance, simulated payment, undocumented endpoint, or independent wallet was introduced.

### Not implemented because authorization is absent

- POS balance or wallet synchronization for either provider.
- POS device ownership verification beyond authenticated account scoping and provider-credential-gated API access.
- Persisted per-terminal PhonePe Store ID and any undocumented External MID/TID mapping.
- BBPS, FASTag/mobile/DTH recharge, DMT, own-bank payout, third-party payout, or live bank verification.

### Required from providers/business owner

1. Paytm and PhonePe merchant-specific written confirmation of the wallet product, balance API, credential scopes, merchant ownership verification, and funds available for onward use.
2. Written funds-flow approval showing whether card-POS proceeds can directly fund each requested service. Include payout account identity, reserve/chargeback treatment, settlement timing, and permitted use.
3. Approved BBPS/DMT/payout/verification provider contracts, legal business eligibility and KYC documents, production identifiers, credentials, callback/security setup, and sandbox/UAT sign-off.
4. PhonePe confirmation of the exact Store ID, PhonePe MID/TID, External MID/TID field definitions, and supported multiple-store/terminal mapping.
5. The business's selected scope: own-business payouts only, customer financial services, or both. These have different onboarding and compliance requirements.

## Test and build results

- Test suite: **87 passed, 0 failed, 0 skipped**. PostgreSQL beneficiary lifecycle, transaction/settlement persistence, webhook concurrency/replay, rollback, and recovery checks ran with `reachpay_test` as the test database. Local POS unit tests used their isolated local test store.
- Lint: passed.
- Build: passed.
- No provider sandbox or live API calls were made because credentials/product approval are not available for this audit.
- No application code, migrations, or environment files were changed in Phase 5; only this report was added.
