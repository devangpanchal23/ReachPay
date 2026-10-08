import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Menu, ShieldCheck, X } from 'lucide-react';
import { industries, insights, navigation, pages, solutions } from '../content/site.js';
import { emailError, nameError, passwordError, sanitizeNameInput } from '../shared/field-validation.js';
import FinancialWorkspace from './components/FinancialWorkspace.jsx';

const route = () => window.location.pathname.replace(/\/$/, '') || '/';

function Header({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState('');
  useEffect(() => { const close = (event) => { if (event.key === 'Escape') { setOpen(false); setMenu(''); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  return <header className="site-header"><div className="container nav-wrap">
    <a className="brand" href="/" aria-label="ReachPay home"><span className="brand-mark">R</span><span>reach<span>pay</span></span></a>
    <button className="menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
    <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
      {navigation.map((group) => <div className="nav-group" key={group.label} onMouseEnter={() => setMenu(group.label)} onMouseLeave={() => setMenu('')}>
        <button className="nav-trigger" aria-expanded={menu === group.label} onClick={() => setMenu(menu === group.label ? '' : group.label)}>{group.label}<ChevronDown size={15}/></button>
        {menu === group.label && <div className="mega-menu">{group.links.map(([label, href]) => <a key={href} href={href} onClick={() => {setOpen(false);setMenu('');}}>{label}<ArrowUpRight size={15}/></a>)}</div>}
      </div>)}
      {user ? (
        <div className="auth-nav-user">
          <a href="/dashboard" className="auth-nav-dashboard" onClick={() => setOpen(false)}>
            <span className="user-avatar-initial">{user.name ? user.name.trim().charAt(0).toUpperCase() : 'U'}</span>
            <span className="user-nav-name">{user.name || 'Dashboard'}</span>
          </a>
          <button type="button" className="nav-signout-btn" onClick={() => { setOpen(false); if (onLogout) onLogout(); }}>
            Sign out
          </button>
        </div>
      ) : (
        <>
          <a href="/auth/login" className="auth-nav-link" onClick={() => setOpen(false)}>Sign in</a>
          <a href="/auth/signup" className="nav-cta" onClick={() => setOpen(false)}>Create account <ArrowRight size={15}/></a>
        </>
      )}
    </nav>
  </div></header>;
}

function Footer() {
  return <footer className="site-footer"><div className="container"><div className="footer-top"><div><a className="brand brand-light" href="/"><span className="brand-mark">R</span><span>reach<span>pay</span></span></a><p>Payment technology for business.<br/>Product and company information is being confirmed.</p><NewsletterForm/></div>
    <div className="footer-links">{navigation.map((group) => <div key={group.label}><h3>{group.label}</h3>{group.links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</div>)}<div><h3>Get in touch</h3><a href="/contact">Contact</a><a href="/careers">Careers</a><a href="/insights">Insights</a></div></div></div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} ReachPay. Company details pending verification.</span><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></div></div></footer>;
}

function CookieNote() {
  const [visible, setVisible] = useState(() => { try { return localStorage.getItem('reachpay-cookie-note') !== 'accepted'; } catch { /* Private browsing may block local storage. */ return false; } });
  if (!visible) return null;
  return <aside className="cookie-note" aria-label="Cookie notice"><p>This site uses essential browser storage only for preferences. No advertising cookies are set.</p><button onClick={() => { try { localStorage.setItem('reachpay-cookie-note', 'accepted'); } catch { /* Keep the notice dismissible without persistent storage. */ } setVisible(false); }}>Understood</button></aside>;
}

function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { target.classList.add('visible'); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { target.classList.add('visible'); observer.disconnect(); } }, { threshold: 0.12 });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}

function Breadcrumb({ title }) { return <nav className="breadcrumbs container" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>; }

function PageHero({ eyebrow, headline, intro, compact = false }) { return <section className={`page-hero ${compact ? 'compact' : ''}`}><div className="container page-hero-inner"><div className="eyebrow"><span/>{eyebrow}</div><h1>{headline}</h1><p>{intro}</p></div></section>; }

function CardGrid({ items, linkPrefix = '/solutions/' }) { return <div className="card-grid">{items.map((item, index) => <Reveal key={item.title || item[0]} className="feature-card-wrap" ><a className="feature-card" href={item.slug ? `${linkPrefix}${item.slug}` : '/contact'}><span className="card-index">0{index + 1}</span><span className="card-icon">{item.icon || '✳'}</span><h3>{item.title || item[0]}</h3><p>{item.body || item[1]}</p><span className="card-link">{item.slug ? 'Explore' : 'Discuss fit'} <ArrowUpRight size={16}/></span></a></Reveal>)}</div>; }

function ContactForm({ kind = 'contact' }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setState('loading'); setMessage('');
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, kind }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'We could not send your message. Please try again later.');
      setState('success'); setMessage('ReachPay accepted your request for delivery.'); form.reset();
    } catch (error) { setState('error'); setMessage(error.message || 'The contact service is unavailable. Please try again later.'); }
  };
  return <form className="contact-form" onSubmit={submit}>
    <label>Name<input name="name" autoComplete="name" minLength="2" maxLength="100" required/></label>
    <label>Work email<input name="email" type="email" autoComplete="email" maxLength="254" required/></label>
    {kind === 'careers' ? <label>Area of interest<input name="role" maxLength="120" placeholder="e.g. Product, Engineering, Operations" required/></label> : <label>Company<input name="company" autoComplete="organization" maxLength="120"/></label>}
    <label>How can we help?<textarea name="message" rows="5" minLength="10" maxLength="4000" required/></label>
    <label className="honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex="-1" autoComplete="off"/></label>
    <label className="consent-row"><input name="consent" type="checkbox" required/><span>I agree that ReachPay may use these details to respond to my request. Do not include account, card or payment credentials.</span></label>
    <button className="button primary" disabled={state === 'loading'}>{state === 'loading' ? 'Sending…' : 'Send request'} <ArrowRight size={17}/></button>
    <p className={`form-message ${state}`} role="status" aria-live="polite">{message}</p>
    <small>Submissions are sent securely only after the email service has been configured. See our <a href="/privacy">privacy notice</a>.</small>
  </form>;
}

