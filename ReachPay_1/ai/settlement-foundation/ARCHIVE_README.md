# ReachPay Production

> Historical README copied for the consolidation record. Its local folder commands no longer apply. The current app root is `ReachPay_1/`; see the root `README.md` there and `MIGRATION_NOTES.md` in this archive for current status.

An isolated settlement-operations application built beside the existing ReachPay prototype. The original dashboard and corporate site are not modified by this package.

## Current readiness

This is a **safe foundation, not a live-money or production-ready deployment**. The app renders a responsive settlement dashboard and the API exposes a health/readiness report. All financial write APIs return `503 SERVICE_NOT_CONFIGURED`. No user balance is fabricated, and no mock provider is allowed to report a success. The provider boundary, database migration draft, money/state-machine primitives, and initial unit tests are included.

The code cannot safely credit or spend funds until an identity provider, transactional database runtime, KYC/limit rules, contracted POS/pay-in provider, payout partner, and authorized BBPS provider are selected and integrated. Schema migration is a draft and has not been applied to a database.

## Run locally

Requirements: Node.js 22.5+ and npm. From this folder:

```sh
npm install
npm run dev
```

Run `npm install` with npm registry access to create this package's lockfile. The development environment had no registry cache and its global npm cache was not writable, so no incorrect lockfile was copied from the parent prototype.

Open `http://127.0.0.1:5173`. In a second terminal, run `npm run start:api`; readiness is at `http://127.0.0.1:8789/api/health`. The UI intentionally displays unavailable balances and disables money movement.

## Verify

```sh
npm test
npm run build
```

No Lighthouse or cross-browser score is claimed yet. No provider sandbox flow or database integration test can run without provider accounts and a database runtime.

## Configuration

Copy `.env.example` to a private local `.env` only if needed. The current API does not consume financial credentials or connect to the listed services. Do not set production credentials until adapters, identity, persistence, deployment, monitoring, and security reviews are implemented. Use a managed secret store in deployed environments.

See `ai/ENVIRONMENT_VARIABLES.md` and `ai/INTEGRATIONS.md` for sources and outstanding setup.

## Structure

```text
src/App.jsx                         responsive dashboard and flow stepper
src/domain/money.js                 integer-paise and journal invariants
src/domain/states.js                transition rules and payout hold check
src/integrations/provider.js        fail-closed provider contracts
server/index.js                     safe readiness API; financial routes disabled
database/migrations/001_financial_core.sql  PostgreSQL schema draft
tests/unit/financial-core.test.js   built-in Node unit tests
ai/                                 project memory, audit and readiness records
```

## Deployment and rollback

Do not deploy this as a live transaction platform. The frontend can be hosted as static assets for review. The readiness API is a basic local Node process, not a hardened internet-facing backend. Before public deployment, implement session/JWT validation with the chosen identity provider, PostgreSQL repository and migrations, transactional journal/holds with row locks, provider adapters/webhooks, distributed throttling, queue/reconciliation workers, security headers/CORS policy, monitoring, backup/recovery, and full financial regression suites. Rollback by reverting the isolated `ReachPay_Production/` changes; no original app tables or user data have been migrated.

## Business and compliance dependencies

Requires provider contracts and sandbox onboarding, BBPS agent/biller authorization as applicable, payout partner approval, POS acquiring/terminal certification, KYC/AML policy, RBI/payment aggregator and card-funded transfer review for the actual business model, data retention/privacy review, and written approval from legal/compliance. Software implementation alone does not establish compliance.
