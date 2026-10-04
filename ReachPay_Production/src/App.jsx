import { useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Bell, BookOpenCheck, ChevronDown, CircleHelp, Clock3, FileText, LayoutDashboard, LifeBuoy, LockKeyhole, Menu, Plus, Search, ShieldCheck, Users, Wallet, Zap } from 'lucide-react';

const steps = [
  ['Amount', 'Choose a settlement amount'], ['Payment', 'Pay through an approved channel'], ['POS confirmation', 'Provider confirms collection'], ['POS wallet', 'Reconcile the provider credit'], ['ReachPay wallet', 'Verified funds become available'], ['Settle', 'Choose an enabled service'], ['Beneficiary', 'Send an approved payout'], ['Bill payment', 'Pay through an authorized BBPS partner']
];
const categories = [
  { name: 'Utilities', items: ['Electricity', 'Water', 'Piped gas', 'LPG'] },
  { name: 'Telecom & connectivity', items: ['Mobile prepaid/postpaid', 'Landline', 'Broadband', 'DTH / Cable TV'] },
  { name: 'Financial services', items: ['Loan EMI', 'Credit card bill', 'Insurance premium', 'Recurring deposit'] },
  { name: 'Government & municipal', items: ['Municipal / property tax', 'eChallan', 'Passport fees'] },
  { name: 'Education & housing', items: ['School / university fees', 'Housing society maintenance'] },
  { name: 'Transport & other', items: ['FASTag', 'Hospital bills', 'Club fees', 'OTT subscriptions'] }
];
const sectionDescriptions = {
  'Wallet & ledger': 'Balances are derived from immutable provider-confirmed ledger entries.', Transactions: 'Provider-confirmed transaction records and state history.',
  Beneficiaries: 'Beneficiary records are private and require identity and destination verification.', 'Bill payments': 'Live billers and inquiry/pay flows come only from the authorized BBPS provider.',
  Collections: 'Collection requests remain pending until the payment/POS provider verifies the credit.', Payouts: 'Payout requests require a verified beneficiary and an atomic wallet hold.',
  Reconciliation: 'Compare ReachPay journal entries against provider and POS settlement records.', Reports: 'Statements and operational reports are generated from persisted records.'
};

