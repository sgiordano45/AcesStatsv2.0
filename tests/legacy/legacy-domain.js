// tests/legacy/legacy-domain.js
// Copies of the OLD page code, kept only so tests/domain.html can compare old
// and new results. Logic is copied as written on each page (including its own
// game mapping and filtering, which differ); only console.log lines, rendering
// and the page's global `today` were changed (today is passed in as `now`).
// Never import this from a real page. Delete with the legacy pages in Phase 4.

const capitalize = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

// ===========================================================================
// Dates
// ===========================================================================

// current-season.html parseGameDate (the local-components one)
export function csParseGameDate(dateStr) {
  if (!dateStr) return new Date(0);
  const s = String(dateStr).split('T')[0];
  const isoParts = s.split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    return new Date(Number(isoParts[0]), Number(isoParts[1]) - 1, Number(isoParts[2]));
  }
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    return new Date(Number(slashParts[2]), Number(slashParts[0]) - 1, Number(slashParts[1]));
  }
  return new Date(dateStr);
}

// current-season.html's game.date mapping (Timestamp -> toLocaleDateString)
export function csDateString(raw) {
  if (raw && typeof raw === 'object' && raw.seconds) return new Date(raw.seconds * 1000).toLocaleDateString('en-US');
  if (raw && typeof raw === 'object' && typeof raw.toDate === 'function') return raw.toDate().toLocaleDateString('en-US');
  if (raw && typeof raw === 'string') return raw;
  return '';
}

// The 23 UTC-unsafe pages (projections, weekend-preview, playoff-clinching,
// current-season-team...): parseGameDate = new Date(dateStr)
export function utcParseGameDate(dateStr) {
  return new Date(dateStr);
}

