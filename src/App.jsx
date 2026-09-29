import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import {
  LayoutDashboard, CreditCard, Wallet, FileText, Building, Users,
  Bell, Search, Filter, Download, Eye, CheckCircle, XCircle,
  AlertTriangle, Clock, TrendingUp, DollarSign, Activity, LogOut,
  Menu, Plus, Trash2, Edit, Zap, Smartphone, Monitor,
  Landmark, Send, Receipt, X
} from 'lucide-react';
import BBPSModule from './components/BBPSModule';
import AssistedBankingModule from './components/AssistedBankingModule';
import ReceiptModal from './components/ReceiptModal';

const App = () => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState('merchant'); // 'admin' or 'merchant'
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [bankingInitialAction, setBankingInitialAction] = useState('overview');
  const [txFilter, setTxFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');

  // Mock data stored in state for live prototype interactions
  const [dashboardData, setDashboardData] = useState({
    totalVolume: 1245678,
    todayTransactions: 142,
    availableBalance: 89567,
    pendingSettlement: 23456,
    completedSettlements: 45,
    activeDevices: 12,
    offlineDevices: 3,
    bbpsTransactions: 68,
    posTransactions: 45,
    moneyTransfers: 24,
    rechargeTransactions: 36
  });

  const [walletTransactions, setWalletTransactions] = useState([
    { id: 'WTX001', date: '2023-06-15', amount: 12500, type: 'credit', status: 'completed', description: 'POS Transaction' },
    { id: 'WTX002', date: '2023-06-14', amount: -5000, type: 'debit', status: 'completed', description: 'Settlement Fee' },
    { id: 'WTX003', date: '2023-06-13', amount: 8900, type: 'credit', status: 'pending', description: 'POS Transaction' },
    { id: 'WTX004', date: '2023-06-12', amount: 15600, type: 'credit', status: 'completed', description: 'POS Transaction' },
    { id: 'WTX005', date: '2023-06-11', amount: -2500, type: 'debit', status: 'completed', description: 'Withdrawal' }
  ]);

  const [transactions, setTransactions] = useState([
    { id: 'TXN001', date: '2023-06-15', amount: 1250, status: 'success', terminalId: 'POS001', customer: 'John Doe', service: 'POS Transaction', type: 'pos', utr: 'UTR991827361' },
    { id: 'TXN002', date: '2023-06-15', amount: 890, status: 'failed', terminalId: 'POS002', customer: 'Jane Smith', service: 'POS Transaction', type: 'pos', utr: 'UTR881928371' },
    { id: 'TXN003', date: '2023-06-14', amount: 2100, status: 'pending', terminalId: 'POS003', customer: 'Bob Johnson', service: 'POS Transaction', type: 'pos', utr: 'UTR771928362' },
    { id: 'TXN004', date: '2023-06-14', amount: 750, status: 'success', terminalId: 'POS001', customer: 'Alice Brown', service: 'POS Transaction', type: 'pos', utr: 'UTR661928361' },
    { id: 'TXN005', date: '2023-06-13', amount: 3200, status: 'success', terminalId: 'POS004', customer: 'Charlie Wilson', service: 'POS Transaction', type: 'pos', utr: 'UTR551928360' }
  ]);

  const settlements = [
    { id: 'SET001', date: '2023-06-15', amount: 25000, fee: 250, status: 'completed', utr: 'UTR001', bank: 'HDFC' },
    { id: 'SET002', date: '2023-06-14', amount: 18000, fee: 180, status: 'completed', utr: 'UTR002', bank: 'SBI' },
    { id: 'SET003', date: '2023-06-13', amount: 32000, fee: 320, status: 'pending', utr: 'UTR003', bank: 'ICICI' },
    { id: 'SET004', date: '2023-06-12', amount: 15000, fee: 150, status: 'processing', utr: 'UTR004', bank: 'Axis' }
  ];

  const [posDevices, setPosDevices] = useState([
    { id: 'POS001', merchant: 'ABC Retail', status: 'online', lastActive: '2023-06-15 14:30', transactions: 45 },
    { id: 'POS002', merchant: 'XYZ Store', status: 'offline', lastActive: '2023-06-14 10:15', transactions: 23 },
    { id: 'POS003', merchant: 'PQR Shop', status: 'online', lastActive: '2023-06-15 12:45', transactions: 38 },
    { id: 'POS004', merchant: 'DEF Market', status: 'online', lastActive: '2023-06-15 11:20', transactions: 52 }
  ]);

  const merchants = [
    { id: 'M001', name: 'ABC Retail', businessType: 'Grocery', balance: 12500, devices: 2, transactions: 145 },
    { id: 'M002', name: 'XYZ Store', businessType: 'Electronics', balance: 8900, devices: 1, transactions: 89 },
    { id: 'M003', name: 'PQR Shop', businessType: 'Clothing', balance: 15600, devices: 1, transactions: 123 },
    { id: 'M004', name: 'DEF Market', businessType: 'Supermarket', balance: 22300, devices: 3, transactions: 201 }
  ];

  const [chartData] = useState([
    { name: 'Mon', transactions: 45, revenue: 12500 },
    { name: 'Tue', transactions: 52, revenue: 18900 },
    { name: 'Wed', transactions: 38, revenue: 14200 },
    { name: 'Thu', transactions: 61, revenue: 21000 },
    { name: 'Fri', transactions: 55, revenue: 19500 },
    { name: 'Sat', transactions: 72, revenue: 24800 },
    { name: 'Sun', transactions: 48, revenue: 16700 }
  ]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'text-green-700 bg-green-100';
      case 'failed': return 'text-red-700 bg-red-100';
      case 'pending': return 'text-yellow-800 bg-yellow-100';
      case 'processing': return 'text-blue-700 bg-blue-100';
      case 'completed': return 'text-green-700 bg-green-100';
      case 'online': return 'text-green-700 bg-green-100';
      case 'offline': return 'text-red-700 bg-red-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  // ------------------------------------------------------------------
  // Central State Updaters for Services (POS, BBPS, DMT, Transfers)
  // ------------------------------------------------------------------

  const handlePosSuccess = (posTxn) => {
    const amount = Number(posTxn.amount) || 100000;

    setDashboardData(prev => ({
      ...prev,
      availableBalance: prev.availableBalance + amount,
      totalVolume: prev.totalVolume + amount,
      todayTransactions: prev.todayTransactions + 1,
      posTransactions: (prev.posTransactions || 0) + 1
    }));

    setWalletTransactions(prev => [
      {
        id: `WTX-${posTxn.id.slice(-6)}`,
        date: posTxn.date,
        amount: amount,
        type: 'credit',
        status: 'completed',
        description: `POS Credit (${posTxn.terminalId || 'POS-001'})`
      },
      ...prev
    ]);

    setTransactions(prev => [posTxn, ...prev]);

    if (posTxn.terminalId) {
      setPosDevices(prev => prev.map(d =>
        d.id === posTxn.terminalId ? { ...d, transactions: d.transactions + 1 } : d
      ));
    }

    setActiveReceipt(posTxn);
  };

  const handleTransferSuccess = (transferTxn) => {
    const amount = Number(transferTxn.amount) || 50000;
    const fee = Number(transferTxn.fee) || 10;
    const totalDebit = amount + fee;

    setDashboardData(prev => ({
      ...prev,
      availableBalance: Math.max(0, prev.availableBalance - totalDebit),
      todayTransactions: prev.todayTransactions + 1,
      moneyTransfers: (prev.moneyTransfers || 0) + 1
    }));

    setWalletTransactions(prev => [
      {
        id: `WTX-${transferTxn.id.slice(-6)}`,
        date: transferTxn.date,
        amount: -totalDebit,
        type: 'debit',
        status: 'completed',
        description: `DMT to ${transferTxn.beneficiary} (${transferTxn.method})`
      },
      ...prev
    ]);

    setTransactions(prev => [transferTxn, ...prev]);

    setActiveReceipt(transferTxn);
  };

  const handleBbpsPaymentSuccess = (bbpsTxn) => {
    const amount = Number(bbpsTxn.amount) || 0;

    setDashboardData(prev => ({
      ...prev,
      availableBalance: Math.max(0, prev.availableBalance - amount),
      totalVolume: prev.totalVolume + amount,
      todayTransactions: prev.todayTransactions + 1,
      bbpsTransactions: (prev.bbpsTransactions || 0) + 1
    }));

    setWalletTransactions(prev => [
      {
        id: `WTX-${bbpsTxn.id.slice(-6)}`,
        date: bbpsTxn.date,
        amount: -amount,
        type: 'debit',
        status: 'completed',
        description: `BBPS Payment - ${bbpsTxn.biller}`
      },
      ...prev
    ]);

    setTransactions(prev => [bbpsTxn, ...prev]);

    setActiveReceipt(bbpsTxn);
  };

  const handleLaunchTransferFunds = () => {
    setActiveModule('banking');
    setBankingInitialAction('transfer');
  };

  const handleNavigate = (moduleId, bankingAction = 'overview') => {
    setActiveModule(moduleId);
    if (moduleId === 'banking') setBankingInitialAction(bankingAction);
    setMobileMenuOpen(false);
  };

  // ------------------------------------------------------------------
  // Module Renders
  // ------------------------------------------------------------------

  const renderDashboard = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Welcome back, John Doe • ReachPay Business Terminal</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setActiveModule('banking');
              setBankingInitialAction('pos');
            }}
            className="px-3.5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Simulate ₹1,00,000 POS</span>
          </button>
          <button
            onClick={() => setActiveModule('bbps')}
            className="px-3.5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>BBPS Bill Pay</span>
          </button>
          <button
            onClick={() => setActiveModule('reports')}
            className="px-3.5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs font-semibold flex items-center justify-center min-h-[44px] sm:min-h-0"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Volume</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹{dashboardData.totalVolume.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl shrink-0">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Today's Transactions</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{dashboardData.todayTransactions}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Available Balance</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹{dashboardData.availableBalance.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl shrink-0">
              <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Pending Settlement</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹{dashboardData.pendingSettlement.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-xl shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Services Performance Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setActiveModule('bbps')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>BBPS Bill Pay</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg font-bold text-gray-900">{dashboardData.bbpsTransactions || 68} Paid</p>
          <span className="text-[11px] text-blue-600 font-medium">Open BBPS Hub →</span>
        </div>

        <div
          onClick={() => {
            setActiveModule('banking');
            setBankingInitialAction('pos');
          }}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>POS Assisted</span>
            <CreditCard className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg font-bold text-gray-900">{dashboardData.posTransactions || 45} Done</p>
          <span className="text-[11px] text-blue-600 font-medium">Run POS Demo →</span>
        </div>

        <div
          onClick={() => {
            setActiveModule('banking');
            setBankingInitialAction('transfer');
          }}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Money Transfers</span>
            <Send className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-lg font-bold text-gray-900">{dashboardData.moneyTransfers || 24} Sent</p>
          <span className="text-[11px] text-indigo-600 font-medium">Transfer IMPS →</span>
        </div>

        <div
          onClick={() => setActiveModule('bbps')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Recharges</span>
            <Smartphone className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-gray-900">{dashboardData.rechargeTransactions || 36} Recharged</p>
          <span className="text-[11px] text-emerald-600 font-medium">Recharge Mobile →</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Transaction Volume</h3>
          <div className="h-[240px] sm:h-[280px] lg:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="transactions" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 min-w-0 overflow-hidden">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Revenue Trends</h3>
          <div className="h-[240px] sm:h-[280px] lg:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Recent Transactions</h3>
            <button
              onClick={() => setActiveModule('transactions')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View All ({transactions.length}) →
            </button>
          </div>
          <div className="space-y-2.5">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100/70 transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-xs sm:text-sm text-gray-900 truncate">{tx.id}</p>
                  <p className="text-xs text-gray-500 truncate">{tx.customer || tx.beneficiary || 'Customer'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-xs sm:text-sm text-gray-900">₹{Number(tx.amount || 0).toLocaleString('en-IN')}</p>
                  <span className={`inline-flex px-2 py-0.5 text-[10px] sm:text-xs rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">POS Status</h3>
            <button
              onClick={() => setActiveModule('pos')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Manage Devices →
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Active Devices</span>
              <span className="font-bold text-green-600">{dashboardData.activeDevices} Online</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Offline Devices</span>
              <span className="font-bold text-red-600">{dashboardData.offlineDevices} Needs Attention</span>
            </div>
            <div className="mt-4 pt-2 border-t border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-600">Device Fleet Health</span>
                <span className="text-xs font-bold text-gray-900">85% Optimal</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWallet = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Wallet Management</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage merchant funds, POS settlements, and bank transfers</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={handleLaunchTransferFunds}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transfer Funds to Bank</span>
          </button>
          <button
            onClick={() => {
              setDashboardData(prev => ({ ...prev, availableBalance: prev.availableBalance + 10000 }));
              setWalletTransactions(prev => [
                {
                  id: `WTX${Math.floor(100 + Math.random() * 900)}`,
                  date: new Date().toISOString().split('T')[0],
                  amount: 10000,
                  type: 'credit',
                  status: 'completed',
                  description: 'Manual Wallet Topup'
                },
                ...prev
              ]);
            }}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs font-semibold flex items-center justify-center gap-1 min-h-[44px] sm:min-h-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Funds</span>
          </button>
        </div>
      </div>

      {/* Wallet Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Available Balance</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹{dashboardData.availableBalance.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <Wallet className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Balance</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹{dashboardData.pendingSettlement.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-xl">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total Earnings</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹156,780</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Wallet Activity & History</h3>
          <span className="text-xs text-gray-500 font-medium">{walletTransactions.length} records</span>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-gray-100">
          {walletTransactions.map((tx) => (
            <div key={tx.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{tx.id}</span>
                <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${getStatusColor(tx.status)}`}>
                  {tx.status}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-800">{tx.description}</p>
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>{tx.date}</span>
                <span className={`text-sm font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'credit' ? '+' : ''}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {walletTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold text-gray-900">{tx.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{tx.description}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'credit' ? '+' : ''}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderTransactions = () => {
    const filteredTx = transactions.filter(tx => {
      const matchesSearch = !txSearch ||
        (tx.id && tx.id.toLowerCase().includes(txSearch.toLowerCase())) ||
        (tx.customer && tx.customer.toLowerCase().includes(txSearch.toLowerCase())) ||
        (tx.service && tx.service.toLowerCase().includes(txSearch.toLowerCase())) ||
        (tx.terminalId && tx.terminalId.toLowerCase().includes(txSearch.toLowerCase())) ||
        (tx.utr && tx.utr.toLowerCase().includes(txSearch.toLowerCase()));

      const matchesFilter = txFilter === 'all' ||
        (txFilter === 'pos' && tx.type === 'pos') ||
        (txFilter === 'bbps' && tx.type === 'bbps') ||
        (txFilter === 'recharge' && (tx.service?.toLowerCase().includes('recharge') || tx.category?.includes('recharge'))) ||
        (txFilter === 'transfer' && (tx.type === 'transfer' || tx.service?.includes('Transfer'))) ||
        (txFilter === 'wallet' && tx.type === 'wallet');

      return matchesSearch && matchesFilter;
    });

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Unified Transactions</h1>
            <p className="text-xs text-gray-500 mt-0.5">Real-time ledger for POS, BBPS, Recharges, and Money Transfers</p>
          </div>
          <div className="flex items-center space-x-2">
            <button className="flex items-center px-3.5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs font-semibold min-h-[40px]">
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              Advanced
            </button>
            <button className="flex items-center px-3.5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold min-h-[40px]">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs font-medium pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All Transactions' },
              { id: 'pos', label: 'POS Terminal' },
              { id: 'bbps', label: 'BBPS Bills' },
              { id: 'recharge', label: 'Recharges' },
              { id: 'transfer', label: 'Money Transfers' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTxFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors min-h-[36px] flex items-center ${txFilter === tab.id
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by ID, customer, UTR..."
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden min-h-[38px]"
            />
          </div>
        </div>

        {/* Transaction Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg mr-2.5 sm:mr-3 shrink-0">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-gray-500 truncate">Successful</p>
                <p className="text-base sm:text-xl font-bold text-gray-900">{transactions.filter(t => t.status === 'success').length + 137}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg mr-2.5 sm:mr-3 shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-gray-500 truncate">Pending</p>
                <p className="text-base sm:text-xl font-bold text-gray-900">12</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg mr-2.5 sm:mr-3 shrink-0">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-gray-500 truncate">Failed</p>
                <p className="text-base sm:text-xl font-bold text-gray-900">5</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg mr-2.5 sm:mr-3 shrink-0">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-gray-500 truncate">Total Volume</p>
                <p className="text-sm sm:text-lg font-bold text-gray-900 truncate">₹{dashboardData.totalVolume.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions Container */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Transaction History ({filteredTx.length})</h3>
            <span className="text-xs text-gray-500">Auto-synced with services</span>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredTx.map((tx) => (
              <div key={tx.id} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{tx.id}</span>
                  <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${getStatusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{tx.service || 'POS Transaction'}</p>
                    <p className="text-xs text-gray-500 truncate">{tx.customer || tx.beneficiary || 'Walk-in'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold text-gray-900">₹{Number(tx.amount || 0).toLocaleString('en-IN')}</p>
                    <span className="text-[11px] text-gray-400 font-mono block">{tx.terminalId || tx.utr || '—'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-500">
                  <span>{tx.date}</span>
                  <button
                    onClick={() => setActiveReceipt(tx)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg min-h-[38px] transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>View Receipt</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaction ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer / Recipient</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Terminal / Ref</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono font-semibold text-gray-900">{tx.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{tx.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      <span className="font-semibold text-gray-900">{tx.service || 'POS Transaction'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{tx.customer || tx.beneficiary || 'Walk-in'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">{tx.terminalId || tx.utr || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{Number(tx.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => setActiveReceipt(tx)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 text-xs font-semibold px-2 py-1 hover:bg-blue-50 rounded"
                        title="View Receipt"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSettlements = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settlements</h1>
          <p className="text-xs text-gray-500 mt-0.5">Platform merchant batch settlements to verified bank accounts</p>
        </div>
        <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold min-h-[44px] sm:min-h-0 self-stretch sm:self-auto flex items-center justify-center">
          Request Settlement
        </button>
      </div>

      {/* Settlement Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Completed Settlements</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{dashboardData.completedSettlements}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Settlements</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">8</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-xl">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 sm:col-span-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">This Month</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">₹245,678</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Settlements Container */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Settlement History</h3>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-gray-100">
          {settlements.map((settlement) => (
            <div key={settlement.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{settlement.id}</span>
                <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${getStatusColor(settlement.status)}`}>
                  {settlement.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Bank: <strong className="text-gray-900">{settlement.bank}</strong></span>
                <span className="text-base font-bold text-gray-900">₹{settlement.amount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>{settlement.date} • Fee: ₹{settlement.fee}</span>
                <span className="font-mono text-gray-400">UTR: {settlement.utr}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Settlement ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Bank</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">UTR</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {settlements.map((settlement) => (
                <tr key={settlement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">{settlement.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{settlement.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{settlement.amount.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{settlement.fee}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{settlement.bank}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{settlement.utr}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-semibold ${getStatusColor(settlement.status)}`}>
                      {settlement.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderPOSManagement = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">POS Management</h1>
          <p className="text-xs text-gray-500 mt-0.5">Hardware terminal inventory, connectivity, and assisted services</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setActiveModule('banking');
              setBankingInitialAction('pos');
            }}
            className="flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 text-xs font-semibold shadow-xs min-h-[44px] sm:min-h-0"
          >
            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
            Launch POS Demo
          </button>
          <button className="flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs font-semibold min-h-[44px] sm:min-h-0">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Device
          </button>
        </div>
      </div>

      {/* POS Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total Devices</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{posDevices.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <Monitor className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Online Devices</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{dashboardData.activeDevices}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <Zap className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 sm:col-span-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Offline Devices</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{dashboardData.offlineDevices}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* POS Devices Container */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">POS Devices</h3>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-gray-100">
          {posDevices.map((device) => (
            <div key={device.id} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{device.id}</span>
                <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${getStatusColor(device.status)}`}>
                  {device.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{device.merchant}</p>
                  <p className="text-xs text-gray-500">Last active: {device.lastActive}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-gray-500 block">Transactions</span>
                  <p className="text-sm font-bold text-gray-900">{device.transactions}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => {
                    setActiveModule('banking');
                    setBankingInitialAction('pos');
                  }}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold min-h-[38px]"
                >
                  Run Demo
                </button>
                <button className="p-2 text-blue-600 hover:text-blue-900 rounded-lg min-w-[38px] min-h-[38px] flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-600 hover:text-red-900 rounded-lg min-w-[38px] min-h-[38px] flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Device ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Merchant</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transactions</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posDevices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">{device.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{device.merchant}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-semibold ${getStatusColor(device.status)}`}>
                      {device.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.lastActive}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{device.transactions}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => {
                        setActiveModule('banking');
                        setBankingInitialAction('pos');
                      }}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold"
                    >
                      Run Demo
                    </button>
                    <button className="text-blue-600 hover:text-blue-900 p-1">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="text-red-600 hover:text-red-900 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderMerchants = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Merchants</h1>
          <p className="text-xs text-gray-500 mt-0.5">Admin onboarding and merchant enterprise monitoring</p>
        </div>
        <button className="flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold min-h-[44px] sm:min-h-0 self-stretch sm:self-auto">
          <Plus className="w-4 h-4 mr-2" />
          Add Merchant
        </button>
      </div>

      {/* Merchants Container */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Merchant List</h3>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-gray-100">
          {merchants.map((merchant) => (
            <div key={merchant.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{merchant.id}</span>
                  <span className="ml-2 text-xs text-gray-500 font-medium">({merchant.businessType})</span>
                </div>
                <span className="text-base font-bold text-gray-900">₹{merchant.balance.toLocaleString('en-IN')}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{merchant.name}</p>
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>{merchant.devices} Devices • {merchant.transactions} Txns</span>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 text-blue-600 hover:text-blue-900 min-w-[36px] min-h-[36px] flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-green-600 hover:text-green-900 min-w-[36px] min-h-[36px] flex items-center justify-center">
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Merchant ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Business Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Devices</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transactions</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {merchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">{merchant.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{merchant.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{merchant.businessType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{merchant.balance.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{merchant.devices}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{merchant.transactions}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:text-blue-900 mr-3">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="text-green-600 hover:text-green-900">
                      <Edit className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Comprehensive audit reports for BBPS, POS, DMT, and Settlements</p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="flex items-center px-3.5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs font-semibold min-h-[40px]">
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Filter
          </button>
          <button className="flex items-center px-3.5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold min-h-[40px]">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">BBPS Reports</h3>
            <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Electricity, gas, water, FASTag and utility bill reconciliation</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1">
            <span>Generate BBPS Report</span> →
          </button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">POS Assisted Reports</h3>
            <CreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Terminal-wise card volume, merchant wallet credits, and batch cuts</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1">
            <span>Generate POS Report</span> →
          </button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Money Transfer (DMT)</h3>
            <Send className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Domestic IMPS and NEFT beneficiary payout audit logs and UTRs</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1">
            <span>Generate DMT Report</span> →
          </button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Recharge Reports</h3>
            <Smartphone className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Operator-wise Prepaid Mobile & DTH recharge commission logs</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1">
            <span>Generate Recharge Report</span> →
          </button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Transaction Reports</h3>
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">View detailed transaction analytics and trends</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Generate Report →</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Settlement Reports</h3>
            <DollarSign className="w-7 h-7 sm:w-8 sm:h-8 text-green-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Analyze settlement patterns and fees</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Generate Report →</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Wallet Reports</h3>
            <Wallet className="w-7 h-7 sm:w-8 sm:h-8 text-purple-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Track wallet balances and transactions</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Generate Report →</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">POS Performance</h3>
            <Monitor className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Monitor POS device usage and efficiency</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Generate Report →</button>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-xs border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Merchant Analytics</h3>
            <Building className="w-7 h-7 sm:w-8 sm:h-8 text-orange-600 shrink-0" />
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-4">Analyze merchant performance metrics</p>
          <button className="text-blue-600 hover:text-blue-800 font-semibold text-xs">Generate Report →</button>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeModule) {
      case 'dashboard': return renderDashboard();
      case 'wallet': return renderWallet();
      case 'bbps': return (
        <BBPSModule
          walletBalance={dashboardData.availableBalance}
          onPaymentSuccess={handleBbpsPaymentSuccess}
          onViewReceipt={(rcpt) => setActiveReceipt(rcpt)}
        />
      );
      case 'banking': return (
        <AssistedBankingModule
          walletBalance={dashboardData.availableBalance}
          posDevices={posDevices}
          onPosSuccess={handlePosSuccess}
          onTransferSuccess={handleTransferSuccess}
          onViewReceipt={(rcpt) => setActiveReceipt(rcpt)}
          initialAction={bankingInitialAction}
        />
      );
      case 'transactions': return renderTransactions();
      case 'settlements': return renderSettlements();
      case 'pos': return renderPOSManagement();
      case 'merchants': return renderMerchants();
      case 'reports': return renderReports();
      default: return renderDashboard();
    }
  };

  const modules = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'bbps', label: 'BBPS / Bill Payments', icon: Zap },
    { id: 'banking', label: 'Assisted Banking', icon: Landmark },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'settlements', label: 'Settlements', icon: FileText },
    { id: 'pos', label: 'POS Management', icon: Monitor },
    ...(userRole === 'admin' ? [{ id: 'merchants', label: 'Merchants', icon: Users }] : []),
    { id: 'reports', label: 'Reports', icon: FileText }
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer (Overlay for < md screens) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold text-gray-900 block leading-tight">PayPro</span>
              <span className="text-[11px] text-gray-500 font-medium">ReachPay Prototype</span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Close Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = activeModule === module.id;
            return (
              <button
                key={module.id}
                onClick={() => handleNavigate(module.id)}
                className={`w-full flex items-center px-3.5 py-3 text-left rounded-xl transition-colors text-sm font-medium min-h-[44px] ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-bold border-r-4 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                <span className="truncate">{module.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Drawer User Profile */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0 truncate">
                <p className="text-xs font-semibold text-gray-900 truncate">John Doe</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 capitalize">{userRole}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setUserRole(userRole === 'admin' ? 'merchant' : 'admin')}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-md shrink-0 min-h-[36px]"
            >
              Role
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Sidebar (Permanent column for >= md screens) */}
      <aside className={`hidden md:flex flex-col shrink-0 ${sidebarOpen ? 'w-64' : 'w-20'} bg-white shadow-lg transition-all duration-300`}>
        {/* Logo */}
        <div className="flex items-center p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && <span className="ml-3 text-xl font-bold text-gray-900">PayPro</span>}
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <ul className="space-y-1.5">
            {modules.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <li key={module.id}>
                  <button
                    onClick={() => {
                      setActiveModule(module.id);
                      if (module.id === 'banking') setBankingInitialAction('overview');
                    }}
                    className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-700'
                      : 'text-gray-700 hover:bg-gray-100 font-medium'
                      }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-500'}`} />
                    {sidebarOpen && <span className="ml-3 text-sm truncate">{module.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Desktop User Profile */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/50">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
              <Users className="w-5 h-5" />
            </div>
            {sidebarOpen && (
              <div className="ml-3 truncate">
                <p className="text-sm font-medium text-gray-900 truncate">John Doe</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 capitalize">{userRole}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white shadow-xs border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5">
            <div className="flex items-center flex-1 max-w-lg min-w-0">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 768) {
                    setMobileMenuOpen(prev => !prev);
                  } else {
                    setSidebarOpen(prev => !prev);
                  }
                }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 min-w-[42px] min-h-[42px] flex items-center justify-center shrink-0"
                title="Toggle Navigation Menu"
                aria-label="Toggle Navigation Menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Mobile PayPro Brand on small screens */}
              <div className="flex items-center gap-1.5 ml-2 md:hidden shrink-0">
                <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-gray-900 text-sm">PayPro</span>
              </div>

              {/* Search Bar - Responsive */}
              <div className="hidden sm:block ml-3 sm:ml-4 relative flex-1 max-w-xs md:max-w-md">
                <input
                  type="text"
                  placeholder="Search ReachPay services, bills..."
                  className="w-full pl-9 pr-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 sm:top-3" />
              </div>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
              {/* Interactive Role Switcher */}
              <div className="flex items-center bg-gray-100 p-0.5 sm:p-1 rounded-xl text-[11px] sm:text-xs font-semibold">
                <button
                  onClick={() => setUserRole('merchant')}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all min-h-[32px] sm:min-h-0 flex items-center ${userRole === 'merchant'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Merchant
                </button>
                <button
                  onClick={() => setUserRole('admin')}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg transition-all min-h-[32px] sm:min-h-0 flex items-center ${userRole === 'admin'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Admin
                </button>
              </div>

              <button
                className="relative p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 min-w-[38px] min-h-[38px] flex items-center justify-center"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              <div className="hidden lg:flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                  <Users className="w-4 h-4" />
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700 truncate max-w-[100px]">John Doe</span>
              </div>

              <button
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 min-w-[38px] min-h-[38px] flex items-center justify-center"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
          <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-7xl">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Global Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
          onTransferFunds={() => {
            setActiveReceipt(null);
            handleLaunchTransferFunds();
          }}
        />
      )}
    </div>
  );
};

export default App;