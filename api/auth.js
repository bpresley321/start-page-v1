'use strict';
// One function for all of Google sign-in (Vercel's free plan allows 12 functions per deployment).
// vercel.json sends /api/auth/login, /callback, /me and /logout here; the action is read from the path.
const HANDLERS = {
  login: require('../lib/handlers/auth-login'),
  callback: require('../lib/handlers/auth-callback'),
  me: require('../lib/handlers/auth-me'),
  logout: require('../lib/handlers/auth-logout'),
};

function action(req) {
  const u = new URL(req.url || '/', 'http://x');
  const fromPath = (u.pathname.match(/\/api\/auth\/([a-z]+)\/?$/) || [])[1];
  return fromPath || u.searchParams.get('action') || (req.query && req.query.action) || '';
}

module.exports = async (req, res) => {
  const h = HANDLERS[action(req)];
  if (!h) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'Not found' }); }
  return h(req, res);
};
module.exports.action = action;
