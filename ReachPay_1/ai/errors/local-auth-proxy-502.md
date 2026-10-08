# Local signup returned 502 Bad Gateway

- **Date:** 2026-10-05
- **Symptoms:** `POST /api/auth/signup` from the Vite page returned 502; browser console showed a failed resource at `localhost:5173/api/auth/signup`.
- **Root cause:** Vite proxies `/api` to `127.0.0.1:8788`, but `npm run dev` launched only Vite. The local Node API was a separate command, so the proxy could not connect when that second process was absent.
- **Related local issue found while reproducing:** when Vite's port 5173 was occupied and it fell back to 5174, the API's hardcoded development `PUBLIC_SITE_URL=http://localhost:5173` rejected the actual local origin. Development origin validation now allows HTTP only for loopback hostnames, while production still requires an exact configured origin.
- **Affected files:** `package.json`, `scripts/dev.js`, `server/auth-controller.js`, `server/index.js`, `README.md`.
- **Fix:** `npm run dev` now starts Vite and the Node API together and shuts them down together. API bind errors are reported clearly. Setup instructions now require only one dev command.
- **Verification:** with port 5173 occupied, the combined launcher started the API on 8788 and Vite on 5174. A signup smoke request through `http://127.0.0.1:5174/api/auth/signup` returned API JSON 503 (expected because this checkout has no `DATABASE_URL`) instead of 502. `npm test` passed 15/15; lint and production build passed.
- **Regression risk:** low. Production origin validation is unchanged. Local startup now fails early if the API port cannot bind.
- **Remaining setup:** the proxy 502 is separate from service credentials. Account creation still requires a real PostgreSQL `DATABASE_URL` and applied auth migration. Email/SMS delivery also requires SMTP and Twilio configuration.
