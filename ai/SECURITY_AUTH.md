# Customer authentication security review — implementation notes

- Passwords: Node `scrypt`, random per-user salt, no plaintext persistence.
- Email OTP: cryptographically generated, ten-minute expiry, HMAC stored, maximum five challenge attempts, single-use.
- SMS OTP: Twilio Verify manages code generation/verification; ReachPay stores no OTP.
- Session: opaque random token in HttpOnly, SameSite=Lax, Secure production cookie; SHA-256 digest in PostgreSQL; logout revokes it.
- Authorization boundary: `/dashboard` is gated on active account plus verified email and mobile. This does not grant financial permissions; those APIs are not part of this corporate-site app.
- Abuse controls: atomic DB-backed rate buckets per IP/identifier/user/channel; exact Origin check for mutations; generic invalid-login response.
- Sensitive data: mail/SMS/DB credentials are server-only; no OTP or password is logged or saved to AI records.

The app password provided in chat must be revoked. It was not copied into files. Remaining before production: test real SMTP and Twilio sandbox configuration, review deployment secrets and DB pool sizing, add password recovery/MFA/device controls as needed, and complete a security assessment.
