'use strict';
// Price of a product page, for the Shopping watch list. Signed-in only, since it fetches pages on request.
const A = require('../lib/auth');
const { safeUrl, parseProduct, fromShopify, pageTitle } = require('../lib/price');

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

module.exports = async (req, res) => {
  if (A.config() && !A.currentUser(req)) return res.status(401).json({ error: 'Sign in required', signin: true });
  const u = safeUrl(new URL(req.url, 'http://x').searchParams.get('url') || '');
  if (!u) return res.status(400).json({ error: 'Use a full https:// product link' });
  try {
    const page = await fetchText(u.href);
    let r = page.ok ? parseProduct(page.text) : null;
    if (!r && /\/products\/[^/]+/.test(u.pathname)) {
      try {
        const js = await fetch(u.origin + u.pathname.replace(/\/$/, '').replace(/(\/products\/[^/?#]+).*$/, '$1') + '.js', { headers: { ...HEADERS, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (js.ok) r = fromShopify(await js.json());
      } catch {}
    }
    if (!r) {
      const blocked = page.status === 403 || page.status === 429 || page.status === 503;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        error: blocked ? 'This store blocked the price check' : page.ok ? "Couldn't find a price on this page" : 'The page returned an error (' + page.status + ')',
        name: page.ok ? pageTitle(page.text) : null,
      });
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json({ ...r, url: u.href, checked: new Date().toISOString() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ error: e.code === 'bad-redirect' ? 'The link redirected somewhere unexpected' : "Couldn't reach this store right now" });
  }
};
