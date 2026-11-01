'use strict';
// Dependency-free RSS 2.0 / Atom parser. Returns [{title, link, time}] newest first as listed in the feed.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0];
  const h = pick && pick.match(/href=["']([^"']+)["']/i);
  return h ? decode(h[1]) : '';
}

function safeUrl(u) {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) ? x.href : '';
  } catch {
    return '';
  }
}

function toIso(s) {
  const d = new Date(s);
  return s && !isNaN(d) ? d.toISOString() : null;
}

function parseFeed(xml, limit = 10) {
  const out = [];
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  for (const [, kind, body] of blocks) {
    const title = tag(body, 'title');
    const link = safeUrl(kind.toLowerCase() === 'entry' ? atomLink(body) : tag(body, 'link') || atomLink(body));
    if (!title || !link) continue;
    const time = toIso(tag(body, 'pubDate') || tag(body, 'published') || tag(body, 'updated') || tag(body, 'dc:date'));
    out.push({ title, link, time });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { parseFeed, decode };
