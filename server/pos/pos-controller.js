/**
 * ReachPay Paytm POS / EDC Controller
 *
 * Secure API controller for Paytm Wireless POS/EDC terminal operations.
 * Handles configuration, test-connection, sale initiation, status polling,
 * batch synchronization, idempotency, PCI-DSS compliance, tenant isolation,
 * and sync audit logging.
 */

import { randomUUID } from 'node:crypto';
import { currentUser, originOk, rateAllowed } from '../auth-controller.js';
import { posStorage, decryptSecret } from './pos-storage.js';
import { paytmPOSProvider } from './paytm-provider.js';
import { getPOSProvider } from './provider-registry.js';

function parseAmountPaise(value) {
  const raw = typeof value === 'string' ? value.trim() : (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [rupees, paise = ''] = raw.split('.');
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
}

/**
 * Resolve effective terminal configuration:
 * Merges database configured terminal with environment fallback (.env)
 */
async function resolveTerminal(userId = null) {
  const dbTerm = await posStorage.getTerminal(userId);

  const envMid = process.env.PAYTM_POS_MID || process.env.PAYTM_MID;
  const envTid = process.env.PAYTM_POS_TID || process.env.PAYTM_TID;
  const envKey = process.env.PAYTM_POS_MERCHANT_KEY || process.env.PAYTM_MERCHANT_KEY;
  const envStage = process.env.PAYTM_POS_ENV || process.env.PAYTM_ENV || 'staging';

  if (dbTerm) {
    let merchantKey = null;
    try {
      if (dbTerm.encrypted_merchant_key) {
        merchantKey = decryptSecret(
          dbTerm.encrypted_merchant_key,
          dbTerm.encrypted_merchant_key_iv,
          dbTerm.encrypted_merchant_key_tag
        );
      }
    } catch (err) {
      console.warn('[pos-controller] Could not decrypt stored merchant key:', err.message);
    }

    if (!merchantKey && envKey && dbTerm.mid === envMid) {
      merchantKey = envKey;
    }

    return {
      terminal: dbTerm,
      merchantKey,
      mid: dbTerm.mid,
      tid: dbTerm.tid,
      environment: dbTerm.environment || 'staging',
      clientId: dbTerm.client_id || 'reachpay',
      isConfigured: Boolean(dbTerm.mid && dbTerm.tid && merchantKey),
    };
  }

  // Auto-initialize if .env provides credentials
  if (envMid && envTid && envKey) {
    const saved = await posStorage.saveTerminal({
      userId,
      mid: envMid,
      tid: envTid,
      merchantKey: envKey,
      environment: envStage,
      clientId: 'reachpay',
    });

    return {
      terminal: saved,
      merchantKey: envKey,
      mid: envMid,
      tid: envTid,
      environment: envStage,
      clientId: 'reachpay',
      isConfigured: true,
    };
  }

  return {
    terminal: null,
    merchantKey: null,
    mid: null,
    tid: null,
    environment: 'staging',
    clientId: 'reachpay',
    isConfigured: false,
  };
}

/**
 * Mask terminal secret data for client response
 */
function sanitizeTerminal(terminal) {
  if (!terminal) return null;
  return {
    id: terminal.id,
    mid: terminal.mid,
    tid: terminal.tid,
    environment: terminal.environment || 'staging',
    clientId: terminal.client_id || 'reachpay',
    status: terminal.status || 'UNTESTED',
    lastTestedAt: terminal.last_tested_at || null,
    lastStatusMessage: terminal.last_status_message || null,
    hasSecretKey: Boolean(terminal.encrypted_merchant_key || process.env.PAYTM_POS_MERCHANT_KEY),
    isConfigured: Boolean(terminal.mid && terminal.tid),
    updatedAt: terminal.updated_at || null,
  };
}

/**
 * Sanitize transaction for API output (PCI-DSS compliance)
 */
function sanitizeTransaction(tx) {
  if (!tx) return null;
  const safe = { ...tx };
  if (safe.metadata && typeof safe.metadata === 'object') {
    const cleanMeta = { ...safe.metadata };
    delete cleanMeta.merchantKey;
    delete cleanMeta.pin;
    delete cleanMeta.cvv;
    delete cleanMeta.cardNo;
    safe.metadata = cleanMeta;
  }
  return safe;
}

/**
 * Handle POS API requests
 */
export async function handlePOSRequest(req, action, body = {}, providerName = 'paytm') {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();

  // Public webhook routes verify provider-specific signatures below.
  if (action === 'webhook' && providerName === 'phonepe') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    return handlePhonePeWebhook(req, body);
  }
  if (action === 'webhook') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    return handleWebhook(req, body);
  }

  let provider;
  try {
    provider = getPOSProvider(providerName);
  } catch {
    return { status: 404, body: { error: 'POS_PROVIDER_UNSUPPORTED' } };
  }

  if (!['GET', 'POST'].includes(method)) return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (method === 'POST' && !originOk(req)) return { status: 403, body: { error: 'ORIGIN_NOT_ALLOWED' } };

  // All other endpoints require authenticated user session
  const user = await currentUser(req);
  if (!user) {
    return {
      status: 401,
      body: { error: 'UNAUTHORIZED', message: 'You must be signed in to manage POS terminals and transactions.' },
    };
  }

  if (user.status !== 'ACTIVE' || !user.email_verified_at || !user.mobile_verified_at) {
    return { status: 403, body: { error: 'ACCOUNT_VERIFICATION_REQUIRED', message: 'Verify your email and mobile number before managing payment terminals.' } };
  }

  // Use the same database-backed limiter as authentication in production so
  // serverless instances share limits instead of maintaining isolated maps.
  let allowed;
  try {
    allowed = await rateAllowed(`pos_user:${user.id}`, 60, 1);
  } catch {
    return { status: 503, body: { error: 'RATE_LIMIT_UNAVAILABLE', message: 'POS requests are temporarily unavailable.' } };
  }
  if (!allowed) {
    return {
      status: 429,
      body: { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please wait a moment.' },
    };
  }

  // PhonePe Integrated EDC: signed server-to-server contract. Salt credentials
  // remain in server environment; MID/TID references alone cannot authenticate.
  if (providerName === 'phonepe') {
    try {
      const integration = provider.getIntegrationStatus();
      if (action === 'config' && method === 'GET') {
        const terminal = await posStorage.getTerminal(user.id, 'phonepe');
        return { status: 200, body: { ok: true, provider: 'phonepe', integration, terminal: sanitizeTerminal(terminal), isConfigured: Boolean(terminal && provider.isConfigured()), sandboxTestable: integration.sandboxTestable } };
      }
      if (action === 'config' && method === 'POST') {
        const { mid, tid, environment } = body;
        if (!String(mid || '').trim() || !String(tid || '').trim()) return { status: 400, body: { ok: false, error: 'VALIDATION_ERROR', message: 'PhonePe merchant and terminal references are required.' } };
        const env = environment || (process.env.PHONEPE_POS_ENV === 'production' ? 'production' : 'staging');
        if (!['staging', 'production'].includes(env)) return { status: 400, body: { ok: false, error: 'UNSUPPORTED_ENVIRONMENT' } };
        const terminal = await posStorage.saveTerminal({ userId: user.id, provider: 'phonepe', mid: String(mid).trim(), tid: String(tid).trim(), environment: env, clientId: 'reachpay' });
        await posStorage.recordSyncLog({ terminalId: terminal.id, userId: user.id, provider: 'phonepe', action: 'CONFIG_UPDATE', status: 'SUCCESS', message: 'PhonePe terminal references saved.' });
        return { status: 200, body: { ok: true, terminal: sanitizeTerminal(terminal), integration, message: integration.message } };
      }
      if (action === 'test-connection' && method === 'POST') {
        if (!provider.isConfigured()) return { status: 503, body: { ok: false, ...integration, terminalStatus: integration.status } };
        const terminal = await posStorage.getTerminal(user.id, 'phonepe');
        if (!terminal) return { status: 400, body: { ok: false, error: 'TERMINAL_NOT_CONFIGURED' } };
        const result = await provider.testConnection({ mid: terminal.mid, tid: terminal.tid });
        return { status: result.connected ? 200 : 503, body: { ok: result.connected, ...result } };
      }
      if (action === 'initiate-sale' && method === 'POST') {
        if (!provider.isConfigured()) return { status: 503, body: { ok: false, error: 'PHONEPE_CREDENTIALS_REQUIRED', ...integration } };
        const { amount, notes } = body;
        const idempotencyKey = String(req.headers['idempotency-key'] || body.idempotencyKey || '').trim();
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return { status: 400, body: { error: 'IDEMPOTENCY_KEY_REQUIRED' } };
        const amountPaise = parseAmountPaise(amount);
        if (!amountPaise || amountPaise > 10_000_000) return { status: 400, body: { error: 'INVALID_AMOUNT', message: 'Amount must be ₹0.01 to ₹1,00,000.00.' } };
        const old = await posStorage.getTransactionByIdempotencyKey(idempotencyKey, user.id);
        if (old) return Number(old.amount_paise) === amountPaise
          ? { status: 200, body: { ok: true, idempotentReplay: true, transaction: sanitizeTransaction(old) } }
          : { status: 409, body: { error: 'IDEMPOTENCY_KEY_CONFLICT' } };
        const terminal = await posStorage.getTerminal(user.id, 'phonepe');
        if (!terminal) return { status: 400, body: { error: 'TERMINAL_NOT_CONFIGURED' } };
        const merchantTxnId = `RP_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        const tx = await posStorage.createTransaction({ userId: user.id, terminalId: terminal.id, provider: 'phonepe', environment: terminal.environment, merchantTxnId, mid: terminal.mid, tid: terminal.tid, amountPaise, idempotencyKey, status: 'INITIATED', notes: notes ? String(notes).slice(0, 500) : null, metadata: { createdBy: user.email || user.name } });
        if (tx.idempotentReplay) return { status: 200, body: { ok: true, idempotentReplay: true, transaction: sanitizeTransaction(tx) } };
        let result;
        try {
          result = await provider.initiateSale({ mid: terminal.mid, tid: terminal.tid, merchantTxnId, amountPaise });
        } catch (error) {
          const updated = await posStorage.updateTransaction(merchantTxnId, { status: 'UNKNOWN', error_code: error.message === 'PHONEPE_REQUEST_TIMEOUT' ? 'REQUEST_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', error_message: 'PhonePe response was not definitive. Check status before retrying.' }, user.id);
          await posStorage.recordSyncLog({ terminalId: terminal.id, userId: user.id, provider: 'phonepe', action: 'INITIATE_SALE', status: 'ERROR', message: 'PhonePe initiation result was indeterminate; transaction retained for reconciliation.', details: { merchantTxnId } });
          return { status: 202, body: { ok: false, pendingVerification: true, message: 'PhonePe did not return a definitive response. Check this transaction status before retrying.', transaction: sanitizeTransaction(updated || tx) } };
        }
        const updated = await posStorage.updateTransaction(merchantTxnId, { cpay_id: merchantTxnId, status: result.status, error_code: result.success ? null : result.resultCode, error_message: result.success ? null : result.message, metadata: { phonepeInitiationCode: result.resultCode } }, user.id);
        await posStorage.recordSyncLog({ terminalId: terminal.id, userId: user.id, provider: 'phonepe', action: 'INITIATE_SALE', status: result.success ? 'SUCCESS' : 'FAILURE', message: result.message, details: { merchantTxnId, amountPaise } });
        return { status: result.success ? 200 : 502, body: { ok: result.success, message: result.message, transaction: sanitizeTransaction(updated || tx) } };
      }
      if (action === 'status' && method === 'GET') {
        const merchantTxnId = url.searchParams.get('merchantTxnId') || url.searchParams.get('id');
        if (!merchantTxnId) return { status: 400, body: { error: 'PARAMETER_MISSING' } };
        const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId, user.id);
        if (!tx || tx.provider !== 'phonepe') return { status: 404, body: { error: 'NOT_FOUND' } };
        if (['INITIATED', 'PENDING', 'UNKNOWN'].includes(tx.status)) {
          const status = await provider.getTransactionStatus({ mid: tx.mid, merchantTxnId });
          if (status.amountPaise != null && status.amountPaise !== Number(tx.amount_paise)) return { status: 502, body: { error: 'PHONEPE_AMOUNT_MISMATCH', transaction: sanitizeTransaction(tx) } };
          if (status.status !== 'UNKNOWN' && status.status !== tx.status) {
            const updated = await posStorage.updateTransaction(merchantTxnId, { status: status.status, rrn: status.rrn || null, payment_method: status.paymentMethod || null, error_code: status.status === 'FAILED' ? status.resultCode : null, error_message: status.status === 'FAILED' ? status.resultMsg : null, completed_at: ['SUCCESS', 'FAILED', 'EXPIRED'].includes(status.status) ? new Date().toISOString() : null }, user.id);
            return { status: 200, body: { ok: true, updated: true, transaction: sanitizeTransaction(updated) } };
          }
        }
        return { status: 200, body: { ok: true, updated: false, transaction: sanitizeTransaction(tx) } };
      }
      if (action === 'sync' || action === 'reconcile') {
        if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
        if (!provider.isConfigured()) return { status: 503, body: { ok: false, error: 'PHONEPE_CREDENTIALS_REQUIRED', ...integration } };
        const terminal = await posStorage.getTerminal(user.id, 'phonepe');
        if (!terminal) return { status: 400, body: { error: 'TERMINAL_NOT_CONFIGURED' } };
        const pending = (await posStorage.getPendingTransactions({ userId: user.id, limit: 50 })).filter((tx) => tx.provider === 'phonepe');
        let updatedCount = 0;
        for (const tx of pending) {
          try {
            const status = await provider.searchTransaction({ mid: tx.mid, tid: tx.tid, merchantTxnId: tx.merchant_txn_id });
            if (!status || status.status === 'UNKNOWN') continue;
            if (status.amountPaise !== Number(tx.amount_paise)) continue;
            if (status.status !== tx.status) {
              await posStorage.updateTransaction(tx.merchant_txn_id, { status: status.status, rrn: status.rrn || null, payment_method: status.paymentMethod || null, error_code: status.status === 'FAILED' ? status.resultCode : null, completed_at: ['SUCCESS', 'FAILED', 'EXPIRED'].includes(status.status) ? new Date().toISOString() : null }, user.id);
              updatedCount++;
            }
          } catch { /* retain pending state; a later reconciliation can retry */ }
        }
        await posStorage.recordSyncLog({ terminalId: terminal.id, userId: user.id, provider: 'phonepe', action: 'BATCH_RECONCILIATION', status: 'SUCCESS', recordsChecked: pending.length, recordsUpdated: updatedCount, message: `Checked ${pending.length} pending PhonePe EDC transaction(s); ${updatedCount} updated.` });
        const latest = (await posStorage.listTransactions({ userId: user.id, limit: 20 })).filter((tx) => tx.provider === 'phonepe');
        return { status: 200, body: { ok: true, recordsChecked: pending.length, recordsUpdated: updatedCount, transactions: latest.map(sanitizeTransaction) } };
      }
      if (['cancel', 'refund'].includes(action)) {
        return { status: 501, body: { ok: false, error: 'PHONEPE_EDC_OPERATION_NOT_DOCUMENTED', message: 'This PhonePe EDC contract does not publish cancel/refund operations.' } };
      }
      return { status: 404, body: { error: 'ROUTE_NOT_FOUND', provider: 'phonepe', message: `PhonePe POS route "/api/pos/phonepe/${action}" is not available.` } };
    } catch (error) {
      console.error(`[pos-controller] PhonePe ${action} failed:`, error.code || 'UNEXPECTED_ERROR');
      return { status: 500, body: { ok: false, error: 'INTERNAL_ERROR', message: 'PhonePe POS request failed.' } };
    }
  }

  try {
    switch (action) {
      case 'config': {
        if (method === 'GET') {
          const resolved = await resolveTerminal(user.id);
          return {
            status: 200,
            body: {
              ok: true,
              terminal: sanitizeTerminal(resolved.terminal),
              isConfigured: resolved.isConfigured,
              environments: ['staging', 'production'],
            },
          };
        } else if (method === 'POST') {
          const { mid, tid, merchantKey, environment, clientId } = body;
          if (!mid || !String(mid).trim()) {
            return { status: 400, body: { error: 'VALIDATION_ERROR', message: 'MID (Merchant ID) is required.' } };
          }
          if (!tid || !String(tid).trim()) {
            return { status: 400, body: { error: 'VALIDATION_ERROR', message: 'TID (Terminal ID) is required.' } };
          }

          let effectiveKey = merchantKey ? String(merchantKey).trim() : null;
          if (!effectiveKey) {
            const existing = await resolveTerminal(user.id);
            if (existing && existing.merchantKey) {
              effectiveKey = existing.merchantKey;
            } else {
              return { status: 400, body: { error: 'VALIDATION_ERROR', message: 'Paytm Merchant Key is required.' } };
            }
          }

          const targetEnv = environment === 'production' ? 'production' : 'staging';
          const saved = await posStorage.saveTerminal({
            userId: user.id,
            mid: String(mid).trim(),
            tid: String(tid).trim(),
            merchantKey: effectiveKey,
            environment: targetEnv,
            clientId: clientId ? String(clientId).trim() : 'reachpay',
          });

          await posStorage.recordSyncLog({
            terminalId: saved.id,
            userId: user.id,
            action: 'CONFIG_UPDATE',
            status: 'SUCCESS',
            message: `Terminal configuration saved for MID: ${saved.mid}, TID: ${saved.tid} (${targetEnv})`,
          });

          return {
            status: 200,
            body: {
              ok: true,
              message: 'Paytm POS terminal configured successfully.',
              terminal: sanitizeTerminal(saved),
            },
          };
        }
        return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
      }

      case 'test-connection': {
        if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const resolved = await resolveTerminal(user.id);
        if (!resolved.isConfigured || !resolved.merchantKey) {
          return {
            status: 400,
            body: {
              ok: false,
              connected: false,
              status: 'NOT_CONFIGURED',
              message: 'Terminal is not configured. Please save Paytm MID, TID, and Merchant Key first.',
            },
          };
        }

        const testRes = await provider.testConnection({
          mid: resolved.mid,
          tid: resolved.tid,
          clientId: resolved.clientId,
          merchantKey: resolved.merchantKey,
          environment: resolved.environment,
        });

        const newStatus = testRes.connected ? 'ONLINE' : 'OFFLINE';
        if (resolved.terminal?.id) {
          await posStorage.updateTerminalStatus(resolved.terminal.id, {
            status: newStatus,
            message: testRes.message,
          });

          await posStorage.recordSyncLog({
            terminalId: resolved.terminal.id,
            userId: user.id,
            action: 'TEST_CONNECTION',
            status: testRes.connected ? 'SUCCESS' : 'FAILURE',
            message: testRes.message,
            details: testRes.details || {},
          });
        }

        return {
          status: 200,
          body: {
            ok: true,
            connected: testRes.connected,
            terminalStatus: newStatus,
            message: testRes.message,
            environment: resolved.environment,
            details: testRes.details,
          },
        };
      }

      case 'initiate-sale': {
        if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const { amount, customerMobile, notes } = body;
        const idempotencyKey = String(req.headers['idempotency-key'] || body.idempotencyKey || '').trim();
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
          return { status: 400, body: { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Provide an 8–128 character Idempotency-Key for every POS payment request.' } };
        }

        const amountPaise = parseAmountPaise(amount);
        if (!amountPaise || amountPaise <= 0) {
          return { status: 400, body: { error: 'INVALID_AMOUNT', message: 'Amount must be a positive INR value with at most two decimal places.' } };
        }
        if (amountPaise > 10_000_000) {
          return { status: 400, body: { error: 'AMOUNT_EXCEEDED', message: 'Transaction amount exceeds maximum POS limit of ₹1,00,000.' } };
        }
        const numAmount = amountPaise / 100;

        // Idempotency check: if transaction exists with this key, return it
        {
          const existingTx = await posStorage.getTransactionByIdempotencyKey(idempotencyKey, user.id);
          if (existingTx && Number(existingTx.amount_paise) !== amountPaise) {
            return { status: 409, body: { ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT', message: 'This idempotency key was already used for a different amount.' } };
          }
          if (existingTx) {
            return {
              status: 200,
              body: {
                ok: true,
                idempotentReplay: true,
                message: 'Existing transaction returned for idempotency key.',
                transaction: sanitizeTransaction(existingTx),
              },
            };
          }
        }

        const resolved = await resolveTerminal(user.id);
        if (!resolved.isConfigured || !resolved.merchantKey) {
          return {
            status: 400,
            body: {
              error: 'TERMINAL_NOT_CONFIGURED',
              message: 'Paytm POS terminal credentials missing. Please configure MID, TID, and Merchant Key.',
            },
          };
        }

        const merchantTxnId = `RP_${Date.now()}_${randomUUID().slice(0, 6).toUpperCase()}`;

        // 1. Create INITIATED record in storage
        const txRecord = await posStorage.createTransaction({
          userId: user.id,
          terminalId: resolved.terminal?.id,
          environment: resolved.environment,
          merchantTxnId,
          mid: resolved.mid,
          tid: resolved.tid,
          amountPaise,
          customerMobile: customerMobile ? String(customerMobile).trim() : null,
          notes: notes ? String(notes).trim() : null,
          idempotencyKey: idempotencyKey || null,
          status: 'INITIATED',
          metadata: { createdBy: user.email || user.name },
        });

        if (txRecord.idempotentReplay) {
          return { status: 200, body: { ok: true, idempotentReplay: true, message: 'Existing transaction returned for idempotency key.', transaction: sanitizeTransaction(txRecord) } };
        }

        // 2. Call Paytm POS Provider
        const initRes = await provider.initiateSale({
          mid: resolved.mid,
          tid: resolved.tid,
          merchantKey: resolved.merchantKey,
          environment: resolved.environment,
          merchantTxnId,
          amountPaise,
          customerMobile,
          notes,
        });

        // 3. Update transaction record
        const updatedTx = await posStorage.updateTransaction(merchantTxnId, {
          cpay_id: initRes.cpayId,
          status: initRes.status,
          error_code: initRes.success ? null : initRes.resultCode,
          error_message: initRes.success ? null : initRes.message,
          metadata: {
            paytmInitiation: { rawStatus: initRes.rawStatus, resultCode: initRes.resultCode },
          },
        });

        // 4. Audit log
        await posStorage.recordSyncLog({
          terminalId: resolved.terminal?.id,
          userId: user.id,
          action: 'INITIATE_SALE',
          status: initRes.success ? 'SUCCESS' : 'FAILURE',
          message: initRes.message,
          details: {
            merchantTxnId,
            cpayId: initRes.cpayId,
            amount: numAmount,
          },
        });

        return {
          status: initRes.success ? 200 : 400,
          body: {
            ok: initRes.success,
            message: initRes.message,
            transaction: sanitizeTransaction(updatedTx || txRecord),
          },
        };
      }

      case 'status': {
        if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const merchantTxnId = url.searchParams.get('merchantTxnId') || url.searchParams.get('id');
        if (!merchantTxnId) {
          return { status: 400, body: { error: 'PARAMETER_MISSING', message: 'merchantTxnId query parameter is required.' } };
        }

        const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId, user.id);
        if (!tx) {
          return { status: 404, body: { error: 'NOT_FOUND', message: 'Transaction not found.' } };
        }

        // Cross-merchant tenant authorization check

        // If transaction is still INITIATED or PENDING, poll Paytm EDC status
        if (['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(tx.status)) {
          const resolved = await resolveTerminal(user.id);
          if (resolved.isConfigured && resolved.merchantKey) {
            const statusRes = await provider.getTransactionStatus({
              mid: tx.mid || resolved.mid,
              tid: tx.tid || resolved.tid,
              clientId: resolved.clientId,
              merchantKey: resolved.merchantKey,
              environment: tx.environment || resolved.environment,
              merchantTxnId: tx.merchant_txn_id,
              cpayId: tx.cpay_id,
              txnDate: tx.initiated_at,
            });

            if (statusRes.status && statusRes.status !== tx.status) {
              const updates = {
                status: statusRes.status,
                payment_method: statusRes.paymentMethod || tx.payment_method,
                rrn: statusRes.rrn || tx.rrn,
                auth_code: statusRes.authCode || tx.auth_code,
                card_last4: statusRes.cardLast4 || tx.card_last4,
                card_type: statusRes.cardNetwork || tx.card_type,
                error_code: statusRes.status === 'FAILED' ? statusRes.resultCode : null,
                error_message: statusRes.status === 'FAILED' ? statusRes.resultMsg : null,
              };

              if (statusRes.status === 'SUCCESS' || statusRes.status === 'FAILED' || statusRes.status === 'CANCELLED') {
                updates.completed_at = new Date().toISOString();
              }

              const refreshedTx = await posStorage.updateTransaction(tx.merchant_txn_id, updates, user.id);
              return {
                status: 200,
                body: {
                  ok: true,
                  updated: true,
                  transaction: sanitizeTransaction(refreshedTx),
                },
              };
            }
          }
        }

        return {
          status: 200,
          body: {
            ok: true,
            updated: false,
            transaction: sanitizeTransaction(tx),
          },
        };
      }

      case 'sync':
      case 'reconcile': {
        if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const resolved = await resolveTerminal(user.id);
        if (!resolved.isConfigured || !resolved.merchantKey) {
          return {
            status: 400,
            body: { error: 'TERMINAL_NOT_CONFIGURED', message: 'Terminal credentials not configured for synchronization.' },
          };
        }

        // Fetch user's pending transactions (isolated)
        const pendingList = await posStorage.getPendingTransactions({ userId: user.id, limit: 15 });
        let updatedCount = 0;

        for (const tx of pendingList) {
          try {
            const statusRes = await provider.getTransactionStatus({
              mid: tx.mid || resolved.mid,
              tid: tx.tid || resolved.tid,
              clientId: resolved.clientId,
              merchantKey: resolved.merchantKey,
              environment: tx.environment || resolved.environment,
              merchantTxnId: tx.merchant_txn_id,
              cpayId: tx.cpay_id,
              txnDate: tx.initiated_at,
            });

            if (statusRes.status && statusRes.status !== tx.status) {
              await posStorage.updateTransaction(tx.merchant_txn_id, {
                status: statusRes.status,
                payment_method: statusRes.paymentMethod || tx.payment_method,
                rrn: statusRes.rrn || tx.rrn,
                auth_code: statusRes.authCode || tx.auth_code,
                card_last4: statusRes.cardLast4 || tx.card_last4,
                card_type: statusRes.cardNetwork || tx.card_type,
                completed_at: ['SUCCESS', 'FAILED', 'CANCELLED'].includes(statusRes.status) ? new Date().toISOString() : null,
              });
              updatedCount++;
            }
          } catch (err) {
            console.warn(`[pos-controller] Sync failed for ${tx.merchant_txn_id}:`, err.message);
          }
        }

        await posStorage.recordSyncLog({
          terminalId: resolved.terminal?.id,
          userId: user.id,
          action: action === 'reconcile' ? 'BATCH_RECONCILIATION' : 'BATCH_SYNC',
          status: 'SUCCESS',
          recordsChecked: pendingList.length,
          recordsUpdated: updatedCount,
          message: `Synchronized ${pendingList.length} transactions. ${updatedCount} state changes updated.`,
        });

        const latestTxns = await posStorage.listTransactions({ userId: user.id, limit: 20 });
        return {
          status: 200,
          body: {
            ok: true,
            recordsChecked: pendingList.length,
            recordsUpdated: updatedCount,
            message: `Sync complete. ${updatedCount} transactions updated.`,
            transactions: latestTxns.map(sanitizeTransaction),
          },
        };
      }

      case 'transactions': {
        if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100);
        const offset = Number(url.searchParams.get('offset') || 0);
        const statusFilter = url.searchParams.get('status') || null;

        // Isolate transactions by current authenticated user
        const transactions = await posStorage.listTransactions({
          userId: user.id,
          limit,
          offset,
          status: statusFilter,
        });

        return {
          status: 200,
          body: {
            ok: true,
            total: transactions.length,
            transactions: transactions.map(sanitizeTransaction),
          },
        };
      }

      case 'sync-logs': {
        if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50);
        const logs = await posStorage.listSyncLogs({ userId: user.id, limit });

        return {
          status: 200,
          body: {
            ok: true,
            logs,
          },
        };
      }

      case 'cancel': {
        if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };

        const { merchantTxnId, cpayId } = body;
        if (!merchantTxnId) {
          return { status: 400, body: { error: 'PARAMETER_MISSING', message: 'merchantTxnId is required.' } };
        }

        const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId, user.id);
        if (!tx) {
          return { status: 404, body: { error: 'NOT_FOUND', message: 'Transaction not found.' } };
        }

        // Cross-merchant tenant authorization check

        if (!['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(tx.status)) {
          return {
            status: 400,
            body: {
              error: 'INVALID_STATE',
              message: `Cannot cancel transaction in '${tx.status}' state. Only pending EDC transactions can be cancelled.`,
            },
          };
        }

        const resolved = await resolveTerminal(user.id);
        const cancelRes = await provider.cancelOrRefund({
          mid: tx.mid || resolved.mid,
          tid: tx.tid || resolved.tid,
          merchantKey: resolved.merchantKey,
          environment: tx.environment || resolved.environment,
          merchantTxnId,
          cpayId: cpayId || tx.cpay_id,
        });

        if (cancelRes.success) {
          const updated = await posStorage.updateTransaction(merchantTxnId, {
            status: 'CANCELLED',
            completed_at: new Date().toISOString(),
          }, user.id);
          return {
            status: 200,
            body: { ok: true, message: 'Transaction cancelled on POS terminal.', transaction: sanitizeTransaction(updated) },
          };
        }

        return {
          status: 400,
          body: { ok: false, message: cancelRes.message || 'Could not cancel transaction on Paytm EDC terminal.' },
        };
      }

      case 'refund':
        return { status: 501, body: { ok: false, error: 'REFUND_NOT_SUPPORTED', message: 'The configured Paytm EDC contract in this application does not include a refund operation. No refund request was sent.' } };

      case 'balance': {
        if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
        const balanceInfo = provider.getAccountBalance();
        return {
          status: 200,
          body: {
            ok: true,
            available: balanceInfo.available,
            message: balanceInfo.message,
            reason: balanceInfo.reason,
          },
        };
      }

      default:
        return {
          status: 404,
          body: { error: 'ROUTE_NOT_FOUND', message: `POS route "/api/pos/paytm/${action}" not found.` },
        };
    }
  } catch (error) {
    console.error(`[pos-controller] Error in ${action}:`, error.code || 'UNEXPECTED_ERROR');
    return {
      status: error.code === 'POS_DATABASE_UNAVAILABLE' ? 503 : error.code === 'IDEMPOTENCY_KEY_CONFLICT' ? 409 : 500,
      body: { error: error.code === 'POS_DATABASE_UNAVAILABLE' ? 'POS_DATABASE_UNAVAILABLE' : error.code === 'IDEMPOTENCY_KEY_CONFLICT' ? error.code : 'INTERNAL_ERROR', message: error.code === 'POS_DATABASE_UNAVAILABLE' ? 'The payment record could not be safely persisted. No payment request was submitted.' : error.code === 'IDEMPOTENCY_KEY_CONFLICT' ? 'This idempotency key is already associated with another payment.' : 'An unexpected POS error occurred.' },
    };
  }
}

/** Verify and apply PhonePe's signed, base64 encoded EDC callback. */
export async function handlePhonePeWebhook(req, body = {}) {
  try {
    const provider = getPOSProvider('phonepe');
    const response = body?.response;
    const signature = req.headers['x-verify'];
    if (typeof response !== 'string' || !provider.verifyCallback(response, signature)) {
      return { status: 401, body: { success: false, message: 'Invalid PhonePe callback signature.' } };
    }
    let decoded;
    try { decoded = JSON.parse(Buffer.from(response, 'base64').toString('utf8')); } catch {
      return { status: 400, body: { success: false, message: 'Malformed PhonePe callback payload.' } };
    }
    const data = decoded?.data || decoded;
    const transactionId = data?.transactionId;
    if (!transactionId) return { status: 400, body: { success: false, message: 'PhonePe callback is missing transactionId.' } };
    const tx = await posStorage.getTransactionByMerchantTxnId(transactionId);
    if (!tx || tx.provider !== 'phonepe' || data.merchantId !== tx.mid || Number(data.amount) !== Number(tx.amount_paise)
      || (data.terminalId && data.terminalId !== tx.tid)
      || (data.storeId && process.env.PHONEPE_POS_STORE_ID && data.storeId !== process.env.PHONEPE_POS_STORE_ID)) {
      return { status: 400, body: { success: false, message: 'Callback transaction, merchant, or amount does not match.' } };
    }
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(tx.status)) {
      return { status: 200, body: { success: true, message: 'Duplicate terminal callback acknowledged.' } };
    }
    const raw = String(data.status || data.paymentState || decoded.code || '').toUpperCase();
    const status = ['SUCCESS', 'COMPLETED', 'PAYMENT_SUCCESS'].includes(raw) && decoded.success !== false
      ? 'SUCCESS'
      : ['FAILED', 'PAYMENT_ERROR', 'PAYMENT_DECLINED', 'PAYMENT_CANCELLED'].includes(raw) || decoded.success === false ? 'FAILED' : 'PENDING';
    await posStorage.updateTransaction(transactionId, {
      status,
      payment_method: data.paymentMode || tx.payment_method,
      rrn: data.referenceNumber || data.providerReferenceId || tx.rrn,
      error_code: status === 'FAILED' ? (data.responseCode || decoded.code) : null,
      error_message: status === 'FAILED' ? decoded.message : null,
      completed_at: ['SUCCESS', 'FAILED'].includes(status) ? new Date().toISOString() : null,
    });
    await posStorage.recordSyncLog({ terminalId: tx.terminal_id, userId: tx.user_id, provider: 'phonepe', action: 'WEBHOOK_UPDATE', status: 'SUCCESS', message: `PhonePe signed callback updated ${transactionId} to ${status}.` });
    return { status: 200, body: { success: true, message: 'Callback processed.' } };
  } catch {
    return { status: 500, body: { success: false, message: 'PhonePe callback could not be processed.' } };
  }
}

/** Handle incoming Paytm webhook. */
export async function handleWebhook(req, body = {}) {
  try {
    const signature =
      req.headers['x-paytm-signature'] ||
      req.headers['checksum'] ||
      body?.head?.signature ||
      body?.head?.reqHash ||
      body?.CHECKSUMHASH;

    const merchantTxnId = body?.body?.merchantTxnId || body?.ORDERID || body?.merchantTxnId;

    if (!merchantTxnId) {
      return { status: 400, body: { status: 'FAILURE', message: 'Missing merchantTxnId' } };
    }

    const tx = await posStorage.getTransactionByMerchantTxnId(merchantTxnId);
    if (!tx) {
      return { status: 404, body: { status: 'FAILURE', message: 'Transaction not found' } };
    }

    // Verify signature with terminal's decrypted key
    const terminal = await posStorage.getTerminal(tx.user_id, tx.provider || 'paytm', { mid: tx.mid, tid: tx.tid, environment: tx.environment });
    if (!signature) {
      return { status: 401, body: { status: 'FAILURE', message: 'Missing Paytm checksum signature in webhook request' } };
    }

    let merchantKey = process.env.PAYTM_POS_MERCHANT_KEY;
    if (terminal?.encrypted_merchant_key) {
      try {
        merchantKey = decryptSecret(
          terminal.encrypted_merchant_key,
          terminal.encrypted_merchant_key_iv,
          terminal.encrypted_merchant_key_tag
        );
      } catch {
        // Fallback
      }
    }

    if (!merchantKey) {
      return { status: 503, body: { status: 'FAILURE', message: 'Paytm webhook verification is not configured.' } };
    }
    const payloadToVerify = body.body || body;
    const isValid = paytmPOSProvider.verifyWebhook({
      rawBody: typeof payloadToVerify === 'string' ? payloadToVerify : JSON.stringify(payloadToVerify),
      signature,
      merchantKey,
    });
    if (!isValid) {
      return { status: 401, body: { status: 'FAILURE', message: 'Invalid Paytm signature' } };
    }

    const callbackAmount = body?.body?.txnAmount ?? body?.body?.amount ?? body?.TXNAMOUNT ?? body?.amount;
    if (callbackAmount != null) {
      const callbackPaise = parseAmountPaise(callbackAmount);
      if (callbackPaise == null || callbackPaise !== Number(tx.amount_paise)) return { status: 400, body: { status: 'FAILURE', message: 'Webhook amount does not match the payment record.' } };
    }

    // Idempotency: If already finalized, do not duplicate updates
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(tx.status)) {
      await posStorage.recordSyncLog({
        terminalId: tx.terminal_id,
        userId: tx.user_id,
        action: 'WEBHOOK_DUPLICATE',
        status: 'SUCCESS',
        message: `Duplicate webhook received for already finalized transaction ${merchantTxnId} (${tx.status})`,
      });
      return {
        status: 200,
        body: { status: 'SUCCESS', message: 'Duplicate webhook received for already finalized transaction' },
      };
    }

    // Extract status and update transaction
    const rawStatus = String(body?.body?.status || body?.STATUS || '').toUpperCase();
    let status = 'PENDING';
    if (['SUCCESS', 'TXN_SUCCESS', 'COMPLETED'].includes(rawStatus)) status = 'SUCCESS';
    else if (['FAILED', 'TXN_FAILURE', 'EXPIRED'].includes(rawStatus)) status = 'FAILED';
    else if (['CANCELLED', 'VOID'].includes(rawStatus)) status = 'CANCELLED';

    await posStorage.updateTransaction(merchantTxnId, {
      status,
      payment_method: body?.body?.paymentMode || body?.PAYMENTMODE || tx.payment_method,
      rrn: body?.body?.rrn || body?.RRN || tx.rrn,
      auth_code: body?.body?.authCode || tx.auth_code,
      completed_at: ['SUCCESS', 'FAILED', 'CANCELLED'].includes(status) ? new Date().toISOString() : null,
      metadata: { webhook: { rawStatus } },
    });

    await posStorage.recordSyncLog({
      terminalId: tx.terminal_id,
      userId: tx.user_id,
      action: 'WEBHOOK_UPDATE',
      status: 'SUCCESS',
      message: `Webhook received for ${merchantTxnId}: status updated to ${status}`,
    });

    return {
      status: 200,
      body: { status: 'SUCCESS', message: 'Webhook processed' },
    };
  } catch {
    return { status: 500, body: { status: 'FAILURE', message: 'Webhook processing failed.' } };
  }
}
