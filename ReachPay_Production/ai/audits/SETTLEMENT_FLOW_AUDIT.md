# ReachPay settlement flow audit

Audit date: 2026-10-05  
Scope: existing repository prototype at `../src` and `../server`. Line references refer to the existing prototype at audit time.

## Repository map

| Area | Location | Current implementation |
|---|---|---|
| Application entry and page routing | `src/main.jsx`, `src/App.jsx` | One React/Vite single-page dashboard; module selection is local state, not URL routes. |
| Dashboard, wallet, history, POS management, merchant/admin panels, reports | `src/App.jsx` | Inline page components and mock records in React state. |
| POS, beneficiaries, DMT, AEPS/withdrawal | `src/components/AssistedBankingModule.jsx` | Local arrays, timers, generated IDs, client callbacks. |
| Bill payments | `src/components/BBPSModule.jsx` | Local biller catalog, timers, generated references, client callback. |
| Optional gateway checkout, payment API view | `src/components/PaymentsModule.jsx` | Cashfree hosted checkout candidate; JSON-backed Node API in demo/sandbox/production modes. |
| Payment API | `server/index.js` | Built-in Node HTTP server, Cashfree calls, JSON file persistence, webhook and timer-based status reconciliation. |
| Styling and assets | `src/index.css`, `src/assets`, `public` | Vite/Tailwind styles and local assets. |
| Database schema | None in prototype | Runtime data is JSON; no relational database migrations or indexes. |
| Authentication | None in the dashboard; optional API bearer token | UI role selector is client state. API bearer token is a deployment guard, not merchant identity. |
| Deployment | `vercel.json`, `vite.config.js` | Static Vite rewrite; local `/api` proxy to port 8787. Node API needs separate deployment. |
| Environment | `.env.example` | Cashfree candidate configuration and API token placeholders. No credentials were supplied. |

## Eight-step flow comparison

| Step / feature | Status | Evidence | Fix needed |
|---|---|---|---|
| 1. Enter settlement amount | Partially working | `src/components/AssistedBankingModule.jsx:26-33,67-70`; `src/components/PaymentsModule.jsx:41-47`; `server/index.js:43-47` | Server validates integer paise for gateway requests, but assisted UI defaults to ₹1,00,000 and uses JS numeric amounts; add authenticated limits, durable intent and stable idempotency. |
| 2. Client pays by supported method | Partially working | `src/components/PaymentsModule.jsx:41-74`; `server/index.js:25-30,43-59` | Hosted Cashfree session is an integration candidate for UPI/QR; no contracted provider credentials or tested production setup. Legacy POS/card screens are simulations. Keep card data off ReachPay and enable methods only when provider-approved. |
| 3. Verified POS/provider confirmation | Broken for POS; partial for Cashfree PG | `src/components/AssistedBankingModule.jsx:67-94`; `src/App.jsx:107-139`; `server/index.js:83-98` | POS confirmation is a timer/client callback. Require provider adapter, signed events, transaction matching, immutable event ID uniqueness, account scoping and ledger transaction. |
| 4. Admin/POS balance, pending credits, 20-minute SLA | Missing | `src/App.jsx:28-41,66-71`; `server/index.js:110-118` | No real POS account, SLA monitor, threshold alert, admin RBAC or reconciliation queue. Do not fake the timer; track provider timestamps and alert when verified pending age exceeds 20 minutes. |
| 5. ReachPay wallet credit after verification | Broken in main dashboard; partial gateway ledger only | `src/App.jsx:107-139`; `server/index.js:32-33,90-98` | Browser callback changes displayed available balance. API has a single CREDIT record only, JSON persistence and no user wallet ownership. Introduce balanced, immutable journal entries in an ACID database; credit only after verified provider status. |
| 6. Spend/settle available balance | Broken | `src/App.jsx:141-195`; `src/components/BBPSModule.jsx:97,201-225` | Client state performs debits without atomic hold, authorization, available-vs-pending buckets, or server ledger. Add atomic reservation/hold state transitions and server-enforced spending controls. |
| 7. Beneficiaries and payout | Broken | `src/components/AssistedBankingModule.jsx:8-13,35-53,96-167`; `src/App.jsx:141-168` | Hardcoded beneficiary records marked verified and timer-generated DMT success/UTR. No name match, provider, persisted ownership, step-up auth, or refund/release on failure. |
| 8. BBPS/payout service catalog and lifecycle | Broken | `src/components/BBPSModule.jsx:97,147,201-225`; `src/App.jsx:170-195` | Biller fetch/pay and receipt are simulated in browser. No authorized BBPS operator, biller API, inquiry token, webhook, receipt persistence, or provider reconciliation. Expose no biller as live until contracted provider catalog is available. |

## Findings by severity

### Critical

