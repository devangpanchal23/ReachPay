/**
 * ReachPay POS & Paytm Storage Repository
 *
 * Implements persistent storage for POS terminals, transactions, and audit logs.
 * Uses PostgreSQL when DATABASE_URL is configured. Local development may apply additive schema checks.
 * Falls back to local persistent store (data/local-pos-store.json) for development.
 *
 * Security:
 * - Credentials (merchant keys) are encrypted using AES-256-GCM with unique IV and Auth Tag.
 * - PCI-DSS compliance: Card numbers, CVV, and PINs are NEVER stored. Only masked last 4 digits.
 * - Multi-tenant isolation: Operations are filtered and isolated by user_id.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const LOCAL_STORE_FILE = process.env.NODE_ENV !== 'production' && process.env.REACHPAY_POS_STORE_FILE
  ? path.resolve(process.env.REACHPAY_POS_STORE_FILE)
  : path.join(DATA_DIR, 'local-pos-store.json');
const production = () => process.env.NODE_ENV === 'production';
function storageError(cause) {
  const error = new Error('POS_DATABASE_UNAVAILABLE');
  error.code = 'POS_DATABASE_UNAVAILABLE';
  error.cause = cause;
  return error;
}

const SENSITIVE_METADATA_KEY = /card|pan|cvv|pin|security.?code|track.?data|expiry|expir|account.?number|merchant.?key|secret|token|credential|authorization|signature|webhook.?payload/i;
function sanitizeSensitiveData(value) {
  if (Array.isArray(value)) return value.map(sanitizeSensitiveData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_METADATA_KEY.test(key)).map(([key, child]) => [key, sanitizeSensitiveData(child)]));
}

// Derive or load encryption key for POS secrets (32 bytes)
function getMasterEncryptionKey() {
  const envSecret = process.env.POS_ENCRYPTION_SECRET || process.env.PAYTM_POS_ENCRYPTION_SECRET;
  if (envSecret && envSecret.length >= 32) return createHash('sha256').update(envSecret, 'utf8').digest();
  if (process.env.NODE_ENV === 'production') throw new Error('POS_ENCRYPTION_SECRET_NOT_CONFIGURED');
  // Deterministic fallback is limited to local development and test only.
  return Buffer.from('reachpay_pos_secret_enc_key_32_b', 'utf8');
}

/**
 * Encrypt sensitive credential using AES-256-GCM
 */
export function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new TypeError('Plaintext must be a non-empty string.');
  }
  const key = getMasterEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV standard for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt sensitive credential using AES-256-GCM
 */
export function decryptSecret(encrypted, ivHex, tagHex) {
  if (!encrypted || !ivHex || !tagHex) {
    throw new TypeError('encrypted, iv, and tag are required for decryption.');
  }
  const key = getMasterEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Local JSON Store operations for standalone fallback
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let localStoreCache = null;
function loadStore() {
  if (localStoreCache) return localStoreCache;
  ensureDataDir();
  if (!fs.existsSync(LOCAL_STORE_FILE)) {
    const initial = {
      terminals: [],
      transactions: [],
      syncLogs: [],
      webhookEvents: [],
      version: 1,
    };
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    localStoreCache = initial;
    return initial;
  }
  try {
    const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
    localStoreCache = JSON.parse(raw);
    if (!Array.isArray(localStoreCache.terminals)) localStoreCache.terminals = [];
    if (!Array.isArray(localStoreCache.transactions)) localStoreCache.transactions = [];
    if (!Array.isArray(localStoreCache.syncLogs)) localStoreCache.syncLogs = [];
    if (!Array.isArray(localStoreCache.webhookEvents)) localStoreCache.webhookEvents = [];
    return localStoreCache;
  } catch (err) {
    console.warn('[pos-storage] Error reading local store file, initializing new:', err.message);
    const initial = { terminals: [], transactions: [], syncLogs: [], webhookEvents: [], version: 1 };
    localStoreCache = initial;
    return initial;
  }
}

function saveStore() {
  if (!localStoreCache) return;
  ensureDataDir();
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(localStoreCache, null, 2), 'utf8');
  } catch (err) {
    console.error('[pos-storage] Error writing local store file:', err.message);
  }
}

