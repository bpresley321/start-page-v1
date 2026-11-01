'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseFeed } = require('../lib/rss');
const { describe, parseCity, pickPlace } = require('../lib/weather');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title><![CDATA[Fed &amp; markets: a "big" day]]></title><link>https://example.com/a</link><pubDate>Sun, 01 Nov 2026 14:00:00 GMT</pubDate></item>
<item><title>Tom &amp; Jerry&#8217;s</title><link>javascript:alert(1)</link></item>
<item><title>Second story</title><link>https://example.com/b</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom one</title>
<link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/one"/>
<updated>2026-11-01T10:00:00Z</updated></entry></feed>`;

test('parses RSS, decodes CDATA/entities, skips unsafe links', () => {
  const items = parseFeed(RSS);
  assert.deepStrictEqual(items.map((i) => i.title), ['Fed & markets: a "big" day', 'Second story']);
  assert.strictEqual(items[0].time, '2026-11-01T14:00:00.000Z');
  assert.strictEqual(items[1].time, null);
});

test('parses Atom and prefers the alternate link', () => {
  const [a] = parseFeed(ATOM);
  assert.strictEqual(a.link, 'https://example.com/one');
  assert.strictEqual(a.time, '2026-11-01T10:00:00.000Z');
});

test('respects the item limit and handles empty input', () => {
  assert.strictEqual(parseFeed(RSS, 1).length, 1);
  assert.deepStrictEqual(parseFeed(''), []);
});

test('city parsing maps state abbreviations', () => {
  assert.deepStrictEqual(parseCity('Fort Worth, TX'), { name: 'Fort Worth', region: 'Texas' });
  assert.deepStrictEqual(parseCity('Paris'), { name: 'Paris', region: '' });
  assert.deepStrictEqual(parseCity('Paris, France'), { name: 'Paris', region: 'France' });
});

test('pickPlace prefers the matching state, falls back to first', () => {
  const r = [{ name: 'Fort Worth', admin1: 'Texas' }, { name: 'Fort Worth', admin1: 'Ohio' }];
  assert.strictEqual(pickPlace(r, 'Ohio').admin1, 'Ohio');
  assert.strictEqual(pickPlace(r, 'Utah').admin1, 'Texas');
  assert.strictEqual(pickPlace([], 'Texas'), null);
});

test('weather codes have readable text', () => {
  assert.strictEqual(describe(0), 'Clear');
  assert.strictEqual(describe(63), 'Rain');
  assert.strictEqual(describe(95), 'Thunderstorms');
});
