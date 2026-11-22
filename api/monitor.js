'use strict';
// Monitoring table: NWS alerts + SPC storm risk for the open weather city, Lake Weatherford,
// DFW air quality, and DFW airport delays (FAA).
const { parseCity, pickPlace } = require('../lib/weather');
const { monitor } = require('../lib/monitor');

module.exports = async (req, res) => {
  const q = (new URL(req.url, 'http://x').searchParams.get('city') || 'Fort Worth, TX').slice(0, 80);
  const { name, region } = parseCity(q);
  let place = { name: 'Fort Worth', lat: 32.7555, lon: -97.3308 };
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`, { signal: AbortSignal.timeout(6000) });
    const p = pickPlace((await r.json()).results, region);
    if (p) place = { name: p.name, lat: p.latitude, lon: p.longitude, us: (p.country_code || 'US') === 'US' };
  } catch {}
  const rows = await monitor(place);
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ place: place.name, checked: new Date().toISOString(), rows });
};
