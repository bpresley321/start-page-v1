'use strict';
// Men's road cycling from Wikipedia: the season pages "<year> UCI World Tour" and "<year> UCI ProSeries" give
// the calendar (and podiums: World Tour lists 1st–3rd, ProSeries the winner); each race's own page gives its
// final top 10 (sometimes more), from which Americans are picked out by the "(USA)" after their name.
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'personal-start-page/1.0 (github.com/bpresley321/start-page-v1)';
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function text(h) {
  return String(h || '')
    .replace(/<sup[\s\S]*?<\/sup>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/\s+/g, ' ').trim();
}

// All <table>s, with their caption (or the heading just before them) and rows of cells (raw HTML).
function tables(html) {
  const h = String(html || ''), out = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(h))) {
    const before = h.slice(Math.max(0, m.index - 1500), m.index);
    const heads = [...before.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)];
    const caption = text((m[1].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i) || [])[1]);
    const rows = [...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) => ({ th: c[1] === 'h', html: c[2], text: text(c[2]) })));
    out.push({ caption, heading: heads.length ? text(heads[heads.length - 1][1]) : '', rows });
  }
  return out;
}

// "Jay Vine (AUS)" -> { name: 'Jay Vine', nat: 'AUS' }
function rider(t) {
  const m = String(t || '').match(/^(.*?)\s*\(([A-Z]{3})\)/);
  if (m && m[1].trim()) return { name: m[1].trim(), nat: m[2] };
  const s = String(t || '').trim();
  return s && !/^(cancell?ed|not held|—|-|tbd)$/i.test(s) ? { name: s, nat: null } : null;
}

// "20–25 January", "1 February", "30 January – 3 February", "28 February–1 March" (season year given)
function dates(t, year) {
  const s = String(t || '').replace(/[–—]/g, '-');
  let m = s.match(/(\d{1,2})\s*([A-Za-z]+)?\s*-\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (m) {
    const m2 = MONTHS[m[4].toLowerCase()], m1 = m[2] ? MONTHS[m[2].toLowerCase()] : m2;
    if (m1 == null || m2 == null) return null;
    return { start: iso(year, m1, +m[1]), end: iso(year, m2, +m[3]) };
  }
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)/);
  if (m && MONTHS[m[2].toLowerCase()] != null) { const d = iso(year, MONTHS[m[2].toLowerCase()], +m[1]); return { start: d, end: d }; }
  return null;
}
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Season page -> [{ name, page, start, end, cls, podium: [rider|null x3], cancelled }]
function parseSeason(html, year, cls) {
  const t = tables(html).find((x) => x.rows.length > 2 && x.rows[0].some((c) => /^race$/i.test(c.text)) && x.rows[0].some((c) => /^date/i.test(c.text)));
  if (!t) return [];
  const head = t.rows[0].map((c) => c.text.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iRace = col(/^race$/), iDate = col(/^date/), iWin = col(/^winner$/), i2 = col(/^second$/), i3 = col(/^third$/);
  const out = [];
  for (const r of t.rows.slice(1)) {
    if (r.length <= Math.max(iRace, iDate)) continue;
    const cell = r[iRace];
    const name = cell.text;   // flags are images, so they add no text
    const links = [...cell.html.matchAll(/<a\b[^>]*href="\/wiki\/([^"#]+)"[^>]*>/gi)].map((x) => decodeURIComponent(x[1])).filter((p) => !/^(File|Image|Category):/i.test(p));
    const d = dates(r[iDate].text, year);
    if (!name || !d) continue;
    const pod = [iWin, i2, i3].map((i) => (i >= 0 && r[i] ? rider(r[i].text) : null));
    const cancelled = /cancel|not held/i.test(r.map((c) => c.text).join(' '));
    out.push({ name, page: links.length ? links[links.length - 1].replace(/_/g, ' ') : null, ...d, cls, podium: cancelled ? [null, null, null] : pod, cancelled });
  }
  return out;
}

// Race page -> final standings [{ rank, name, nat }] (general classification for stage races, result for one-day)
function parseRace(html) {
  const cand = tables(html).filter((t) => {
    const head = (t.rows.find((r) => r.some((c) => c.th)) || []).map((c) => c.text.toLowerCase());
    return head.some((h) => /^(rank|pos\.?|position)$/.test(h)) && head.some((h) => /^rider$/.test(h));
  });
  const label = (t) => (t.caption || t.heading || '').toLowerCase();
  const pick = [...cand].reverse().find((t) => /general classification/.test(label(t)) && !/after stage|stage \d/.test(label(t)))
    || [...cand].reverse().find((t) => /^(final )?result/.test(label(t)))
    || (cand.length === 1 ? cand[0] : null);
  if (!pick) return [];
  const out = [];
  for (const r of pick.rows) {
    if (r.every((c) => c.th) || r.length < 2) continue;
    const rank = parseInt(r[0].text, 10);
    const who = r.slice(1).map((c) => rider(c.text)).find((x) => x && x.nat);
    if (rank && who) out.push({ rank, ...who });
  }
  return out.slice(0, 30);
}

async function wiki(page) {
  const u = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1&origin=*`;
  const r = await fetch(u, { headers: { 'user-agent': UA, 'api-user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.parse && j.parse.text ? j.parse.text : null;
}

// Next 4 races (still to start, or under way) and the 2 latest finished, with Americans in the top 30.
async function cycling(today, { fetchPage = wiki, upcoming = 4, recent = 2 } = {}) {
  const y = +today.slice(0, 4);
  const seasons = [[y, 'World Tour', 'WT'], [y, 'ProSeries', 'Pro'], [y + 1, 'World Tour', 'WT'], [y + 1, 'ProSeries', 'Pro']];
  const races = (await Promise.all(seasons.map(async ([yr, name, cls]) => {
    try { const h = await fetchPage(`${yr} UCI ${name}`); return h ? parseSeason(h, yr, cls) : []; } catch { return []; }
  }))).flat();
  const up = races.filter((r) => !r.cancelled && r.end >= today).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.cls === 'WT' ? -1 : 1)).slice(0, upcoming)
    .map(({ name, start, end, cls }) => ({ name, start, end, cls, now: start <= today }));
  const done = races.filter((r) => !r.cancelled && r.end < today && r.podium[0]).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.cls === 'WT' ? -1 : 1)).slice(0, recent);
  const results = await Promise.all(done.map(async (r) => {
    let field = [];
    if (r.page) { try { const h = await fetchPage(r.page); if (h) field = parseRace(h); } catch {} }
    const podium = [0, 1, 2].map((i) => r.podium[i] || (field[i] ? { name: field[i].name, nat: field[i].nat } : null)).filter(Boolean);
    const americans = field.filter((x) => x.nat === 'USA' && x.rank > 3).map(({ name, rank }) => ({ name, rank }));
    return { name: r.name, start: r.start, end: r.end, cls: r.cls, podium, americans, depth: field.length };
  }));
  return { upcoming: up, results };
}

module.exports = { cycling, parseSeason, parseRace, dates, rider, tables, text };
