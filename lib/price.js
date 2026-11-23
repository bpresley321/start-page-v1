'use strict';
// Reads a product's name, price and stock from a store's product page. Order of attempts:
// 1. schema.org Product JSON-LD (what search engines read; most stores have it)
// 2. price meta tags (product:price:amount, og:price:amount, itemprop="price")
// 3. Shopify's product JSON (/products/<handle>.js), when the page is a Shopify store

const net = require('net');

function safeUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const h = u.hostname.toLowerCase();
  if (net.isIP(h) || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return null;
  u.hash = '';
  return u;
}

function decode(s) {
  return String(s || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
const num = (v) => {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const m = String(v ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m && +m[0] > 0 ? +m[0] : null;
};
const types = (n) => [].concat(n && n['@type'] || []).map(String);

function jsonLdNodes(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j;
    try { j = JSON.parse(m[1].trim()); } catch { try { j = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 6) return;
      if (Array.isArray(n)) return n.forEach((x) => walk(x, depth + 1));
      out.push(n);
      if (n['@graph']) walk(n['@graph'], depth + 1);
    };
    walk(j, 0);
  }
  return out;
}

function offersOf(node) {
  const list = [];
  const add = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(add);
    if (o.offers) add(o.offers);
    const p = num(o.price ?? (o.priceSpecification && [].concat(o.priceSpecification)[0] && [].concat(o.priceSpecification)[0].price));
    const low = num(o.lowPrice), high = num(o.highPrice);
    const avail = String(o.availability || '');
    const stock = avail ? /InStock|LimitedAvailability|OnlineOnly|PreOrder|InStoreOnly/i.test(avail) : null;
    const cur = o.priceCurrency || (o.priceSpecification && [].concat(o.priceSpecification)[0] && [].concat(o.priceSpecification)[0].priceCurrency);
    if (p) list.push({ price: p, stock, cur });
    if (low) list.push({ price: low, stock, cur });
    if (high) list.push({ price: high, stock, cur, highOnly: true });
  };
  add(node.offers);
  for (const v of [].concat(node.hasVariant || [])) add(v.offers);
  return list;
}

function fromJsonLd(html) {
  const products = jsonLdNodes(html).filter((n) => types(n).some((t) => /^(Product|ProductGroup|IndividualProduct|Vehicle)$/i.test(t)));
  for (const p of products) {
    const offers = offersOf(p);
    if (!offers.length) continue;
    const inStockOffers = offers.filter((o) => o.stock !== false);
    const pool = (inStockOffers.length ? inStockOffers : offers);
    const prices = pool.filter((o) => !o.highOnly).map((o) => o.price);
    const all = pool.map((o) => o.price);
    if (!prices.length && !all.length) continue;
    const anyKnown = offers.some((o) => o.stock !== null);
    return {
      name: decode(p.name) || null,
      price: Math.min(...(prices.length ? prices : all)),
      high: Math.max(...all),
      currency: (offers.find((o) => o.cur) || {}).cur || 'USD',
      inStock: anyKnown ? offers.some((o) => o.stock) : null,
      source: 'structured data',
    };
  }
  return null;
}

function meta(html, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = String(html).match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || String(html).match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, 'i'));
  return a ? decode(a[1]) : null;
}

function fromMeta(html) {
  const price = num(meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price')
    || (String(html).match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) || [])[1]);
  if (!price) return null;
  const avail = meta(html, 'product:availability') || meta(html, 'og:availability') || '';
  return {
    name: meta(html, 'og:title'), price, high: price,
    currency: meta(html, 'product:price:currency') || meta(html, 'og:price:currency') || 'USD',
    inStock: avail ? /in ?stock|instock|available/i.test(avail) && !/out/i.test(avail) : null,
    source: 'page tags',
  };
}

