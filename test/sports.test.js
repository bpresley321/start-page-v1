'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { summarize } = require('../lib/sports');

const cfg = { id: 239 };
const ev = (date, state, us, them, extra = {}) => ({
  date,
  competitions: [{
    date,
    status: { type: { state, shortDetail: extra.detail || '' } },
    competitors: [
      { homeAway: extra.home === false ? 'away' : 'home', team: { id: '239', shortDisplayName: 'Baylor' }, score: us == null ? undefined : { value: us, displayValue: String(us) }, winner: extra.winner },
      { homeAway: 'away', team: { id: '99', shortDisplayName: extra.opp || 'TCU' }, score: them == null ? undefined : { value: them, displayValue: String(them) }, winner: extra.oppWinner },
    ],
  }],
});

test('picks latest completed game, next upcoming game, and a live game', () => {
  const json = { team: { displayName: 'Baylor Bears' }, events: [
    ev('2026-09-05T18:00Z', 'post', 30, 10, { winner: true, opp: 'Old' }),
    ev('2026-10-10T18:00Z', 'post', 17, 24, { oppWinner: true, opp: 'Kansas', home: false }),
    ev('2026-11-14T18:00Z', 'pre', null, null, { opp: 'Utah' }),
    ev('2026-11-07T18:00Z', 'pre', null, null, { opp: 'TCU' }),
  ] };
  const s = summarize(json, cfg);
  assert.strictEqual(s.team, 'Baylor Bears');
  assert.deepStrictEqual([s.last.opp, s.last.result, s.last.us, s.last.them, s.last.home], ['Kansas', 'L', 17, 24, false]);
  assert.strictEqual(s.next.opp, 'TCU');
  assert.strictEqual(s.live, null);
});

test('detects a live game and ties; handles numeric string scores', () => {
  const json = { events: [
    ev('2026-11-01T18:00Z', 'in', 3, 2, { detail: '2nd - 5:00' }),
    { ...ev('2026-10-01T18:00Z', 'post', 1, 1) },
  ] };
  json.events[1].competitions[0].competitors[0].score = '1';
  json.events[1].competitions[0].competitors[1].score = '1';
  const s = summarize(json, cfg);
  assert.strictEqual(s.live.detail, '2nd - 5:00');
  assert.strictEqual(s.last.result, 'T');
});

test('empty or unrelated data gives nulls instead of throwing', () => {
  assert.deepStrictEqual(summarize({}, cfg), { team: '', last: null, live: null, next: null });
  const other = { events: [{ competitions: [{ competitors: [{ team: { id: '1' } }, { team: { id: '2' } }] }] }] };
  assert.strictEqual(summarize(other, cfg).last, null);
});
