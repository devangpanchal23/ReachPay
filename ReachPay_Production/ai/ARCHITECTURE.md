# Architecture and trust boundaries

## Current implementation

- `src/App.jsx`: responsive dashboard shell and user-visible provider/database/auth readiness limitation.
- `src/domain/`: pure money and state-machine rules.
- `src/integrations/provider.js`: abstract adapter boundary which raises `PROVIDER_NOT_CONFIGURED` by default.
- `server/index.js`: request ID/security headers and `/api/health`; all other API routes fail closed with `503`.
- `database/migrations/001_financial_core.sql`: PostgreSQL draft schema only, not connected to runtime.

## Target architecture (not yet implemented)

React UI → authenticated API/BFF → application services → PostgreSQL repositories and transactional ledger → outbox/queue → provider adapters. Provider webhooks enter a public signature-verifying edge route, are uniquely persisted, then processed idempotently. Reconciliation compares local journal, provider report and POS settlement records. Admin actions flow through RBAC, step-up auth, reason capture and append-only audit.

## Consistency model

PostgreSQL is the proposed source of truth. Use a serializable transaction or wallet row lock for funds reservation, unique constraints for idempotency and provider references, append-only journal lines, and a database constraint checking journal balance. The balance view is derived from entries. Holds reserve available funds and release/commit in an atomic transaction. Cross-provider calls use an outbox/saga; never keep a DB lock while waiting for a network provider response.
