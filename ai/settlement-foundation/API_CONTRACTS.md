# API contracts

## Implemented

- `GET /api/health`: reports safe mode and whether named configuration values are absent/present. It does not test provider connectivity or DB readiness.
- Other `/api/*`: `503 SERVICE_NOT_CONFIGURED`, with a request ID. No financial mutations are implemented.

## Target API conventions

All endpoints require verified user identity and server-side roles/ownership. Validate every request, rate limit by identity/operation, bind a request/correlation ID, return normalized errors, and never trust client amounts/status/owner IDs. Mutations require `Idempotency-Key`, scoped to actor and operation and persisted with a unique constraint.

Planned families: `/api/auth/*`, `/api/wallet/*`, `/api/collections/*`, `/api/transactions/*`, `/api/beneficiaries/*`, `/api/payouts/*`, `/api/bbps/*`, `/api/webhooks/{provider}`, `/api/admin/*`, `/api/reconciliation/*`. These are design targets only, not available routes today.
