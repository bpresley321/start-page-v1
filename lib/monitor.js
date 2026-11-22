'use strict';
// Monitoring rows: each check returns { id, title, status, value, detail, link, updated? }.
// status is 'green' | 'yellow' | 'red', or 'gray' when the data couldn't be read.
const { riskAt } = require('./storm');

const UA = 'personal-start-page (github.com/bpresley321/start-page-v1)';
const DFW = { lat: 32.8998, lon: -97.0403 }; // DFW Airport

function gray(id, title, link, detail) {
  return { id, title, status: 'gray', value: 'Unavailable', detail: detail || "Couldn't read this right now", link };
}
async function get(url, type = 'json', headers = {}) {
  const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return type === 'json' ? r.json() : r.text();
}

/* ---------- NWS watches, warnings and advisories ---------- */
const RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
function nwsRow(geo, place, now = Date.now()) {
  const link = 'https://forecast.weather.gov/MapClick.php?lat=' + place.lat + '&lon=' + place.lon;
  const alerts = ((geo && geo.features) || []).map((f) => f.properties || {})
    .filter((p) => p.event && p.status !== 'Test' && (!p.ends || Date.parse(p.ends) > now) && (!p.expires || Date.parse(p.expires) > now))
    .sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0));
  const seen = new Set(), events = [];
  for (const a of alerts) if (!seen.has(a.event)) { seen.add(a.event); events.push(a); }
  if (!events.length) return { id: 'nws', title: 'NWS alerts', status: 'green', value: 'None', detail: 'No watches, warnings or advisories for ' + place.name, link };
  const status = events.some((a) => /warning/i.test(a.event)) ? 'red' : 'yellow';
  const until = (a) => { const t = a.ends || a.expires; return t ? ' until ' + new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
  return {
    id: 'nws', title: 'NWS alerts', status,
    value: events.length === 1 ? events[0].event : events[0].event + ' +' + (events.length - 1),
    detail: events.map((a) => a.event + until(a)).join(' · '),
    link,
  };
}

/* ---------- SPC storm risk ---------- */
function stormRow(today, tomorrow, place) {
  const link = 'https://www.spc.noaa.gov/products/outlook/';
  if (!today && !tomorrow) return gray('spc', 'Storm risk', link);
  const lvl = (r) => (r && !r.none ? r.level : -1);
  const worst = Math.max(lvl(today), lvl(tomorrow));
  const label = (r) => (!r ? '—' : r.none ? 'None' : r.level ? `${r.name} ${r.level}/5` : 'T-storms');
  return {
    id: 'spc', title: 'Storm risk', status: worst >= 3 ? 'red' : worst === 2 ? 'yellow' : 'green',
    value: 'Today ' + label(today), detail: 'Tomorrow: ' + label(tomorrow) + ' · ' + place.name, link,
    chips: [today, tomorrow],
  };
}

