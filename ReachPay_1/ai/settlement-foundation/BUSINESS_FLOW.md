# Settlement business flow

The authoritative requested eight-step model is in the user request dated 2026-10-05.

1. Validate a collection amount in INR integer paise and business/user limits.
2. Create a payment intent through an approved provider-hosted flow; ReachPay must not collect PAN/CVV/PIN.
3. Wait for server-verified provider confirmation. A browser redirect is not confirmation.
4. Track the provider/POS collection as pending, show the 20-minute operational SLA, and alert on provider-time based breaches.
5. Post balanced immutable ledger entries in one database transaction only after verified confirmation. Keep pending and spendable balances distinct.
6. Permit settlement only after KYC, account status, limits and available-balance checks.
7. Verify beneficiary ownership/destination through the selected partner; hold funds atomically, submit payout idempotently and release/reverse correctly after final provider result.
8. Fetch bill details and pay only through a contracted BBPS provider catalog; store provider references and issue receipts only from persisted outcomes.

Collection lifecycle: `INITIATED → PROCESSING → PENDING_POS_CREDIT → CREDITED`; failure and reconciliation branches are explicit. Settlement lifecycle: `CREATED → BALANCE_HELD → SUBMITTED → SUCCESS`; failure releases the hold, while post-success corrections use reversal entries. Every retry uses the original idempotency key. The current code does not yet execute the flow; it blocks all financial writes.