export default function App() {
  const [section, setSection] = useState('Overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const nav = [
    { group: 'WORKSPACE', items: [['Overview', LayoutDashboard], ['Wallet & ledger', Wallet], ['Transactions', ArrowLeftRight], ['Beneficiaries', Users], ['Bill payments', Zap]] },
    { group: 'OPERATIONS', items: [['Collections', ArrowDownToLine], ['Payouts', ArrowUpRight], ['Reconciliation', BookOpenCheck], ['Reports', FileText]] },
  ];
  const shownCategories = categories.map((cat) => ({ ...cat, items: cat.items.filter((item) => `${cat.name} ${item}`.toLowerCase().includes(search.toLowerCase())) })).filter((cat) => cat.items.length);
  const request = async (name) => {
    setNotice(`${name} is unavailable until ReachPay identity, database, and an authorized provider are configured. No transaction was created.`);
    window.setTimeout(() => setNotice(''), 7000);
  };
  return <div className="shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#overview" aria-label="ReachPay home"><span className="brand-mark">R</span><span>reach<span className="brand-light">pay</span><small>FINANCIAL OPERATIONS</small></span></a>
      <div className="workspace-select"><div className="avatar">RP</div><div><b>ReachPay workspace</b><small>Production environment</small></div><ChevronDown size={15}/></div>
      <nav aria-label="Main navigation">{nav.map((group) => <div className="nav-group" key={group.group}><p>{group.group}</p>{group.items.map(([name, Icon]) => <button key={name} onClick={() => { setSection(name); setMobileNav(false); }} className={`nav-item ${section === name ? 'active' : ''}`}><Icon size={17}/>{name}{name === 'Reconciliation' && <span className="nav-dot"/>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><ShieldCheck size={18}/><span><b>Secure workspace</b><small>Transaction controls active</small></span></div><button className="nav-item"><LifeBuoy size={17}/> Help & support</button><div className="user-card"><div className="avatar avatar-user">U</div><div><b>Signed-in user required</b><small>Identity provider not configured</small></div><ChevronDown size={14}/></div></div>
    </aside>
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="crumb">Workspace <span>/</span> <b>{section}</b></div><div className="top-actions"><div className="system-status"><i/> Provider connections <b>Not configured</b></div><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="user-chip"><div className="avatar avatar-user">U</div><span><b>Authentication required</b><small>Session unavailable</small></span><ChevronDown size={14}/></div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow">MONDAY, 05 OCTOBER 2026 <span>·</span> FINANCIAL OPERATIONS</div><h1>{section === 'Overview' ? 'Good morning' : section}</h1><p>Track your collections, wallet activity and settlement operations.</p></div><button className="button button-primary" onClick={() => request('Collection request')}><Plus size={17}/> New collection</button></div>
        <div className="environment-banner"><div className="environment-icon"><LockKeyhole size={18}/></div><div><b>Financial actions are safely disabled</b><p>No payment, payout or biller provider, production database, or user identity is connected. This workspace cannot move money or display spendable balances.</p></div><button onClick={() => setSection('Reconciliation')}>View setup status <ArrowUpRight size={15}/></button></div>
        {section === 'Overview' ? <>
        <section className="metrics" aria-label="Wallet balances"><Metric icon={Wallet} label="Available balance" value="—" meta="Verified ledger balance only"/><Metric icon={Clock3} label="Pending collections" value="—" meta="Awaiting provider confirmation"/><Metric icon={Activity} label="Processing" value="—" meta="No live operations"/><Metric icon={ArrowUpRight} label="Settled this month" value="—" meta="Provider-confirmed records"/></section>
        <section className="journey card"><div className="section-heading"><div><span className="eyebrow">COLLECTION TO SETTLEMENT</span><h2>Money movement journey</h2><p>Each step advances only after server-side verification.</p></div><button className="subtle-button" onClick={() => setSection('Transactions')}>View transactions <ArrowUpRight size={15}/></button></div><div className="stepper">{steps.map(([title, description], index) => <div className="step" key={title}><div className="step-node">{index + 1}</div><div><b>{title}</b><small>{description}</small></div>{index < steps.length - 1 && <div className="step-line"/>}</div>)}</div><div className="sla-note"><Clock3 size={16}/><span><b>POS credit confirmation can take up to 20 minutes.</b> Status and expected timing will come from provider events; no timer creates a wallet credit.</span></div></section>
        <div className="lower-grid"><section className="card panel"><div className="section-heading compact"><div><h2>Recent transactions</h2><p>Provider-confirmed activity appears here.</p></div><button className="subtle-button" onClick={() => setSection('Transactions')}>All transactions <ArrowUpRight size={15}/></button></div><div className="empty-state"><div className="empty-icon"><ArrowLeftRight size={20}/></div><b>No verified transactions</b><p>There is no connected account or transaction database yet.</p></div></section>
          <section className="card panel"><div className="section-heading compact"><div><h2>Quick actions</h2><p>Available after account setup and KYC.</p></div></div><div className="quick-actions"><Quick icon={Users} title="Manage beneficiaries" onClick={() => setSection('Beneficiaries')}/><Quick icon={ArrowUpRight} title="Send a payout" onClick={() => request('Payout')}/><Quick icon={Zap} title="Pay a bill" onClick={() => setSection('Bill payments')}/><Quick icon={FileText} title="Download statement" onClick={() => request('Statement')}/></div></section></div>
        <section className="card services"><div className="section-heading"><div><span className="eyebrow">SUPPORTED SERVICE CATEGORIES</span><h2>Bill payments and services</h2><p>Catalog is for product planning; services remain disabled until an authorized BBPS partner provides its live catalog.</p></div><div className="search-box"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search service categories" placeholder="Search services"/></div></div><div className="service-grid">{shownCategories.map((cat) => <article className="service-card" key={cat.name}><div className="service-symbol"><Zap size={16}/></div><h3>{cat.name}</h3><div className="service-items">{cat.items.map((item) => <span key={item}>{item}</span>)}</div><span className="disabled-label"><LockKeyhole size={12}/> Provider setup required</span></article>)}</div>{!shownCategories.length && <div className="empty-state">No matching service categories.</div>}</section>
        </> : <section className="card setup-page"><div className="setup-icon"><LockKeyhole size={21}/></div><span className="eyebrow">{section.toUpperCase()}</span><h2>{section === 'Bill payments' ? 'Authorized biller catalog unavailable' : `${section} data is not connected`}</h2><p>{sectionDescriptions[section]}</p><div className="setup-checks"><div><i/> Identity provider <b>Not configured</b></div><div><i/> Transactional database <b>Not connected</b></div><div><i/> Authorized provider <b>Not configured</b></div></div><button className="subtle-button" onClick={() => request(section)}><LockKeyhole size={14}/> Check setup status</button></section>}
        <footer><span>ReachPay Financial Operations</span><span><ShieldCheck size={14}/> Statuses require verified provider confirmation</span><a href="mailto:compliance@reachpay.example"><CircleHelp size={14}/> Setup guidance</a></footer>
      </div>
    </main>
    {notice && <div className="toast" role="status"><LockKeyhole size={17}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </div>;
}
function Metric({ icon: Icon, label, value, meta }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17}/></span></div><b className="metric-value">{value}</b><small>{meta}</small></article>; }
function Quick({ icon: Icon, title, onClick }) { return <button className="quick-action" onClick={onClick}><span><Icon size={17}/></span><b>{title}</b><ArrowUpRight size={14}/></button>; }