- **Client-controlled financial state:** `src/App.jsx:107-195` adds and subtracts the dashboard balance from module callbacks. The source amount uses JS numbers and payout debit is clamped with `Math.max(0, ...)`, hiding attempted overdrafts instead of rejecting them.
- **Simulated success exposed as completed money movement:** POS and DMT callbacks are invoked after `setTimeout` in `src/components/AssistedBankingModule.jsx:67-134`; BBPS does similarly at `src/components/BBPSModule.jsx:201-225`. A browser timer can mint fake references and credit/debit the screen.
- **No authenticated end-user identity or account-level authorization:** `src/App.jsx:22,1510-1529` allows switching merchant/admin in the browser. `server/index.js:23,40-41` uses one global bearer value in production and returns the entire transaction array; no merchant/user ownership is represented.
- **No production-grade ledger or durable ACID store:** `server/index.js:13,17,32-33` stores JSON arrays and a one-sided credit marker. File rename protects an individual write from partial replacement but does not provide a database transaction, uniqueness constraint, row lock, balanced double entry or safe multi-instance concurrency.

### High

- **Insufficient idempotency scope and concurrency:** API idempotency is an in-memory/file object lookup (`server/index.js:47-59`), not a DB unique key. Concurrent creates, refunds, webhook workers or multiple processes can race. Refund remaining amount check and insert (`63-74`) are non-atomic.
- **Webhook handling needs stronger event validation and durable uniqueness:** signature is HMAC checked at `server/index.js:83-98`, but event dedupe and business update are JSON operations; unmatched/unknown events are still acknowledged. No dead-letter workflow or transition graph.
- **Unsafe error propagation/logging:** `server/index.js:29-30,72,104,116` may return or append provider/internal exception text. Logs lack a consistent redaction policy and correlation IDs.
- **No KYC, velocity/per-user limits, step-up verification, fraud/manual-review, or admin approvals** in the existing app/API.
- **Sensitive beneficiary details in browser state:** hardcoded full bank/account/mobile details at `src/components/AssistedBankingModule.jsx:8-13`; no backend masking/encryption/ownership controls.
- **Refund path is not a reversal ledger:** `server/index.js:93-97` stores a single REFUND marker; it does not create balanced reversal entries or ensure a provider refund matches the original capture and remaining amount under lock.

### Medium

- Rate limiting is process-local and IP-only (`server/index.js:15,22,35-37`); not shared across replicas and not scoped by identity or route.
- Polling runs every minute without bounded concurrency/backoff/queue (`server/index.js:110-118`); one slow provider request can overlap later intervals. No SLA alerting or dead-letter queue.
- API transaction list is unpaginated and not account-scoped (`server/index.js:41`). No database indexes exist because there is no database schema.
- Main React shell combines all modules in `src/App.jsx`; no route-level code splitting is configured. Tables use horizontal overflow in places; no tested device matrix or Lighthouse results were supplied.
- Status and receipt UI is driven by demo callbacks; production needs accessible live status, explicit available/pending balances, stale/pending/error states, and statement/receipt source records.

### Low / positive controls

- `src/components/PaymentsModule.jsx:68-74` uses provider hosted checkout, so card credentials are not intentionally collected by ReachPay UI. No source code found storing PAN/CVV/PIN/OTP. Maintain this boundary and inspect provider payload/log redaction before launch.
- The optional gateway flow uses integer paise at the API boundary (`server/index.js:44-46`) and checks webhook signatures using constant-time comparison (`86-87`); these are useful controls, but do not make the surrounding JSON/payment system production safe.
- Existing visual identity and user-recognizable navigation can be referenced; the financial simulation behavior should not be carried into the new production package.

## Prioritized fix plan

1. Keep the existing prototype untouched; build a new isolated application package and mark the old paths as demo-only.
2. Select PostgreSQL (or another approved transactional database), implement migrations, identities/roles, customer-scoped data and immutable double-entry journals with integer paise and unique idempotency/provider-event keys.
3. Add a server-side state machine and transactional hold/commit/release operations; test concurrency, duplicate events and retries before connecting UIs.
4. Define provider contracts for pay-in/POS, BBPS and payouts. Fail closed until credentials, provider configuration, webhook verification and business onboarding are supplied. Never label a mock as live.
5. Add KYC/limit/step-up gates, audited admin/reconciliation flows, SLA monitoring, supportable notifications and sanitized structured observability.
6. Replace demo UI actions with typed API calls, accessible pending/available states, mobile-first flows and receipts from persisted transactions.
7. Run unit/integration/concurrency/E2E/security tests and production build; document provider/compliance dependencies and unresolved risks.

## Assumptions and blockers

- Payment/POS, payout and BBPS providers are **not decided** and no credentials/sandbox onboarding are available. Provider contracts can be implemented, but actual transactions and provider-specific sandbox verification cannot be claimed.
- No production identity provider, KYC policy, transaction limits, fees/GST rules, admin approval policy, settlement account configuration, database host, queue, mail/SMS provider, or deployment target were supplied.
- A local development/test adapter may be explicitly named and isolated, but production mode must have no fake success path. External money movement remains disabled until the missing controls are configured and verified.
- This repository is a React/Vite prototype rather than an existing authenticated production service. This audit does not assert legal/regulatory compliance.
