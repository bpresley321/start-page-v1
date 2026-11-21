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
const env = { ...process.env };
let store;
test.beforeEach(() => {
  store = {};
  process.env.SYNC_PASSCODE = 'open-sesame';
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'tok';
  global.fetch = async (url, opts) => {
    assert.strictEqual(url, 'https://redis.test');
    assert.strictEqual(opts.headers.Authorization, 'Bearer tok');
    const [cmd, key, val, ...flags] = JSON.parse(opts.body);
    if (cmd === 'GET') return { ok: true, json: async () => ({ result: store[key] ?? null }) };
    if (cmd === 'SET') {
      if (flags.includes('NX') && key in store) return { ok: true, json: async () => ({ result: null }) };
      store[key] = val; return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (cmd === 'KEYS') { const pre = key.replace(/\*$/, ''); return { ok: true, json: async () => ({ result: Object.keys(store).filter((k) => k.startsWith(pre)) }) }; }
    throw new Error('unexpected ' + cmd);
  };
});
test.afterEach(() => { global.fetch = realFetch; process.env = { ...env }; });

const handler = () => require('../api/data');
const state = (updated, t = 'a') => ({ updated, data: { groups: [{ name: t, links: [] }], tasks: [] } });
const req = (method, body, pass = 'open-sesame') => ({ method, body, headers: { 'x-sync-passcode': pass } });

test('data: not set up gives a clear message', async () => {
  delete process.env.SYNC_PASSCODE; delete process.env.HOME_PASSWORD;
  let res = mkRes(); await handler()(req('GET'), res);
  assert.strictEqual(res.code, 503); assert.match(res.body.error, /HOME_PASSWORD/);
  process.env.SYNC_PASSCODE = 'x'; delete process.env.KV_REST_API_URL;
  res = mkRes(); await handler()(req('GET', null, 'x'), res);
  assert.strictEqual(res.code, 503); assert.match(res.body.error, /Redis/);
});

test('data: wrong or missing passcode is 401 and touches nothing', async () => {
  global.fetch = () => { throw new Error('should not reach the database'); };
  const res = mkRes(); await handler()(req('GET', null, 'nope'), res);
  assert.strictEqual(res.code, 401);
  const res2 = mkRes(); await handler()({ method: 'PUT', body: state(1), headers: {} }, res2);
  assert.strictEqual(res2.code, 401);
});

test('data: empty, save, load round trip', async () => {
  let res = mkRes(); await handler()(req('GET'), res);
  assert.deepStrictEqual(res.body, { empty: true });
  res = mkRes(); await handler()(req('PUT', state(100, 'mine')), res);
  assert.strictEqual(res.code, 200);
  res = mkRes(); await handler()(req('GET'), res);
  assert.strictEqual(res.body.updated, 100); assert.strictEqual(res.body.data.groups[0].name, 'mine');
});

test('data: an older save cannot overwrite newer data (409 returns the newer copy)', async () => {
  await handler()(req('PUT', state(200, 'new')), mkRes());
  const res = mkRes(); await handler()(req('PUT', state(100, 'old')), res);
  assert.strictEqual(res.code, 409); assert.strictEqual(res.body.data.groups[0].name, 'new');
  const check = mkRes(); await handler()(req('GET'), check);
  assert.strictEqual(check.body.updated, 200);
});

test('data: rejects malformed bodies, large bodies and other methods', async () => {
  let res = mkRes(); await handler()(req('PUT', { updated: 1, data: {} }), res);
  assert.strictEqual(res.code, 400);
  res = mkRes(); await handler()(req('PUT', { updated: 1, data: { groups: [], tasks: [], pad: 'x'.repeat(500000) } }), res);
  assert.strictEqual(res.code, 413);
  res = mkRes(); await handler()(req('DELETE'), res);
  assert.strictEqual(res.code, 405);
});

test('data: database failure is a 502', async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({}) });
  const res = mkRes(); await handler()(req('GET'), res);
  assert.strictEqual(res.code, 502);
});

test('data: the passcode can come from HOME_PASSWORD', async () => {
  delete process.env.SYNC_PASSCODE; process.env.HOME_PASSWORD = 'from-home';
  let res = mkRes(); await handler()(req('GET', null, 'from-home'), res);
  assert.strictEqual(res.code, 200);
  res = mkRes(); await handler()(req('GET', null, 'open-sesame'), res);
  assert.strictEqual(res.code, 401);
});

test('data: first save of the day keeps a start-of-day backup; restore is undoable', async () => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  let res = mkRes(); await handler()(req('PUT', state(1, 'first')), res);
  assert.deepStrictEqual(Object.keys(store), ['startpage:state']);           // nothing to back up yet
  res = mkRes(); await handler()(req('PUT', state(2, 'second')), res);
  res = mkRes(); await handler()(req('PUT', state(3, 'oops')), res);
  assert.strictEqual(JSON.parse(store['startpage:backup:' + day]).data.groups[0].name, 'first'); // start of day, not overwritten
  store['startpage:backup:2026-11-01'] = JSON.stringify(state(0, 'old'));

  res = mkRes(); await handler()({ method: 'GET', url: '/api/data?backups', headers: { 'x-sync-passcode': 'open-sesame' } }, res);
  assert.deepStrictEqual(res.body, { backups: [day, '2026-11-01'], beforeRestore: false });

  res = mkRes(); await handler()(req('POST', { restore: '../state' }), res);
  assert.strictEqual(res.code, 400);
  res = mkRes(); await handler()(req('POST', { restore: '2026-10-01' }), res);
  assert.strictEqual(res.code, 404);
  res = mkRes(); await handler()(req('POST', { restore: day }), res);
  assert.strictEqual(res.body.data.groups[0].name, 'first');
  assert.ok(res.body.updated > 3);                                           // newer than every device, so it wins sync
  assert.strictEqual(JSON.parse(store['startpage:state']).data.groups[0].name, 'first');
  assert.strictEqual(JSON.parse(store['startpage:backup:before-restore']).data.groups[0].name, 'oops');
});
