# ReachPay Provider Onboarding Checklist

Do not enable a provider from this checklist alone. Keep financial operations disabled until all evidence is reviewed and sandbox/UAT tests pass.

## Required for every provider

- [ ] Confirm the legal entity, merchant account owner, product name, and permitted business model in writing.
- [ ] Obtain current official API documentation and merchant-specific contract/addenda.
- [ ] Obtain UAT credentials through the provider's authenticated onboarding channel.
- [ ] Obtain production credentials separately from UAT credentials and store them in an approved secret manager.
- [ ] Confirm account scopes, service permissions, IP allowlisting, callback URLs, signing keys, rotation, and key revocation steps.
- [ ] Confirm rate limits, transaction limits, fees, settlement timing, refund/reversal rules, dispute windows, and support/escalation contacts.
- [ ] Confirm what constitutes final success, how to inquire after timeout, and how reconciliation files or APIs are accessed.
- [ ] Confirm the exact funding account for each service. Get written authorization for the source and debit product; do not infer funding from POS settlement.
- [ ] Complete end-to-end sandbox/UAT cases for success, pending, timeout, duplicate/replay, failure, refund/reversal, mismatch, and provider outage.
- [ ] Approve a documented go-live change with independent review, limits, alerts, rollback, and provider support coverage.

## Paytm POS

- [ ] Confirm Integrated POS/EDC product access, merchant MID/TID/store mappings, terminal mode, request API and transaction status contract.
- [ ] Obtain issued client identity and request-signing credentials, allowed network origins, and terminal activation evidence.
- [ ] Confirm callback or polling requirements and signing/verification rules for the contracted product.
- [ ] Validate POS payment initiation and status only in provider UAT.
- [ ] Ask Paytm in writing whether any merchant balance/balance inquiry product exists for this account, and distinguish available, reserved, and settled amounts.
- [ ] Ask explicitly whether those funds may be debited for BBPS, DMT, or third-party payouts, and obtain product/contract approval. Settlement reporting alone is not authorization.
- [ ] For settlement lookup, obtain the required JWT client identity, merchant scope, production permission, and settlement API access. Confirm that the report is not a spendable balance API.

## PhonePe POS

- [ ] Confirm Integrated EDC availability for the merchant and terminal; MID/TID values alone do not authenticate APIs.
- [ ] Obtain the merchant-issued store ID, UAT salt key/index, optional provider ID, and exact private merchant contract.
- [ ] Confirm sale-initiation, status, callback signature, transaction search, cancellation, refund, and reconciliation contracts individually.
- [ ] Complete UAT using provider-issued test credentials and terminal configuration.
- [ ] Obtain separate production credentials and written production approval. Configure the production contract confirmation only after review.
- [ ] Ask separately for a documented wallet/balance API and written permission for BBPS/DMT/payout funding. No such capability or funding permission is assumed here.

## Eko BBPS

- [ ] Complete merchant/retailer onboarding and obtain written BBPS service activation and required service code.
- [ ] Confirm biller catalog, supported categories, bill-fetch support per biller, required input fields, validation rules, and catalog versioning contract.
- [ ] Obtain UAT API credentials and authentication/signature details through the provider account.
- [ ] Confirm required source IP/geolocation fields, allowlisting, callback or inquiry contract, payment status finality, receipts, complaints, refunds, and reconciliation.
- [ ] Confirm the exact prefunded/settlement account, funding permissions, minimum balance, fees, reversals, and refund destination.
- [ ] Obtain production credentials and permission only after successful UAT and onboarding review.

## Eko DMT

- [ ] Confirm DMT product eligibility, retailer/user enrollment, sender onboarding, KYC policy, OTP delivery, beneficiary registration, and supported transfer modes.
- [ ] Obtain exact UAT credentials, sender/recipient API contracts, fee quote, limits, transaction initiation, inquiry, reversal/refund, and reconciliation documentation.
- [ ] Confirm handling of initiated/hold/timeout statuses. Do not retry a timed-out transfer until provider inquiry resolves the original client reference.
- [ ] Confirm the approved funding balance/account. Eko's documented refund flow references Eko eValue; this does not establish POS-wallet funding.
- [ ] Confirm customer consent, required location data, audit retention, complaint handling, and applicable regulatory obligations.
- [ ] Obtain written production permission and separate production credentials after UAT.

## Bank payout provider

- [ ] Select a provider product approved for the business's own-account payouts or third-party payouts. Treat customer DMT as a separate product.
- [ ] Obtain beneficiary validation, account ownership verification, payout submission, status inquiry, webhook, return/reversal, refund, and reconciliation contracts.
- [ ] Confirm verified funding account, debit authorization, settlement, limits, maker-checker, and regulatory obligations.
- [ ] Require written evidence that the business's intended use and funding source are approved.

## Evidence record

Record provider, product, merchant entity, environment, document version/date, authorized reviewer, permission scopes, funding account, credential owner, callback verification method, UAT result, production approval reference, and expiry/review date. Never store secret values in this record.
