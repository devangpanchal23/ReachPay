# Architecture

```text
Browser
  ├── React/Vite public pages (CSR with generated route HTML/SEO metadata)
  ├── Customer signup/sign-in and OTP verification
  └── Customer portal
        ├── Limited profile and dashboard for other accounts
        ├── Owner-approved transaction workspace with per-request database role checks
        └── Owner-only team access management
  ├── GET /api/health
  └── Financial APIs require an active owner or approved-member session and remain disabled when no service is implemented (HTTP 503)

POST /api/contact
  ├── Vercel Node function OR local Node HTTP API
  ├── origin + payload + consent + honeypot validation
  ├── Upstash Redis atomic request counter (required in production)
  └── Resend email delivery to the company inbox
```

## Boundaries

- Public copy is editable in `content/site.js`; UI behavior and semantics are in `src/site.jsx`.
- Styling uses local CSS design tokens and the prototype’s system font and navy/blue/green palette. No remote font download or third-party animation/3D runtime is required.
- `scripts/postbuild.js` writes flat static route shells, canonical/Open Graph metadata, Organization schema, sitemap, robots and a custom 404 page. `PUBLIC_SITE_URL` replaces the reserved `.example` host. Vercel clean URLs serve route files without extensions; no catch-all rewrite masks unknown paths.
- Contact API uses only server-side secrets. Email text is escaped before HTML delivery and user submissions are not written to local files or logs.
- Local development rate limits use process memory; production requires shared Upstash Redis and fails closed without it.
- No CMS/database-backed content editor or newsletter subscriber store is present.
- `server/financial/` contains integer-paise money rules, state transitions, and provider interfaces. These are pure domain primitives only; they are not connected to financial persistence or provider APIs.
- `database/migrations/001_financial_core.sql` is an archived draft containing an independent wallet ledger. It is not part of any migration runner and must not be applied. Current financial service requests use separate provider/funding references and never use this wallet schema.
- Local and Vercel health routes expose safe-mode state. Money movement remains disabled.

## Security and deployment notes

Vercel headers include CSP, frame denial, MIME sniffing protection, referrer policy and reduced browser permissions. The API checks same-origin requests, JSON media type, field lengths, explicit consent, a hidden honeypot and bounded per-client rate. Provider credentials remain server-only. Configure the correct production origin and test platform request headers before launch.
