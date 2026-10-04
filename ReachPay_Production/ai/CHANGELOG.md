# Change log

## 2026-10-05 — settlement flow audit and safe foundation

- Audited existing prototype pages and money-flow handlers; captured evidence and severity in `audits/SETTLEMENT_FLOW_AUDIT.md`.
- Added isolated React/Vite financial operations shell, stepper, service catalog and explicit safe-mode/provider status.
- Added integer-paise, balanced journal, payout hold and transaction transition primitives, plus unit tests.
- Added fail-closed provider interface and readiness-only API; no write route reports success.
- Added un-applied PostgreSQL financial-core schema draft and engineering memory.
- Verification: unit tests 5/5 pass; production build and ESLint pass; API readiness and fail-closed route smoke checks pass; UI opened for visual/navigation review.
- PostgreSQL migration, provider E2E, concurrency, security and accessibility audits remain unverified. No per-package lockfile was created because the network registry was unavailable and the global npm cache was not writable.
