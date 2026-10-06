// js/domain/eligibility.js
// Playoff eligibility rules.
//
//   import { eligibilityRules, countAppearances, eligibilityStatus } from './js/domain/eligibility.js';
//
// The rules:
//   Fall:   4 games to qualify; each player may sub once all season.
//   Summer: 8 games to qualify; no subs allowed.
//   Any other season type uses the Summer rules (as the tracker does today).
//
// A game counts toward eligibility when the player appears for his own team
// (not as a sub) in a game that has a winner. Sub appearances are counted
// separately against the sub limit.
//
// Replaces the inline rules in playoff-eligibility-tracker.html.

export const ELIGIBILITY_RULES = Object.freeze({
  fall: Object.freeze({ seasonType: 'fall', gamesRequired: 4, subsAllowed: 1 }),
  summer: Object.freeze({ seasonType: 'summer', gamesRequired: 8, subsAllowed: 0 })
});

/** Season type from a season ID ('2026-fall'), a season doc ({ season: 'Fall' }) or a type. */
export function seasonTypeOf(season) {
  if (!season) return '';
  if (typeof season === 'string') {
    const s = season.toLowerCase();
    return s.includes('-') ? s.split('-')[1] || '' : s;
  }
  const raw = season.season || String(season.id || '').split('-')[1] || '';
  return String(raw).toLowerCase();
}

/** { seasonType, gamesRequired, subsAllowed } for a season ID, season doc or type. */
export function eligibilityRules(season) {
  const type = seasonTypeOf(season);
  return type === 'fall' ? ELIGIBILITY_RULES.fall : { ...ELIGIBILITY_RULES.summer, seasonType: type || 'summer' };
}

/** One line for page headers: '8 games to qualify \u00b7 no subs allowed'. */
export function describeRules(rules) {
  const subs = rules.subsAllowed === 0
    ? 'no subs allowed'
    : `${rules.subsAllowed} sub allowed per player`;
  return `${rules.gamesRequired} games to qualify \u00b7 ${subs}`;
}

/**
 * IDs of a player's game docs (playerStats/{id}/games/{seasonId}_{gameId})
 * that belong to completed games, from the season's game docs.
 */
export function completedGameDocIds(seasonId, games) {
  return new Set((games || [])
    .filter((g) => g?.winner && String(g.winner).trim() !== '')
    .map((g) => `${seasonId}_${g.id}`));
}

/**
 * Count a player's appearances from his playerStats game docs.
 * @param {{ id: string, isSub?: boolean, teamId?: string }[]} gameDocs
 * @param {Set<string>} completedIds  from completedGameDocIds
 * @returns {{ gamesPlayed: number, subCount: number, subTeams: string[] }}
 */
export function countAppearances(gameDocs, completedIds) {
  let gamesPlayed = 0;
  const subTeams = [];
  for (const d of gameDocs || []) {
    if (!completedIds.has(d.id)) continue;
    if (d.isSub === true) subTeams.push(d.teamId || '');
    else gamesPlayed++;
  }
  return { gamesPlayed, subCount: subTeams.length, subTeams };
}

/**
 * Where a player stands.
 * @returns {{ eligible, gamesNeeded, nearlyEligible, subUsed, subOver, subsLeft }}
 *   nearlyEligible: within 2 games and not there yet (the tracker's amber badge)
 */
export function eligibilityStatus({ gamesPlayed = 0, subCount = 0 } = {}, rules) {
  const eligible = gamesPlayed >= rules.gamesRequired;
  return {
    eligible,
    gamesNeeded: Math.max(0, rules.gamesRequired - gamesPlayed),
    nearlyEligible: !eligible && gamesPlayed >= rules.gamesRequired - 2,
    subUsed: subCount > 0,
    subOver: subCount > rules.subsAllowed,
    subsLeft: Math.max(0, rules.subsAllowed - subCount)
  };
}

/**
 * Can this player still qualify? Needs as many games as his team has left.
 * teamGamesLeft: the team's remaining regular-season games.
 */
export function canStillQualify({ gamesPlayed = 0 } = {}, rules, teamGamesLeft) {
  return gamesPlayed + Math.max(0, teamGamesLeft || 0) >= rules.gamesRequired;
}
