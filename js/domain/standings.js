// js/domain/standings.js
// Regular-season standings: records, the tiebreaker chain, games back,
// last 5, games left, strength of schedule and the "seed locked" flag.
//
//   import { computeStandings } from './js/domain/standings.js';
//   const rows = computeStandings(rawGames);            // as of today (ET)
//   const rows = computeStandings(rawGames, { asOf: '2026-07-31' });
//
// Takes the game docs as getSeasonGames returns them (seasons/{id}/games),
// in either field style (homeTeamName/homeScore or 'home team'/'home score').
//
// Order:
//   1. Win %, ties counted as half a win: (W + T/2) / GP
//   2. Exactly two teams tied: head-to-head win % (ties ignored)
//   3. Three or more tied, or head-to-head even: fewest runs allowed
//   4. Run differential
// Teams still level after all four keep the order they first appear in the
// games (the same fallback the old pages had).
//
// What counts: regular-season games with a winner, dated today or earlier in
// ET (a game with no date counts). This is current-season.html's rule.
// One deliberate difference from the old pages: a winner stored as a team ID
// ('master_batters', all of 2019 Summer) counts; the old pages dropped it.
//
// Replaces the standings code on current-season, playoffs, bracket,
// projections, playoff-clinching, season, recap and commissioner-hub.

import { toDateKey, todayKey } from './dates.js';

export const WIN_PCT_EPSILON = 0.00001;

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const scoreOf = (v) => parseInt(v, 10) || 0;

function hasScore(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(parseInt(v, 10));
}

/**
 * Game doc -> the one shape the domain code reads:
 *   { id, home, away, homeScore, awayScore, result: 'home'|'away'|'tie'|null,
 *     winner, type: 'regular'|'playoff'|<other gameType>, dateKey, time,
 *     status, round, unmatchedWinner }
 * unmatchedWinner is the raw winner when it names neither team (data to fix).
 * Already-normalized games pass through.
 */
export function normalizeGame(raw) {
  if (!raw || raw.__normalized) return raw;

  const home = raw.homeTeamName || raw['home team'] || cap(raw.homeTeamId) || '';
  const away = raw.awayTeamName || raw['away team'] || cap(raw.awayTeamId) || '';

  let type;
  if (raw.game_type === 'Playoff' || String(raw.gameType || '').toLowerCase() === 'playoff') type = 'playoff';
  else if (raw.gameType) type = String(raw.gameType).toLowerCase();
  else type = 'regular';

  const winnerRaw = raw.winner === null || raw.winner === undefined ? '' : String(raw.winner).trim();
  const w = winnerRaw.toLowerCase();
  let result = null;
  // Winner may be the team name in any case, or the team ID (2019 docs store
  // 'kpmg', 'master_batters'); both count.
  const homeId = String(raw.homeTeamId || '').toLowerCase();
  const awayId = String(raw.awayTeamId || '').toLowerCase();
  if (w) {
    if (w === 'tie') result = 'tie';
    else if ((home && w === home.toLowerCase()) || (homeId && w === homeId)) result = 'home';
    else if ((away && w === away.toLowerCase()) || (awayId && w === awayId)) result = 'away';
  }

  const homeScoreRaw = raw.homeScore !== undefined ? raw.homeScore : raw['home score'];
  const awayScoreRaw = raw.awayScore !== undefined ? raw.awayScore : raw['away score'];

  return {
    __normalized: true,
    id: raw.id || '',
    home,
    away,
    homeScore: scoreOf(homeScoreRaw),
    awayScore: scoreOf(awayScoreRaw),
    hasScores: hasScore(homeScoreRaw) && hasScore(awayScoreRaw),
    result,
    winner: result === 'tie' ? 'Tie' : result === 'home' ? home : result === 'away' ? away : '',
    unmatchedWinner: w && !result ? winnerRaw : '',
    type,
    dateKey: toDateKey(raw.date),
    time: raw.time || '',
    status: raw.status || '',
    round: raw.round || ''
  };
}