// current-season.html parseTimeMinutes
export function csParseTimeMinutes(timeStr) {
  if (!timeStr) return 9999;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 9999;
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

// ===========================================================================
// Standings
// ===========================================================================
// Each runner: (rawGames, now) -> [{ team, wins, losses, ties, runsAgainst, runDiff }]
// in that page's order.

const out = (list) => list.map((t) => ({
  team: t.name, wins: t.wins, losses: t.losses, ties: t.ties,
  runsFor: t.runsFor, runsAgainst: t.runsAgainst, runDiff: t.runsFor - t.runsAgainst
}));

function endOfDay(now) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

// --- shared old pieces ------------------------------------------------------

function h2hTally(games) {
  const teamStats = {};
  games.forEach((game) => {
    const homeTeam = game['home team'];
    const awayTeam = game['away team'];
    const winner = game.winner;
    const homeScore = parseInt(game['home score']) || 0;
    const awayScore = parseInt(game['away score']) || 0;
    if (!teamStats[homeTeam]) teamStats[homeTeam] = { name: homeTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, h2h: {} };
    if (!teamStats[awayTeam]) teamStats[awayTeam] = { name: awayTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, h2h: {} };
    teamStats[homeTeam].runsFor += homeScore;
    teamStats[homeTeam].runsAgainst += awayScore;
    teamStats[awayTeam].runsFor += awayScore;
    teamStats[awayTeam].runsAgainst += homeScore;
    if (!teamStats[homeTeam].h2h[awayTeam]) teamStats[homeTeam].h2h[awayTeam] = { wins: 0, losses: 0, ties: 0 };
    if (!teamStats[awayTeam].h2h[homeTeam]) teamStats[awayTeam].h2h[homeTeam] = { wins: 0, losses: 0, ties: 0 };
    if (winner === 'Tie') {
      teamStats[homeTeam].ties++; teamStats[awayTeam].ties++;
      teamStats[homeTeam].h2h[awayTeam].ties++; teamStats[awayTeam].h2h[homeTeam].ties++;
    } else if (winner === homeTeam) {
      teamStats[homeTeam].wins++; teamStats[awayTeam].losses++;
      teamStats[homeTeam].h2h[awayTeam].wins++; teamStats[awayTeam].h2h[homeTeam].losses++;
    } else if (winner === awayTeam) {
      teamStats[awayTeam].wins++; teamStats[homeTeam].losses++;
      teamStats[awayTeam].h2h[homeTeam].wins++; teamStats[homeTeam].h2h[awayTeam].losses++;
    }
  });
  return teamStats;
}

function compareHeadToHead(teamA, teamB) {
  const aVsB = teamA.h2h[teamB.name];
  const bVsA = teamB.h2h[teamA.name];
  if (!aVsB || !bVsA) return 0;
  const aH2HWinPct = (aVsB.wins + aVsB.losses) > 0 ? aVsB.wins / (aVsB.wins + aVsB.losses) : 0;
  const bH2HWinPct = (bVsA.wins + bVsA.losses) > 0 ? bVsA.wins / (bVsA.wins + bVsA.losses) : 0;
  return bH2HWinPct - aH2HWinPct;
}

// --- current-season.html ----------------------------------------------------

function csMap(g) {
  return {
    'home team': g.homeTeamName || g['home team'] || capitalize(g.homeTeamId) || '',
    'away team': g.awayTeamName || g['away team'] || capitalize(g.awayTeamId) || '',
    'home score': g.homeScore !== undefined ? g.homeScore : (g['home score'] || null),
    'away score': g.awayScore !== undefined ? g.awayScore : (g['away score'] || null),
    winner: capitalize(g.winner),
    game_type: g.game_type === 'Playoff' ? 'Playoff' :
      g.gameType === 'regular' ? 'Regular' :
      g.gameType === 'playoff' ? 'Playoff' :
      capitalize(g.gameType) || 'Regular',
    date: csDateString(g.date)
  };
}

export function currentSeason(rawGames, now = new Date()) {
  const today = endOfDay(now);
  const games = rawGames.map(csMap);
  const regularGames = games.filter((g) =>
    csParseGameDate(g.date) < today && g.winner && g.winner.trim() !== '' && g.game_type === 'Regular');
  const teamStats = h2hTally(regularGames);
  const prelim = Object.values(teamStats).map((team) => {
    const totalGames = team.wins + team.losses + team.ties;
    team.winPct = totalGames > 0 ? (team.wins + team.ties * 0.5) / totalGames : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    return team;
  });
  const sorted = prelim.sort((a, b) => {
    if (Math.abs(a.winPct - b.winPct) > 0.00001) return b.winPct - a.winPct;
    const teamsAtSamePct = prelim.filter((t) => Math.abs(t.winPct - a.winPct) <= 0.00001);
    if (teamsAtSamePct.length === 2) {
      const h2hComp = compareHeadToHead(a, b);
      if (h2hComp !== 0) return h2hComp;
    }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDifferential - a.runDifferential;
  });
  return out(sorted);
}

// current-season.html extras, for checking the new table's extra columns.
export function currentSeasonExtras(rawGames, now = new Date()) {
  const today = endOfDay(now);
  const games = rawGames.map(csMap);
  const regularGames = games.filter((g) =>
    csParseGameDate(g.date) < today && g.winner && g.winner.trim() !== '' && g.game_type === 'Regular');
  const teamStats = {};
  regularGames.forEach((game) => {
    const homeTeam = game['home team'];
    const awayTeam = game['away team'];
    const winner = game.winner;
    for (const t of [homeTeam, awayTeam]) {
      if (!teamStats[t]) teamStats[t] = { name: t, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, h2h: {}, gameHistory: [] };
    }
    const homeScore = parseInt(game['home score']) || 0;
    const awayScore = parseInt(game['away score']) || 0;
    teamStats[homeTeam].runsFor += homeScore; teamStats[homeTeam].runsAgainst += awayScore;
    teamStats[awayTeam].runsFor += awayScore; teamStats[awayTeam].runsAgainst += homeScore;
    if (!teamStats[homeTeam].h2h[awayTeam]) teamStats[homeTeam].h2h[awayTeam] = { wins: 0, losses: 0, ties: 0 };
    if (!teamStats[awayTeam].h2h[homeTeam]) teamStats[awayTeam].h2h[homeTeam] = { wins: 0, losses: 0, ties: 0 };
    if (winner === 'Tie') {
      teamStats[homeTeam].ties++; teamStats[awayTeam].ties++;
      teamStats[homeTeam].h2h[awayTeam].ties++; teamStats[awayTeam].h2h[homeTeam].ties++;
      teamStats[homeTeam].gameHistory.push({ date: game.date, result: 'T' });
      teamStats[awayTeam].gameHistory.push({ date: game.date, result: 'T' });
    } else if (winner === homeTeam) {
      teamStats[homeTeam].wins++; teamStats[awayTeam].losses++;
      teamStats[homeTeam].h2h[awayTeam].wins++; teamStats[awayTeam].h2h[homeTeam].losses++;
      teamStats[homeTeam].gameHistory.push({ date: game.date, result: 'W' });
      teamStats[awayTeam].gameHistory.push({ date: game.date, result: 'L' });
    } else if (winner === awayTeam) {
      teamStats[awayTeam].wins++; teamStats[homeTeam].losses++;
      teamStats[awayTeam].h2h[homeTeam].wins++; teamStats[homeTeam].h2h[awayTeam].losses++;
      teamStats[awayTeam].gameHistory.push({ date: game.date, result: 'W' });
      teamStats[homeTeam].gameHistory.push({ date: game.date, result: 'L' });
    }
  });

  const prelim = Object.values(teamStats).map((team) => {
    const totalGames = team.wins + team.losses + team.ties;
    team.winPct = totalGames > 0 ? (team.wins + team.ties * 0.5) / totalGames : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    return team;
  });

  function calculateScheduleStrength(teamName, gs, allStandings) {
    const teamGames = gs.filter((game) => game['home team'] === teamName || game['away team'] === teamName);
    if (teamGames.length === 0) return 0;
    let totalOpponentWins = 0;
    let totalOpponentLosses = 0;
    teamGames.forEach((game) => {
      const opponent = game['home team'] === teamName ? game['away team'] : game['home team'];
      const oppStanding = allStandings.find((team) => team.name === opponent);
      if (oppStanding) {
        const oppGamesVsTeam = gs.filter((g) =>
          (g['home team'] === opponent && g['away team'] === teamName) ||
          (g['away team'] === opponent && g['home team'] === teamName));
        let w = oppStanding.wins;
        let l = oppStanding.losses;
        oppGamesVsTeam.forEach((g) => {
          if (g.winner === opponent) w--;
          else if (g.winner !== 'Tie' && g.winner !== '') l--;
        });
        totalOpponentWins += w;
        totalOpponentLosses += l;
      }
    });
    const d = totalOpponentWins + totalOpponentLosses;
    return d > 0 ? totalOpponentWins / d : 0;
  }

  function calculateRemainingScheduleStrength(teamName, gs, allStandings) {
    const remaining = gs.filter((game) => {
      const isFuture = csParseGameDate(game.date) >= today;
      const noWinner = !game.winner || game.winner.trim() === '';
      return isFuture && noWinner && game.game_type === 'Regular' &&
        (game['home team'] === teamName || game['away team'] === teamName);
    });
    if (remaining.length === 0) return 0;
    let total = 0;
    let count = 0;
    remaining.forEach((game) => {
      const opponent = game['home team'] === teamName ? game['away team'] : game['home team'];
      const s = allStandings.find((team) => team.name === opponent);
      if (s) {
        const d = s.wins + s.losses;
        total += d > 0 ? s.wins / d : 0;
        count++;
      }
    });
    return count > 0 ? total / count : 0;
  }

  prelim.forEach((team) => {
    team.scheduleStrength = calculateScheduleStrength(team.name, regularGames, prelim);
    team.remainingScheduleStrength = calculateRemainingScheduleStrength(team.name, games, prelim);
  });

  const sorted = prelim.sort((a, b) => {
    if (Math.abs(a.winPct - b.winPct) > 0.00001) return b.winPct - a.winPct;
    const same = prelim.filter((t) => Math.abs(t.winPct - a.winPct) <= 0.00001);
    if (same.length === 2) {
      const h = compareHeadToHead(a, b);
      if (h !== 0) return h;
    }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDifferential - a.runDifferential;
  });

  sorted.forEach((team) => {
    const history = (team.gameHistory || []).slice()
      .sort((a, b) => csParseGameDate(b.date) - csParseGameDate(a.date)).slice(0, 5);
    const w = history.filter((g) => g.result === 'W').length;
    const l = history.filter((g) => g.result === 'L').length;
    team.last5 = history.length > 0 ? `${w}-${l}` : '\u2014';
  });

  const regularRemaining = games.filter((g) => (!g.winner || g.winner.trim() === '') && g.game_type === 'Regular');
  sorted.forEach((team) => {
    team.remainingCount = regularRemaining.filter((g) => g['home team'] === team.name || g['away team'] === team.name).length;
  });

  sorted.forEach((team, idx) => {
    const teamTotal = team.wins + team.losses + team.ties + team.remainingCount;
    const teamMinWinPct = teamTotal > 0 ? (team.wins + team.ties * 0.5) / teamTotal : 0;
    const teamMaxWinPct = teamTotal > 0 ? (team.wins + team.remainingCount + team.ties * 0.5) / teamTotal : 0;
    const cantFall = idx < sorted.length - 1
      ? sorted.slice(idx + 1).every((other) => {
        const otherTotal = other.wins + other.losses + other.ties + other.remainingCount;
        const otherMax = otherTotal > 0 ? (other.wins + other.remainingCount + other.ties * 0.5) / otherTotal : 0;
        if (teamMinWinPct - otherMax > 0.0001) return true;
        if (Math.abs(teamMinWinPct - otherMax) <= 0.0001) {
          const h = compareHeadToHead(team, other);
          if (h < 0) return true;
          if (h > 0) return false;
          if (other.runsAgainst > team.runsAgainst) return true;
        }
        return false;
      })
      : true;
    const cantRise = idx > 0
      ? sorted.slice(0, idx).every((other) => {
        const otherTotal = other.wins + other.losses + other.ties + other.remainingCount;
        const otherMin = otherTotal > 0 ? (other.wins + other.ties * 0.5) / otherTotal : 0;
        if (teamMaxWinPct - otherMin < -0.0001) return true;
        if (Math.abs(teamMaxWinPct - otherMin) <= 0.0001) {
          const h = compareHeadToHead(team, other);
          if (h > 0) return true;
          if (h < 0) return false;
          if (team.runsAgainst > other.runsAgainst) return true;
        }
        return false;
      })
      : true;
    team.clinched = cantFall && cantRise;
  });

  return sorted.map((t) => ({
    team: t.name, last5: t.last5, remainingCount: t.remainingCount,
    scheduleStrength: t.scheduleStrength, remainingScheduleStrength: t.remainingScheduleStrength,
    clinched: t.clinched
  }));
}

// --- playoffs.html / bracket.html / projections.html / playoff-clinching.html mapping
// (no 'home team' fallback; game_type from gameType only)

function seedPageMap(g, { dateMode }) {
  let date;
  if (dateMode === 'toLocale') {
    const dateObj = g.date && g.date.seconds ? new Date(g.date.seconds * 1000) : new Date(g.date || Date.now());
    date = dateObj.toLocaleDateString('en-US');
  } else {
    date = g.date && g.date.seconds ? new Date(g.date.seconds * 1000).toLocaleDateString('en-US') : (g.date || '');
  }
  return {
    'home team': g.homeTeamName || capitalize(g.homeTeamId) || '',
    'away team': g.awayTeamName || capitalize(g.awayTeamId) || '',
    'home score': g.homeScore !== undefined ? g.homeScore : null,
    'away score': g.awayScore !== undefined ? g.awayScore : null,
    winner: capitalize(g.winner || ''),
    game_type: g.gameType === 'regular' ? 'Regular' :
      g.gameType === 'playoff' ? 'Playoff' :
      capitalize(g.gameType) || 'Regular',
    date
  };
}

const slashParse = (dateStr) => {
  const [month, day, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
};

// playoffs.html calculateStandings (also bracket.html's filter)
export function playoffs(rawGames, now = new Date()) {
  const games = rawGames.map((g) => seedPageMap(g, { dateMode: 'toLocale' }));
  const today = new Date(now);
  const regularGames = games.filter((g) =>
    g.winner && g.winner.trim() !== '' && slashParse(g.date) < today && g.game_type === 'Regular');
  if (regularGames.length === 0) return [];
  const teamStats = h2hTally(regularGames);
  const prelim = Object.values(teamStats).map((team) => {
    const totalGames = team.wins + team.losses + team.ties;
    team.winPct = totalGames > 0 ? (team.wins + team.ties * 0.5) / totalGames : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    return team;
  });
  const standings = prelim.sort((a, b) => {
    if (Math.abs(a.winPct - b.winPct) > 0.00001) return b.winPct - a.winPct;
    const same = prelim.filter((t) => Math.abs(t.winPct - a.winPct) <= 0.00001);
    if (same.length === 2) {
      const h = compareHeadToHead(a, b);
      if (h !== 0) return h;
    }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDifferential - a.runDifferential;
  });
  return out(standings.slice(0, 11));
}

// bracket.html calculateStandings: win % without ties, exact equality
export function bracket(rawGames, now = new Date()) {
  const games = rawGames.map((g) => seedPageMap(g, { dateMode: 'toLocale' }));
  const today = new Date(now);
  const regularGames = games.filter((g) =>
    g.winner && g.winner.trim() !== '' && slashParse(g.date) < today && g.game_type === 'Regular');
  if (regularGames.length === 0) return [];
  const teamStats = h2hTally(regularGames);
  const prelim = Object.values(teamStats).map((team) => {
    const totalDecided = team.wins + team.losses;
    team.winPct = totalDecided > 0 ? (team.wins / totalDecided) : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    return team;
  });
  const standings = prelim.sort((a, b) => {
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    const same = prelim.filter((t) => t.winPct === a.winPct);
    if (same.length === 2) {
      const h = compareHeadToHead(a, b);
      if (h !== 0) return h;
    }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDifferential - a.runDifferential;
  });
  return out(standings);
}

// projections.html calculateCurrentStandings: win % without ties, then run diff only
export function projections(rawGames, now = new Date()) {
  const games = rawGames.map((g) => seedPageMap(g, { dateMode: 'raw' }));
  const today = new Date(now);
  const completed = games.filter((g) =>
    utcParseGameDate(g.date) < today && g.winner && g.winner.trim() !== '' && g.game_type === 'Regular');
  const teamStats = h2hTally(completed);
  const standings = Object.values(teamStats).map((team) => {
    const d = team.wins + team.losses;
    team.winPct = d > 0 ? team.wins / d : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    return team;
  });
  standings.sort((a, b) => {
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    return b.runDifferential - a.runDifferential;
  });
  return out(standings);
}

// playoff-clinching.html calculateStandings + sortWithTiebreakers (group-based)
export function playoffClinching(rawGames, now = new Date()) {
  const games = rawGames.map((g) => seedPageMap(g, { dateMode: 'raw' }));
  const today = new Date(now);
  const completed = games.filter((g) =>
    utcParseGameDate(g.date) < today && g.winner && g.winner.trim() !== '' && g.game_type === 'Regular');
  const teamStats = h2hTally(completed);
  const standings = Object.values(teamStats).map((team) => {
    const totalGames = team.wins + team.losses + team.ties;
    return { ...team, winPct: totalGames > 0 ? (team.wins + team.ties * 0.5) / totalGames : 0, runDifferential: team.runsFor - team.runsAgainst };
  });
  if (!standings.length) return [];
  const breakTieByRunsAllowed = (teams) => [...teams].sort((a, b) =>
    (a.runsAgainst !== b.runsAgainst) ? a.runsAgainst - b.runsAgainst : b.runDifferential - a.runDifferential);
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct);
  const groups = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].winPct - sorted[i - 1].winPct) < 0.0001) current.push(sorted[i]);
    else { groups.push(current); current = [sorted[i]]; }
  }
  groups.push(current);
  return out(groups.map((group) => {
    if (group.length === 1) return group;
    if (group.length === 2) {
      const [a, b] = group;
      const h = compareHeadToHead(a, b);
      if (h !== 0) return h > 0 ? [b, a] : [a, b];
      return breakTieByRunsAllowed(group);
    }
    return breakTieByRunsAllowed(group);
  }).flat());
}

