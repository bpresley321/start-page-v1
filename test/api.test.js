'use strict';
const test = require('node:test');
const assert = require('node:assert');

function mkRes() {
  const r = { code: 200, headers: {}, body: null };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

test('news: unknown feed is a 404 and never fetches', async () => {
  global.fetch = () => { throw new Error('should not fetch'); };
  const res = mkRes();
  await require('../api/news')({ url: '/api/news?feed=http://evil.test' }, res);
  assert.strictEqual(res.code, 404);
});

test('news: returns parsed items for a known feed', async () => {
  global.fetch = async (u) => {
    assert.match(u, /nytimes\.com/);
    return { ok: true, text: async () => '<rss><channel><item><title>Hi</title><link>https://n.test/1</link></item></channel></rss>' };
  };
  const res = mkRes();
  await require('../api/news')({ url: '/api/news?feed=nyt' }, res);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body.items.map((i) => i.title), ['Hi']);
  assert.match(res.headers['Cache-Control'], /s-maxage/);
});

test('news: upstream failure becomes a 502', async () => {
  global.fetch = async () => ({ ok: false, status: 500 });
  const res = mkRes();
  await require('../api/news')({ url: '/api/news?feed=fwreport' }, res);
  assert.strictEqual(res.code, 502);
});

test('weather: geocodes with state filter then shapes the forecast', async () => {
  const calls = [];
  global.fetch = async (u) => {
    calls.push(u);
    if (u.includes('geocoding')) return { ok: true, json: async () => ({ results: [
      { name: 'Fort Worth', admin1: 'Ohio', latitude: 1, longitude: 1 },
      { name: 'Fort Worth', admin1: 'Texas', latitude: 32.75, longitude: -97.33 }] }) };
    return { ok: true, json: async () => ({
      current: { temperature_2m: 54.4, apparent_temperature: 50.2, weather_code: 2, wind_speed_10m: 11.3, wind_direction_10m: 202.6, wind_gusts_10m: 19.8 },
      daily: { time: ['2026-11-01', '2026-11-02'], weather_code: [0, 63], temperature_2m_max: [58.1, 49], temperature_2m_min: [41, 38.5], sunrise: ['2026-11-01T07:48', '2026-11-02T06:49'], sunset: ['2026-11-01T18:41', '2026-11-02T17:40'] } }) };
  };
  const res = mkRes();
  await require('../api/weather')({ url: '/api/weather?city=Fort%20Worth%2C%20TX' }, res);
  assert.strictEqual(res.code, 200);
  assert.match(calls.find((u) => u.includes('api.open-meteo.com/v1/forecast')), /latitude=32\.75/);
  assert.ok(calls.some((u) => u.includes('spc.noaa.gov/products/outlook/day1otlk_cat')));
  assert.deepStrictEqual(res.body.now, { temp: 54, feels: 50, wind: 11, windDir: 203, gust: 20, text: 'Partly cloudy' });
  assert.match(calls.find((u) => u.includes('/v1/forecast')), /wind_direction_10m,wind_gusts_10m/);
  assert.strictEqual(res.body.place, 'Fort Worth, Texas');
  assert.strictEqual(res.body.days[1].text, 'Rain');
  assert.deepStrictEqual([res.body.days[0].sunrise, res.body.days[0].sunset], ['2026-11-01T07:48', '2026-11-01T18:41']);
  assert.match(calls.find((u) => u.includes('/v1/forecast')), /sunrise,sunset/);
});

test('weather: empty city is 400, unknown place is 404', async () => {
  let res = mkRes();
  await require('../api/weather')({ url: '/api/weather?city=' }, res);
  assert.strictEqual(res.code, 400);
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  res = mkRes();
  await require('../api/weather')({ url: '/api/weather?city=Nowhereville' }, res);
  assert.strictEqual(res.code, 404);
});

test('sports: one failing or mismatched team does not break the rest', async () => {
  const body = (name, id) => ({ team: { displayName: name }, events: [{ date: '2026-11-08T18:00Z', competitions: [{ date: '2026-11-08T18:00Z', status: { type: { state: 'pre' } }, competitors: [{ homeAway: 'home', team: { id: String(id), shortDisplayName: 'Us' } }, { homeAway: 'away', team: { id: '999', shortDisplayName: 'Them' } }] }] }] });
  global.fetch = async (u) => {
    if (u.includes('/mlb/')) return { ok: false, status: 500 };
    if (u.includes('/nhl/')) return { ok: true, json: async () => body('Dallas Cowboys', 25) };
    const id = Number(u.match(/teams\/(\d+)/)[1]);
    const names = { 239: 'Baylor Bears', 367: 'Tottenham Hotspur', 6: 'Dallas Mavericks' };
    return { ok: true, json: async () => body(names[id], id) };
  };
  const res = mkRes();
  await require('../api/sports')({ url: '/api/sports' }, res);
  assert.strictEqual(res.code, 200);
  const by = Object.fromEntries(res.body.teams.map((t) => [t.key, t]));
  assert.strictEqual(by.rangers.error, 'Unavailable');
  assert.strictEqual(by.stars.error, 'Unavailable');
  assert.strictEqual(by.mavs.next.opp, 'Them');
  assert.strictEqual(by['baylor-fb'].next.opp, 'Them');
  assert.strictEqual(res.body.teams.length, 6);
});

test('news: Texas Tribune feed (RSS with media namespace, CDATA, entities) parses', async () => {
  global.fetch = async (u) => {
    assert.match(u, /texastribune\.org\/feeds\/main/);
    return { ok: true, text: async () => `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>The Texas Tribune</title><link>https://www.texastribune.org/</link><item><title>Texas A&amp;M president&#8217;s plan</title><link>https://www.texastribune.org/2026/11/12/a/</link><description><![CDATA[<p>x</p>]]></description><pubDate>Thu, 12 Nov 2026 12:00:00 +0000</pubDate><media:content url="https://t.test/i.jpg"><media:title>Photo</media:title></media:content></item><item><title><![CDATA[Second story]]></title><link>https://www.texastribune.org/2026/11/12/b/</link></item></channel></rss>` };
  };
  const res = mkRes();
  await require('../api/news')({ url: '/api/news?feed=txtribune' }, res);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body.items.map((i) => i.title), ['Texas A&M president’s plan', 'Second story']);
});

test('news: Techmeme feed (RSS with HTML descriptions) parses', async () => {
  global.fetch = async (u) => {
    assert.strictEqual(u, 'https://www.techmeme.com/feed.xml');
    return { ok: true, text: async () => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Techmeme</title><link>https://www.techmeme.com/</link>
<item><title>Apple announces new chips for its Mac lineup (Jane Doe/Bloomberg)</title><link>http://www.techmeme.com/261127/p12#a261127p12</link><description><![CDATA[<p><a href="https://x"><img src="x.jpg"></a></p><p>Jane Doe / <a href="https://bloomberg.com">Bloomberg</a>:<br><span>Apple announced …</span></p>]]></description><pubDate>Fri, 27 Nov 2026 21:30:01 -0500</pubDate><guid>http://www.techmeme.com/261127/p12#a261127p12</guid></item>
<item><title>Startup raises $50M &amp; more (John Roe/TechCrunch)</title><link>http://www.techmeme.com/261127/p11#a261127p11</link></item></channel></rss>` };
  };
  const res = mkRes();
  await require('../api/news')({ url: '/api/news?feed=techmeme' }, res);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(res.body.items.map((i) => i.title), ['Apple announces new chips for its Mac lineup', 'Startup raises $50M & more']);
});
