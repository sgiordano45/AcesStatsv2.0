// js/ui/batting-stats.js
// Batting rows and the batting stat-table config, shared by batting.html,
// team.html (and player.html in Phase 3). Rows are one per player-season.
//
//   import { buildBattingRows, battingTableConfig } from './js/ui/batting-stats.js';
//   const rows = buildBattingRows(players);                    // every team
//   const rows = buildBattingRows(players, { team: 'Green' }); // one team
//   await applyTeamGames(rows, { fallbackToPlayerGames: true }); // for Qualified
//   mountStatTable(el, battingTableConfig(), { ... });
//   mountStatTable(el, battingTableConfig({ id: 'bat', omit: ['team'] }), { ... });

import { seasonsObjectToArray } from '../data/player-stats.js';
import { capitalize, formatPlayerName, fmtAvg, fmtRate } from './format.js';
import { battingLine, QUALIFIERS, isQualifiedBatter, qualifierLabel } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey, hasCompleteHitTypes } from '../domain/season-ids.js';
import { sumFields } from './table-model.js';
import { playerColumn, teamColumn, seasonColumn, combinedTeam, combinedSeason } from './stat-columns.js';

export const BATTING_COUNT_FIELDS = ['games', 'atBats', 'hits', 'runs', 'walks', 'doubles', 'triples', 'homeRuns', 'rbi'];

const numOrNull = (v) => (v === null || v === undefined || v === '' || v === 'N/A' || !Number.isFinite(Number(v)) ? null : Number(v));

