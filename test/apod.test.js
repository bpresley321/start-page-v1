'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pickApod } = require('../lib/apod');

test('apod: newest image wins, videos skipped, credit and page link', () => {
  const r = pickApod([
    { date: '2026-11-25', media_type: 'image', title: 'Older', url: 'https://apod.nasa.gov/a.jpg', explanation: 'x' },
    { date: '2026-11-27', media_type: 'video', title: 'A video', url: 'https://youtube.com/x' },
    { date: '2026-11-26', media_type: 'image', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', copyright: '\nJane  Doe\n', explanation: 'A comet.' },
  ]);
  assert.deepStrictEqual(r, { date: '2026-11-26', title: 'Comet over Durango', url: 'https://apod.nasa.gov/b.jpg', hdurl: 'https://apod.nasa.gov/b_big.jpg', credit: 'Jane Doe', page: 'https://apod.nasa.gov/apod/ap261126.html' });
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'video', url: 'x' }]), null);
  assert.strictEqual(pickApod({ error: 'x' }), null);
  assert.strictEqual(pickApod([{ date: '2026-11-27', media_type: 'image', title: 'Moon', url: 'https://apod.nasa.gov/m.jpg', explanation: 'x' }]).credit, 'NASA');
});

test('apod: NASA stand-in entries (generic title, logo, no explanation) are skipped', () => {
  const real = { date: '2026-11-26', media_type: 'image', title: 'Portrait of NGC 1055', url: 'https://apod.nasa.gov/apod/image/2611/ngc1055.jpg', copyright: 'John Hayes', explanation: 'Big, beautiful spiral galaxy.' };
  const stubs = [
    { date: '2026-11-27', media_type: 'image', title: 'NASA Science', url: 'https://science.nasa.gov/wp-content/uploads/2023/09/nasa-logo.png', explanation: '' },
    { date: '2026-11-27', media_type: 'image', title: 'Something', url: 'https://science.nasa.gov/apod/', explanation: 'x' },
    { date: '2026-11-27', media_type: 'image', title: 'Nebula', url: 'https://apod.nasa.gov/n.jpg', explanation: '' },
  ];
  for (const st of stubs) assert.strictEqual(pickApod([real, st]).title, 'Portrait of NGC 1055', JSON.stringify(st));
  assert.strictEqual(pickApod([stubs[0]]), null);
});

const { parseApodPage, pageUrl } = require('../lib/apod');
const PAGE = `<html><head><title> APOD: 2026 November 26 - Globular Cluster M15 Deep Field</title></head>
<body BGCOLOR="#F4F4FF" text="#000000">
<center>
<h1> Astronomy Picture of the Day </h1>
<p>
<a href="archivepix.html">Discover the cosmos!</a>
<p>
2026 November 26
<br>
<a href="image/2611/M15_Perez.jpg">
<IMG SRC="image/2611/M15_Perez_1024.jpg"
alt="A starfield is shown with thin wisps of gray and red running through it." style="max-width:100%"></a>
</center>

<center>
<b> Globular Cluster M15 Deep Field </b> <br>
<b> Image Credit &
<a href="lib/about_apod.html#srapply">Copyright</a>: </b>
<a href="https://example.com/">Alvaro Ibanez Perez</a>
</center> <p>

<b> Explanation: </b>
Stars, like bees, swarm around the center of bright globular cluster M15.
</body></html>`;

