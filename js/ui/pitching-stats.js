// js/ui/pitching-stats.js
// Pitching rows and the pitching stat-table config, shared by pitching.html,
// team.html (and player/pitcher pages in Phase 3). Rows are one per
// pitcher-season.
//
// Pitching is runs and innings: the league doesn't track W/L/SV, and K/BB/H
// aren't recorded consistently, so none of them are shown.
//
//   import { buildPitchingRows, pitchingTableConfig } from './js/ui/pitching-stats.js';
//   const rows = buildPitchingRows(players, { team: 'Green' });
//   await applyTeamGames(rows);                                 // for Qualified
//   mountStatTable(el, pitchingTableConfig({ id: 'pit', omit: ['team'] }), { ... });

import { pitchingSeasonsObjectToArray } from '../data/player-stats.js';
import { capitalize, formatPlayerName, formatIP, fmtRate } from './format.js';
import { era, QUALIFIERS, isQualifiedPitcher, qualifierLabel } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey, inningsValue } from '../domain/season-ids.js';
import { sumFields } from './table-model.js';
import { playerColumn, teamColumn, seasonColumn, combinedTeam, combinedSeason } from './stat-columns.js';

export const PITCHING_COUNT_FIELDS = ['games', 'ip', 'runsAllowed'];

/** One row per pitcher-season, newest season first, then team, then name. */
export function buildPitchingRows(players, { team = null } = {}) {
  const only = team ? String(team).toLowerCase() : null;
  const rows = [];
  for (const player of players || []) {
    if (!player.pitchingSeasons || typeof player.pitchingSeasons !== 'object') continue;
    for (const s of pitchingSeasonsObjectToArray(player)) {
      const sid = parseStatSeasonId(s.seasonId);
      if (!sid.id) continue;
      const teamName = capitalize(String(s.team || player.currentTeam || '').toLowerCase());
      if (only && teamName.toLowerCase() !== only) continue;
      rows.push({
        id: player.userId || player.id || '',
        ids: [player.userId, player.id, player.playerId].filter(Boolean),
        name: formatPlayerName(player.name || player.displayName || player.userId),
        team: teamName,
        teamKey: teamName.toLowerCase(),
        seasonId: sid.id,
        seasonLabel: seasonLabel(sid.id),
        seasonKey: seasonSortKey(sid.id),
        seasonCount: 1,
        sub: sid.isSub,
        games: Number(s.games) || 0,
        ip: inningsValue(s.inningsPitched),   // thirds notation (5.1) -> 5.333
        runsAllowed: Number(s.runsAllowed) || 0,
        teamGames: 0
      });
    }
  }
  rows.sort((a, b) => b.seasonKey - a.seasonKey || a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  return rows;
}

// Innings show as baseball thirds (5.1 = 5 1/3); per game they show as a decimal.
const ipText = (v, r, ctx) => (v === null || v === undefined ? '-' : ctx?.perGame ? v.toFixed(2) : formatIP(v));

/**
 * @param {object} [o]
 * @param {string} [o.id='']     URL prefix (two tables on one page need different ones)
 * @param {string[]} [o.lead=[]] column keys to put first (the first one is the sticky column)
 * @param {string[]} [o.omit=[]] column keys to leave out (e.g. 'team')
 */
export function pitchingTableConfig({ id = '', omit = [], lead = [] } = {}) {
  const drop = new Set(omit);
  // lead: keys moved to the front of every preset (player pages: ['season', 'team']).
  const arrange = (keys) => [...lead.filter(k => keys.includes(k)), ...keys.filter(k => !lead.includes(k))].filter(k => !drop.has(k));
  return {
    id,
    cardSub: drop.has('team') || lead[0] === 'team' ? 'season' : 'team',
    columns: [
      playerColumn({ page: 'pitcher.html' }),
      teamColumn(),
      seasonColumn(),
      { key: 'G', label: 'G', title: 'Games pitched', type: 'count', value: r => r.games, perGame: false },
      { key: 'IP', label: 'IP', title: 'Innings pitched', type: 'count', value: r => r.ip, format: ipText },
      { key: 'R', label: 'R', title: 'Runs allowed', type: 'count', shade: false, value: r => r.runsAllowed },
      { key: 'ERA', label: 'ERA', type: 'rate', lowerIsBetter: true, value: r => era(r.runsAllowed, r.ip), format: v => fmtRate(v) },
      { key: 'RG', label: 'R/G', title: 'Runs allowed per game pitched', type: 'rate', lowerIsBetter: true, value: r => (r.games ? r.runsAllowed / r.games : null), format: v => fmtRate(v) }
    ],
    presets: [
      { key: 'standard', label: 'Standard', sort: '-IP', card: ['G', 'IP', 'ERA', 'RG'],
        columns: arrange(['name', 'team', 'season', 'G', 'IP', 'R', 'ERA', 'RG']) }
    ],
    games: r => r.games,
    qualifier: (state) => state.combine
      ? { label: `min ${QUALIFIERS.CAREER_MIN_IP} IP combined`, test: r => r.ip >= QUALIFIERS.CAREER_MIN_IP }
      : { label: qualifierLabel('pitching').replace(/^Min/, 'min'), test: r => r.teamGames > 0 && isQualifiedPitcher({ inningsPitched: r.ip }, r.teamGames) },
    combine: {
      label: 'Combine seasons',
      key: r => r.id || r.name,
      merge: (group) => ({
        ...group[0],
        ...sumFields(group, PITCHING_COUNT_FIELDS),
        ...combinedTeam(group),
        ...combinedSeason(group),
        teamGames: sumFields(group, ['teamGames']).teamGames
      })
    }
  };
}
