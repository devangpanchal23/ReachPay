# Phase 2.1: PostgreSQL and Reconciliation

## Result

PostgreSQL connectivity and persistence could not be verified because `.env` is absent and `DATABASE_URL` is not configured in this checkout. No database was contacted or modified. The additive migration was not applied. Production data remains untouched.

The POS storage now includes a transactional webhook event ledger and retryable reconciliation queue. These changes have local-store tests and an isolated PostgreSQL integration test that runs only when `REACHPAY_TEST_DATABASE_URL` points to a database whose name includes `test`. That integration test was skipped here because no isolated test database was supplied.

## Database configuration

- `DATABASE_URL` is used by POS and authentication storage with TLS certificate validation when `NODE_ENV=production`.
- POS storage can fall back to a local JSON file outside production. Production storage fails closed if PostgreSQL is not configured.
- POS migrations are additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, indexes, and guarded constraints) and are now wrapped in a PostgreSQL transaction in both the migration command and runtime initialization.
- `npm run db:migrate:pos` reported that `DATABASE_URL` is missing and made no changes.
- A successful migration against an isolated PostgreSQL test database is still required before relying on these changes.

## Changes

- Added `pos_webhook_events` with a unique `(provider, event_id)` constraint. The callback ID is a SHA-256 hash of the verified callback content when the provider payload does not supply a documented event ID. Raw callback payloads and signatures are not persisted.
- A verified webhook event claim and transaction state update now run in one database transaction. Duplicate deliveries are acknowledged without reapplying the state. Failed processing rolls back the claim so provider redelivery can retry.
- Terminal payment states cannot be regressed by a later callback. Concurrent identical callback delivery is protected by the unique key and transaction boundary.
- Added `pos_reconciliation_jobs`, with unique provider/transaction keys, bounded claims using `FOR UPDATE SKIP LOCKED`, backoff retries, and recovery of jobs stuck in `PROCESSING` for over five minutes.
- Added a bounded reconciliation worker and `npm run pos:reconcile`. It queries provider payment status through existing Paytm or PhonePe status adapters, validates merchant ID, transaction ID, and amount before updating local payment state, and records mismatches without promoting the transaction.
- Settlement remains separate from payment success. A matched payment can remain `SETTLEMENT_PENDING`; a settlement is marked `SETTLED` only if the authorized adapter supplies payout ID, settlement time, and settled amount. No wallet or spendable balance is created.
- Refund state can be persisted when an authorized provider response reports `REFUNDED`; neither current POS status adapter provides a verified settlement/refund feed for this job.

## Test results

- `npm test`: 74 passed, 0 failed, 1 skipped. The skipped test requires `REACHPAY_TEST_DATABASE_URL` for an isolated PostgreSQL database.
- Local tests cover duplicate and concurrent webhook delivery, callback retry after the transaction record becomes available, non-regression of terminal states, reconciliation success, mismatch, and provider timeout retry.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run pos:reconcile`: stopped safely with the expected missing `DATABASE_URL` blocker. No provider request was made.
- `npm run db:migrate:pos`: did not apply the migration because `DATABASE_URL` is missing.

## Remaining blockers

1. Supply a non-production PostgreSQL URL for this checkout, verify its target database, apply the migration, and run the isolated persistence and concurrency test. Do not point these tests at production.
2. Provide approved Paytm settlement API JWT/tokenization setup and merchant permissions. The existing Paytm settlement detail endpoint is production-only and is not connected to this reconciliation worker.
3. PhonePe's reviewed Integrated EDC status/search APIs verify payment state, not payout settlement or merchant balance. Obtain a provider-approved settlement/refund feed before synchronizing those states.
4. Set up a scheduler to invoke `npm run pos:reconcile` in an approved non-production environment first. No scheduler or production job has been enabled.
5. Provider adapters return payment status data. Reconciliation currently handles settlement/refund fields only if a future authorized adapter supplies them; it does not fabricate them.

## Files changed for Phase 2.1

- `package.json`
- `scripts/migrate-pos.js`
- `scripts/reconcile-pos.js`
- `server/pos/pos-migration.sql`
- `server/pos/pos-storage.js`
- `server/pos/pos-controller.js`
- `server/pos/pos-reconciliation.js`
- `tests/pos-webhook-replay.test.js`
- `ai/audits/phase-02-1.md`

Other pre-existing modified files in this checkout were left intact.
