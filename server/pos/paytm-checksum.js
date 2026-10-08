import crypto from 'node:crypto';

/**
 * Official Paytm Checksum Utility implementation in Node.js
 * Compatible with Paytm Payment Gateway and Wireless POS / EDC Integrations.
 * Uses AES-128-CBC with Paytm's standard initialization vector "@@@@&&&&####$$$$"
 */
const IV = '@@@@&&&&####$$$$';

export function encrypt(input, key) {
  if (!key || typeof key !== 'string') {
    throw new TypeError('Paytm merchant key is required for encryption.');
  }
  // AES-128 requires 16-byte key; take first 16 bytes or pad if needed
  const normalizedKey = Buffer.from(key.padEnd(16, '0').slice(0, 16), 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', normalizedKey, Buffer.from(IV, 'utf8'));
  let encrypted = cipher.update(input, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

export function decrypt(encrypted, key) {
  if (!key || typeof key !== 'string') {
    throw new TypeError('Paytm merchant key is required for decryption.');
  }
  const normalizedKey = Buffer.from(key.padEnd(16, '0').slice(0, 16), 'utf8');
  const decipher = crypto.createDecipheriv('aes-128-cbc', normalizedKey, Buffer.from(IV, 'utf8'));
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateRandomString(length = 4) {
  return crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64').slice(0, length);
}

export function getStringByParams(params) {
  if (!params || typeof params !== 'object') return '';
  const sortedKeys = Object.keys(params).sort();
  const data = [];
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== null && val !== undefined && String(val).toLowerCase() !== 'null') {
      data.push(String(val));
    }
  }
  return data.join('|');
}

export function calculateHash(paramsString, salt) {
  const finalString = `${paramsString}|${salt}`;
  return crypto.createHash('sha256').update(finalString, 'utf8').digest('hex');
}

/**
 * Generates Paytm digital signature (checksum) for an object or string body
 */
export function generateSignature(params, key) {
  if (!key) throw new Error('Paytm merchant key is required to generate signature.');
  let paramsString;
  if (typeof params === 'string') {
    paramsString = params;
  } else if (typeof params === 'object' && params !== null) {
    paramsString = getStringByParams(params);
  } else {
    throw new TypeError('Invalid params passed to generateSignature');
  }

  const salt = generateRandomString(4);
  const hash = calculateHash(paramsString, salt);
  return encrypt(`${hash}${salt}`, key);
}

/**
 * Verifies Paytm digital signature using constant-time comparison
 */
export function verifySignature(params, key, checksum) {
  if (!checksum || !key) return false;
  try {
    let paramsString = '';
    if (typeof params === 'string') {
      paramsString = params;
    } else if (typeof params === 'object' && params !== null) {
      paramsString = getStringByParams(params);
    } else {
      return false;
    }

    const decrypted = decrypt(checksum, key);
    if (!decrypted || decrypted.length < 5) return false;
    const salt = decrypted.slice(-4);
    const expectedHash = decrypted.slice(0, -4);
    const calculatedHash = calculateHash(paramsString, salt);

    if (expectedHash.length !== calculatedHash.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'utf8'),
      Buffer.from(calculatedHash, 'utf8')
    );
  } catch {
    return false;
  }
}

export class PaytmChecksum {
  static encrypt(input, key) {
    return encrypt(input, key);
  }

  static decrypt(encrypted, key) {
    return decrypt(encrypted, key);
  }

  static generateRandomString(length = 4) {
    return generateRandomString(length);
  }

  static getStringByParams(params) {
    return getStringByParams(params);
  }

  static calculateHash(paramsString, salt) {
    return calculateHash(paramsString, salt);
  }

  static generateSignature(params, key) {
    return generateSignature(params, key);
  }

  static verifySignature(params, key, checksum) {
    return verifySignature(params, key, checksum);
  }
}

export default PaytmChecksum;
