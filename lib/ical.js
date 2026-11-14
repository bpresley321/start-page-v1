'use strict';
// Dependency-free iCalendar (.ics) reader: returns the events (including repeats) that fall in a time window.
// Handles TZID / UTC / floating / all-day times, RRULE (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT,
// UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS), EXDATE, and moved or cancelled single occurrences (RECURRENCE-ID).

const DAY = 864e5;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const WIN_TZ = {
  'Central Standard Time': 'America/Chicago', 'Eastern Standard Time': 'America/New_York',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix', 'GMT Standard Time': 'Europe/London', UTC: 'UTC',
};

function unfold(text) { return String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }

function parseLine(line) {
  let i = 0, q = false;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params = {};
  for (const p of ps) { const j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value };
}

function text(v) { return String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim(); }

function validTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } }
function normTz(tz, fallback) { const t = WIN_TZ[tz] || tz; return t && validTz(t) ? t : fallback; }

const fmtCache = {};
function tzOffset(ms, tz) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = +x.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
function zonedToUtc(w, tz) {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  if (tz === 'UTC') return guess;
  const t1 = guess - tzOffset(guess, tz);
  return guess - tzOffset(t1, tz);
}

// A date-time value -> { allDay, w (wall clock), tz } ; tz 'UTC' for Z values.
function parseDT(prop, defTz) {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const w = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  if (!m[4] || prop.params.VALUE === 'DATE') return { allDay: true, w };
  return { allDay: false, w, tz: m[7] ? 'UTC' : normTz(prop.params.TZID, defTz) };
}
function dtMs(dt) { return dt.allDay ? Date.UTC(dt.w.y, dt.w.m - 1, dt.w.d) : zonedToUtc(dt.w, dt.tz); }
function dateKey(ms) { return new Date(ms).toISOString().slice(0, 10); }

function durationMs(v) {
  const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 24 * 3600 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRule(v) {
  const r = {};
  for (const part of String(v).split(';')) { const [k, x] = part.split('='); if (k && x != null) r[k.toUpperCase()] = x; }
  return {
    freq: r.FREQ, interval: Math.max(1, +r.INTERVAL || 1), count: r.COUNT ? +r.COUNT : null, until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((s) => { const m = s.match(/^([+-]?\d+)?([A-Z]{2})$/); return m && { n: m[1] ? +m[1] : 0, wd: WD[m[2]] }; }).filter((x) => x && x.wd != null) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
    bysetpos: r.BYSETPOS ? r.BYSETPOS.split(',').map(Number) : null,
  };
}

const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
function daysInMonth(y, m, rule, startDay) {
  const n = dim(y, m);
  let days;
  if (rule.bymonthday) days = rule.bymonthday.map((d) => (d < 0 ? n + d + 1 : d)).filter((d) => d >= 1 && d <= n);
  else if (rule.byday) {
    days = [];
    for (const { n: ord, wd } of rule.byday) {
      const all = [];
      for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) all.push(d);
      if (!ord) days.push(...all); else { const d = ord > 0 ? all[ord - 1] : all[all.length + ord]; if (d) days.push(d); }
    }
  } else days = startDay <= n ? [startDay] : [];
  days = [...new Set(days)].sort((a, b) => a - b);
  if (rule.bysetpos) days = rule.bysetpos.map((p) => (p > 0 ? days[p - 1] : days[days.length + p])).filter(Boolean);
  return days;
}

