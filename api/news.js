'use strict';
const FEEDS = require('../lib/feeds');
const { parseFeed } = require('../lib/rss');

module.exports = async (req, res) => {
  const key = new URL(req.url, 'http://x').searchParams.get('feed');
  const feed = Object.prototype.hasOwnProperty.call(FEEDS, key) ? FEEDS[key] : null;
  if (!feed) return res.status(404).json({ error: 'Unknown feed' });
  try {
    const r = await fetch(feed.url, {
      headers: { 'user-agent': 'start-page/1.0 (+personal homepage)', accept: 'application/rss+xml, application/atom+xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('Feed returned ' + r.status);
    const items = parseFeed(await r.text(), 10);
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({ title: feed.title, items });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load ' + feed.title });
  }
};
