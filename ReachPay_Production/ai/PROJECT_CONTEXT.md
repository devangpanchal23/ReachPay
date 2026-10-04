# Project context

## Purpose

Replace prototype financial interactions with an auditable wallet-based settlement system while preserving ReachPay's recognizable blue/white visual language. The implementation is isolated in `ReachPay_Production/`; the parent prototype stays unchanged.

## Truth boundaries

- Only signed, validated provider events or authenticated server-side provider verification can confirm collection, payout, refund, or bill payment.
- Only committed balanced ledger journals can affect derived balances.
- Amounts are integer paise; no floating-point money arithmetic is allowed.
- The prototype is not the source of truth for live balances or transaction statuses.
- With no provider/account/database configured, display unavailable balances and disable all writes.

## Current snapshot (2026-10-05)

- React/Vite UI, responsive shell, collections-to-settlement stepper and categorized service catalog exist.
- API is readiness-only and returns `503` for financial routes.
- Domain tests cover paise conversion, balancing, payout hold check, state transitions and provider fail-closed behavior.
- PostgreSQL migration is an un-applied schema draft. There is no identity integration or runtime DB repository.
- Provider contracts are abstract only; no provider is named or credentials supplied.

## Next decisions needed

Identity provider and claims; PostgreSQL hosting/backup; pay-in/POS acquirer; payout partner; BBPS agent/provider; KYC policy and limits; pricing/GST; high-value step-up; deployment/queue/observability; retention and approval requirements.