// season.html calculateStandings: raw fields, no date filter, win % without
// ties, then wins; no tiebreakers. gameType '' or 'regular' only.
export function season(rawGames) {
  const games = rawGames.filter((g) => {
    const t = (g.gameType || '').toLowerCase();
    return t === 'regular' || t === '';
  });
  const teams = {};
  games.forEach((game) => {
    const homeTeam = game.homeTeamName || game.homeTeam;
    const awayTeam = game.awayTeamName || game.awayTeam;
    const winner = game.winner;
    if (!homeTeam || !awayTeam) return;
    if (!teams[homeTeam]) teams[homeTeam] = { name: homeTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 };
    if (!teams[awayTeam]) teams[awayTeam] = { name: awayTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 };
    if (winner && winner.trim() !== '') {
      const homeScore = parseInt(game.homeScore) || 0;
      const awayScore = parseInt(game.awayScore) || 0;
      teams[homeTeam].runsFor += homeScore; teams[homeTeam].runsAgainst += awayScore;
      teams[awayTeam].runsFor += awayScore; teams[awayTeam].runsAgainst += homeScore;
      const w = winner.toLowerCase();
      if (w === 'tie') { teams[homeTeam].ties++; teams[awayTeam].ties++; }
      else if (w === homeTeam.toLowerCase()) { teams[homeTeam].wins++; teams[awayTeam].losses++; }
      else if (w === awayTeam.toLowerCase()) { teams[awayTeam].wins++; teams[homeTeam].losses++; }
    }
  });
  const standings = Object.values(teams).map((team) => {
    const d = team.wins + team.losses;
    return { ...team, winPct: d > 0 ? team.wins / d : 0 };
  });
  standings.sort((a, b) => (b.winPct !== a.winPct ? b.winPct - a.winPct : b.wins - a.wins));
  return out(standings);
}

