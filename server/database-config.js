const ALLOWED_DATABASE_NAMES = new Set(['reachpay', 'reachpay_dev', 'reachpay_test']);

export function parseDatabaseUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!database) return null;
    return { url, database, isNeon: url.hostname.toLowerCase().endsWith('.neon.tech') };
  } catch {
    return null;
  }
}

export function isAllowedDatabaseUrl(connectionString) {
  const parsed = parseDatabaseUrl(connectionString);
  return Boolean(parsed && (ALLOWED_DATABASE_NAMES.has(parsed.database) || parsed.isNeon));
}

export function databaseNameFromUrl(connectionString) {
  return parseDatabaseUrl(connectionString)?.database || '';
}

export function postgresPoolConfig(connectionString, { production = false, ...options } = {}) {
  const parsed = parseDatabaseUrl(connectionString);
  if (!parsed) throw new Error('DATABASE_URL_INVALID');

  const { url, isNeon } = parsed;
  if (isNeon) {
    // node-postgres gets channel binding through its config option, not the
    // libpq channel_binding URI parameter. Keep TLS certificate validation on.
    url.searchParams.delete('channel_binding');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
  }

  return {
    connectionString: url.toString(),
    ssl: production || isNeon ? { rejectUnauthorized: true } : undefined,
    enableChannelBinding: isNeon,
    ...options,
  };
}

export function authEnvironmentStatus(env = process.env) {
  const smtpReady = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM_EMAIL);
  const resendReady = Boolean(env.RESEND_API_KEY && env.CONTACT_FROM_EMAIL);
  return {
    databaseConfigured: Boolean(env.DATABASE_URL?.trim()),
    ownerEmailConfigured: Boolean(env.OWNER_EMAIL?.trim()),
    otpSecretConfigured: Boolean(env.AUTH_OTP_SECRET && env.AUTH_OTP_SECRET.length >= 32),
    rateLimitSecretConfigured: Boolean(env.AUTH_RATE_LIMIT_SECRET && env.AUTH_RATE_LIMIT_SECRET.length >= 32),
    emailOtpConfigured: Boolean((smtpReady || resendReady) && env.AUTH_OTP_SECRET && env.AUTH_OTP_SECRET.length >= 32),
    smsOtpConfigured: Boolean(env.SMS_PROVIDER === 'twilio-verify' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID),
    beneficiaryEncryptionConfigured: Boolean(env.BENEFICIARY_ENCRYPTION_KEY && env.BENEFICIARY_ENCRYPTION_KEY.length >= 32),
    publicSiteUrlConfigured: Boolean(env.PUBLIC_SITE_URL),
    appOriginConfigured: Boolean(env.APP_ORIGIN),
    upstashConfigured: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  };
}
