# Settlement flow audit — consolidated application

| Step | Current state | Notes |
| --- | --- | --- |
| 1. Enter collection amount | Missing | No collection form or amount API. Integer-paise validation primitives are available. |
| 2. Select payment method | Missing | No hosted checkout/provider adapter implementation. |
| 3. POS/provider confirmation | Missing | No provider integration or verified webhook processor. |
| 4. POS pending credit/SLA | UI only | Dashboard explains the expected 20-minute operational window; no timer, provider feed, or alert exists. |
| 5. Credit website wallet | Missing | Financial schema draft only; no database repository or ledger posting service. |
| 6. Choose settlement service | UI only | Service categories are shown as disabled until providers are authorized and integrated. |
| 7. Pay a beneficiary | Missing | No beneficiary verification or payout workflow/API. |
| 8. BBPS services | UI only | Categories are informational; biller inquiry/payment is not implemented. |

## Money and security findings

- **Critical:** no authenticated money-moving API or transactional financial repository exists. Financial API paths fail closed.
- **Critical:** no provider is integrated; all provider methods throw a not-configured error.
- **High:** the SQL foundation is a reconstructed draft and has not been applied or exercised against PostgreSQL.
- **High:** no idempotency-backed financial operation, wallet locking, webhook signature verification, reconciliation worker, or payout/BBPS state persistence exists.
- **Medium:** customer signup and OTP verification are implemented separately and require PostgreSQL, SMTP, and Twilio configuration.
- **Positive control:** money values in the financial core use integer paise; user screens do not invent balances or successful transactions.

This application is not approved for live-money use. Provider contracts, applicable RBI/payment rules, BBPS authorization, KYC/AML policies, privacy/legal review, and operational controls require business and compliance approval.
