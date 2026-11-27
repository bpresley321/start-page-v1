'use strict';
// Google sends the browser back here. Checks the state, swaps the code for an ID token, checks the email
// against ALLOWED_EMAILS, then sets a signed session cookie.
const A = require('../auth');

function back(res, cookies, msg) {
  res.setHeader('Set-Cookie', cookies);
  res.statusCode = 302;
  res.setHeader('Location', '/' + (msg ? '?signin=' + encodeURIComponent(msg) : ''));
  res.end();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const clearState = A.cookie(A.STATE_COOKIE, '', 0);
  const cfg = A.config();
  if (!cfg) return back(res, [clearState], 'not-set-up');
  const q = new URL(req.url, 'http://x').searchParams;
  if (q.get('error')) return back(res, [clearState], 'cancelled');
  const state = A.cookies(req)[A.STATE_COOKIE];
  if (!state || !q.get('state') || !A.same(state, q.get('state')) || !q.get('code')) return back(res, [clearState], 'expired');

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: q.get('code'), client_id: cfg.id, client_secret: cfg.secret,
        redirect_uri: A.redirectUri(req), grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id_token) return back(res, [clearState], 'failed');
    const who = A.emailFromIdToken(cfg, j.id_token);
    if (who.error) return back(res, [clearState], who.error === 'not allowed' ? 'not-allowed' : 'failed');
    return back(res, [clearState, A.cookie(A.SESSION_COOKIE, A.makeSession(cfg, who.email), A.SESSION_DAYS * 86400)]);
  } catch {
    return back(res, [clearState], 'failed');
  }
};
