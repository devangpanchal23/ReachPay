# Environment variables

| Name | Purpose | Obtain/configure from | Required |
| --- | --- | --- | --- |
| `PUBLIC_SITE_URL` | Exact origin for same-origin validation, canonical links and sitemap generation | ReachPay’s approved domain / Vercel project | Yes in production |
| `RESEND_API_KEY` | Server-side email delivery | ReachPay-owned Resend account | Yes for contact forms |
| `CONTACT_FROM_EMAIL` | Verified sender address | ReachPay domain verified in Resend | Yes for contact forms |
| `CONTACT_TO_EMAIL` | Monitored destination inbox | ReachPay operations/contact owner | Yes for contact forms |
| `UPSTASH_REDIS_REST_URL` | Shared, atomic production spam limit | ReachPay-owned Upstash Redis database | Yes in production |
| `UPSTASH_REDIS_REST_TOKEN` | Server-side credential for Redis REST | Upstash project | Yes in production |
| `PORT` | Local Node API port (default 8788) | Local developer setting | Optional |
| `APP_ORIGIN` | Intended application origin for the settlement foundation | Local/deployment setting | Optional |
| `PAYIN_PROVIDER`, `POS_PROVIDER`, `PAYOUT_PROVIDER`, `BBPS_PROVIDER` | Provider selection placeholders; values remain `unconfigured` and do not activate processing | Contracted provider and internal approval | Not currently used to process transactions |
| `PAYMENT_WEBHOOK_SECRET`, `PAYOUT_WEBHOOK_SECRET`, `BBPS_WEBHOOK_SECRET`, `CRON_SECRET` | Reserved server-side secrets for future verified webhook and job integrations | Approved provider/secret manager | Not currently consumed |

Use `.env.example` as a template. Never commit `.env`, print secrets, or prefix server credentials with `VITE_`. Build with `PUBLIC_SITE_URL` set to the confirmed site origin; until then the build uses the reserved `reachpay.example` placeholder domain.

## Customer authentication

`DATABASE_URL` is a TLS PostgreSQL connection from the managed DB. `AUTH_OTP_SECRET` and `AUTH_RATE_LIMIT_SECRET` are independent randomly generated values of at least 32 bytes. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM_EMAIL` configure the private email verification sender. Gmail commonly supports `smtp.gmail.com:587` with STARTTLS; use the full Gmail address as `SMTP_USER`, and the authorized sender as `SMTP_FROM_EMAIL`. Google Workspace policy may require admin-approved OAuth or SMTP relay.

Set `SMS_PROVIDER=twilio-verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` from the organization's Twilio account and Verify Service. Never put any of these values into a `VITE_` variable or commit them. The SMTP app password posted in chat must be revoked and replaced. The complete sender email address has not yet been supplied.