function NewsletterForm() {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const subscribe = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(''); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries());
    try { const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, kind: 'newsletter' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Subscription could not be saved.'); setMessage('Subscription request received.'); form.reset(); }
    catch (error) { setMessage(error.message || 'Newsletter signup is unavailable.'); } finally { setBusy(false); }
  };
  return <form className="newsletter-form" onSubmit={subscribe}><label htmlFor="newsletter-email">Request product updates</label><div><input id="newsletter-email" name="email" type="email" placeholder="Work email" autoComplete="email" maxLength="254" required/><input className="honeypot" aria-hidden="true" tabIndex="-1" name="website" autoComplete="off"/><button disabled={busy} aria-label="Send product updates request"><ArrowRight size={16}/></button></div><label className="newsletter-consent"><input name="consent" type="checkbox" required/><span>I agree for ReachPay to receive this request and contact me about product updates.</span></label><small role="status" aria-live="polite">{message}</small></form>;
}

function Home() {
  return <><section className="hero"><div className="container hero-grid"><div className="hero-copy"><div className="eyebrow"><span/>PAYMENTS, MADE CLEARER</div><h1>Move business forward with <em>payments</em> that make sense.</h1><p>ReachPay is building payment and financial technology experiences for businesses. Explore the proposed platform and tell us what your team needs.</p><div className="hero-actions"><a className="button primary" href="/solutions/payments">Explore the platform <ArrowRight size={17}/></a><a className="button secondary" href="/contact">Talk to our team</a></div><div className="hero-note"><ShieldCheck size={17}/><span>Designed around clear status, careful data handling and operational visibility.</span></div></div><div className="hero-visual"><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/><img src="/reachpay-hero.png" alt="Abstract blue and green payment technology illustration" fetchPriority="high"/><div className="floating-card"><span className="status-dot"/>Payment status <strong>Visible at every step</strong></div></div></div><a className="scroll-cue" href="#platform">Discover the platform <ArrowDown size={15}/></a></section>
    <section id="platform" className="section section-soft"><div className="container"><div className="section-heading"><div><div className="eyebrow"><span/>THE PLATFORM</div><h2>One thoughtful foundation.<br/><em>Connected experiences.</em></h2></div><p>Explore the product areas ReachPay is shaping. Availability, provider coverage and commercial terms must be confirmed before relying on any service.</p></div><CardGrid items={solutions}/></div></section>
    <section className="section"><div className="container split-section"><Reveal><div className="eyebrow"><span/>BUILT FOR REAL OPERATIONS</div><h2>Clarity across the payment journey.</h2><p>Payment experiences span customers, merchants, service providers and internal operations. A useful platform makes each handoff understandable and each state traceable.</p><a className="text-link" href="/about">Learn about ReachPay <ArrowRight size={16}/></a></Reveal><Reveal><div className="journey-card"><div className="journey-step"><span>01</span><div><b>Request</b><small>Capture intent and a clear reference</small></div><Check/></div><div className="journey-line"/><div className="journey-step"><span>02</span><div><b>Confirm</b><small>Use verified provider information</small></div><Check/></div><div className="journey-line"/><div className="journey-step"><span>03</span><div><b>Reconcile</b><small>Keep records aligned and reviewable</small></div><Check/></div><small className="journey-caption">Illustrative product principles — not a live payment flow.</small></div></Reveal></div></section>
    <section className="section section-navy"><div className="container cta-row"><div><div className="eyebrow light"><span/>START A CONVERSATION</div><h2>Let’s understand what your business needs.</h2><p>Our team can discuss product scope, supported services and integration requirements.</p></div><a className="button white" href="/contact">Contact ReachPay <ArrowRight size={17}/></a></div></section></>;
}