/**
 * PostgreSQL connection pooling & auto-migration
 */
let poolPromise = null;
let migrated = false;

async function getPool() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) {
    if (production()) throw storageError(new Error('DATABASE_URL is not configured'));
    return null;
  }
  let database;
  try { database = new URL(dbUrl).pathname.replace(/^\//, ''); }
  catch {
    if (production()) throw storageError(new Error('DATABASE_URL is invalid'));
    return null;
  }
  if (!['reachpay', 'reachpay_dev', 'reachpay_test'].includes(database)) {
    if (production()) throw storageError(new Error('DATABASE_NOT_ALLOWED'));
    return null;
  }

  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        const { Pool } = await import('pg');
        const p = new Pool({
          connectionString: dbUrl,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
          max: 6,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 3_000,
        });
        p.on('error', (err) => console.warn('[ReachPay POS DB] Pool warning:', err.message));
        await p.query('SELECT 1');
        return p;
      } catch (err) {
        if (production()) throw storageError(err);
        console.warn('[ReachPay POS DB] PostgreSQL unavailable, falling back to local store:', err.message);
        return null;
      }
    })();
  }

  let p;
  try {
    p = await poolPromise;
  } catch (err) {
    if (production()) throw storageError(err);
    return null;
  }
  if (!p) {
    if (production()) throw storageError(new Error('PostgreSQL pool unavailable'));
    return null;
  }
  if (p && !migrated && production()) {
    migrated = true;
    return p;
  }
  if (p && !migrated) {
    try {
      const posSqlPath = path.join(__dirname, 'pos-migration.sql');
      if (fs.existsSync(posSqlPath)) {
        const sql = fs.readFileSync(posSqlPath, 'utf8');
        const client = await p.connect();
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('COMMIT');
        } catch (migrationError) {
          await client.query('ROLLBACK').catch(() => {});
          throw migrationError;
        } finally {
          client.release();
        }
        console.log('[ReachPay POS DB] Schema verified and up to date.');
      }
      migrated = true;
    } catch (err) {
      if (production()) throw storageError(err);
      console.warn('[ReachPay POS DB] Schema migration notice, using local store:', err.message);
      return null;
    }
  }
  return p;
}

