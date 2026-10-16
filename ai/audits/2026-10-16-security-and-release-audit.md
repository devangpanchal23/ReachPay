# ReachPay Security and Release Audit

Audit date: 2026-10-16

## Executive result

**Verdict: Not ready to deploy.** Repository-level fixes and checks are complete or in progress, but production configuration, Vercel/GitHub settings, service delivery, and provider approvals cannot be verified from this checkout. The financial and banking Vercel routes also currently fail closed with service unavailable responses because their handlers are not connected to the catch-all Vercel function. No live money movement was enabled.

## Findings

| Severity | Finding | File / area | Status |
|---|---|---|---|
| High | Original deploy workflow used floating action tags and did not require the full audit, lint, test, and build gate. | `.github/workflows/` | Fixed. Workflows use full action SHAs, least-privilege read permissions, and checks before deploy. |
| High | Production deployment is not verified. Vercel credentials, project configuration, environment variables, branch protection, and a successful hosted workflow run are unavailable locally. | GitHub / Vercel settings | Pending. See production checklist. |
| High | Financial and banking Vercel endpoints are not wired to their server handlers. Requests fail closed, but those services are unavailable in production. | `api/[...path].js`, `server/financial/` | Pending. Keep these routes unavailable until the serverless integration is implemented and reviewed. |
| High | Provider onboarding, production credentials, and approvals for Paytm, PhonePe, and Eko cannot be verified. | Provider configuration | To be confirmed. Keep all live operations disabled. |
| Medium | Development authentication previously logged verification codes. | `server/auth-controller.js` | Fixed. OTP logging removed and regression coverage added. |
| Medium | The lockfile had a vulnerable `source-map-js` version. | `package-lock.json` | Fixed. Updated dependency and `npm audit` reports zero vulnerabilities. |
| Medium | Database-backed test files could run migrations concurrently and produce deadlock notices. | `package.json`, `server/auth-controller.js` | Fixed. Added migration lock and serialized test execution. Serial PostgreSQL run is being verified. |
| Medium | Production owner, database, backups, SMTP, Twilio, Upstash, monitoring, DNS, legal content, and rollback readiness are outside repository evidence. | Production environment | To be confirmed. |
| Low | Mobile/browser visual smoke checks and live direct-URL checks cannot be performed without a running app environment. | UI / deployed app | Pending. Source includes responsive and accessibility patterns, but deployed behavior needs verification. |
| Low | Local POS fixture data and an untracked project report are present in the working tree. | `data/local-pos-store.json`, `ReachPay_Project_Report.docx` | Pending exclusion. Do not stage either file for the audit push. |

## Audit coverage

- **Role access:** Database-backed role/access state is checked server-side on each authenticated request. Owner uniqueness and owner protection are enforced in migrations. The UI uses matching route guards. API tests cover unauthenticated direct requests and route access. Production owner bootstrap still needs post-deploy verification.
- **CI/CD:** Workflow actions are pinned to full commit SHAs. Permissions are read-only. Both workflows run `npm ci`, dependency audit, migrations twice, lint, tests, and build. Deploy is restricted to `main` and uses GitHub `production` environment secrets. GitHub branch protection must still be configured.
- **Dependencies and code scan:** Lockfile is present and npm audit reports zero vulnerabilities. Package scripts contain no preinstall/install/postinstall hooks. Searches found no dynamic `eval`/`Function` use or unexpected `child_process`; expected provider URLs and webhook/network integrations were reviewed.
- **Secrets:** `.env` is ignored and not tracked. `.env.example` contains blank/fake values. No actual credentials were found in the tracked source/history scan; DB URL matches were local test fixtures. No `VITE_*` secret configuration was found. The user-shared password is not copied into repository files; because it was shared in chat, rotate it if it is a real account password.
- **Hardening:** Auth passwords use salted derived hashes; OTP storage is HMAC-based; OTP and contact routes have limits; production auth requires PostgreSQL and configured delivery services. SQL statements use parameters. Vercel config declares CSP, HSTS, clickjacking, MIME, referrer, and permissions headers. Webhook paths require signatures. Financial APIs stay fail-closed.
- **Migrations:** Six migration entry points were applied twice on a disposable PostgreSQL database without migration errors. CI repeats this on a fresh PostgreSQL service. Production migration and restore/backup checks remain open.
- **UI:** Route/accessibility source checks are present. Visual mobile and real-browser smoke tests remain pending.

