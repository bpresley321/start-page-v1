'use strict';
const { describe, parseCity, pickPlace } = require('../lib/weather');

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Upstream ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams.get('city') || '';
  const { name, region } = parseCity(q.slice(0, 80));
  if (!name) return res.status(400).json({ error: 'Enter a city' });
  try {
    const geo = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
    );
    const place = pickPlace(geo.results, region);
    if (!place) return res.status(404).json({ error: `No place found for "${q}"` });
    const w = await getJson(
      'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=5'
    );
    const c = w.current, d = w.daily;
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({
      place: [place.name, place.admin1].filter(Boolean).join(', '),
      now: {
        temp: Math.round(c.temperature_2m),
        feels: Math.round(c.apparent_temperature),
        wind: Math.round(c.wind_speed_10m),
        text: describe(c.weather_code),
      },
      days: d.time.map((date, i) => ({
        date,
        text: describe(d.weather_code[i]),
        hi: Math.round(d.temperature_2m_max[i]),
        lo: Math.round(d.temperature_2m_min[i]),
      })),
    });
  } catch (e) {
    return res.status(502).json({ error: 'Weather is unavailable right now' });
  }
};
