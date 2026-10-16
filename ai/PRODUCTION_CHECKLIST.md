# ReachPay Production Checklist

Status meanings: **Done** means verified in this repository or an isolated local run. **Pending** means a required action is still open. **To be confirmed** means production access or evidence is unavailable.

## Environment variables

Set server variables in **Vercel Project Settings > Environment Variables**. Put only the three deployment credentials in the GitHub `production` environment. Never put secrets in `VITE_*` variables. The names below are the complete set declared by `.env.example`; feature-only keys are conditional, but required before enabling that feature.

| Variables | Where | Required / notes | Status |
|---|---|---|---|
| `DATABASE_URL` | Vercel | Required PostgreSQL connection string for production auth and data. | To be confirmed |
| `OWNER_EMAIL` | Vercel | Required. Set to `devangpan23@gmail.com`; account must be verified before owner bootstrap. | To be confirmed |
| `AUTH_OTP_SECRET`, `AUTH_RATE_LIMIT_SECRET`, `BENEFICIARY_ENCRYPTION_KEY` | Vercel | Required for production auth, OTP/rate limits, and beneficiary encryption. Generate strong independent values and preserve encryption keys. | To be confirmed |
| `FUNDING_SOURCE_ENCRYPTION_KEY`, `DMT_DATA_ENCRYPTION_KEY` | Vercel | Required before enabling storage for the corresponding feature. | To be confirmed |
| `PUBLIC_SITE_URL`, `APP_ORIGIN` | Vercel | Set to the verified HTTPS production origin. `PUBLIC_SITE_URL` is used by the build. | To be confirmed |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL` | Vercel | Contact form delivery. Verified sender domain needed. | To be confirmed |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` | Vercel | Email OTP delivery. Configure a working SMTP account and sender. | To be confirmed |
| `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Vercel | SMS OTP. Confirm Twilio Verify configuration and delivery. | To be confirmed |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel | Required for globally consistent production rate limiting. | To be confirmed |
| `PORT` | Vercel / local runtime | Local API default is `8788`; Vercel manages the runtime port. | To be confirmed |
| `PAYIN_PROVIDER`, `POS_PROVIDER`, `PAYOUT_PROVIDER`, `BBPS_PROVIDER` | Vercel | Keep `unconfigured` until integration approval and implementation are confirmed. Do not enable live movement. | Done, fail-closed defaults in example |
| `PAYMENT_WEBHOOK_SECRET`, `PAYOUT_WEBHOOK_SECRET`, `BBPS_WEBHOOK_SECRET`, `CRON_SECRET` | Vercel | Set unique strong secrets before enabling related webhook or scheduled routes. | To be confirmed |
| `EKO_API_ENV`, `EKO_DEVELOPER_KEY`, `EKO_ACCESS_KEY`, `EKO_INITIATOR_ID`, `EKO_USER_CODE`, `EKO_ONBOARDING_CONFIRMED`, `EKO_BBPS_APPROVED`, `EKO_RECHARGE_APPROVED` | Vercel | Eko general/legacy UAT configuration. Approval flags must reflect provider evidence. | To be confirmed |
| `EKO_UAT_DEVELOPER_KEY`, `EKO_UAT_ACCESS_KEY`, `EKO_UAT_INITIATOR_ID`, `EKO_UAT_USER_CODE`, `EKO_UAT_ONBOARDING_CONFIRMED`, `EKO_UAT_BBPS_APPROVED`, `EKO_UAT_RECHARGE_APPROVED` | Vercel | Eko UAT credentials and approval evidence. | To be confirmed |
| `EKO_PRODUCTION_DEVELOPER_KEY`, `EKO_PRODUCTION_ACCESS_KEY`, `EKO_PRODUCTION_INITIATOR_ID`, `EKO_PRODUCTION_USER_CODE`, `EKO_PRODUCTION_ONBOARDING_CONFIRMED`, `EKO_PRODUCTION_BBPS_APPROVED`, `EKO_PRODUCTION_RECHARGE_APPROVED` | Vercel | Eko production credentials and written approvals required before activation. | To be confirmed |
| `PAYTM_POS_MID`, `PAYTM_POS_TID`, `PAYTM_POS_MERCHANT_KEY`, `PAYTM_POS_ENV`, `PAYTM_POS_ENCRYPTION_SECRET`, `PAYTM_POS_PRODUCTION_APPROVED` | Vercel | Paytm POS. Use approved environment and credentials only. | To be confirmed |
| `PAYTM_SETTLEMENT_API_APPROVED`, `PAYTM_SETTLEMENT_CLIENT_ID`, `PAYTM_SETTLEMENT_CLIENT_SECRET`, `PAYTM_SETTLEMENT_MERCHANT_ID`, `PAYTM_SETTLEMENT_JWT_EMAIL` | Vercel | Settlement API access and merchant scope approval required before use. | To be confirmed |
| `PHONEPE_POS_ENV`, `PHONEPE_POS_STORE_ID`, `PHONEPE_POS_SALT_KEY`, `PHONEPE_POS_SALT_INDEX`, `PHONEPE_POS_PROVIDER_ID`, `PHONEPE_POS_CONTRACT_CONFIRMED`, `PHONEPE_POS_CALLBACK_URL` | Vercel | PhonePe POS requires reviewed private contract and merchant enablement. Callback URL must use HTTPS. | To be confirmed |
| `PHONEPE_POS_UAT_SALT_KEY`, `PHONEPE_POS_UAT_SALT_INDEX`, `PHONEPE_POS_UAT_PROVIDER_ID`, `PHONEPE_POS_UAT_CONTRACT_CONFIRMED` | Vercel | PhonePe UAT values, only after contract review. | To be confirmed |
| `PHONEPE_POS_PRODUCTION_SALT_KEY`, `PHONEPE_POS_PRODUCTION_SALT_INDEX`, `PHONEPE_POS_PRODUCTION_PROVIDER_ID`, `PHONEPE_POS_PRODUCTION_CONTRACT_CONFIRMED`, `PHONEPE_POS_PRODUCTION_APPROVED` | Vercel | PhonePe production values and approvals required before activation. | To be confirmed |
| `REACHPAY_TEST_DATABASE_URL` | GitHub Actions test job only | Isolated disposable test PostgreSQL. Do not point it at production. | Done, CI uses disposable PostgreSQL |
| `PAYTM_MID`, `PAYTM_TID`, `PAYTM_MERCHANT_KEY`, `PAYTM_ENV`, `POS_ENCRYPTION_SECRET` | Vercel only if legacy integration code requires them | Compatibility aliases found in code. Confirm usage before setting; prefer the documented `PAYTM_POS_*` names. | To be confirmed |
| `AUTH_REQUIRE_POSTGRES`, `REACHPAY_API_PORT`, `REACHPAY_POS_STORE_FILE`, `NODE_ENV` | Local runtime / platform | Development and runtime controls, not production secrets. Vercel manages `NODE_ENV`; do not use local file storage as production persistence. | To be confirmed |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub `production` environment | Required by deploy workflow. Store as protected environment secrets. | To be confirmed |

## Production readiness

| Check | Status | Evidence / next action |
|---|---|---|
| Vercel `OWNER_EMAIL` matches `devangpan23@gmail.com` | To be confirmed | Verify in Vercel settings. |
| Production PostgreSQL provisioned, reachable, and private | To be confirmed | Verify the production `DATABASE_URL` and access policy. |
| All database migrations applied and repeatable | Done locally | CI and local audit run migrations twice against disposable PostgreSQL. Production migration still needs to run. |
| Database backups and restore test | To be confirmed | Confirm schedule, retention, and a tested restore. |
| Owner account verified, bootstrapped, and checked after deploy | Pending | Verify account, deploy, then confirm DB role/status and owner-only route access. |
| Email OTP and contact email delivery | To be confirmed | Verify SMTP/Resend configuration and end-to-end delivery. |
| SMS OTP via Twilio | To be confirmed | Verify credentials, Verify service, and delivery. |
| Upstash rate limiting | To be confirmed | Confirm production Redis credentials and rate-limit behavior. |
| Paytm, PhonePe, Eko provider approvals and credentials | To be confirmed | No approval evidence available in this repository. Keep live operations disabled. |
| HTTPS, production domain, DNS | To be confirmed | Configure and verify Vercel domain, DNS, TLS. |
| Security response headers | Done in repository | Vercel config defines CSP, HSTS, X-Frame-Options, nosniff, referrer and permissions headers. Verify deployed headers after release. |
| CI workflow checks | Done in repository | Pinned actions, install, audit, lint, tests, migrations and build are configured. GitHub execution still needs confirmation. |
| GitHub branch protection and required checks | Pending | Protect `main`; require CI checks and review per team policy. |
| Monitoring, error tracking, logs, alerts | To be confirmed | Configure production monitoring and confirm logs avoid sensitive values. |
| Rollback plan | Pending | Document the prior Vercel deployment rollback owner and database compatibility steps. |
| Legal pages | To be confirmed | Route model includes legal pages; review published content with the business/legal owner. |
| Live money movement | Done, disabled by default | Keep providers unconfigured until approval, implementation, credentials, and operational controls are verified. |

## Release steps

| Stage | Steps | Status |
|---|---|---|
| Before push | Review `git status` and diff; exclude local `data/local-pos-store.json` and `ReachPay_Project_Report.docx`; run `npm ci`, `npm audit`, `npm run lint`, `npm test`, and `PUBLIC_SITE_URL=https://<production-domain> npm run build`. | Pending |
| GitHub | Push a branch and open a PR; wait for CI; configure `main` branch protection and required checks; merge only after review. Set the GitHub `production` environment secrets. | Pending |
| Vercel | Link the correct project; configure production environment variables; set `OWNER_EMAIL`; verify database, email, SMS, Redis, domain, and provider state; ensure production secrets are only in Vercel. | Pending |
| After deploy | Check deployment status, HTTPS and headers; verify owner bootstrap and role-protected APIs with owner and non-owner accounts; test auth/OTP, email, SMS, rate limits, and logs; confirm no live money movement. | Pending |
