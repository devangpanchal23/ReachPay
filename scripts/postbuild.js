import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(projectRoot, 'dist');

const routes = [
  ['/', 'Payments for business', 'ReachPay — payment technology for business. Product scope and availability are being confirmed.'],
  ['/about', 'About ReachPay', 'Company overview and mission — pending confirmation by ReachPay.'],
  ['/solutions/payments', 'Payments', 'A proposed overview for online payment acceptance and payment operations. Availability requires confirmation.'],
  ['/solutions/bill-payments', 'Bill payments', 'A proposed bill-payment experience. Only provider-enabled services should be published.'],
  ['/solutions/payouts', 'Payouts & transfers', 'A proposed merchant payout workflow subject to authorized banking partners.'],
  ['/solutions/assisted-commerce', 'Assisted commerce', 'A proposed assisted-service experience. Availability and coverage need confirmation.'],
  ['/industries', 'Industries', 'Potential product fit depends on provider availability and ReachPay’s confirmed service scope.'],
  ['/case-studies', 'Case studies', 'Customer stories require customer approval and verified evidence before publication.'],
  ['/leadership', 'Leadership', 'ReachPay leadership directory. Names and biographies require company confirmation.'],
  ['/careers', 'Careers', 'Explore opportunities at ReachPay. Open roles require company confirmation.'],
  ['/insights', 'Insights', 'Editorial drafts about product, payments and operations, awaiting ReachPay review.'],
  ['/insights/clear-payment-status', 'Designing clear payment status experiences', 'A practical framework for showing what is known, what is pending, and what a customer should do next.'],
  ['/insights/reconciliation-checklist', 'A reconciliation checklist for payment teams', 'The records and controls teams can compare when a payment provider and an internal system disagree.'],
  ['/insights/beneficiary-data-care', 'Protecting sensitive beneficiary information', 'Data minimization, role checks and audit trails belong in the design from the beginning.'],
  ['/contact', 'Contact ReachPay', 'Contact ReachPay about payment and financial technology for business.'],
  ['/privacy', 'Privacy policy', 'Privacy notice scaffold requiring ReachPay legal review before publication.'],
  ['/terms', 'Terms of use', 'Terms of use scaffold requiring ReachPay legal review before publication.'],
];
let base = process.env.PUBLIC_SITE_URL || 'https://reachpay.example';
try { const parsed = new URL(base); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); base = parsed.origin; }
catch { throw new Error('PUBLIC_SITE_URL must be an absolute HTTP(S) origin.'); }
const encoded = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const template = await fs.readFile(path.join(root, 'index.html'), 'utf8');
for (const [route, title, description] of routes) {
  const pageTitle = `${title} | ReachPay`; const canonical = `${base}${route === '/' ? '/' : route}`;
  const html = template.replace(/<title>[^<]*<\/title>/, `<title>${encoded(pageTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, `<meta name="description" content="${encoded(description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?\s*>/, `<meta property="og:title" content="${encoded(pageTitle)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?\s*>/, `<meta property="og:description" content="${encoded(description)}" />`)
    .replace('</head>', `<link rel="canonical" href="${canonical}" />${route === '/' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'ReachPay', url: base })}</script>` : ''}</head>`);
  const output = route === '/' ? path.join(root, 'index.html') : path.join(root, `${route.slice(1)}.html`);
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, html);
}
const privateRoutes = [
  ['/auth/signup', 'Create account', 'Create a ReachPay customer account.'],
  ['/auth/login', 'Sign in', 'Sign in to your ReachPay customer account.'],
  ['/auth/verify', 'Verify account', 'Verify your ReachPay email address and mobile number.'],
  ['/dashboard', 'Customer portal', 'ReachPay customer account portal.'],
];
for (const [route, title, description] of privateRoutes) {
  const html = template.replace(/<title>[^<]*<\/title>/, `<title>${encoded(`${title} | ReachPay`)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, `<meta name="description" content="${encoded(description)}" />`)
    .replace('</head>', '<meta name="robots" content="noindex, nofollow" /></head>');
  const output = path.join(root, `${route.slice(1)}.html`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
}
const notFound = template.replace(/<title>[^<]*<\/title>/, '<title>Page not found | ReachPay</title>')
  .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, '<meta name="description" content="The requested ReachPay page could not be found." />')
  .replace(/<meta property="og:title" content="[^"]*"\s*\/?\s*>/, '<meta property="og:title" content="Page not found | ReachPay" />')
  .replace(/<meta property="og:description" content="[^"]*"\s*\/?\s*>/, '<meta property="og:description" content="The requested ReachPay page could not be found." />');
await fs.writeFile(path.join(root, '404.html'), notFound);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(([route]) => `  <url><loc>${base}${route}</loc></url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(root, 'sitemap.xml'), xml);
await fs.writeFile(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
