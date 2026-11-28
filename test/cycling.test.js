'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/cycling');

const flag = (c) => `<span class="flagicon"><span class="mw-image-border" typeof="mw:File"><span><img alt="${c}" src="//upload.wikimedia.org/x.png" width="23" height="15"></span></span>&nbsp;</span>`;
const who = (n, c) => `${flag(c)}<a href="/wiki/${n.replace(/ /g, '_')}" title="${n}">${n}</a>&nbsp;<span style="font-size:90%;">(${c})</span>`;
const race = (page, name, c) => `${flag(c)}<a href="/wiki/${page.replace(/ /g, '_')}" title="${page}">${name}</a>`;
const WT = `<div class="mw-parser-output"><h2 id="Events">Events</h2><table class="wikitable plainrowheaders"><caption>Races in the 2027 UCI World Tour<sup class="reference">[1]</sup></caption>
<tbody><tr><th scope="col">Race</th><th scope="col">Date</th><th scope="col">Winner</th><th scope="col">Second</th><th scope="col">Third</th></tr>
<tr><td>${race('2027 Tour Down Under', 'Tour Down Under', 'AUS')}</td><td>19–24 January</td><td>${who('Jay Vine', 'AUS')}</td><td>${who('Brandon McNulty', 'USA')}</td><td>${who('Harry Sweeny', 'AUS')}</td></tr>
<tr><td>${race('2027 Cadel Evans Great Ocean Road Race', 'Cadel Evans Great Ocean Road Race', 'AUS')}</td><td>31 January</td><td></td><td></td><td></td></tr>
<tr><td>${race('2027 UAE Tour', 'UAE Tour', 'UAE')}</td><td>15–21 February</td><td></td><td></td><td></td></tr>
<tr><td>${race('2027 Omloop Het Nieuwsblad', 'Omloop Het Nieuwsblad', 'BEL')}</td><td>27 February</td><td></td><td></td><td></td></tr>
</tbody></table></div>`;
const PRO = `<table class="wikitable"><tbody><tr><th>Race</th><th>Date</th><th>Winner</th><th>Team</th><th>Ref.</th></tr>
<tr><td>${race('2027 Tour of Oman', 'Tour of Oman', 'OMA')}</td><td>17–21 January</td><td>${who('Matthew Riccitello', 'USA')}</td><td>Decathlon</td><td><sup>[3]</sup></td></tr>
<tr><td>${race('2027 Clàsica Comunitat Valenciana 1969', 'Clàsica Comunitat Valenciana 1969', 'ESP')}</td><td>25 January</td><td></td><td></td><td></td></tr>
<tr><td>${race('2027 Volta a la Comunitat Valenciana', 'Volta a la Comunitat Valenciana', 'ESP')}</td><td>28 January – 1 February</td><td></td><td></td><td></td></tr>
<tr><td>${race('2027 Tour of Norway', 'Tour of Norway', 'NOR')}</td><td>2–5 February</td><td colspan="2">Cancelled</td><td></td></tr>
</tbody></table>`;
const gcTable = (cap, rows) => `<table class="wikitable"><caption>${cap}</caption><tbody><tr><th scope="col">Rank</th><th scope="col">Rider</th><th scope="col">Team</th><th scope="col">Time</th></tr>
${rows.map(([n, c], i) => `<tr><td>${i + 1}</td><td>${who(n, c)}</td><td>Team</td><td>+ ${i}"</td></tr>`).join('')}</tbody></table>`;
const TDU = `<h2>Stages</h2><h3>Stage 1</h3>${gcTable('General classification after Stage 1 (1–10)', [['Sam Welsford', 'AUS'], ['Brandon McNulty', 'USA']])}
<h2>Classification standings</h2><h3>General classification</h3>${gcTable('Final general classification (1–10)', [['Jay Vine', 'AUS'], ['Brandon McNulty', 'USA'], ['Harry Sweeny', 'AUS'], ['A B', 'ESP'], ['Magnus Sheffield', 'USA'], ['C D', 'ITA'], ['E F', 'FRA'], ['G H', 'BEL'], ['Kevin Vermaerke', 'USA'], ['I J', 'NED']])}
<h3>Points classification</h3>${gcTable('Final points classification (1–10)', [['Sam Welsford', 'AUS']])}`;
const OMAN = `<h2>Result</h2>${gcTable('General classification (1–10)', [['Matthew Riccitello', 'USA'], ['K L', 'COL'], ['M N', 'ERI'], ['Quinn Simmons', 'USA']])}`;

