'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/price');

test('price: only plain public https links are fetched', () => {
  assert.ok(P.safeUrl('https://www.rei.com/product/123/thing#reviews'));
  assert.strictEqual(P.safeUrl('https://www.rei.com/p#x').hash, '');
  for (const bad of ['http://rei.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/x', 'https://u:p@rei.com/', 'https://rei.com:8443/', 'https://metadata/x', 'javascript:alert(1)', 'nope'])
    assert.strictEqual(P.safeUrl(bad), null, bad);
});

test('price: JSON-LD product with variant offers (REI-style) uses lowest in-stock price', () => {
  const html = `<html><head><title>Ignore me | REI</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Patagonia Nano Puff Jacket - Men&#39;s","offers":[
    {"@type":"Offer","price":"239.00","priceCurrency":"USD","availability":"https://schema.org/InStock"},
    {"@type":"Offer","price":"169.83","priceCurrency":"USD","availability":"https://schema.org/InStock"},
    {"@type":"Offer","price":"99.00","priceCurrency":"USD","availability":"https://schema.org/OutOfStock"}]}</script></head></html>`;
  assert.deepStrictEqual(P.parseProduct(html), { name: "Patagonia Nano Puff Jacket - Men's", price: 169.83, high: 239, currency: 'USD', inStock: true, source: 'structured data' });
});

test('price: AggregateOffer, @graph, ProductGroup variants, out of stock', () => {
  const agg = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Product"],"name":"Tent","offers":{"@type":"AggregateOffer","lowPrice":"1,299.95","highPrice":"1,499.95","priceCurrency":"USD"}}]}</script>`;
  assert.deepStrictEqual([P.parseProduct(agg).price, P.parseProduct(agg).high, P.parseProduct(agg).inStock], [1299.95, 1499.95, null]);
  const grp = `<script type="application/ld+json">{"@type":"ProductGroup","name":"Shoe","hasVariant":[{"@type":"Product","offers":{"price":120,"availability":"OutOfStock"}},{"@type":"Product","offers":{"price":135,"availability":"OutOfStock"}}]}</script>`;
  assert.deepStrictEqual([P.parseProduct(grp).price, P.parseProduct(grp).inStock], [120, false]);
});

test('price: meta tags fallback and no-price pages', () => {
  const html = `<meta property="og:title" content="Klean Kanteen 20oz"><meta content="32.95" property="product:price:amount"><meta property="product:availability" content="in stock">`;
  assert.deepStrictEqual(P.parseProduct(html), { name: 'Klean Kanteen 20oz', price: 32.95, high: 32.95, currency: 'USD', inStock: true, source: 'page tags' });
  assert.strictEqual(P.parseProduct('<title>Access Denied</title>'), null);
  assert.strictEqual(P.parseProduct('<script type="application/ld+json">{broken</script>'), null);
});

test('price: Shopify product JSON', () => {
  const r = P.fromShopify({ title: 'Sticker Pack', variants: [{ price: 1200, available: false }, { price: 1500, available: true }] });
  assert.deepStrictEqual([r.name, r.price, r.high, r.inStock], ['Sticker Pack', 15, 15, true]);
});

test('price api: needs sign-in, rejects bad links, reports blocks', async () => {
  const env = { ...process.env }, realFetch = global.fetch;
  process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 's'; process.env.ALLOWED_EMAILS = 'b@x.com';
  const A = require('../lib/auth');
  const mk = () => { const r = { headers: {} }; r.status = (c) => ((r.code = c), r); r.json = (b) => ((r.body = b), r); r.setHeader = (k, v) => (r.headers[k] = v); return r; };
  const ck = 'sp_session=' + encodeURIComponent(A.makeSession(A.config(), 'b@x.com'));
  const api = require('../api/price');
  try {
    let res = mk(); await api({ url: '/api/price?url=https://rei.com/x', headers: {} }, res);
    assert.strictEqual(res.code, 401);
    res = mk(); await api({ url: '/api/price?url=' + encodeURIComponent('https://169.254.169.254/latest'), headers: { cookie: ck } }, res);
    assert.strictEqual(res.code, 400);
    global.fetch = async (u) => ({ ok: false, status: 403, url: u, text: async () => 'denied' });
    res = mk(); await api({ url: '/api/price?url=' + encodeURIComponent('https://www.rei.com/product/1/x'), headers: { cookie: ck } }, res);
    assert.strictEqual(res.body.error, 'This store blocked the price check');
    global.fetch = async (u) => ({ ok: true, status: 200, url: u, text: async () => '<script type="application/ld+json">{"@type":"Product","name":"Jacket","offers":{"price":"99.95","availability":"InStock"}}</script>' });
    res = mk(); await api({ url: '/api/price?url=' + encodeURIComponent('https://www.rei.com/product/1/x'), headers: { cookie: ck } }, res);
    assert.deepStrictEqual([res.body.name, res.body.price, res.body.inStock], ['Jacket', 99.95, true]);
    global.fetch = async (u) => (u.endsWith('.js') ? { ok: true, json: async () => ({ title: 'Cap', variants: [{ price: 2800, available: true }] }) } : { ok: true, status: 200, url: u, text: async () => '<title>Cap</title>' });
    res = mk(); await api({ url: '/api/price?url=' + encodeURIComponent('https://shop.example.com/products/cap?variant=1'), headers: { cookie: ck } }, res);
    assert.deepStrictEqual([res.body.name, res.body.price, res.body.source], ['Cap', 28, 'Shopify']);
  } finally { process.env = env; global.fetch = realFetch; }
});
