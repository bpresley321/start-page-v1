'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/monitor');
const place = { name: 'Fort Worth', lat: 32.75, lon: -97.33 };
const NOW = Date.parse('2026-11-21T20:00:00-06:00');

test('nws: none is green; watches yellow; warnings red; expired and duplicates dropped', () => {
  assert.strictEqual(M.nwsRow({ features: [] }, place, NOW).status, 'green');
  const f = (event, severity, ends) => ({ properties: { event, severity, ends, status: 'Actual' } });
  const w = M.nwsRow({ features: [f('Wind Advisory', 'Minor', '2026-11-22T06:00:00-06:00'), f('Tornado Watch', 'Severe', '2026-11-21T23:00:00-06:00')] }, place, NOW);
  assert.deepStrictEqual([w.status, w.value], ['yellow', 'Tornado Watch +1']);
  assert.match(w.detail, /Tornado Watch until Sat 11:00 PM · Wind Advisory until Sun 6:00 AM/);
  const r = M.nwsRow({ features: [f('Severe Thunderstorm Warning', 'Severe', '2026-11-21T21:00:00-06:00'), f('Severe Thunderstorm Warning', 'Severe'), f('Old Warning', 'Severe', '2026-11-21T10:00:00-06:00')] }, place, NOW);
  assert.deepStrictEqual([r.status, r.value], ['red', 'Severe Thunderstorm Warning']);
});

test('spc: Marginal is green, Slight yellow, Enhanced+ red', () => {
  const R = (level, name) => ({ level, name });
  assert.strictEqual(M.stormRow({ none: true }, R(1, 'Marginal'), place).status, 'green');
  assert.strictEqual(M.stormRow(R(2, 'Slight'), { none: true }, place).status, 'yellow');
  const red = M.stormRow({ none: true }, R(3, 'Enhanced'), place);
  assert.deepStrictEqual([red.status, red.value, red.detail], ['red', 'Today None', 'Tomorrow: Enhanced 3/5 · Fort Worth']);
  assert.strictEqual(M.stormRow(null, null, place).status, 'gray');
});

test('lake: CSV with comments, columns found by name, 7-day change; title fallback', () => {
  const rows = [];
  for (let d = 1; d <= 21; d++) rows.push(`2026-11-${String(d).padStart(2, '0')},888.${d},870,10${d},10${d}0,${(56 + d / 10).toFixed(1)},17812,0`);
  const csv = '# Lake Weatherford\n# source: USGS\ndate,water_level,surface_area,reservoir_storage,conservation_storage,percent_full,conservation_capacity,dead_pool_capacity\n' + rows.join('\n') + '\n2026-11-22,,,,,,17812,0\n';
  const d = M.parseLakeCsv(csv);
  assert.deepStrictEqual([d.date, d.pct, d.change7], ['2026-11-21', 58.1, 0.7]);
  const row = M.lakeRow(d);
  assert.deepStrictEqual([row.status, row.value], ['yellow', '58.1% full']);
  assert.match(row.detail, /888\.21 ft · \+0\.7 pts in 7 days · as of Nov 21/);
  assert.deepStrictEqual(M.parseLakeTitle('<title>Lake Weatherford: 57.6% full as of 2026-11-21</title>'), { pct: 57.6, date: '2026-11-21', level: null, change7: null });
  assert.strictEqual(M.lakeRow({ pct: 92, date: '2026-11-21', level: null, change7: null }).status, 'green');
  assert.strictEqual(M.lakeRow(null).status, 'gray');
  assert.strictEqual(M.parseLakeCsv('<html>error</html>'), null);
});

test('aqi: current value and 24-hour peak set the color', () => {
  const hourly = (vals) => ({ time: vals.map((_, i) => new Date(NOW + i * 3600e3).toISOString().slice(0, 16)), us_aqi: vals });
  const a = M.aqiRow({ current: { us_aqi: 38.4 }, hourly: hourly([38, 44, 49]) }, NOW);
  assert.deepStrictEqual([a.status, a.value], ['green', 'AQI 38 · Good']);
  const b = M.aqiRow({ current: { us_aqi: 45 }, hourly: hourly([45, 70, 112]) }, NOW);
  assert.strictEqual(b.status, 'red');
  assert.match(b.detail, /peak: 112 \(Unhealthy for sensitive groups\)/);
  assert.strictEqual(M.aqiRow({}).status, 'gray');
});

