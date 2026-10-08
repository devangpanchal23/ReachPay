# ReachPay unified site and customer portal engineering memory

This directory is the durable project context for future contributors and AI-assisted work. Read `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `audits/DUMMY_PROJECT_AUDIT.md` and `PRODUCTION_READINESS_REPORT.md` before making changes.

## Working rules

- This folder is the single public website and customer portal. Keep account authentication, customer portal, financial schema, provider contracts and public website in this app.
- Treat company facts, regulatory claims, customer stories, leadership and legal copy as unverified until approved by ReachPay.
- Never claim a contact/newsletter message was delivered if mail or shared rate limiting is unavailable.
- Never add API credentials, customer data, payment details, passwords, OTPs, raw emails, or private user information to this memory folder.
- For substantial tasks, record the prompt and result under `prompts/` and `results/`, tests under `test-results/`, and root causes under `errors/` plus `solutions/`.

## Project map

- `content/site.js`: editable navigation, product, industry, editorial and company copy.
- `src/site.jsx`, `src/site.css`: responsive React pages, interaction and design tokens.
- `src/components/FinancialWorkspace.jsx`: verified customer safe-mode portal dashboard.
- `server/financial/`: pure money/state rules and fail-closed provider boundary.
- `database/migrations/`: customer auth and reconstructed financial schema.
- `server/` and `api/`: local and Vercel authentication, health and contact endpoints. Financial writes remain disabled.
- `scripts/postbuild.js`: route shells, SEO metadata, sitemap and robots output.
- `tests/`: route, auth, contact, and financial-domain coverage.
- `ROUTES.md`: complete current URL and API route inventory.

Contact forms use Resend for delivery. Production request limiting uses Upstash Redis. Local in-memory limiting is development only. Financial schemas and primitives are not a live ledger service. See `ENVIRONMENT_VARIABLES.md` and `settlement-foundation/MIGRATION_NOTES.md`.