export function normalizeGames(games) {
  return (games || []).map(normalizeGame).filter(Boolean);
}

/** Has a winner (any non-empty winner, as the old pages counted). */
export const isDecided = (g) => !!g.winner || !!g.unmatchedWinner;

/** Completed regular-season games as of a day: these are what standings count. */
export function standingsGames(games, { asOf = todayKey() } = {}) {
  return normalizeGames(games).filter((g) =>
    g.type === 'regular' && isDecided(g) && (!g.dateKey || g.dateKey <= asOf));
}

/** Regular-season games with no winner yet (any date). */
export function remainingGames(games) {
  return normalizeGames(games).filter((g) => g.type === 'regular' && !isDecided(g));
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

function blankTeam(name) {
  return {
    team: name,
    wins: 0, losses: 0, ties: 0, games: 0,
    runsFor: 0, runsAgainst: 0,
    h2h: {},
    history: []
  };
}

/**
 * Team records from completed games (already filtered), in first-appearance
 * order, before sorting. Runs count from every completed game, including one
 * whose winner names neither team; W/L/T only from recognised winners.
 */
export function buildRecords(completedGames) {
  const teams = new Map();
  const get = (name) => {
    if (!teams.has(name)) teams.set(name, blankTeam(name));
    return teams.get(name);
  };

  for (const g of normalizeGames(completedGames)) {
    const h = get(g.home);
    const a = get(g.away);
    h.runsFor += g.homeScore; h.runsAgainst += g.awayScore;
    a.runsFor += g.awayScore; a.runsAgainst += g.homeScore;
    h.h2h[g.away] ??= { wins: 0, losses: 0, ties: 0 };
    a.h2h[g.home] ??= { wins: 0, losses: 0, ties: 0 };

    if (g.result === 'tie') {
      h.ties++; a.ties++;
      h.h2h[g.away].ties++; a.h2h[g.home].ties++;
      h.history.push({ dateKey: g.dateKey, result: 'T' });
      a.history.push({ dateKey: g.dateKey, result: 'T' });
    } else if (g.result === 'home' || g.result === 'away') {
      const [win, lose, winName, loseName] = g.result === 'home' ? [h, a, g.home, g.away] : [a, h, g.away, g.home];
      win.wins++; lose.losses++;
      win.h2h[loseName].wins++; lose.h2h[winName].losses++;
      win.history.push({ dateKey: g.dateKey, result: 'W' });
      lose.history.push({ dateKey: g.dateKey, result: 'L' });
    }
  }

  for (const t of teams.values()) {
    t.games = t.wins + t.losses + t.ties;
    t.winPct = winPct(t);
    t.runDiff = t.runsFor - t.runsAgainst;
  }
  return [...teams.values()];
}

/** (W + T/2) / GP; 0 with no games. */
export function winPct({ wins = 0, losses = 0, ties = 0 }) {
  const gp = wins + losses + ties;
  return gp > 0 ? (wins + ties * 0.5) / gp : 0;
}

/** Head-to-head win % of a against b (ties ignored); 0 with no decided games. */
export function headToHeadPct(a, b) {
  const r = a.h2h?.[b.team];
  if (!r) return 0;
  const decided = r.wins + r.losses;
  return decided > 0 ? r.wins / decided : 0;
}

/** < 0 when a wins the head-to-head, > 0 when b does, 0 when even or unplayed. */
export function compareHeadToHead(a, b) {
  if (!a.h2h?.[b.team] || !b.h2h?.[a.team]) return 0;
  return headToHeadPct(b, a) - headToHeadPct(a, b);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const byRunsAgainstThenDiff = (a, b) => (a.runsAgainst - b.runsAgainst) || (b.runDiff - a.runDiff);

function decidedBy(a, b, h2hUsed) {
  if (h2hUsed && compareHeadToHead(a, b) !== 0) return 'head-to-head';
  if (a.runsAgainst !== b.runsAgainst) return 'runs allowed';
  if (a.runDiff !== b.runDiff) return 'run differential';
  return 'unbroken';
}

/**
 * Sort records with the tiebreaker chain. Returns a new array; each row gets
 * tiedWith (other teams at the same win %) and tiebreak (what separated it
 * from the team below it in the same group, or null).
 */
export function sortStandings(records) {
  const byPct = [...records].sort((a, b) => b.winPct - a.winPct); // stable

  const groups = [];
  for (const t of byPct) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].winPct - t.winPct) <= WIN_PCT_EPSILON) last.push(t);
    else groups.push([t]);
  }

  const out = [];
  for (const group of groups) {
    let ordered;
    const h2hUsed = group.length === 2;
    if (group.length === 1) ordered = group;
    else if (h2hUsed) {
      const [a, b] = group;
      const h = compareHeadToHead(a, b);
      ordered = h > 0 ? [b, a] : h < 0 ? [a, b] : [...group].sort(byRunsAgainstThenDiff);
    } else {
      ordered = [...group].sort(byRunsAgainstThenDiff);
    }
    ordered.forEach((t, i) => {
      out.push({
        ...t,
        tiedWith: group.length > 1 ? group.filter((o) => o !== t).map((o) => o.team) : [],
        tiebreak: i < ordered.length - 1 ? decidedBy(t, ordered[i + 1], h2hUsed) : null
      });
    });
  }
  return out;
}