test('dfw: FAA feed parsed for DFW only', () => {
  const xml = `<AIRPORT_STATUS_INFORMATION><Update_Time>x</Update_Time>
  <Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List>
   <Delay><ARPT>DFW</ARPT><Reason>TM Initiatives:MIT:WX</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay>
   <Delay><ARPT>ORD</ARPT><Reason>WX</Reason><Arrival_Departure Type="Arrival"><Min>1 hour</Min><Max>2 hours</Max><Trend>Increasing</Trend></Arrival_Departure></Delay>
  </Arrival_Departure_Delay_List></Delay_type>
  <Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>RWY</Reason><Start>a</Start><Reopen>b</Reopen></Airport></Airport_Closure_List></Delay_type>
  </AIRPORT_STATUS_INFORMATION>`;
  const r = M.airportRow(xml);
  assert.deepStrictEqual([r.status, r.value], ['yellow', 'Departure delays 16 minutes–30 minutes (increasing)']);
  assert.match(r.detail, /Cause: traffic management, weather/);
  const gs = M.airportRow(`<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>DFW</ARPT><Reason>thunderstorms</Reason><End_Time>9:45 pm CST</End_Time></Program></Ground_Stop_List></Delay_type>`);
  assert.deepStrictEqual([gs.status, gs.value], ['red', 'Ground stop until 9:45 pm CST']);
  assert.strictEqual(M.airportRow('<AIRPORT_STATUS_INFORMATION><Update_Time>x</Update_Time></AIRPORT_STATUS_INFORMATION>').status, 'green');
  assert.strictEqual(M.airportRow(null).status, 'gray');
});

test('monitor: one failing source does not break the rest', async () => {
  const real = global.fetch;
  global.fetch = async (u) => {
    if (u.includes('weather.gov')) return { ok: true, json: async () => ({ features: [] }) };
    if (u.includes('air-quality')) return { ok: false, status: 500 };
    if (u.includes('weatherford-30day')) return { ok: false, status: 404 };
    if (u.includes('waterdatafortexas')) return { ok: true, text: async () => '<title>Lake Weatherford: 57.6% full as of 2026-11-21</title>' };
    if (u.includes('nasstatus')) return { ok: true, text: async () => '<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>' };
    if (u.includes('yahoo')) return { ok: false, status: 429 };
    if (u.includes('stooq')) return { ok: true, text: async () => 'Date,Open,High,Low,Close,Volume\n2026-11-19,600,605,598,602.10,1\n2026-11-20,602,604,590,592.00,1\n' };
    throw new Error('unexpected ' + u);
  };
  try {
    const rows = await M.monitor(place, { stormRisk: async () => ({ today: { none: true }, tomorrow: { none: true } }) });
    assert.deepStrictEqual(rows.map((r) => r.id + ':' + r.status), ['nws:green', 'spc:green', 'lake:yellow', 'aqi:gray', 'dfw:green', 'spy:yellow']);
  } finally { global.fetch = real; }
});

test('spy: Yahoo quote, colors by daily move, Stooq fallback', () => {
  const y = M.spyFromYahoo({ chart: { result: [{ meta: { regularMarketPrice: 612.34, chartPreviousClose: 608.1, regularMarketTime: 1795467600, fiftyTwoWeekHigh: 620 } }] } });
  const r = M.spyRow(y);
  assert.deepStrictEqual([r.status, r.value], ['green', '$612.34 · +0.70%']);
  assert.match(r.detail, /^\+\$4\.24 today · 1\.2% below 52-week high · as of .* · Yahoo Finance, delayed$/);
  assert.strictEqual(M.spyRow({ price: 98.5, prev: 100, source: 'x' }).status, 'yellow');
  assert.strictEqual(M.spyRow({ price: 97, prev: 100, source: 'x' }).status, 'red');
  assert.match(M.spyRow({ price: 97, prev: 100, source: 'x' }).value, /−3\.00%/);
  assert.strictEqual(M.spyFromYahoo({ chart: { result: null, error: { code: 'Not Found' } } }), null);
  const s = M.spyFromStooq('Date,Open,High,Low,Close,Volume\n2026-11-19,600,605,598,602.10,1\n2026-11-20,602,604,590,592.00,1');
  assert.deepStrictEqual([s.price, s.prev, s.high52], [592, 602.1, 605]);
  assert.strictEqual(M.spyFromStooq('No data'), null);
  assert.strictEqual(M.spyRow(null).status, 'gray');
});
