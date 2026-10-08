# Local contact API origin mismatch

- **Symptoms:** A smoke POST through Vite from `http://127.0.0.1:5173` returned 403 because the proxied request host did not represent the browser origin.
- **Root cause:** Without `.env`, the local API inferred the origin from the proxy-facing `Host` header, which differs from the page origin.
- **Affected files:** `server/index.js` local development bootstrap.
- **Solution:** Default only non-production local API instances to `PUBLIC_SITE_URL=http://localhost:5173`; production remains required to configure its exact origin. Use the documented `localhost` URL.
- **Tests:** Rechecked POST through `http://localhost:5173/api/contact`; origin passed and response was the expected 503 because Resend credentials are absent.
- **Regression risk:** If local Vite runs on a different port, set `PUBLIC_SITE_URL` to that exact origin. Production has no fallback.
