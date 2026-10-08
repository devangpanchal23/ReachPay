# OTP provider setup guide

## Mobile: Twilio Verify (selected)

1. Create or use the ReachPay organization Twilio account; enable billing and review regional SMS costs.
2. In Twilio Console, create a **Verify Service** named for ReachPay account verification. Confirm SMS is enabled.
3. Copy Account SID, Auth Token and Verify Service SID into the server/deployment secret manager as `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Set `SMS_PROVIDER=twilio-verify`.
4. Enable India in Verify Geo Permissions, apply reasonable monthly spend limits/alerts, and test on approved numbers in the provider's test/trial setup.
5. Before India production traffic, complete applicable business/Principal Entity registration, sender/header and OTP content-template requirements with the telecom access provider. Confirm with Twilio which India routing/sender configuration applies to the chosen Verify service. Keep the account signup OTP consent explicit; do not reuse OTP content for marketing.
6. Test send, wrong code, expired code, resend throttling, repeated code, international `+` numbers if required, and downstream provider/network failure before enabling signup.

Official references: [Twilio Verify SMS](https://www.twilio.com/docs/verify/sms), [Twilio verification API](https://www.twilio.com/docs/verify/api/verification), [Twilio India SMS guidelines](https://www.twilio.com/en-us/guidelines/in/sms), [TRAI guidance for senders](https://www.trai.gov.in/advice-to-senders).

TRAI guidance describes sender/Principal Entity registration and the registered header/content-template process for applicable bulk SMS, including OTP/transactional communication. The telecom provider and ReachPay compliance/legal owner should confirm the exact requirements for this account and template.

## Email: SMTP

The full mailbox address was not supplied yet. Configure that as both `SMTP_USER` and the approved `SMTP_FROM_EMAIL`. For personal Gmail the usual values are `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587` with STARTTLS; use the mailbox's newly created app password as `SMTP_PASS` only in private local `.env` or deployment secrets. Google documents SMTP/TLS and notes account/security-policy constraints. Workspace administrators may require an approved SMTP relay or OAuth setup.

The SMTP app password pasted into this conversation is exposed. Revoke it in Google Account security and generate a replacement. Do not paste the replacement into chat or commit it. For production customer OTP, prefer an organization-owned domain mailbox or transactional mail service with SPF/DKIM/DMARC, delivery monitoring, and a controlled sender identity over a personal mailbox.

References: [Gmail SMTP/TLS settings](https://support.google.com/mail/answer/7104828?hl=en), [Google app passwords](https://support.google.com/accounts/answer/185833?hl=en), [Google Workspace SMTP relay](https://support.google.com/a/answer/2956491?hl=en).

## ReachPay configuration

Set `DATABASE_URL`, independently generated `AUTH_OTP_SECRET` and `AUTH_RATE_LIMIT_SECRET`, the SMTP values, and Twilio values privately. Apply `server/auth-migration.sql` with `npm run db:migrate:auth`. Then test signup and both verification channels in the provider sandbox. No integration is production-ready until outbound delivery, rate limits, logs, database backups and recovery, privacy notice, and deployment secret handling have been reviewed.
