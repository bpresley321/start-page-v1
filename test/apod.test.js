'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pickApod } = require('../lib/apod');

test('apod: newest image wins, videos skipped, credit and page link', () => {
  const r = pickApod([
    { date: '2026-11-25', media_type: 'image', title: 'Older', url: 'https://apod.nasa.gov/a.jpg' },
    { date: '2026-11-27', media_type: 'video', title: 'A video', url: 'https://youtube.com/x' },
    { date: '2026-11-26', media_type: 'image', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', copyright: '\nJane  Doe\n' },
  ]);
  assert.deepStrictEqual(r, { date: '2026-11-26', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', credit: 'Jane Doe', page: 'https://apod.nasa.gov/apod/ap261126.html' });
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'video', url: 'x' }]), null);
  assert.strictEqual(pickApod({ error: 'x' }), null);
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'image', url: 'u' }]).credit, 'NASA');
});
