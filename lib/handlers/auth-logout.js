'use strict';
const A = require('../auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST' }); }
  res.setHeader('Set-Cookie', A.cookie(A.SESSION_COOKIE, '', 0));
  res.status(200).json({ ok: true });
};
