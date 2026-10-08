# Security status

## Implemented foundation

- No credential or card data field appears in the new UI.
- No production success mock/provider adapter is enabled.
- Financial API requests fail closed while identity/database/providers are missing.
- API emits a request ID, no-store caching, `nosniff`, and no-referrer headers.
- Database draft models external auth subjects, user roles, KYC state, masked/tokenized beneficiary destinations and audit events.

## Missing before launch

Identity/session validation, CSRF/origin strategy, RBAC/IDOR tests, KYC and limits, step-up verification, production rate limiting, provider webhook signature and replay verification, DB repository/row locks, encryption/key management, secrets manager, strict CORS/CSP/HTTPS, log redaction, alerting, fraud/velocity controls, security review, penetration tests and incident/backup recovery. No security audit is claimed complete.
