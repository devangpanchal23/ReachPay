# Public enquiry API contract

## Customer authentication

- `POST /api/auth/signup`: `{name,email,mobile,password,verificationConsent:true}`; returns pending profile, sends email and SMS verification where configured, sets an HttpOnly session cookie.
- `POST /api/auth/login`: `{identifier,password}`; `identifier` is normalized email or E.164 mobile; returns next path based on both verified fields.
- `GET /api/auth/me`: own profile plus `dashboardAllowed`; no-store and session cookie required.
- `POST /api/auth/verify-email`: `{code}` six digits; challenge HMAC check and one-time consume.
- `POST /api/auth/verify-mobile`: `{code}`; Twilio Verify check.
- `POST /api/auth/resend`: `{channel:"email"|"mobile"}`; authenticated and rate-limited.
- `POST /api/auth/logout`: deletes hashed session and clears browser cookie.

Mutations validate same-origin; failures return normalized messages. Rate limits, sessions and verification state require PostgreSQL. See `CUSTOMER_AUTH_IMPLEMENTATION.md` for the trust boundary and remaining work.

## `POST /api/contact`

- **Authentication:** Public, same-origin only; no user account required.
- **Content type:** `application/json`; 16 KiB maximum in the local Node server (platform request limit also applies to Vercel).
- **Allowed kinds:** `contact`, `careers`, `newsletter`.
- **Fields:** `name` (2–100 chars except newsletter), `email` (valid address, max 254), optional `company` (max 120), `role` (required for careers, max 120), `message` (required for contact/careers, 10–4000), `consent`, and hidden `website` honeypot.
- **Security:** Exact origin compared with `PUBLIC_SITE_URL`; consent required; unknown fields are rejected; JSON is capped at 16 KiB; input is bounded and HTML-escaped; honeypot submissions are discarded; shared Upstash atomic limit is five requests per client per 15-minute window in production. Local dev uses in-memory limits. Production fails closed if Upstash is unconfigured or unavailable.
- **Delivery:** Resend API with server-only `RESEND_API_KEY`, verified `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`. No success response is returned until Resend accepts the message. Provider error details are not exposed to the browser.
- **Responses:** `202` accepted for delivery; `400` invalid fields; `403` origin mismatch; `405` unsupported method; `413` oversized local request; `415` wrong content type; `429` rate limit; `502` delivery service failure; `503` required configuration/limiter unavailable.
- **Persistence:** No application database or local file stores form submissions. Resend processes and delivers them under ReachPay’s configured provider account.
- **Newsletter limitation:** Endpoint sends an opt-in request to the team inbox. It does not subscribe the person to a list, manage consent lifecycle, send confirmation or process unsubscribe.
