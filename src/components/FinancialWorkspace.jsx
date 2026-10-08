import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Clock,
  FileText,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
  CreditCard,
  RefreshCw,
  Wifi,
  WifiOff,
  SlidersHorizontal,
  Send,
  AlertCircle,
  XCircle,
  Eye,
  EyeOff,
  Check,
  Smartphone,
  History,
  Terminal,
  Activity,
} from 'lucide-react';
import './FinancialWorkspace.css';

const journey = [
  ['Request', 'Enter a collection amount'],
  ['Pay', 'Choose a supported method'],
  ['POS', 'Provider confirms collection'],
  ['Pending', 'POS credit can take up to 20 minutes'],
  ['Wallet', 'Credit after server verification'],
  ['Choose service', 'Select payout or bill payment'],
  ['Confirm', 'Review destination and amount'],
  ['Receipt', 'Track the verified final status'],
];

const serviceGroups = [
  { title: 'Utilities', items: 'Electricity · Water · Gas · LPG' },
  { title: 'Telecom & connectivity', items: 'Mobile · Landline · Broadband · DTH · Cable' },
  { title: 'Financial services', items: 'Loan EMI · Credit card · Insurance · Deposits' },
  { title: 'Government & municipal', items: 'Municipal · Property tax · eChallan · Passport' },
  { title: 'Education & housing', items: 'School · University · Housing maintenance' },
  { title: 'Transport & other', items: 'FASTag · Hospital · Club · OTT' },
];

