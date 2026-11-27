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
module.exports = { pickApod, placeholder };