function SolutionPage({ slug }) { const item = solutions.find((entry) => entry.slug === slug); if (!item) return <NotFound/>; return <><Breadcrumb title={item.title}/><PageHero eyebrow="REACHPAY PLATFORM" headline={item.title} intro={item.body}/><section className="section"><div className="container split-section"><div><div className="eyebrow"><span/>PRODUCT OVERVIEW</div><h2>Designed for dependable operations.</h2><p>This page describes a proposed product area. ReachPay must confirm product availability, applicable provider contracts, supported geographies and customer eligibility before this content is treated as a service commitment.</p></div><div className="notice-card"><ShieldCheck/><h3>Availability is provider-dependent</h3><p>Financial services may be offered only through appropriately authorized providers and approved business arrangements. No integration or regulatory status is implied here.</p></div></div></section><section className="section section-soft"><div className="container"><div className="section-heading"><h2>Related capabilities</h2><p>See other proposed product areas.</p></div><CardGrid items={solutions.filter((s) => s.slug !== slug)}/></div></section><ContactBand/></>; }

function GenericPage({ path }) { const page = pages[path]; if (!page) return <NotFound/>; return <><Breadcrumb title={page.title}/><PageHero eyebrow={page.eyebrow} headline={page.headline} intro={page.intro}/><section className="section"><div className="container text-sections">{page.sections.map(([title, body]) => <Reveal key={title}><article><span className="section-kicker">REACHPAY</span><h2>{title}</h2><p>{body}</p></article></Reveal>)}</div></section>{path === '/careers' && <section className="section section-soft"><div className="container form-layout"><div><div className="eyebrow"><span/>EXPRESS INTEREST</div><h2>Start a conversation.</h2><p>There are no confirmed vacancies listed yet. Submit your interest without including sensitive personal or financial information.</p></div><ContactForm kind="careers"/></div></section>}{path !== '/privacy' && path !== '/terms' && <ContactBand/>}</>; }

function IndustriesPage() { return <><Breadcrumb title="Industries"/><PageHero eyebrow="INDUSTRIES" headline="Technology that meets businesses where they work." intro="Potential product fit depends on customer needs, authorized provider availability and ReachPay’s confirmed service scope."/><section className="section"><div className="container"><CardGrid items={industries.map(([title, body]) => ({ title, body }))} linkPrefix="/industries/"/><p className="disclaimer">Industry descriptions are exploratory and do not guarantee product availability or suitability.</p></div></section><ContactBand/></>; }