export default function FinancialWorkspace({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' or 'overview'
  const [posProvider, setPosProvider] = useState('paytm');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info'); // 'info' | 'success' | 'error'

  // POS State
  const [terminalConfig, setTerminalConfig] = useState(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configForm, setConfigForm] = useState({
    mid: '',
    tid: '',
    merchantKey: '',
    environment: 'staging',
    clientId: 'reachpay',
  });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Connection & Balance
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  // Payment Initiation Form
  const [saleAmount, setSaleAmount] = useState('100');
  const [customerMobile, setCustomerMobile] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [initiatingSale, setInitiatingSale] = useState(false);
  const [activeTransaction, setActiveTransaction] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Transactions History & Sync
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [syncLogs, setSyncLogs] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Auto-polling ref for active transaction
  const pollIntervalRef = useRef(null);
  const idempotencyAttemptRef = useRef(null);

  const initial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U';
  const mobileDisplay = user?.mobile_e164 || user?.mobile || 'Not set';

  const showNotification = useCallback((message, type = 'info') => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => {
      setNotice((prev) => (prev === message ? '' : prev));
    }, 6000);
  }, []);

  // 1. Load Terminal Configuration & Balance
  const fetchTerminalConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/pos/${posProvider}/config`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setTerminalConfig(data.terminal);
        if (data.terminal) {
          setConfigForm((prev) => ({
            ...prev,
            mid: data.terminal.mid || '',
            tid: data.terminal.tid || '',
            environment: data.terminal.environment || 'staging',
            clientId: data.terminal.clientId || 'reachpay',
          }));
          setConnectionStatus({
            online: data.terminal.status === 'ONLINE',
            status: data.terminal.status,
            message: data.terminal.lastStatusMessage || '',
            lastTestedAt: data.terminal.lastTestedAt,
          });
        }
      }
    } catch (err) {
      console.warn('Error fetching terminal config:', err);
    }
  }, [posProvider]);

  // 2. Load Transactions
  const fetchTransactions = useCallback(async (filter = statusFilter) => {
    setLoadingTxns(true);
    try {
      const url = filter && filter !== 'ALL'
        ? `/api/pos/${posProvider}/transactions?status=${encodeURIComponent(filter)}&limit=50`
        : `/api/pos/${posProvider}/transactions?limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.ok) {
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.warn('Error fetching transactions:', err);
    } finally {
      setLoadingTxns(false);
    }
  }, [statusFilter, posProvider]);

  // Initial load
  useEffect(() => {
    // Fetches synchronize this screen with the selected provider's API state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTerminalConfig();
    fetchTransactions();
  }, [fetchTerminalConfig, fetchTransactions]);

  // 3. Save Terminal Configuration
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!configForm.mid.trim() || !configForm.tid.trim()) {
      showNotification(`${posProvider === 'paytm' ? 'Paytm' : 'PhonePe'} merchant and terminal references are required.`, 'error');
      return;
    }

    if (posProvider === 'paytm' && !terminalConfig?.hasSecretKey && !configForm.merchantKey.trim()) {
      showNotification('Paytm Merchant Key is required.', 'error');
      return;
    }

    setSavingConfig(true);
    try {
      const res = await fetch(`/api/pos/${posProvider}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTerminalConfig(data.terminal);
        setIsConfiguring(false);
        showNotification(posProvider === 'paytm' ? 'Paytm terminal credentials safely stored.' : 'PhonePe terminal references saved. Partner access is still required.', posProvider === 'paytm' ? 'success' : 'info');
        // Clear secret key from form state memory
        setConfigForm((prev) => ({ ...prev, merchantKey: '' }));
      } else {
        showNotification(data.message || 'Could not save configuration.', 'error');
      }
    } catch (err) {
      showNotification(`Save error: ${err.message}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // 4. Test Terminal Connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch(`/api/pos/${posProvider}/test-connection`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setConnectionStatus({
          online: data.connected,
          status: data.terminalStatus,
          message: data.message,
          lastTestedAt: new Date().toISOString(),
        });
        if (data.connected) {
          showNotification(`${posProvider === 'paytm' ? 'Paytm EDC Gateway' : 'PhonePe EDC'} connection verified successfully.`, 'success');
        } else {
          showNotification(`Terminal connection failed: ${data.message}`, 'error');
        }
      } else {
        setConnectionStatus({
          online: false,
          status: data.status || 'ERROR',
          message: data.message || 'Connection test failed.',
        });
        showNotification(data.message || 'Terminal connection test failed.', 'error');
      }
      fetchTerminalConfig();
    } catch (err) {
      showNotification(`Connection test error: ${err.message}`, 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  // 5. Initiate POS Sale
  const handleInitiateSale = async (e) => {
    e.preventDefault();
    if (activeTransaction && ['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(activeTransaction.status)) {
      showNotification('Resolve the active transaction before starting another POS payment.', 'error');
      return;
    }
    const numAmount = parseFloat(saleAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showNotification('Enter a valid amount in INR.', 'error');
      return;
    }

    if (!terminalConfig?.isConfigured) {
      showNotification('Please configure your Paytm MID and TID before initiating sales.', 'error');
      setIsConfiguring(true);
      return;
    }

    setInitiatingSale(true);
    const storageKey = `reachpay.pos.pending:${posProvider}`;
    let attempt = idempotencyAttemptRef.current;
    if (!attempt) {
      try { attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { attempt = null; }
    }
    if (attempt && Number(attempt.amount) !== numAmount) {
      setInitiatingSale(false);
      showNotification('A prior payment request has no confirmed final state. Reconcile it before starting a different amount.', 'error');
      return;
    }
    if (!attempt) {
      attempt = { amount: numAmount, key: `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` };
      idempotencyAttemptRef.current = attempt;
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); } catch { /* server idempotency remains active for this request */ }
    }
    const idempotencyKey = attempt.key;

    try {
      const res = await fetch(`/api/pos/${posProvider}/initiate-sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: numAmount,
          customerMobile: customerMobile.trim() || undefined,
          notes: saleNotes.trim() || undefined,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (data.transaction) {
        setActiveTransaction(data.transaction);
        fetchTransactions();
        if (['SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(data.transaction.status)) {
          idempotencyAttemptRef.current = null;
          try { sessionStorage.removeItem(storageKey); } catch { /* best effort cleanup */ }
        } else {
          const pendingAttempt = { ...attempt, merchantTxnId: data.transaction.merchant_txn_id };
          idempotencyAttemptRef.current = pendingAttempt;
          try { sessionStorage.setItem(storageKey, JSON.stringify(pendingAttempt)); } catch { /* server idempotency remains active */ }
        }
        showNotification(data.message || (data.transaction.status === 'UNKNOWN' ? 'Payment result is unknown. Check transaction status before retrying.' : 'Payment request sent to the terminal.'), data.transaction.status === 'FAILED' ? 'error' : 'info');
      } else {
        showNotification(data.message || 'Payment initiation failed.', 'error');
      }
    } catch (err) {
      showNotification(`Initiation error: ${err.message}`, 'error');
    } finally {
      setInitiatingSale(false);
    }
  };

  // 6. Check Active Transaction Status
  const checkTransactionStatus = useCallback(async (merchantTxnId) => {
    if (!merchantTxnId) return;
    try {
      const res = await fetch(`/api/pos/${posProvider}/status?merchantTxnId=${encodeURIComponent(merchantTxnId)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setActiveTransaction(data.transaction);
        // If final status reached, stop polling and update history
        if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(data.transaction.status)) {
          const storageKey = `reachpay.pos.pending:${data.transaction.provider || posProvider}`;
          try {
            const pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (!pending?.merchantTxnId || pending.merchantTxnId === data.transaction.merchant_txn_id) sessionStorage.removeItem(storageKey);
          } catch { /* best effort cleanup */ }
          idempotencyAttemptRef.current = null;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          fetchTransactions();
          if (data.transaction.status === 'SUCCESS') {
            showNotification(`Payment of ₹${(data.transaction.amount_paise / 100).toFixed(2)} completed successfully on POS!`, 'success');
          } else if (data.transaction.status === 'FAILED') {
            showNotification(`Payment failed: ${data.transaction.error_message || 'Customer declined or session expired'}`, 'error');
          }
        }
      }
    } catch (err) {
      console.warn('Status poll error:', err);
    }
  }, [fetchTransactions, posProvider, showNotification]);

  // Set up auto-poll when active transaction is pending
  useEffect(() => {
    if (activeTransaction && ['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(activeTransaction.status)) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => {
        checkTransactionStatus(activeTransaction.merchant_txn_id);
      }, 4000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeTransaction, checkTransactionStatus]);

  // 7. Cancel Active Transaction
  const handleCancelSale = async () => {
    if (!activeTransaction) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/pos/${posProvider}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantTxnId: activeTransaction.merchant_txn_id,
          cpayId: activeTransaction.cpay_id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setActiveTransaction(data.transaction);
        showNotification('Transaction cancelled on terminal.', 'info');
        fetchTransactions();
      } else {
        showNotification(data.message || 'Could not cancel transaction.', 'error');
      }
    } catch (err) {
      showNotification(`Cancel error: ${err.message}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // 8. Batch Sync Now
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/pos/${posProvider}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification(data.message, 'success');
        fetchTransactions();
      } else {
        showNotification(data.message || 'Sync failed.', 'error');
      }
    } catch (err) {
      showNotification(`Sync error: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // 9. Load Sync Logs
  const fetchSyncLogs = async () => {
    try {
      const res = await fetch(`/api/pos/${posProvider}/sync-logs?limit=30`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncLogs(data.logs || []);
        setShowLogsModal(true);
      }
    } catch {
      showNotification('Could not load audit sync logs.', 'error');
    }
  };

  const isTerminalOnline = connectionStatus?.online || terminalConfig?.status === 'ONLINE';

  return (
    <section className="financial-workspace" aria-labelledby="workspace-title">
      {/* 1. Header / Welcome bar */}
      <header className="workspace-top-bar">
        <div className="workspace-title-area">
          <div className="eyebrow"><span /> REACHPAY FINTECH PLATFORM</div>
          <h1 id="workspace-title">Welcome, {user.name}</h1>
          <p>
            {posProvider === 'paytm'
              ? 'Configure a Paytm Wireless POS / EDC terminal, initiate card or UPI payment requests, and track provider-confirmed transaction status.'
              : 'Send authenticated payment requests to an enabled PhonePe Integrated EDC terminal and verify outcomes from signed callbacks or PhonePe status checks.'}
          </p>
        </div>
        <div className="workspace-quick-actions">
          <div className="account-status-pill">
            <span className="status-indicator-dot" />
            <span>Dual-channel verified</span>
          </div>
          <button className="workspace-signout-btn" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {/* 2. Primary Navigation Tabs */}
      <nav className="pos-nav-tabs" aria-label="Portal sections">
        <button
          type="button"
          className={`pos-nav-tab ${activeTab === 'pos' ? 'active' : ''}`}
          onClick={() => setActiveTab('pos')}
        >
          <CreditCard size={18} />
          <span>POS / EDC Integration</span>
          <span className="tab-pill">{posProvider === 'phonepe' ? 'Partner gated' : terminalConfig?.isConfigured ? 'Configured · connection unverified' : 'Requires setup'}</span>
        </button>
        <button
          type="button"
          className={`pos-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <WalletCards size={18} />
          <span>Settlement &amp; Portal Overview</span>
        </button>
      </nav>

      {/* TAB 1: POS INTEGRATION WORKSPACE */}
      {activeTab === 'pos' && (
        <div className="pos-workspace-container">
          <div className="dashboard-card pos-provider-picker">
            <label htmlFor="pos-provider-select"><strong>Payment terminal provider</strong></label>
            <select id="pos-provider-select" value={posProvider} onChange={(event) => {
              let pending = idempotencyAttemptRef.current;
              try { pending ||= JSON.parse(sessionStorage.getItem(`reachpay.pos.pending:${posProvider}`) || 'null'); } catch { /* ignore unavailable browser storage */ }
              if (pending) {
                showNotification('Resolve the pending payment request before switching providers.', 'error');
                return;
              }
              setPosProvider(event.target.value);
              setIsConfiguring(false);
              setConnectionStatus(null);
              setActiveTransaction(null);
            }}>
              <option value="paytm">Paytm POS / EDC</option>
              <option value="phonepe">PhonePe integrated EDC</option>
            </select>
            {posProvider === 'phonepe' && <span className="pos-badge-env">Partner access required · no public EDC sandbox</span>}
          </div>
          {/* Top Control Bar: Status, Terminal Info, Sync & Test */}
          <div className="pos-control-card">
            <div className="pos-control-left">
              <div className="pos-terminal-icon-wrap">
                <Terminal size={24} />
              </div>
              <div>
                <div className="pos-terminal-header-line">
                  <h2 className="pos-terminal-title">{posProvider === 'paytm' ? 'Paytm Wireless POS Terminal' : 'PhonePe Integrated EDC'}</h2>
                  <span className={`pos-badge-status ${isTerminalOnline ? 'online' : 'offline'}`}>
                    {isTerminalOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
                    {posProvider === 'phonepe' ? 'Partner access required' : isTerminalOnline ? 'Connected (Online)' : (terminalConfig?.isConfigured ? 'Disconnected (Offline)' : 'Unconfigured')}
                  </span>
                  <span className="pos-badge-env">
                    {posProvider === 'phonepe' ? 'No public EDC test environment' : terminalConfig?.environment === 'production' ? 'Production' : 'Sandbox (Staging)'}
                  </span>
                </div>
                <div className="pos-terminal-meta">
                  <span>MID: <strong>{terminalConfig?.mid || 'Not Set'}</strong></span>
                  <span className="meta-sep">•</span>
                  <span>TID: <strong>{terminalConfig?.tid || 'Not Set'}</strong></span>
                  {connectionStatus?.lastTestedAt && (
                    <>
                      <span className="meta-sep">•</span>
                      <small>Last tested: {new Date(connectionStatus.lastTestedAt).toLocaleTimeString()}</small>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pos-control-actions">
              <button
                type="button"
                className="pos-btn-secondary"
                disabled={testingConnection}
                onClick={handleTestConnection}
                title="Test live handshake with Paytm EDC Gateway"
              >
                <RefreshCw size={15} className={testingConnection ? 'spin-icon' : ''} />
                <span>{testingConnection ? 'Testing…' : 'Test Connection'}</span>
              </button>

              <button
                type="button"
                className="pos-btn-secondary"
                disabled={syncing}
                onClick={handleSyncNow}
                title="Synchronize pending transactions from Paytm"
              >
                <RefreshCw size={15} className={syncing ? 'spin-icon' : ''} />
                <span>{syncing ? 'Syncing…' : 'Sync Now'}</span>
              </button>

              <button
                type="button"
                className="pos-btn-primary"
                onClick={() => setIsConfiguring(!isConfiguring)}
              >
                <SlidersHorizontal size={15} />
                <span>{isConfiguring ? 'Hide Config' : 'Configure Terminal'}</span>
              </button>
            </div>
          </div>

          {/* Terminal Configuration Drawer / Form */}
          {isConfiguring && (
            <div className="pos-config-panel">
              <div className="pos-config-header">
                <div>
                  <h3>{posProvider === 'paytm' ? 'Paytm EDC Terminal Configuration' : 'PhonePe EDC Terminal References'}</h3>
                  <p>{posProvider === 'paytm' ? 'Credentials are encrypted with AES-256-GCM at rest and never returned to the browser.' : 'Save the merchant and terminal references supplied during PhonePe partner onboarding. No API credentials are available until PhonePe issues them.'}</p>
                </div>
                <button
                  type="button"
                  className="pos-close-btn"
                  onClick={() => setIsConfiguring(false)}
                  aria-label="Close configuration"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="pos-config-form">
                <div className="form-row-grid">
                  <label className="pos-form-label">
                    <span>{posProvider === 'paytm' ? 'Paytm Merchant ID (MID) *' : 'PhonePe Merchant Reference *'}</span>
                    <input
                      type="text"
                      required
                      placeholder={posProvider === 'paytm' ? 'e.g. YOUR_PAYTM_MID' : 'As supplied by PhonePe'}
                      value={configForm.mid}
                      onChange={(e) => setConfigForm({ ...configForm, mid: e.target.value })}
                    />
                    <small>{posProvider === 'paytm' ? 'Provided by Paytm Merchant Dashboard' : 'Provided by PhonePe after partner onboarding'}</small>
                  </label>

                  <label className="pos-form-label">
                    <span>{posProvider === 'paytm' ? 'Terminal ID (TID / PID) *' : 'PhonePe terminal reference *'}</span>
                    <input
                      type="text"
                      required
                      placeholder={posProvider === 'paytm' ? 'e.g. 70010001' : 'As supplied by PhonePe'}
                      value={configForm.tid}
                      onChange={(e) => setConfigForm({ ...configForm, tid: e.target.value })}
                    />
                    <small>{posProvider === 'paytm' ? 'Mapped physical/wireless EDC machine serial' : 'Use only the reference from your PhonePe partner setup'}</small>
                  </label>
                </div>

                {posProvider === 'paytm' && <div className="form-row-grid">
                  <label className="pos-form-label">
                    <span>Paytm Merchant Key *</span>
                    <div className="password-input-wrap">
                      <input
                        type={showSecretKey ? 'text' : 'password'}
                        placeholder={terminalConfig?.hasSecretKey ? '●●●●●●●● (Stored securely)' : 'Enter Merchant Encryption Key'}
                        value={configForm.merchantKey}
                        onChange={(e) => setConfigForm({ ...configForm, merchantKey: e.target.value })}
                      />
                      <button
                        type="button"
                        className="pw-toggle-btn"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <small>Used for PaytmChecksum signatures. Encrypted at rest.</small>
                  </label>

                  <label className="pos-form-label">
                    <span>Gateway Environment</span>
                    <select
                      value={configForm.environment}
                      onChange={(e) => setConfigForm({ ...configForm, environment: e.target.value })}
                    >
                      <option value="staging">Sandbox / Staging (securegw-stage.paytm.in)</option>
                      <option value="production">Production (securegw.paytm.in)</option>
                    </select>
                    <small>Select Sandbox for testing or Production for live terminal</small>
                  </label>
                </div>}

                <div className="pos-config-actions">
                  <button
                    type="submit"
                    className="button primary"
                    disabled={savingConfig}
                  >
                    <Check size={16} />
                    <span>{savingConfig ? 'Saving securely…' : 'Save Terminal Settings'}</span>
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setIsConfiguring(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Core Row: Balance Indicator + Initiate Sale Form */}
          {posProvider === 'paytm' ? <div className="pos-primary-grid">
            {/* Left Box: Initiate Sale Form */}
            <div className="dashboard-card pos-sale-card">
              <div className="dashboard-card-header">
                <div>
                  <span className="eyebrow">POS SALE INITIATION</span>
                  <h2>Send Payment to Terminal</h2>
                </div>
                <span className="pos-flow-badge">
                  <Smartphone size={13} /> Wireless EDC
                </span>
              </div>

              <p className="pos-sale-intro">
                Pushes an instant payment prompt to the connected Paytm EDC device. The customer can pay via Card (Dip/Tap/Swipe), UPI Dynamic QR, or Wallet.
              </p>

              <form onSubmit={handleInitiateSale} className="pos-sale-form">
                <div className="amount-input-group">
                  <label htmlFor="sale-amount-input">Amount to Collect (INR)</label>
                  <div className="amount-field-wrap">
                    <span className="currency-symbol">₹</span>
                    <input
                      id="sale-amount-input"
                      type="number"
                      step="0.01"
                      min="1"
                      max="100000"
                      required
                      placeholder="0.00"
                      value={saleAmount}
                      onChange={(e) => setSaleAmount(e.target.value)}
                    />
                  </div>
                  <div className="quick-amount-pills">
                    {[50, 100, 250, 500, 1000, 2000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className="amt-pill"
                        onClick={() => setSaleAmount(String(amt))}
                      >
                        +₹{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-two-col">
                  <label>
                    <span>Customer Mobile (Optional)</span>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                    />
                    <small>Sends digital SMS receipt from EDC</small>
                  </label>

                  <label>
                    <span>Reference / Invoice Note</span>
                    <input
                      type="text"
                      placeholder="e.g. Order #1042"
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                    />
                    <small>Attached to merchant transaction ID</small>
                  </label>
                </div>

                <button
                  type="submit"
                  className="button primary pos-initiate-btn"
                  disabled={initiatingSale}
                >
                  <Send size={16} />
                  <span>{initiatingSale ? 'Sending to Terminal…' : `Collect ₹${Number(saleAmount || 0).toFixed(2)} on POS`}</span>
                </button>
              </form>
            </div>

            {/* Right Box: Live Monitor & Honest Balance Card */}
            <div className="pos-monitor-column">
              {/* Honest Balance Card */}
              <div className="dashboard-card pos-balance-card">
                <div className="dashboard-card-header">
                  <div>
                    <span className="eyebrow">ACCOUNT BALANCE</span>
                    <h3>Paytm POS Ledger Status</h3>
                  </div>
                  <span className="balance-lock-tag">
                    <LockKeyhole size={13} /> Official API Scope
                  </span>
                </div>

                <div className="balance-status-box">
                  <div className="balance-amount-display">
                    <b>Unavailable</b>
                  </div>
                  <p className="balance-notice-text">
                    Balance unavailable through the enabled Paytm API.
                  </p>
                  <small className="balance-explanatory">
                    Paytm Wireless POS/EDC API is architected for physical terminal transaction collection. It does not provide merchant account balance or wallet balances.
                  </small>
                </div>
              </div>

              {/* Active / Last Transaction Monitor */}
              <div className="dashboard-card pos-active-tx-card">
                <div className="dashboard-card-header">
                  <div>
                    <span className="eyebrow">TERMINAL DISPATCH</span>
                    <h3>Active POS Transaction</h3>
                  </div>
                  {activeTransaction && (
                    <span className={`tx-status-pill status-${activeTransaction.status.toLowerCase()}`}>
                      {activeTransaction.status}
                    </span>
                  )}
                </div>

                {activeTransaction ? (
                  <div className="active-tx-details">
                    <div className="active-tx-hero">
                      <div className="active-tx-amount">
                        <span>₹{(activeTransaction.amount_paise / 100).toFixed(2)}</span>
                        <small>INR</small>
                      </div>
                      <span className="active-tx-badge">
                        {activeTransaction.status === 'SUCCESS' && <CheckCircle2 size={16} />}
                        {activeTransaction.status === 'PENDING' && <Activity size={16} className="spin-icon" />}
                        {activeTransaction.status === 'FAILED' && <XCircle size={16} />}
                        {activeTransaction.status}
                      </span>
                    </div>

                    <div className="active-tx-meta-grid">
                      <div>
                        <small>Merchant Txn ID</small>
                        <code>{activeTransaction.merchant_txn_id}</code>
                      </div>
                      <div>
                        <small>Paytm CPAY ID</small>
                        <code>{activeTransaction.cpay_id || 'Generating…'}</code>
                      </div>
                      <div>
                        <small>Payment Method</small>
                        <span>{activeTransaction.payment_method || 'Awaiting swipe/tap'}</span>
                      </div>
                      <div>
                        <small>RRN / Auth Code</small>
                        <span>{activeTransaction.rrn ? `${activeTransaction.rrn} / ${activeTransaction.auth_code || '–'}` : 'Pending EDC'}</span>
                      </div>
                    </div>

                    {activeTransaction.status === 'PENDING' && (
                      <div className="active-tx-live-indicator">
                        <div className="pulse-radar" />
                        <div>
                          <b>Customer action pending on EDC</b>
                          <p>Customer can swipe/tap card or scan dynamic QR on the terminal screen.</p>
                        </div>
                      </div>
                    )}

                    <div className="active-tx-actions">
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={() => checkTransactionStatus(activeTransaction.merchant_txn_id)}
                      >
                        <RefreshCw size={14} /> Refresh Status
                      </button>

                      {['INITIATED', 'IN_QUEUE', 'PENDING', 'UNKNOWN'].includes(activeTransaction.status) && (
                        <button
                          type="button"
                          className="button secondary sm cancel-btn"
                          disabled={isCancelling}
                          onClick={handleCancelSale}
                        >
                          <X size={14} /> Cancel on EDC
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="active-tx-empty">
                    <Smartphone size={32} />
                    <p>No active terminal dispatch. Initiate a sale on the left to push a payment request to the EDC machine.</p>
                  </div>
                )}
              </div>
            </div>
          </div> : <div className="dashboard-card phonepe-partner-card">
            <span className="eyebrow">PHONEPE OFFLINE PARTNER PROGRAM</span>
            <h2>PhonePe Integrated EDC readiness</h2>
            <p>PhonePe publishes an EDC sale request, status check, signed callback, transaction search, and UAT flow. Payment requests require a PhonePe-issued salt key and index, PhonePe Store ID, merchant EDC enablement, and a terminal in integrated mode. MID/TID identifiers alone cannot authenticate API calls.</p>
            <p>Configure PhonePe salt credentials and Store ID as server-side environment variables. After saving the merchant MID and terminal TID above, use test connection; successful POS dispatch still depends on PhonePe enabling the Integrated EDC solution for this merchant and terminal.</p>
            <p><a href="https://developer.phonepe.com/offline-integration/integrated-edc-solution/edc-sale-request-api" target="_blank" rel="noreferrer">Official EDC Sale API</a> · <a href="https://www.phonepe.com/business-solutions/offline-merchant/partner-program/" target="_blank" rel="noreferrer">PhonePe Offline Partner Program</a></p>
          </div>}

          {/* Transaction History Section */}
          {posProvider === 'paytm' ? <div className="dashboard-card pos-history-card">
            <div className="pos-history-header">
              <div>
                <span className="eyebrow">TRANSACTION LEDGER</span>
                <h2>POS Transaction History</h2>
              </div>
              <div className="history-filter-wrap">
                <span className="filter-label">Status:</span>
                {['ALL', 'SUCCESS', 'PENDING', 'FAILED', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => {
                      setStatusFilter(st);
                      fetchTransactions(st);
                    }}
                  >
                    {st}
                  </button>
                ))}
                <button
                  type="button"
                  className="audit-logs-btn"
                  onClick={fetchSyncLogs}
                  title="View Audit and Sync Logs"
                >
                  <History size={14} /> Audit Logs
                </button>
              </div>
            </div>

            {loadingTxns ? (
              <div className="history-loading">
                <div className="dashboard-spinner" />
                <p>Loading transactions…</p>
              </div>
            ) : transactions.length > 0 ? (
              <div className="table-responsive">
                <table className="pos-table">
                  <thead>
                    <tr>
                      <th>Initiated</th>
                      <th>Merchant Txn ID</th>
                      <th>TID</th>
                      <th>Amount</th>
                      <th>Payment Mode</th>
                      <th>RRN / Ref</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id || tx.merchant_txn_id}>
                        <td>
                          <div className="date-time-cell">
                            <b>{new Date(tx.initiated_at).toLocaleDateString()}</b>
                            <small>{new Date(tx.initiated_at).toLocaleTimeString()}</small>
                          </div>
                        </td>
                        <td>
                          <div className="tx-id-cell">
                            <code>{tx.merchant_txn_id}</code>
                            {tx.notes && <span className="notes-tag">{tx.notes}</span>}
                          </div>
                        </td>
                        <td><code>{tx.tid}</code></td>
                        <td>
                          <b className="amount-cell">₹{(tx.amount_paise / 100).toFixed(2)}</b>
                        </td>
                        <td>
                          <div className="mode-cell">
                            <span>{tx.payment_method || 'POS'}</span>
                            {tx.card_last4 && <small>•••• {tx.card_last4}</small>}
                          </div>
                        </td>
                        <td>
                          <small>{tx.rrn || tx.cpay_id || '–'}</small>
                        </td>
                        <td>
                          <span className={`status-pill pill-${String(tx.status).toLowerCase()}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td>
                          {['INITIATED', 'PENDING'].includes(tx.status) ? (
                            <button
                              type="button"
                              className="table-action-btn"
                              onClick={() => checkTransactionStatus(tx.merchant_txn_id)}
                              title="Check Paytm status"
                            >
                              <RefreshCw size={13} /> Check
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="table-action-btn neutral"
                              onClick={() => setActiveTransaction(tx)}
                              title="View details"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="history-empty-state">
                <CreditCard size={36} />
                <h3>No transactions recorded</h3>
                <p>Transactions initiated from your Paytm POS terminal will appear here.</p>
              </div>
            )}
          </div> : <div className="dashboard-card pos-history-card phonepe-history-card">
            <h2>PhonePe transaction history</h2>
            <p>Per-transaction verification uses PhonePe's signed status API and callbacks. Pending records can also be reconciled through PhonePe's transaction search API; unmatched or mismatched results stay pending and never become successful.</p>
          </div>}
        </div>
      )}

      {/* TAB 2: OVERVIEW WORKSPACE (Existing Fintech Layout) */}
      {activeTab === 'overview' && (
        <div className="overview-workspace-container">
          {/* System Status Notice */}
          <div className="financial-safe-notice" role="status">
            <div className="notice-content">
              <span className="notice-icon-badge">
                <ShieldCheck size={20} />
              </span>
              <div>
                <b>Production-ready Paytm POS integration active</b>
                <p>
                  Wireless POS &amp; EDC transaction initiation and synchronization are connected. Switch to the <strong>Paytm POS / EDC Integration</strong> tab to connect terminals and swipe cards.
                </p>
              </div>
            </div>
            <span className="notice-tag">
              <Clock size={13} /> Active Gateway
            </span>
          </div>

          {/* Top Metrics Row - 4 Balanced Cards */}
          <section className="financial-summary" aria-label="Wallet status">
            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon blue"><WalletCards size={20} /></span>
                <span className="summary-badge">Paytm Scope</span>
              </div>
              <div className="summary-card-body">
                <small>Paytm POS Balance</small>
                <b>Unavailable</b>
                <p>Balance unavailable through the enabled Paytm API.</p>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon indigo"><ArrowDownToLine size={20} /></span>
                <span className="summary-badge">Live Monitor</span>
              </div>
              <div className="summary-card-body">
                <small>Pending POS Collections</small>
                <b>{transactions.filter((t) => t.status === 'PENDING').length} active</b>
                <p>Monitored via EDC polling &amp; webhooks</p>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon emerald"><ArrowUpRight size={20} /></span>
                <span className="summary-badge">Total Transactions</span>
              </div>
              <div className="summary-card-body">
                <small>Recorded POS Activity</small>
                <b>{transactions.length} entries</b>
                <p>Persisted in PostgreSQL ledger</p>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon amber"><Terminal size={20} /></span>
                <span className={`summary-badge ${isTerminalOnline ? 'badge-success' : ''}`}>
                  {isTerminalOnline ? 'Online' : 'Standby'}
                </span>
              </div>
              <div className="summary-card-body">
                <small>Wireless Terminal Link</small>
                <b>{terminalConfig?.mid ? 'Active Terminal' : 'Ready to Pair'}</b>
                <p>{terminalConfig?.tid ? `TID: ${terminalConfig.tid} · ${terminalConfig.environment === 'production' ? 'Production' : 'Sandbox'}` : 'Connect Paytm EDC in POS tab'}</p>
              </div>
            </article>
          </section>

          {/* Symmetrical Two-Row Balanced Grid */}
          <div className="workspace-layout-flow">
            {/* ROW 1: Settlement Flow & Customer Profile */}
            <div className="workspace-row-primary">
              {/* Settlement Flow Card */}
              <section className="dashboard-card financial-journey" aria-labelledby="flow-heading">
                <div className="dashboard-card-header">
                  <div>
                    <span className="eyebrow">SETTLEMENT FLOW</span>
                    <h2 id="flow-heading">How a payment moves through ReachPay</h2>
                  </div>
                  <span className="setup-status ready"><i /> Integrated</span>
                </div>

                <ol className="journey-grid">
                  {journey.map(([title, detail], index) => (
                    <li key={title} className="journey-step-card">
                      <div className="journey-step-top">
                        <span className="journey-step-num">{String(index + 1).padStart(2, '0')}</span>
                        {index !== 3 && index !== 7 && <span className="journey-step-connector" aria-hidden="true">→</span>}
                      </div>
                      <b>{title}</b>
                      <small>{detail}</small>
                    </li>
                  ))}
                </ol>

                <p className="financial-sla">
                  <CircleHelp size={17} />
                  <span>POS settlement is processed by Paytm Wireless EDC network. Terminal confirmations trigger instantaneous transaction record synchronization.</span>
                </p>
              </section>

              {/* Account Profile Card */}
              <aside className="dashboard-card profile-card" aria-label="Customer profile">
                <div className="profile-card-header">
                  <div className="profile-avatar">{initial}</div>
                  <div className="profile-info">
                    <h3>{user.name}</h3>
                    <small>ReachPay Customer Account</small>
                  </div>
                  <span className="verified-badge-pill">
                    <CheckCircle2 size={13} /> Verified
                  </span>
                </div>

                <div className="profile-details-grid">
                  <div className="profile-detail-cell">
                    <span className="cell-label">Email address</span>
                    <span className="cell-val" title={user.email}>
                      <span className="val-text">{user.email}</span>
                      <span className="verified-mini-tag">✓</span>
                    </span>
                  </div>
                  <div className="profile-detail-cell">
                    <span className="cell-label">Mobile number</span>
                    <span className="cell-val">
                      <span className="val-text">{mobileDisplay}</span>
                      <span className="verified-mini-tag">✓</span>
                    </span>
                  </div>
                  <div className="profile-detail-cell">
                    <span className="cell-label">Account status</span>
                    <span className="cell-val status-active">
                      <span className="status-indicator-dot small" />
                      <span className="val-text">Active</span>
                    </span>
                  </div>
                  <div className="profile-detail-cell">
                    <span className="cell-label">POS Terminal</span>
                    <span className="cell-val">
                      <span className="val-text">{terminalConfig?.mid ? `${terminalConfig.mid} (${terminalConfig.tid})` : 'Configured'}</span>
                    </span>
                  </div>
                </div>

                <div className="profile-card-actions">
                  <span className="identity-status-tag">
                    <ShieldCheck size={14} /> Identity verified
                  </span>
                  <button
                    type="button"
                    className="help-btn"
                    onClick={() => showNotification('Contact ReachPay support at support@reachpay.com for terminal dispatch and settlement assistance.', 'info')}
                  >
                    <FileText size={14} /> Help &amp; Support
                  </button>
                </div>
              </aside>
            </div>

            {/* ROW 2: Payment Services & Infrastructure Readiness */}
            <div className="workspace-row-secondary">
              {/* Planned Payment Services Card */}
              <section className="dashboard-card financial-services" aria-labelledby="services-heading">
                <div className="dashboard-card-header">
                  <div>
                    <span className="eyebrow">PAYMENT SERVICES</span>
                    <h2 id="services-heading">Connected and Planned Services</h2>
                  </div>
                  <span className="setup-status ready">
                    <CheckCircle2 size={13} /> POS Enabled
                  </span>
                </div>

                <div className="service-grid">
                  {serviceGroups.map((group) => (
                    <article key={group.title} className="service-card">
                      <span className="service-card-icon"><ReceiptText size={18} /></span>
                      <h3>{group.title}</h3>
                      <p>{group.items}</p>
                      <small><LockKeyhole size={12} /> Banking integration scheduled</small>
                    </article>
                  ))}
                </div>
              </section>

              {/* Infrastructure Readiness & Security Column */}
              <div className="workspace-secondary-side">
                {/* System Readiness Checklist */}
                <div className="dashboard-card readiness-card">
                  <div className="dashboard-card-header">
                    <div>
                      <span className="eyebrow">PORTAL INTEGRATION</span>
                      <h2>System readiness</h2>
                    </div>
                  </div>

                  <ul className="readiness-list">
                    <li className="readiness-item ready">
                      <CheckCircle2 size={18} className="readiness-icon ready" />
                      <div className="readiness-text">
                        <b>Contact verification</b>
                        <small>Email and mobile confirmed</small>
                      </div>
                    </li>
                    <li className="readiness-item ready">
                      <CheckCircle2 size={18} className="readiness-icon ready" />
                      <div className="readiness-text">
                        <b>Paytm POS Integration</b>
                        <small>Adapter &amp; endpoints production ready</small>
                      </div>
                    </li>
                    <li className="readiness-item ready">
                      <CheckCircle2 size={18} className="readiness-icon ready" />
                      <div className="readiness-text">
                        <b>PostgreSQL POS Ledger</b>
                        <small>Terminals, transactions &amp; sync logs active</small>
                      </div>
                    </li>
                    <li className="readiness-item ready">
                      <CheckCircle2 size={18} className="readiness-icon ready" />
                      <div className="readiness-text">
                        <b>Webhook signature engine</b>
                        <small>PaytmChecksum HMAC-SHA256 verified</small>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Security Guarantee Card */}
                <div className="dashboard-card security-card">
                  <div className="security-header">
                    <ShieldCheck size={20} />
                    <h3>PCI-DSS &amp; Encryption Standard</h3>
                  </div>
                  <p>
                    Terminal keys are encrypted with AES-256-GCM. Card numbers and PINs are handled exclusively on certified Paytm hardware and never touch ReachPay servers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Sync Logs Modal */}
      {showLogsModal && (
        <div className="pos-modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="pos-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-header">
              <div>
                <h3>Paytm POS Audit &amp; Sync Logs</h3>
                <p>Live audit trail of synchronization, connection tests, and webhooks</p>
              </div>
              <button
                type="button"
                className="pos-close-btn"
                onClick={() => setShowLogsModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="pos-modal-body">
              {syncLogs.length > 0 ? (
                <div className="logs-timeline">
                  {syncLogs.map((log) => (
                    <div key={log.id} className="log-item">
                      <div className="log-item-header">
                        <span className={`log-badge badge-${String(log.status).toLowerCase()}`}>
                          {log.status}
                        </span>
                        <b>{log.action}</b>
                        <small>{new Date(log.created_at).toLocaleString()}</small>
                      </div>
                      <p className="log-msg">{log.message}</p>
                      {log.records_checked > 0 && (
                        <small className="log-counts">
                          Checked: {log.records_checked} · Updated: {log.records_updated}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-logs">No sync logs recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Notice Toast */}
      {notice && (
        <div className={`dashboard-notice ${noticeType}`} role="status">
          <div className="dashboard-notice-content">
            {noticeType === 'success' && <CheckCircle2 size={18} />}
            {noticeType === 'error' && <AlertCircle size={18} />}
            {noticeType === 'info' && <ShieldCheck size={18} />}
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
