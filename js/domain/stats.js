// js/domain/stats.js
// Stat formulas, in one place. Pure functions: numbers in, numbers out.
// Display formatting (.346, 3.50) stays in js/ui/format.js (fmtAvg, fmtRate).
//
//   import { battingLine, acesBPIForSeason, bwarForSeason, era } from './js/domain/stats.js';
//
// The formulas match what the stats pipeline (aggregate-stats.html) writes to
// aggregatedPlayerStats, so a page that recomputes a number shows the same
// value the stored one has:
//   AVG  = H / AB
//   OBP  = (H + BB) / (AB + BB)            (no HBP or sacrifice flies are tracked)
//   PA   = AB + BB
//   SLG  = TB / AB, TB = 1B + 2x2B + 3x3B + 4xHR
//   OPS  = OBP + SLG
//   R/PA = R / PA
//   ERA  = runs allowed x 7 / IP             (7-inning games; all runs count)
//   acesBPI and bWAR: see their sections below.
//
// Rate stats come back unrounded. Round only for display.

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Number from a stored value: '12' -> 12, null/''/NaN -> 0. */
export function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Counting stats from a stat record, whatever its field names.
 * Reads the aggregatedPlayerStats names first, then older aliases.
 */
export function battingCounts(record = {}) {
  const r = record || {};
  return {
    games: num(r.games ?? r.G),
    atBats: num(r.atBats ?? r.AB ?? r.ab),
    hits: num(r.hits ?? r.H ?? r.h),
    runs: num(r.runs ?? r.R ?? r.r),
    walks: num(r.walks ?? r.BB ?? r.bb),
    doubles: num(r.doubles ?? r['2B']),
    triples: num(r.triples ?? r['3B']),
    homeRuns: num(r.homeRuns ?? r.HR ?? r.hr),
    rbi: num(r.rbi ?? r.RBI),
    strikeouts: num(r.strikeouts ?? r.SO ?? r.K)
  };
}

export function pitchingCounts(record = {}) {
  const r = record || {};
  return {
    games: num(r.games ?? r.G),
    inningsPitched: num(r.inningsPitched ?? r.IP),
    runsAllowed: num(r.runsAllowed ?? r.runs_allowed ?? r['runs allowed']),
    earnedRuns: num(r.earnedRuns),
    strikeouts: num(r.strikeouts),
    walks: num(r.walks),
    hits: num(r.hits),
    wins: num(r.wins),
    losses: num(r.losses),
    saves: num(r.saves)
  };
}

// ---------------------------------------------------------------------------
// Batting
// ---------------------------------------------------------------------------

const ratio = (top, bottom) => (bottom > 0 ? top / bottom : 0);

export const plateAppearances = (atBats, walks) => num(atBats) + num(walks);
export const battingAverage = (hits, atBats) => ratio(num(hits), num(atBats));
export const onBasePct = (hits, walks, atBats) => ratio(num(hits) + num(walks), num(atBats) + num(walks));
export const runsPerPA = (runs, atBats, walks) => ratio(num(runs), num(atBats) + num(walks));

/** Total bases. Hits not split into types count as singles. */
export function totalBases({ hits = 0, doubles = 0, triples = 0, homeRuns = 0 } = {}) {
  const singles = Math.max(0, num(hits) - num(doubles) - num(triples) - num(homeRuns));
  return singles + 2 * num(doubles) + 3 * num(triples) + 4 * num(homeRuns);
}

export const sluggingPct = (counts) => ratio(totalBases(counts), num(counts?.atBats));

/**
 * Every batting rate for a stat record:
 *   { ...counts, pa, avg, obp, slg, ops, runsPerPA, hasHitTypes }
 * hasHitTypes is false when the record has no 2B/3B (most seasons before
 * 2026), in which case SLG treats every non-HR hit as a single.
 */
export function battingLine(record) {
  const c = battingCounts(record);
  const pa = c.atBats + c.walks;
  const obp = onBasePct(c.hits, c.walks, c.atBats);
  const slg = sluggingPct(c);
  return {
    ...c,
    pa,
    avg: battingAverage(c.hits, c.atBats),
    obp,
    slg,
    ops: obp + slg,
    runsPerPA: runsPerPA(c.runs, c.atBats, c.walks),
    hasHitTypes: c.doubles > 0 || c.triples > 0
  };
}

