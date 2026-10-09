// js/admin/tracker-plays.js
// Play-by-play math for admin/game-tracker-review.html, moved unchanged from
// the old page: batting lines rebuilt from edited plays, opposing pitcher
// lines from plays, the line score, and hit locations per batter.

export const PLAY_TYPES = [
  ['single', 'Single'], ['double', 'Double'], ['triple', 'Triple'], ['homerun', 'Home run'],
  ['walk', 'Walk'], ['strikeout', 'Strikeout'], ['flyout', 'Fly out'], ['groundout', 'Ground out'],
  ['fielders_choice', "Fielder's choice"], ['sacfly', 'Sac fly'], ['doubleplay', 'Double play'],
  ['out', 'Out'], ['error', 'Reached on error']
];

export const PLAY_LABELS = {
  single: '1B', double: '2B', triple: '3B', homerun: 'HR', walk: 'BB',
  strikeout: 'K', flyout: 'FO', groundout: 'GO', fielders_choice: 'FC',
  sacfly: 'SF', doubleplay: 'DP', out: 'OUT', error: 'ROE'
};

const RESULT_NAMES = Object.fromEntries([...PLAY_TYPES, ['sacrifice', 'Sacrifice'], ['lineout', 'Line out'], ['popout', 'Pop out']]);
export const playName = (t) => RESULT_NAMES[t] || t || 'Unknown';

const HIT_TYPES = ['single', 'double', 'triple', 'homerun'];

// Batted balls, where a hit location means something
export const BATTED = new Set([
  'single', 'double', 'triple', 'homerun',
  'out', 'flyout', 'groundout', 'lineout', 'popout',
  'error', 'fielders_choice', 'sacfly', 'doubleplay', 'sacrifice'
]);

/** Batting lines from plays. rosterId(name) gives the player's ID for a batter name. */
export function recalculateBattingStats(plays, rosterId = () => '') {
  const statsMap = {};
  plays.forEach(play => {
    const name = play.batter;
    if (!name) return;
    if (!statsMap[name]) {
      statsMap[name] = {
        playerName: name, playerId: rosterId(name) || '',
        atBats: 0, hits: 0, singles: 0, doubles: 0, triples: 0,
        homeRuns: 0, walks: 0, strikeouts: 0, rbi: 0, runs: 0,
        battingAverage: 0, onBasePercentage: 0, sluggingPercentage: 0
      };
    }
    const s = statsMap[name];
    const t = play.playType;
    if (t !== 'walk' && t !== 'sacfly') s.atBats++;
    if (t === 'single') { s.hits++; s.singles++; }
    if (t === 'double') { s.hits++; s.doubles++; }
    if (t === 'triple') { s.hits++; s.triples++; }
    if (t === 'homerun') { s.hits++; s.homeRuns++; }
    if (t === 'walk') s.walks++;
    if (t === 'strikeout') s.strikeouts++;
    s.rbi += (play.runsScored || 0);
    if (play.runsScored > 0 && t === 'homerun') s.runs++;
  });

  // Runs: runners who were on base and are listed in runnersScored
  plays.forEach(play => {
    if ((play.runsScored || 0) === 0) return;
    const before = play.basesBefore || {};
    const after = play.basesAfter || {};
    ['first', 'second', 'third'].forEach(base => {
      const runner = before[base];
      if (!runner || !statsMap[runner]) return;
      if (after[base] === runner) return;
      const stillOnBase = Object.values(after).includes(runner);
      if (!stillOnBase && (play.runnersScored || []).includes(runner)) statsMap[runner].runs++;
    });
  });

  return Object.values(statsMap).map(s => {
    const pa = s.atBats + s.walks;
    s.battingAverage = s.atBats > 0 ? s.hits / s.atBats : 0;
    s.onBasePercentage = pa > 0 ? (s.hits + s.walks) / pa : 0;
    const tb = s.singles + s.doubles * 2 + s.triples * 3 + s.homeRuns * 4;
    s.sluggingPercentage = s.atBats > 0 ? tb / s.atBats : 0;
    return s;
  });
}

/** Lines for the other team's pitchers, from the plays they pitched. */
export function opposingPitcherStats(plays) {
  const map = {};
  plays.forEach(play => {
    const p = play.opposingPitcher;
    if (!p || !p.id) return;
    if (!map[p.id]) map[p.id] = { id: p.id, name: p.name, outs: 0, hits: 0, runs: 0, walks: 0, strikeouts: 0, homeRuns: 0 };
    const s = map[p.id];
    const t = play.playType;
    s.outs += (play.outsAfter || 0) - (play.outsBefore || 0);
    if (HIT_TYPES.includes(t)) s.hits++;
    if (t === 'homerun') s.homeRuns++;
    if (t === 'walk') s.walks++;
    if (t === 'strikeout') s.strikeouts++;
    s.runs += (play.runsScored || 0);
  });
  return Object.values(map).map(p => {
    const full = Math.floor(p.outs / 3);
    const rem = p.outs % 3;
    p.ip = rem === 0 ? `${full}` : `${full}.${rem}`;
    p.ipNum = p.outs / 3;
    return p;
  });
}

/** Runs by inning for the tracked team and the opponent. */
export function lineScore(plays, innings = 1) {
  const ours = {}, theirs = {};
  plays.forEach(play => {
    if (!play.inning) return;
    const runs = play.type === 'manual-run-adjustment'
      ? (typeof play.adjustment === 'number' ? play.adjustment : 0)
      : (play.runsScored || 0);
    if (!runs) return;
    const side = play.isYourTeam !== false ? ours : theirs;
    side[play.inning] = (side[play.inning] || 0) + runs;
  });
  const last = Math.max(...[...Object.keys(ours), ...Object.keys(theirs)].map(Number), Number(innings) || 1);
  return { ours, theirs, innings: last };
}

/** { batter name: [{ playType, location, inning, isYourTeam }] } for tagged batted balls. */
export function hitLocations(plays) {
  const by = {};
  (plays || []).forEach(play => {
    if (!play.location || !BATTED.has(play.playType) || !play.batter) return;
    (by[play.batter] = by[play.batter] || []).push({
      playType: play.playType, location: play.location,
      inning: play.inning || null, isYourTeam: play.isYourTeam !== false
    });
  });
  return by;
}

export const isHit = (t) => HIT_TYPES.includes(t);