test('apod pages: classic page parsed (title, credit, image, page link); video days skipped', () => {
  assert.strictEqual(pageUrl('2026-11-26'), 'https://apod.nasa.gov/apod/ap261126.html');
  const r = parseApodPage(PAGE, '2026-11-26');
  assert.deepStrictEqual([r.title, r.credit, r.url, r.hdurl, r.page], ['Globular Cluster M15 Deep Field', 'Alvaro Ibanez Perez', 'https://apod.nasa.gov/apod/image/2611/M15_Perez_1024.jpg', 'https://apod.nasa.gov/apod/image/2611/M15_Perez.jpg', 'https://apod.nasa.gov/apod/ap261126.html']);
  assert.match(r.explanation, /^Stars, like bees/);
  const video = PAGE.replace(/<a href="image[\s\S]*?<\/a>/, '<iframe width="960" height="540" src="https://www.youtube.com/embed/x"></iframe>');
  assert.strictEqual(parseApodPage(video, '2026-11-26'), null);
  const credit2 = PAGE.replace(/<b> Image Credit &[\s\S]*?<\/center>/, '<b> Image Credit: </b> NASA, ESA, Hubble </center>');
  assert.strictEqual(parseApodPage(credit2, '2026-11-26').credit, 'NASA, ESA, Hubble');
});

test('apod api: stand-in API answer falls back to the newest classic page', async () => {
  const real = global.fetch;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const yest = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - 864e5));
  global.fetch = async (u) => {
    if (u.includes('api.nasa.gov')) return { ok: true, status: 200, json: async () => [{ date: today, media_type: 'image', title: 'NASA Science', url: 'https://science.nasa.gov/x/nasa-logo@2x.png', explanation: 'x' }] };
    if (u === pageUrl(today)) return { ok: false, status: 404, text: async () => '' };          // not posted yet
    if (u === pageUrl(yest)) return { ok: true, status: 200, text: async () => PAGE };
    return { ok: true, status: 200, text: async () => PAGE.replace('Globular Cluster M15 Deep Field', 'Older one') };
  };
  const r = { headers: {} }; r.setHeader = (k, v) => (r.headers[k] = v); r.status = (c) => ((r.code = c), r); r.json = (b) => ((r.body = b), r);
  try {
    await require('../api/apod')({ url: '/api/apod?v=2' }, r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual([r.body.title, r.body.date, r.body.credit, 'explanation' in r.body], ['Globular Cluster M15 Deep Field', yest, 'Alvaro Ibanez Perez', false]);
  } finally { global.fetch = real; }
});

const { parseScienceFeed, parseSciencePage } = require('../lib/apod');
test('apod science.nasa.gov: feed titles/dates and page og:image + credit', () => {
  const feed = `<?xml version="1.0"?><rss><channel><title>APOD</title>
  <item><title>APOD: 2026 November 27 &#8211; The Moon Watchers</title><link>https://science.nasa.gov/image-article/apod-2026-november-27-the-moon-watchers/</link><pubDate>Fri, 27 Nov 2026 05:00:00 +0000</pubDate></item>
  <item><title><![CDATA[APOD: 2026 November 26 – Eye in the Sky: The Milky Way over Lençóis]]></title><link>https://science.nasa.gov/image-article/apod-2026-november-26-eye-in-the-sky/</link><media:content url="https://assets.science.nasa.gov/content/dam/apod/2026/nov/lencois.jpg/renditions/web.1280.jpeg" medium="image"/></item>
  </channel></rss>`;
  const items = parseScienceFeed(feed);
  assert.deepStrictEqual(items.map((i) => [i.date, i.title]), [['2026-11-27', 'The Moon Watchers'], ['2026-11-26', 'Eye in the Sky: The Milky Way over Lençóis']]);
  const page = `<html><head><meta property="og:image" content="https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2026/november/moonwatchers.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg"/></head>
   <body><h1>The Moon Watchers</h1><p>Image Credit &amp; Copyright: Jane Doe (Sky Club)</p><p>Explanation: Two people …</p></body></html>`;
  const r = parseSciencePage(page, items[0]);
  assert.deepStrictEqual([r.title, r.date, r.credit, r.page], ['The Moon Watchers', '2026-11-27', 'Jane Doe (Sky Club)', items[0].link]);
  assert.match(r.url, /moonwatchers\.jpg/);
  assert.match(parseSciencePage('<meta content="https://x/a.jpg" property="og:image">', items[1]).url, /lencois\.jpg/); // feed image wins
  assert.strictEqual(parseSciencePage('<meta property="og:image" content="https://science.nasa.gov/x/nasa-logo@2x.png">', items[0]), null);
  assert.strictEqual(parseSciencePage('<p>no image</p>', items[0]), null);
});
