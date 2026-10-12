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
  ['POS request', 'Start a payment on a configured terminal'],
  ['Provider result', 'Record a provider-confirmed transaction state'],
  ['Settlement evidence', 'Show provider settlement data when available'],
  ['Merchant bank', 'Settlement goes to the provider-linked bank account'],
];

export default function FinancialWorkspace({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('pos');
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [beneficiaryQuery, setBeneficiaryQuery] = useState('');
  const [beneficiaryForm, setBeneficiaryForm] = useState({ name: '', accountNumber: '', ifsc: '' });
  const [editingBeneficiary, setEditingBeneficiary] = useState(null);
  const [beneficiaryNotice, setBeneficiaryNotice] = useState('');
  const [beneficiaryBusy, setBeneficiaryBusy] = useState(false);
  const [bankingStatus, setBankingStatus] = useState(null);
  const [financialDashboard, setFinancialDashboard] = useState(null);
  const [financialDashboardError, setFinancialDashboardError] = useState('');
  const [financialDashboardLoading, setFinancialDashboardLoading] = useState(false);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [serviceBillers, setServiceBillers] = useState([]);
  const [serviceParameters, setServiceParameters] = useState([]);
  const [serviceCategory, setServiceCategory] = useState('');
  const [serviceBiller, setServiceBiller] = useState('');
  const [serviceLoading, setServiceLoading] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [rechargeMobile, setRechargeMobile] = useState('');
  const [rechargeData, setRechargeData] = useState(null);
  const [transferOrganizations, setTransferOrganizations] = useState([]);
  const [transferOrganizationId, setTransferOrganizationId] = useState('');
  const [transferMembers, setTransferMembers] = useState([]);
  const [transferLimits, setTransferLimits] = useState([]);
  const [transferSenders, setTransferSenders] = useState([]);
  const [transferApprovals, setTransferApprovals] = useState([]);
  const [transferBeneficiaries, setTransferBeneficiaries] = useState([]);
  const [transferFundingSources, setTransferFundingSources] = useState([]);
  const [transferProviderData, setTransferProviderData] = useState(null);
  const [transferHistory, setTransferHistory] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferNotice, setTransferNotice] = useState('');
  const [transferOrgName, setTransferOrgName] = useState('');
  const [transferMemberEmail, setTransferMemberEmail] = useState('');
  const [transferMemberRole, setTransferMemberRole] = useState('MAKER');
  const [transferLimitForm, setTransferLimitForm] = useState({ serviceType: 'BANK_TRANSFER', maxPerTransactionPaise: '', maxPerDayPaise: '', maxPerMonthPaise: '' });
  const [transferLimitUserId, setTransferLimitUserId] = useState('');
  const [transferSenderForm, setTransferSenderForm] = useState({ fullName: '', mobile: '', consent: false });
  const [transferProduct, setTransferProduct] = useState('THIRD_PARTY');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSenderId, setTransferSenderId] = useState('');
  const [transferBeneficiaryId, setTransferBeneficiaryId] = useState('');
  const [transferFundingSourceId, setTransferFundingSourceId] = useState('');
  const [transferRequest, setTransferRequest] = useState(null);
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
    storeId: '',
    externalMid: '',
    externalTid: '',
    environment: 'staging',
    clientId: 'reachpay',
  });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Connection state
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
  const accountContactVerified = Boolean(user?.emailVerified && user?.mobileVerified);

  const loadFinancialDashboard = useCallback(async () => {
    setFinancialDashboardLoading(true);
    setFinancialDashboardError('');
    try {
      const response = await fetch('/api/financial/dashboard');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'Dashboard data is unavailable.');
      setFinancialDashboard(payload);
    } catch (error) { setFinancialDashboardError(error.message); }
    finally { setFinancialDashboardLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== 'overview') return undefined;
    const timer = window.setTimeout(() => { void loadFinancialDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadFinancialDashboard]);

  const loadServices = useCallback(async () => {
    setServiceLoading(true); setServiceError('');
    try {
      const [statusResponse, categoriesResponse] = await Promise.all([
        fetch('/api/financial/services/status'), fetch('/api/financial/services/categories'),
      ]);
      const [statusData, categoriesData] = await Promise.all([statusResponse.json(), categoriesResponse.json()]);
      if (!statusResponse.ok) throw new Error(statusData.error || 'Service status is unavailable.');
      if (!categoriesResponse.ok) throw new Error(categoriesData.error || 'Provider catalog is unavailable.');
      setServiceStatus(statusData); setServiceCategories(categoriesData.categories || []);
    } catch (error) { setServiceError(error.message); }
    finally { setServiceLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== 'services') return undefined;
    const timer = window.setTimeout(() => { void loadServices(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadServices]);

  const loadTransferDetails = useCallback(async (organizationId) => {
    if (!organizationId) return;
    setTransferLoading(true); setTransferNotice('');
    try {
      const [members, limits, senders, approvals, beneficiaries, funding, provider, dmtHistory, bankHistory] = await Promise.all([
        fetch(`/api/financial/organizations/${organizationId}/members`),
        fetch(`/api/financial/organizations/${organizationId}/limits`),
        fetch(`/api/financial/organizations/${organizationId}/senders`),
        fetch(`/api/financial/organizations/${organizationId}/approvals`),
        fetch('/api/banking/beneficiaries'),
        fetch('/api/financial/funding-sources'),
        fetch('/api/financial/providers'),
        fetch('/api/financial/transactions?type=DMT&limit=50'),
        fetch('/api/financial/transactions?type=BANK_TRANSFER&limit=50'),
      ]);
      const payloads = await Promise.all([members, limits, senders, approvals, beneficiaries, funding, provider, dmtHistory, bankHistory].map((response) => response.json()));
      if (!members.ok && members.status !== 403) throw new Error(payloads[0].error || 'Organization members are unavailable.');
      if (!limits.ok && limits.status !== 403) throw new Error(payloads[1].error || 'Transfer limits are unavailable.');
      setTransferMembers(payloads[0].members || []); setTransferLimits(payloads[1].limits || []);
      setTransferSenders(payloads[2].senders || []); setTransferApprovals(payloads[3].approvals || []);
      setTransferBeneficiaries(payloads[4].beneficiaries || []); setTransferFundingSources(payloads[5].fundingSources || []); setTransferProviderData(payloads[6]);
      setTransferHistory([...(payloads[7].transactions || []), ...(payloads[8].transactions || [])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  }, []);

  const loadTransferOrganizations = useCallback(async () => {
    setTransferLoading(true); setTransferNotice('');
    try {
      const response = await fetch('/api/financial/organizations'); const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Organizations are unavailable.');
      const rows = payload.organizations || []; setTransferOrganizations(rows);
      const selected = rows.some((item) => item.id === transferOrganizationId) ? transferOrganizationId : rows[0]?.id || '';
      setTransferOrganizationId(selected);
      if (selected) await loadTransferDetails(selected);
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  }, [loadTransferDetails, transferOrganizationId]);

  useEffect(() => {
    if (activeTab !== 'transfers') return undefined;
    const timer = window.setTimeout(() => { void loadTransferOrganizations(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadTransferOrganizations]);

  const syncServiceCatalog = async () => {
    setServiceLoading(true); setServiceError('');
    try {
      const response = await fetch('/api/financial/services/catalog/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.status || 'Catalog sync is unavailable.');
      await loadServices();
    } catch (error) { setServiceError(error.message); }
    finally { setServiceLoading(false); }
  };

  const loadServiceBillers = async (categoryId) => {
    setServiceCategory(categoryId); setServiceBiller(''); setServiceParameters([]); setServiceBillers([]);
    try {
      const response = await fetch(`/api/financial/services/categories/${encodeURIComponent(categoryId)}/billers`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Biller list is unavailable.');
      if (!payload.billers.length) {
        const sync = await fetch('/api/financial/services/categories/sync-billers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId }) });
        const syncData = await sync.json();
        if (!sync.ok) throw new Error(syncData.error || syncData.status || 'Biller catalog is not synchronized.');
        setServiceBillers((await (await fetch(`/api/financial/services/categories/${encodeURIComponent(categoryId)}/billers`)).json()).billers || []);
      } else setServiceBillers(payload.billers);
    } catch (error) { setServiceError(error.message); }
  };

  const loadServiceParameters = async (billerId) => {
    setServiceBiller(billerId); setServiceParameters([]);
    try {
      const response = await fetch(`/api/financial/services/billers/${encodeURIComponent(billerId)}/parameters`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Biller parameters are unavailable.');
      setServiceParameters(payload.parameters || []);
    } catch (error) { setServiceError(error.message); }
  };

  const createTransferOrganization = async (event) => {
    event.preventDefault(); setTransferLoading(true); setTransferNotice('');
    try {
      const response = await fetch('/api/financial/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legalName: transferOrgName }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Organization could not be created.');
      setTransferOrgName(''); setTransferOrganizationId(payload.organization.id); setTransferNotice('Organization created. You are the owner. Configure limits before requesting approval.');
      await loadTransferOrganizations();
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  };

  const addTransferMember = async (event) => {
    event.preventDefault(); if (!transferOrganizationId) return;
    setTransferLoading(true); setTransferNotice('');
    try {
      const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: transferMemberEmail, role: transferMemberRole }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Member could not be added.');
      setTransferMemberEmail(''); setTransferNotice('Existing ReachPay account added to the organization.'); await loadTransferDetails(transferOrganizationId);
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  };

  const saveTransferLimit = async (event) => {
    event.preventDefault(); if (!transferOrganizationId) return;
    setTransferLoading(true); setTransferNotice('');
    try {
      const limit = Object.fromEntries(Object.entries(transferLimitForm).map(([key, value]) => [key, key === 'serviceType' ? value : Number(value)]));
      const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/limits`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...limit, userId: transferLimitUserId || null }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Limit could not be saved.');
      setTransferNotice('Merchant limit saved. This does not replace provider or regulatory limits.'); await loadTransferDetails(transferOrganizationId);
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  };

  const registerTransferSender = async (event) => {
    event.preventDefault(); if (!transferOrganizationId) return;
    setTransferLoading(true); setTransferNotice('');
    try {
      const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/senders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...transferSenderForm, consentVersion: 'reachpay-dmt-consent-v1' }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Sender could not be registered.');
      setTransferSenderForm({ fullName: '', mobile: '', consent: false }); setTransferNotice('Sender record saved. KYC and OTP are still provider-unverified.'); await loadTransferDetails(transferOrganizationId);
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  };

  const requestSenderOtp = async (senderId) => {
    if (!transferOrganizationId) return;
    const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/senders/${senderId}/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await response.json(); setTransferNotice(payload.error || 'Provider OTP is unavailable. No code was sent.'); await loadTransferDetails(transferOrganizationId);
  };

  const requestSenderKyc = async (senderId) => {
    if (!transferOrganizationId) return;
    const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/senders/${senderId}/kyc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await response.json(); setTransferNotice(payload.kycRequest?.blocker_code || payload.error || 'DMT KYC provider is unavailable. No verification was claimed.'); await loadTransferDetails(transferOrganizationId);
  };

  const requestBeneficiaryVerification = async (beneficiaryId) => {
    if (!transferOrganizationId) return;
    const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/beneficiaries/${beneficiaryId}/verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await response.json(); setTransferNotice(payload.verification?.blocker_code || payload.error || 'Verification provider is unavailable. No paid check was started.'); await loadTransferDetails(transferOrganizationId);
  };

  const createTransferRequest = async (event) => {
    event.preventDefault(); if (!transferOrganizationId) return;
    const amount = String(transferAmount).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setTransferNotice('Enter an amount with up to two decimal places.'); return; }
    setTransferLoading(true); setTransferNotice(''); setTransferRequest(null);
    try {
      const serviceType = transferProduct === 'DMT' ? 'DMT' : 'BANK_TRANSFER';
      const amountPaise = Math.round(Number(amount) * 100);
      const response = await fetch('/api/financial/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `transfer-${window.crypto.randomUUID()}` }, body: JSON.stringify({ serviceType, transferProduct, organizationId: transferOrganizationId, senderProfileId: transferProduct === 'DMT' ? transferSenderId : undefined, beneficiaryId: transferBeneficiaryId, fundingSourceId: transferFundingSourceId, amountPaise }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || payload.message || 'Transfer request was rejected.');
      setTransferRequest(payload.transaction); setTransferNotice(payload.blockers?.length ? `Saved as a blocked draft: ${payload.blockers.join(', ')}.` : 'Saved as a draft. Provider submission is disabled.');
      await loadTransferDetails(transferOrganizationId);
    } catch (error) { setTransferNotice(error.message); }
    finally { setTransferLoading(false); }
  };

  const requestTransferApproval = async (transaction = transferRequest) => {
    if (!transferOrganizationId || !transaction?.public_reference) return;
    const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/approvals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionReference: transaction.public_reference }) });
    const payload = await response.json(); setTransferNotice(response.ok ? 'Approval requested. No provider transfer was submitted.' : payload.error || 'Approval request unavailable.'); await loadTransferDetails(transferOrganizationId);
  };

  const decideTransferApproval = async (approvalId, decision) => {
    if (!transferOrganizationId) return;
    const response = await fetch(`/api/financial/organizations/${transferOrganizationId}/approvals/${approvalId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    const payload = await response.json(); setTransferNotice(response.ok ? `Approval ${decision.toLowerCase()}. External transfer remains disabled.` : payload.error || 'Approval decision unavailable.'); await loadTransferDetails(transferOrganizationId);
  };

  const cancelTransferDraft = async (transaction) => {
    if (!transaction?.public_reference) return;
    const response = await fetch(`/api/financial/transactions/${encodeURIComponent(transaction.public_reference)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await response.json();
    setTransferNotice(response.ok ? 'Draft cancelled. Reserved limits were released.' : payload.error || 'Draft could not be cancelled.');
    setTransferRequest(null);
    if (transferOrganizationId) await loadTransferDetails(transferOrganizationId);
  };

  const loadBeneficiaries = useCallback(async () => {
    try {
      const [listResponse, statusResponse] = await Promise.all([
        fetch(`/api/banking/beneficiaries?q=${encodeURIComponent(beneficiaryQuery)}`),
        fetch('/api/banking/status'),
      ]);
      const listData = await listResponse.json();
      const statusData = await statusResponse.json();
      if (listResponse.ok) setBeneficiaries(listData.beneficiaries || []);
      if (statusResponse.ok) setBankingStatus(statusData);
    } catch { setBeneficiaryNotice('Beneficiary service is currently unavailable.'); }
  }, [beneficiaryQuery]);

  useEffect(() => {
    if (activeTab !== 'beneficiaries') return undefined;
    const timer = window.setTimeout(() => { void loadBeneficiaries(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadBeneficiaries]);

  const saveBeneficiary = async (event) => {
    event.preventDefault();
    setBeneficiaryBusy(true);
    setBeneficiaryNotice('');
    try {
      const response = await fetch(editingBeneficiary ? `/api/banking/beneficiaries/${editingBeneficiary}` : '/api/banking/beneficiaries', {
        method: editingBeneficiary ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(beneficiaryForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === 'DUPLICATE_BENEFICIARY' ? 'This bank account is already saved.' : data.message || data.error || 'Could not save beneficiary.');
      setBeneficiaryNotice(data.notice || 'Beneficiary saved. Bank ownership is not verified.');
      setBeneficiaryForm({ name: '', accountNumber: '', ifsc: '' });
      setEditingBeneficiary(null);
      await loadBeneficiaries();
    } catch (error) { setBeneficiaryNotice(error.message); }
    finally { setBeneficiaryBusy(false); }
  };

  const deactivateBeneficiary = async (id) => {
    setBeneficiaryBusy(true);
    try {
      const response = await fetch(`/api/banking/beneficiaries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deactivate' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not deactivate beneficiary.');
      setBeneficiaryNotice('Beneficiary deactivated.');
      await loadBeneficiaries();
    } catch (error) { setBeneficiaryNotice(error.message); }
    finally { setBeneficiaryBusy(false); }
  };

  const showNotification = useCallback((message, type = 'info') => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => {
      setNotice((prev) => (prev === message ? '' : prev));
    }, 6000);
  }, []);

  // 1. Load terminal configuration
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
            storeId: data.terminal.storeId || '',
            externalMid: data.terminal.externalMid || '',
            externalTid: data.terminal.externalTid || '',
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
            <span>Signed-in account</span>
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
        <button
          type="button"
          className={`pos-nav-tab ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          <ReceiptText size={18} />
          <span>Bill Pay &amp; Recharge</span>
          <span className="tab-pill">Provider gated</span>
        </button>
        <button
          type="button"
          className={`pos-nav-tab ${activeTab === 'beneficiaries' ? 'active' : ''}`}
          onClick={() => setActiveTab('beneficiaries')}
        >
          <Send size={18} />
          <span>Beneficiaries</span>
          <span className="tab-pill">Transfers unavailable</span>
        </button>
        <button
          type="button"
          className={`pos-nav-tab ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          <Send size={18} />
          <span>DMT &amp; Bank Transfers</span>
          <span className="tab-pill">Provider gated</span>
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

                {posProvider === 'phonepe' && <div className="form-row-grid">
                  {[
                    ['storeId', 'PhonePe Store ID'],
                    ['externalMid', 'External MID'],
                    ['externalTid', 'External TID'],
                  ].map(([field, label]) => <label className="pos-form-label" key={field}><span>{label}{field === 'storeId' ? ' *' : ''}</span><input type="text" required={field === 'storeId'} value={configForm[field]} onChange={(event) => setConfigForm({ ...configForm, [field]: event.target.value })} /><small>Provider-issued reference only. Saving it does not verify ownership or activate integration.</small></label>)}
                </div>}

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
                      <th>Settlement</th>
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
                          <span className={`status-pill pill-${String(tx.settlement_status || 'NOT_AVAILABLE').toLowerCase()}`}>
                            {tx.settlement_status || 'Not available'}
                          </span>
                          {tx.settled_at && <small className="settlement-date">{new Date(tx.settled_at).toLocaleString()}</small>}
                          {tx.settlement_payout_id && <small className="settlement-date">Payout {tx.settlement_payout_id}</small>}
                          {Number.isSafeInteger(Number(tx.settled_amount_paise)) && Number(tx.settled_amount_paise) > 0 && <small className="settlement-date">₹{(Number(tx.settled_amount_paise) / 100).toFixed(2)} settled</small>}
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

      {activeTab === 'beneficiaries' && (
        <section className="pos-workspace-container" aria-labelledby="beneficiaries-title">
          <div className="dashboard-card">
            <div className="dashboard-card-header"><div><span className="eyebrow">BANK DETAILS</span><h2 id="beneficiaries-title">Beneficiaries</h2><p>Bank details are encrypted in PostgreSQL. Only masked account numbers are shown.</p></div></div>
            <div className="pos-security-notice" role="status">Saved beneficiaries are not verified by a bank. Transfers, BBPS, and balance lookup stay unavailable until approved provider access is configured.{bankingStatus && <span> Encryption: {bankingStatus.encryption}. Transfers: {bankingStatus.transfers}. BBPS: {bankingStatus.bbps}.</span>}</div>
            <form className="pos-config-form" onSubmit={saveBeneficiary}>
              <div className="form-row-grid">
                <label><span>Beneficiary name</span><input required minLength="2" maxLength="100" value={beneficiaryForm.name} onChange={(event) => setBeneficiaryForm((form) => ({ ...form, name: event.target.value }))} /></label>
                <label><span>Bank account number</span><input required={!editingBeneficiary} inputMode="numeric" autoComplete="off" value={beneficiaryForm.accountNumber} placeholder={editingBeneficiary ? 'Leave blank to keep current account' : ''} onChange={(event) => setBeneficiaryForm((form) => ({ ...form, accountNumber: event.target.value }))} /></label>
                <label><span>IFSC</span><input required={!editingBeneficiary} maxLength="11" autoCapitalize="characters" value={beneficiaryForm.ifsc} placeholder={editingBeneficiary ? 'Leave blank to keep current IFSC' : 'ABCD0123456'} onChange={(event) => setBeneficiaryForm((form) => ({ ...form, ifsc: event.target.value.toUpperCase() }))} /></label>
              </div>
              <div className="pos-action-row"><button className="pos-primary-button" type="submit" disabled={beneficiaryBusy}>{beneficiaryBusy ? 'Saving…' : editingBeneficiary ? 'Save changes' : 'Add beneficiary'}</button>{editingBeneficiary && <button className="pos-secondary-button" type="button" onClick={() => { setEditingBeneficiary(null); setBeneficiaryForm({ name: '', accountNumber: '', ifsc: '' }); }}>Cancel edit</button>}</div>
            </form>
            {beneficiaryNotice && <p className="pos-inline-notice" role="status">{beneficiaryNotice}</p>}
          </div>
          <div className="dashboard-card pos-history-card">
            <div className="dashboard-card-header"><div><h2>Saved beneficiaries</h2><p>Search by saved name, IFSC, or masked account number.</p></div><input aria-label="Search beneficiaries" type="search" value={beneficiaryQuery} onChange={(event) => setBeneficiaryQuery(event.target.value)} placeholder="Search saved details" /></div>
            {beneficiaries.length ? <div className="table-responsive"><table className="pos-table"><thead><tr><th>Name</th><th>Account</th><th>IFSC</th><th>Bank check</th><th>Actions</th></tr></thead><tbody>
              {beneficiaries.map((beneficiary) => <tr key={beneficiary.id}><td>{beneficiary.name}</td><td>{beneficiary.account}</td><td>{beneficiary.ifsc}</td><td>{beneficiary.verificationStatus === 'DISABLED' ? 'Deactivated' : 'Not verified'}</td><td>{beneficiary.verificationStatus !== 'DISABLED' && <><button className="table-action-btn neutral" type="button" disabled={beneficiaryBusy} onClick={() => { setEditingBeneficiary(beneficiary.id); setBeneficiaryForm({ name: beneficiary.name, accountNumber: '', ifsc: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button className="table-action-btn neutral" type="button" disabled={beneficiaryBusy} onClick={() => deactivateBeneficiary(beneficiary.id)}>Deactivate</button></>}</td></tr>)}
            </tbody></table></div> : <p className="pos-empty-state">No beneficiaries saved yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'services' && <section className="overview-workspace-container" aria-labelledby="bill-pay-heading">
        <div className="financial-safe-notice" role="status">
          <div><b id="bill-pay-heading">BBPS, FASTag and recharge services</b><p>Only billers, categories and plans received from the configured provider can appear here. Payment submission stays disabled until the provider authorizes the funding source.</p></div>
          <span className="notice-tag">No ReachPay wallet</span>
        </div>
        <div className="dashboard-card financial-services">
          <div className="dashboard-card-header"><div><span className="eyebrow">SERVICE AVAILABILITY</span><h2>Eko provider status</h2></div><button className="button secondary sm" type="button" disabled={serviceLoading} onClick={() => void syncServiceCatalog()}>{serviceLoading ? 'Checking…' : 'Sync provider catalog'}</button></div>
          {serviceError && <p role="alert">{serviceError} <button type="button" onClick={() => void loadServices()}>Retry</button></p>}
          {serviceLoading && <p>Loading provider status and stored catalog…</p>}
          {serviceStatus && <div className="service-grid"><article className="service-card"><h3>Catalog access</h3><p>{serviceStatus.provider.catalogStatus}</p><small>Catalog billers: {serviceStatus.catalog.billers}. Last sync: {serviceStatus.catalog.lastSyncedAt ? new Date(serviceStatus.catalog.lastSyncedAt).toLocaleString() : 'Never'}</small></article><article className="service-card"><h3>Bill fetch</h3><p>{serviceStatus.billFetch}</p></article><article className="service-card"><h3>Payment funding</h3><p>{serviceStatus.paymentFunding}</p></article><article className="service-card"><h3>Payment submission</h3><p>{serviceStatus.paymentSubmission}</p></article></div>}
          {serviceStatus?.provider?.missingConfiguration?.length > 0 && <p>Required server setup: {serviceStatus.provider.missingConfiguration.join(', ')}. Provider onboarding and service activation are also required.</p>}
          {serviceStatus?.provider?.requirements?.length > 0 && <ul>{serviceStatus.provider.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>}
        </div>
        <div className="dashboard-card financial-services">
          <div className="dashboard-card-header"><div><span className="eyebrow">LIVE PROVIDER CATALOG</span><h2>Service category and biller selection</h2></div></div>
          {serviceCategories.length ? <div className="service-grid">{serviceCategories.map((category) => <button type="button" className="service-card" key={category.id} onClick={() => void loadServiceBillers(category.id)}><h3>{category.name}</h3><small>{serviceCategory === category.id ? 'Selected' : `Provider category ${category.id}`}</small></button>)}</div> : <p>{serviceStatus?.provider?.catalogStatus === 'CONFIGURED_NOT_PROVIDER_VERIFIED' || serviceStatus?.provider?.catalogStatus === 'CREDENTIALS_REQUIRED' ? 'No provider billers are stored. Configure approved Eko credentials, then sync its live catalog.' : 'No biller categories have been returned by a provider.'}</p>}
          {serviceBillers.length > 0 && <label className="pos-form-label">Biller<select value={serviceBiller} onChange={(event) => void loadServiceParameters(event.target.value)}><option value="">Choose a live provider biller</option>{serviceBillers.map((biller) => <option key={biller.id} value={biller.id}>{biller.name}{biller.supports_bill_fetch ? ' · bill fetch' : ''}</option>)}</select></label>}
          {serviceParameters.length > 0 && <div><h3>Provider-required account fields</h3>{serviceParameters.map((parameter) => <p key={parameter.id}>{parameter.label} · {parameter.type}{parameter.required ? ' · required' : ''}</p>)}<p>Bill fetch and payment confirmation are unavailable until provider credentials, merchant location, and approved funding access are configured.</p></div>}
        </div>
        <div className="dashboard-card financial-services">
          <h2>Mobile recharge discovery</h2>
          <form onSubmit={async (event) => { event.preventDefault(); setRechargeData(null); setServiceError(''); try { const response = await fetch(`/api/financial/services/recharge/operator?mobile=${encodeURIComponent(rechargeMobile)}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || payload.status || 'Recharge operator discovery is unavailable.'); setRechargeData(payload); } catch (error) { setServiceError(error.message); } }} className="pos-config-form"><label className="pos-form-label">Customer mobile number<input inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={rechargeMobile} onChange={(event) => setRechargeMobile(event.target.value)} required /></label><button className="button secondary sm" type="submit" disabled={serviceLoading}>Find provider operator</button></form>
          {rechargeData?.dependentParams?.map((item) => <p key={item.name}>{item.name}: {String(item.value)}</p>)}
          <p>Recharge plans are shown only after the provider returns operator and circle identifiers. Recharge submission remains disabled.</p>
        </div>
      </section>}

      {activeTab === 'transfers' && <section className="overview-workspace-container" aria-labelledby="transfer-heading">
        <div className="financial-safe-notice" role="status">
          <div><b id="transfer-heading">DMT and bank transfer controls</b><p>Internal drafts, consent records, organization roles, limits, and maker-checker approvals use PostgreSQL. No provider KYC, OTP, account verification, fee quote, or transfer is simulated.</p></div>
          <span className="notice-tag"><LockKeyhole size={13} /> Transfers disabled</span>
        </div>
        {transferNotice && <p className="pos-inline-notice" role="status">{transferNotice}</p>}
        {transferLoading && <p className="pos-empty-state" role="status">Loading organization and transfer records…</p>}
        {!transferOrganizations.length && !transferLoading && <div className="dashboard-card financial-services">
          <h2>Create merchant organization</h2><p>An organization is required for member roles, limits, and transfer approvals.</p>
          <form onSubmit={createTransferOrganization} className="pos-config-form"><label className="pos-form-label">Legal or business name<input required minLength={2} maxLength={180} value={transferOrgName} onChange={(event)=>setTransferOrgName(event.target.value)} /></label><button className="button primary sm" disabled={transferLoading}>Create organization</button></form>
        </div>}
        {transferOrganizations.length > 0 && <>
          <div className="dashboard-card financial-services">
            <div className="dashboard-card-header"><div><h2>Organization workspace</h2><p>Roles are scoped to this organization. Adding a member requires an existing active ReachPay account.</p></div>
              <select aria-label="Select organization" value={transferOrganizationId} onChange={(event)=>{setTransferOrganizationId(event.target.value);void loadTransferDetails(event.target.value);}}>{transferOrganizations.map((org)=><option key={org.id} value={org.id}>{org.legal_name} · {org.role}</option>)}</select>
            </div>
            <p>Selected role: <strong>{transferOrganizations.find((org)=>org.id===transferOrganizationId)?.role || 'Unknown'}</strong>. Organization verification: {transferOrganizations.find((org)=>org.id===transferOrganizationId)?.verification_status || 'UNVERIFIED'}. Provider DMT approval: {transferProviderData?.availability?.configuredProviders?.PAYOUT_PROVIDER || 'not verified'}. POS funding authorization: not established.</p>
            {transferMembers.length > 0 && <div className="table-responsive"><table className="pos-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{transferMembers.map((member)=><tr key={member.user_id}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td><td>{member.status}</td></tr>)}</tbody></table></div>}
            <form onSubmit={addTransferMember} className="pos-config-form"><label className="pos-form-label">Existing member email<input type="email" required value={transferMemberEmail} onChange={(event)=>setTransferMemberEmail(event.target.value)} /></label><label className="pos-form-label">Role<select value={transferMemberRole} onChange={(event)=>setTransferMemberRole(event.target.value)}><option value="MAKER">Maker</option><option value="CHECKER">Checker</option><option value="VIEWER">Viewer</option><option value="ADMIN">Admin</option></select></label><button className="button secondary sm" disabled={transferLoading}>Add member</button></form>
          </div>
          <div className="dashboard-card financial-services">
            <h2>Merchant transfer limits</h2><p>Enter configured merchant limits in paise. Verified provider or regulatory limits, when available, must be applied as lower limits. No external limit is assumed here.</p>
            {transferLimits.length > 0 && <div className="table-responsive"><table className="pos-table"><thead><tr><th>Service</th><th>Scope</th><th>Per transfer</th><th>Per day</th><th>Per month</th><th>Source</th></tr></thead><tbody>{transferLimits.map((limit)=><tr key={limit.id}><td>{limit.service_type}</td><td>{limit.user_id?'Member':'Organization'}</td><td>{limit.max_per_transaction_paise}</td><td>{limit.max_per_day_paise}</td><td>{limit.max_per_month_paise}</td><td>{limit.limit_source}</td></tr>)}</tbody></table></div>}
            <form onSubmit={saveTransferLimit} className="pos-config-form"><label className="pos-form-label">Service<select value={transferLimitForm.serviceType} onChange={(event)=>setTransferLimitForm((form)=>({...form,serviceType:event.target.value}))}><option value="BANK_TRANSFER">Bank transfer</option><option value="DMT">DMT</option></select></label><label className="pos-form-label">Limit scope<select value={transferLimitUserId} onChange={(event)=>setTransferLimitUserId(event.target.value)}><option value="">Organization</option>{transferMembers.map((member)=><option key={member.user_id} value={member.user_id}>{member.name} · {member.role}</option>)}</select></label>{[['maxPerTransactionPaise','Per transaction'],['maxPerDayPaise','Per day'],['maxPerMonthPaise','Per month']].map(([key,label])=><label key={key} className="pos-form-label">{label}, paise<input type="number" min="1" step="1" required value={transferLimitForm[key]} onChange={(event)=>setTransferLimitForm((form)=>({...form,[key]:event.target.value}))} /></label>)}<button className="button secondary sm" disabled={transferLoading}>Save transfer limit</button></form>
          </div>
          <div className="dashboard-card financial-services">
            <h2>DMT sender registration</h2><p>Sender details are encrypted. Registration and consent do not mean KYC or OTP verification.</p>
            <form onSubmit={registerTransferSender} className="pos-config-form"><label className="pos-form-label">Sender name<input required minLength={2} maxLength={160} value={transferSenderForm.fullName} onChange={(event)=>setTransferSenderForm((form)=>({...form,fullName:event.target.value}))} /></label><label className="pos-form-label">Mobile number, +91<input required inputMode="tel" placeholder="+919876543210" value={transferSenderForm.mobile} onChange={(event)=>setTransferSenderForm((form)=>({...form,mobile:event.target.value}))} /></label><label className="pos-form-label"><span><input type="checkbox" checked={transferSenderForm.consent} onChange={(event)=>setTransferSenderForm((form)=>({...form,consent:event.target.checked}))} /> I consent to ReachPay storing my sender details and sharing them with an authorized DMT provider solely for sender registration and verification. No transfer is initiated by this consent.</span></label><button className="button secondary sm" disabled={transferLoading||!transferSenderForm.consent}>Save sender consent</button></form>
            {transferSenders.length>0&&<div className="table-responsive"><table className="pos-table"><thead><tr><th>Sender</th><th>Mobile</th><th>KYC</th><th>Actions</th></tr></thead><tbody>{transferSenders.map((sender)=><tr key={sender.id}><td>{sender.full_name}</td><td>{sender.masked_mobile}</td><td>{sender.kyc_status}</td><td><button className="table-action-btn neutral" type="button" onClick={()=>void requestSenderKyc(sender.id)}>Check KYC availability</button><button className="table-action-btn neutral" type="button" onClick={()=>void requestSenderOtp(sender.id)}>Request OTP</button></td></tr>)}</tbody></table></div>}
          </div>
          <div className="dashboard-card financial-services">
            <h2>Prepare transfer request</h2><p>Unverified inputs remain drafts. A transfer can only be submitted after provider, KYC, beneficiary, funding and approval checks pass.</p>
            <form onSubmit={createTransferRequest} className="pos-config-form"><label className="pos-form-label">Transfer type<select value={transferProduct} onChange={(event)=>setTransferProduct(event.target.value)}><option value="THIRD_PARTY">Third-party beneficiary bank transfer</option><option value="OWN_BUSINESS">Own-business bank transfer</option><option value="DMT">Customer DMT</option></select></label>{transferProduct==='DMT'&&<label className="pos-form-label">DMT sender<select required value={transferSenderId} onChange={(event)=>setTransferSenderId(event.target.value)}><option value="">Choose sender</option>{transferSenders.map((sender)=><option key={sender.id} value={sender.id}>{sender.full_name} · {sender.kyc_status}</option>)}</select></label>}<label className="pos-form-label">Beneficiary<select required value={transferBeneficiaryId} onChange={(event)=>setTransferBeneficiaryId(event.target.value)}><option value="">Choose saved beneficiary</option>{transferBeneficiaries.map((beneficiary)=><option key={beneficiary.id} value={beneficiary.id}>{beneficiary.name} · {beneficiary.account} · {beneficiary.verificationStatus}</option>)}</select></label><label className="pos-form-label">Funding source<select required value={transferFundingSourceId} onChange={(event)=>setTransferFundingSourceId(event.target.value)}><option value="">Choose configured source</option>{transferFundingSources.map((source)=><option key={source.id} value={source.id}>{source.provider} · {source.masked_reference} · {source.activation_status}</option>)}</select></label><label className="pos-form-label">Amount, INR<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={transferAmount} onChange={(event)=>setTransferAmount(event.target.value)} /></label><button className="button primary sm" disabled={transferLoading}>Save transfer draft</button></form>
            {transferBeneficiaries.map((beneficiary)=><p key={`verify-${beneficiary.id}`}>{beneficiary.name}, bank status: {beneficiary.verificationStatus}. {beneficiary.verificationStatus!=='VERIFIED'&&<button className="table-action-btn neutral" type="button" onClick={()=>void requestBeneficiaryVerification(beneficiary.id)}>Check verification availability</button>}</p>)}
            {transferRequest&&<div><p>Draft {transferRequest.public_reference} · {transferRequest.status} · {transferRequest.blocker_code||'No provider submission'}</p><button className="button secondary sm" type="button" onClick={()=>void requestTransferApproval(transferRequest)}>Request maker-checker approval</button>{['DRAFT','AUTHORIZATION_PENDING'].includes(transferRequest.status)&&<button className="button secondary sm" type="button" onClick={()=>void cancelTransferDraft(transferRequest)}>Cancel draft</button>}</div>}
          </div>
          <div className="dashboard-card financial-services"><h2>Approval requests</h2>{transferApprovals.length?<div className="table-responsive"><table className="pos-table"><thead><tr><th>Reference</th><th>Service</th><th>Amount, paise</th><th>Requester</th><th>Status</th><th>Decision</th></tr></thead><tbody>{transferApprovals.map((approval)=><tr key={approval.id}><td>{approval.public_reference}</td><td>{approval.service_type}</td><td>{approval.amount_paise}</td><td>{approval.requester_user_id===user?.id?'You':approval.requester_user_id}</td><td>{approval.status}</td><td>{approval.status==='PENDING'&&approval.requester_user_id!==user?.id&&<><button className="table-action-btn neutral" type="button" onClick={()=>void decideTransferApproval(approval.id,'APPROVED')}>Approve</button><button className="table-action-btn neutral" type="button" onClick={()=>void decideTransferApproval(approval.id,'REJECTED')}>Reject</button></>}</td></tr>)}</tbody></table></div>:<p className="pos-empty-state">No organization approval records.</p>}</div>
          <div className="dashboard-card financial-services"><h2>Transfer history</h2>{transferHistory.length?<div className="table-responsive"><table className="pos-table"><thead><tr><th>Reference</th><th>Type</th><th>Amount, paise</th><th>Status</th><th>Provider</th></tr></thead><tbody>{transferHistory.map((transaction)=><tr key={transaction.reference}><td>{transaction.reference}</td><td>{transaction.transaction_type}</td><td>{transaction.amount_paise}</td><td>{transaction.status}</td><td>{transaction.provider||'Not assigned'}</td></tr>)}</tbody></table></div>:<p className="pos-empty-state">No transfer requests recorded.</p>}</div>
        </>}
      </section>}

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
              <b>POS and banking status</b>
                <p>
                  POS transaction status is provider-dependent. Merchant balance, ReachPay wallet, bank transfers, and BBPS are unavailable until the required provider products and access are approved.
                </p>
              </div>
            </div>
            <span className="notice-tag">
              <Clock size={13} /> Banking unavailable
            </span>
          </div>

          {/* Top Metrics Row - 4 Balanced Cards */}
          <section className="financial-summary" aria-label="POS status">
            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon blue"><WalletCards size={20} /></span>
                <span className="summary-badge">Provider balance API</span>
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
                <b>{financialDashboardLoading ? 'Loading…' : financialDashboard?.collections?.pendingCount ?? 'Unavailable'}</b>
                <p>Pending POS collection records</p>
              </div>
            </article>

            <article className="summary-card">
              <div className="summary-card-top">
                <span className="summary-icon emerald"><ArrowUpRight size={20} /></span>
                <span className="summary-badge">Total Transactions</span>
              </div>
              <div className="summary-card-body">
                <small>Recorded POS Activity</small>
                <b>{financialDashboardLoading ? 'Loading…' : financialDashboard ? `₹${(Number(financialDashboard.collections.confirmedAmountPaise || 0) / 100).toFixed(2)}` : 'Unavailable'}</b>
                <p>{financialDashboard?.collections?.confirmedCount ?? 0} provider-confirmed POS collections</p>
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
                <b>{financialDashboardLoading ? 'Loading…' : financialDashboard ? `${financialDashboard.terminals.totalCount} configured` : 'Unavailable'}</b>
                <p>{financialDashboard ? `${financialDashboard.terminals.providerReportedOnlineCount} provider-reported online · ${financialDashboard.terminals.disabledCount} disabled` : 'Configure a terminal in the POS tab'}</p>
              </div>
            </article>
          </section>
          <p className="financial-safe-notice" aria-live="polite">
            {financialDashboardLoading ? 'Loading account transaction summaries…' : financialDashboardError ? `Dashboard summary unavailable: ${financialDashboardError}` : financialDashboard ? `Failed POS: ${financialDashboard.collections.failedCount} · Settlement pending: ${financialDashboard.settlements.pendingCount} · Settled: ${financialDashboard.settlements.settledCount} · Pending service requests: ${financialDashboard.pendingFinancialRequestCount} · Reconciliation exceptions: ${financialDashboard.reconciliationExceptionCount}` : 'Account transaction summary is not available.'}
          </p>

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
                  <span className="setup-status"><i /> Provider dependent</span>
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
                  <span>A successful POS payment is separate from settlement. Settlement status is read-only provider evidence; funds are sent to the provider-linked merchant bank account.</span>
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
                    <CheckCircle2 size={13} /> {accountContactVerified ? 'Email & mobile verified' : 'Verification pending'}
                  </span>
                </div>

                <div className="profile-details-grid">
                  <div className="profile-detail-cell">
                    <span className="cell-label">Email address</span>
                    <span className="cell-val" title={user.email}>
                      <span className="val-text">{user.email}</span>
                      {user?.emailVerified && <span className="verified-mini-tag">✓</span>}
                    </span>
                  </div>
                  <div className="profile-detail-cell">
                    <span className="cell-label">Mobile number</span>
                    <span className="cell-val">
                      <span className="val-text">{mobileDisplay}</span>
                      {user?.mobileVerified && <span className="verified-mini-tag">✓</span>}
                    </span>
                  </div>
                  <div className="profile-detail-cell">
                    <span className="cell-label">Account status</span>
                    <span className="cell-val status-active">
                      <span className="status-indicator-dot small" />
                      <span className="val-text">{user?.status || 'Unknown'}</span>
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
                    <ShieldCheck size={14} /> Contact checks only
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
                    <h2 id="services-heading">Provider availability</h2>
                  </div>
                  <span className="setup-status">
                    {financialDashboardLoading ? 'Loading' : financialDashboardError ? 'Unavailable' : 'Live status'}
                  </span>
                </div>

                {financialDashboardError && <p role="alert">{financialDashboardError} <button type="button" onClick={() => void loadFinancialDashboard()}>Retry</button></p>}
                {financialDashboardLoading && <p>Loading verified account records…</p>}
                {financialDashboard && <div className="service-grid">
                  {Object.entries(financialDashboard.providerAvailability.services).map(([service, status]) => (
                    <article key={service} className="service-card"><span className="service-card-icon"><ReceiptText size={18} /></span><h3>{service.replaceAll('_', ' ')}</h3><p>{status}</p><small><LockKeyhole size={12} /> Transactions are disabled until provider approval.</small></article>
                  ))}
                </div>}
                {financialDashboard?.recentTransactions?.length > 0 && <div className="table-responsive"><table className="pos-table"><thead><tr><th>Reference</th><th>Type</th><th>Provider</th><th>Amount</th><th>Status</th><th>Settlement</th></tr></thead><tbody>{financialDashboard.recentTransactions.map((tx) => <tr key={`${tx.transaction_type}:${tx.reference}`}><td>{tx.reference}</td><td>{tx.transaction_type}</td><td>{tx.provider || 'Not assigned'}</td><td>₹{(Number(tx.amount_paise || 0) / 100).toFixed(2)}</td><td>{tx.status}</td><td>{tx.settlement_status || 'Not available'}</td></tr>)}</tbody></table></div>}
                {financialDashboard && !financialDashboard.recentTransactions.length && <p>No transactions recorded yet.</p>}
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
                    <li className="readiness-item">
                      <Clock size={18} />
                      <div className="readiness-text">
                        <b>Paytm POS provider status</b>
                        <small>{financialDashboard?.providerAvailability?.pos?.paytm?.status || 'Status unavailable until dashboard data loads'}</small>
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
