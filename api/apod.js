'use strict';
// Header photo: NASA Astronomy Picture of the Day. Uses NASA_API_KEY if set (free at api.nasa.gov), else DEMO_KEY;
// the answer is cached for 2 hours, so either stays far under NASA's limits.
const { pickApod, placeholder, parseApodPage, pageUrl, parseScienceFeed, parseSciencePage, SCIENCE_FEED } = require('../lib/apod');

// science.nasa.gov feed -> newest entry whose page has a real picture.
async function fromScience() {
  const r = await fetch(SCIENCE_FEED, { headers: { 'user-agent': 'Mozilla/5.0 (personal start page)' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const entries = parseScienceFeed(await r.text()).slice(0, 3);
  const got = await Promise.all(entries.map(async (e) => {
    try {
      const p = await fetch(e.link, { headers: { 'user-agent': 'Mozilla/5.0 (personal start page)' }, signal: AbortSignal.timeout(6000) });
      return p.ok ? parseSciencePage(await p.text(), e) : null;
    } catch { return null; }
  }));
  return got.find(Boolean) || null;
}
async function fallback() {
  return (await fromScience().catch(() => null)) || (await fromPages().catch(() => null));
}

// When NASA's API sends only stand-ins, read the newest of the last 7 classic APOD pages instead.
async function fromPages() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - i * 864e5)));
  const got = await Promise.all(days.map(async (d) => {
    try {
      const r = await fetch(pageUrl(d), { signal: AbortSignal.timeout(6000) });
      return r.ok ? parseApodPage(await r.text(), d) : null;
    } catch { return null; }
  }));
  const pic = got.find(Boolean);
  if (!pic) return null;
  const { explanation, ...rest } = pic;
  return rest;
}

// ?source=unsplash&q=<theme>&day=<YYYY-MM-DD>: one Unsplash photo per theme per day (the CDN caches it by URL).
const { fromUnsplash } = require('../lib/unsplash');
async function unsplash(req, res, qs) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return res.status(503).json({ error: 'Add UNSPLASH_ACCESS_KEY in Vercel to use Unsplash photos', setup: true });
  const q = (qs.get('q') || 'mountains landscape').slice(0, 60);
  try {
    const r = await fetch('https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&query=' + encodeURIComponent(q), {
      headers: { authorization: 'Client-ID ' + key, 'accept-version': 'v1' }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('Unsplash ' + r.status);
    const pic = fromUnsplash(await r.json());
    if (!pic) throw new Error('no photo');
    if (pic.download) fetch(pic.download, { headers: { authorization: 'Client-ID ' + key } }).catch(() => {});
    const { download, ...out } = pic;
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(502).json({ error: 'Unsplash is unavailable right now' });
  }
}

module.exports = async (req, res) => {
  const qs0 = new URL(req.url || '/', 'http://x').searchParams;
  if (qs0.get('source') === 'unsplash') return unsplash(req, res, qs0);
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const debug = new URL(req.url || '/', 'http://x').searchParams.has('debug');
  const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&start_date=${start}`, { signal: AbortSignal.timeout(5000) });
    const raw = await r.json().catch(() => null);
    if (debug) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        status: r.status, key: process.env.NASA_API_KEY ? 'your key' : 'DEMO_KEY',
        picked: pickApod(raw), fromScience: await fromScience().catch((e) => ({ error: String(e.message || e) })), fromPages: await fromPages().catch((e) => ({ error: String(e.message || e) })),
        entries: Array.isArray(raw) ? raw.map((x) => ({ date: x.date, media_type: x.media_type, title: x.title, url: x.url, hdurl: x.hdurl, copyright: x.copyright, explanation: String(x.explanation || '').slice(0, 60), skipped: placeholder(x) })) : raw,
      });
    }
    const pic = pickApod(raw) || await fallback();
    if (!pic) throw new Error('no image this week');
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=86400');
    return res.status(200).json(pic);
  } catch (e) {
    const pic = await fallback();
    if (pic) { res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=86400'); return res.status(200).json(pic); }
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(502).json({ error: 'Picture of the day is unavailable right now' });
  }
};
