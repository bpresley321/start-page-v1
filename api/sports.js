'use strict';
const TEAMS = require('../lib/teams');
const { summarize } = require('../lib/sports');

async function one(cfg) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/teams/${cfg.id}/schedule`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('ESPN ' + r.status);
  const s = summarize(await r.json(), cfg);
  if (!s.team.includes(cfg.expect)) throw new Error(`Team id ${cfg.id} is "${s.team}", expected ${cfg.expect}`);
  return s;
}

// ?cycling=1: men's road cycling (Wikipedia) for the Cycling card. Lives here to stay under Vercel's function limit.
const { cycling } = require('../lib/cycling');
async function cyclingRoute(res) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  try {
    const data = await cycling(today);
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400');
    return res.status(200).json({ ...data, today });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(502).json({ error: 'Cycling is unavailable right now' });
  }
}

module.exports = async (req, res) => {
  if (new URL(req.url || '/', 'http://x').searchParams.get('cycling')) return cyclingRoute(res);
  const settled = await Promise.allSettled(TEAMS.map(one));
  const teams = settled.map((r, i) => {
    const base = { key: TEAMS[i].key, label: TEAMS[i].label };
    return r.status === 'fulfilled' ? { ...base, ...r.value } : { ...base, error: 'Unavailable', detail: String(r.reason && r.reason.message || r.reason).slice(0, 120) };
  });
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return res.status(200).json({ teams });
};