/* ---------- Lake Weatherford (Water Data for Texas) ---------- */
const LAKE_PAGE = 'https://www.waterdatafortexas.org/reservoirs/individual/weatherford';
function parseLakeCsv(csv) {
  const lines = String(csv).split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return null;
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iDate = col('date'), iPct = col('percent_full'), iLvl = col('water_level');
  if (iDate < 0 || iPct < 0) return null;
  const rows = lines.slice(1).map((l) => l.split(',')).filter((c) => c[iPct] !== undefined && c[iPct].trim() !== '' && !isNaN(+c[iPct]))
    .map((c) => ({ date: c[iDate].trim(), pct: +c[iPct], level: iLvl >= 0 && c[iLvl] && !isNaN(+c[iLvl]) ? +c[iLvl] : null }));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const weekAgo = rows.filter((r) => r.date <= shiftDate(last.date, -7)).pop();
  return { ...last, change7: weekAgo ? +(last.pct - weekAgo.pct).toFixed(1) : null };
}
function shiftDate(d, days) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); }
function parseLakeTitle(html) {
  const m = String(html).match(/Lake Weatherford:\s*([\d.]+)%\s*full\s*as of\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? { pct: +m[1], date: m[2], level: null, change7: null } : null;
}
function lakeRow(d) {
  if (!d) return gray('lake', 'Lake Weatherford', LAKE_PAGE);
  const status = d.pct >= 80 ? 'green' : d.pct >= 50 ? 'yellow' : 'red';
  const parts = [];
  if (d.level != null) parts.push(d.level.toFixed(2) + ' ft');
  if (d.change7 != null) parts.push((d.change7 > 0 ? '+' : '') + d.change7 + ' pts in 7 days');
  parts.push('as of ' + new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  return { id: 'lake', title: 'Lake Weatherford', status, value: d.pct.toFixed(1) + '% full', detail: parts.join(' · '), link: LAKE_PAGE };
}

/* ---------- Air quality, DFW (Open-Meteo, US AQI) ---------- */
const AQ_LINK = 'https://www.airnow.gov/?city=Dallas&state=TX&country=USA';
function aqiCategory(v) {
  return v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Unhealthy for sensitive groups' : v <= 200 ? 'Unhealthy' : v <= 300 ? 'Very unhealthy' : 'Hazardous';
}
function aqiRow(j, now = Date.now()) {
  const cur = j && j.current && j.current.us_aqi;
  if (cur == null) return gray('aqi', 'Air quality · DFW', AQ_LINK);
  const v = Math.round(cur);
  let peak = null;
  if (j.hourly && j.hourly.time) {
    const end = now + 24 * 3600e3;
    j.hourly.time.forEach((t, i) => {
      const ms = Date.parse(t.length === 16 ? t + ':00Z' : t), a = j.hourly.us_aqi[i];
      if (a != null && ms >= now - 3600e3 && ms <= end && (peak == null || a > peak)) peak = Math.round(a);
    });
  }
  const worst = Math.max(v, peak || 0);
  return {
    id: 'aqi', title: 'Air quality · DFW', status: worst > 100 ? 'red' : worst > 50 ? 'yellow' : 'green',
    value: 'AQI ' + v + ' · ' + aqiCategory(v),
    detail: (peak != null ? 'Next 24 hr peak: ' + peak + ' (' + aqiCategory(peak) + ')' : '') + ' · model estimate',
    link: AQ_LINK,
  };
}

/* ---------- DFW airport (FAA National Airspace System status) ---------- */
const FAA_LINK = 'https://nasstatus.faa.gov/';
const MISERY = 'https://www.flightaware.com/miserymap/';
const tag = (xml, t) => { const m = String(xml).match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>', 'i')); return m ? m[1].trim() : ''; };
function airportEvents(xml, code = 'DFW') {
  const out = [];
  for (const block of String(xml).split(/<Delay_type>/i).slice(1)) {
    const kind = tag(block, 'Name');
    const re = new RegExp('<(\\w+)>\\s*<ARPT>' + code + '</ARPT>([\\s\\S]*?)</\\1>', 'gi');
    for (const m of block.matchAll(re)) {
      const body = m[2], reason = tag(body, 'Reason').replace(/\s+/g, ' ');
      if (/ground stop/i.test(kind)) out.push({ sev: 3, text: 'Ground stop' + (tag(body, 'End_Time') ? ' until ' + tag(body, 'End_Time') : ''), reason });
      else if (/ground delay/i.test(kind)) out.push({ sev: 3, text: 'Ground delay program, avg ' + (tag(body, 'Avg') || '?'), reason });
      else if (/closure/i.test(kind)) out.push({ sev: 2, text: 'Closure' + (tag(body, 'Reopen') ? ', reopens ' + tag(body, 'Reopen') : ''), reason });
      else {
        for (const ad of body.matchAll(/<Arrival_Departure\s+Type="(\w+)">([\s\S]*?)<\/Arrival_Departure>/gi)) {
          const trend = tag(ad[2], 'Trend');
          out.push({ sev: 2, text: ad[1] + ' delays ' + tag(ad[2], 'Min') + '–' + tag(ad[2], 'Max') + (trend ? ' (' + trend.toLowerCase() + ')' : ''), reason });
        }
      }
    }
  }
  return out;
}
const REASONS = { WX: 'weather', TM: 'traffic management', VOL: 'volume', RWY: 'runway', EQ: 'equipment' };
function airportRow(xml) {
  if (xml == null) return gray('dfw', 'DFW airport', FAA_LINK);
  const ev = airportEvents(xml);
  if (!ev.length) return { id: 'dfw', title: 'DFW airport', status: 'green', value: 'No FAA delays', detail: 'No ground stops, delay programs or closures', link: MISERY };
  const worst = Math.max(...ev.map((e) => e.sev));
  const why = [...new Set(ev.map((e) => e.reason).join(' ').match(/\b(WX|TM|VOL|RWY|EQ)\b/g) || [])].map((k) => REASONS[k]);
  return {
    id: 'dfw', title: 'DFW airport', status: worst >= 3 ? 'red' : 'yellow',
    value: ev[0].text, detail: ev.slice(1).map((e) => e.text).concat(why.length ? ['Cause: ' + why.join(', ')] : []).join(' · ') || ev[0].reason,
    link: MISERY,
  };
}

/* ---------- SPY (S&P 500 ETF), delayed quote ---------- */
const SPY_LINK = 'https://finance.yahoo.com/quote/SPY/';
// Yahoo Finance chart data: meta has regularMarketPrice, chartPreviousClose, regularMarketTime, 52-week range.
function spyFromYahoo(j) {
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || typeof m.regularMarketPrice !== 'number') return null;
  const prev = m.chartPreviousClose ?? m.previousClose;
  if (typeof prev !== 'number' || !prev) return null;
  return { price: m.regularMarketPrice, prev, time: m.regularMarketTime ? m.regularMarketTime * 1000 : null, high52: m.fiftyTwoWeekHigh ?? null, source: 'Yahoo Finance' };
}
// Stooq daily CSV: Date,Open,High,Low,Close,Volume (oldest first).
function spyFromStooq(csv) {
  const rows = String(csv).trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => c.length >= 5 && !isNaN(+c[4]) && c[4] !== '');
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const year = rows.slice(-252).map((c) => +c[2]).filter((x) => !isNaN(x));
  return { price: +last[4], prev: +prev[4], time: Date.parse(last[0] + 'T21:00:00Z'), high52: year.length ? Math.max(...year) : null, source: 'Stooq' };
}
function spyRow(q) {
  if (!q) return gray('spy', 'SPY', SPY_LINK);
  const pct = ((q.price - q.prev) / q.prev) * 100, chg = q.price - q.prev;
  const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
  const parts = [sign(chg) + '$' + Math.abs(chg).toFixed(2) + ' today'];
  if (q.high52) { const off = ((q.high52 - q.price) / q.high52) * 100; parts.push(off < 0.5 ? 'at its 52-week high' : off.toFixed(1) + '% below 52-week high'); }
  if (q.time) parts.push('as of ' + new Date(q.time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }));
  parts.push(q.source + ', delayed');
  return {
    id: 'spy', title: 'SPY', status: pct <= -2.5 ? 'red' : pct <= -1 ? 'yellow' : 'green',
    value: '$' + q.price.toFixed(2) + ' · ' + sign(pct) + Math.abs(pct).toFixed(2) + '%',
    detail: parts.join(' · '), link: SPY_LINK,
  };
}
async function spyData() {
  try { const q = spyFromYahoo(await get('https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=5m', 'json', { 'user-agent': 'Mozilla/5.0' })); if (q) return q; } catch {}
  try { return spyFromStooq(await get('https://stooq.com/q/d/l/?s=spy.us&i=d', 'text')); } catch { return null; }
}

