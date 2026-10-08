import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import nationalLengthLimits from './phone-national-lengths.js';
import { emailError } from './field-validation.js';
export { emailError, nameError, passwordError, sanitizeNameInput } from './field-validation.js';

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const collator = new Intl.Collator('en');

export const PHONE_COUNTRIES = getCountries().map((country) => ({
  country,
  callingCode: getCountryCallingCode(country),
  name: displayNames.of(country) || country,
})).sort((a, b) => collator.compare(a.name, b.name));

export function maxNationalDigits(country = 'IN') {
  return nationalLengthLimits[country] || 14;
}

export function cleanNationalInput(value, country = 'IN') {
  let digits = String(value || '').replace(/\D/g, '');
  if (String(value || '').trim().startsWith('+')) {
    const callingCode = getCountryCallingCode(country);
    if (digits.startsWith(callingCode)) digits = digits.slice(callingCode.length);
  }
  return digits.slice(0, maxNationalDigits(country));
}

export function normalizeMobile(value, country = 'IN') {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input || /[^\d+\s().-]/.test(input) || (input.includes('+') && !input.startsWith('+'))) {
    throw new RangeError('Enter a valid phone number using digits and an optional + country code.');
  }
  const compact = input.replace(/[\s().-]/g, '');
  const phone = compact.startsWith('+')
    ? parsePhoneNumberFromString(compact)
    : parsePhoneNumberFromString(compact, country);
  const type = phone?.getType();
  if (!phone || !phone.isPossible() || !phone.isValid() || (type && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(type))) {
    throw new RangeError(country === 'IN'
      ? 'Enter a valid Indian mobile number with exactly 10 digits.'
      : 'Enter a valid mobile number for the selected country.');
  }
  return phone.number;
}

export function loginIdentifierError(value) {
  const identifier = typeof value === 'string' ? value.trim() : '';
  if (!identifier) return 'Enter your email or mobile number.';
  if (identifier.includes('@')) return emailError(identifier);
  const digits = identifier.replace(/\D/g, '');
  if (digits.length >= 7 && digits.length <= 15) return '';
  try { normalizeMobile(identifier, 'IN'); return ''; }
  catch { return 'Enter your registered email or a valid mobile number.'; }
}

export function phoneError(value, country = 'IN') {
  if (!String(value || '').trim()) return 'Enter your mobile number.';
  try { normalizeMobile(value, country); return ''; }
  catch (error) { return error.message; }
}
