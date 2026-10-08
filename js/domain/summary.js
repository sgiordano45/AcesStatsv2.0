// js/domain/summary.js
// The season summary the home page reads: standings, recent results, the next
// games, leaders (season and career) and milestone watch, in one small doc.
// Pure: no Firebase, no DOM. The same file builds the summary in the browser
// (js/data/summaries.js, when the stored doc is missing or old) and in the
// Cloud Function (functions/summary.js loads a copy from functions/domain/).
//
//   const summary = buildSeasonSummary({ seasonId: '2026-fall', games, players });
//
// games:   the season's raw game docs (seasons/{seasonId}/games), each with id
// players: aggregatedPlayerStats docs ({ id, name, seasons, pitchingSeasons, career })
// Stored at siteConfig/summaries/seasons/{seasonId} (siteConfig is public-read,
// admin-write, so no rules change).

import { normalizeGames, isDecided, computeStandings } from './standings.js';
import { todayKey, timeSortValue } from './dates.js';
import { battingLine, era, QUALIFIERS, isQualifiedBatter, isQualifiedPitcher } from './stats.js';
import { parseStatSeasonId, inningsValue } from './season-ids.js';

/** Bump when the shape changes: older stored docs are rebuilt in the browser. */
export const SUMMARY_VERSION = 2;   // 2: playoffs

const TOP = 5;
const RECENT = 8;
const UPCOMING = 8;
export const MILESTONES = Object.freeze({ hits: [100, 200, 300, 400, 500], runs: [50, 100, 150, 200, 250] });

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isSub = (sid, rec) => sid.isSub || /^yes$/i.test(String(rec?.sub || ''));

/** 'W3', 'L1', 'T1' from a team's history (newest result first), '' with none. */
export function streakOf(history = []) {
  const recent = [...history].sort((a, b) => (a.dateKey === b.dateKey ? 0 : a.dateKey < b.dateKey ? 1 : -1));
  if (!recent.length) return '';
  const first = recent[0].result;
  let n = 0;
  for (const r of recent) { if (r.result !== first) break; n++; }
  return `${first}${n}`;
}

function gameCard(g, raw) {
  return {
    id: g.id, dateKey: g.dateKey || '', time: g.time || '',
    home: g.home, away: g.away,
    homeScore: g.hasScores ? g.homeScore : null, awayScore: g.hasScores ? g.awayScore : null,
    result: g.result, winner: g.winner || '', type: g.type, round: g.round || '',
    field: raw?.field || raw?.location || '',
    ifNecessary: raw?.ifNecessary === true || /if necessary/i.test(String(g.round || ''))
  };
}

const roundName = (r) => String(r || 'Playoffs').replace(/\s*\(if necessary\)\s*/i, '').trim() || 'Playoffs';

/**
 * Playoffs from the playoff games themselves (works for the series bracket
 * and the double-elimination one): rounds in date order, each with its
 * series: { id, round, teams: [a, b], wins: { a: n, b: m }, played, last, next }.
 * Series group by seriesId, else by the two teams within a round.
 */
export function buildPlayoffs(all, rawById, asOf) {
  const games = all.filter(g => g.type === 'playoff' && g.home && g.away);
  if (!games.length) return { started: false, rounds: [] };
  const series = new Map();
  for (const g of games) {
    const raw = rawById.get(g.id) || {};
    const round = roundName(g.round || raw.round);
    const key = raw.seriesId ? `s:${raw.seriesId}` : `${round}|${[g.home, g.away].sort().join('|')}`;
    if (!series.has(key)) series.set(key, { id: raw.seriesId || key, round, teams: [g.home, g.away].sort(), games: [] });
    series.get(key).games.push(g);
  }
  const out = [...series.values()].map(sr => {
    const decided = sr.games.filter(isDecided).sort(bySchedule);
    const wins = Object.fromEntries(sr.teams.map(t => [t, 0]));
    for (const g of decided) {
      const w = g.result === 'home' ? g.home : g.result === 'away' ? g.away : null;
      if (w && w in wins) wins[w]++;
    }
    const pending = sr.games.filter(g => !isDecided(g) && g.dateKey && g.dateKey >= asOf).sort(bySchedule);
    const first = sr.games.map(g => g.dateKey).filter(Boolean).sort()[0] || '';
    return {
      id: sr.id, round: sr.round, teams: sr.teams, wins, played: decided.length, first,
      last: decided.length ? gameCard(decided[decided.length - 1], rawById.get(decided[decided.length - 1].id)) : null,
      next: pending.length ? gameCard(pending[0], rawById.get(pending[0].id)) : null
    };
  });
  const rounds = [];
  for (const sr of out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))) {
    let r = rounds.find(x => x.name === sr.round);
    if (!r) { r = { name: sr.round, first: sr.first, series: [] }; rounds.push(r); }
    r.series.push(sr);
  }
  return { started: games.some(isDecided), rounds: rounds.map(({ name, series: list }) => ({ name, series: list })) };
}

