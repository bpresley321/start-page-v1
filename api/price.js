'use strict';
// Price of a product page, for the Shopping watch list. Signed-in only, since it fetches pages on request.
const A = require('../lib/auth');
const { safeUrl, parseProduct, fromShopify, pageTitle, diagnose } = require('../lib/price');

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};
const MAX = 4 * 1024 * 1024;

async function fetchText(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!safeUrl(r.url || url)) throw Object.assign(new Error('redirected off-site'), { code: 'bad-redirect' });
  const text = (await r.text()).slice(0, MAX);
  return { ok: r.ok, status: r.status, text };
}

// What each method saw, for fixing stores the reader gets wrong. Signed-in only (checked by the caller).
async function debugReport(u, res) {
  res.setHeader('Cache-Control', 'no-store');
  const out = { url: u.href, steps: [] };
  if (/\/products\/[^/]+/.test(u.pathname)) {
    const jsUrl = u.origin + u.pathname.replace(/(\/products\/[^/?#]+).*$/, '$1').replace(/\/$/, '') + '.js';
    try {
      const r = await fetch(jsUrl, { headers: { ...HEADERS, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      out.steps.push({ step: 'shopify .js', status: r.status, json: !!j, options: j && j.options, variants: j && j.variants && j.variants.slice(0, 12).map((v) => [v.id, v.title, v.price, v.compare_at_price, v.available]), result: j ? fromShopify(j, u.href) : null, start: j ? undefined : t.slice(0, 200) });
    } catch (e) { out.steps.push({ step: 'shopify .js', error: String(e.message || e) }); }
  }
  try {
    const page = await fetchText(u.href);
    out.steps.push({ step: 'page', status: page.status, ...diagnose(page.text) });
  } catch (e) { out.steps.push({ step: 'page', error: String(e.message || e) }); }
  return res.status(200).json(out);
}

module.exports = async (req, res) => {
  if (A.config() && !A.currentUser(req)) return res.status(401).json({ error: 'Sign in required', signin: true });
  const qs = new URL(req.url, 'http://x').searchParams;
  const u = safeUrl(qs.get('url') || '');
  if (!u) return res.status(400).json({ error: 'Use a full https:// product link' });
  if (qs.get('debug')) return debugReport(u, res);
  try {
    // Shopify stores: the per-version price list is more exact than the page (which shows one default version).
    let r = null;
    if (/\/products\/[^/]+/.test(u.pathname)) {
      try {
        const js = await fetch(u.origin + u.pathname.replace(/(\/products\/[^/?#]+).*$/, '$1').replace(/\/$/, '') + '.js', { headers: { ...HEADERS, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (js.ok) r = fromShopify(await js.json(), u.href);   // not JSON (not a Shopify store) -> caught, page is read instead
      } catch {}
    }
    const page = r ? { ok: true, status: 200, text: '' } : await fetchText(u.href);
    if (!r && page.ok) r = parseProduct(page.text);
    if (!r) {
      const blocked = page.status === 403 || page.status === 429 || page.status === 503;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        error: blocked ? 'This store blocked the price check' : page.ok ? "Couldn't find a price on this page" : 'The page returned an error (' + page.status + ')',
        name: page.ok ? pageTitle(page.text) : null,
      });
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ ...r, url: u.href, checked: new Date().toISOString() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ error: e.code === 'bad-redirect' ? 'The link redirected somewhere unexpected' : "Couldn't reach this store right now" });
  }
};
