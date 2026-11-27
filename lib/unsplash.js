'use strict';
// Unsplash header photo: a landscape-orientation photo on a theme, cropped by Unsplash's image service to banner shape.
// Unsplash's rules: hotlink their image URLs, credit the photographer and Unsplash with links, and report a
// "download" when a photo is used like a wallpaper (the header counts), via links.download_location.
const UTM = 'utm_source=personal_start_page&utm_medium=referral';
const withUtm = (u) => u + (u.includes('?') ? '&' : '?') + UTM;
function fromUnsplash(p) {
  if (!p || !p.urls || !(p.urls.raw || p.urls.full)) return null;
  const raw = p.urls.raw || p.urls.full;
  const crop = raw + (raw.includes('?') ? '&' : '?') + 'w=2400&h=520&fit=crop&crop=entropy&auto=format&q=75';
  const name = (p.user && p.user.name) || 'Unknown';
  const what = String(p.description || p.alt_description || '').replace(/\s+/g, ' ').trim();
  return {
    source: 'unsplash',
    title: what ? what.charAt(0).toUpperCase() + what.slice(1) : 'Unsplash photo',
    url: crop,
    credit: name,
    caption: `Photo by ${name} on Unsplash`,
    page: withUtm((p.links && p.links.html) || 'https://unsplash.com/'),
    photographer: p.user && p.user.links && p.user.links.html ? withUtm(p.user.links.html) : null,
    download: p.links && p.links.download_location ? p.links.download_location : null,
    location: p.location && p.location.name ? p.location.name : null,
  };
}
module.exports = { fromUnsplash, withUtm };
