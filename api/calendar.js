'use strict';
// Upcoming events from the calendars listed in Vercel settings CALENDAR_1 … CALENDAR_9.
// Each value is an iCal address (Google Calendar > Settings > the calendar > Integrate calendar),
// optionally with a name first: "Family|https://calendar.google.com/calendar/ical/…/basic.ics".
// Needs Google sign-in: these addresses can be private, so only the signed-in owner gets the events.
const A = require('../lib/auth');
const { eventsBetween } = require('../lib/ical');

const DAY = 864e5;
const cache = new Map(); // url -> { t, text }

function calendars() {
  const out = [];
  for (let i = 1; i <= 9; i++) {
    const raw = String(process.env['CALENDAR_' + i] || '').trim();
    if (!raw) continue;
    const bar = raw.lastIndexOf('|');
    const name = bar > 0 ? raw.slice(0, bar).trim() : '';
    let url = (bar > 0 ? raw.slice(bar + 1) : raw).trim().replace(/^webcal:\/\//i, 'https://');
    try { if (new URL(url).protocol !== 'https:') continue; } catch { continue; }
    out.push({ n: i, name, url });
  }
  return out;
}

async function fetchIcs(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.text;
  const r = await fetch(url, { headers: { accept: 'text/calendar' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const text = await r.text();
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('not a calendar');
  cache.set(url, { t: Date.now(), text });
  return text;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const cfg = A.config();
  if (!cfg || !A.currentUser(req)) return res.status(401).json({ error: 'Sign in required', signin: true });
  const list = calendars();
  if (!list.length) return res.status(200).json({ calendars: [], events: [], setup: true });

  const from = Date.now() - DAY, to = Date.now() + 9 * DAY;
  const results = await Promise.all(list.map(async (c, idx) => {
    try {
      const { name, events } = eventsBetween(await fetchIcs(c.url), from, to);
      return { cal: { idx, name: c.name || name || 'Calendar ' + c.n }, events: events.map((e) => ({ ...e, cal: idx })) };
    } catch (e) {
      return { cal: { idx, name: c.name || 'Calendar ' + c.n, error: "Couldn't load this calendar" }, events: [] };
    }
  }));
  res.status(200).json({ calendars: results.map((r) => r.cal), events: results.flatMap((r) => r.events) });
};