// Yields candidate dates {y,m,d} in order, starting with the period that contains the start date.
function* candidates(rule, s) {
  const base = Date.UTC(s.y, s.m - 1, s.d);
  if (rule.freq === 'DAILY') {
    for (let t = base; ; t += rule.interval * DAY) {
      const x = new Date(t);
      if (rule.byday && !rule.byday.some((b) => b.wd === x.getUTCDay())) continue;
      if (rule.bymonth && !rule.bymonth.includes(x.getUTCMonth() + 1)) continue;
      yield { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
    }
  } else if (rule.freq === 'WEEKLY') {
    const monday = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY;
    const wds = (rule.byday ? rule.byday.map((b) => b.wd) : [new Date(base).getUTCDay()]).map((w) => (w + 6) % 7).sort((a, b) => a - b);
    for (let wk = monday; ; wk += rule.interval * 7 * DAY) {
      for (const off of [...new Set(wds)]) { const x = new Date(wk + off * DAY); yield { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let i = 0; i < 12 * 200; i += rule.interval) {
      const y = s.y + Math.floor((s.m - 1 + i) / 12), m = ((s.m - 1 + i) % 12) + 1;
      if (rule.bymonth && !rule.bymonth.includes(m)) continue;
      for (const d of daysInMonth(y, m, rule, s.d)) yield { y, m, d };
    }
  } else if (rule.freq === 'YEARLY') {
    for (let y = s.y; y < s.y + 200; y += rule.interval) {
      for (const m of rule.bymonth || [s.m]) {
        const r = rule.byday || rule.bymonthday ? rule : { ...rule, bymonthday: [s.d] };
        for (const d of daysInMonth(y, m, r, s.d)) yield { y, m, d };
      }
    }
  }
}

function parseCalendar(ics, defTz = 'America/Chicago') {
  const lines = unfold(ics).split('\n');
  const events = [];
  let name = '', calTz = defTz, cur = null, depth = 0;
  for (const raw of lines) {
    const line = raw.trimEnd(); if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = { props: {}, exdates: [] }; depth = 0; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (cur) {
      if (line.startsWith('BEGIN:')) { depth++; continue; }      // e.g. VALARM
      if (line.startsWith('END:')) { depth--; continue; }
      if (depth > 0) continue;
      const p = parseLine(line);
      if (p.name === 'EXDATE') { for (const v of p.value.split(',')) cur.exdates.push({ ...p, value: v }); }
      else if (!cur.props[p.name]) cur.props[p.name] = p;
    } else {
      const p = parseLine(line);
      if (p.name === 'X-WR-CALNAME') name = text(p.value);
      if (p.name === 'X-WR-TIMEZONE') calTz = normTz(p.value.trim(), defTz);
    }
  }
  return { name, tz: calTz, events };
}

// Returns [{title, location, allDay, start, end}] overlapping [fromMs, toMs). start/end are ISO times,
// or YYYY-MM-DD dates (end exclusive) for all-day events.
function eventsBetween(ics, fromMs, toMs, opts = {}) {
  const cal = parseCalendar(ics, opts.tz || 'America/Chicago');
  const out = [];
  const overrides = new Map(); // uid -> Set of original start ms that were moved or cancelled
  for (const e of cal.events) {
    const rid = parseDT(e.props['RECURRENCE-ID'], cal.tz);
    if (rid && e.props.UID) { const u = e.props.UID.value; if (!overrides.has(u)) overrides.set(u, new Set()); overrides.get(u).add(dtMs(rid)); }
  }
  const push = (e, startMs, durMs, allDay) => {
    const endMs = startMs + durMs;
    if (endMs <= fromMs || startMs >= toMs) return;
    out.push({
      title: text(e.props.SUMMARY && e.props.SUMMARY.value) || '(No title)',
      location: text(e.props.LOCATION && e.props.LOCATION.value),
      allDay,
      start: allDay ? dateKey(startMs) : new Date(startMs).toISOString(),
      end: allDay ? dateKey(endMs) : new Date(endMs).toISOString(),
    });
  };
  for (const e of cal.events) {
    if (e.props.STATUS && /CANCELLED/i.test(e.props.STATUS.value)) continue;
    const st = parseDT(e.props.DTSTART, cal.tz); if (!st) continue;
    const startMs = dtMs(st);
    const en = parseDT(e.props.DTEND, cal.tz);
    let dur = en ? dtMs(en) - startMs : durationMs(e.props.DURATION && e.props.DURATION.value);
    if (dur == null || dur < 0) dur = st.allDay ? DAY : 0;
    if (dur === 0 && st.allDay) dur = DAY;
    const rrule = e.props.RRULE && !e.props['RECURRENCE-ID'] ? parseRule(e.props.RRULE.value) : null;
    if (!rrule || !rrule.freq) { push(e, startMs, dur, st.allDay); continue; }

    const skip = new Set(e.exdates.map((x) => parseDT(x, st.tz || cal.tz)).filter(Boolean).map(dtMs));
    const moved = (e.props.UID && overrides.get(e.props.UID.value)) || new Set();
    let untilMs = Infinity;
    if (rrule.until) { const u = parseDT({ value: rrule.until, params: {} }, st.tz || cal.tz); if (u) untilMs = u.allDay && !st.allDay ? dtMs(u) + DAY - 1 : dtMs(u); }
    let n = 0, guard = 0;
    for (const c of candidates(rrule, st.w)) {
      if (++guard > 50000) break;
      const w = { ...st.w, y: c.y, m: c.m, d: c.d };
      const ms = st.allDay ? Date.UTC(c.y, c.m - 1, c.d) : zonedToUtc(w, st.tz);
      if (ms < startMs) continue;
      if (ms > untilMs || ms >= toMs) break;
      n++;
      if (rrule.count && n > rrule.count) break;
      if (skip.has(ms) || moved.has(ms)) continue;
      push(e, ms, dur, st.allDay);
    }
  }
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0)));
  return { name: cal.name, events: out };
}

module.exports = { eventsBetween, parseCalendar, zonedToUtc, durationMs };
