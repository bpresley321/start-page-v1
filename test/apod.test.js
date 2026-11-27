'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pickApod } = require('../lib/apod');

test('apod: newest image wins, videos skipped, credit and page link', () => {
  const r = pickApod([
    { date: '2026-11-25', media_type: 'image', title: 'Older', url: 'https://apod.nasa.gov/a.jpg', explanation: 'x' },
    { date: '2026-11-27', media_type: 'video', title: 'A video', url: 'https://youtube.com/x' },
    { date: '2026-11-26', media_type: 'image', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', copyright: '\nJane  Doe\n', explanation: 'A comet.' },
  ]);
  assert.deepStrictEqual(r, { date: '2026-11-26', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', credit: 'Jane Doe', page: 'https://apod.nasa.gov/apod/ap261126.html' });
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'video', url: 'x' }]), null);
  assert.strictEqual(pickApod({ error: 'x' }), null);
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'image', title: 'Moon', url: 'https://apod.nasa.gov/m.jpg', explanation: 'x' }]).credit, 'NASA');
});

test('apod: NASA stand-in entries (generic title, logo, no explanation) are skipped', () => {
  const real = { date: '2026-11-26', media_type: 'image', title: 'Portrait of NGC 1055', url: 'https://apod.nasa.gov/apod/image/2611/ngc1055.jpg', copyright: 'John Hayes', explanation: 'Big, beautiful spiral galaxy.' };
  const stubs = [
    { date: '2026-11-27', media_type: 'image', title: 'NASA Science', url: 'https://science.nasa.gov/wp-content/uploads/2023/09/nasa-logo.png', explanation: '' },
    { date: '2026-11-27', media_type: 'image', title: 'Something', url: 'https://science.nasa.gov/apod/', explanation: 'x' },
    { date: '2026-11-27', media_type: 'image', title: 'Nebula', url: 'https://apod.nasa.gov/n.jpg', explanation: '' },
  ];
  for (const st of stubs) assert.strictEqual(pickApod([real, st]).title, 'Portrait of NGC 1055', JSON.stringify(st));
  assert.strictEqual(pickApod([stubs[0]]), null);
});
