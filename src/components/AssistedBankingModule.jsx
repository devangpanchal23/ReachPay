import React, { useState } from 'react';
import {
  CreditCard, Landmark, ArrowRight, CheckCircle, Clock,
  Users, Plus, Trash2, Edit, AlertCircle, ShieldCheck,
  Send, RefreshCw, DollarSign, Wallet, ArrowUpRight,
  ArrowDownLeft, Monitor, Smartphone, Check, Sparkles,
  Search, Shield, ChevronRight
} from 'lucide-react';

const INITIAL_BENEFICIARIES = [
  { id: 'BEN001', name: 'Rahul Sharma', bankName: 'HDFC Bank', accountNumber: 'XXXX XXXX 4582', fullAccount: '50100428194582', ifsc: 'HDFC0001234', mobile: '9876543210', verified: true },
  { id: 'BEN002', name: 'Priya Patel', bankName: 'State Bank of India (SBI)', accountNumber: 'XXXX XXXX 8217', fullAccount: '30918273618217', ifsc: 'SBIN0004921', mobile: '9822019283', verified: true },
  { id: 'BEN003', name: 'Amit Kumar', bankName: 'ICICI Bank', accountNumber: 'XXXX XXXX 3391', fullAccount: '00192837463391', ifsc: 'ICIC0000042', mobile: '9711204918', verified: true },
  { id: 'BEN004', name: 'Sneha Reddy', bankName: 'Axis Bank', accountNumber: 'XXXX XXXX 9914', fullAccount: '91802938479914', ifsc: 'UTIB0001092', mobile: '9419028471', verified: true }
];

