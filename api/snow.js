'use strict';
// Purgatory snow report: new snow, base, season total, lifts and trails open.
const { parseSnow, PAGE } = require('../lib/snow');

module.exports = async (req, res) => {
  try {
    const r = await fetch(PAGE, { headers: { 'user-agent': 'Mozilla/5.0 (personal start page)', accept: 'text/html' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const report = parseSnow(await r.text());
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.status(200).json({ report, url: PAGE });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Snow report is unavailable right now', url: PAGE });
  }
};