// recap.html calculateStandings: everything except playoff, no date filter,
// win % without ties, then the chain.
export function recap(rawGames) {
  const games = rawGames.filter((g) => (g.gameType || g.game_type || '').toLowerCase() !== 'playoff');
  const teams = {};
  games.forEach((game) => {
    const homeTeam = game.homeTeamName || game['home team'] || game.homeTeam;
    const awayTeam = game.awayTeamName || game['away team'] || game.awayTeam;
    const winner = game.winner;
    if (!homeTeam || !awayTeam) return;
    if (!teams[homeTeam]) teams[homeTeam] = { name: homeTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, h2h: {} };
    if (!teams[awayTeam]) teams[awayTeam] = { name: awayTeam, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, h2h: {} };
    if (!teams[homeTeam].h2h[awayTeam]) teams[homeTeam].h2h[awayTeam] = { wins: 0, losses: 0, ties: 0 };
    if (!teams[awayTeam].h2h[homeTeam]) teams[awayTeam].h2h[homeTeam] = { wins: 0, losses: 0, ties: 0 };
    if (winner && winner.trim() !== '') {
      const homeScore = parseInt(game.homeScore || game['home score']) || 0;
      const awayScore = parseInt(game.awayScore || game['away score']) || 0;
      teams[homeTeam].runsFor += homeScore; teams[homeTeam].runsAgainst += awayScore;
      teams[awayTeam].runsFor += awayScore; teams[awayTeam].runsAgainst += homeScore;
      const w = winner.toLowerCase();
      if (w === 'tie') {
        teams[homeTeam].ties++; teams[awayTeam].ties++;
        teams[homeTeam].h2h[awayTeam].ties++; teams[awayTeam].h2h[homeTeam].ties++;
      } else if (w === homeTeam.toLowerCase()) {
        teams[homeTeam].wins++; teams[awayTeam].losses++;
        teams[homeTeam].h2h[awayTeam].wins++; teams[awayTeam].h2h[homeTeam].losses++;
      } else if (w === awayTeam.toLowerCase()) {
        teams[awayTeam].wins++; teams[homeTeam].losses++;
        teams[awayTeam].h2h[homeTeam].wins++; teams[homeTeam].h2h[awayTeam].losses++;
      }
    }
  });
  const standings = Object.values(teams).map((team) => {
    const d = team.wins + team.losses;
    return { ...team, winPct: d > 0 ? team.wins / d : 0, runDiff: team.runsFor - team.runsAgainst };
  });
  standings.sort((a, b) => {
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    const same = standings.filter((t) => t.winPct === a.winPct);
    if (same.length === 2) {
      const h = compareHeadToHead(a, b);
      if (h !== 0) return h;
    }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDiff - a.runDiff;
  });
  return out(standings);
}

