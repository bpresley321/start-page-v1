'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { eventsBetween, zonedToUtc, durationMs } = require('../lib/ical');

const wrap = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Cadence Running Club\r\nX-WR-TIMEZONE:America/Chicago\r\n${body}\r\nEND:VCALENDAR\r\n`;
const ev = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const T = (s) => Date.parse(s);

test('ical: timezone conversion handles daylight saving', () => {
  assert.strictEqual(new Date(zonedToUtc({ y: 2026, m: 7, d: 1, h: 8, mi: 0, s: 0 }, 'America/Chicago')).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.strictEqual(new Date(zonedToUtc({ y: 2026, m: 12, d: 1, h: 8, mi: 0, s: 0 }, 'America/Chicago')).toISOString(), '2026-12-01T14:00:00.000Z');
  assert.strictEqual(durationMs('PT1H30M'), 5400000);
  assert.strictEqual(durationMs('P1D'), 864e5);
});

test('ical: single, UTC, all-day, folded and escaped events', () => {
  const ics = wrap([
    ev(['UID:a', 'SUMMARY:Dinner\\, with Allison', 'DTSTART;TZID=America/Chicago:20261114T183000', 'DTEND;TZID=America/Chicago:20261114T200000', 'LOCATION:Magnolia', ' Ave']),
    ev(['UID:b', 'SUMMARY:Call', 'DTSTART:20261115T150000Z', 'DURATION:PT30M']),
    ev(['UID:c', 'SUMMARY:Game day', 'DTSTART;VALUE=DATE:20261116', 'DTEND;VALUE=DATE:20261117']),
    ev(['UID:d', 'SUMMARY:Old', 'DTSTART:20250101T150000Z']),
    ev(['UID:e', 'SUMMARY:Cancelled', 'STATUS:CANCELLED', 'DTSTART:20261115T150000Z']),
    ev(['UID:f', 'SUMMARY:With alarm', 'DTSTART:20261115T170000Z', 'BEGIN:VALARM', 'SUMMARY:Alarm text', 'END:VALARM']),
  ].join('\r\n'));
  const r = eventsBetween(ics, T('2026-11-13T00:00Z'), T('2026-11-20T00:00Z'));
  assert.strictEqual(r.name, 'Cadence Running Club');
  assert.deepStrictEqual(r.events.map((e) => [e.title, e.start, e.allDay]), [
    ['Dinner, with Allison', '2026-11-15T00:30:00.000Z', false],
    ['Call', '2026-11-15T15:00:00.000Z', false],
    ['With alarm', '2026-11-15T17:00:00.000Z', false],
    ['Game day', '2026-11-16', true],
  ]);
  assert.strictEqual(r.events[0].location, 'MagnoliaAve');
  assert.strictEqual(r.events[1].end, '2026-11-15T15:30:00.000Z');
});

test('ical: weekly repeat across DST with EXDATE and a moved occurrence', () => {
  const ics = wrap([
    ev(['UID:run', 'SUMMARY:Tuesday run', 'DTSTART;TZID=America/Chicago:20260901T060000', 'DTEND;TZID=America/Chicago:20260901T070000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=America/Chicago:20261119T060000']),
    ev(['UID:run', 'RECURRENCE-ID;TZID=America/Chicago:20261117T060000', 'SUMMARY:Tuesday run (moved)', 'DTSTART;TZID=America/Chicago:20261117T070000', 'DTEND;TZID=America/Chicago:20261117T080000']),
  ].join('\r\n'));
  const r = eventsBetween(ics, T('2026-11-13T00:00Z'), T('2026-11-27T00:00Z'));
  assert.deepStrictEqual(r.events.map((e) => [e.title, e.start]), [
    ['Tuesday run (moved)', '2026-11-17T13:00:00.000Z'],
    ['Tuesday run', '2026-11-24T12:00:00.000Z'],
    ['Tuesday run', '2026-11-26T12:00:00.000Z'],
  ]);
});

test('ical: COUNT, UNTIL, INTERVAL, monthly nth weekday, yearly and daily', () => {
  const ics = wrap([
    ev(['UID:1', 'SUMMARY:Count', 'DTSTART:20261110T150000Z', 'RRULE:FREQ=DAILY;COUNT=5']),            // 10..14
    ev(['UID:2', 'SUMMARY:Until', 'DTSTART:20261101T150000Z', 'RRULE:FREQ=WEEKLY;UNTIL=20261115T000000Z']), // Nov 1, 8
    ev(['UID:3', 'SUMMARY:Biweekly', 'DTSTART;TZID=America/Chicago:20261102T120000', 'RRULE:FREQ=WEEKLY;INTERVAL=2']), // Nov 2, 16, 30
    ev(['UID:4', 'SUMMARY:Board', 'DTSTART;TZID=America/Chicago:20260113T190000', 'RRULE:FREQ=MONTHLY;BYDAY=3TU']), // Nov 17
    ev(['UID:5', 'SUMMARY:Last Fri', 'DTSTART;TZID=America/Chicago:20260130T190000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR']), // Nov 27
    ev(['UID:6', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:19900618', 'RRULE:FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=18']),
    ev(['UID:7', 'SUMMARY:Anniv', 'DTSTART;VALUE=DATE:20101121', 'RRULE:FREQ=YEARLY']),
  ].join('\r\n'));
  const r = eventsBetween(ics, T('2026-11-13T00:00Z'), T('2026-12-01T00:00Z'));
  assert.deepStrictEqual(r.events.map((e) => e.title + ' ' + e.start.slice(0, 10)), [
    'Count 2026-11-13', 'Count 2026-11-14', 'Biweekly 2026-11-16', 'Board 2026-11-18', 'Anniv 2026-11-21', 'Last Fri 2026-11-28', 'Biweekly 2026-11-30',
  ]);
});
