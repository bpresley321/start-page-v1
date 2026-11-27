'use strict';
// Tells the page whether Google sign-in is set up and who (if anyone) is signed in.
const A = require('../auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = A.config();
  const user = cfg ? A.readSession(cfg, A.cookies(req)[A.SESSION_COOKIE]) : null;
  res.status(200).json({ configured: !!cfg, signedIn: !!user, email: user ? user.email : null, redirectUri: A.redirectUri(req) });
};
