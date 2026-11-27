'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fromUnsplash } = require('../lib/unsplash');

const PHOTO = { id: 'abc', description: null, alt_description: 'snow-capped mountains under a starry sky',
  urls: { raw: 'https://images.unsplash.com/photo-1?ixid=x&ixlib=rb-4.0.3', regular: 'r' },
  links: { html: 'https://unsplash.com/photos/abc', download_location: 'https://api.unsplash.com/photos/abc/download?ixid=x' },
  user: { name: 'Ana Ruiz', links: { html: 'https://unsplash.com/@ana' } }, location: { name: 'San Juan Mountains, Colorado' } };

test('unsplash: banner-shaped crop, credit with referral links, download ping URL', () => {
  const r = fromUnsplash(PHOTO);
  assert.strictEqual(r.url, 'https://images.unsplash.com/photo-1?ixid=x&ixlib=rb-4.0.3&w=2400&h=520&fit=crop&crop=entropy&auto=format&q=75');
  assert.deepStrictEqual([r.title, r.caption, r.page, r.photographer, r.location], ['Snow-capped mountains under a starry sky', 'Photo by Ana Ruiz on Unsplash', 'https://unsplash.com/photos/abc?utm_source=personal_start_page&utm_medium=referral', 'https://unsplash.com/@ana?utm_source=personal_start_page&utm_medium=referral', 'San Juan Mountains, Colorado']);
  assert.strictEqual(r.download, PHOTO.links.download_location);
  assert.strictEqual(fromUnsplash({ errors: ['x'] }), null);
});

test('unsplash api: needs a key; reports the download; theme passed through', async () => {
  const env = { ...process.env }, real = global.fetch;
  const mk = () => { const r = { headers: {} }; r.setHeader = (k, v) => (r.headers[k] = v); r.status = (c) => ((r.code = c), r); r.json = (b) => ((r.body = b), r); return r; };
  try {
    delete process.env.UNSPLASH_ACCESS_KEY;
    let res = mk(); await require('../api/apod')({ url: '/api/apod?source=unsplash' }, res);
    assert.deepStrictEqual([res.code, res.body.setup], [503, true]);
    process.env.UNSPLASH_ACCESS_KEY = 'k1';
    const calls = [];
    global.fetch = async (u, o) => { calls.push([u, o && o.headers && o.headers.authorization]); return { ok: true, json: async () => PHOTO }; };
    res = mk(); await require('../api/apod')({ url: '/api/apod?source=unsplash&q=colorado%20mountains&day=2026-11-27' }, res);
    assert.strictEqual(res.code, 200);
    assert.match(calls[0][0], /photos\/random\?orientation=landscape&content_filter=high&query=colorado%20mountains$/);
    assert.strictEqual(calls[0][1], 'Client-ID k1');
    assert.ok(calls.some(([u]) => u === PHOTO.links.download_location));
    assert.strictEqual('download' in res.body, false);
    assert.match(res.headers['Cache-Control'], /s-maxage=86400/);
  } finally { process.env = env; global.fetch = real; }
});
