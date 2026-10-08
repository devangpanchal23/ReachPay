# Database design

Draft schema: `database/migrations/001_financial_core.sql`.

It defines app users with external auth subject and KYC state; typed wallet accounts; immutable signed integer-paise ledger entries grouped into balanced journals; a derived balance view; transaction status history; provider-event uniqueness; tokenized/masked beneficiary destinations; reconciliation cases; and audit logs. Indexes cover owner/time, status/time, wallet/time, journal ID and audit chronology.

The migration is not applied or integration-tested. The runtime does not connect to PostgreSQL. Before use, review trigger behavior under actual migrations, add holds/reservations, fees/tax, refunds, payout/BBPS details, notifications, sessions, risk/manual review, currency/accounting policy, row-level access protections, retention, backup and restore. Balance-changing application functions must require DB transactions and authorization checks; never add a mutable `wallet.balance` source of truth.
