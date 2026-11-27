'use strict';
// NASA Astronomy Picture of the Day: the newest picture from the last week (some days are videos).
// NASA sometimes returns a stand-in entry (title "NASA Science", a logo image, no explanation) for a day whose
// picture isn't ready. Real entries have their own title, an explanation, and an image file (jpg, png, gif, webp).
function placeholder(x) {
  const title = String(x.title || '').trim();
  if (!title || /^(nasa|nasa science|astronomy picture of the day|apod)$/i.test(title)) return true;
  if (/logo|meatball|insignia|placeholder|default[-_]?(image|og)/i.test(x.url)) return true;
  if (!/\.(jpe?g|png|gif|webp)(\?|$)/i.test(x.url)) return true;
  if (!String(x.explanation || '').trim()) return true;
  return false;
}
function pickApod(list) {
  const items = [].concat(list || []).filter((x) => x && x.media_type === 'image' && x.url && x.date && !placeholder(x))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const x = items[0];
  if (!x) return null;
  const [y, m, d] = x.date.split('-');
  return {
    date: x.date,
    title: x.title || 'Astronomy Picture of the Day',
    url: x.url,                       // about 1,000–1,600 px wide: right for a banner
    hdurl: x.hdurl || null,
    credit: x.copyright ? String(x.copyright).replace(/\s+/g, ' ').trim() : 'NASA',
    page: `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`,
  };
}
// Backup source: the classic page for a day, https://apod.nasa.gov/apod/apYYMMDD.html (unchanged for decades):
//   <a href="image/2611/M15.jpg"><IMG SRC="image/2611/M15_1024.jpg" …></a> … <center><b> Title </b><br><b> Image Credit … </b> Name </center>
const BASE = 'https://apod.nasa.gov/apod/';
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/\s+/g, ' ').trim();
function pageUrl(date) { const [y, m, d] = date.split('-'); return `${BASE}ap${y.slice(2)}${m}${d}.html`; }
function parseApodPage(html, date) {
  const h = String(html || '');
  const img = h.match(/<img[^>]+src\s*=\s*["']?([^"'\s>]+\.(?:jpe?g|png|gif|webp))/i);
  if (!img) return null;                                   // a video day
  const big = h.match(/<a[^>]+href\s*=\s*["']?(image\/[^"'\s>]+\.(?:jpe?g|png|gif|webp))/i);
  const abs = (u) => (/^https?:/i.test(u) ? u : BASE + u.replace(/^\.?\//, ''));
  const after = h.slice(img.index);
  const block = (after.match(/<\/center>\s*<center>([\s\S]*?)<\/center>/i) || after.match(/<center>([\s\S]*?)<\/center>/i) || [])[1] || '';
  const title = strip((block.match(/<b>([\s\S]*?)<\/b>/i) || [])[1]);
  const credit = strip(block.replace(/^[\s\S]*?<\/b>/i, '')).replace(/^(image|video|illustration)?\s*credits?\s*(&|and)?\s*(copyright)?\s*:?\s*/i, '').replace(/^copyright\s*:?\s*/i, '');
  const explanation = strip((h.match(/Explanation:([\s\S]{0,400})/i) || [])[1]);
  if (!title || /^astronomy picture of the day$/i.test(title)) return null;
  return { date, title, url: abs(img[1]), hdurl: big ? abs(big[1]) : null, credit: credit || 'NASA', page: pageUrl(date), explanation };
}

// Newer home: science.nasa.gov. Its RSS feed lists entries titled "APOD: 2026 November 27 – The Moon Watchers";
// each entry's page carries the picture as its og:image (the standard link-preview image).
const SCIENCE_FEED = 'https://science.nasa.gov/feed/apod-basic/';
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function parseScienceFeed(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const tag = (t) => strip(((it.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)<\\/' + t + '>', 'i')) || [])[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    const rawTitle = tag('title'), link = tag('link');
    const d = rawTitle.match(/(\d{4})\s+([A-Za-z]+)\s+(\d{1,2})/);
    const mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1;
    const date = d && mi >= 0 ? `${d[1]}-${String(mi + 1).padStart(2, '0')}-${String(+d[3]).padStart(2, '0')}` : null;
    const title = rawTitle.replace(/^APOD:\s*/i, '').replace(/^\d{4}\s+[A-Za-z]+\s+\d{1,2}\s*[–—-]\s*/, '').trim();
    const media = (it.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+url=["']([^"']+)["']/i) || [])[1] || null;
    if (title && /^https:\/\//.test(link)) out.push({ date, title, link, media });
  }
  return out;
}
function metaContent(h, prop) {
  const k = prop.replace(/:/g, '\\:');
  const m = h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']`, 'i')) || h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&') : null;
}
function parseSciencePage(html, entry) {
  const h = String(html || '');
  const img = entry.media || metaContent(h, 'og:image') || metaContent(h, 'twitter:image');
  if (!img || /logo|meatball|insignia|placeholder/i.test(img)) return null;
  const text = strip(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
  const c = text.match(/(?:Image|Video|Illustration)?\s*Credits?\s*(?:&|and)?\s*(?:Copyright)?\s*:\s*([^.;|]{3,90}?)(?=\s+(?:Explanation|Text|Credit|Share|Details|Keep Exploring|Related|$))/i);
  return { date: entry.date, title: entry.title, url: img, hdurl: null, credit: c ? c[1].trim() : 'NASA', page: entry.link };
}

module.exports = { pickApod, placeholder, parseApodPage, pageUrl, parseScienceFeed, parseSciencePage, SCIENCE_FEED };
