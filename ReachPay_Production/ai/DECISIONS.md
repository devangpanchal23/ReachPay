# Decisions

## 2026-10-05 — isolate production work

Keep the prototype and `ReachPay_1/` corporate website intact; place the settlement application in `ReachPay_Production/`. The repository already had unrelated uncommitted files, so changes are limited to this new path.

## 2026-10-05 — fail closed without providers

No provider names or credentials were supplied. Do not simulate production success. API mutations remain disabled until actual providers, identity and a transactional DB runtime are implemented.

## 2026-10-05 — PostgreSQL as target ledger store

Draft a PostgreSQL schema with integer-paise balanced append-only journals and no mutable balance field. Migration is documentation/schema groundwork only; no database runtime is connected.
