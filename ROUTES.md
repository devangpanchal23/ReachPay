# ReachPay routes

All routes are served by the single React/Vite application in this folder. Normal customer accounts need a session and both email and mobile verification for the dashboard. Owner-created pending members can use the limited dashboard after the owner provisions their account. Only the owner and approved members can use transaction APIs.

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
| `/team-access` | Owner-only member management |

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
| `GET /api/auth/team` | List members, owner only |
| `POST /api/auth/team` | Add a pending member, owner only |
| `POST /api/auth/team-approve` | Approve member transaction access, owner only |
| `POST /api/auth/team-revoke` | Revoke member access and sessions, owner only |
| `POST /api/auth/team-remove` | Remove a member, owner only |
| `GET, POST /api/pos/{paytm,phonepe}/{config,terminals,terminal-disable,transactions,sync-logs,test-connection,initiate-sale,status,sync,reconcile}` | POS machine and POS wallet operations, owner or approved member |
| `POST /api/pos/{paytm,phonepe}/webhook` | Provider-signed POS callback. Vercel remains unavailable until a dedicated function is implemented |
| `GET /api/banking/status` | Banking integration state, owner or approved member |
| `GET, POST, PATCH /api/banking/beneficiaries[/:id]` | Beneficiary and bank-transfer setup, owner or approved member |
| `GET, POST /api/financial/{dashboard,transactions,funding-sources,providers,reconciliation,services,...}` | Wallet view, DMT, bank transfers, BBPS, recharge, and service catalog, owner or approved member |
| `GET, POST, PATCH, PUT /api/financial/organizations/...` | Banking organizations, members, transfer approvals, limits, and sender setup, owner or approved member |
| `POST /api/contact` | Submit contact/careers/newsletter interest |
| `GET /api/health` | Report safe-mode and integration configuration state |
| `* /api/*` (other paths) | Local API and Vercel catch-all require an active owner or approved-member session, then return `503 SERVICE_NOT_CONFIGURED` until implemented |

The settlement flow screens communicate the intended eight-step journey, but they do not collect or move funds. Wallet, payout, BBPS, beneficiary, admin, and reconciliation APIs remain disabled until transactional services and contracted providers are implemented.