// ---------------------------------------------------------------------------
// Pitching
// ---------------------------------------------------------------------------

export const GAME_INNINGS = 7;

/** ERA on 7 innings, from runs allowed (the league doesn't track earned runs). null with no innings. */
export function era(runsAllowed, inningsPitched, { gameInnings = GAME_INNINGS } = {}) {
  const ip = num(inningsPitched);
  return ip > 0 ? (num(runsAllowed) * gameInnings) / ip : null;
}

/** Runs allowed per inning x 7, from a stat record. null with no innings. */
export function pitchingLine(record) {
  const c = pitchingCounts(record);
  return { ...c, era: era(c.runsAllowed, c.inningsPitched) };
}

// ---------------------------------------------------------------------------
// Qualifiers
// ---------------------------------------------------------------------------

export const QUALIFIERS = Object.freeze({
  PA_PER_TEAM_GAME: 2,   // season AVG/OBP leaders: PA >= 2 x team games played
  IP_PER_TEAM_GAME: 2,   // season ERA leaders: IP >= 2 x team games played
  BWAR_MIN_PA: 20,       // bWAR is 0 below this
  CAREER_MIN_PA: 150,    // career AVG/OBP leaders
  CAREER_MIN_IP: 30,     // combined-season ERA (the old pitching page's 30 IP)
  ALL_TIME_MIN_AB: 10    // batting page all-time rate leaders
});

export function minPAForTeamGames(teamGames) {
  return num(teamGames) * QUALIFIERS.PA_PER_TEAM_GAME;
}

export function isQualifiedBatter(record, teamGames) {
  const c = battingCounts(record);
  return c.atBats + c.walks >= minPAForTeamGames(teamGames);
}

export function isQualifiedPitcher(record, teamGames) {
  return pitchingCounts(record).inningsPitched >= num(teamGames) * QUALIFIERS.IP_PER_TEAM_GAME;
}

/** Text for a leaderboard footnote: 'Min 2.0 PA per team game'. */
export function qualifierLabel(kind = 'batting') {
  return kind === 'pitching'
    ? `Min ${QUALIFIERS.IP_PER_TEAM_GAME.toFixed(1)} IP per team game`
    : `Min ${QUALIFIERS.PA_PER_TEAM_GAME.toFixed(1)} PA per team game`;
}

// ---------------------------------------------------------------------------
// acesBPI
// ---------------------------------------------------------------------------
// A season score centered on 50: 50 + 10 x the weighted z-score of
//   50% AVG, 10% OBP, 30% R/PA, 10% games played,
// each z-score against that season's non-sub players with at least one AB
// (population standard deviation). Subs get no acesBPI.

export const ACES_BPI_WEIGHTS = Object.freeze({
  battingAverage: 0.5,
  onBasePercentage: 0.1,
  runsPerPA: 0.3,
  games: 0.1
});

const BPI_FIELDS = Object.keys(ACES_BPI_WEIGHTS);

function bpiInputs(record) {
  const c = battingCounts(record);
  return {
    battingAverage: battingAverage(c.hits, c.atBats),
    onBasePercentage: onBasePct(c.hits, c.walks, c.atBats),
    runsPerPA: runsPerPA(c.runs, c.atBats, c.walks),
    games: c.games,
    atBats: c.atBats
  };
}

const isSubRecord = (record) => String(record?.sub || '').toLowerCase() === 'yes' || record?.isSub === true;

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdDev(values, m) {
  if (values.length < 2) return 1;
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length) || 1;
}

/**
 * League means and standard deviations for one season.
 * @param {object[]} records  season stat records (counts) for every player
 */
export function acesBPIBaseline(records) {
  const pool = records.filter((r) => !isSubRecord(r)).map(bpiInputs).filter((p) => p.atBats > 0);
  const baseline = { players: pool.length };
  for (const field of BPI_FIELDS) {
    const values = pool.map((p) => p[field]);
    const m = mean(values);
    baseline[field] = { mean: m, stdDev: stdDev(values, m) };
  }
  return baseline;
}

