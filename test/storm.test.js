'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { riskAt } = require('../lib/storm');

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// Layered outlook: each category is a full area on top of the lower ones.
const OUTLOOK = { type: 'FeatureCollection', features: [
  { properties: { DN: 2, LABEL: 'TSTM', VALID: '202611211200', EXPIRE: '202611221200' }, geometry: { type: 'Polygon', coordinates: [sq(-104, 28, -90, 38)] } },
  { properties: { DN: 3, LABEL: 'MRGL' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(-100, 30, -94, 35)], [sq(-89, 30, -85, 32)]] } },
  // Slight risk with a hole cut out around one spot
  { properties: { DN: 4, LABEL: 'SLGT' }, geometry: { type: 'Polygon', coordinates: [sq(-98.5, 32, -96, 34), sq(-97.2, 33.2, -96.5, 33.8)] } },
  { properties: { LABEL: 'ENH' }, geometry: { type: 'Polygon', coordinates: [sq(-96.9, 32.5, -96.6, 32.9)] } },
]};

test('storm: picks the highest category containing the city', () => {
  const fw = riskAt(OUTLOOK, 32.75, -97.33);           // Fort Worth: inside Slight
  assert.deepStrictEqual([fw.code, fw.name, fw.level, fw.valid], ['SLGT', 'Slight', 2, '202611211200']);
  assert.strictEqual(riskAt(OUTLOOK, 32.78, -96.8).code, 'ENH');      // Dallas: Enhanced via LABEL only
  assert.strictEqual(riskAt(OUTLOOK, 33.5, -96.9).code, 'MRGL');      // inside Slight's hole
  assert.strictEqual(riskAt(OUTLOOK, 31, -87).code, 'MRGL');          // second part of a MultiPolygon
  assert.strictEqual(riskAt(OUTLOOK, 37, -102).code, 'TSTM');
  assert.strictEqual(riskAt(OUTLOOK, 37.3, -107.9).none, true);       // Durango: nothing
  assert.strictEqual(riskAt({ features: [] }, 32.75, -97.33).none, true);
});
