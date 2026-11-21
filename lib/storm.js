'use strict';
// Storm Prediction Center convective outlook (categorical) for a point, today (Day 1) and tomorrow (Day 2).
// Source: https://www.spc.noaa.gov/gis/ — GeoJSON with properties DN, LABEL, LABEL2, VALID, EXPIRE, fill.
const URLS = {
  today: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson',
  tomorrow: 'https://www.spc.noaa.gov/products/outlook/day2otlk_cat.lyr.geojson',
};
// DN codes used by SPC's categorical outlook. level: the 1–5 scale SPC uses for severe risk.
const CATS = {
  2: { code: 'TSTM', name: 'Thunderstorms', level: 0, color: '#c1e9c1' },
  3: { code: 'MRGL', name: 'Marginal', level: 1, color: '#8fcf8f' },
  4: { code: 'SLGT', name: 'Slight', level: 2, color: '#f6f67f' },
  5: { code: 'ENH', name: 'Enhanced', level: 3, color: '#e6c27a' },
  6: { code: 'MDT', name: 'Moderate', level: 4, color: '#e67f7f' },
  8: { code: 'HIGH', name: 'High', level: 5, color: '#ff80ff' },
};
const BY_LABEL = Object.fromEntries(Object.entries(CATS).map(([dn, c]) => [c.code, +dn]));

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lon, lat, rings) {
  if (!rings.length || !inRing(lon, lat, rings[0])) return false;
  return !rings.slice(1).some((hole) => inRing(lon, lat, hole));
}
function contains(geom, lon, lat) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return inPolygon(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((p) => inPolygon(lon, lat, p));
  if (geom.type === 'GeometryCollection') return (geom.geometries || []).some((g) => contains(g, lon, lat));
  return false;
}

// Highest category whose area contains the point; { none: true } when the point is outside every area.
function riskAt(geojson, lat, lon) {
  let best = 0, valid = null, expire = null;
  for (const f of (geojson && geojson.features) || []) {
    const p = f.properties || {};
    const dn = CATS[+p.DN] ? +p.DN : BY_LABEL[String(p.LABEL || '').toUpperCase()] || 0;
    valid = valid || p.VALID || null; expire = expire || p.EXPIRE || null;
    if (dn > best && contains(f.geometry, lon, lat)) best = dn;
  }
  return best ? { ...CATS[best], valid, expire } : { none: true, valid, expire };
}

const cache = {};
async function outlook(day) {
  const hit = cache[day];
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.j;
  const r = await fetch(URLS[day], { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error('SPC ' + r.status);
  const j = await r.json();
  cache[day] = { t: Date.now(), j };
  return j;
}

// Never throws: a failed outlook is just left out.
async function stormRisk(lat, lon) {
  const out = {};
  await Promise.all(Object.keys(URLS).map(async (day) => {
    try { out[day] = riskAt(await outlook(day), lat, lon); } catch { out[day] = null; }
  }));
  return out.today || out.tomorrow ? out : null;
}

module.exports = { riskAt, stormRisk, CATS };