/** One player's acesBPI against a season baseline. Subs get null. */
export function acesBPI(record, baseline) {
  if (isSubRecord(record)) return null;
  const p = bpiInputs(record);
  let z = 0;
  for (const field of BPI_FIELDS) {
    const { mean: m, stdDev: sd } = baseline[field];
    z += (sd === 0 ? 0 : (p[field] - m) / sd) * ACES_BPI_WEIGHTS[field];
  }
  return 50 + 10 * z;
}

/** acesBPI for every record of a season, in the same order. */
export function acesBPIForSeason(records) {
  const baseline = acesBPIBaseline(records);
  return records.map((r) => acesBPI(r, baseline));
}

// ---------------------------------------------------------------------------
// bWAR (simplified)
// ---------------------------------------------------------------------------
// wOBA = (0.30 BB + 0.70 non-HR hits + 1.40 HR) / PA
// Replacement = 50% of the season's PA-weighted league wOBA.
// bWAR = (wOBA - replacement) x PA / RPW, RPW = 0.5 x league runs per game.
// Below 20 PA, or negative, bWAR is 0.

export const BWAR_WEIGHTS = Object.freeze({
  wBB: 0.3,
  wFlat: 0.7,      // 1B, 2B and 3B alike (hit types aren't in every season)
  wHR: 1.4,
  replPct: 50,
  minPA: QUALIFIERS.BWAR_MIN_PA,
  rpwMul: 0.5,
  defaultRunsPerGame: 14
});

/** Total runs per completed game (both teams), from game docs. */
export function leagueRunsPerGame(games) {
  let runs = 0;
  let count = 0;
  for (const g of games || []) {
    if (!g?.winner || String(g.winner).trim() === '') continue;
    runs += num(g.homeScore ?? g['home score']) + num(g.awayScore ?? g['away score']);
    count++;
  }
  return count > 0 ? runs / count : null;
}

export function wOBA(record, weights = BWAR_WEIGHTS) {
  const c = battingCounts(record);
  const pa = c.atBats + c.walks;
  if (pa <= 0) return 0;
  const nonHR = Math.max(0, c.hits - c.homeRuns);
  return (weights.wBB * c.walks + weights.wFlat * nonHR + weights.wHR * c.homeRuns) / pa;
}

/**
 * bWAR for every record of a season, in the same order.
 * @param {object[]} records          season stat records
 * @param {{ runsPerGame?: number }}   league runs per game (leagueRunsPerGame); default 14
 * @returns {{ values: number[], leagueWOBA: number, replacementWOBA: number, runsPerWin: number }}
 */
export function bwarForSeason(records, { runsPerGame = null, weights = BWAR_WEIGHTS } = {}) {
  const rows = records.map((r) => {
    const c = battingCounts(r);
    return { pa: c.atBats + c.walks, woba: wOBA(r, weights) };
  });
  const counted = rows.filter((r) => r.pa > 0);
  const totalPA = counted.reduce((s, r) => s + r.pa, 0);
  const leagueWOBA = totalPA > 0 ? counted.reduce((s, r) => s + r.woba * r.pa, 0) / totalPA : 0;
  const replacementWOBA = leagueWOBA * (weights.replPct / 100);
  const runsPerWin = (runsPerGame ?? weights.defaultRunsPerGame) * weights.rpwMul;
  const values = rows.map((r) => {
    if (r.pa <= 0 || r.pa < weights.minPA) return 0;
    const raw = runsPerWin > 0 ? ((r.woba - replacementWOBA) * r.pa) / runsPerWin : 0;
    return Math.max(0, raw);
  });
  return { values, leagueWOBA, replacementWOBA, runsPerWin };
}

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/** Round half away from zero to `digits` places (0.0005 -> 0.001). */
export function roundTo(value, digits = 3) {
  const n = num(value);
  const f = 10 ** digits;
  return Math.sign(n) * Math.round(Math.abs(n) * f + Number.EPSILON) / f;
}
