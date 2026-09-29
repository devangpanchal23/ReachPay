import React, { useState } from 'react';
import {
  Zap, Flame, Droplets, Smartphone, Tv, Wifi, Shield,
  Car, CreditCard, Landmark, Building, Phone, Search,
  CheckCircle, ArrowRight, RotateCw, Receipt, Clock,
  ChevronRight, AlertCircle, Sparkles, Filter
} from 'lucide-react';

const CATEGORIES = [
  { id: 'electricity', name: 'Electricity', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', group: 'utility' },
  { id: 'gas', name: 'Piped & LPG Gas', icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', group: 'utility' },
  { id: 'water', name: 'Water', icon: Droplets, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100', group: 'utility' },
  { id: 'credit-card', name: 'Credit Card Bill', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', group: 'finance' },
  { id: 'mobile-recharge', name: 'Mobile Recharge', icon: Smartphone, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', group: 'recharge' },
  { id: 'dth-recharge', name: 'DTH Recharge', icon: Tv, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', group: 'recharge' },
  { id: 'mobile-postpaid', name: 'Mobile Postpaid', icon: Smartphone, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', group: 'telecom' },
  { id: 'broadband', name: 'Broadband', icon: Wifi, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100', group: 'telecom' },
  { id: 'fastag', name: 'FASTag Recharge', icon: Car, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100', group: 'utility' },
  { id: 'insurance', name: 'Insurance Premium', icon: Shield, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', group: 'finance' },
  { id: 'loan-emi', name: 'Loan / EMI Repayment', icon: Landmark, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100', group: 'finance' },
  { id: 'municipal-tax', name: 'Municipal Tax', icon: Building, color: 'text-stone-600', bg: 'bg-stone-50', border: 'border-stone-100', group: 'utility' },
  { id: 'landline', name: 'Landline', icon: Phone, color: 'text-lime-600', bg: 'bg-lime-50', border: 'border-lime-100', group: 'telecom' },
];

const BILLERS_MAP = {
  electricity: [
    { id: 'torrent', name: 'Torrent Power', region: 'Gujarat / Maharashtra / UP', sampleConsumer: '1234567890', sampleAmount: 2450, sampleCustomer: 'Rahul Sharma', dueDate: '15 Oct 2026' },
    { id: 'bses', name: 'BSES Rajdhani Power Limited', region: 'Delhi NCR', sampleConsumer: '1004589211', sampleAmount: 3820, sampleCustomer: 'Pooja Verma', dueDate: '18 Oct 2026' },
    { id: 'tatapower', name: 'Tata Power (Mumbai/Delhi)', region: 'National', sampleConsumer: '9001284719', sampleAmount: 1940, sampleCustomer: 'Karan Mehra', dueDate: '20 Oct 2026' },
    { id: 'bescom', name: 'BESCOM Bangalore', region: 'Karnataka', sampleConsumer: '5501928312', sampleAmount: 1420, sampleCustomer: 'Venkatesh Rao', dueDate: '12 Oct 2026' },
    { id: 'adani', name: 'Adani Electricity Mumbai', region: 'Mumbai', sampleConsumer: '8821940129', sampleAmount: 4150, sampleCustomer: 'Sneha Patel', dueDate: '22 Oct 2026' }
  ],
  gas: [
    { id: 'indane', name: 'Indane Gas (LPG)', region: 'National', sampleConsumer: '7501928310', sampleAmount: 890, sampleCustomer: 'Sunita Devi', dueDate: '25 Oct 2026' },
    { id: 'bharatgas', name: 'Bharat Gas (BPCL)', region: 'National', sampleConsumer: '6620194812', sampleAmount: 890, sampleCustomer: 'Anil Kumar', dueDate: '28 Oct 2026' },
    { id: 'mahanagar', name: 'Mahanagar Gas Limited (MGL)', region: 'Mumbai', sampleConsumer: '4019283719', sampleAmount: 1120, sampleCustomer: 'Ramesh Joshi', dueDate: '16 Oct 2026' },
    { id: 'igl', name: 'Indraprastha Gas (IGL)', region: 'Delhi NCR', sampleConsumer: '3019284715', sampleAmount: 980, sampleCustomer: 'Vikram Batra', dueDate: '19 Oct 2026' }
  ],
  water: [
    { id: 'djb', name: 'Delhi Jal Board', region: 'Delhi', sampleConsumer: 'DJB9948210', sampleAmount: 640, sampleCustomer: 'Manish Gupta', dueDate: '24 Oct 2026' },
    { id: 'bwssb', name: 'Bangalore Water Supply (BWSSB)', region: 'Karnataka', sampleConsumer: 'BW9182740', sampleAmount: 780, sampleCustomer: 'Arjun Das', dueDate: '26 Oct 2026' },
    { id: 'mcgm', name: 'Municipal Corp of Greater Mumbai', region: 'Mumbai', sampleConsumer: 'MCGM81923', sampleAmount: 520, sampleCustomer: 'Nitin Sawant', dueDate: '15 Oct 2026' }
  ],
  'credit-card': [
    { id: 'hdfc-cc', name: 'HDFC Bank Credit Card', region: 'All Cards', sampleConsumer: '4582', totalDue: 18450, minDue: 2000, sampleCustomer: 'Rahul Sharma', dueDate: '18 Oct 2026' },
    { id: 'icici-cc', name: 'ICICI Bank Credit Card', region: 'All Cards', sampleConsumer: '8812', totalDue: 24600, minDue: 2500, sampleCustomer: 'Priya Patel', dueDate: '22 Oct 2026' },
    { id: 'sbi-card', name: 'SBI Card', region: 'All Cards', sampleConsumer: '3319', totalDue: 12300, minDue: 1500, sampleCustomer: 'Amit Kumar', dueDate: '14 Oct 2026' },
    { id: 'axis-cc', name: 'Axis Bank Credit Card', region: 'All Cards', sampleConsumer: '9102', totalDue: 31200, minDue: 3500, sampleCustomer: 'Deepak Shah', dueDate: '20 Oct 2026' }
  ],
  'mobile-recharge': [
    { id: 'jio-pre', name: 'Reliance Jio Prepaid', region: 'All Circles', sampleConsumer: '9876543210', sampleCustomer: 'Rohan Mehra' },
    { id: 'airtel-pre', name: 'Bharti Airtel Prepaid', region: 'All Circles', sampleConsumer: '9822019283', sampleCustomer: 'Divya Nair' },
    { id: 'vi-pre', name: 'Vodafone Idea (Vi)', region: 'All Circles', sampleConsumer: '9711204918', sampleCustomer: 'Sameer Khan' },
    { id: 'bsnl-pre', name: 'BSNL Mobile Prepaid', region: 'All Circles', sampleConsumer: '9419028471', sampleCustomer: 'Govind Swamy' }
  ],
  'dth-recharge': [
    { id: 'tataplay', name: 'Tata Play (Tata Sky)', region: 'Subscriber ID', sampleConsumer: '1029384710', sampleCustomer: 'Sanjay Kapoor' },
    { id: 'airteldth', name: 'Airtel Digital TV', region: 'Customer ID', sampleConsumer: '3019284719', sampleCustomer: 'Alok Nath' },
    { id: 'dishtv', name: 'Dish TV', region: 'Viewing Card No', sampleConsumer: '0192847192', sampleCustomer: 'Monika Roy' }
  ],
  'mobile-postpaid': [
    { id: 'airtel-post', name: 'Airtel Postpaid', region: 'National', sampleConsumer: '9810123456', sampleAmount: 899, sampleCustomer: 'Neeraj Chopra', dueDate: '17 Oct 2026' },
    { id: 'jio-post', name: 'Jio Postpaid Plus', region: 'National', sampleConsumer: '9988776655', sampleAmount: 699, sampleCustomer: 'Aditi Rao', dueDate: '21 Oct 2026' }
  ],
  broadband: [
    { id: 'jiofiber', name: 'JioFiber Broadband', region: 'National', sampleConsumer: 'JF98192831', sampleAmount: 1179, sampleCustomer: 'Harish Nair', dueDate: '23 Oct 2026' },
    { id: 'airtelxtream', name: 'Airtel Xstream Fiber', region: 'National', sampleConsumer: 'AX1029381', sampleAmount: 943, sampleCustomer: 'Suresh Raina', dueDate: '19 Oct 2026' }
  ],
  fastag: [
    { id: 'icici-fastag', name: 'ICICI Bank FASTag', region: 'Vehicle No / Tag ID', sampleConsumer: 'MH02EK1928', sampleAmount: 1000, sampleCustomer: 'Rajesh Khanna', dueDate: 'Recharge Anytime' },
    { id: 'sbi-fastag', name: 'SBI FASTag', region: 'Vehicle No / Tag ID', sampleConsumer: 'DL01AB4421', sampleAmount: 1500, sampleCustomer: 'Simran Kaur', dueDate: 'Recharge Anytime' }
  ],
  insurance: [
    { id: 'lic', name: 'Life Insurance Corp (LIC)', region: 'Policy Number', sampleConsumer: '881928371', sampleAmount: 6540, sampleCustomer: 'Dharmendra Yadav', dueDate: '29 Oct 2026' },
    { id: 'hdfclife', name: 'HDFC Life Insurance', region: 'Policy Number', sampleConsumer: 'HL9102938', sampleAmount: 12400, sampleCustomer: 'Kavita Joshi', dueDate: '30 Oct 2026' }
  ],
  'loan-emi': [
    { id: 'bajaj', name: 'Bajaj Finance Limited', region: 'Loan Account No', sampleConsumer: 'L6NM918274', sampleAmount: 4890, sampleCustomer: 'Pawan Verma', dueDate: '05 Nov 2026' },
    { id: 'tatacap', name: 'Tata Capital Financial', region: 'Loan Account No', sampleConsumer: 'TC01928374', sampleAmount: 8200, sampleCustomer: 'Girish Kulkarni', dueDate: '10 Nov 2026' }
  ],
  'municipal-tax': [
    { id: 'mcgm-tax', name: 'MCGM Property Tax', region: 'Mumbai SAC No', sampleConsumer: 'SAC91029381', sampleAmount: 3450, sampleCustomer: 'Anand Shinde', dueDate: '15 Nov 2026' }
  ],
  landline: [
    { id: 'bsnl-ll', name: 'BSNL Landline', region: 'STD + Phone No', sampleConsumer: '02228491029', sampleAmount: 499, sampleCustomer: 'Leela Menon', dueDate: '18 Oct 2026' }
  ]
};

const RECHARGE_PLANS = [
  { id: 'p1', amount: 299, validity: '28 Days', data: '1.5 GB/Day', calls: 'Unlimited Calls', desc: 'Truly Unlimited Voice + 100 SMS/Day' },
  { id: 'p2', amount: 349, validity: '28 Days', data: '2.0 GB/Day', calls: 'Unlimited Calls', desc: 'Hero Unlimited + Disney+ Hotstar Mobile 3M' },
  { id: 'p3', amount: 719, validity: '84 Days', data: '1.5 GB/Day', calls: 'Unlimited Calls', desc: 'Best Seller 84 Days pack with 100 SMS/Day' },
  { id: 'p4', amount: 1499, validity: '84 Days', data: '3.0 GB/Day', calls: 'Unlimited Calls', desc: 'Premium Streaming Pack + Weekend Rollover' },
  { id: 'p5', amount: 2999, validity: '365 Days', data: '2.5 GB/Day', calls: 'Unlimited Calls', desc: 'Annual Super Saver Pack with Prime Video' }
];

const BBPSModule = ({ onPaymentSuccess, onViewReceipt, walletBalance = 89567 }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBiller, setSelectedBiller] = useState(null);
  const [consumerNumber, setConsumerNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Multi-step modal state: 'select' | 'input' | 'fetching' | 'details' | 'processing' | 'success'
  const [flowStep, setFlowStep] = useState(null);
  const [fetchedBill, setFetchedBill] = useState(null);
  const [creditCardPayOption, setCreditCardPayOption] = useState('total'); // 'total' | 'min' | 'custom'
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(RECHARGE_PLANS[0]);
  const [lastPaymentTxn, setLastPaymentTxn] = useState(null);

  // Recent bill payments (sample demo history)
  const [recentBills, setRecentBills] = useState([
    { id: 'BBPS-20260928-101', biller: 'Torrent Power', service: 'Electricity', customer: 'Rahul Sharma', amount: 2450, date: '28 Sep 2026', status: 'success' },
    { id: 'BBPS-20260927-089', biller: 'HDFC Bank Credit Card', service: 'Credit Card Bill', customer: 'Rahul Sharma', amount: 18450, date: '27 Sep 2026', status: 'success' },
    { id: 'BBPS-20260926-042', biller: 'Reliance Jio Prepaid', service: 'Mobile Recharge', customer: 'Rohan Mehra', amount: 299, date: '26 Sep 2026', status: 'success' },
    { id: 'BBPS-20260925-014', biller: 'Indane Gas', service: 'Piped & LPG Gas', customer: 'Sunita Devi', amount: 890, date: '25 Sep 2026', status: 'success' },
  ]);

  const filteredCategories = CATEGORIES.filter(c => {
    const matchesTab = activeTab === 'all' || c.group === activeTab;
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleOpenCategory = (cat) => {
    setSelectedCategory(cat);
    const billers = BILLERS_MAP[cat.id] || BILLERS_MAP['electricity'];
    setSelectedBiller(billers[0]);
    setConsumerNumber(billers[0].sampleConsumer || '1234567890');
    setMobileNumber('9876543210');
    setCustomAmount(billers[0].totalDue ? billers[0].totalDue.toString() : '');
    setFlowStep('input');
  };

  const handleSelectBiller = (biller) => {
    setSelectedBiller(biller);
    setConsumerNumber(biller.sampleConsumer || '1234567890');
    if (biller.totalDue) {
      setCustomAmount(biller.totalDue.toString());
    }
  };

  const handleFetchBill = () => {
    setFlowStep('fetching');
    setTimeout(() => {
      let billData;
      if (selectedCategory.id === 'credit-card') {
        billData = {
          customer: selectedBiller.sampleCustomer || 'Rahul Sharma',
          biller: selectedBiller.name,
          accountNumber: `XXXX XXXX ${consumerNumber.slice(-4) || '4582'}`,
          totalDue: selectedBiller.totalDue || 18450,
          minDue: selectedBiller.minDue || 2000,
          dueDate: selectedBiller.dueDate || '18 Oct 2026',
          billDate: '01 Oct 2026',
          mobile: mobileNumber || '9876543210'
        };
      } else if (selectedCategory.id === 'mobile-recharge' || selectedCategory.id === 'dth-recharge') {
        billData = {
          customer: selectedBiller.sampleCustomer || 'Rahul Sharma',
          biller: selectedBiller.name,
          consumerNo: consumerNumber || '9876543210',
          plan: selectedPlan,
          status: 'Active'
        };
      } else {
        billData = {
          customer: selectedBiller.sampleCustomer || 'Rahul Sharma',
          biller: selectedBiller.name,
          consumerNo: consumerNumber || '1234567890',
          amount: selectedBiller.sampleAmount || 2450,
          dueDate: selectedBiller.dueDate || '15 Oct 2026',
          billDate: '01 Oct 2026',
          status: 'Unpaid',
          billPeriod: 'September 2026'
        };
      }
      setFetchedBill(billData);
      setFlowStep('details');
    }, 1000);
  };

  const getPayAmount = () => {
    if (!selectedCategory) return 0;
    if (selectedCategory.id === 'credit-card') {
      if (creditCardPayOption === 'total') return fetchedBill?.totalDue || 18450;
      if (creditCardPayOption === 'min') return fetchedBill?.minDue || 2000;
      return Number(customAmount) || 0;
    }
    if (selectedCategory.id === 'mobile-recharge' || selectedCategory.id === 'dth-recharge') {
      return selectedPlan.amount;
    }
    return fetchedBill?.amount || 2450;
  };

  const handleConfirmPayment = () => {
    setFlowStep('processing');
    const payAmount = getPayAmount();
    const txnId = `BBPS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
    const utr = `BBPS${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    setTimeout(() => {
      const txnRecord = {
        id: txnId,
        date: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        service: selectedCategory.name,
        category: selectedCategory.id,
        biller: selectedBiller.name,
        customer: fetchedBill?.customer || 'Rahul Sharma',
        consumerNo: consumerNumber,
        amount: payAmount,
        fee: 0,
        status: 'success',
        type: 'bbps',
        utr: utr,
        terminalId: 'WEB-BBPS-01'
      };

      setLastPaymentTxn(txnRecord);
      setRecentBills(prev => [txnRecord, ...prev]);

      if (onPaymentSuccess) {
        onPaymentSuccess(txnRecord);
      }

      setFlowStep('success');
    }, 1500);
  };

  const handleCloseFlow = () => {
    setFlowStep(null);
    setSelectedCategory(null);
    setSelectedBiller(null);
    setFetchedBill(null);
  };

  return (
    <div className="space-y-6">
      {/* BBPS Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-semibold text-xs rounded-full border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Bharat BillPay Enabled
              </span>
              <span className="px-2.5 py-0.5 bg-white/10 text-blue-100 font-mono text-xs rounded-full">
                NPCI Certified Hub
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">BBPS / Bill Payments Hub</h1>
            <p className="text-blue-100 text-sm mt-1 max-w-xl">
              Pay electricity, water, gas, FASTag, credit card bills, and mobile/DTH recharges with instant confirmation.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
            <div>
              <p className="text-xs text-blue-200">Merchant Wallet Balance</p>
              <p className="text-xl font-bold">₹{Number(walletBalance).toLocaleString('en-IN')}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-300">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-blue-200 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by biller, utility, provider or recharge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/70 text-sm focus:outline-hidden focus:ring-2 focus:ring-white/40 focus:bg-white/15"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 text-xs font-medium">
            {[
              { id: 'all', label: 'All Services' },
              { id: 'utility', label: 'Utilities' },
              { id: 'finance', label: 'Banking & Cards' },
              { id: 'recharge', label: 'Recharges' },
              { id: 'telecom', label: 'Telecom' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${activeTab === tab.id
                  ? 'bg-white text-blue-900 font-semibold shadow-xs'
                  : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BBPS Category Grid */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">Select Bill Payment Category</h2>
          <span className="text-xs text-gray-500">{filteredCategories.length} categories available</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
          {filteredCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => handleOpenCategory(cat)}
                className="group p-5 bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md hover:border-blue-300 transition-all text-left flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${cat.bg} ${cat.border} border flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <Icon className={`w-6 h-6 ${cat.color}`} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Instant Bill Fetch & Pay</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Popular Billers Quick Strip */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" /> Popular Billers in Your Region
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { catId: 'electricity', billerIdx: 0, label: 'Torrent Power', tag: 'Electricity' },
            { catId: 'credit-card', billerIdx: 0, label: 'HDFC Credit Card', tag: 'Cards' },
            { catId: 'mobile-recharge', billerIdx: 0, label: 'Jio Prepaid', tag: 'Recharge' },
            { catId: 'gas', billerIdx: 0, label: 'Indane Gas', tag: 'Gas LPG' },
            { catId: 'fastag', billerIdx: 0, label: 'ICICI FASTag', tag: 'Toll' },
            { catId: 'water', billerIdx: 0, label: 'Delhi Jal Board', tag: 'Water' }
          ].map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                const cat = CATEGORIES.find(c => c.id === item.catId);
                if (cat) {
                  setSelectedCategory(cat);
                  const billers = BILLERS_MAP[cat.id] || [];
                  setSelectedBiller(billers[item.billerIdx] || billers[0]);
                  setConsumerNumber(billers[item.billerIdx]?.sampleConsumer || '1234567890');
                  setFlowStep('input');
                }
              }}
              className="p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50/50 hover:border-blue-200 transition-all text-left"
            >
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">{item.tag}</span>
              <p className="font-medium text-xs text-gray-900 truncate mt-0.5">{item.label}</p>
              <span className="text-[10px] text-gray-500">Tap to pay →</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Bill Payments Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-900">Recent Bill Payments & Recharges</h3>
            <p className="text-xs text-gray-500">Completed BBPS transactions for customers</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
            BBPS Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Txn ID</th>
                <th className="px-6 py-3">Service & Biller</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-900">{bill.id}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{bill.biller}</p>
                    <p className="text-xs text-gray-500">{bill.service}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{bill.customer}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">{bill.date}</td>
                  <td className="px-6 py-4 font-bold text-gray-900">₹{bill.amount.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      <CheckCircle className="w-3 h-3 text-green-600" /> Success
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onViewReceipt && onViewReceipt(bill)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================== */}
      {/* BBPS MULTI-STEP DEMO MODAL */}
      {/* ==================================================== */}
      {flowStep && selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${selectedCategory.bg} flex items-center justify-center`}>
                  <selectedCategory.icon className={`w-5 h-5 ${selectedCategory.color}`} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{selectedCategory.name}</h3>
                  <p className="text-xs text-gray-500">Bharat Bill Payment System (BBPS)</p>
                </div>
              </div>
              <button
                onClick={handleCloseFlow}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* STEP: INPUT (Select biller + enter consumer number) */}
            {flowStep === 'input' && (
              <div className="p-6 space-y-5">
                {/* Select Biller dropdown / list */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
                    Select Biller / Service Provider
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {(BILLERS_MAP[selectedCategory.id] || BILLERS_MAP['electricity']).map((biller) => (
                      <button
                        key={biller.id}
                        type="button"
                        onClick={() => handleSelectBiller(biller)}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${selectedBiller?.id === biller.id
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-800'
                          }`}
                      >
                        <div>
                          <p className="text-sm font-semibold">{biller.name}</p>
                          <p className="text-xs text-gray-500">{biller.region}</p>
                        </div>
                        {selectedBiller?.id === biller.id && (
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Consumer / Card / Mobile Input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    {selectedCategory.id === 'credit-card' ? 'Last 4 Digits of Card / Customer ID' :
                      selectedCategory.id === 'mobile-recharge' || selectedCategory.id === 'mobile-postpaid' ? 'Mobile Number' :
                        selectedCategory.id === 'fastag' ? 'Vehicle Registration Number' :
                          selectedCategory.id === 'insurance' ? 'Policy Number' : 'Consumer Number / Customer ID'}
                  </label>
                  <input
                    type="text"
                    value={consumerNumber}
                    onChange={(e) => setConsumerNumber(e.target.value)}
                    placeholder="e.g. 1234567890"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Sample demo identifier pre-filled. You can change or click "Fetch Bill".
                  </p>
                </div>

                {selectedCategory.id === 'credit-card' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                      Registered Mobile Number
                    </label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    />
                  </div>
                )}

                {/* For Recharges: Plan Selector */}
                {(selectedCategory.id === 'mobile-recharge' || selectedCategory.id === 'dth-recharge') && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
                      Select Recharge Plan
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {RECHARGE_PLANS.map((plan) => (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedPlan.id === plan.id
                            ? 'border-blue-600 bg-blue-50/50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-base font-bold text-gray-900">₹{plan.amount}</span>
                            <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {plan.validity}
                            </span>
                          </div>
                          <p className="text-xs text-blue-700 font-medium mt-1">{plan.data} • {plan.calls}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{plan.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer buttons */}
                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseFlow}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFetchBill}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5"
                  >
                    <span>Fetch Bill Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP: FETCHING ANIMATION */}
            {flowStep === 'fetching' && (
              <div className="p-12 text-center space-y-4">
                <div className="inline-flex p-4 bg-blue-50 rounded-full animate-spin">
                  <RotateCw className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="text-lg font-bold text-gray-900">Querying BBPS Gateway...</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Connecting to {selectedBiller?.name} via Bharat BillPay Central Unit (BBPCU) to retrieve latest bill...
                </p>
              </div>
            )}

            {/* STEP: DETAILS (Show bill details & payment options) */}
            {flowStep === 'details' && fetchedBill && (
              <div className="p-6 space-y-5">
                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
                        Biller Verification Succeeded
                      </span>
                      <h4 className="font-bold text-gray-900 text-base">{fetchedBill.biller}</h4>
                      <p className="text-xs text-gray-600 mt-0.5">Customer: <strong className="text-gray-900">{fetchedBill.customer}</strong></p>
                    </div>
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                      Verified
                    </span>
                  </div>

                  {/* Credit Card Specific details */}
                  {selectedCategory.id === 'credit-card' ? (
                    <div className="mt-4 pt-3 border-t border-blue-200/60 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-white p-3 rounded-xl border border-blue-100">
                          <p className="text-gray-500">Total Amount Due</p>
                          <p className="text-lg font-bold text-gray-900">₹{fetchedBill.totalDue.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-blue-100">
                          <p className="text-gray-500">Minimum Amount Due</p>
                          <p className="text-lg font-bold text-gray-900">₹{fetchedBill.minDue.toLocaleString('en-IN')}</p>
                        </div>
                      </div>

                      <div className="text-xs flex justify-between text-gray-600 px-1">
                        <span>Card: {fetchedBill.accountNumber}</span>
                        <span className="text-rose-600 font-semibold">Due Date: {fetchedBill.dueDate}</span>
                      </div>

                      {/* Payment Option Selector */}
                      <div className="pt-2">
                        <label className="block text-xs font-semibold text-gray-700 mb-2">Select Payment Amount</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setCreditCardPayOption('total')}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${creditCardPayOption === 'total'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                              }`}
                          >
                            Total Due (₹{fetchedBill.totalDue})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreditCardPayOption('min')}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${creditCardPayOption === 'min'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                              }`}
                          >
                            Min Due (₹{fetchedBill.minDue})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreditCardPayOption('custom')}
                            className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${creditCardPayOption === 'custom'
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                              }`}
                          >
                            Custom Amount
                          </button>
                        </div>

                        {creditCardPayOption === 'custom' && (
                          <div className="mt-2">
                            <input
                              type="number"
                              placeholder="Enter custom payment amount"
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm font-semibold"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : selectedCategory.id === 'mobile-recharge' || selectedCategory.id === 'dth-recharge' ? (
                    <div className="mt-4 pt-3 border-t border-blue-200/60 flex justify-between items-center text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Selected Plan</p>
                        <p className="font-bold text-gray-900">{selectedPlan.validity} • {selectedPlan.data}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Recharge Amount</p>
                        <p className="text-xl font-bold text-blue-700">₹{selectedPlan.amount}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-3 border-t border-blue-200/60 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Consumer Number:</span>
                        <span className="font-mono font-medium text-gray-900">{fetchedBill.consumerNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Bill Due Date:</span>
                        <span className="font-semibold text-rose-600">{fetchedBill.dueDate}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-blue-100">
                        <span className="text-sm font-bold text-gray-900">Bill Amount Payable:</span>
                        <span className="text-xl font-extrabold text-blue-700">₹{fetchedBill.amount.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Source of funds notice */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    <span>Pay via <strong>Merchant Wallet</strong> (Balance: ₹{Number(walletBalance).toLocaleString('en-IN')})</span>
                  </div>
                  <span className="text-green-600 font-semibold">Zero Fee</span>
                </div>

                {/* Actions */}
                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setFlowStep('input')}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                  >
                    ← Change Biller / Details
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
                  >
                    <span>Confirm & Pay ₹{getPayAmount().toLocaleString('en-IN')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP: PROCESSING SIMULATION */}
            {flowStep === 'processing' && (
              <div className="p-12 text-center space-y-4">
                <div className="inline-flex p-4 bg-emerald-50 rounded-full animate-spin">
                  <RotateCw className="w-8 h-8 text-emerald-600" />
                </div>
                <h4 className="text-lg font-bold text-gray-900">Processing Payment...</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Authorizing transaction through BBPS payment gateway and updating biller records in real-time...
                </p>
              </div>
            )}

            {/* STEP: SUCCESS */}
            {flowStep === 'success' && lastPaymentTxn && (
              <div className="p-8 text-center space-y-5">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10" />
                </div>

                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                    Payment Successful
                  </span>
                  <h3 className="text-2xl font-bold text-gray-900 mt-2">
                    ₹{lastPaymentTxn.amount.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Paid to {lastPaymentTxn.biller}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs space-y-1.5 text-left max-w-sm mx-auto font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Transaction ID:</span>
                    <span className="font-semibold text-gray-900">{lastPaymentTxn.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">BBPS UTR:</span>
                    <span className="font-semibold text-gray-900">{lastPaymentTxn.utr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customer:</span>
                    <span className="text-gray-900 font-sans">{lastPaymentTxn.customer}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={() => {
                      if (onViewReceipt) onViewReceipt(lastPaymentTxn);
                      handleCloseFlow();
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Receipt className="w-4 h-4" /> View Full Receipt
                  </button>

                  <button
                    onClick={handleCloseFlow}
                    className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BBPSModule;