const AssistedBankingModule = ({
  walletBalance = 89567,
  posDevices = [],
  onPosSuccess,
  onTransferSuccess,
  onViewReceipt,
  initialAction = null
}) => {
  const [activeTab, setActiveTab] = useState(initialAction || 'overview'); // 'overview' | 'pos' | 'transfer' | 'beneficiaries' | 'withdrawal'
  const [beneficiaries, setBeneficiaries] = useState(INITIAL_BENEFICIARIES);

  // POS Flow State
  const [posStep, setPosStep] = useState('input'); // 'input' | 'simulating' | 'success'
  const [posAmount, setPosAmount] = useState('100000');
  const [posCustomerName, setPosCustomerName] = useState('Rahul Sharma');
  const [posCustomerMobile, setPosCustomerMobile] = useState('9876543210');
  const [posDeviceSelected, setPosDeviceSelected] = useState(posDevices[0]?.id || 'POS001');
  const [posCardMethod, setPosCardMethod] = useState('chip'); // 'chip' | 'nfc' | 'qr'
  const [lastPosTxn, setLastPosTxn] = useState(null);

  // Transfer / DMT Flow State
  const [transferStep, setTransferStep] = useState('select-beneficiary'); // 'select-beneficiary' | 'amount' | 'processing' | 'success'
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(INITIAL_BENEFICIARIES[0]);
  const [transferAmount, setTransferAmount] = useState('50000');
  const [transferMethod, setTransferMethod] = useState('IMPS'); // 'IMPS' | 'NEFT'
  const [transferRemarks, setTransferRemarks] = useState('Customer Fund Transfer');
  const [lastTransferTxn, setLastTransferTxn] = useState(null);

  // Beneficiary Modal State (Add / Edit)
  const [showAddBenModal, setShowAddBenModal] = useState(false);
  const [editingBen, setEditingBen] = useState(null);
  const [benForm, setBenForm] = useState({
    name: '',
    bankName: 'HDFC Bank',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    mobile: ''
  });
  const [benFormError, setBenFormError] = useState('');

  // Cash Withdrawal Demo State
  const [withdrawStep, setWithdrawStep] = useState('input');
  const [withdrawAmount, setWithdrawAmount] = useState('2000');
  const [withdrawAadhar, setWithdrawAadhar] = useState('9876 5432 1098');
  const [lastWithdrawTxn, setLastWithdrawTxn] = useState(null);

  // ----------------------------------------------------
  // Handlers for POS Transaction Demo
  // ----------------------------------------------------
  const handleStartPosDemo = (amount = '100000') => {
    setPosAmount(amount);
    setPosStep('input');
    setActiveTab('pos');
  };

  const handleSimulatePosTransaction = () => {
    setPosStep('simulating');
    const numericAmount = Number(posAmount) || 100000;
    const txnId = `POS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
    const utr = `POS${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    setTimeout(() => {
      const txnRecord = {
        id: txnId,
        date: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        service: 'POS Transaction',
        customer: posCustomerName,
        terminalId: posDeviceSelected,
        amount: numericAmount,
        fee: 0,
        status: 'success',
        type: 'pos',
        walletCredit: true,
        utr: utr
      };

      setLastPosTxn(txnRecord);
      if (onPosSuccess) {
        onPosSuccess(txnRecord);
      }
      setPosStep('success');
    }, 1800);
  };

  // ----------------------------------------------------
  // Handlers for Money Transfer (DMT) / Payout
  // ----------------------------------------------------
  const handleStartTransfer = (beneficiary = null) => {
    if (beneficiary) {
      setSelectedBeneficiary(beneficiary);
      setTransferStep('amount');
    } else {
      setTransferStep('select-beneficiary');
    }
    setActiveTab('transfer');
  };

  const handleExecuteTransfer = () => {
    setTransferStep('processing');
    const numericAmount = Number(transferAmount) || 50000;
    const fee = transferMethod === 'IMPS' ? 10 : 5;
    const txnId = `DMT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
    const utr = `DEMOUTR${Math.floor(100000 + Math.random() * 900000)}`;

    setTimeout(() => {
      const txnRecord = {
        id: txnId,
        date: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        service: 'Money Transfer (DMT)',
        beneficiary: selectedBeneficiary.name,
        customer: 'Self (Merchant Assisted)',
        bankName: selectedBeneficiary.bankName,
        accountNumber: selectedBeneficiary.accountNumber,
        ifsc: selectedBeneficiary.ifsc,
        amount: numericAmount,
        fee: fee,
        method: transferMethod,
        status: 'success',
        type: 'transfer',
        utr: utr
      };

      setLastTransferTxn(txnRecord);
      if (onTransferSuccess) {
        onTransferSuccess(txnRecord);
      }
      setTransferStep('success');
    }, 1600);
  };

  // ----------------------------------------------------
  // Beneficiary Management Handlers
  // ----------------------------------------------------
  const handleSaveBeneficiary = (e) => {
    e.preventDefault();
    if (!benForm.name || !benForm.accountNumber || !benForm.ifsc) {
      setBenFormError('Please fill in Name, Account Number, and IFSC code');
      return;
    }
    if (!editingBen && benForm.accountNumber !== benForm.confirmAccountNumber) {
      setBenFormError('Account numbers do not match');
      return;
    }

    if (editingBen) {
      setBeneficiaries(prev => prev.map(b => b.id === editingBen.id ? {
        ...b,
        name: benForm.name,
        bankName: benForm.bankName,
        accountNumber: `XXXX XXXX ${benForm.accountNumber.slice(-4)}`,
        fullAccount: benForm.accountNumber,
        ifsc: benForm.ifsc,
        mobile: benForm.mobile
      } : b));
    } else {
      const newBen = {
        id: `BEN00${beneficiaries.length + 1}`,
        name: benForm.name,
        bankName: benForm.bankName,
        accountNumber: `XXXX XXXX ${benForm.accountNumber.slice(-4)}`,
        fullAccount: benForm.accountNumber,
        ifsc: benForm.ifsc,
        mobile: benForm.mobile || '9876543210',
        verified: true
      };
      setBeneficiaries(prev => [newBen, ...prev]);
    }

    setShowAddBenModal(false);
    setEditingBen(null);
    setBenForm({ name: '', bankName: 'HDFC Bank', accountNumber: '', confirmAccountNumber: '', ifsc: '', mobile: '' });
    setBenFormError('');
  };

  const handleDeleteBeneficiary = (id) => {
    setBeneficiaries(prev => prev.filter(b => b.id !== id));
  };

  const handleEditBeneficiary = (ben) => {
    setEditingBen(ben);
    setBenForm({
      name: ben.name,
      bankName: ben.bankName,
      accountNumber: ben.fullAccount || '',
      confirmAccountNumber: ben.fullAccount || '',
      ifsc: ben.ifsc,
      mobile: ben.mobile
    });
    setShowAddBenModal(true);
  };

  // ----------------------------------------------------
  // Cash Withdrawal Demo Handler
  // ----------------------------------------------------
  const handleSimulateWithdrawal = () => {
    setWithdrawStep('processing');
    const amt = Number(withdrawAmount) || 2000;
    const txnId = `AEPS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    setTimeout(() => {
      const rec = {
        id: txnId,
        date: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        service: 'Cash Withdrawal (AePS)',
        customer: 'Aadhaar Verified Customer',
        amount: amt,
        fee: 0,
        status: 'success',
        type: 'withdrawal',
        walletCredit: true,
        utr: `AEPS${Math.floor(100000000 + Math.random() * 900000000)}`
      };
      setLastWithdrawTxn(rec);
      if (onPosSuccess) onPosSuccess(rec);
      setWithdrawStep('success');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Wallet Status */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 font-semibold text-xs rounded-full border border-blue-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Assisted Retailer Suite
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-xs rounded-full">
                Instant Wallet Settlement
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Assisted Financial Services & DMT</h1>
            <p className="text-gray-300 text-sm mt-1 max-w-xl">
              Perform POS-assisted card transactions, customer money transfers (DMT), bank account verification, and cash-out services.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <div>
              <p className="text-xs text-gray-300">Merchant Available Wallet</p>
              <p className="text-2xl font-extrabold text-emerald-400">₹{Number(walletBalance).toLocaleString('en-IN')}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 pt-5 border-t border-white/10 flex gap-2 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'overview', label: 'Service Dashboard' },
            { id: 'pos', label: 'POS Transaction Demo (₹1,00,000)' },
            { id: 'transfer', label: 'Money Transfer / DMT' },
            { id: 'beneficiaries', label: 'Beneficiary Management' },
            { id: 'withdrawal', label: 'Cash Withdrawal Demo' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'pos') setPosStep('input');
                if (tab.id === 'transfer') setTransferStep('select-beneficiary');
              }}
              className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-colors ${activeTab === tab.id
                ? 'bg-white text-indigo-950 shadow-md font-bold'
                : 'bg-white/10 text-white hover:bg-white/20'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 1. OVERVIEW / DASHBOARD TAB */}
      {/* ==================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Featured Hero: POS 1,00,000 assisted transaction */}
          <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="px-2.5 py-0.5 bg-yellow-400 text-yellow-950 font-extrabold text-[11px] rounded-full uppercase tracking-wider">
                Featured Prototype Scenario
              </span>
              <h2 className="text-xl font-bold">Simulate ₹1,00,000 POS Card Transaction</h2>
              <p className="text-blue-100 text-sm leading-relaxed">
                Demonstrates a customer paying ₹1,00,000 through POS Terminal <strong className="text-white font-mono">POS-001</strong>.
                Funds credit immediately to Merchant Wallet, followed by an instant IMPS bank transfer to beneficiary.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleStartPosDemo('100000')}
                className="px-6 py-3 bg-white text-blue-900 hover:bg-blue-50 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span>Launch POS Demo (₹1,00,000)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Service Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* POS Services Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">POS Assisted Transactions</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Card swipe, chip insertion, contactless tap, and QR terminal transactions with instant merchant wallet credit.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg w-fit">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> POS001 & POS003 Online
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleStartPosDemo('100000')}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>New POS Transaction</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Money Transfer (DMT) Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
                  <Send className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Domestic Money Transfer (DMT)</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Instant IMPS & NEFT transfers to any bank account in India with penny-drop account validation.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg w-fit">
                  <Users className="w-4 h-4 text-indigo-600" /> {beneficiaries.length} Verified Beneficiaries
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleStartTransfer()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Transfer Funds (IMPS)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Beneficiary Management Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
                  <Landmark className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Beneficiary Management</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Add, verify, edit, or delete customer bank accounts with automated bank name and branch lookup.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg w-fit">
                  <ShieldCheck className="w-4 h-4 text-purple-600" /> Penny Drop Verified
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setActiveTab('beneficiaries')}
                  className="w-full py-2.5 border border-purple-200 hover:bg-purple-50 text-purple-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Manage Beneficiaries</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Beneficiaries Strip */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-900">Recent Customer Beneficiaries</h3>
              <button
                onClick={() => setActiveTab('beneficiaries')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View All ({beneficiaries.length}) →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {beneficiaries.slice(0, 4).map((ben) => (
                <div
                  key={ben.id}
                  className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {ben.bankName.split(' ')[0]}
                      </span>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="font-semibold text-xs text-gray-900 mt-2">{ben.name}</p>
                    <p className="text-[11px] font-mono text-gray-500 mt-0.5">{ben.accountNumber}</p>
                  </div>

                  <button
                    onClick={() => handleStartTransfer(ben)}
                    className="mt-3 w-full py-1.5 bg-white border border-gray-200 hover:border-indigo-500 hover:text-indigo-600 text-gray-700 rounded-lg text-[11px] font-semibold transition-colors"
                  >
                    Transfer Funds →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 2. POS TRANSACTION DEMO FLOW */}
      {/* ==================================================== */}
      {activeTab === 'pos' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden max-w-3xl mx-auto">
          {/* Flow Header */}
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded">
                  ReachPay POS Engine
                </span>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">Assisted POS Transaction Simulation</h2>
                <p className="text-xs text-gray-600">Simulate customer card payment credited directly to merchant wallet</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              Back to Overview
            </button>
          </div>

          {/* STEP 1: INPUT DETAILS */}
          {posStep === 'input' && (
            <div className="p-6 space-y-6">
              {/* Preset Chips */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Select Demo Transaction Amount
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '₹10,000', val: '10000' },
                    { label: '₹25,000', val: '25000' },
                    { label: '₹50,000', val: '50000' },
                    { label: '₹1,00,000 (Target)', val: '100000', badge: 'Recommended' }
                  ].map((chip) => (
                    <button
                      key={chip.val}
                      type="button"
                      onClick={() => setPosAmount(chip.val)}
                      className={`p-3 rounded-xl border text-center transition-all relative ${posAmount === chip.val
                        ? 'border-blue-600 bg-blue-50/80 text-blue-900 font-bold shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                    >
                      {chip.badge && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-blue-600 text-white text-[9px] rounded-full font-bold">
                          {chip.badge}
                        </span>
                      )}
                      <p className="text-sm">{chip.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Custom Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-lg font-bold text-gray-400">₹</span>
                  <input
                    type="number"
                    value={posAmount}
                    onChange={(e) => setPosAmount(e.target.value)}
                    placeholder="100000"
                    className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-xl text-lg font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Customer Info & Terminal Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={posCustomerName}
                    onChange={(e) => setPosCustomerName(e.target.value)}
                    placeholder="Rahul Sharma"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Customer Mobile Number
                  </label>
                  <input
                    type="text"
                    value={posCustomerMobile}
                    onChange={(e) => setPosCustomerMobile(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Select POS Terminal
                  </label>
                  <select
                    value={posDeviceSelected}
                    onChange={(e) => setPosDeviceSelected(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white"
                  >
                    {posDevices.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.id} — {dev.merchant} ({dev.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Transaction Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'chip', label: 'Chip & PIN' },
                      { id: 'nfc', label: 'Contactless' },
                      { id: 'qr', label: 'Bharat QR' }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPosCardMethod(m.id)}
                        className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all ${posCardMethod === m.id
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold'
                          : 'border-gray-200 text-gray-600'
                          }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Simulation Notice */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Prototype Simulation Only:</strong> This simulated card transaction will immediately credit
                  ₹{Number(posAmount || 0).toLocaleString('en-IN')} to the ReachPay Merchant Wallet without processing real banking data.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSimulatePosTransaction}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <span>Authorize & Process ₹{Number(posAmount || 0).toLocaleString('en-IN')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SIMULATING PROCESSING ANIMATION */}
          {posStep === 'simulating' && (
            <div className="p-16 text-center space-y-6">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
                <CreditCard className="w-8 h-8 text-blue-600 absolute" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900">Contacting Terminal {posDeviceSelected}...</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Exchanging EMV cryptogram • Authorizing ₹{Number(posAmount).toLocaleString('en-IN')} with acquiring bank switch...
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                <Clock className="w-3.5 h-3.5 animate-pulse" /> Encrypted ISO-8583 Channel Active
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS STATE */}
          {posStep === 'success' && lastPosTxn && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
                  ✓ Transaction Successful
                </span>
                <h3 className="text-3xl font-extrabold text-gray-900 mt-2">
                  ₹{lastPosTxn.amount.toLocaleString('en-IN')}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Card Payment Approved on <strong>{lastPosTxn.terminalId}</strong>
                </p>
              </div>

              {/* Wallet Credit Callout */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-left max-w-md mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    +₹
                  </div>
                  <div>
                    <p className="text-xs text-emerald-800 font-semibold">Merchant Wallet Credited</p>
                    <p className="text-base font-bold text-emerald-950">
                      +₹{lastPosTxn.amount.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                  Instant Settlement
                </span>
              </div>

              {/* Key details */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs font-mono text-left max-w-md mx-auto space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaction ID:</span>
                  <span className="font-semibold text-gray-900">{lastPosTxn.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Bank Reference / UTR:</span>
                  <span className="font-semibold text-gray-900">{lastPosTxn.utr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer:</span>
                  <span className="font-sans text-gray-900">{lastPosTxn.customer}</span>
                </div>
              </div>

              {/* NEXT ACTION BUTTONS */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <button
                  onClick={() => handleStartTransfer()}
                  className="flex-1 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <span>Transfer Funds to Beneficiary</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onViewReceipt && onViewReceipt(lastPosTxn)}
                  className="px-4 py-3 border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5"
                >
                  <span>View Receipt</span>
                </button>

                <button
                  onClick={() => setPosStep('input')}
                  className="px-4 py-3 border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700"
                >
                  New Transaction
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* 3. MONEY TRANSFER (DMT) / PAYOUT FLOW */}
      {/* ==================================================== */}
      {activeTab === 'transfer' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden max-w-3xl mx-auto">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                  Domestic Money Transfer (DMT)
                </span>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">Transfer Funds to Beneficiary</h2>
                <p className="text-xs text-gray-600">Direct instant transfer from Merchant Wallet via IMPS / NEFT</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              Back to Overview
            </button>
          </div>

          {/* STEP 1: SELECT BENEFICIARY */}
          {transferStep === 'select-beneficiary' && (
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-700 uppercase">
                  Select Existing Beneficiary
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBen(null);
                    setBenForm({ name: '', bankName: 'HDFC Bank', accountNumber: '', confirmAccountNumber: '', ifsc: '', mobile: '' });
                    setShowAddBenModal(true);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Beneficiary
                </button>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {beneficiaries.map((ben) => (
                  <div
                    key={ben.id}
                    onClick={() => setSelectedBeneficiary(ben)}
                    className={`p-4 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${selectedBeneficiary?.id === ben.id
                      ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                        {ben.bankName.slice(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{ben.name}</p>
                        <p className="text-xs text-gray-600">{ben.bankName} • <span className="font-mono">{ben.accountNumber}</span></p>
                        <p className="text-[11px] font-mono text-gray-400">IFSC: {ben.ifsc}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Verified
                      </span>
                      {selectedBeneficiary?.id === ben.id && (
                        <CheckCircle className="w-5 h-5 text-indigo-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Wallet Balance: <strong>₹{Number(walletBalance).toLocaleString('en-IN')}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setTransferStep('amount')}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>Continue to Amount</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ENTER AMOUNT & REVIEW */}
          {transferStep === 'amount' && selectedBeneficiary && (
            <div className="p-6 space-y-6">
              {/* Selected Beneficiary Summary Card */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                    Recipient Bank Account
                  </span>
                  <h4 className="font-bold text-gray-900 text-base">{selectedBeneficiary.name}</h4>
                  <p className="text-xs text-gray-600">
                    {selectedBeneficiary.bankName} • <span className="font-mono">{selectedBeneficiary.accountNumber}</span> • {selectedBeneficiary.ifsc}
                  </p>
                </div>
                <button
                  onClick={() => setTransferStep('select-beneficiary')}
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Amount input & Quick Chips */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Transfer Amount (₹)
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {['5000', '10000', '25000', '50000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTransferAmount(amt)}
                      className={`p-2 rounded-xl border text-xs font-semibold transition-all ${transferAmount === amt
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                    >
                      ₹{Number(amt).toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-3 text-lg font-bold text-gray-400">₹</span>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full pl-9 pr-4 py-3 border border-gray-300 rounded-xl text-lg font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Transfer Mode: IMPS vs NEFT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Transfer Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransferMethod('IMPS')}
                    className={`p-3 rounded-xl border text-left transition-all ${transferMethod === 'IMPS'
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold'
                      : 'border-gray-200 text-gray-700'
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold">IMPS (Instant 24x7)</span>
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        Fastest
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Real-time settlement • Fee: ₹10</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferMethod('NEFT')}
                    className={`p-3 rounded-xl border text-left transition-all ${transferMethod === 'NEFT'
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 font-bold'
                      : 'border-gray-200 text-gray-700'
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold">NEFT (Batch)</span>
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        Standard
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Batch settlement • Fee: ₹5</p>
                  </button>
                </div>
              </div>

              {/* Total Calculation */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Transfer Principal:</span>
                  <span className="font-semibold text-gray-900 font-mono">₹{Number(transferAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Service / Convenience Fee:</span>
                  <span className="font-semibold text-gray-900 font-mono">₹{transferMethod === 'IMPS' ? '10' : '5'}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-sm font-bold text-gray-900">
                  <span>Total Wallet Debit:</span>
                  <span className="text-lg text-indigo-900 font-mono">
                    ₹{(Number(transferAmount || 0) + (transferMethod === 'IMPS' ? 10 : 5)).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setTransferStep('select-beneficiary')}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  ← Back to Beneficiaries
                </button>

                <button
                  type="button"
                  onClick={handleExecuteTransfer}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>Confirm Transfer (₹{Number(transferAmount || 0).toLocaleString('en-IN')})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {transferStep === 'processing' && (
            <div className="p-16 text-center space-y-6">
              <div className="relative inline-flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <Send className="w-8 h-8 text-indigo-600 absolute" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900">Executing {transferMethod} Transfer...</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Broadcasting payout payload to {selectedBeneficiary?.bankName} switch • Generating NPCI UTR...
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {transferStep === 'success' && lastTransferTxn && (
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
                  Transfer Successful
                </span>
                <h3 className="text-3xl font-extrabold text-gray-900 mt-2">
                  ₹{lastTransferTxn.amount.toLocaleString('en-IN')}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Sent to <strong>{lastTransferTxn.beneficiary}</strong> ({lastTransferTxn.bankName})
                </p>
              </div>

              {/* UTR Box */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-xs font-mono text-left max-w-md mx-auto space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaction ID:</span>
                  <span className="font-semibold text-gray-900">{lastTransferTxn.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Bank UTR Number:</span>
                  <span className="font-bold text-indigo-700">{lastTransferTxn.utr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Mode:</span>
                  <span className="font-semibold text-gray-900">{lastTransferTxn.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Service Fee:</span>
                  <span className="text-gray-900">₹{lastTransferTxn.fee}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <button
                  onClick={() => onViewReceipt && onViewReceipt(lastTransferTxn)}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <span>View Full Receipt</span>
                </button>

                <button
                  onClick={() => setTransferStep('select-beneficiary')}
                  className="px-4 py-3 border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700"
                >
                  Make Another Transfer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* 4. BENEFICIARY MANAGEMENT TAB */}
      {/* ==================================================== */}
      {activeTab === 'beneficiaries' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Customer Beneficiary Directory</h2>
              <p className="text-xs text-gray-500">Manage validated recipient bank accounts for DMT and merchant payouts</p>
            </div>

            <button
              onClick={() => {
                setEditingBen(null);
                setBenForm({ name: '', bankName: 'HDFC Bank', accountNumber: '', confirmAccountNumber: '', ifsc: '', mobile: '' });
                setShowAddBenModal(true);
              }}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Beneficiary</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Beneficiary ID</th>
                  <th className="px-6 py-3">Account Holder</th>
                  <th className="px-6 py-3">Bank Details</th>
                  <th className="px-6 py-3">IFSC Code</th>
                  <th className="px-6 py-3">Mobile</th>
                  <th className="px-6 py-3">Verification</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {beneficiaries.map((ben) => (
                  <tr key={ben.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-500 font-semibold">{ben.id}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{ben.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{ben.bankName}</p>
                      <p className="text-xs font-mono text-gray-500">{ben.accountNumber}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">{ben.ifsc}</td>
                    <td className="px-6 py-4 text-xs text-gray-600 font-mono">{ben.mobile}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-3 h-3 text-emerald-600" /> Penny Drop Verified
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleStartTransfer(ben)}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={() => handleEditBeneficiary(ben)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBeneficiary(ben.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 5. CASH WITHDRAWAL (AePS / MICRO-ATM) DEMO */}
      {/* ==================================================== */}
      {activeTab === 'withdrawal' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden max-w-2xl mx-auto">
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Landmark className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Aadhaar / Micro-ATM Service
                </span>
                <h2 className="text-xl font-bold text-gray-900 mt-0.5">Assisted Cash Withdrawal Simulation</h2>
                <p className="text-xs text-gray-600">Simulate AePS cash-out with instant merchant wallet settlement</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800"
            >
              Back to Overview
            </button>
          </div>

          {withdrawStep === 'input' && (
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Customer Aadhaar Number (Virtual ID)
                </label>
                <input
                  type="text"
                  value={withdrawAadhar}
                  onChange={(e) => setWithdrawAadhar(e.target.value)}
                  placeholder="9876 5432 1098"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Withdrawal Amount (₹)
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {['500', '1000', '2000', '5000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setWithdrawAmount(amt)}
                      className={`p-2 rounded-xl border text-xs font-semibold ${withdrawAmount === amt
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-gray-200 text-gray-700'
                        }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-bold font-mono"
                />
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-800">
                Customer biometric authentication simulation will verify fingerprint and disburse cash, crediting wallet.
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSimulateWithdrawal}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <span>Authenticate & Withdraw ₹{withdrawAmount}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {withdrawStep === 'processing' && (
            <div className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin mx-auto"></div>
              <h4 className="font-bold text-gray-900">Verifying Biometrics with UIDAI...</h4>
              <p className="text-xs text-gray-500">Contacting NPCI AePS switch...</p>
            </div>
          )}

          {withdrawStep === 'success' && lastWithdrawTxn && (
            <div className="p-8 text-center space-y-5">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">₹{lastWithdrawTxn.amount.toLocaleString('en-IN')}</h3>
              <p className="text-xs text-gray-600">Disbursed to Customer • Credited to Merchant Wallet</p>

              <div className="pt-2 flex justify-center gap-2">
                <button
                  onClick={() => onViewReceipt && onViewReceipt(lastWithdrawTxn)}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl"
                >
                  View Receipt
                </button>
                <button
                  onClick={() => setWithdrawStep('input')}
                  className="px-4 py-2 border border-gray-300 text-xs font-semibold rounded-xl"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* ADD / EDIT BENEFICIARY MODAL */}
      {/* ==================================================== */}
      {showAddBenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">
                {editingBen ? 'Edit Beneficiary' : 'Add New Beneficiary'}
              </h3>
              <button
                onClick={() => setShowAddBenModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBeneficiary} className="p-6 space-y-4">
              {benFormError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg font-medium">
                  {benFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Beneficiary Full Name
                </label>
                <input
                  type="text"
                  required
                  value={benForm.name}
                  onChange={(e) => setBenForm({ ...benForm, name: e.target.value })}
                  placeholder="Rahul Sharma"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Bank Name
                </label>
                <select
                  value={benForm.bankName}
                  onChange={(e) => setBenForm({ ...benForm, bankName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm bg-white"
                >
                  <option value="HDFC Bank">HDFC Bank</option>
                  <option value="State Bank of India (SBI)">State Bank of India (SBI)</option>
                  <option value="ICICI Bank">ICICI Bank</option>
                  <option value="Axis Bank">Axis Bank</option>
                  <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                  <option value="Punjab National Bank">Punjab National Bank</option>
                  <option value="Bank of Baroda">Bank of Baroda</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Bank Account Number
                </label>
                <input
                  type="text"
                  required
                  value={benForm.accountNumber}
                  onChange={(e) => setBenForm({ ...benForm, accountNumber: e.target.value })}
                  placeholder="e.g. 50100428194582"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono"
                />
              </div>

              {!editingBen && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Confirm Account Number
                  </label>
                  <input
                    type="text"
                    required
                    value={benForm.confirmAccountNumber}
                    onChange={(e) => setBenForm({ ...benForm, confirmAccountNumber: e.target.value })}
                    placeholder="Re-enter Account Number"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    required
                    value={benForm.ifsc}
                    onChange={(e) => setBenForm({ ...benForm, ifsc: e.target.value.toUpperCase() })}
                    placeholder="HDFC0001234"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={benForm.mobile}
                    onChange={(e) => setBenForm({ ...benForm, mobile: e.target.value })}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddBenModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
                >
                  {editingBen ? 'Update Beneficiary' : 'Validate & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistedBankingModule;
