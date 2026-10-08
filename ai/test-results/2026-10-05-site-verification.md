# Site verification — 2026-10-05

- `node --check` on local API modules: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 10/10 (7 contact API, 2 sitemap/navigation route contract, 1 Vercel security-header configuration).
- `PUBLIC_SITE_URL=https://www.reachpay.invalid npm run build`: PASS; 17 flat route HTML shells plus `404.html` generated with route-level title/description/Open Graph/canonical data; sitemap and robots use configured origin. `.invalid` was used only for build verification, not as a production domain.
- Production mail and Redis credentials: NOT CONFIGURED/NOT TESTED.
- Browser smoke covered Home, About, Contact, Careers, an Insights article and the 404 view. The Vite-proxied local contact endpoint returned honest HTTP 503 without credentials.
- Browser visual screenshot review, full keyboard and screen-reader, real form delivery, Lighthouse, cross-browser, Vercel deployment: NOT RUN.
