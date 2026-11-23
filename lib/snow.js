'use strict';
// Reads the Purgatory snow report numbers from the resort's conditions page (plain page text; the numbers
// come right before their labels, e.g. 3″ 24 Hr, 14″ Base Depth, 1 of 12 Lifts Open).
const PAGE = 'https://www.purgatory.ski/mountain/weather-conditions-webcams/';

function pageText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&(quot|Prime|rdquo|ldquo);/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

const NUM = '(\\d{1,3}(?:\\.\\d)?)\\s*(?:["″”\\u2033]|in\\b\\.?|inches\\b)?\\s*';
function inches(text, label) {
  const m = text.match(new RegExp(NUM + label, 'i'));
  return m ? +m[1] : null;
}
// The page shows whole-mountain dials ("11 of 114" … "Trails Open", sometimes with a percent or other text
// between) and per-area counts ("Frontside 5/57 Trails Open"). Each "N of M" / "N/M" is matched to the first
// Trails Open / Lifts Open label after it (within a short distance); the count with the largest total wins.
function counts(text) {
  const best = { trails: null, lifts: null };
  for (const m of text.matchAll(/(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})(?!\d)/gi)) {
    const open = +m[1], total = +m[2];
    if (open > total) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const lab = after.match(/^(?:(?!\d{1,3}\s*(?:of|\/)\s*\d)[\s\S])*?\b(trails?|runs?|lifts?)\s*open\b/i);
    if (!lab) continue;
    const key = /lift/i.test(lab[1]) ? 'lifts' : 'trails';
    if (!best[key] || total > best[key].total) best[key] = { open, total };
  }
  return best;
}

function parseSnow(html) {
  const t = pageText(html);
  const r = {
    new24: inches(t, '24\\s*-?\\s*h(?:ou)?rs?\\b'),
    new48: inches(t, '48\\s*-?\\s*h(?:ou)?rs?\\b'),
    new7d: inches(t, '7\\s*-?\\s*days?\\b'),
    base: inches(t, 'base\\s*depth'),
    season: inches(t, 'season\\s*total'),
    ...counts(t),
  };
  const found = Object.values(r).filter((v) => v != null).length;
  return found >= 2 ? r : null; // off-season (or a page redesign): no report
}

module.exports = { parseSnow, pageText, PAGE };
