'use strict';
// Turns an ESPN team-schedule response into { last, live, next } for one team.

function num(c) {
  const s = c && c.score;
  if (s == null) return null;
  const v = typeof s === 'object' ? (s.value ?? s.displayValue) : s;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nameOf(c) {
  const t = (c && c.team) || {};
  return t.shortDisplayName || t.displayName || t.abbreviation || 'TBD';
}

function summarize(json, cfg) {
  const games = [];
  for (const ev of json.events || []) {
    const comp = (ev.competitions || [])[0];
    if (!comp || !Array.isArray(comp.competitors)) continue;
    const us = comp.competitors.find((c) => String(c.team && c.team.id) === String(cfg.id));
    const them = comp.competitors.find((c) => c !== us);
    if (!us || !them) continue;
    const status = comp.status || ev.status || {};
    const type = status.type || {};
    const g = {
      date: comp.date || ev.date || null,
      state: type.state || 'pre',
      detail: type.shortDetail || '',
      home: us.homeAway === 'home',
      opp: nameOf(them),
      us: num(us),
      them: num(them),
    };
    if (g.state === 'post') {
      if (us.winner === true) g.result = 'W';
      else if (them.winner === true) g.result = 'L';
      else if (g.us != null && g.them != null) g.result = g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T';
    }
    games.push(g);
  }
  const time = (g) => (g.date ? Date.parse(g.date) : 0);
  const done = games.filter((g) => g.state === 'post').sort((a, b) => time(b) - time(a));
  const soon = games.filter((g) => g.state === 'pre').sort((a, b) => time(a) - time(b));
  const live = games.find((g) => g.state === 'in') || null;
  return {
    team: (json.team && json.team.displayName) || '',
    last: done[0] || null,
    live,
    next: soon[0] || null,
  };
}

module.exports = { summarize };