const bySchedule = (a, b) => (a.dateKey === b.dateKey ? timeSortValue(a.time) - timeSortValue(b.time) : a.dateKey < b.dateKey ? -1 : 1);

// One batting / pitching line per player for a season (sub records merged in),
// and one per player for a career.
function playerLines(players, seasonId) {
  const season = [];
  const career = [];
  for (const p of players || []) {
    if (p.migrated) continue;
    const id = p.id || p.userId || '';
    const name = p.name || p.displayName || p.playerName || p.userId || id;
    const bat = { ab: 0, h: 0, bb: 0, r: 0, g: 0, team: '', bpi: null, any: false };
    const car = { ab: 0, h: 0, bb: 0, r: 0, g: 0, bpis: [] };
    for (const [rawId, s] of Object.entries(p.seasons || {})) {
      const sid = parseStatSeasonId(rawId);
      const sub = isSub(sid, s);
      car.ab += num(s.atBats); car.h += num(s.hits); car.bb += num(s.walks); car.r += num(s.runs); car.g += num(s.games);
      if (!sub && typeof s.acesBPI === 'number') car.bpis.push(s.acesBPI);
      if (sid.id !== seasonId) continue;
      bat.any = true;
      bat.ab += num(s.atBats); bat.h += num(s.hits); bat.bb += num(s.walks); bat.r += num(s.runs); bat.g += num(s.games);
      if (!sub) { bat.team = cap(s.team || p.currentTeam); if (typeof s.acesBPI === 'number') bat.bpi = s.acesBPI; }
      else if (!bat.team) bat.team = cap(s.team || p.currentTeam);
    }
    const pit = { ip: 0, r: 0, g: 0, team: '', any: false };
    const pcar = { ip: 0, r: 0 };
    for (const [rawId, s] of Object.entries(p.pitchingSeasons || {})) {
      const sid = parseStatSeasonId(rawId);
      const ip = inningsValue(s.inningsPitched);
      pcar.ip += ip; pcar.r += num(s.runsAllowed);
      if (sid.id !== seasonId) continue;
      pit.any = true; pit.ip += ip; pit.r += num(s.runsAllowed); pit.g += num(s.games);
      pit.team = pit.team || cap(s.team || p.currentTeam);
    }
    season.push({ id, name, bat, pit });
    career.push({
      id, name, team: cap(p.currentTeam),
      bat: car, pit: pcar,
      careerHits: num(p.career?.hits ?? car.h), careerRuns: num(p.career?.runs ?? car.r)
    });
  }
  return { season, career };
}

function top(list, value, { ascending = false } = {}) {
  return list
    .map(x => ({ ...x, value: value(x) }))
    .filter(x => typeof x.value === 'number' && Number.isFinite(x.value))
    .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value) || String(a.name).localeCompare(String(b.name)))
    .slice(0, TOP)
    .map(({ id, name, team, value }) => ({ id, name, team: team || '', value }));
}

/**
 * @param {object} o
 * @param {string} o.seasonId
 * @param {object[]} o.games    raw game docs for the season
 * @param {object[]} o.players  aggregatedPlayerStats docs
 * @param {string} [o.asOf]     'YYYY-MM-DD' (default today in ET)
 */