// commissioner-hub.html calculateStandings: no date filter; win % with ties,
// then wins, then losses, then the chain (H2H by series W/L).
export function commissionerHub(rawGames) {
  const games = rawGames.map((g) => ({
    'home team': g.homeTeamName || g['home team'] || capitalize(g.homeTeamId) || '',
    'away team': g.awayTeamName || g['away team'] || capitalize(g.awayTeamId) || '',
    'home score': g.homeScore !== undefined ? g.homeScore : (g['home score'] || null),
    'away score': g.awayScore !== undefined ? g.awayScore : (g['away score'] || null),
    winner: capitalize(g.winner),
    game_type: (g.game_type === 'Playoff' || g.gameType === 'playoff') ? 'Playoff' : 'Regular'
  }));
  const regular = games.filter((g) => g.winner && g.winner.trim() !== '' && g.game_type === 'Regular');
  const stats = h2hTally(regular);
  const prelim = Object.values(stats).map((t) => {
    const total = t.wins + t.losses + t.ties;
    t.winPct = total > 0 ? (t.wins + t.ties * 0.5) / total : 0;
    t.runDiff = t.runsFor - t.runsAgainst;
    return t;
  });
  const compareH2H = (a, b) => {
    const r = a.h2h[b.name];
    if (!r) return 0;
    if (r.wins > r.losses) return -1;
    if (r.wins < r.losses) return 1;
    return 0;
  };
  return out(prelim.sort((a, b) => {
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    const tied = prelim.filter((t) => t.winPct === a.winPct && t.wins === a.wins && t.losses === a.losses);
    if (tied.length === 2) { const h = compareH2H(a, b); if (h !== 0) return h; }
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    return b.runDiff - a.runDiff;
  }));
}

