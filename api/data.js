'use strict';
// Saves and loads the page's data (links, tasks, settings) in an Upstash Redis database.
// Protected by Google sign-in once it is set up (see lib/auth.js); until then by a passcode
// (env SYNC_PASSCODE or HOME_PASSWORD) sent in the x-sync-passcode header.
const crypto = require('crypto');
const A = require('../lib/auth');

const KEY = 'startpage:state';
const MAX_BYTES = 400000;
// Daily backups: the first save of each day first copies the saved data as it stood (the start of that day)
// to startpage:backup:YYYY-MM-DD, kept 31 days. A restore first copies the current data to
// startpage:backup:before-restore, so a restore can itself be undone.
const BACKUP = 'startpage:backup:';
const KEEP_SECONDS = 31 * 86400;
const PRE_RESTORE = 'before-restore';
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Database error');
  return j.result;
}

function samePasscode(given, expected) {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

function validBody(b) {
  return !!b && typeof b === 'object' && typeof b.updated === 'number' && b.data && typeof b.data === 'object' &&
    Array.isArray(b.data.groups) && Array.isArray(b.data.tasks);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const google = A.config();
  const pass = process.env.SYNC_PASSCODE || process.env.HOME_PASSWORD;
  if (!google && !pass) return res.status(503).json({ error: 'Sync is not set up: add a HOME_PASSWORD setting in Vercel, then redeploy.' });
  const cfg = redisConfig();
  if (!cfg) return res.status(503).json({ error: 'Sync is not set up: the Redis database is not connected to this project.' });

  if (google) {
    // Once Google sign-in is set up, the passcode is no longer accepted.
    if (!A.readSession(google, A.cookies(req)[A.SESSION_COOKIE])) return res.status(401).json({ error: 'Sign in required', signin: true });
    // Cookie-authenticated writes must be JSON so another site cannot send them as a plain form.
    if ((req.method === 'PUT' || req.method === 'POST') && !/^application\/json/i.test(String(req.headers['content-type'] || ''))) {
      return res.status(415).json({ error: 'JSON required' });
    }
  } else if (!samePasscode(req.headers['x-sync-passcode'] || '', pass)) {
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ error: 'Wrong passcode' });
  }

  try {
    if (req.method === 'GET' && new URL(req.url || '/', 'http://x').searchParams.has('backups')) {
      const keys = (await redis(cfg, ['KEYS', BACKUP + '*'])) || [];
      const ids = keys.map((k) => k.slice(BACKUP.length));
      const days = ids.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
      return res.status(200).json({ backups: days, beforeRestore: ids.includes(PRE_RESTORE) });
    }
    if (req.method === 'GET') {
      const raw = await redis(cfg, ['GET', KEY]);
      if (!raw) return res.status(200).json({ empty: true });
      return res.status(200).json(JSON.parse(raw));
    }
    if (req.method === 'PUT') {
      const body = req.body;
      if (!validBody(body)) return res.status(400).json({ error: 'Invalid data' });
      const text = JSON.stringify({ data: body.data, updated: body.updated });
      if (text.length > MAX_BYTES) return res.status(413).json({ error: 'Data is too large' });
      const existingRaw = await redis(cfg, ['GET', KEY]);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (typeof existing.updated === 'number' && existing.updated > body.updated) {
          return res.status(409).json(existing);
        }
      }
      if (existingRaw) await redis(cfg, ['SET', BACKUP + today(), existingRaw, 'NX', 'EX', KEEP_SECONDS]);
      await redis(cfg, ['SET', KEY, text]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST') {
      const id = String(req.body && req.body.restore || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(id) && id !== PRE_RESTORE) return res.status(400).json({ error: 'Pick a backup' });
      const raw = await redis(cfg, ['GET', BACKUP + id]);
      if (!raw) return res.status(404).json({ error: 'That backup is gone' });
      const current = await redis(cfg, ['GET', KEY]);
      if (current) await redis(cfg, ['SET', BACKUP + PRE_RESTORE, current, 'EX', KEEP_SECONDS]);
      const restored = { data: JSON.parse(raw).data, updated: Date.now() };
      await redis(cfg, ['SET', KEY, JSON.stringify(restored)]);
      return res.status(200).json(restored);
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the database' });
  }
};
