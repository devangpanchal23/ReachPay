# Production database release order

Run these commands from a trusted shell with `DATABASE_URL` set to the production Neon database. The commands do not print the connection string. Do not run them from a deployment build.

```sh
npm run db:migrate:auth
npm run db:migrate:pos
npm run db:migrate:beneficiaries
npm run db:migrate:financial-operations
npm run db:migrate:service-catalog
npm run db:migrate:transfer-controls
npm run db:check:auth-schema
npm run lint
npm test
npm run build
```

Each migration command is designed to be repeat-safe. The auth migration applies the auth schema, RBAC, owner bootstrap, SMS resend support, and auth rate-limit key uniqueness in one transaction. The other migration scripts use their own repeat-safe schema steps. If a migration exits with an error, stop and resolve it before deploying. The auth rate-limit uniqueness migration intentionally fails if the table is absent or its data cannot safely accept the unique index; inspect and resolve that state before retrying.

After all commands pass, deploy the same commit with `vercel --prod`. Never deploy code that needs a schema change before the migration and schema check pass. Make this sequence a required release checklist or CI gate. Do not run `database/migrations/001_financial_core.sql`; live financial operations remain disabled.

The schema check reports missing auth tables, columns, and required indexes without printing database connection details. It exits nonzero if anything is missing.