/** Games behind the leader: ((leader W - W) + (L - leader L)) / 2. */
export function gamesBack(row, leader) {
  if (!leader) return 0;
  return ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2;
}

// ---------------------------------------------------------------------------
// Extras current-season shows
// ---------------------------------------------------------------------------

/** Last n results as 'W-L' (ties left out of the string), '\u2014' with none. */
export function lastN(history, n = 5) {
  const recent = [...history].sort((a, b) => (a.dateKey === b.dateKey ? 0 : a.dateKey < b.dateKey ? 1 : -1)).slice(0, n);
  if (!recent.length) return '\u2014';
  const w = recent.filter((r) => r.result === 'W').length;
  const l = recent.filter((r) => r.result === 'L').length;
  return `${w}-${l}`;
}

/**
 * Strength of schedule so far: opponents' combined W/(W+L), leaving out their
 * games against this team. Counted once per game played, as current-season does.
 */
export function strengthOfSchedule(teamName, completedGames, records) {
  const games = normalizeGames(completedGames).filter((g) => g.home === teamName || g.away === teamName);
  if (!games.length) return 0;
  let w = 0;
  let l = 0;
  for (const g of games) {
    const opp = g.home === teamName ? g.away : g.home;
    const rec = records.find((r) => r.team === opp);
    if (!rec) continue;
    let ow = rec.wins;
    let ol = rec.losses;
    for (const x of games) {
      if (!((x.home === opp && x.away === teamName) || (x.away === opp && x.home === teamName))) continue;
      if (x.winner === opp) ow--;
      else if (x.result !== 'tie' && isDecided(x)) ol--;
    }
    w += ow;
    l += ol;
  }
  return w + l > 0 ? w / (w + l) : 0;
}

/** Average win % (W/(W+L)) of opponents in games still to play after asOf. */
export function remainingStrength(teamName, allGames, records, { asOf = todayKey() } = {}) {
  const left = normalizeGames(allGames).filter((g) =>
    g.type === 'regular' && !isDecided(g) && !!g.dateKey && g.dateKey > asOf &&
    (g.home === teamName || g.away === teamName));
  let total = 0;
  let count = 0;
  for (const g of left) {
    const rec = records.find((r) => r.team === (g.home === teamName ? g.away : g.home));
    if (!rec) continue;
    const d = rec.wins + rec.losses;
    total += d > 0 ? rec.wins / d : 0;
    count++;
  }
  return count ? total / count : 0;
}

