// js/ui/stat-columns.js
// Column definitions every stat table shares (Player, Team, Season), for
// js/ui/table.js. Rows carry: id, name, team, teamKey, seasonId, seasonLabel,
// seasonKey, seasonCount (1, or how many seasons a combined row covers).
//
//   import { playerColumn, teamColumn, seasonColumn } from './js/ui/stat-columns.js';
//   columns: [playerColumn(), teamColumn(), seasonColumn(), ...]
//   columns: [playerColumn({ tab: 'pitching' }), ...]   // player.html?id=..&tab=pitching

import { escapeHtml as esc } from './format.js';

export const TEAM_COLORS = new Set(['black', 'green', 'red', 'blue', 'white', 'orange', 'silver', 'purple', 'gold', 'carolina', 'army', 'teal']);

/** Team chip markup: colored dot + name, linking to the team page (for that season when there is one). */
export function teamChipHtml(row) {
  if (!row.team) return '';
  if (row.teamKey === 'multiple') return 'Multiple';
  const color = TEAM_COLORS.has(row.teamKey) ? ` data-team-color="${esc(row.teamKey)}"` : '';
  const q = new URLSearchParams({ team: row.team });
  if (row.seasonCount === 1 && row.seasonId) q.set('season', row.seasonId);
  return `<a class="aces-team-chip"${color} href="team.html?${esc(q.toString())}"><span class="aces-team-dot"></span>${esc(row.team)}</a>`;
}

export function playerColumn({ page = 'player.html', label = 'Player', tab = '' } = {}) {
  return {
    key: 'name', label, type: 'text', value: r => r.name,
    html: r => {
      const q = (r.id ? `id=${encodeURIComponent(r.id)}` : `name=${encodeURIComponent(r.name)}`) + (tab ? `&tab=${encodeURIComponent(tab)}` : '');
      return `<a href="${page}?${esc(q)}">${esc(r.name)}</a>`;
    }
  };
}

export function teamColumn() {
  return { key: 'team', label: 'Team', type: 'text', value: r => r.team, html: teamChipHtml };
}

/** Sorts by season (newest first on the first click) and shows '2026 Fall' or 'N seasons'. */
export function seasonColumn() {
  return {
    key: 'season', label: 'Season', type: 'text', defaultDir: 'desc',
    value: r => r.seasonKey, format: (v, r) => r.seasonLabel, csv: r => r.seasonLabel
  };
}

/** For combine.merge(): one team when the group's regular (non-sub) rows agree, else Multiple. */
export function combinedTeam(group) {
  const regular = group.filter(r => !r.sub);
  const teams = [...new Set((regular.length ? regular : group).map(r => r.team).filter(Boolean))];
  if (teams.length === 1) return { team: teams[0], teamKey: teams[0].toLowerCase() };
  return teams.length ? { team: 'Multiple', teamKey: 'multiple' } : { team: '', teamKey: '' };
}

/** For combine.merge(): season fields for a group of player-season rows. */
export function combinedSeason(group) {
  const ids = new Set(group.map(r => r.seasonId));
  return {
    seasonCount: ids.size,
    seasonKey: Math.max(...group.map(r => r.seasonKey)),
    seasonLabel: ids.size > 1 ? `${ids.size} seasons` : group[0].seasonLabel
  };
}
