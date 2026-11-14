'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/auth');

function mkRes() {
  const r = { statusCode: 200, headers: {}, body: null, ended: false };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v);
  r.end = () => { r.ended = true; };
  return r;
}
const env = { ...process.env };
const realFetch = global.fetch;
test.beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'shh';
  process.env.ALLOWED_EMAILS = 'Ben@Example.com, other@example.com';
});
test.afterEach(() => { process.env = { ...env }; global.fetch = realFetch; });

const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const good = (over = {}) => ({ aud: 'cid.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: Date.now() / 1000 + 600, email: 'ben@example.com', email_verified: true, ...over });
const req = (url, cookie = '') => ({ url, method: 'GET', headers: { host: 'start.test', 'x-forwarded-proto': 'https', cookie } });

test('auth: not configured without all three settings', () => {
  delete process.env.ALLOWED_EMAILS;
  assert.strictEqual(A.config(), null);
});

test('auth: session cookie round-trips, rejects tampering, expiry and removed emails', () => {
  const cfg = A.config();
  const t = A.makeSession(cfg, 'ben@example.com');
  assert.deepStrictEqual(A.readSession(cfg, t), { email: 'ben@example.com' });
  assert.strictEqual(A.readSession(cfg, t.slice(0, -2) + 'xx'), null);
  const forged = Buffer.from(JSON.stringify({ e: 'other@example.com', x: Date.now() + 1e9 })).toString('base64url') + '.' + t.split('.')[1];
  assert.strictEqual(A.readSession(cfg, forged), null);
  assert.strictEqual(A.readSession(cfg, t, Date.now() + 61 * 864e5), null);
  process.env.ALLOWED_EMAILS = 'other@example.com';
  assert.strictEqual(A.readSession(A.config(), t), null);
});

test('auth: ID token checks audience, issuer, expiry, verified email and allowlist', () => {
  const cfg = A.config();
  assert.deepStrictEqual(A.emailFromIdToken(cfg, jwt(good())), { email: 'ben@example.com' });
  assert.match(A.emailFromIdToken(cfg, jwt(good({ aud: 'x' }))).error, /audience/);
  assert.match(A.emailFromIdToken(cfg, jwt(good({ iss: 'evil' }))).error, /issuer/);
  assert.match(A.emailFromIdToken(cfg, jwt(good({ exp: 1 }))).error, /expired/);
  assert.match(A.emailFromIdToken(cfg, jwt(good({ email_verified: false }))).error, /verified/);
  assert.strictEqual(A.emailFromIdToken(cfg, jwt(good({ email: 'stranger@example.com' }))).error, 'not allowed');
});

test('login: redirects to Google with state cookie and the right callback', async () => {
  const res = mkRes();
  await require('../api/auth/login')(req('/api/auth/login'), res);
  assert.strictEqual(res.statusCode, 302);
  const u = new URL(res.headers.location);
  assert.strictEqual(u.host, 'accounts.google.com');
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://start.test/api/auth/callback');
  assert.strictEqual(u.searchParams.get('scope'), 'openid email');
  assert.match(res.headers['set-cookie'], new RegExp('sp_state=' + u.searchParams.get('state') + ';.*HttpOnly; Secure'));
});

test('callback: good sign-in sets a session; wrong state, stranger and Google errors do not', async () => {
  let claims = good();
  global.fetch = async (url, opts) => {
    assert.strictEqual(url, 'https://oauth2.googleapis.com/token');
    assert.match(String(opts.body), /client_secret=shh/);
    return { ok: true, json: async () => ({ id_token: jwt(claims) }) };
  };
  const cb = require('../api/auth/callback');
  let res = mkRes(); await cb(req('/api/auth/callback?code=c&state=abc', 'sp_state=abc'), res);
  assert.strictEqual(res.headers.location, '/');
  const sess = res.headers['set-cookie'].find((c) => c.startsWith('sp_session=')).split(';')[0].split('=')[1];
  assert.deepStrictEqual(A.readSession(A.config(), decodeURIComponent(sess)), { email: 'ben@example.com' });

  res = mkRes(); await cb(req('/api/auth/callback?code=c&state=abc', 'sp_state=zzz'), res);
  assert.strictEqual(res.headers.location, '/?signin=expired');
  claims = good({ email: 'stranger@example.com' });
  res = mkRes(); await cb(req('/api/auth/callback?code=c&state=abc', 'sp_state=abc'), res);
  assert.strictEqual(res.headers.location, '/?signin=not-allowed');
  assert.ok(!res.headers['set-cookie'].some((c) => c.startsWith('sp_session=') && !c.includes('Max-Age=0')));
  res = mkRes(); await cb(req('/api/auth/callback?error=access_denied&state=abc', 'sp_state=abc'), res);
  assert.strictEqual(res.headers.location, '/?signin=cancelled');
});

test('me: reports setup and who is signed in', async () => {
  const me = require('../api/auth/me');
  let res = mkRes(); await me(req('/api/auth/me'), res);
  assert.deepStrictEqual([res.body.configured, res.body.signedIn], [true, false]);
  const t = A.makeSession(A.config(), 'ben@example.com');
  res = mkRes(); await me(req('/api/auth/me', 'a=1; sp_session=' + encodeURIComponent(t)), res);
  assert.strictEqual(res.body.email, 'ben@example.com');
  delete process.env.GOOGLE_CLIENT_ID;
  res = mkRes(); await me(req('/api/auth/me'), res);
  assert.strictEqual(res.body.configured, false);
  assert.strictEqual(res.body.redirectUri, 'https://start.test/api/auth/callback');
});

test('data: with Google set up, needs a session and ignores the passcode', async () => {
  process.env.SYNC_PASSCODE = 'open-sesame';
  process.env.KV_REST_API_URL = 'https://redis.test'; process.env.KV_REST_API_TOKEN = 'tok';
  const store = {};
  global.fetch = async (url, opts) => {
    const [cmd, key, val] = JSON.parse(opts.body);
    if (cmd === 'SET') store[key] = val;
    return { ok: true, json: async () => ({ result: cmd === 'GET' ? store[key] ?? null : 'OK' }) };
  };
  const data = require('../api/data');
  const t = encodeURIComponent(A.makeSession(A.config(), 'ben@example.com'));
  let res = mkRes(); await data({ method: 'GET', headers: { 'x-sync-passcode': 'open-sesame' } }, res);
  assert.strictEqual(res.statusCode, 401);
  const body = { updated: 5, data: { groups: [], tasks: [] } };
  res = mkRes(); await data({ method: 'PUT', body, headers: { cookie: 'sp_session=' + t, 'content-type': 'text/plain' } }, res);
  assert.strictEqual(res.statusCode, 415);
  res = mkRes(); await data({ method: 'PUT', body, headers: { cookie: 'sp_session=' + t, 'content-type': 'application/json' } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mkRes(); await data({ method: 'GET', headers: { cookie: 'sp_session=' + t } }, res);
  assert.strictEqual(res.body.updated, 5);
});