/**
 * Seed locked: no team below can catch this team and it can't catch any team
 * above, even with every remaining game going the wrong way. Equal best/worst
 * win % counts as locked only when head-to-head (or runs allowed, which can
 * only go up) already settles it. Two-team ties only. current-season's rule;
 * the full scenario engine stays on playoff-clinching for now.
 */
export function isSeedLocked(sorted, idx) {
  const team = sorted[idx];
  const total = (t) => t.wins + t.losses + t.ties + t.remainingCount;
  const minPct = (t) => (total(t) > 0 ? (t.wins + t.ties * 0.5) / total(t) : 0);
  const maxPct = (t) => (total(t) > 0 ? (t.wins + t.remainingCount + t.ties * 0.5) / total(t) : 0);
  const EPS = 0.0001;

  const cantFall = sorted.slice(idx + 1).every((other) => {
    const diff = minPct(team) - maxPct(other);
    if (diff > EPS) return true;
    if (Math.abs(diff) <= EPS) {
      const h = compareHeadToHead(team, other);
      if (h < 0) return true;
      if (h > 0) return false;
      if (other.runsAgainst > team.runsAgainst) return true;
    }
    return false;
  });

  const cantRise = sorted.slice(0, idx).every((other) => {
    const diff = maxPct(team) - minPct(other);
    if (diff < -EPS) return true;
    if (Math.abs(diff) <= EPS) {
      const h = compareHeadToHead(team, other);
      if (h > 0) return true;
      if (h < 0) return false;
      if (team.runsAgainst > other.runsAgainst) return true;
    }
    return false;
  });

  return cantFall && cantRise;
}

// ---------------------------------------------------------------------------
// The standings table
// ---------------------------------------------------------------------------

/**
 * Full regular-season standings.
 * @param {object[]} games  every game of the season (raw docs or normalized)
 * @param {object} [options]
 * @param {string} [options.asOf]          'YYYY-MM-DD'; default today in ET
 * @param {boolean} [options.extras=true]  last5, games left, SOS, seed locked
 * @param {boolean} [options.includeScheduled=false]  add 0-0 rows for teams
 *        that are on the schedule but haven't completed a game
 * @returns {object[]} rows: { rank, team, wins, losses, ties, games, winPct,
 *   runsFor, runsAgainst, runDiff, gamesBack, tiedWith, tiebreak, h2h,
 *   last5, remainingCount, scheduleStrength, remainingScheduleStrength, clinched }
 */
export function computeStandings(games, { asOf = todayKey(), extras = true, includeScheduled = false } = {}) {
  const all = normalizeGames(games);
  const completed = standingsGames(all, { asOf });
  const records = buildRecords(completed);

  if (includeScheduled) {
    const seen = new Set(records.map((r) => r.team));
    for (const g of all) {
      for (const name of [g.home, g.away]) {
        if (name && name !== 'TBD' && !seen.has(name)) {
          seen.add(name);
          records.push({ ...blankTeam(name), winPct: 0, runDiff: 0 });
        }
      }
    }
  }

  const sorted = sortStandings(records);
  const leader = sorted[0];
  sorted.forEach((row, i) => {
    row.rank = i + 1;
    row.gamesBack = gamesBack(row, leader);
  });

  if (extras) {
    const left = remainingGames(all);
    for (const row of sorted) {
      row.last5 = lastN(row.history, 5);
      row.remainingCount = left.filter((g) => g.home === row.team || g.away === row.team).length;
      row.scheduleStrength = strengthOfSchedule(row.team, completed, records);
      row.remainingScheduleStrength = remainingStrength(row.team, all, records, { asOf });
    }
    sorted.forEach((row, i) => { row.clinched = isSeedLocked(sorted, i); });
  }
  return sorted;
}

/** Teams in standings order, for seeding: ['Teal', 'Gold', ...]. */
export function seedOrder(games, options) {
  return computeStandings(games, { ...options, extras: false }).map((r) => r.team);
}
