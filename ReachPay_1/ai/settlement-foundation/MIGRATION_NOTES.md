# Settlement foundation consolidation notes

The usable money and state modules, provider boundary, configuration example, documentation, and unit tests from the separate settlement foundation have been consolidated into this project. The financial domain modules now live in `server/financial/`; the financial schema is in `database/migrations/001_financial_core.sql`; its safe-mode health behavior is part of `server/index.js`; and the verified customer portal uses `src/components/FinancialWorkspace.jsx`.

## Source integrity issue found during transfer

These original files contained only NUL bytes and could not be copied as working source:

- `ReachPay_Production/src/App.jsx`
- `ReachPay_Production/database/migrations/001_financial_core.sql`
- `ReachPay_Production/ai/audits/SETTLEMENT_FLOW_AUDIT.md`

The dashboard was recreated as an honest setup/status view from the intact design docs and stylesheet. The SQL migration was reconstructed from the documented schema intent and customer-auth schema. The audit was rewritten to record the actual incomplete state. The previous financial migration was not applied to a database and was not usable as SQL.

The copied `PRODUCTION_READINESS_REPORT.md` and test result documents are historical records from the old folder. They are not evidence that this consolidated application is production-ready; this file and the current project readiness report take precedence.

## Current safety boundary

Integer-paise helpers, journal-balance checks, transition rules, and provider contracts are available and tested. Database tables and an append-only ledger constraint are drafted. There is no financial repository, transaction service, provider integration, authenticated financial API, payout/BBPS implementation, webhook processor, or reconciliation worker. The website disables all money movement and never presents fabricated balances or successes.
