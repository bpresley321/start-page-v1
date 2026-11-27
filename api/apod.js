'use strict';
// Header photo: NASA Astronomy Picture of the Day. Uses NASA_API_KEY if set (free at api.nasa.gov), else DEMO_KEY;
// the answer is cached for 2 hours, so either stays far under NASA's limits.
const { pickApod, placeholder } = require('../lib/apod');

module.exports = async (req, res) => {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const debug = new URL(req.url || '/', 'http://x').searchParams.has('debug');
  const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&start_date=${start}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok && !debug) throw new Error('NASA ' + r.status);
    const raw = await r.json().catch(() => null);
    if (debug) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        status: r.status, key: process.env.NASA_API_KEY ? 'your key' : 'DEMO_KEY',
        picked: pickApod(raw),
        entries: Array.isArray(raw) ? raw.map((x) => ({ date: x.date, media_type: x.media_type, title: x.title, url: x.url, hdurl: x.hdurl, copyright: x.copyright, explanation: String(x.explanation || '').slice(0, 60), skipped: placeholder(x) })) : raw,
      });
    }
    const pic = pickApod(raw);
    if (!pic) throw new Error('no image this week');
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=86400');
    return res.status(200).json(pic);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(502).json({ error: 'Picture of the day is unavailable right now' });
  }
};
