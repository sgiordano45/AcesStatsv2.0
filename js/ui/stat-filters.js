// js/ui/stat-filters.js
// The page filters that sit above a stat table: Season (with "All 2025"-style
// whole-year choices), Team, and optionally Subs. Kept in the URL as
// ?season=2025-fall&team=teal&subs=exclude, next to the table's own keys.
//
//   import { mountStatFilters, pickDefaultSeason } from './js/ui/stat-filters.js';
//   const filters = mountStatFilters({
//     season: document.getElementById('seasonFilter'),
//     team: document.getElementById('teamFilter'),        // optional (null on team.html)
//     subs: document.getElementById('subsFilter'),        // optional
//     rows,                                               // { seasonId, team, teamKey, sub }
//     defaultSeason: pickDefaultSeason(rows.map(r => r.seasonId), ctx.config),
//     onChange: (filteredRows, f) => table.setRows(filteredRows)
//   });
//   filters.apply();   // run once after mounting
//
// Options are built from the rows. The default season is left out of the URL.

import { escapeHtml as esc, capitalize } from './format.js';
import { parseStatSeasonId, seasonLabel, sortSeasonIds } from '../domain/season-ids.js';

const SUBS = ['include', 'exclude', 'only'];

/** siteConfig's current season when it has stats here (not in the offseason), else the newest. */
export function pickDefaultSeason(seasonIds, config) {
  const ids = sortSeasonIds(seasonIds);
  const current = config && config.phase !== 'offseason' ? config.currentSeasonId : null;
  return current && ids.includes(current) ? current : (ids[0] || 'all');
}

export function inSeason(row, value) {
  if (!value || value === 'all') return true;
  if (value.startsWith('y:')) return row.seasonId.startsWith(`${value.slice(2)}-`);
  return row.seasonId === value;
}

export function mountStatFilters({ season, team, subs = null, rows = [], defaultSeason = 'all', onChange }) {
  let allRows = rows;

  function seasonOptions() {
    const byYear = new Map();
    for (const id of sortSeasonIds(allRows.map(r => r.seasonId))) {
      const { year } = parseStatSeasonId(id);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(id);
    }
    season.innerHTML = '<option value="all">All seasons</option>' +
      [...byYear].map(([year, ids]) => `<optgroup label="${esc(year)}">` +
        (ids.length > 1 ? `<option value="y:${esc(year)}">All ${esc(year)}</option>` : '') +
        ids.map(id => `<option value="${esc(id)}">${esc(seasonLabel(id))}</option>`).join('') + '</optgroup>').join('');
  }

  function teamOptions(selected) {
    if (!team) return;
    const names = [...new Set(allRows.filter(r => inSeason(r, season.value)).map(r => r.team))].filter(Boolean).sort();
    if (selected !== 'all' && !names.some(t => t.toLowerCase() === selected)) names.push(capitalize(selected));
    team.innerHTML = '<option value="all">All teams</option>' +
      names.map(t => `<option value="${esc(t.toLowerCase())}">${esc(t)}</option>`).join('');
    team.value = selected;
  }

  const hasOption = (select, value) => [...select.options].some(o => o.value === value);

  function read() {
    const p = new URLSearchParams(location.search);
    return {
      season: p.get('season') || defaultSeason,
      team: team ? (p.get('team') || 'all').toLowerCase() : 'all',
      subs: subs ? (p.get('subs') || 'include') : 'include'
    };
  }

  function current() {
    return { season: season.value, team: team ? team.value : 'all', subs: subs ? subs.value : 'include' };
  }

  // Only the keys this page has a control for: on team.html, ?team= is the
  // page's own team and must be left alone.
  function write(f) {
    const p = new URLSearchParams(location.search);
    const set = (k, v, dflt) => (v && v !== dflt ? p.set(k, v) : p.delete(k));
    set('season', f.season, defaultSeason);
    if (team) set('team', f.team, 'all');
    if (subs) set('subs', f.subs, 'include');
    const qs = p.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }

  function filtered(f = current()) {
    return allRows.filter(r =>
      inSeason(r, f.season) &&
      (f.team === 'all' || r.teamKey === f.team) &&
      (f.subs === 'exclude' ? !r.sub : f.subs === 'only' ? !!r.sub : true));
  }

  function apply() {
    const f = current();
    if (typeof onChange === 'function') onChange(filtered(f), f);
    return f;
  }

  function handle(e) {
    if (e.target === season) teamOptions(team ? team.value : 'all');
    write(apply());
  }

  // Initial state from the URL.
  seasonOptions();
  const start = read();
  season.value = hasOption(season, start.season) ? start.season : (hasOption(season, defaultSeason) ? defaultSeason : 'all');
  teamOptions(start.team);
  if (team && !hasOption(team, start.team)) team.value = 'all';
  if (subs) subs.value = SUBS.includes(start.subs) ? start.subs : 'include';

  season.addEventListener('change', handle);
  if (team) team.addEventListener('change', handle);
  if (subs) subs.addEventListener('change', handle);

  return {
    apply,
    filtered,
    current,
    setRows(next) {
      const keep = current();
      allRows = next || [];
      seasonOptions();
      season.value = hasOption(season, keep.season) ? keep.season : 'all';
      teamOptions(keep.team);
      apply();
    }
  };
}
