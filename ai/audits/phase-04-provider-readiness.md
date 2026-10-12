# ReachPay Phase 4: Real Banking Provider Readiness

Date: 2026-10-12

## Executive summary

ReachPay is not ready to initiate real bank transfers, DMT remittances, or BBPS payments. Beneficiary records are stored in PostgreSQL with encrypted account numbers and masked API responses, but account verification is format-only. Payout and BBPS operations fail closed because no approved provider adapter is configured. Paytm settlement lookup is read-only evidence and does not establish a spendable balance.

For a single business paying its own vendors, start with the business's existing bank corporate API or apply for RazorpayX Payouts and account validation. If ReachPay will offer customer-facing DMT and BBPS as a service, Eko is the strongest public-API candidate found for both, subject to its agent/retailer onboarding and written approval. These are separate use cases and must not be treated as one wallet or funding pool.

No external API or database was called for this audit. No live money movement or account verification was attempted. The existing `reachpay` database was not accessed or changed.

## Existing ReachPay audit

| Area | Verified state | Readiness gap |
|---|---|---|
| Beneficiaries | PostgreSQL CRUD, authenticated-user scoping, encrypted account numbers, masked responses, duplicate prevention, and audit rows are implemented in `server/financial/beneficiaries.js`. | IFSC and account number checks are syntax checks. There is no bank ownership/holder-name verification. Current records are scoped to a user account, not a shared legal-entity/merchant profile. |
| POS | Paytm adapter exists. PhonePe Integrated EDC is partner-access gated. | The application has no proof of the merchant's production API permissions or any direct settlement-to-payout funding path. |
| Settlement | Paytm settlement adapter is read-only, production/credential gated, and reports provider settlement evidence. | It does not provide a merchant spendable balance or authorize disbursements. No balance API is integrated. |
| Authentication | Banking endpoints require an active authenticated user, origin validation on writes, and rate limiting. | Production merchant organization roles, approval controls, and provider-level business authorization remain to be designed before launch. |
| PostgreSQL | The beneficiary runtime restricts database names to `reachpay_dev` and `reachpay_test`. | This Phase 4 audit made no connection and ran no migrations or tests. |
| External services | Payout, bank verification, and BBPS are reported unavailable until a provider is configured. | No approved production credentials, merchant scope, or provider contract was supplied for this audit. |

## Provider comparison

This comparison is based on public provider documentation. Product access, pricing, final limits, documents, and production permissions are decided by provider onboarding and contract.

