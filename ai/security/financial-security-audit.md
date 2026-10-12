# ReachPay Financial Security Audit

Review scope: repository-level review for Phase 6.4. This is not a penetration test, compliance certification, provider approval, or production deployment assessment.

## Findings

| Severity | Finding | Status |
|---|---|---|
| Blocker | No provider-issued production credentials, service permissions, or written authorization for POS-funded BBPS/DMT/payouts were supplied. | Financial submission stays disabled. |
| Blocker | Financial repositories intentionally allow only `reachpay_dev` and `reachpay_test`; production database routing and deployment migration plan are not implemented. | Production is not deployable through current database guards. |
| High | Transfer drafts and pending approvals could remain reserved if abandoned. | Added 24-hour expiry, owner cancellation, approval cancellation, audit history, and atomic limit release. The worker still needs scheduling and monitoring. |
| High | Production and UAT credentials must never share signing material. | PhonePe POS and Eko BBPS now use environment-specific production configuration; Paytm POS production initiation has a server-side gate. Secret-manager deployment and rotation remain unverified. |
| High | PhonePe request signatures must use the same selected environment as the provider endpoint and callback. | Fixed environment-specific request signing and callback secret selection; added regression coverage. |
| Medium | Provider-originated error bodies can contain sensitive or untrusted data. | Paytm raw response bodies were removed from parse errors and provider messages sanitized. Review other provider logging after any adapter is added. |
| High | Production edge controls, TLS termination, proxy behavior, shared rate limiting, monitoring, backups, and recovery are outside this local server process. | API binds to loopback. Deployment-level controls and restore drills remain unverified. |
| High | Provider status, balance, refund, reversal, and webhook contracts are merchant/product-specific. | No live claims are made; provider adapters remain gated until documentation and UAT evidence are approved. |

## Controls observed

- Customer session tokens are stored as hashes; session cookies are HttpOnly, SameSite=Lax, and Secure in production mode.
- Beneficiary/account data and DMT sender data use authenticated encryption in their existing storage workflows.
- Organization roles and maker-checker approvals enforce active membership, separation of duties, and organization scoping in application/database controls.
- Idempotency, transaction states, provider-confirmed-success evidence, audit history, and atomic transfer-limit reservation exist in the current financial architecture.
- POS callbacks are verified before the callback can alter transaction status. Verify the exact secret and payload contract with each merchant provider account before activation.
- Provider credentials remain server-side and are not returned to frontend status responses.
- Database access in the audited financial/auth/POS repositories is restricted to `reachpay_dev` and `reachpay_test`. The existing `reachpay` database was not accessed.

## Required before production

1. Complete an independent security review and targeted penetration test of deployed routes, session lifecycle, CSRF/origin validation, authorization, rate limiting, and callback paths.
2. Implement and review production database configuration with least-privilege roles, TLS verification, pool sizing, additive migrations, backups, restore testing, and audited access.
3. Move secrets to a managed vault, split environments, define rotation and recovery, and remove local development secrets from deployment paths.
4. Add reliable shared rate limiting, security headers, request correlation, secret-safe structured logs, metrics, and paging alerts at the deployed edge.
5. Schedule and monitor transfer expiry and provider reconciliation. Define stale-transaction, duplicate-event, provider-outage, mismatch, and incident runbooks.
6. Obtain provider and regulatory approval for product, customer segment, funding account, KYC/consent, transaction limits, complaint/refund, and retention requirements.
7. Complete provider UAT, signed callback verification, reconciliation, and failure/recovery tests before any production service is enabled.

No real financial transactions or production database operations were performed as part of this audit.
