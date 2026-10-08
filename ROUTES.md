# ReachPay routes

All routes are served by the single React/Vite application in this folder. The `/dashboard` route requires a session and both email and mobile verification. Direct navigation to unknown paths shows the in-app 404 page.

## Public website

| Route | Purpose |
| --- | --- |
| `/` | Home |
| `/about` | About ReachPay |
| `/solutions/payments` | Payments overview |
| `/solutions/bill-payments` | Bill payments overview |
| `/solutions/payouts` | Payouts and transfers overview |
| `/solutions/assisted-commerce` | Assisted commerce overview |
| `/industries` | Industries overview |
| `/case-studies` | Case studies |
| `/leadership` | Leadership |
| `/careers` | Careers and interest form |
| `/insights` | Searchable insights list |
| `/insights/clear-payment-status` | Insight article |
| `/insights/reconciliation-checklist` | Insight article |
| `/insights/beneficiary-data-care` | Insight article |
| `/contact` | Contact form |
| `/privacy` | Privacy notice scaffold |
| `/terms` | Terms scaffold |

## Customer account and portal

| Route | Purpose |
| --- | --- |
| `/auth/signup` | Create customer account |
| `/auth/login` | Sign in by email or mobile |
| `/auth/verify` | Verify email and mobile OTPs |
| `/dashboard` | Authenticated customer portal and safe-mode settlement dashboard |

## API endpoints

| Method and path | Purpose / current behavior |
| --- | --- |
| `POST /api/auth/signup` | Create account and start verification |
| `POST /api/auth/login` | Create customer session |
| `POST /api/auth/verify-email` | Verify email OTP |
| `POST /api/auth/verify-mobile` | Verify Twilio Verify code |
| `POST /api/auth/resend` | Resend a verification code |
| `GET /api/auth/me` | Read current session and account state |
| `POST /api/auth/logout` | Revoke current session |
| `POST /api/contact` | Submit contact/careers/newsletter interest |
| `GET /api/health` | Report safe-mode and integration configuration state |
| `* /api/*` (other paths) | Fail closed with `503 SERVICE_NOT_CONFIGURED`; financial APIs are not implemented (local API and Vercel catch-all) |

The settlement flow screens communicate the intended eight-step journey, but they do not collect or move funds. Wallet, payout, BBPS, beneficiary, admin, and reconciliation APIs remain disabled until transactional services and contracted providers are implemented.