function InsightsPage() { const [search, setSearch] = useState(''); const visible = useMemo(() => insights.filter((item) => `${item.title} ${item.category} ${item.excerpt}`.toLowerCase().includes(search.toLowerCase())), [search]); return <><Breadcrumb title="Insights"/><PageHero eyebrow="INSIGHTS" headline="Ideas for better payment experiences." intro="Editorial drafts about product, payments and operations. These articles are clearly marked as drafts until reviewed and approved by ReachPay."/><section className="section"><div className="container"><label className="search-label">Search insights<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by topic"/></label><div className="insight-grid">{visible.map((item) => <article className="insight-card" key={item.title}><span className="pill">{item.category} · Draft</span><small>{item.date}</small><h2>{item.title}</h2><p>{item.excerpt}</p><a className="text-link" href={`/insights/${item.slug}`}>Read editorial draft <ArrowRight size={15}/></a><span className="draft-tag">Editorial draft awaiting approval</span></article>)}</div>{visible.length === 0 && <p>No drafts match that search.</p>}</div></section></>; }

function InsightArticle({ slug }) { const item = insights.find((entry) => entry.slug === slug); if (!item) return <NotFound/>; return <><Breadcrumb title="Insights"/><PageHero eyebrow={`${item.category.toUpperCase()} · EDITORIAL DRAFT`} headline={item.title} intro={item.excerpt}/><section className="section"><article className="container article-body"><p className="draft-notice">Editorial draft — ReachPay review and approval required before publication.</p><p>{item.body}</p><a className="text-link" href="/insights">← Back to Insights</a></article></section><ContactBand/></>; }

function ContactPage() { return <><Breadcrumb title="Contact"/><PageHero eyebrow="CONTACT REACHPAY" headline="Tell us what you’re working on." intro="Share a business enquiry with the ReachPay team. Please do not send account numbers, card details, passwords, OTPs or other sensitive financial information."/><section className="section section-soft"><div className="container form-layout"><div><div className="eyebrow"><span/>BUSINESS ENQUIRIES</div><h2>We’ll route your request to the right team.</h2><p>Contact submissions are delivered through a configured email provider. If the service is not configured, the form will show an error instead of claiming the message was delivered.</p><div className="contact-assurance"><ShieldCheck/><span>Your message is encrypted in transit. Avoid sending payment credentials or customer financial data.</span></div></div><ContactForm/></div></section></>; }

function ContactBand() { return <section className="section section-navy"><div className="container cta-row"><div><div className="eyebrow light"><span/>QUESTIONS?</div><h2>Let’s talk through your use case.</h2><p>ReachPay can confirm scope, service availability and next steps.</p></div><a className="button white" href="/contact">Contact the team <ArrowRight size={17}/></a></div></section>; }

async function authRequest(action, body, method = 'POST') {
  let response;
  try {
    response = await fetch(`/api/auth/${action}`, { method, credentials: 'same-origin', headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  } catch {
    throw new Error('We could not reach the account service. Check that ReachPay is running and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The account service is temporarily unavailable.');
  return result;
}
const maskEmail = (email = '') => { const [name, domain] = email.split('@'); return name ? `${name.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}` : ''; };

function AuthPage({ mode }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(() => mode === 'verify' && new URLSearchParams(window.location.search).get('delivery') === 'attention' ? 'Your account was created, but a verification message could not be delivered. Ask the administrator to finish the email/SMS setup, then resend your code here.' : '');
  const [user, setUser] = useState(null); const [code, setCode] = useState(''); const [activeChannel, setActiveChannel] = useState('');
  const [signupAttempted, setSignupAttempted] = useState(false); const [loginAttempted, setLoginAttempted] = useState(false);
  const [phoneTools, setPhoneTools] = useState(null);
  const [signup, setSignup] = useState({ name: '', email: '', country: 'IN', mobile: '', password: '', verificationConsent: false });
  const [login, setLogin] = useState({ identifier: '', password: '' });
  const protectedMode = mode === 'verify';
  useEffect(() => {
    if (!protectedMode) return;
    authRequest('me', null, 'GET').then((result) => {
      setUser(result.user);
      if (result.dashboardAllowed) window.location.replace('/dashboard');
    }).catch(() => window.location.replace('/auth/login'));
  }, [mode, protectedMode]);
  useEffect(() => {
    if (!['signup', 'login'].includes(mode)) return undefined;
    let mounted = true;
    import('../shared/phone-validation.js').then((tools) => { if (mounted) setPhoneTools(tools); }).catch(() => { if (mounted) setError('Phone validation could not be loaded. Reload and try again.'); });
    return () => { mounted = false; };
  }, [mode]);
  const submitLogin = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await authRequest('login', login); window.location.assign(result.next); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const verify = async (channel) => {
    setBusy(true); setError(''); setMessage(''); setActiveChannel(channel);
    try { const result = await authRequest(`verify-${channel}`, { code }); setUser(result.user); setCode(''); setMessage(`${channel === 'email' ? 'Email' : 'Mobile'} verified successfully.`); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const resend = async (channel) => {
    setBusy(true); setError(''); setMessage('');
    try { const result = await authRequest('resend', { channel }); setMessage(result.message); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const quickVerifyAll = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!user.emailVerified) await authRequest('verify-email', { code: '123456' });
      const res = await authRequest('verify-mobile', { code: '123456' });
      setUser(res.user);
      setMessage('Both email and mobile verified!');
      window.location.replace('/dashboard');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const updateSignup = (field, value) => { setError(''); setSignup((current) => ({ ...current, [field]: value })); };
  const updateLogin = (field, value) => { setError(''); setLogin((current) => ({ ...current, [field]: value })); };
  const signupErrors = {
    name: nameError(signup.name),
    email: emailError(signup.email),
    mobile: phoneTools ? phoneTools.phoneError(signup.mobile, signup.country) : 'Loading phone number validation…',
    password: passwordError(signup.password),
  };
  const selectedPhoneLimit = phoneTools?.maxNationalDigits(signup.country) || 10;
  const phoneCountryOptions = phoneTools?.PHONE_COUNTRIES || [];
  const submitValidatedSignup = async (event) => {
    event.preventDefault(); setError(''); setSignupAttempted(true);
    const firstInvalid = Object.entries(signupErrors).find(([, fieldError]) => fieldError);
    if (firstInvalid) { setError(firstInvalid[1]); document.getElementById(`signup-${firstInvalid[0]}`)?.focus(); return; }
    if (!signup.verificationConsent) { setError('Agree to receive verification codes to continue.'); document.getElementById('signup-consent')?.focus(); return; }
    await submitSignupWithNormalizedPhone();
  };
  const submitSignupWithNormalizedPhone = async () => {
    setBusy(true);
    try {
      const result = await authRequest('signup', { ...signup, name: signup.name.trim(), email: signup.email.trim(), mobile: phoneTools.normalizeMobile(signup.mobile, signup.country) });
      if (result.next) {
        const deliveryIncomplete = result.delivery && (result.delivery.email !== 'sent' || result.delivery.mobile !== 'sent');
        window.location.assign(deliveryIncomplete ? '/auth/verify?delivery=attention' : result.next);
      } else setMessage(result.message);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const loginIdentifierMessage = login.identifier ? (phoneTools?.loginIdentifierError(login.identifier) || '') : 'Enter your email or mobile number.';
  const loginPasswordMessage = passwordError(login.password);
  const submitValidatedLogin = (event) => {
    event.preventDefault(); setError(''); setLoginAttempted(true);
    if (loginIdentifierMessage) { setError(loginIdentifierMessage); document.getElementById('login-identifier')?.focus(); return; }
    if (loginPasswordMessage) { setError(loginPasswordMessage); document.getElementById('login-password')?.focus(); return; }
    submitLogin(event);
  };
  const title = mode === 'signup' ? 'Create your account' : mode === 'login' ? 'Welcome back' : 'Verify your details';
  return <section className="auth-page"><div className="auth-card">
    <a className="brand auth-brand" href="/" aria-label="ReachPay home"><span className="brand-mark">R</span><span>reach<span>pay</span></span></a><div className="eyebrow"><span/>{mode === 'verify' ? 'ACCOUNT SECURITY' : 'CUSTOMER ACCOUNT'}</div><h1>{title}</h1>
    {mode === 'signup' && <><p className="auth-intro">Create an account with the essentials. We’ll verify your email and mobile before enabling your dashboard.</p><form className="auth-form" noValidate onSubmit={submitValidatedSignup}>
      <label>Full name<input id="signup-name" name="name" autoComplete="name" maxLength="100" value={signup.name} aria-invalid={Boolean((signupAttempted || signup.name) && signupErrors.name)} aria-describedby={signupErrors.name && (signupAttempted || signup.name) ? 'signup-name-error' : 'signup-name-help'} onChange={(e) => updateSignup('name', sanitizeNameInput(e.target.value))} required/><small id="signup-name-help">Use 2 to 100 characters.</small>{(signupAttempted || signup.name) && signupErrors.name && <small id="signup-name-error" className="field-error">{signupErrors.name}</small>}</label>
      <label>Email address<input id="signup-email" name="email" type="email" autoComplete="email" autoCapitalize="none" maxLength="254" value={signup.email} aria-invalid={Boolean((signupAttempted || signup.email) && signupErrors.email)} aria-describedby={signupErrors.email && (signupAttempted || signup.email) ? 'signup-email-error' : 'signup-email-help'} onChange={(e) => updateSignup('email', e.target.value.slice(0, 254))} required/><small id="signup-email-help">We’ll send a one-time verification code to this address.</small>{(signupAttempted || signup.email) && signupErrors.email && <small id="signup-email-error" className="field-error">{signupErrors.email}</small>}</label>
      <label>Mobile number<span className="phone-input"><select aria-label="Country calling code" value={signup.country} disabled={!phoneTools} onChange={(e) => { const country = e.target.value; updateSignup('country', country); updateSignup('mobile', signup.mobile.slice(0, phoneTools.maxNationalDigits(country))); }}>{phoneCountryOptions.map(({ country, callingCode, name }) => <option key={country} value={country}>{name} (+{callingCode})</option>)}</select><input id="signup-mobile" name="mobile" type="tel" autoComplete="tel-national" inputMode="numeric" placeholder={signup.country === 'IN' ? '9876543210' : 'Mobile number'} maxLength={selectedPhoneLimit + 8} disabled={!phoneTools} value={signup.mobile} aria-invalid={Boolean((signupAttempted || signup.mobile) && phoneTools && signupErrors.mobile)} aria-describedby={signupErrors.mobile && (signupAttempted || signup.mobile) && phoneTools ? 'signup-mobile-error' : 'signup-mobile-help'} onChange={(e) => updateSignup('mobile', phoneTools.cleanNationalInput(e.target.value, signup.country))} required/></span><small id="signup-mobile-help">Digits only. India (+91) requires exactly 10 digits; the input limit adjusts for other countries.</small>{(signupAttempted || signup.mobile) && phoneTools && signupErrors.mobile && <small id="signup-mobile-error" className="field-error">{signupErrors.mobile}</small>}</label>
      <label>Password<input id="signup-password" name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" value={signup.password} aria-invalid={Boolean((signupAttempted || signup.password) && signupErrors.password)} aria-describedby={signupErrors.password && (signupAttempted || signup.password) ? 'signup-password-error' : 'signup-password-help'} onChange={(e) => updateSignup('password', e.target.value.slice(0, 128))} required/><small id="signup-password-help">Use 12 to 128 characters.</small>{(signupAttempted || signup.password) && signupErrors.password && <small id="signup-password-error" className="field-error">{signupErrors.password}</small>}</label>
      <label className="auth-consent"><input id="signup-consent" name="verificationConsent" type="checkbox" checked={signup.verificationConsent} aria-invalid={signupAttempted && !signup.verificationConsent} aria-describedby={signupAttempted && !signup.verificationConsent ? 'signup-consent-error' : undefined} onChange={(e) => updateSignup('verificationConsent', e.target.checked)} required/><span>I agree to receive one-time email and SMS codes to verify this account. This does not sign me up for marketing messages.</span></label>
      {signupAttempted && !signup.verificationConsent && <small id="signup-consent-error" className="field-error">Consent is required to send verification codes.</small>}
      <button className="button primary" disabled={busy || !phoneTools}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={16}/></button>
      {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message} <a href="/auth/login">Sign in</a></p>}
    </form><p className="auth-switch">Already have an account? <a href="/auth/login">Sign in</a></p></>}
    {mode === 'login' && <><p className="auth-intro">Sign in with your registered email or mobile number and password.</p><form className="auth-form" noValidate onSubmit={submitValidatedLogin}>
      <label>Email or mobile number<input id="login-identifier" name="identifier" autoComplete="username" maxLength="254" value={login.identifier} aria-invalid={Boolean((loginAttempted || login.identifier) && loginIdentifierMessage)} aria-describedby={loginIdentifierMessage && (loginAttempted || login.identifier) ? 'login-identifier-error' : 'login-identifier-help'} onChange={(e) => updateLogin('identifier', e.target.value.slice(0, 254))} required/><small id="login-identifier-help">Use your account email or mobile number. Local Indian numbers may be entered as 10 digits.</small>{(loginAttempted || login.identifier) && loginIdentifierMessage && <small id="login-identifier-error" className="field-error">{loginIdentifierMessage}</small>}</label>
      <label>Password<input id="login-password" name="password" type="password" autoComplete="current-password" minLength="12" maxLength="128" value={login.password} aria-invalid={Boolean((loginAttempted || login.password) && loginPasswordMessage)} aria-describedby={loginPasswordMessage && (loginAttempted || login.password) ? 'login-password-error' : 'login-password-help'} onChange={(e) => updateLogin('password', e.target.value.slice(0, 128))} required/><small id="login-password-help">Enter the password you used when creating your account.</small>{(loginAttempted || login.password) && loginPasswordMessage && <small id="login-password-error" className="field-error">{loginPasswordMessage}</small>}</label>
      <button className="button primary" disabled={busy || !phoneTools}>{busy ? 'Signing in…' : 'Sign in securely'} <ArrowRight size={16}/></button>
      {error && <p className="form-message error" role="alert">{error}</p>}
    </form><p className="auth-switch">New to ReachPay? <a href="/auth/signup">Create an account</a></p></>}
    {mode === 'verify' && <>{!user ? <p className="auth-intro">Loading your verification status…</p> : <><p className="auth-intro">Verify both contact methods. Your account cannot open the dashboard until both are confirmed.</p><div className="verification-methods">
      <div className={`verification-method ${user.emailVerified ? 'verified' : ''}`}><span className="verification-symbol">{user.emailVerified ? '✓' : '1'}</span><div><b>Email address</b><small>{maskEmail(user.email)}</small><span>{user.emailVerified ? 'Verified' : 'Verification required'}</span></div>{!user.emailVerified && <button type="button" disabled={busy} onClick={() => resend('email')}>Resend code</button>}</div>
    </div>{(!user.emailVerified || !user.mobileVerified) && <div className="otp-panel">
      <div className="verification-code-head">
        <label htmlFor="verification-code">Enter verification code</label>
        {import.meta.env.DEV && <button type="button" className="verification-dev-code" onClick={() => setCode('123456')}>Use dev code 123456</button>}
      </div>
      <input id="verification-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code (e.g. 123456)"/>
      <div className="otp-actions">
        {!user.emailVerified && <button className="button primary" disabled={busy || code.length !== 6} onClick={() => verify('email')}>{busy && activeChannel === 'email' ? 'Checking…' : 'Verify email'}</button>}
        {!user.mobileVerified && <button className="button secondary" disabled={busy || code.length < 4} onClick={() => verify('mobile')}>{busy && activeChannel === 'mobile' ? 'Checking…' : 'Verify mobile'}</button>}
        {import.meta.env.DEV && <button type="button" className="button secondary dev-verify-all" disabled={busy} onClick={quickVerifyAll}>⚡ Verify all</button>}
      </div>
    </div>}{error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message success" role="status">{message}</p>}{user.emailVerified && user.mobileVerified && <a className="button primary" href="/dashboard">Continue to dashboard <ArrowRight size={16}/></a>}</>}</>}
    <a className="auth-back" href="/">← Back to ReachPay</a>
  </div></section>;
}

function DashboardPage({ user, onLogout, onUserLoaded }) {
  const [loading, setLoading] = useState(!user);
  const [activeUser, setActiveUser] = useState(user);

  useEffect(() => {
    if (user) {
      // This effect synchronizes the session-derived user into its local view state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveUser(user);
      setLoading(false);
      return;
    }
    let mounted = true;
    authRequest('me', null, 'GET')
      .then((result) => {
        if (!mounted) return;
        if (!result.dashboardAllowed) {
          window.location.replace('/auth/verify');
          return;
        }
        setActiveUser(result.user);
        if (onUserLoaded) onUserLoaded(result.user);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) window.location.replace('/auth/login');
      });
    return () => { mounted = false; };
  }, [user, onUserLoaded]);

  if (loading || !activeUser) {
    return (
      <div className="dashboard-full-viewport">
        <div className="dashboard-loading-state">
          <div className="dashboard-spinner" />
          <p>Loading your ReachPay workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-full-viewport">
      <FinancialWorkspace user={activeUser} onLogout={onLogout} />
    </div>
  );
}

function NotFound() { return <section className="not-found container"><span>404</span><h1>We can’t find that page.</h1><p>The address may have changed or the page may not exist.</p><a className="button primary" href="/">Return home <ArrowRight size={16}/></a></section>; }

export default function App() {
  const [path, setPath] = useState(route);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const change = () => { setPath(route()); window.scrollTo(0, 0); };
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);

  useEffect(() => {
    let active = true;
    authRequest('me', null, 'GET')
      .then((res) => {
        if (active && res?.user) setCurrentUser(res.user);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      });
    return () => { active = false; };
  }, [path]);

  const handleLogout = async () => {
    try {
      await authRequest('logout', {});
    } catch {
      // Ignore
    } finally {
      setCurrentUser(null);
      window.location.assign('/auth/login');
    }
  };

  useEffect(() => {
    const article = path.startsWith('/insights/') ? insights.find((entry) => entry.slug === path.split('/').pop()) : null;
    const title = pages[path]?.title || article?.title || (path.startsWith('/solutions/') ? `Solutions` : ({ '/': 'Payments for business', '/contact': 'Contact ReachPay', '/industries': 'Industries', '/insights': 'Insights', '/case-studies': 'Case studies', '/auth/signup': 'Create account', '/auth/login': 'Sign in', '/auth/verify': 'Verify account', '/dashboard': 'Customer dashboard' }[path] || 'Page not found'));
    document.title = `${title} | ReachPay`;
    const description = pages[path]?.description || article?.excerpt || 'Explore ReachPay payment and financial technology. Company details and product availability require confirmation.';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = description;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = `${title} | ReachPay`;
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = description;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `${window.location.origin}${path}`;
  }, [path]);

  let content;
  if (path === '/') content = <Home/>;
  else if (path === '/auth/signup') content = <AuthPage mode="signup"/>;
  else if (path === '/auth/login') content = <AuthPage mode="login"/>;
  else if (path === '/auth/verify') content = <AuthPage mode="verify"/>;
  else if (path === '/dashboard') content = <DashboardPage user={currentUser} onLogout={handleLogout} onUserLoaded={setCurrentUser}/>;
  else if (path === '/contact') content = <ContactPage/>;
  else if (path === '/industries') content = <IndustriesPage/>;
  else if (path === '/insights') content = <InsightsPage/>;
  else if (path.startsWith('/insights/')) content = <InsightArticle slug={path.split('/').pop()}/>;
  else if (path.startsWith('/solutions/')) content = <SolutionPage slug={path.split('/').pop()}/>;
  else content = <GenericPage path={path}/>;

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Header user={currentUser} onLogout={handleLogout}/>
      <main id="main" tabIndex="-1">{content}</main>
      <Footer/>
      <CookieNote/>
    </>
  );
}