export function buildSeasonSummary({ seasonId, games = [], players = [], asOf = todayKey() }) {
  const rawById = new Map(games.map(g => [g.id, g]));
  const all = normalizeGames(games);

  // Standings (regular season, as the standings page).
  const standings = computeStandings(games, { asOf, includeScheduled: true }).map(r => ({
    rank: r.rank, team: r.team, wins: r.wins, losses: r.losses, ties: r.ties, games: r.games,
    winPct: r.winPct, gamesBack: r.gamesBack, runDiff: r.runDiff, last5: r.last5 || '',
    streak: streakOf(r.history), clinched: !!r.clinched
  }));

  // Results and the next games (any type, playoffs included).
  const decided = all.filter(isDecided);
  const recent = decided.slice().sort((a, b) => -bySchedule(a, b)).slice(0, RECENT).map(g => gameCard(g, rawById.get(g.id)));
  const upcoming = all.filter(g => !isDecided(g) && g.dateKey && g.dateKey >= asOf && g.home && g.away)
    .sort(bySchedule).slice(0, UPCOMING).map(g => gameCard(g, rawById.get(g.id)));

  // Team games played (for the per-team-game minimums).
  const teamGames = {};
  for (const g of decided) for (const t of [g.home, g.away]) if (t) teamGames[t.toLowerCase()] = (teamGames[t.toLowerCase()] || 0) + 1;
  const tg = (team) => teamGames[String(team || '').toLowerCase()] || 0;

  const { season, career } = playerLines(players, seasonId);
  const sBat = season.filter(x => x.bat.any).map(x => ({ ...x, team: x.bat.team, rec: { atBats: x.bat.ab, hits: x.bat.h, walks: x.bat.bb, runs: x.bat.r } }));
  const sPit = season.filter(x => x.pit.any).map(x => ({ ...x, team: x.pit.team }));
  const qBat = sBat.filter(x => tg(x.team) > 0 && isQualifiedBatter(x.rec, tg(x.team)));
  const qPit = sPit.filter(x => tg(x.team) > 0 && isQualifiedPitcher({ inningsPitched: x.pit.ip }, tg(x.team)));
  const cBat = career.filter(x => x.bat.ab + x.bat.bb >= QUALIFIERS.CAREER_MIN_PA);
  const cPit = career.filter(x => x.pit.ip >= QUALIFIERS.CAREER_MIN_IP);

  const leaders = {
    season: {
      BA: top(qBat, x => (x.bat.ab ? battingLine(x.rec).avg : null)),
      BPI: top(qBat, x => x.bat.bpi),
      ERA: top(qPit, x => era(x.pit.r, x.pit.ip), { ascending: true }),
      H: top(sBat, x => x.bat.h)
    },
    career: {
      BA: top(cBat, x => (x.bat.ab ? x.bat.h / x.bat.ab : null)),
      BPI: top(cBat, x => (x.bat.bpis.length ? x.bat.bpis.reduce((a, b) => a + b, 0) / x.bat.bpis.length : null)),
      ERA: top(cPit, x => era(x.pit.r, x.pit.ip), { ascending: true }),
      H: top(career, x => x.bat.h)
    },
    minimums: {
      season: { batting: `min ${QUALIFIERS.PA_PER_TEAM_GAME.toFixed(1)} PA per team game`, pitching: `min ${QUALIFIERS.IP_PER_TEAM_GAME.toFixed(1)} IP per team game` },
      career: { batting: `min ${QUALIFIERS.CAREER_MIN_PA} PA`, pitching: `min ${QUALIFIERS.CAREER_MIN_IP} IP` }
    }
  };

  // Milestone watch: within 5% of the next round number (as the old home page).
  const watch = (stat, marks) => career.map(x => {
    const cur = stat === 'hits' ? x.careerHits : x.careerRuns;
    const next = marks.find(m => cur < m);
    return next && cur >= Math.ceil(next * 0.95) ? { id: x.id, name: x.name, team: x.team, current: cur, milestone: next, gap: next - cur } : null;
  }).filter(Boolean).sort((a, b) => a.gap - b.gap || b.current - a.current).slice(0, 10);

  return {
    version: SUMMARY_VERSION,
    seasonId,
    asOf,
    builtAt: new Date().toISOString(),
    counts: {
      gamesPlayed: decided.length,
      gamesLeft: all.filter(g => !isDecided(g)).length,
      players: sBat.length,
      pitchers: sPit.length
    },
    standings,
    recent,
    upcoming,
    teamGames,
    leaders,
    playoffs: buildPlayoffs(all, rawById, asOf),
    milestones: { hits: watch('hits', MILESTONES.hits), runs: watch('runs', MILESTONES.runs) }
  };
}
