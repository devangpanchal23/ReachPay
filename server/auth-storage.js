import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hashOtp, hashToken, newSessionToken, safeEqualHex } from './auth-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const storeFile = path.join(dataDir, 'reachpay-auth.json');

let inMemoryStore = null;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadStore() {
  if (inMemoryStore) return inMemoryStore;
  ensureDataDir();
  if (fs.existsSync(storeFile)) {
    try {
      const content = fs.readFileSync(storeFile, 'utf8');
      inMemoryStore = JSON.parse(content);
    } catch {
      inMemoryStore = createEmptyStore();
    }
  } else {
    inMemoryStore = createEmptyStore();
    saveStore();
  }
  return inMemoryStore;
}

function createEmptyStore() {
  return {
    accounts: [],
    sessions: [],
    emailChallenges: [],
    phoneChallenges: [],
    rateLimits: {},
    auditEvents: [],
  };
}

function saveStore() {
  if (!inMemoryStore) return;
  ensureDataDir();
  const tmpFile = `${storeFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(inMemoryStore, null, 2), 'utf8');
    fs.renameSync(tmpFile, storeFile);
  } catch (err) {
    console.error('[auth-storage] Failed to save store:', err.message);
  }
}

export const localAuthDb = {
  getStore() {
    return loadStore();
  },

  async findUserById(id) {
    const store = loadStore();
    return store.accounts.find((u) => u.id === id) || null;
  },

  async findUserByEmailOrMobile(email, mobile, digits) {
    const store = loadStore();
    const cleanDigits = (digits || (mobile ? String(mobile).replace(/\D/g, '') : '')).trim();
    return store.accounts.find((u) => {
      if (email && u.email && u.email.toLowerCase() === email.toLowerCase()) return true;
      if (mobile && u.mobile_e164 && u.mobile_e164 === mobile) return true;
      if (cleanDigits && u.mobile_e164) {
        const uClean = u.mobile_e164.replace(/\D/g, '');
        if (uClean === cleanDigits) return true;
        if (cleanDigits.length === 10 && uClean === `91${cleanDigits}`) return true;
        if (uClean.length === 10 && cleanDigits === `91${uClean}`) return true;
      }
      return false;
    }) || null;
  },

  async createUser({ name, email, mobile, passwordHash, passwordSalt, autoVerify = false }) {
    const store = loadStore();
    const existing = store.accounts.find((u) => u.email.toLowerCase() === email.toLowerCase() || u.mobile_e164 === mobile);
    if (existing) return null;

    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name,
      email: email.toLowerCase(),
      mobile_e164: mobile,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      email_verified_at: autoVerify ? now : null,
      mobile_verified_at: autoVerify ? now : null,
      verification_messages_consent_at: now,
      status: autoVerify ? 'ACTIVE' : 'PENDING_VERIFICATION',
      created_at: now,
      updated_at: now,
    };
    store.accounts.push(user);
    saveStore();
    return user;
  },

  async updateUser(id, fields) {
    const store = loadStore();
    const user = store.accounts.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, fields, { updated_at: new Date().toISOString() });
    saveStore();
    return user;
  },

  async createSession(userId, existingToken = null) {
    const store = loadStore();
    const token = existingToken || newSessionToken();
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    store.sessions.push({
      token_hash: tokenHash,
      user_id: userId,
      created_at: now,
      expires_at: expiresAt,
      last_seen_at: now,
    });
    if (store.sessions.length > 500) {
      store.sessions = store.sessions.slice(-500);
    }
    saveStore();
    return token;
  },

  async getSessionUser(token) {
    if (!token) return null;
    const store = loadStore();
    const tokenHash = hashToken(token);
    const session = store.sessions.find((s) => s.token_hash === tokenHash && new Date(s.expires_at) > new Date());
    if (!session) return null;
    session.last_seen_at = new Date().toISOString();
    return store.accounts.find((u) => u.id === session.user_id) || null;
  },

  async deleteSession(token) {
    if (!token) return;
    const store = loadStore();
    const tokenHash = hashToken(token);
    store.sessions = store.sessions.filter((s) => s.token_hash !== tokenHash);
    saveStore();
  },

  async checkRateLimit(keyHash, maximum = 6, minutes = 15) {
    const store = loadStore();
    const now = Date.now();
    const windowMs = minutes * 60 * 1000;
    const current = store.rateLimits[keyHash];

    if (!current || now - current.windowStartedAt > windowMs) {
      store.rateLimits[keyHash] = { windowStartedAt: now, attempts: 1 };
      saveStore();
      return true;
    }

    current.attempts += 1;
    saveStore();
    return current.attempts <= maximum;
  },

  async recordAuditEvent(userId, eventType, requestId) {
    const store = loadStore();
    store.auditEvents.push({
      id: store.auditEvents.length + 1,
      user_id: userId || null,
      event_type: eventType,
      request_id: requestId || null,
      created_at: new Date().toISOString(),
    });
    // Keep max 1000 events
    if (store.auditEvents.length > 1000) {
      store.auditEvents = store.auditEvents.slice(-1000);
    }
    saveStore();
  },

  async createEmailChallenge(userId, codeHmac, codeRaw) {
    const store = loadStore();
    // Invalidate existing active challenges
    for (const ch of store.emailChallenges) {
      if (ch.user_id === userId && !ch.consumed_at) {
        ch.consumed_at = new Date().toISOString();
      }
    }
    const challenge = {
      id: randomUUID(),
      user_id: userId,
      code_hmac: codeHmac,
      code_raw: codeRaw,
      attempts: 0,
      delivery_status: 'SENT',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      consumed_at: null,
      created_at: new Date().toISOString(),
    };
    store.emailChallenges.push(challenge);
    saveStore();
    return challenge;
  },

  async verifyEmailChallenge(userId, code, secret, allowDevCode = process.env.NODE_ENV !== 'production') {
    const store = loadStore();
    const active = store.emailChallenges
      .filter((c) => c.user_id === userId && !c.consumed_at && new Date(c.expires_at) > new Date())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    // Development mode fallback code
    const isDevCode = allowDevCode && code === '123456';

    if (!active && !isDevCode) return false;
    if (active && active.attempts >= 5) return false;

    const matches = isDevCode ||
      (active && ((active.code_raw === code && (allowDevCode || code !== '123456')) || safeEqualHex(hashOtp(code, secret), active.code_hmac)));

    if (!matches) {
      if (active) {
        active.attempts += 1;
        saveStore();
      }
      return false;
    }

    if (active) {
      active.consumed_at = new Date().toISOString();
    }
    const user = store.accounts.find((u) => u.id === userId);
    if (user) {
      user.email_verified_at = new Date().toISOString();
      if (user.mobile_verified_at && user.status === 'PENDING_VERIFICATION') {
        user.status = 'ACTIVE';
      }
      user.updated_at = new Date().toISOString();
    }
    saveStore();
    return true;
  },

  async createPhoneChallenge(userId, phone, codeRaw) {
    const store = loadStore();
    const challenge = {
      id: randomUUID(),
      user_id: userId,
      provider: 'reachpay-verify',
      phone_e164: phone,
      code_raw: codeRaw,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      approved_at: null,
      created_at: new Date().toISOString(),
    };
    store.phoneChallenges.push(challenge);
    saveStore();
    return challenge;
  },

  async verifyPhoneChallenge(userId, code, allowDevCode = process.env.NODE_ENV !== 'production') {
    const store = loadStore();
    const active = store.phoneChallenges
      .filter((c) => c.user_id === userId && !c.approved_at && new Date(c.expires_at) > new Date())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    const isDevCode = allowDevCode && code === '123456';
    const matches = isDevCode || (active && active.code_raw === code && (allowDevCode || code !== '123456'));

    if (!matches) return false;

    if (active) {
      active.approved_at = new Date().toISOString();
    }
    const user = store.accounts.find((u) => u.id === userId);
    if (user) {
      user.mobile_verified_at = new Date().toISOString();
      if (user.email_verified_at && user.status === 'PENDING_VERIFICATION') {
        user.status = 'ACTIVE';
      }
      user.updated_at = new Date().toISOString();
    }
    saveStore();
    return true;
  },
};