export const posStorage = {
  /**
   * Terminal Management
   */
  async getTerminal(userId = null, provider = 'paytm', match = {}) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
      `SELECT id, user_id, provider, environment, mid, tid, client_id, store_id, external_mid, external_tid,
                  encrypted_merchant_key, encrypted_merchant_key_iv, encrypted_merchant_key_tag,
                  status, last_tested_at, last_status_message, created_at, updated_at
           FROM pos_terminals
           WHERE provider = $2
             AND ($3::text IS NULL OR mid = $3)
             AND ($4::text IS NULL OR tid = $4)
             AND ($5::text IS NULL OR environment = $5)
             AND (($1::uuid IS NULL AND user_id IS NULL) OR user_id = $1::uuid)
           ORDER BY updated_at DESC LIMIT 1`,
          [userId, provider, match.mid || null, match.tid || null, match.environment || null]
        );
        if (rows[0]) return rows[0];
      } catch (err) {
        if (production()) throw storageError(err);
        console.warn('[ReachPay POS DB] getTerminal query notice:', err.message);
      }
    }

    const store = loadStore();
    const providerTerminals = store.terminals.filter((t) =>
      (t.provider || 'paytm') === provider
      && (!match.mid || t.mid === match.mid)
      && (!match.tid || t.tid === match.tid)
      && (!match.environment || t.environment === match.environment)
    );
    return userId
      ? providerTerminals.find((t) => t.user_id === userId) || null
      : providerTerminals.find((t) => !t.user_id) || null;
  },

  async listTerminals(userId) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(`SELECT id,user_id,provider,environment,mid,tid,client_id,store_id,external_mid,external_tid,
          provider_verification_status,status,last_tested_at,last_status_message,created_at,updated_at
          FROM pos_terminals WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
        return rows;
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }
    return loadStore().terminals.filter((terminal) => terminal.user_id === userId).map((terminal) => {
      const safe = { ...terminal };
      delete safe.encrypted_merchant_key;
      delete safe.encrypted_merchant_key_iv;
      delete safe.encrypted_merchant_key_tag;
      return safe;
    });
  },

  async disableTerminal(userId, id, provider) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(`UPDATE pos_terminals SET status='INACTIVE',updated_at=now()
          WHERE id=$1 AND user_id=$2 AND provider=$3 RETURNING id,status,updated_at`, [id,userId,provider]);
        return rows[0] || null;
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }
    const terminal = loadStore().terminals.find((entry) => entry.id === id && entry.user_id === userId && entry.provider === provider);
    if (!terminal) return null;
    terminal.status = 'INACTIVE'; terminal.updated_at = new Date().toISOString(); saveStore();
    return { id: terminal.id, status: terminal.status, updated_at: terminal.updated_at };
  },

  async saveTerminal({ userId = null, provider = 'paytm', mid, tid, merchantKey = null, environment = 'staging', clientId = 'reachpay', storeId = null, externalMid = null, externalTid = null }) {
    const { encrypted, iv, tag } = merchantKey ? encryptSecret(merchantKey) : { encrypted: null, iv: null, tag: null };
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    const now = new Date().toISOString();

    if (p) {
      try {
        const { rows } = await p.query(
          `INSERT INTO pos_terminals (user_id, provider, environment, mid, tid, client_id, store_id, external_mid, external_tid,
                                      encrypted_merchant_key, encrypted_merchant_key_iv, encrypted_merchant_key_tag,
                                      status, last_status_message, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'UNTESTED', 'Terminal registered. Provider ownership unverified.', now())
           ON CONFLICT (provider, mid, tid, environment)
           DO UPDATE SET
             encrypted_merchant_key = EXCLUDED.encrypted_merchant_key,
             encrypted_merchant_key_iv = EXCLUDED.encrypted_merchant_key_iv,
             encrypted_merchant_key_tag = EXCLUDED.encrypted_merchant_key_tag,
             client_id = EXCLUDED.client_id,
             store_id = EXCLUDED.store_id, external_mid = EXCLUDED.external_mid, external_tid = EXCLUDED.external_tid,
             user_id = COALESCE(EXCLUDED.user_id, pos_terminals.user_id),
             status = 'UNTESTED',
             last_status_message = 'Configuration updated.',
             updated_at = now()
           WHERE pos_terminals.user_id IS NOT DISTINCT FROM EXCLUDED.user_id
           RETURNING id, user_id, provider, environment, mid, tid, client_id, store_id, external_mid, external_tid, provider_verification_status, status, last_tested_at, last_status_message`,
          [userId || null, provider, environment, mid, tid, clientId, storeId, externalMid, externalTid, encrypted, iv, tag]
        );
        if (rows[0]) {
          this.syncLocalTerminal(rows[0], encrypted, iv, tag);
          return rows[0];
        }
        const conflict = new Error('TERMINAL_OWNERSHIP_CONFLICT');
        conflict.code = 'TERMINAL_OWNERSHIP_CONFLICT';
        throw conflict;
      } catch (err) {
        if (err.code === 'TERMINAL_OWNERSHIP_CONFLICT') throw err;
        if (production()) throw storageError(err);
        console.warn('[ReachPay POS DB] saveTerminal query notice, using local store:', err.message);
      }
    }

    const store = loadStore();
    let term = store.terminals.find((t) => (t.provider || 'paytm') === provider && t.mid === mid && t.tid === tid && t.environment === environment && (t.user_id || null) === (userId || null));
    const conflictingTerm = store.terminals.find((t) => (t.provider || 'paytm') === provider && t.mid === mid && t.tid === tid && t.environment === environment && (t.user_id || null) !== (userId || null));
    if (conflictingTerm) {
      const conflict = new Error('TERMINAL_OWNERSHIP_CONFLICT');
      conflict.code = 'TERMINAL_OWNERSHIP_CONFLICT';
      throw conflict;
    }
    if (!term) {
      term = {
        id: randomUUID(),
        user_id: userId || null,
        provider,
        environment,
        mid,
        tid,
        client_id: clientId,
        store_id: storeId,
        external_mid: externalMid,
        external_tid: externalTid,
        provider_verification_status: 'UNVERIFIED',
        encrypted_merchant_key: encrypted,
        encrypted_merchant_key_iv: iv,
        encrypted_merchant_key_tag: tag,
        status: 'UNTESTED',
        last_tested_at: null,
        last_status_message: 'Terminal registered. Ready for test connection.',
        created_at: now,
        updated_at: now,
      };
      store.terminals.unshift(term);
    } else {
      term.encrypted_merchant_key = encrypted;
      term.encrypted_merchant_key_iv = iv;
      term.encrypted_merchant_key_tag = tag;
      term.client_id = clientId;
      term.store_id = storeId;
      term.external_mid = externalMid;
      term.external_tid = externalTid;
      term.user_id = userId || term.user_id;
      term.status = 'UNTESTED';
      term.last_status_message = 'Configuration updated.';
      term.updated_at = now;
    }
    saveStore();
    return term;
  },

  syncLocalTerminal(term, encrypted, iv, tag) {
    try {
      const store = loadStore();
      const existing = store.terminals.find((t) => (t.provider || 'paytm') === (term.provider || 'paytm') && t.mid === term.mid && t.tid === term.tid && t.environment === term.environment);
      if (!existing) {
        store.terminals.unshift({
          ...term,
          encrypted_merchant_key: encrypted,
          encrypted_merchant_key_iv: iv,
          encrypted_merchant_key_tag: tag,
        });
      } else {
        Object.assign(existing, term, {
          encrypted_merchant_key: encrypted,
          encrypted_merchant_key_iv: iv,
          encrypted_merchant_key_tag: tag,
        });
      }
      saveStore();
    } catch {
      // Ignore
    }
  },

  async updateTerminalStatus(id, { status, message }) {
    const now = new Date().toISOString();
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        await p.query(
          `UPDATE pos_terminals
           SET status = $1, last_status_message = $2, last_tested_at = now(), updated_at = now()
           WHERE id = $3`,
          [status, message, id]
        );
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }

    const store = loadStore();
    const term = store.terminals.find((t) => t.id === id);
    if (term) {
      term.status = status;
      term.last_status_message = message;
      term.last_tested_at = now;
      term.updated_at = now;
      saveStore();
    }
  },

  /**
   * Transactions Management
   */
  async createTransaction(txData) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    const now = new Date().toISOString();

    const safeMeta = sanitizeSensitiveData(txData.metadata || {});

    const metadataJson = JSON.stringify(safeMeta);

    if (p) {
      try {
        const { rows } = await p.query(
          `INSERT INTO pos_transactions
           (user_id, terminal_id, provider, environment, merchant_txn_id, cpay_id, mid, tid,
            amount_paise, currency, status, customer_mobile, notes, idempotency_key, metadata, initiated_at, updated_at)
           VALUES ($1, $2, $14, $3, $4, $5, $6, $7, $8, 'INR', $9, $10, $11, $12, $13::jsonb, now(), now())
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            txData.userId || null,
            txData.terminalId || null,
            txData.environment || 'staging',
            txData.merchantTxnId,
            txData.cpayId || null,
            txData.mid,
            txData.tid,
            txData.amountPaise,
            txData.status || 'INITIATED',
            txData.customerMobile || null,
            txData.notes || null,
            txData.idempotencyKey || null,
            metadataJson,
            txData.provider || 'paytm',
          ]
        );
        if (rows[0]) {
          this.syncLocalTx(rows[0]);
          return rows[0];
        }
        if (txData.idempotencyKey) {
          const existing = await p.query('SELECT * FROM pos_transactions WHERE idempotency_key = $1 LIMIT 1', [txData.idempotencyKey]);
          const existingTx = existing.rows[0];
          if (existingTx?.user_id === txData.userId && Number(existingTx.amount_paise) === Number(txData.amountPaise)) {
            return { ...existingTx, idempotentReplay: true };
          }
          const conflict = new Error('IDEMPOTENCY_KEY_CONFLICT');
          conflict.code = 'IDEMPOTENCY_KEY_CONFLICT';
          throw conflict;
        }
      } catch (err) {
        if (err.code === 'IDEMPOTENCY_KEY_CONFLICT') throw err;
        if (production()) throw storageError(err);
        console.warn('[ReachPay POS DB] createTransaction query notice, using local store:', err.message);
      }
    }

    const store = loadStore();
    if (txData.idempotencyKey) {
      const existingTx = store.transactions.find((t) => t.idempotency_key === txData.idempotencyKey);
      if (existingTx) {
        if (existingTx.user_id === txData.userId && Number(existingTx.amount_paise) === Number(txData.amountPaise)) return { ...existingTx, idempotentReplay: true };
        const conflict = new Error('IDEMPOTENCY_KEY_CONFLICT');
        conflict.code = 'IDEMPOTENCY_KEY_CONFLICT';
        throw conflict;
      }
    }
    const tx = {
      id: randomUUID(),
      user_id: txData.userId || null,
      terminal_id: txData.terminalId || null,
      provider: txData.provider || 'paytm',
      environment: txData.environment || 'staging',
      merchant_txn_id: txData.merchantTxnId,
      cpay_id: txData.cpayId || null,
      mid: txData.mid,
      tid: txData.tid,
      amount_paise: txData.amountPaise,
      currency: 'INR',
      status: txData.status || 'INITIATED',
      settlement_status: 'NOT_AVAILABLE',
      settlement_payout_id: null,
      settled_amount_paise: null,
      settled_at: null,
      refund_status: null,
      refunded_amount_paise: null,
      reconciliation_status: 'PENDING',
      payment_method: null,
      rrn: null,
      auth_code: null,
      invoice_number: null,
      card_last4: null,
      card_type: null,
      customer_mobile: txData.customerMobile || null,
      notes: txData.notes || null,
      idempotency_key: txData.idempotencyKey || null,
      error_code: null,
      error_message: null,
      metadata: safeMeta,
      initiated_at: now,
      completed_at: null,
      updated_at: now,
    };
    store.transactions.unshift(tx);
    saveStore();
    return tx;
  },

  syncLocalTx(tx) {
    try {
      const store = loadStore();
      const idx = store.transactions.findIndex((t) => t.merchant_txn_id === tx.merchant_txn_id);
      if (idx >= 0) store.transactions[idx] = tx;
      else store.transactions.unshift(tx);
      saveStore();
    } catch {
      // Ignore
    }
  },

  async getTransactionByMerchantTxnId(merchantTxnId, userId = null) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT * FROM pos_transactions
           WHERE merchant_txn_id = $1
             AND ($2::uuid IS NULL OR user_id = $2::uuid)
           LIMIT 1`,
          [merchantTxnId, userId]
        );
        if (rows[0]) return rows[0];
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }
    const store = loadStore();
    return (
      store.transactions.find(
        (t) => t.merchant_txn_id === merchantTxnId && (!userId || t.user_id === userId)
      ) || null
    );
  },

  async getTransactionByIdempotencyKey(key, userId = null) {
    if (!key) return null;
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT * FROM pos_transactions
           WHERE idempotency_key = $1
             AND ($2::uuid IS NULL OR user_id = $2::uuid)
           LIMIT 1`,
          [key, userId]
        );
        if (rows[0]) return rows[0];
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }
    const store = loadStore();
    return store.transactions.find((t) => t.idempotency_key === key && (!userId || t.user_id === userId)) || null;
  },

  async updateTransaction(merchantTxnId, fields, userId = null) {
    const now = new Date().toISOString();
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    const safeFields = { ...fields };
    if (safeFields.metadata) safeFields.metadata = sanitizeSensitiveData(safeFields.metadata);
    if (p) {
      try {
        const updates = [];
        const values = [merchantTxnId];
        let idx = 2;

        const allowedFields = new Set(['cpay_id', 'status', 'payment_method', 'rrn', 'auth_code', 'card_last4', 'card_type', 'invoice_number', 'error_code', 'error_message', 'completed_at', 'metadata', 'settlement_status', 'settlement_payout_id', 'settled_amount_paise', 'settled_at', 'refund_status', 'refunded_amount_paise', 'reconciliation_status']);
        for (const [key, val] of Object.entries(safeFields)) {
          if (!allowedFields.has(key)) continue;
          if (key === 'metadata') {
            updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx}::jsonb`);
            values.push(JSON.stringify(sanitizeSensitiveData(val)));
          } else {
            updates.push(`${key} = $${idx}`);
            values.push(val);
          }
          idx++;
        }
        updates.push(`updated_at = now()`);
        const userClause = userId ? ` AND user_id = $${idx}::uuid` : '';
        if (userId) values.push(userId);

        const { rows } = await p.query(
          `UPDATE pos_transactions SET ${updates.join(', ')} WHERE merchant_txn_id = $1${userClause} RETURNING *`,
          values
        );
        if (rows[0]) {
          this.syncLocalTx(rows[0]);
          return rows[0];
        }
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }

    const store = loadStore();
    const tx = store.transactions.find((t) => t.merchant_txn_id === merchantTxnId);
    if (tx) {
      if (userId && tx.user_id !== userId) return null;
      const safeMetadata = safeFields.metadata ? sanitizeSensitiveData({ ...(tx.metadata || {}), ...safeFields.metadata }) : undefined;
      Object.assign(tx, safeFields, { updated_at: now, ...(safeMetadata ? { metadata: safeMetadata } : {}) });
      saveStore();
      return tx;
    }
    return null;
  },

  /**
   * Pending transactions for batch synchronization
   */
  async getPendingTransactions({ userId = null, limit = 20 } = {}) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT * FROM pos_transactions
           WHERE status IN ('INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN')
             AND ($1::uuid IS NULL OR user_id = $1::uuid)
           ORDER BY initiated_at DESC
           LIMIT $2`,
          [userId, limit]
        );
        return rows;
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }

    const store = loadStore();
    return store.transactions
      .filter(
        (t) =>
          ['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(t.status) &&
          (!userId || t.user_id === userId)
      )
      .slice(0, limit);
  },

  async getSettlementPendingTransactions({ limit = 20 } = {}) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT * FROM pos_transactions WHERE status = 'SUCCESS'
           AND settlement_status IN ('SETTLEMENT_PENDING', 'NOT_AVAILABLE')
           ORDER BY initiated_at ASC LIMIT $1`, [limit]
        );
        return rows;
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }
    return loadStore().transactions
      .filter((t) => t.status === 'SUCCESS' && ['SETTLEMENT_PENDING', 'NOT_AVAILABLE'].includes(t.settlement_status))
      .slice(0, limit);
  },

  /**
   * List transactions with tenant isolation
   */
  async listTransactions({ userId = null, limit = 30, offset = 0, status = null, terminalId = null } = {}) {
    let p = null;
    try { p = await getPool(); } catch (err) { if (production()) throw err; }
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT id, user_id, merchant_txn_id, cpay_id, mid, tid, amount_paise, currency, status,
                  payment_method, rrn, auth_code, invoice_number, card_last4, card_type,
                  customer_mobile, notes, error_code, error_message, initiated_at, completed_at,
                  settlement_status, settlement_payout_id, settled_amount_paise, settled_at, refund_status, refunded_amount_paise, reconciliation_status
           FROM pos_transactions
           WHERE ($1::text IS NULL OR status = $1)
             AND ($2::uuid IS NULL OR terminal_id = $2)
             AND ($3::uuid IS NULL OR user_id = $3::uuid)
           ORDER BY initiated_at DESC
           LIMIT $4 OFFSET $5`,
          [status, terminalId, userId, limit, offset]
        );
        return rows;
      } catch (err) {
        if (production()) throw storageError(err);
      }
    }

    const store = loadStore();
    let list = store.transactions;
    if (userId) list = list.filter((t) => t.user_id === userId);
    if (status) list = list.filter((t) => t.status === status);
    if (terminalId) list = list.filter((t) => t.terminal_id === terminalId);
    return list.slice(offset, offset + limit);
  },

  async enqueueReconciliation({ provider, merchantTxnId }) {
    const p = await getPool();
    if (p) {
      await p.query(
        `INSERT INTO pos_reconciliation_jobs (provider, merchant_txn_id)
         VALUES ($1, $2) ON CONFLICT (provider, merchant_txn_id) DO UPDATE
         SET status = 'READY', run_after = now(), last_error = NULL, updated_at = now()
         WHERE pos_reconciliation_jobs.status IN ('FAILED', 'DONE')`,
        [provider, merchantTxnId]
      );
      return;
    }
    const store = loadStore();
    if (!Array.isArray(store.reconciliationJobs)) store.reconciliationJobs = [];
    const current = store.reconciliationJobs.find((job) => job.provider === provider && job.merchant_txn_id === merchantTxnId);
    if (!current) store.reconciliationJobs.push({ id: randomUUID(), provider, merchant_txn_id: merchantTxnId, status: 'READY', attempts: 0, run_after: Date.now() });
    else if (['FAILED', 'DONE'].includes(current.status)) Object.assign(current, { status: 'READY', attempts: 0, run_after: Date.now(), last_error: null });
    saveStore();
  },

  async claimReconciliationJobs({ limit = 20 } = {}) {
    const p = await getPool();
    if (p) {
      const { rows } = await p.query(
        `WITH due AS (
          SELECT id FROM pos_reconciliation_jobs
          WHERE (status = 'READY' AND run_after <= now())
             OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes')
          ORDER BY run_after, id LIMIT $1 FOR UPDATE SKIP LOCKED
        )
        UPDATE pos_reconciliation_jobs j SET status = 'PROCESSING', attempts = j.attempts + 1,
          locked_at = now(), updated_at = now()
        FROM due WHERE j.id = due.id RETURNING j.*`,
        [Math.min(Math.max(Number(limit) || 1, 1), 100)]
      );
      return rows;
    }
    const now = Date.now();
    const selected = (loadStore().reconciliationJobs || []).filter((job) => (job.status === 'READY' && job.run_after <= now)
      || (job.status === 'PROCESSING' && job.locked_at < now - 5 * 60_000)).slice(0, Math.min(Math.max(Number(limit) || 1, 1), 100));
    for (const job of selected) Object.assign(job, { status: 'PROCESSING', attempts: job.attempts + 1, locked_at: now });
    saveStore();
    return selected;
  },

  async completeReconciliationJob(id) {
    const p = await getPool();
    if (p) return p.query("UPDATE pos_reconciliation_jobs SET status = 'DONE', locked_at = NULL, last_error = NULL, updated_at = now() WHERE id = $1", [id]);
    const job = (loadStore().reconciliationJobs || []).find((item) => item.id === id || item.merchant_txn_id === id);
    if (job) Object.assign(job, { status: 'DONE', locked_at: null, last_error: null });
    saveStore();
  },

  async retryReconciliationJob(id, { attempts = 1, errorCode = 'PROVIDER_UNAVAILABLE', maxAttempts = 12 } = {}) {
    const delayMs = Math.min(15 * 60_000, 1000 * (2 ** Math.min(attempts, 10)));
    const nextStatus = attempts >= maxAttempts ? 'FAILED' : 'READY';
    const p = await getPool();
    if (p) return p.query(`UPDATE pos_reconciliation_jobs SET status = $2, run_after = now() + ($3 * interval '1 millisecond'), locked_at = NULL, last_error = $4, updated_at = now() WHERE id = $1`, [id, nextStatus, delayMs, String(errorCode).slice(0, 128)]);
    const job = (loadStore().reconciliationJobs || []).find((item) => item.id === id || item.merchant_txn_id === id);
    if (job) Object.assign(job, { status: nextStatus, run_after: Date.now() + delayMs, locked_at: null, last_error: String(errorCode).slice(0, 128) });
    saveStore();
  },

  /** Atomically claim a durable provider event and apply its state update. */
  async applyWebhookEvent({ provider, eventId, merchantTxnId, fields }) {
    if (!provider || !eventId || !merchantTxnId || !fields || typeof fields !== 'object') throw new TypeError('Invalid webhook event.');
    const safeEventId = String(eventId).slice(0, 128);
    const p = await getPool();
    if (p) {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const claimed = await client.query(
          `INSERT INTO pos_webhook_events (provider, event_id, merchant_txn_id)
           VALUES ($1, $2, $3) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
          [provider, safeEventId, merchantTxnId]
        );
        if (!claimed.rowCount) {
          await client.query('COMMIT');
          return { duplicate: true };
        }
        const allowed = new Set(['status', 'settlement_status', 'payment_method', 'rrn', 'auth_code', 'error_code', 'error_message', 'completed_at', 'metadata']);
        const sets = [];
        const values = [merchantTxnId];
        for (const [key, value] of Object.entries(fields)) {
          if (!allowed.has(key)) continue;
          values.push(key === 'metadata' ? JSON.stringify(sanitizeSensitiveData(value)) : value);
          sets.push(key === 'metadata' ? `metadata = COALESCE(metadata, '{}'::jsonb) || $${values.length}::jsonb` : `${key} = $${values.length}`);
        }
        if (!sets.length) throw new TypeError('No supported webhook update fields.');
        sets.push('updated_at = now()');
        const stateGuard = fields.status ? ` AND (status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED') OR status = $${values.findIndex((value, index) => index > 0 && value === fields.status) + 1})` : '';
        const updated = await client.query(`UPDATE pos_transactions SET ${sets.join(', ')} WHERE merchant_txn_id = $1${stateGuard} RETURNING *`, values);
        if (!updated.rowCount) {
          const current = await client.query('SELECT * FROM pos_transactions WHERE merchant_txn_id = $1', [merchantTxnId]);
          if (!current.rowCount) throw new Error('WEBHOOK_TRANSACTION_NOT_FOUND');
          await client.query('COMMIT');
          return { duplicate: false, ignoredTransition: true, transaction: current.rows[0] };
        }
        await client.query('COMMIT');
        this.syncLocalTx(updated.rows[0]);
        return { duplicate: false, transaction: updated.rows[0] };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw storageError(error);
      } finally {
        client.release();
      }
    }
    const store = loadStore();
    if (store.webhookEvents.some((event) => event.provider === provider && event.event_id === safeEventId)) return { duplicate: true };
    const transaction = store.transactions.find((item) => item.merchant_txn_id === merchantTxnId);
    if (!transaction) throw new Error('WEBHOOK_TRANSACTION_NOT_FOUND');
    const terminalStates = ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
    const ignoredTransition = fields.status && terminalStates.includes(transaction.status) && transaction.status !== fields.status;
    if (!ignoredTransition) Object.assign(transaction, fields, { updated_at: new Date().toISOString() });
    store.webhookEvents.push({ provider, event_id: safeEventId, merchant_txn_id: merchantTxnId, created_at: new Date().toISOString() });
    saveStore();
    return { duplicate: false, ignoredTransition, transaction };
  },

  /**
   * Sync Logs
   */
  async recordSyncLog({ terminalId = null, userId = null, provider = 'paytm', action, status = 'SUCCESS', recordsChecked = 0, recordsUpdated = 0, message = '', details = {} }) {
    const p = await getPool();
    if (p) {
      try {
        await p.query(
          `INSERT INTO pos_sync_logs (terminal_id, user_id, provider, action, status, records_checked, records_updated, message, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())`,
          [terminalId || null, userId || null, provider, action, status, recordsChecked, recordsUpdated, message, JSON.stringify(sanitizeSensitiveData(details))]
        );
        return;
      } catch (err) {
        throw storageError(err);
      }
    }

    const store = loadStore();
    store.syncLogs.unshift({
      id: store.syncLogs.length + 1,
      terminal_id: terminalId || null,
      user_id: userId || null,
      provider,
      action,
      status,
      records_checked: recordsChecked,
      records_updated: recordsUpdated,
      message,
      details: sanitizeSensitiveData(details),
      created_at: new Date().toISOString(),
    });
    if (store.syncLogs.length > 200) store.syncLogs = store.syncLogs.slice(0, 200);
    saveStore();
  },

  async listSyncLogs({ userId = null, terminalId = null, limit = 20 } = {}) {
    const p = await getPool();
    if (p) {
      try {
        const { rows } = await p.query(
          `SELECT id, action, status, records_checked, records_updated, message, details, created_at
           FROM pos_sync_logs
           WHERE ($1::uuid IS NULL OR terminal_id = $1)
             AND ($2::uuid IS NULL OR user_id = $2::uuid)
           ORDER BY created_at DESC LIMIT $3`,
          [terminalId, userId, limit]
        );
        return rows;
      } catch (err) {
        throw storageError(err);
      }
    }

    const store = loadStore();
    let logs = store.syncLogs;
    if (userId) logs = logs.filter((l) => l.user_id === userId);
    if (terminalId) logs = logs.filter((l) => l.terminal_id === terminalId);
    return logs.slice(0, limit);
  },
};