/** One row per player-season, newest season first, then team, then name. */
export function buildBattingRows(players, { team = null } = {}) {
  const only = team ? String(team).toLowerCase() : null;
  const rows = [];
  for (const player of players || []) {
    if (!player.seasons || typeof player.seasons !== 'object') continue;
    for (const s of seasonsObjectToArray(player)) {
      const sid = parseStatSeasonId(s.seasonId);
      if (!sid.id) continue;
      const teamName = capitalize(String(s.team || player.currentTeam || '').toLowerCase());
      if (only && teamName.toLowerCase() !== only) continue;
      const sub = sid.isSub || /^yes$/i.test(String(s.sub || ''));
      const row = {
        id: player.userId || player.id || '',
        ids: [player.userId, player.id, player.playerId].filter(Boolean),
        name: formatPlayerName(player.name || player.displayName || player.userId),
        team: teamName,
        teamKey: teamName.toLowerCase(),
        seasonId: sid.id,
        seasonLabel: seasonLabel(sid.id),
        seasonKey: seasonSortKey(sid.id),
        seasonCount: 1,
        sub,
        hasHitTypes: 'doubles' in s && hasCompleteHitTypes(sid.id),
        acesBPI: sub ? null : numOrNull(s.acesBPI),   // subs get no acesBPI
        bwar: numOrNull(s.bwarSimp),
        teamGames: 0
      };
      for (const f of BATTING_COUNT_FIELDS) row[f] = Number(s[f]) || 0;
      rows.push(row);
    }
  }
  rows.sort((a, b) => b.seasonKey - a.seasonKey || a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  return rows;
}

const line = (r) => battingLine(r);
const avg = (v) => (v === null || v === undefined ? '-' : fmtAvg(v));
const allHitTypes = (rows) => rows.length > 0 && rows.every(r => r.hasHitTypes);

/**
 * @param {object} [o]
 * @param {string} [o.id='']     URL prefix (two tables on one page need different ones)
 * @param {string[]} [o.omit=[]] column keys to leave out of every preset (e.g. 'team')
 */
export function battingTableConfig({ id = '', omit = [] } = {}) {
  const drop = new Set(omit);
  const presets = [
    { key: 'standard', label: 'Standard', sort: '-H', card: ['G', 'H', 'BA', 'OBP'],
      columns: ['name', 'team', 'season', 'G', 'AB', 'H', 'R', 'BB', 'BA', 'OBP', 'BPI', 'bWAR', 'sub'] },
    { key: 'advanced', label: 'Advanced', sort: '-OBP', card: ['BA', 'OBP', 'RPA', 'BPI'],
      columns: ['name', 'team', 'season', 'PA', 'BA', 'OBP', 'SLG', 'OPS', 'RPA', 'BPI', 'bWAR'] },
    { key: 'counting', label: 'Counting', sort: '-H', card: ['G', 'H', 'R', 'BB'],
      columns: ['name', 'team', 'season', 'G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB'] }
  ].map(p => ({ ...p, columns: p.columns.filter(k => !drop.has(k)) }));

  return {
    id,
    cardSub: drop.has('team') ? 'season' : 'team',
    columns: [
      playerColumn(),
      teamColumn(),
      seasonColumn(),
      { key: 'G', label: 'G', title: 'Games', type: 'count', value: r => r.games, perGame: false },
      { key: 'PA', label: 'PA', title: 'Plate appearances (AB + BB)', type: 'count', value: r => r.atBats + r.walks },
      { key: 'AB', label: 'AB', type: 'count', value: r => r.atBats },
      { key: 'H', label: 'H', title: 'Hits', type: 'count', value: r => r.hits },
      { key: '2B', label: '2B', title: 'Doubles', type: 'count', value: r => r.doubles, when: allHitTypes },
      { key: '3B', label: '3B', title: 'Triples', type: 'count', value: r => r.triples, when: allHitTypes },
      { key: 'HR', label: 'HR', title: 'Home runs', type: 'count', value: r => r.homeRuns, when: allHitTypes },
      { key: 'R', label: 'R', title: 'Runs', type: 'count', value: r => r.runs },
      { key: 'RBI', label: 'RBI', type: 'count', value: r => r.rbi, when: allHitTypes },
      { key: 'BB', label: 'BB', title: 'Walks', type: 'count', value: r => r.walks },
      { key: 'BA', label: 'BA', type: 'rate', value: r => (r.atBats ? line(r).avg : null), format: avg },
      { key: 'OBP', label: 'OBP', type: 'rate', value: r => (r.atBats + r.walks ? line(r).obp : null), format: avg },
      { key: 'SLG', label: 'SLG', title: 'Slugging (2026 Fall on)', type: 'rate', value: r => (r.atBats ? line(r).slg : null), format: avg, when: allHitTypes },
      { key: 'OPS', label: 'OPS', title: 'OBP + SLG (2026 Fall on)', type: 'rate', value: r => (r.atBats ? line(r).ops : null), format: avg, when: allHitTypes },
      { key: 'RPA', label: 'R/PA', title: 'Runs per plate appearance', type: 'rate', value: r => (r.atBats + r.walks ? line(r).runsPerPA : null), format: avg },
      { key: 'BPI', label: 'AcesBPI', type: 'rate', qualifiedOnly: false, value: r => r.acesBPI, format: v => fmtRate(v) },
      { key: 'bWAR', label: 'bWAR', type: 'rate', qualifiedOnly: false, value: r => r.bwar, format: v => fmtRate(v) },
      { key: 'sub', label: 'Sub', type: 'text', shade: false, value: r => (r.sub ? 'Yes' : ''), format: v => v || '' }
    ],
    presets,
    games: r => r.games,
    qualifier: (state) => state.combine
      ? { label: `min ${QUALIFIERS.CAREER_MIN_PA} PA combined`, test: r => r.atBats + r.walks >= QUALIFIERS.CAREER_MIN_PA }
      : { label: qualifierLabel('batting').replace(/^Min/, 'min'), test: r => r.teamGames > 0 && isQualifiedBatter(r, r.teamGames) },
    combine: {
      label: 'Combine seasons',
      key: r => r.id || r.name,
      merge: (group) => {
        const bwars = group.map(r => r.bwar).filter(v => v !== null);
        return {
          ...group[0],
          ...sumFields(group, BATTING_COUNT_FIELDS),
          ...combinedTeam(group),        // from regular (non-sub) rows
          ...combinedSeason(group),
          sub: group.every(r => r.sub),
          hasHitTypes: group.every(r => r.hasHitTypes),
          acesBPI: null,                 // a one-season score; it doesn't add up
          bwar: bwars.length ? bwars.reduce((a, b) => a + b, 0) : null,
          teamGames: sumFields(group, ['teamGames']).teamGames
        };
      }
    }
  };
}