| Provider | Bank verification | Own-business IMPS/NEFT | Customer DMT | BBPS | Balance / settlement | Eligibility, onboarding, and funding |
|---|---|---|---|---|---|---|
| RazorpayX | Account/UPI validation is advertised. | Payout API product is advertised for business use. | Not established in the reviewed public payout material. | Not established in the reviewed public payout material. | Payout account/fund-account model; not a Paytm/PhonePe POS balance API. | Apply for RazorpayX and the required payout/validation products; complete business and KYC review, account setup, API access, and production approval. Fund the payout account through an approved business funding path. Confirm the exact document checklist and supported modes with Razorpay. [RazorpayX Payouts](https://razorpay.com/x/payouts/) |
| Eko | Published bank-account verification API; documented penny-drop flow means verification may itself create a small real transfer. | Eko publishes IMPS/NEFT transaction APIs, but the documented flow is customer/agent-oriented. | Published DMT agent, sender KYC, recipient, OTP, and transaction flows. | Published BBPS bill fetch/payment APIs with retailer/merchant service activation. | Service activation includes payment/fund settlement terminology, but public docs do not prove ReachPay can read arbitrary POS balances or sweep POS settlements. | Organization KYC, UAT integration and Eko sign-off are prerequisites to production credentials. Agent/retailer onboarding and service activation are required; production IP must be India-whitelisted. DMT sender/customer onboarding, recipient registration, and OTP apply. BBPS needs service activation and location details. Confirm legal role, documents, limits, commercial terms, and prefunding/settlement path in writing. [Eko onboarding](https://developers.eko.in/docs/how-to-integrate), [auth and production key prerequisites](https://developers.eko.in/v1/docs/authentication), [DMT flow](https://developers.eko.in/reference/levin-dmt-flow), [BBPS](https://developers.eko.in/v1.0/docs/bbps), [bank verification](https://developers.eko.in/reference/bank-account-verification) |
| Paytm Payouts | Product documentation advertises bank/UPI detail validation. | Payout product documentation advertises business disbursals, including bank transfers. However, its public Bank Transfer API page currently says bank/UPI payout modes are unavailable. | Not established as an approved customer-remittance product for ReachPay. | Paytm Payouts advertises enterprise utility bill payments, but that is not proof of BBPS API access or eligibility for ReachPay's customer-facing use. | Payout/disbursal accounts and passbook are described as separate accounts. Paytm settlement detail is a separate reporting API. | Requires Paytm Payouts product activation, merchant credentials/scope, configured disbursal account and funding. Ask Paytm for written confirmation that bank modes and requested bill-payment APIs are enabled for this exact MID, and confirm the accepted source of funds. [Payouts product](https://business.paytm.com/docs/paytm-payouts/introduction-internal), [Bank Transfer API availability note](https://business.paytm.com/docs/api/bank-transfer-api/), [Settlement Order Detail API](https://business.paytm.com/docs/api/settlement-order-detail-api/) |
| PhonePe | No applicable bank-verification contract was established from public material reviewed. | No merchant-specific IMPS/NEFT payout contract was established. | Not established. | Not established. | Public merchant settlement information is not a merchant balance or onward-funding API. | Treat current POS/API access as partner-gated. Request merchant-specific documentation, product permissions, funds flow, webhook/security contract, onboarding checklist, and written production approval from PhonePe. [PhonePe developer portal](https://developer.phonepe.com/) |
| Cashfree SecureID | Public product advertises penny-drop bank-account verification and holder-name checks. | No payout recommendation is made here; payout eligibility and funding were not verified for this audit. | Not established. | Not established. | No POS settlement funding relationship established. | Apply for SecureID access and confirm KYC, pricing, supported banks, production approval, and whether the exact validation method is non-financial or causes a debit. [Cashfree Bank Account Verification](https://www.cashfree.com/bank-account-verification/) |

### Provider documentation notes

- Eko's published DMT flow requires retailer/agent onboarding. New senders go through identity/KYC steps, recipients are registered, and transaction OTP is part of the flow. Public transaction documentation lists limits of ₹5,000 per transfer and ₹25,000 per sender per month; verify current contractual limits with Eko before design or launch. [Eko DMT flow](https://developers.eko.in/reference/levin-dmt-flow), [Eko transaction limits](https://developers.eko.in/docs/api-transactions)
- Eko's bank verification API must not be treated as a harmless lookup without confirming the live debit and consent behavior. Do not call it until the merchant has explicit authorization and production approval. [Eko bank verification](https://developers.eko.in/reference/bank-account-verification)
- NPCI BBPS guidelines place Agent Institution onboarding with a BBPOU and set business/KYC and operational requirements. ReachPay should obtain a written BBPOU/provider agreement and its assigned role before presenting BBPS services. [NPCI BBPS Procedural Guidelines](https://www.npci.org.in/PDF/npci/bbp/Bharat%20Bill%20Payment%20System-Procedural%20Guidelines%20Ver%201.1_0.pdf)
- DMT is a regulated payment service framework. The RBI revised its framework in July 2024; applicability and allocation of duties must be confirmed with the authorized bank/provider and legal counsel before ReachPay operates a customer remittance flow. [RBI DMT framework listing](https://systemhealth.rbi.org.in/Scripts/FS_Notification.aspx_fn%3D9.html)

## POS settlement funding conclusion

There is no verified direct funding connection from ReachPay's Paytm or PhonePe POS settlement records into RazorpayX, Eko, Paytm Payouts, or a ReachPay wallet.

Paytm's Settlement Order Detail API returns settlement evidence for an order. The application adapter stores settlement status and related provider evidence; it does not move funds. Paytm's separate Payouts product describes its own payout/disbursal accounts. The Bank Transfer API page currently states bank/UPI payout modes are unavailable. No documented, merchant-approved API path in the material reviewed links POS settlement proceeds directly to that payout account.

PhonePe POS settlement access is likewise not evidence of a balance that ReachPay can spend through an unrelated payout or BBPS service. Any proposed sweep, escrow, split, or prefunding arrangement needs a written contract/API confirmation from the acquiring provider and payout/BBPS provider, including settlement destination, permitted purpose, chargeback/refund reserves, timing, reconciliation, and legal role. Until then, POS settlement remains reporting-only. Do not credit customer wallets or use card proceeds as customer remittance funds based on a successful POS payment alone.

BBPS and DMT require their own approved operating model and settlement/funding setup. An own-business vendor payout product should not be used to route customer remittances or bill payments unless the provider expressly approves that use.

## Recommendation for ReachPay

1. **If ReachPay is only for this business's own expenses:** first ask the existing bank for its corporate payout API and account-validation service. In parallel, apply to RazorpayX for own-business vendor payouts and payee validation. Keep payout funding in the designated business account and confirm statements, limits, charges, and authorizer controls.
2. **If ReachPay will provide DMT and BBPS to customers:** request formal enterprise/agent-institution onboarding from Eko and the designated BBPOU. Confirm required entity type, business permissions, customer KYC, agent model, allowed user journey, fund prefunding, settlement/reversal handling, fees, limits, and production sign-off. This is a different business model with added compliance and operations.
3. **For beneficiary verification:** choose an approved provider API only after confirming whether it performs a penny-drop, its consent requirements, result meaning, and how to handle inconclusive/mismatched names. A local regex must never set `VERIFIED`.
4. **Do not combine** customer POS collections, a ReachPay ledger, and payout/BBPS funds without written provider approval and a reviewed legal funds-flow design.

## Documents and approvals to prepare

Exact checklists vary by provider and legal form. Ask the provider for its current checklist and product-specific agreement. Expect to prepare:

- Business registration/incorporation or proprietorship proof, registered and operating address proof, PAN, GSTIN where applicable, and business website/app details.
- Current account proof/cancelled cheque or bank confirmation, authorized signatory details, beneficial-owner/director/partner KYC, and board/partner authorization where applicable.
- Business model and customer journey, expected volumes/ticket sizes, source and destination of funds, refund/dispute handling, AML/KYC controls, support and grievance process, and data/security controls.
- For DMT/BBPS agent model: retailer/agent details and activation flow, customer onboarding/KYC process, service/location details, and provider/BBPOU agreement. NPCI procedural guidelines list business-address authorization/licence, active bank details, PAN, financial/background checks, and BBPOU onboarding for Agent Institutions. [NPCI BBPS guidelines](https://www.npci.org.in/PDF/npci/bbp/Bharat%20Bill%20Payment%20System-Procedural%20Guidelines%20Ver%201.1_0.pdf)
- For production access: signed commercial/API agreements, approved product permissions, UAT completion, production keys in server-side secret storage, source-IP allowlisting when required, webhook signing rules, callback registration, and provider-approved reconciliation reports.

## Safe readiness work and current blockers

No code changes were needed for this phase. Existing service status already fails closed for unconfigured bank verification, payout, and BBPS. No mock API, balance, verification result, or financial transaction was added.

Before implementation can safely proceed, ReachPay needs:

1. A decision whether the product is for the business's own payouts, customer DMT/BBPS, or both.
2. Legal entity/merchant details and written provider eligibility/contract approval for each service.
3. Approved production credentials, merchant/agent identifiers, permissions, source IP and webhook configuration.
4. Provider-confirmed funding and settlement model, including whether any POS-to-payout transfer is expressly supported.
5. Production-grade organization/user authorization, maker-checker controls, limits, consent, dispute handling, and support processes for any customer-facing financial operation.
6. Confirmation of applicable RBI/NPCI obligations and provider responsibility split before customer DMT/BBPS launch.

## Files and verification

- Added: `ai/audits/phase-04-provider-readiness.md`
- No application code, database schema, environment, or credentials were changed.
- No database connection, migration, test suite, or live provider API was run in this phase. This report does not claim runtime integration verification.
