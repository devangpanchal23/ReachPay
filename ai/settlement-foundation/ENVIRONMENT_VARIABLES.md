# Environment variables

`.env.example` contains placeholders only; the present API does not establish live connections.

| Variable | Purpose | Obtain/configure from |
|---|---|---|
| `PORT` | Local API listener | Deployment runtime |
| `APP_ORIGIN` | Intended browser origin for future origin/CSRF/CORS policy | ReachPay deployment |
| `DATABASE_URL` | Intended PostgreSQL connection | Approved managed PostgreSQL host / platform secret manager |
| `AUTH_ISSUER`, `AUTH_AUDIENCE` | Intended JWT issuer/audience | Chosen identity provider |
| `PAYIN_PROVIDER`, `POS_PROVIDER`, `PAYOUT_PROVIDER`, `BBPS_PROVIDER` | Adapter selection names | Provider contracts; no adapter exists yet |
| `PAYMENT_WEBHOOK_SECRET`, `PAYOUT_WEBHOOK_SECRET`, `BBPS_WEBHOOK_SECRET` | Webhook signature verification secrets | Each provider's merchant portal/secret manager |
| `CRON_SECRET` | Intended authenticated scheduled jobs | Secret manager |
| `LOG_LEVEL` | Runtime log filtering | Deployment operations |

Keep production values only in a managed secret store. Never commit `.env`, credentials, customer data, bank details, raw provider payloads, card details or OTPs. Presence of a configuration value is not evidence an integration is working.