function pageTitle(html) {
  return meta(html, 'og:title') || decode((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || null;
}

function parseProduct(html, url) {
  const base = fromJsonLd(html) || fromMeta(html);
  const v = url ? fromEmbedded(html, url) : null;
  let r = base;
  if (v) {
    const name = (base && base.name) || pageTitle(html);
    r = { name: name ? name + ' · ' + v.label : v.label, price: v.price, high: v.high, was: v.was, currency: v.currency, inStock: v.inStock, source: v.source };
  }
  if (r && !r.name) r.name = pageTitle(html);
  return r;
}

// Shopify /products/<handle>.js: prices in cents. When the link names a version (?variant=<id>, or option
// choices like ?Phone=Pixel+11+Pro+XL&Color=Charcoal), use that version's price; otherwise the lowest in stock.
const norm = (x) => String(x ?? '').toLowerCase().replace(/[+_]/g, ' ').replace(/\s+/g, ' ').trim();
function pickVariants(j, url) {
  const vs = j.variants.filter((v) => typeof v.price === 'number' || /^\d+$/.test(String(v.price)));
  let q = null;
  try { q = new URL(url).searchParams; } catch {}
  if (!q) return { list: vs, exact: false };
  const vid = q.get('variant');
  if (vid) { const v = vs.find((x) => String(x.id) === vid); if (v) return { list: [v], exact: true }; }
  const names = (j.options || []).map((o) => norm(typeof o === 'string' ? o : o.name));
  const wants = [];
  for (const [k, val] of q) { const i = names.indexOf(norm(k)); if (i >= 0 && val) wants.push([i, norm(val)]); }
  if (!wants.length) return { list: vs, exact: false };
  const opt = (v, i) => norm(v.options ? v.options[i] : v['option' + (i + 1)]);
  const match = vs.filter((v) => wants.every(([i, val]) => opt(v, i) === val));
  return match.length ? { list: match, exact: match.length === 1 } : { list: vs, exact: false };
}
function fromShopify(j, url) {
  if (!j || !Array.isArray(j.variants) || !j.variants.length) return null;
  const { list, exact } = pickVariants(j, url);
  if (!list.length) return null;
  const cents = (v) => (v == null || v === '' ? null : +v);
  const avail = list.filter((v) => v.available !== false);
  const pool = avail.length ? avail : list;
  const best = pool.reduce((a, b) => (cents(b.price) < cents(a.price) ? b : a));
  const was = cents(best.compare_at_price);
  return {
    name: (j.title || '') + (exact && best.title && best.title !== 'Default Title' ? ' · ' + best.title : '') || null,
    price: cents(best.price) / 100,
    high: Math.max(...list.map((v) => cents(v.price))) / 100,
    was: was && was > cents(best.price) ? was / 100 : null,
    currency: 'USD', inStock: avail.length > 0, source: exact ? 'Shopify (your version)' : 'Shopify',
  };
}

// Headless Shopify (Hydrogen) pages embed each version as JSON:
//   {"selectedOptions":[{"name":"Color","value":"Charcoal"},…],"price":{"amount":"39.89"},"compareAtPrice":{…},"availableForSale":true,…}
// Finds every JSON object holding "selectedOptions" inside the page's scripts.
function objectsWithKey(text, key) {
  const out = [], stack = [], marked = new Set();
  let inStr = false, esc = false, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        inStr = false;
        if (i - start === key.length + 1 && text.startsWith(key, start + 1) && stack.length) {
          let j = i + 1; while (text[j] === ' ') j++;
          if (text[j] === ':') marked.add(stack[stack.length - 1]);
        }
      }
      continue;
    }
    if (c === '"') { inStr = true; start = i; }
    else if (c === '{') stack.push(i);
    else if (c === '}') { const s = stack.pop(); if (s !== undefined && marked.has(s)) { marked.delete(s); out.push(text.slice(s, i + 1)); } }
  }
  return out;
}
const amount = (p) => num(p && typeof p === 'object' ? p.amount : p);
function embeddedVariants(html) {
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((t) => t.includes('selectedOptions'));
  const seen = new Map();
  for (const sc of scripts) {
    let objs = objectsWithKey(sc, 'selectedOptions');
    if (!objs.length && sc.includes('\\"selectedOptions\\"')) objs = objectsWithKey(sc.replace(/\\"/g, '"'), 'selectedOptions');
    for (const raw of objs) {
      let o; try { o = JSON.parse(raw); } catch { continue; }
      const price = amount(o.price ?? o.priceV2);
      if (!Array.isArray(o.selectedOptions) || !price) continue;
      const opts = {};
      for (const x of o.selectedOptions) if (x && x.name) opts[norm(x.name)] = norm(x.value);
      const id = o.id || JSON.stringify(opts) + price;
      if (!seen.has(id)) seen.set(id, { id, opts, label: o.selectedOptions.map((x) => x.value).join(' / '), price, was: amount(o.compareAtPrice ?? o.compareAtPriceV2), inStock: o.availableForSale ?? o.available ?? null });
    }
  }
  return [...seen.values()];
}
function fromEmbedded(html, url) {
  const vs = embeddedVariants(html);
  if (!vs.length) return null;
  let q; try { q = new URL(url).searchParams; } catch { return null; }
  const names = new Set(vs.flatMap((v) => Object.keys(v.opts)));
  const wants = [...q].map(([k, v]) => [norm(k), norm(v)]).filter(([k, v]) => names.has(k) && v);
  if (!wants.length) return null; // no version named in the link: the product-level price is the right answer
  const match = vs.filter((v) => wants.every(([k, val]) => v.opts[k] === val));
  if (!match.length) return null;
  const avail = match.filter((v) => v.inStock !== false), pool = avail.length ? avail : match;
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    price: best.price, high: Math.max(...match.map((v) => v.price)),
    was: best.was && best.was > best.price ? best.was : null,
    inStock: match.some((v) => v.inStock !== false) && (avail.length > 0 || match.every((v) => v.inStock == null)),
    label: best.label, currency: 'USD', source: 'store data (your version)',
  };
}

// Compact summary of what a product page contains, for the Diagnose button.
function diagnose(html, url) {
  const h = String(html || '');
  const around = (re, n = 220) => { const m = h.search(re); return m < 0 ? null : h.slice(Math.max(0, m - 60), m + n).replace(/\s+/g, ' '); };
  const metas = [...h.matchAll(/<meta[^>]+(?:price|availability|og:title)[^>]*>/gi)].slice(0, 8).map((m) => m[0]);
  return {
    bytes: h.length,
    title: pageTitle(h),
    jsonLd: jsonLdNodes(h).map((n) => types(n).join('/')).slice(0, 10),
    parsed: parseProduct(h, url),
    versions: embeddedVariants(h).slice(0, 15).map((v) => [v.label, v.price, v.was, v.inStock]),
    metas,
    shopify: /cdn\.shopify\.com|Shopify\.shop|myshopify\.com/.test(h),
    hydrogen: /__remixContext|__reactRouterContext|hydrogen/i.test(h),
    selectedOptions: around(/"selectedOptions"/),
    compareAt: around(/compareAtPrice|compare_at_price/),
    priceJson: around(/"price"\s*:\s*\{\s*"amount"/) || around(/"price"\s*:/),
  };
}

module.exports = { safeUrl, parseProduct, fromShopify, pageTitle, diagnose, embeddedVariants };
