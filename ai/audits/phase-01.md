# Phase 1: Project Audit and Stabilization

**Date:** 2026-10-12
**Audited revision:** GitHub-connected `main` at `84149b6`, including existing uncommitted PhonePe guardrail changes and the Phase 1 fixes listed below.
**Scope:** Frontend, Node/Vercel APIs, auth, POS providers/storage, SQL migrations, environment configuration, and available checks.

## Summary

The public site, local-development authentication flow, POS request orchestration, provider adapters, and financial domain primitives are present. The application is deliberately in safe mode: **wallet credits, payouts, and BBPS are not implemented as live services**. A private `.env` file and `DATABASE_URL` are configured, but their values were not displayed. The read-only database check returned a generic configuration/permissions error, so PostgreSQL connectivity and schema state remain unverified.

Two confirmed low-risk issues were fixed: the POS migration command could report success if PostgreSQL was missing in production or a configured migration failed, and POS tests wrote synthetic records into tracked application data. Both now have regression coverage or test isolation.

## Existing features and evidence

- **Frontend:** React 19/Vite 8 public pages, route-specific static metadata generation, contact/careers/newsletter-interest forms, signup/login/OTP screens, and a protected customer workspace. Route behavior is covered by `tests/site-routes.test.js`.
- **Authentication:** Email/mobile validation, scrypt password hashing, HMAC email OTP storage, Twilio Verify adapter, hashed session tokens, HTTP-only cookies, origin checks, rate limits, and PostgreSQL/local-development storage paths. The local flow and fail-closed production configuration paths are covered by `tests/auth-core.test.js` and security regression tests.
- **Contact API:** Origin, consent, field, content-type, body-size and honeypot checks; shared Upstash rate limiting and Resend delivery are required in production. Tests verify it does not report success when delivery is unconfigured.
- **Paytm POS:** Server-side EDC adapter, signed request/response handling, sale/status flows, sync/webhook path, idempotency, user isolation, and encrypted terminal-secret storage are present. Contract tests use mocked provider responses. Paytm documents a sale request followed by a status enquiry; acceptance of a request is not payment confirmation ([Paytm POS flow](https://business.paytm.com/docs/pos-wireless-integration-sale-transaction/)).
- **PhonePe POS:** A provisional server-side adapter exists, but the current main working tree gates outbound calls and callbacks behind `PHONEPE_POS_CONTRACT_CONFIRMED=true`. The repository's current status audit says public partner material does not establish the private API contract. Tests use mocked responses; no PhonePe API contract, merchant/terminal enablement, or live connectivity was verified. Keep this integration disabled until PhonePe supplies and ReachPay reviews the private contract.
- **Data/persistence:** POS storage uses PostgreSQL when configured and local JSON in development. Financial SQL defines wallet, ledger, journal, transaction, beneficiary, event, and reconciliation structures, but the application has no financial repository/service that writes to them.
- **Safe mode:** `/api/health` identifies the safe-mode state. Auth, POS, contact, and health APIs are implemented; other financial API paths return `503 SERVICE_NOT_CONFIGURED`.

## Incomplete features and blockers

- No wallet funding/credit workflow, customer ledger balance, bank payout, beneficiary verification, BBPS bill fetch/payment, biller catalog, or live reconciliation service is implemented.
- POS refunds are not available through the current adapter workflow. PhonePe cancellation/refund is explicitly unsupported by the provider adapter; Paytm refund returns an unsupported response.
- POS integrations have no credentials in this checkout and no verified PhonePe merchant/terminal enablement. No real provider request or financial transaction was attempted.
- `.env` and `DATABASE_URL` are configured in the main checkout, but `npm run db:check` returned a generic PostgreSQL configuration/permissions error. The exact cause and schema state could not be established without exposing or changing secrets. No schema migration was run because migrations modify a database.
- Production email/SMS and shared rate-limit services are not configured or verified. Local development supports a JSON auth store and development OTP behavior; this must not be treated as production authentication delivery.
- There is no TypeScript typecheck script. The codebase is JavaScript/JSX.
- Legal/privacy/terms content, company facts, regulatory disclosures, supported geography, and provider-backed service availability still need ReachPay approval, as documented in the existing README.

## Bugs fixed

- **POS migration false success:** `scripts/migrate-pos.js` previously returned exit code 0 if a configured PostgreSQL migration failed, and also treated missing `DATABASE_URL` as a successful development fallback in production. It now fails with a non-zero exit code in both production cases. Development without PostgreSQL continues to use the local JSON store.
- **Test data pollution:** POS persistence tests previously used the tracked `data/local-pos-store.json`, leaving synthetic test records in the working tree after `npm test`. Tests now use per-file temporary stores, removed after each file's test run. The test-only path override is ignored in production.

## Files changed for Phase 1

- `scripts/migrate-pos.js`
- `server/pos/pos-storage.js`
- `tests/pos-paytm.test.js`
- `tests/security-regressions.test.js`
- `tests/migrate-pos.test.js`
- `ai/audits/phase-01.md`

The main checkout already had unstaged PhonePe guardrail changes in `.env.example`, `server/pos/phonepe-provider.js`, `server/pos/pos-controller.js`, and `tests/pos-phonepe.test.js`, plus the separate untracked `ai/audits/2026-10-12-reachpay-current-status.md`. Those files were reviewed and left intact.

## Checks run

Dependencies were installed from the existing lockfile with `npm ci --ignore-scripts --no-audit --no-fund`; no package or lockfile changes were made.

- `npm test`: **62 passed, 0 failed**. POS tests leave the tracked JSON store unchanged. The sandbox blocked writes to the ignored local auth store during the main-checkout run, so those passing tests do not verify durable auth-file persistence in that checkout.
- `npm run lint`: **passed**.
- `npm run build`: **passed**.
- `npm run db:check`: **failed with a generic sanitized configuration/permissions error**; `.env` is present and `DATABASE_URL` is set. The connection/schema result is unknown. No migration or financial query was run.
- Typecheck: **not configured** (`package.json` has no typecheck script).
- Live POS/UAT connectivity: **not tested**; credentials and merchant enablement are unavailable.
- Real financial transactions/deployment: **not performed**.

## Recommended next steps

1. Obtain a dedicated non-production PostgreSQL database and verify migrations there. Make deployment migrations an explicit ordered release step; avoid relying on cold-start schema changes for production readiness.
2. Obtain official Paytm and PhonePe UAT credentials and written merchant/terminal enablement. Run provider-approved UAT tests for initiation, terminal completion, signed callback, status query, timeout, duplicate event, and reconciliation.
3. Confirm the permitted card-acquiring and wallet-funding model with the acquiring/regulated partner before designing wallet credit.
4. Implement and test the ledger repository/service before enabling balance display or spending. Keep pending and spendable funds separate and credit only from verified provider/settlement evidence.
5. Select approved payout and BBPS partners, then implement beneficiary verification, provider status/reversal handling, supported biller catalog, receipts, disputes, and reconciliation.
6. Configure production secrets through a secret manager, test email/SMS and shared rate limiting, review approved legal copy, and complete security and operational readiness reviews before any launch.