## Verification results

| Check | Result | Date / notes |
|---|---|---|
| `npm run lint` | Pass | 2026-10-16 |
| `npm test` without PostgreSQL | Pass, 104 passed, 5 PostgreSQL tests skipped | 2026-10-16 initial baseline |
| `npm test` with disposable PostgreSQL, before test serialization | Pass, 109 passed, 0 failed; migration deadlock notices observed | 2026-10-16 |
| `npm test` with disposable PostgreSQL, serial mode | Pass, 109 passed, 0 failed, 0 skipped | 2026-10-16 |
| `PUBLIC_SITE_URL=https://reachpay.example npm run build` | Pass | 2026-10-16 |
| `npm audit` | Pass, 0 vulnerabilities | 2026-10-16 |
| `npm ci` | Pass, clean install from lockfile, 159 packages audited, 0 vulnerabilities | 2026-10-16 |
| Workflow YAML parse and `git diff --check` | Pass | 2026-10-16 |
| GitHub workflow execution / Vercel deployment | Not run | Requires remote configuration and secrets |

## Files added or changed

The audit added or revised `.github/workflows/ci.yml`, `.github/workflows/deploy-vercel.yml`, `ai/PRODUCTION_CHECKLIST.md`, role and database migration files, server/API security behavior, tests, docs, `.env.example`, `package.json`, and `package-lock.json`. Existing local modifications were reviewed and preserved. The user-local POS data file and Word report are untracked/modified local data and must not be included in the push.

## Push commands

Review and exclude the local data/document, then use a review branch:

```sh
git switch -c codex/security-release-audit
git add -A -- . ':(exclude)data/local-pos-store.json' ':(exclude)ReachPay_Project_Report.docx'
git status --short
git diff --cached --check
git commit -m "Harden release pipeline and document production readiness"
git push -u origin codex/security-release-audit
```

Open a pull request to `main`. Merge only after GitHub checks pass and required branch protection is configured. Do not push directly to `main` before confirming the deployment environment is ready.

## Vercel deployment steps

1. Create/select the correct Vercel project and connect the GitHub repository.
2. Add required production variables from `ai/PRODUCTION_CHECKLIST.md` in Vercel. Keep secrets server-side and keep providers disabled until approved.
3. Set `OWNER_EMAIL=devangpan23@gmail.com`; configure a production PostgreSQL URL and take a backup before the first migration.
4. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub `production` environment secrets. Restrict environment deployment to `main` and approved reviewers if available.
5. Configure `main` branch protection and require CI checks. Merge the reviewed PR only after CI passes.
6. Confirm GitHub deploy workflow succeeds. Verify HTTPS, DNS, headers, auth, owner/non-owner direct API access, email/SMS OTP, Redis rate limiting, logs, backups, and rollback.
7. Verify financial endpoints remain unavailable until their Vercel handlers and approved integrations are ready. Do not turn on live money movement as part of this release.

## Remaining blockers

- Configure/verify Vercel and GitHub production settings and secrets.
- Set up production PostgreSQL, run migrations, confirm backups and restore readiness.
- Verify owner bootstrap and role access after deploy.
- Implement/wire financial and banking API handlers for Vercel before advertising those services.
- Verify provider approvals, delivery integrations, monitoring, legal content, rollback, DNS, and production smoke tests.
- Exclude local files from any push.
