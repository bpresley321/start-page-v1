'use strict';
// Starts Google sign-in: remembers a random "state" in a short-lived cookie, then sends the browser to Google.
const crypto = require('crypto');
const A = require('../../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = A.config();
  if (!cfg) return res.status(503).json({ error: 'Google sign-in is not set up yet.' });
  const state = crypto.randomBytes(24).toString('base64url');
  const q = new URLSearchParams({
    client_id: cfg.id, redirect_uri: A.redirectUri(req), response_type: 'code',
    scope: 'openid email', state, prompt: 'select_account',
  });
  res.setHeader('Set-Cookie', A.cookie(A.STATE_COOKIE, state, 600));
  res.statusCode = 302;
  res.setHeader('Location', 'https://accounts.google.com/o/oauth2/v2/auth?' + q);
  res.end();
};
