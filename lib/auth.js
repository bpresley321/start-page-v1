'use strict';
// Google sign-in helpers. No dependencies.
// Settings (Vercel environment variables):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  from Google Cloud > Google Auth Platform > Clients
//   ALLOWED_EMAILS                          who may sign in, comma-separated (e.g. you@gmail.com)
//   SESSION_SECRET (optional)               signs the session cookie; derived from the client secret if absent
const crypto = require('crypto');

const SESSION_COOKIE = 'sp_session';
const STATE_COOKIE = 'sp_state';
const SESSION_DAYS = 60;

function config() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  const allowed = String(process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!id || !secret || !allowed.length) return null;
  const key = process.env.SESSION_SECRET || crypto.createHmac('sha256', secret).update('startpage-session-v1').digest('hex');
  return { id, secret, allowed, key };
}

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function hmac(key, s) { return crypto.createHmac('sha256', key).update(s).digest('base64url'); }
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeSession(cfg, email, now = Date.now()) {
  const body = b64url(JSON.stringify({ e: email, x: now + SESSION_DAYS * 864e5 }));
  return body + '.' + hmac(cfg.key, body);
}

function readSession(cfg, token, now = Date.now()) {
  if (!cfg || !token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !same(sig, hmac(cfg.key, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof p.x !== 'number' || p.x < now) return null;
    if (!cfg.allowed.includes(String(p.e).toLowerCase())) return null; // removing someone from ALLOWED_EMAILS signs them out
    return { email: p.e };
  } catch { return null; }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function origin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}
function redirectUri(req) { return origin(req) + '/api/auth/callback'; }

function currentUser(req) {
  const cfg = config();
  return cfg ? readSession(cfg, cookies(req)[SESSION_COOKIE]) : null;
}

// The ID token comes straight from Google's token endpoint over HTTPS, so its claims can be read without
// re-checking the signature (OpenID Connect Core 3.1.3.7). Audience, issuer, expiry and email are still checked.
function emailFromIdToken(cfg, idToken, now = Date.now()) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return { error: 'bad token' };
  let c;
  try { c = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { return { error: 'bad token' }; }
  if (c.aud !== cfg.id) return { error: 'wrong audience' };
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') return { error: 'wrong issuer' };
  if (typeof c.exp !== 'number' || c.exp * 1000 < now) return { error: 'expired' };
  if (!c.email || c.email_verified !== true) return { error: 'no verified email' };
  const email = String(c.email).toLowerCase();
  if (!cfg.allowed.includes(email)) return { error: 'not allowed', email };
  return { email };
}

module.exports = {
  SESSION_COOKIE, STATE_COOKIE, SESSION_DAYS,
  config, makeSession, readSession, cookies, cookie, origin, redirectUri, currentUser, emailFromIdToken, same,
};