test('cycling: date formats', () => {
  assert.deepStrictEqual(C.dates('19–24 January', 2027), { start: '2027-01-19', end: '2027-01-24' });
  assert.deepStrictEqual(C.dates('31 January', 2027), { start: '2027-01-31', end: '2027-01-31' });
  assert.deepStrictEqual(C.dates('28 January – 1 February', 2027), { start: '2027-01-28', end: '2027-02-01' });
  assert.deepStrictEqual(C.dates('28 February–1 March', 2027), { start: '2027-02-28', end: '2027-03-01' });
  assert.strictEqual(C.dates('TBD', 2027), null);
});

test('cycling: season tables (World Tour podium, ProSeries winner, cancelled, race links)', () => {
  const wt = C.parseSeason(WT, 2027, 'WT');
  assert.deepStrictEqual(wt[0], { name: 'Tour Down Under', page: '2027 Tour Down Under', start: '2027-01-19', end: '2027-01-24', cls: 'WT',
    podium: [{ name: 'Jay Vine', nat: 'AUS' }, { name: 'Brandon McNulty', nat: 'USA' }, { name: 'Harry Sweeny', nat: 'AUS' }], cancelled: false });
  assert.strictEqual(wt.length, 4);
  const pro = C.parseSeason(PRO, 2027, 'Pro');
  assert.deepStrictEqual([pro[0].podium[0], pro[0].podium[1]], [{ name: 'Matthew Riccitello', nat: 'USA' }, null]);
  assert.strictEqual(pro[3].cancelled, true);
  assert.strictEqual(pro[1].name, 'Clàsica Comunitat Valenciana 1969');
});

test('cycling: race page picks the final standings, not after-stage or points tables', () => {
  const f = C.parseRace(TDU);
  assert.strictEqual(f.length, 10);
  assert.deepStrictEqual(f.filter((x) => x.nat === 'USA').map((x) => [x.name, x.rank]), [['Brandon McNulty', 2], ['Magnus Sheffield', 5], ['Kevin Vermaerke', 9]]);
  assert.deepStrictEqual(C.parseRace(OMAN).map((x) => x.rank), [1, 2, 3, 4]);
  assert.deepStrictEqual(C.parseRace('<p>No results yet</p>'), []);
});

test('cycling: next 4 races and latest 2 results with Americans beyond the podium', async () => {
  const pages = { '2027 UCI World Tour': WT, '2027 UCI ProSeries': PRO, '2027 Tour Down Under': TDU, '2027 Tour of Oman': OMAN };
  const r = await C.cycling('2027-01-29', { fetchPage: async (p) => pages[p] || null });
  assert.deepStrictEqual(r.upcoming.map((x) => [x.name, x.cls, x.now]), [
    ['Volta a la Comunitat Valenciana', 'Pro', true], ['Cadel Evans Great Ocean Road Race', 'WT', false], ['UAE Tour', 'WT', false], ['Omloop Het Nieuwsblad', 'WT', false]]);
  assert.deepStrictEqual(r.results.map((x) => x.name), ['Tour Down Under', 'Tour of Oman']);
  assert.deepStrictEqual(r.results[0].americans, [{ name: 'Magnus Sheffield', rank: 5 }, { name: 'Kevin Vermaerke', rank: 9 }]);
  assert.deepStrictEqual(r.results[1].podium.map((p) => p.name), ['Matthew Riccitello', 'K L', 'M N']);   // ProSeries 2nd/3rd from race page
  assert.deepStrictEqual(r.results[1].americans, [{ name: 'Quinn Simmons', rank: 4 }]);
  assert.strictEqual(r.results[1].depth, 4);
});

test('cycling api route: reads Wikipedia parse API, caches 3 hours, survives missing next-season pages', async () => {
  const real = global.fetch, seen = [];
  const pages = { '2026 UCI World Tour': WT.replace(/2027/g, '2026'), '2026 UCI ProSeries': PRO.replace(/2027/g, '2026'), '2026 Tour Down Under': TDU };
  global.fetch = async (u, o) => {
    const page = new URL(u).searchParams.get('page'); seen.push([page, o.headers['user-agent']]);
    if (!pages[page]) return { ok: true, json: async () => ({ error: { code: 'missingtitle' } }) };
    return { ok: true, json: async () => ({ parse: { title: page, text: pages[page] } }) };
  };
  const r = { headers: {} }; r.setHeader = (k, v) => (r.headers[k] = v); r.status = (c) => ((r.code = c), r); r.json = (b) => ((r.body = b), r);
  try {
    await require('../api/sports')({ url: '/api/sports?cycling=1' }, r);
    assert.strictEqual(r.code, 200);
    assert.match(r.headers['Cache-Control'], /s-maxage=10800/);
    assert.ok(seen.some(([p]) => p === '2027 UCI World Tour'));
    assert.ok(seen.every(([, ua]) => /personal-start-page/.test(ua)));
    assert.ok(Array.isArray(r.body.upcoming) && Array.isArray(r.body.results));
  } finally { global.fetch = real; }
});
