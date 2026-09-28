import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  LayoutDashboard, CreditCard, Wallet, FileText, Building, Users,
  Settings, Bell, Search, Filter, Download, Eye, CheckCircle, XCircle,
  AlertTriangle, Clock, TrendingUp, DollarSign, Activity, LogOut,
  Menu, ChevronDown, Plus, Trash2, Edit, Zap, Smartphone, Monitor
} from 'lucide-react';

const App = () => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState('merchant'); // 'admin' or 'merchant'

  // Mock data
  const dashboardData = {
    totalVolume: 1245678,
    todayTransactions: 142,
    availableBalance: 89567,
    pendingSettlement: 23456,
    completedSettlements: 45,
    activeDevices: 12,
    offlineDevices: 3
  };

  const walletTransactions = [
    { id: 'WTX001', date: '2023-06-15', amount: 12500, type: 'credit', status: 'completed', description: 'POS Transaction' },
    { id: 'WTX002', date: '2023-06-14', amount: -5000, type: 'debit', status: 'completed', description: 'Settlement Fee' },
    { id: 'WTX003', date: '2023-06-13', amount: 8900, type: 'credit', status: 'pending', description: 'POS Transaction' },
    { id: 'WTX004', date: '2023-06-12', amount: 15600, type: 'credit', status: 'completed', description: 'POS Transaction' },
    { id: 'WTX005', date: '2023-06-11', amount: -2500, type: 'debit', status: 'completed', description: 'Withdrawal' }
  ];

  const transactions = [
    { id: 'TXN001', date: '2023-06-15', amount: 1250, status: 'success', terminalId: 'POS001', customer: 'John Doe' },
    { id: 'TXN002', date: '2023-06-15', amount: 890, status: 'failed', terminalId: 'POS002', customer: 'Jane Smith' },
    { id: 'TXN003', date: '2023-06-14', amount: 2100, status: 'pending', terminalId: 'POS003', customer: 'Bob Johnson' },
    { id: 'TXN004', date: '2023-06-14', amount: 750, status: 'success', terminalId: 'POS001', customer: 'Alice Brown' },
    { id: 'TXN005', date: '2023-06-13', amount: 3200, status: 'success', terminalId: 'POS004', customer: 'Charlie Wilson' }
  ];

  const settlements = [
    { id: 'SET001', date: '2023-06-15', amount: 25000, fee: 250, status: 'completed', utr: 'UTR001', bank: 'HDFC' },
    { id: 'SET002', date: '2023-06-14', amount: 18000, fee: 180, status: 'completed', utr: 'UTR002', bank: 'SBI' },
    { id: 'SET003', date: '2023-06-13', amount: 32000, fee: 320, status: 'pending', utr: 'UTR003', bank: 'ICICI' },
    { id: 'SET004', date: '2023-06-12', amount: 15000, fee: 150, status: 'processing', utr: 'UTR004', bank: 'Axis' }
  ];

  const posDevices = [
    { id: 'POS001', merchant: 'ABC Retail', status: 'online', lastActive: '2023-06-15 14:30', transactions: 45 },
    { id: 'POS002', merchant: 'XYZ Store', status: 'offline', lastActive: '2023-06-14 10:15', transactions: 23 },
    { id: 'POS003', merchant: 'PQR Shop', status: 'online', lastActive: '2023-06-15 12:45', transactions: 38 },
    { id: 'POS004', merchant: 'DEF Market', status: 'online', lastActive: '2023-06-15 11:20', transactions: 52 }
  ];

  const merchants = [
    { id: 'M001', name: 'ABC Retail', businessType: 'Grocery', balance: 12500, devices: 2, transactions: 145 },
    { id: 'M002', name: 'XYZ Store', businessType: 'Electronics', balance: 8900, devices: 1, transactions: 89 },
    { id: 'M003', name: 'PQR Shop', businessType: 'Clothing', balance: 15600, devices: 1, transactions: 123 },
    { id: 'M004', name: 'DEF Market', businessType: 'Supermarket', balance: 22300, devices: 3, transactions: 201 }
  ];

  const chartData = [
    { name: 'Mon', transactions: 45, revenue: 12500 },
    { name: 'Tue', transactions: 52, revenue: 18900 },
    { name: 'Wed', transactions: 38, revenue: 14200 },
    { name: 'Thu', transactions: 61, revenue: 21000 },
    { name: 'Fri', transactions: 55, revenue: 19500 },
    { name: 'Sat', transactions: 72, revenue: 24800 },
    { name: 'Sun', transactions: 48, revenue: 16700 }
  ];

  const getStatusColor = (status) => {
    switch(status) {
      case 'success': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'online': return 'text-green-600 bg-green-100';
      case 'offline': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex space-x-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Volume</p>
              <p className="text-2xl font-bold text-gray-900">₹{dashboardData.totalVolume.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.todayTransactions}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available Balance</p>
              <p className="text-2xl font-bold text-gray-900">₹{dashboardData.availableBalance.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Wallet className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Settlement</p>
              <p className="text-2xl font-bold text-gray-900">₹{dashboardData.pendingSettlement.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Volume</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="transactions" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
          <div className="space-y-3">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{tx.id}</p>
                  <p className="text-sm text-gray-600">{tx.customer}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">₹{tx.amount}</p>
                  <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">POS Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Active Devices</span>
              <span className="font-semibold text-green-600">{dashboardData.activeDevices}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Offline Devices</span>
              <span className="font-semibold text-red-600">{dashboardData.offlineDevices}</span>
            </div>
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Device Health</span>
                <span className="text-sm font-medium">85%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: '85%'}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWallet = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Wallet Management</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Add Funds
        </button>
      </div>

      {/* Wallet Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available Balance</p>
              <p className="text-2xl font-bold text-gray-900">₹{dashboardData.availableBalance.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Wallet className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Balance</p>
              <p className="text-2xl font-bold text-gray-900">₹{dashboardData.pendingSettlement.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">₹156,780</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {walletTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tx.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.description}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'credit' ? '+' : ''}{tx.amount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(tx.status)}`}>
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

  const renderTransactions = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="flex space-x-2">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Transaction Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-full mr-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Successful</p>
              <p className="text-xl font-semibold text-gray-900">142</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-full mr-3">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-xl font-semibold text-gray-900">12</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-full mr-3">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-xl font-semibold text-gray-900">5</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-full mr-3">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-xl font-semibold text-gray-900">₹124,567</p>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">All Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Terminal</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tx.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.customer}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.terminalId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₹{tx.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:text-blue-900 mr-3">
                      <Eye className="w-4 h-4" />
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

  const renderSettlements = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Request Settlement
        </button>
      </div>

      {/* Settlement Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed Settlements</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.completedSettlements}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Settlements</p>
              <p className="text-2xl font-bold text-gray-900">8</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">This Month</p>
              <p className="text-2xl font-bold text-gray-900">₹245,678</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Settlement History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Settlement ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UTR</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {settlements.map((settlement) => (
                <tr key={settlement.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{settlement.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{settlement.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₹{settlement.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{settlement.fee}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{settlement.bank}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{settlement.utr}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(settlement.status)}`}>
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">POS Management</h1>
        <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Device
        </button>
      </div>

      {/* POS Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Devices</p>
              <p className="text-2xl font-bold text-gray-900">{posDevices.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Monitor className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Online Devices</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.activeDevices}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Zap className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Offline Devices</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData.offlineDevices}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* POS Devices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">POS Devices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Merchant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posDevices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{device.merchant}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getStatusColor(device.status)}`}>
                      {device.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.lastActive}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{device.transactions}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button className="text-blue-600 hover:text-blue-900">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="text-red-600 hover:text-red-900">
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Merchants</h1>
        <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Merchant
        </button>
      </div>

      {/* Merchants Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Merchant List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merchant ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Devices</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transactions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {merchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{merchant.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{merchant.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{merchant.businessType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₹{merchant.balance}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{merchant.devices}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{merchant.transactions}</td>
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex space-x-2">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Search className="w-4 h-4 mr-2" />
            Filter
          </button>
          <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Transaction Reports</h3>
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-gray-600 mb-4">View detailed transaction analytics and trends</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Settlement Reports</h3>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-gray-600 mb-4">Analyze settlement patterns and fees</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Wallet Reports</h3>
            <Wallet className="w-8 h-8 text-purple-600" />
          </div>
          <p className="text-gray-600 mb-4">Track wallet balances and transactions</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">POS Performance</h3>
            <Monitor className="w-8 h-8 text-indigo-600" />
          </div>
          <p className="text-gray-600 mb-4">Monitor POS device usage and efficiency</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Merchant Analytics</h3>
            <Building className="w-8 h-8 text-orange-600" />
          </div>
          <p className="text-gray-600 mb-4">Analyze merchant performance metrics</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Revenue Analysis</h3>
            <TrendingUp className="w-8 h-8 text-teal-600" />
          </div>
          <p className="text-gray-600 mb-4">Comprehensive revenue and growth analysis</p>
          <button className="text-blue-600 hover:text-blue-800 font-medium">Generate Report →</button>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch(activeModule) {
      case 'dashboard': return renderDashboard();
      case 'wallet': return renderWallet();
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
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'settlements', label: 'Settlements', icon: FileText },
    { id: 'pos', label: 'POS Management', icon: Monitor },
    ...(userRole === 'admin' ? [{ id: 'merchants', label: 'Merchants', icon: Users }] : []),
    { id: 'reports', label: 'Reports', icon: FileText }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white shadow-lg transition-all duration-300`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center p-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              {sidebarOpen && <span className="ml-3 text-xl font-bold text-gray-900">PayPro</span>}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6">
            <ul className="space-y-2">
              {modules.map((module) => {
                const Icon = module.icon;
                return (
                  <li key={module.id}>
                    <button
                      onClick={() => setActiveModule(module.id)}
                      className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                        activeModule === module.id
                          ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {sidebarOpen && <span className="ml-3">{module.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              {sidebarOpen && (
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">John Doe</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <div className="ml-4 relative">
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="relative p-2 text-gray-600 hover:text-gray-900">
                <Bell className="w-5 h-5" />
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700">John Doe</span>
              </div>
              <button className="p-2 text-gray-600 hover:text-gray-900">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
          <div className="container mx-auto px-6 py-8">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;