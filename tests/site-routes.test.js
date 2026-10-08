import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { industries, insights, navigation, pages, solutions } from '../content/site.js';

test('required marketing and legal pages are represented in the route model and sitemap', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const routes = new Set(['/', '/contact', '/industries', '/insights', ...Object.keys(pages), ...solutions.map((item) => `/solutions/${item.slug}`), ...insights.map((item) => `/insights/${item.slug}`), '/auth/signup', '/auth/login', '/auth/verify', '/dashboard']);
  const publicRoutes = ['/','/about','/solutions/payments','/solutions/bill-payments','/solutions/payouts','/solutions/assisted-commerce','/industries','/case-studies','/leadership','/careers','/insights','/insights/clear-payment-status','/insights/reconciliation-checklist','/insights/beneficiary-data-care','/contact','/privacy','/terms'];
  for (const route of [...publicRoutes, '/auth/signup', '/auth/login', '/auth/verify', '/dashboard']) {
    assert.ok(routes.has(route), `${route} has an application route`);
  }
  for (const route of publicRoutes) {
    assert.ok(sitemap.includes(`/${route === '/' ? '' : route.slice(1)}`), `${route} is listed in sitemap`);
  }
});

test('navigation destinations resolve to a public route or the contact page', () => {
  const routes = new Set(['/', '/contact', '/industries', '/insights', ...Object.keys(pages), ...solutions.map((item) => `/solutions/${item.slug}`), ...insights.map((item) => `/insights/${item.slug}`)]);
  for (const [, href] of navigation.flatMap((group) => group.links)) assert.ok(routes.has(href), `${href} is a supported route`);
  for (const [title] of industries) assert.ok(title.length > 0);
});

test('Vercel config defines restrictive browser security headers', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = config.headers.flatMap((entry) => entry.headers).reduce((map, entry) => map.set(entry.key.toLowerCase(), entry.value), new Map());
  assert.match(headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.match(headers.get('strict-transport-security'), /max-age=/);
  assert.equal(config.cleanUrls, true); assert.equal(config.trailingSlash, false); assert.equal(config.rewrites, undefined);
});