export const LEGACY_STANDINGS = [
  { id: 'current-season', run: currentSeason, note: 'Reference: the chain as specified' },
  { id: 'playoffs', run: playoffs, note: 'Top 11 only; current season only' },
  { id: 'bracket', run: bracket, note: 'Win % ignores ties' },
  { id: 'projections', run: projections, note: 'Win % ignores ties; run diff only' },
  { id: 'playoff-clinching', run: playoffClinching, note: 'Group-based chain' },
  { id: 'season', run: season, note: 'No tiebreakers; ties ignored' },
  { id: 'recap', run: recap, note: 'Win % ignores ties; no date filter' },
  { id: 'commissioner-hub', run: commissionerHub, note: 'Wins/losses before H2H' }
];

// ===========================================================================
// Stats: the formulas as aggregate-stats.html writes them
// ===========================================================================

export function aggregatorBPI(seasonTotals) {
  // seasonTotals: [{ atBats, hits, walks, runs, games, sub }]
  const withRates = seasonTotals.map((s) => ({
    ...s,
    battingAverage: s.atBats > 0 ? s.hits / s.atBats : 0,
    onBasePercentage: (s.atBats + s.walks) > 0 ? (s.hits + s.walks) / (s.atBats + s.walks) : 0,
    runsPerPA: (s.atBats + s.walks) > 0 ? s.runs / (s.atBats + s.walks) : 0
  }));
  const nonSub = { battingAverage: [], onBasePercentage: [], runsPerPA: [], games: [] };
  withRates.forEach((s) => {
    const isSub = (s.sub || '').toLowerCase() === 'yes';
    if (!isSub && s.atBats > 0) {
      nonSub.battingAverage.push(s.battingAverage);
      nonSub.onBasePercentage.push(s.onBasePercentage);
      nonSub.runsPerPA.push(s.runsPerPA);
      nonSub.games.push(s.games);
    }
  });
  const calcMean = (arr) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
  const calcStdDev = (arr, m) => {
    if (arr.length < 2) return 1;
    return Math.sqrt(arr.map((x) => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length) || 1;
  };
  const league = {};
  for (const k of Object.keys(nonSub)) {
    const m = calcMean(nonSub[k]);
    league[k] = { mean: m, stdDev: calcStdDev(nonSub[k], m) };
  }
  const weights = { battingAverage: 0.5, onBasePercentage: 0.1, runsPerPA: 0.3, games: 0.1 };
  const z = (v, m, sd) => (sd === 0 ? 0 : (v - m) / sd);
  return withRates.map((s) => {
    let wz = 0;
    for (const k of Object.keys(weights)) wz += z(s[k], league[k].mean, league[k].stdDev) * weights[k];
    return 50 + 10 * wz;
  });
}

export function aggregatorBwar(players, leagueRPG) {
  // players: [{ pa, h, bb, hr }] with pa > 0
  const W = { wBB: 0.30, wFlat: 0.70, wHR: 1.40, replPct: 50, minPA: 20, rpwMul: 0.5 };
  const RPW = (leagueRPG ?? 14) * W.rpwMul;
  const withWOBA = players.map((p) => {
    const nonHR = Math.max(0, p.h - p.hr);
    return { ...p, woba: (W.wBB * p.bb + W.wFlat * nonHR + W.wHR * p.hr) / p.pa };
  });
  const totalPA = withWOBA.reduce((s, p) => s + p.pa, 0);
  const leagueWOBA = totalPA > 0 ? withWOBA.reduce((s, p) => s + p.woba * p.pa, 0) / totalPA : 0;
  const replWOBA = leagueWOBA * (W.replPct / 100);
  return withWOBA.map((p) => {
    const rar = (p.woba - replWOBA) * p.pa;
    const raw = RPW > 0 ? rar / RPW : 0;
    return p.pa >= W.minPA ? Math.max(0, raw) : 0;
  });
}

// ===========================================================================
// Eligibility: playoff-eligibility-tracker.html
// ===========================================================================

export function trackerRules(season, seasonId) {
  const seasonType = (season?.season || (seasonId || '').split('-')[1] || '').toString().toLowerCase();
  return seasonType === 'fall' ? { GAMES_REQUIRED: 4, SUBS_ALLOWED: 1 } : { GAMES_REQUIRED: 8, SUBS_ALLOWED: 0 };
}

export function trackerStatus(p, { GAMES_REQUIRED, SUBS_ALLOWED }) {
  const eligible = p.gamesPlayed >= GAMES_REQUIRED;
  const close = !eligible && p.gamesPlayed >= GAMES_REQUIRED - 2;
  const sub = p.subCount ? { over: p.subCount > SUBS_ALLOWED } : null;
  return { eligible, close, subUsed: !!sub, subOver: !!sub?.over };
}
