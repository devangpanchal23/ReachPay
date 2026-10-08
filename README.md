# ReachPay customer website and settlement portal

This is the single React/Vite project for ReachPay’s public website, customer signup/sign-in, and customer portal. Settlement-domain helpers and a PostgreSQL financial schema foundation have been consolidated here. Financial APIs remain fail-closed, and the portal reports unavailable balances until authenticated ledger and authorized payment providers are implemented.

## Start locally

Requirements: Node.js 22 or later and npm. PostgreSQL 13+ is required for the local customer-auth and financial schema migration.

```sh
npm ci
cp .env.example .env
# Configure service values in .env when ready.
npm run dev
```

Open the Vite URL printed in the terminal. `npm run dev` starts both Vite and the local Node API. If the default API port is occupied, the launcher selects a free API port and points the Vite proxy to it. Press Ctrl+C to stop both processes. The local API accepts only HTTP origins on localhost/127.0.0.1/::1 in development. When an external email service is not configured, forms report the failure instead of claiming delivery.

## Customer accounts

The customer auth routes are `/auth/signup`, `/auth/login`, `/auth/verify` and `/dashboard`. Signup asks for name, email, mobile, password and one explicit consent for verification messages. Login accepts email or mobile and password. Both OTPs must be verified before the dashboard route grants access. The signed-in portal shows the settlement flow, service categories, and integration readiness without inventing balances or payment outcomes. See [ROUTES.md](./ROUTES.md) for the full page and API inventory.

Signup validates name (2–100 characters), email (up to 254), password (12–128), and country-aware mobile numbering. The country selector defaults to India: its country code is displayed separately and the national-number field accepts exactly 10 digits. The server uses the same international phone metadata and rejects invalid, overlong, or fixed-line numbers. Login applies equivalent email/mobile and password-length checks.

ReachPay supports two authentication modes:
- **Out of the box (Zero external setup required):** The local server includes a persistent local JSON database engine (`server/data/reachpay-auth.json`). In local development, signup and login work immediately without installing PostgreSQL. One-time verification codes are output directly to your terminal console, and the universal development code `123456` (or the "⚡ Verify all" button) can be used on `/auth/verify` to instantly verify email and mobile.
- **PostgreSQL & production mode:** Configure `DATABASE_URL`, `AUTH_OTP_SECRET`, `AUTH_RATE_LIMIT_SECRET`, SMTP credentials, and Twilio Verify in `.env`. Apply the PostgreSQL schema using:

```sh
npm run db:check
npm run db:migrate:auth
```

After setup, `npm run dev` starts the local API together with Vite. Sign in with either your registered email or 10-digit mobile number and your password.

## Build and verify

```sh
npm run lint
npm test
npm run build
npm run preview
```

## Deployment

The statically generated frontend routes and `/api/contact` serverless function can be deployed from this folder to Vercel. The build creates flat extensionless HTML routes, route-specific metadata, and a custom HTTP 404 page. Configure these server environment variables in the Vercel project:

- `RESEND_API_KEY` — API key from the ReachPay-owned Resend account.
- `CONTACT_FROM_EMAIL` — sender address on a domain verified in Resend.
- `CONTACT_TO_EMAIL` — monitored ReachPay enquiry inbox.
- `PUBLIC_SITE_URL` — exact production origin, such as the verified ReachPay domain.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST credentials for a shared atomic contact-form rate limit. Production contact forms fail closed when these are missing.

Auth additionally needs `DATABASE_URL` (PostgreSQL TLS/pooler URL), `AUTH_OTP_SECRET` and `AUTH_RATE_LIMIT_SECRET` (independent random secrets, at least 32 bytes), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMS_PROVIDER=twilio-verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. `SMTP_USER`/`SMTP_FROM_EMAIL` require the full approved mailbox address. Generate auth secrets locally with `openssl rand -hex 32`; keep them in a secret manager. Configure `PUBLIC_SITE_URL` as the exact HTTPS site origin. Provider variables in `.env.example` remain `unconfigured` and do not activate payment processing.

Never use `VITE_` for secrets. Verify email-domain DNS and test each form in the provider’s test configuration before enabling public traffic. Newsletter signup currently emails an opt-in request to the configured ReachPay inbox; it does not create a mailing-list subscription, send confirmation, or provide an unsubscribe mechanism. Production form delivery requires the shared Upstash limiter; local development uses a bounded in-memory limiter.

## Pages

Home, About, Solutions (Payments, Bill payments, Payouts & transfers, Assisted commerce), Industries, Case studies, Leadership, Careers, Insights, Contact, Privacy, Terms, and a 404 view.

## Structure

```text
api/contact.js             Vercel contact endpoint
api/auth/[action].js       Vercel customer-auth endpoint
content/site.js            editable public copy and navigation
public/                     favicon, hero asset, robots and sitemap
scripts/postbuild.js       route metadata, canonicals and deployment sitemap generation
server/contact-handler.js  origin, validation, spam and mail handling
server/auth-controller.js  signup, sign-in, OTP and session service
server/auth-core.js        validation, scrypt and token helpers
server/sms/twilio-verify.js mobile OTP adapter
server/auth-migration.sql  PostgreSQL customer-auth schema
server/index.js            local development API
src/site.jsx                page components and responsive navigation
src/site.css                design tokens, responsive styles and motion
tests/                      contact, route and auth-core contracts
database/migrations/        financial schema draft
server/financial/           money/state rules and fail-closed provider contracts
src/components/FinancialWorkspace.jsx  signed-in safe-mode customer dashboard
ROUTES.md                   page and API route inventory
ai/                         audit and engineering memory
```

## Content requiring ReachPay approval

The company’s approved legal name/address, regulatory and licensing disclosures, supported geographies, provider-backed product availability, leadership profiles, customer references/results, open roles, editorial articles, privacy policy, terms, and domain are not present in the supplied source. The site labels unverified copy as proposed or pending and intentionally contains no fabricated statistics, customer names, regulatory claims or testimonials. Replace the reserved `reachpay.example` sitemap/robots host with the verified production domain before launch.

## Design and quality notes

The site retains the prototype’s system sans-serif typography and blue/green/navy color identity. Reveal transitions respect `prefers-reduced-motion`; Spline was omitted because it adds weight without a clear purpose on a payments site. The privacy and terms screens are scaffolds requiring legal review. This implementation is not production-approved until the email service, content, legal disclosures and domain are supplied and a deployed browser/accessibility/performance review is completed.
