'use strict';
// Saves and loads the page's data (links, tasks, settings) in an Upstash Redis database.
// Protected by a passcode (env SYNC_PASSCODE) sent in the x-sync-passcode header.
const crypto = require('crypto');

const KEY = 'startpage:state';
const MAX_BYTES = 400000;

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
  const pass = process.env.SYNC_PASSCODE || process.env.HOME_PASSWORD;
  if (!pass) return res.status(503).json({ error: 'Sync is not set up: add a HOME_PASSWORD setting in Vercel, then redeploy.' });
  const cfg = redisConfig();
  if (!cfg) return res.status(503).json({ error: 'Sync is not set up: the Redis database is not connected to this project.' });

  if (!samePasscode(req.headers['x-sync-passcode'] || '', pass)) {
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ error: 'Wrong passcode' });
  }

  try {
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
      await redis(cfg, ['SET', KEY, text]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the database' });
  }
};
