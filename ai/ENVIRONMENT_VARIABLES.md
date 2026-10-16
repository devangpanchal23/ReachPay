# Environment variables

| Name | Purpose | Obtain/configure from | Required |
| --- | --- | --- | --- |
| `PUBLIC_SITE_URL` | Exact origin for same-origin validation, canonical links and sitemap generation | ReachPay’s approved domain / Vercel project | Yes in production |
| `RESEND_API_KEY` | Server-side contact and email OTP delivery | ReachPay-owned Resend account | Yes for contact forms; required for OTP if SMTP is not configured |
| `CONTACT_FROM_EMAIL` | Verified sender address for Resend | ReachPay domain verified in Resend | Yes for contact forms; required for OTP if SMTP is not configured |
| `CONTACT_TO_EMAIL` | Monitored destination inbox | ReachPay operations/contact owner | Yes for contact forms |
| `UPSTASH_REDIS_REST_URL` | Shared, atomic production spam limit | ReachPay-owned Upstash Redis database | Yes in production |
| `UPSTASH_REDIS_REST_TOKEN` | Server-side credential for Redis REST | Upstash project | Yes in production |
| `PORT` | Local Node API port (default 8788) | Local developer setting | Optional |
| `APP_ORIGIN` | Intended application origin for the settlement foundation | Local/deployment setting | Optional |
| `OWNER_EMAIL` | Server-only address eligible for owner assignment after verification | ReachPay owner account | Required for team administration |
| `PAYIN_PROVIDER`, `POS_PROVIDER`, `PAYOUT_PROVIDER`, `BBPS_PROVIDER` | Provider selection placeholders; values remain `unconfigured` and do not activate processing | Contracted provider and internal approval | Not currently used to process transactions |
| `PAYMENT_WEBHOOK_SECRET`, `PAYOUT_WEBHOOK_SECRET`, `BBPS_WEBHOOK_SECRET`, `CRON_SECRET` | Reserved server-side secrets for future verified webhook and job integrations | Approved provider/secret manager | Not currently consumed |

Use `.env.example` as a template. Never commit `.env`, print secrets, or prefix server credentials with `VITE_`. Build with `PUBLIC_SITE_URL` set to the confirmed site origin; until then the build uses the reserved `reachpay.example` placeholder domain.

## Customer authentication

`OWNER_EMAIL` is a server-only RBAC seed value. Set it to `devangpan23@gmail.com` in local `.env` and in the Vercel project environment. Matching is case-insensitive after trimming. The migration and login-time promotion accept only the matching active account with a verified email, and never replace an existing different owner. If that account does not exist or is not yet verified and active, ownership remains unassigned until the account is verified and the migration is rerun or the account next logs in.

After setting `OWNER_EMAIL` and `DATABASE_URL`, run `npm run db:migrate:auth`. This applies the auth, RBAC, and owner bootstrap migrations. Production does not auto-apply migrations during app requests or deployment, so run the command against the production database before redeploying. Set `OWNER_EMAIL` for Vercel Production before redeployment. Do not use a `VITE_` variable.

`DATABASE_URL` is the PostgreSQL connection string from the managed database. Neon URLs on a `*.neon.tech` host are supported, including pooled hostnames and `channel_binding=require`; the app enforces TLS certificate verification and node-postgres channel binding. `AUTH_OTP_SECRET` and `AUTH_RATE_LIMIT_SECRET` are independent randomly generated values of at least 32 bytes.

For email OTP, use either a Resend API key with `CONTACT_FROM_EMAIL`, or all five SMTP values: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM_EMAIL`. Resend is the shorter setup because the same credentials already power contact email. Verify the sending domain in Resend and use a From address on that domain. Resend requires SPF and DKIM authentication for verified domains. The `resend.dev` testing sender is not suitable for sending OTPs to arbitrary users. Details are in [Resend's domain guidance](https://resend.com/changelog/auth0-integration).

Set `SMS_PROVIDER=twilio-verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` from the organization's Twilio account and Verify Service. SMS verification remains required for signup completion. Never put any of these values into a `VITE_` variable or commit them.

`OWNER_EMAIL`, `DATABASE_URL`, OTP/rate-limit secrets, email delivery, and Twilio Verify must be configured for production signup and account ownership. `BENEFICIARY_ENCRYPTION_KEY` is for later beneficiary storage, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are used by contact-form rate limiting, not auth signup. `APP_ORIGIN` is currently informational; origin checks use `PUBLIC_SITE_URL`.

For production migrations, use the commands and order in the release checklist. Auth, migration, and health code all accept Neon database names when the host belongs to Neon. Keep the database URL in Vercel and in a private shell environment only.
