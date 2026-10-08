# Project context

- **Product/company:** ReachPay, financial technology/payments (India focus is an assumption inferred from the sibling prototype’s INR/BBPS copy; confirm with the company).
- **Deliverable:** The single ReachPay website and customer portal lives in this project folder. Public pages, customer signup/sign-in, and the post-login workspace use one React/Vite app.
- **Framework:** React 19, Vite 8, Node.js 22 API/serverless route, native CSS, Lucide icons.
- **Purpose:** Public company/product overview, customer authentication and a safe-mode settlement workspace. The actual money-moving operations remain disabled pending provider, database repository, compliance and security implementation.
- **Design:** Preserves system sans-serif typography and navy/blue/green identity found in the prototype. White/neutral surfaces dominate, blue is secondary, green is a small accent.
- **Content status:** All operational company facts, supported services, geographies, provider contracts, leadership, customer proof, company legal details and open positions need owner approval. No invented performance statistics or testimonials are included.
- **Current UI routes:** See `ROUTES.md` for the complete public, auth, portal and API route inventory.
- **Forms:** Contact/career/newsletter-interest requests pass origin checks, bounded input validation, consent and honeypot checks, rate limiting and Resend delivery. No success is returned if configured delivery is unavailable. Newsletter interest is emailed to the team; there is no subscription database, confirmation or unsubscribe system.
- **Settlement foundation:** Integer-paise calculations, transaction state rules, provider contracts, financial SQL draft and safe-mode dashboard are integrated. No live financial operation is available or claimed.
- **Production boundary:** ReachPay must provide database, approved identity/compliance process, authorized payment/POS/payout/BBPS integrations, mail/SMS configuration, exact domain, shared rate limiting and approved content. Legal, accessibility and independent security reviews remain necessary.
