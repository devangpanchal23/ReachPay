# Changelog

## 2026-10-08 — Restructure and migrate project to repository root

- Moved all application code, server modules, tests, configuration, and documentation from `ReachPay_1/` directly into the repository root.
- Removed redundant `ReachPay_1/` folder.
- Merged and updated root `.gitignore` to protect sensitive `.env` files, build output, and OS artifacts.
- Updated path references to use `.env` and root directory paths.
- Preserved 100% of financial, authentication, POS, and routing logic without alteration.

## 2026-10-06 — Consolidate into the single ReachPay_1 application

- Moved the usable integer-paise domain, transaction state rules, provider boundary, tests, configuration and settlement architecture docs into `ReachPay_1/`.
- Rebuilt the financial schema draft from the available design documentation because the prior SQL source contained only NUL bytes. The combined migration applies auth and financial schemas transactionally; it has not been run against PostgreSQL.
- Recreated the customer portal dashboard as an honest safe-mode journey/service view and merged it with the verified `/dashboard` route. All financial writes remain disabled.
- Added local and Vercel health endpoints, a complete `ROUTES.md`, noindex static route shells for auth/dashboard, and explicit financial safe-mode API responses.
- Removed the `ReachPay_Production/` directory after migration. Its original dashboard and settlement-audit source were NUL-filled; historical docs are retained in `ai/settlement-foundation/` with warnings.
- Verification: 21/21 tests pass, ESLint passes, and Vite production build passes. PostgreSQL migrations and provider integrations remain unverified because `.env` and provider credentials are not present.

## 2026-10-05 — Auth form validation and setup diagnostics

- Audited the runtime config without printing values: `.env` is absent; PostgreSQL, auth secrets, SMTP and Twilio variables are unset in the process.
- Added global country-aware phone parsing, per-country input caps, India +91/10-digit handling, field-level validation and server-side validation reuse.
- Missing database/rate-limit configuration now gives a safe administrator setup message rather than an opaque generic error.
- Verification: `npm test` passed 16/16; lint and build passed. Browser check confirms the signup form controls; account creation and OTP delivery cannot be integration-tested until real private service configuration is supplied.

## 2026-10-05 — Fix local auth API proxy 502

- Root cause: the Vite-only `npm run dev` command did not start its configured Node API target at `127.0.0.1:8788`.
- Updated the development launcher to start and stop the API and Vite together, report API bind failures, and allow only local loopback HTTP origins in development even when Vite falls back from port 5173.
- Verification: signup smoke request reached the API through Vite and returned expected 503 without database configuration; `npm test` 15/15, lint and build passed.
- Remaining account setup: provide a valid private PostgreSQL URL, apply the auth schema, and configure SMTP/Twilio before account creation and verification can work.

## 2026-10-05 — Customer signup and verification foundation

- Added `/auth/signup`, `/auth/login`, `/auth/verify`, and authenticated `/dashboard` routes.
- Added PostgreSQL auth migration, scrypt password hashing, email OTP HMAC/expiry/attempt controls, Twilio Verify adapter, HMAC-backed DB rate limits, hashed opaque sessions, origin checks and protected dashboard eligibility.
- Added private `.env.example` placeholders; did not copy the exposed SMTP credential. User must revoke it and provide the full sender mailbox address for configuration.
- Verification: `npm test` passed (15/15), `npm run lint` passed, `npm run build` passed. Browser check confirmed sign-in renders and protected verification/dashboard routes redirect without a session. Database migration and provider delivery remain unverified because credentials/endpoints were not provided.

## 2026-10-05 — Initial ReachPay corporate website

- Added separate public website with responsive marketing pages, reusable components, inherited brand palette/system font and copied favicon/hero art.
- Added contact/career/newsletter-interest API with validation, consent, origin, honeypot, bounded rate limit, Resend integration and Vercel function.
- Added production shared Upstash rate limiting requirement, Vercel headers, route HTML SEO metadata, sitemap/robots, tests and documentation.
- Audit records prototype fake metrics, timer-driven financial success, in-memory beneficiary data and JSON-store API limitations.
