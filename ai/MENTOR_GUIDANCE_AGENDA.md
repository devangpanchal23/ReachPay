# ReachPay — Mentor Discussion Agenda

**Mentor:** Navinsir

## Project overview

ReachPay is a React/Vite website and customer portal. It includes signup/login, a safe-mode dashboard, and Paytm/PhonePe POS integration foundations. **Live wallet credits, bank payouts, and BBPS payments are not enabled yet.** The backend currently blocks financial operations until providers and controls are ready.

## Technology

React 19, Vite 8, Node.js 22, PostgreSQL foundation, and Paytm/PhonePe POS adapters. The design uses server-side payment verification, integer-paise amounts, and idempotent transaction handling.

## Proposed workflow

Customer login → POS card payment → provider verifies result → eligible funds enter the wallet ledger → customer selects beneficiary transfer or supported bill payment → provider confirms final status → ledger and receipt update.

## Modules and integrations needed

- Wallet ledger and balance/history
- POS collections, callbacks/status checks, refunds, and reconciliation
- Beneficiary verification and bank payout partner
- BBPS provider/catalog for supported bills
- KYC/risk checks, admin review, notifications, and audit

Connect the acquiring bank/POS provider and exact terminal, an approved wallet/financial partner if storing transferable balances, a payout provider, a BBPS partner, and the production database/monitoring systems.

## Guidance 

1. Is “any client's card → ReachPay wallet → transfer or bill pay” permitted for our business model? Which regulated/approved partner and written approvals are required?
2. For our exact POS model, should we use Paytm/PhonePe cloud EDC APIs or a certified local ECR/SDK bridge?
3. Which payout and BBPS partners should we use, and do their catalogs support gas booking and rent payment?
4. Should wallet credit wait for terminal approval, acquirer settlement, or reconciliation? How should refunds, chargebacks, and pending transactions work?
5. what are the actual ways and how could we complete all the features of this project ?

References: [Paytm POS flow](https://business.paytm.com/docs/pos-wireless-integration-sale-transaction/) · [PhonePe EDC API](https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-sale-request-api) · [Setu BillPay](https://docs.setu.co/payments/billpay/api-integration/quickstart)