/* ---------- run everything ---------- */
async function lakeData() {
  try { const d = parseLakeCsv(await get(LAKE_PAGE + '-30day.csv', 'text')); if (d) return d; } catch {}
  try { return parseLakeTitle(await get(LAKE_PAGE, 'text')); } catch { return null; }
}

async function monitor(place, deps = {}) {
  const storm = deps.stormRisk || require('./storm').stormRisk;
  const [nws, spc, lake, aq, faa, spy] = await Promise.all([
    get(`https://api.weather.gov/alerts/active?point=${place.lat.toFixed(4)},${place.lon.toFixed(4)}`, 'json', { accept: 'application/geo+json' })
      .then((j) => nwsRow(j, place)).catch(() => gray('nws', 'NWS alerts', 'https://alerts.weather.gov/')),
    storm(place.lat, place.lon).then((s) => stormRow(s && s.today, s && s.tomorrow, place)).catch(() => gray('spc', 'Storm risk', 'https://www.spc.noaa.gov/products/outlook/')),
    lakeData().then(lakeRow),
    get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${DFW.lat}&longitude=${DFW.lon}&current=us_aqi&hourly=us_aqi&forecast_days=2&timezone=GMT`)
      .then((j) => aqiRow(j)).catch(() => gray('aqi', 'Air quality · DFW', AQ_LINK)),
    get('https://nasstatus.faa.gov/api/airport-status-information', 'text').then(airportRow).catch(() => gray('dfw', 'DFW airport', FAA_LINK)),
    spyData().then(spyRow),
  ]);
  return [nws, spc, lake, aq, faa, spy];
}

module.exports = { spyFromYahoo, spyFromStooq, spyRow, monitor, nwsRow, stormRow, parseLakeCsv, parseLakeTitle, lakeRow, aqiRow, airportEvents, airportRow, riskAt };
