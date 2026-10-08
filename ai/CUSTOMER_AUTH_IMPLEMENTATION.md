# Customer authentication implementation — 2026-10-05

## Routes and behavior

- `/auth/signup`: name, email, mobile, password and verification-message consent; persists a pending account; sends email OTP by SMTP and phone OTP through Twilio Verify when configured.
- `/auth/login`: email/mobile plus password; unverified users are routed to `/auth/verify`.
- `/auth/verify`: separate email/mobile verification and resend actions; both required to activate account.
- `/dashboard`: calls `GET /api/auth/me`; redirects unauthenticated users to login and unverified accounts to verification. Current portal is an authenticated account shell only; money services are not wired.

API routes: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/verify-email`, `POST /api/auth/verify-mobile`, `POST /api/auth/resend`, `POST /api/auth/logout`.

## Security properties

Password hashes use Node scrypt with random per-user salts. Email OTPs are six-digit, HMACed in PostgreSQL, expire in ten minutes, allow at most five challenge guesses, and are consumed once. Mobile OTPs are issued and checked by Twilio Verify; ReachPay does not store the code. Database constraints enforce unique email/mobile. Auth rate limiting uses atomic PostgreSQL upserts keyed by HMAC. Session tokens are random and opaque; only SHA-256 token hashes are persisted; browser cookies are HttpOnly, SameSite=Lax and Secure in production. Origin checks guard mutations. No password, OTP, or SMTP secret is logged.

## Database and environment

Apply `server/auth-migration.sql` with `npm run db:migrate:auth` after setting `DATABASE_URL`. Email requires a full `SMTP_USER` and approved `SMTP_FROM_EMAIL`; SMTP password is server-only. Twilio Verify requires account credentials and an active Verify Service. Build/deploy environment variables are in `.env.example` and this folder's README.

The app password pasted into chat must be revoked and replaced. It has not been copied into `.env`, source, tests, docs or Git. The sender email address remains to be supplied.

## Limits

This is a first customer-authentication slice, not a production financial authorization system. No independent security review, DB-host migration run, SMTP delivery test, Twilio sandbox test, session revocation UI, password recovery, MFA, customer transaction APIs, or cross-device E2E has completed. `/dashboard` grants only account-shell access; a verified account alone must not authorize financial actions.
