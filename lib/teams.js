'use strict';
// Teams shown on the sports card. ESPN ids are specific to each sport.
// `expect` must appear in the team name ESPN returns; a mismatch shows an error instead of the wrong team.
module.exports = [
  { key: 'baylor-fb',  label: 'Baylor Football',          sport: 'football',   league: 'college-football',      id: 239, expect: 'Baylor' },
  { key: 'baylor-mbb', label: 'Baylor Basketball',        sport: 'basketball', league: 'mens-college-basketball', id: 239, expect: 'Baylor' },
  { key: 'spurs',      label: 'Tottenham Hotspur',        sport: 'soccer',     league: 'all',                   id: 367, expect: 'Tottenham' },
  { key: 'rangers',    label: 'Texas Rangers',            sport: 'baseball',   league: 'mlb',                   id: 13,  expect: 'Rangers' },
  { key: 'stars',      label: 'Dallas Stars',             sport: 'hockey',     league: 'nhl',                   id: 9,   expect: 'Stars' },
  { key: 'mavs',       label: 'Dallas Mavericks',         sport: 'basketball', league: 'nba',                   id: 6,   expect: 'Mavericks' },
];
