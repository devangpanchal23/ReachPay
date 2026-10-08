import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { emailError, nameError, passwordError } from '../shared/field-validation.js';
import { normalizeMobile } from '../shared/phone-validation.js';

const scrypt = promisify(scryptCallback);

export function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : '';
  if (emailError(email)) throw new RangeError('Enter a valid email address.');
  return email;
}

export { normalizeMobile };

export function validateRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid sign-up details.');
  if (input.verificationConsent !== true) throw new RangeError('Agree to receive the one-time verification codes to create an account.');
  const name = typeof input.name === 'string' ? input.name.trim().normalize('NFKC') : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (nameError(name)) throw new RangeError('Enter your name (2 to 100 characters).');
  if (passwordError(password)) throw new RangeError('Password must be 12–128 characters.');
  return { name, email: normalizeEmail(input.email), mobile: normalizeMobile(input.mobile), password };
}

export async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { hash: Buffer.from(derived).toString('hex'), salt: Buffer.from(salt).toString('hex') };
}

export async function verifyPassword(password, saltHex, expectedHex) {
  if (!password || !saltHex || !expectedHex) return false;
  const cleanSalt = String(saltHex).trim();
  const cleanExpected = String(expectedHex).trim();
  try {
    const { hash } = await hashPassword(password, Buffer.from(cleanSalt, 'hex'));
    const actual = Buffer.from(hash, 'hex');
    const expected = Buffer.from(cleanExpected, 'hex');
    return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function newEmailOtp() { return String(randomInt(100000, 1000000)); }
export function hashOtp(code, secret) { return createHmac('sha256', secret).update(code).digest('hex'); }
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
export function newSessionToken() { return randomBytes(32).toString('base64url'); }
export function safeEqualHex(actualHex, expectedHex) {
  const actual = Buffer.from(actualHex, 'hex'); const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
}
export function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((pair) => pair.trim().split(/=(.*)/s, 2)).filter(([key, value]) => key && value !== undefined).map(([key, value]) => {
    try { return [key, decodeURIComponent(value)]; } catch { return [key, '']; }
  }));
}
export function sessionCookie(token, secure = process.env.NODE_ENV === 'production') {
  return `reachpay_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(secure = process.env.NODE_ENV === 'production') {
  return `reachpay_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
