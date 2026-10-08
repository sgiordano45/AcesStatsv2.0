// js/pages/explore.js
// explore.html: one query builder with table or chart output. It replaced
// query-stats.html (filters) and charts.html (team and player bar charts);
// both are stubs that forward here. The bWAR Explorer moved to the admin tools.
//
//   What:    batting | pitching | teams
//   Scope:   career (one row per player, or per team since 2022)
//            season (one season's rows) | all (every player-season or team-season)
//   Filters: any stat, >= <= = > <, a value; all must match
//   Output:  the shared stat table (js/ui/table.js), or a bar chart of the
//            column the table is sorted by
//
// URL: explore.html?what=batting&scope=season&season=2026-fall&team=Teal&f=BA:ge:0.4,H:ge:10&view=chart
//      plus the table's own keys (preset, sort, qualified ...).

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getAllSeasons } from '../data/seasons.js';
import { getSeasonGames } from '../data/games.js';
import { applyTeamGames } from '../data/team-games.js';
import { normalizeGames } from '../domain/standings.js';
import { battingLine } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey, sortSeasonIds } from '../domain/season-ids.js';
import { combineRows } from '../ui/table-model.js';
import { mountStatTable } from '../ui/table.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { TEAM_COLORS, teamChipHtml } from '../ui/stat-columns.js';
import { pickDefaultSeason } from '../ui/stat-filters.js';
import { escapeHtml as esc, fmtAvg, fmtRate } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
const TEAMS_FROM = 2022;
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const OPS = { ge: ['≥', (a, b) => a >= b], le: ['≤', (a, b) => a <= b], eq: ['=', (a, b) => Math.abs(a - b) < 0.0005], gt: ['>', (a, b) => a > b], lt: ['<', (a, b) => a < b] };
// Rates under 1: "400" means .400.
const THOUSANDTHS = new Set(['BA', 'OBP', 'RPA', 'WPCT']);
const CHART_TOP = 15;

const state = { what: 'batting', scope: 'season', season: '', team: '', filters: [], view: 'table', chartAll: false };
const data = { bat: [], pit: [], teamRows: null, seasons: [], teamSeasons: [], defaultSeason: '', ready: false };
let table = null;
let config = null;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

// One row per player per season: old seasons stored sub games as a separate
// record, so a player who also subbed is merged (as on leaders.html).
function seasonRows(rows, merge) {
  return combineRows(rows, {
    key: r => `${r.id || r.name}|${r.seasonId}`,
    merge: (group) => {
      if (group.length === 1) return group[0];
      const regular = group.filter(r => !r.sub);
      const main = regular[0] || group[0];
      return {
        ...merge(group),
        seasonCount: 1, seasonId: main.seasonId, seasonLabel: main.seasonLabel, seasonKey: main.seasonKey,
        acesBPI: main.acesBPI ?? null, sub: !regular.length,
        teamGames: Math.max(...(regular.length ? regular : group).map(r => r.teamGames || 0))
      };
    }
  });
}

function careerRows(rows, merge) {
  return combineRows(rows, {
    key: r => r.id || r.name,
    merge: (group) => {
      const bpis = group.map(r => r.acesBPI).filter(v => typeof v === 'number');
      return { ...merge(group), acesBPI: bpis.length ? bpis.reduce((a, b) => a + b, 0) / bpis.length : null };
    }
  });
}

/** 'home' | 'away' | 'tie' | null, counting "Forfeit - Teal" winners too. */
function resultOf(g) {
  if (g.result) return g.result;
  const m = /forfeit\W*(\w+)/i.exec(g.unmatchedWinner || '');
  if (!m) return null;
  const w = m[1].toLowerCase();
  return w === g.home.toLowerCase() ? 'home' : w === g.away.toLowerCase() ? 'away' : null;
}

/** Team-season rows from the game docs (record, runs) and player rows (batting). */
async function loadTeamRows() {
  if (data.teamRows) return data.teamRows;
  const bySeason = await Promise.all(data.teamSeasons.map(id => getSeasonGames(id)
    .then(docs => [id, normalizeGames(docs)])
    .catch(err => { console.warn('[explore] games unavailable for', id, err); return [id, []]; })));
  const rows = [];
  for (const [seasonId, games] of bySeason) {
    const teams = new Map();
    const get = (name) => {
      const key = name.toLowerCase();
      if (!TEAM_COLORS.has(key)) return null;
      if (!teams.has(key)) {
        teams.set(key, {
          id: cap(name), name: cap(name), team: cap(name), teamKey: key,
          seasonId, seasonLabel: seasonLabel(seasonId), seasonKey: seasonSortKey(seasonId), seasonCount: 1,
          g: 0, w: 0, l: 0, t: 0, rf: 0, ra: 0, scored: 0, atBats: 0, hits: 0, walks: 0, players: 0
        });
      }
      return teams.get(key);
    };
    for (const g of games) {
      const res = resultOf(g);
      if (!res) continue;
      for (const side of ['home', 'away']) {
        const r = get(g[side]);
        if (!r) continue;
        r.g++;
        if (res === 'tie') r.t++; else if (res === side) r.w++; else r.l++;
        if (g.hasScores) {
          r.scored++;
          r.rf += side === 'home' ? g.homeScore : g.awayScore;
          r.ra += side === 'home' ? g.awayScore : g.homeScore;
        }
      }
    }
    const seen = new Map();
    for (const b of data.bat) {
      if (b.seasonId !== seasonId) continue;
      const r = teams.get(b.teamKey);
      if (!r) continue;
      r.atBats += b.atBats; r.hits += b.hits; r.walks += b.walks;
      const set = seen.get(b.teamKey) || new Set();
      set.add(b.id || b.name);
      seen.set(b.teamKey, set);
    }
    for (const [k, set] of seen) teams.get(k).players = set.size;
    rows.push(...[...teams.values()].filter(r => r.g > 0));
  }
  data.teamRows = rows;
  return rows;
}

const TEAM_SUM = ['g', 'w', 'l', 't', 'rf', 'ra', 'scored', 'atBats', 'hits', 'walks'];

function teamCareer(rows) {
  return combineRows(rows, {
    key: r => r.teamKey,
    merge: (group) => {
      const out = { ...group[0], seasonCount: group.length, seasonKey: Math.max(...group.map(r => r.seasonKey)), seasonLabel: `${group.length} season${group.length === 1 ? '' : 's'}` };
      for (const f of TEAM_SUM) out[f] = group.reduce((s, r) => s + r[f], 0);
      out.players = null;
      return out;
    }
  });
}

// ---------------------------------------------------------------------------
// Table configs
// ---------------------------------------------------------------------------

function teamConfig() {
  const per = (n, r) => (r.scored ? n / r.scored : null);
  const line = (r) => battingLine({ atBats: r.atBats, hits: r.hits, walks: r.walks, runs: 0 });
  return {
    id: '',
    cardSub: 'season',
    columns: [
      { key: 'name', label: 'Team', type: 'text', value: r => r.team, html: r => teamChipHtml(r) },
      { key: 'season', label: 'Season', type: 'text', defaultDir: 'desc', value: r => r.seasonKey, format: (v, r) => r.seasonLabel, csv: r => r.seasonLabel },
      { key: 'G', label: 'G', title: 'Games', type: 'count', value: r => r.g },
      { key: 'W', label: 'W', title: 'Wins', type: 'count', value: r => r.w },
      { key: 'L', label: 'L', title: 'Losses', type: 'count', lowerIsBetter: true, value: r => r.l },
      { key: 'T', label: 'T', title: 'Ties', type: 'count', shade: false, value: r => r.t },
      { key: 'WPCT', label: 'Win %', type: 'rate', value: r => (r.g ? (r.w + r.t / 2) / r.g : null), format: v => fmtAvg(v) },
      { key: 'RS', label: 'RS', title: 'Runs scored', type: 'count', value: r => (r.scored ? r.rf : null) },
      { key: 'RA', label: 'RA', title: 'Runs allowed', type: 'count', lowerIsBetter: true, value: r => (r.scored ? r.ra : null) },
      { key: 'DIFF', label: 'Diff', title: 'Run differential', type: 'count', value: r => (r.scored ? r.rf - r.ra : null), format: v => (v > 0 ? `+${v}` : String(v)) },
      { key: 'RSG', label: 'RS/G', title: 'Runs scored per game', type: 'rate', value: r => per(r.rf, r), format: v => fmtRate(v, { digits: 1 }) },
      { key: 'RAG', label: 'RA/G', title: 'Runs allowed per game', type: 'rate', lowerIsBetter: true, value: r => per(r.ra, r), format: v => fmtRate(v, { digits: 1 }) },
      { key: 'BA', label: 'BA', title: 'Team batting average', type: 'rate', value: r => (r.atBats ? line(r).avg : null), format: v => fmtAvg(v) },
      { key: 'OBP', label: 'OBP', title: 'Team on-base %', type: 'rate', value: r => (r.atBats + r.walks ? line(r).obp : null), format: v => fmtAvg(v) },
      { key: 'PL', label: 'Players', title: 'Players who batted', type: 'count', shade: false, value: r => r.players }
    ],
    presets: [
      { key: 'standard', label: 'Standard', sort: '-WPCT', card: ['W', 'L', 'WPCT', 'DIFF'],
        columns: ['name', 'season', 'G', 'W', 'L', 'T', 'WPCT', 'RS', 'RA', 'DIFF', 'RSG', 'RAG', 'BA', 'OBP', 'PL'] }
    ]
  };
}

function buildConfig() {
  const omit = state.scope === 'season' ? ['season'] : [];
  if (state.what === 'teams') {
    const c = teamConfig();
    // One season: no Season column. Since 2022: Season reads "5 seasons"; players used doesn't add up.
    const drop = state.scope === 'season' ? ['season'] : state.scope === 'career' ? ['PL'] : [];
    c.presets[0].columns = c.presets[0].columns.filter(k => !drop.includes(k));
    return c;
  }
  const base = state.what === 'pitching'
    ? pitchingTableConfig({ omit: state.team ? [...omit, 'team'] : omit })
    : battingTableConfig({ omit: state.team ? [...omit, 'team'] : omit });
  // Explore combines rows itself (scope), so the table's own Combine is off and
  // Qualified uses the career rule for career rows.
  const q = base.qualifier({ combine: state.scope === 'career' });
  return { ...base, combine: null, qualifier: () => q };
}

async function currentRows() {
  if (state.what === 'teams') {
    const rows = await loadTeamRows();
    if (state.scope === 'season') return rows.filter(r => r.seasonId === state.season);
    return state.scope === 'career' ? teamCareer(rows) : rows;
  }
  const pitching = state.what === 'pitching';
  const merge = (pitching ? pitchingTableConfig() : battingTableConfig()).combine.merge;
  let rows = pitching ? data.pit : data.bat;
  if (state.team) rows = rows.filter(r => r.teamKey === state.team.toLowerCase());
  if (state.scope === 'career') return careerRows(rows, merge);
  rows = seasonRows(rows, merge);
  return state.scope === 'season' ? rows.filter(r => r.seasonId === state.season) : rows;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const statColumns = () => (config?.columns || []).filter(c => c.type === 'count' || c.type === 'rate');

function applyFilters(rows) {
  const cols = new Map(statColumns().map(c => [c.key, c]));
  const active = state.filters.filter(f => cols.has(f.key) && OPS[f.op] && Number.isFinite(f.value));
  if (!active.length) return rows;
  return rows.filter(r => active.every(f => {
    const v = cols.get(f.key).value(r);
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    const target = THOUSANDTHS.has(f.key) && f.value >= 1.5 ? f.value / 1000 : f.value;
    return OPS[f.op][1](v, target);
  }));
}

function renderFilters() {
  const cols = statColumns();
  const statOpts = (sel) => cols.map(c => `<option value="${esc(c.key)}"${c.key === sel ? ' selected' : ''}>${esc(c.title ? `${c.label} (${c.title})` : c.label)}</option>`).join('');
  const opOpts = (sel) => Object.entries(OPS).map(([k, [label]]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${label}</option>`).join('');
  $('xFilters').innerHTML = state.filters.map((f, i) => `
    <div class="x-filter" data-i="${i}">
      <span class="aces-select-wrap"><select class="aces-select is-sm" data-f="key" aria-label="Stat">${statOpts(f.key)}</select></span>
      <span class="aces-select-wrap"><select class="aces-select is-sm x-op" data-f="op" aria-label="Comparison">${opOpts(f.op)}</select></span>
      <input class="aces-input x-val" data-f="value" type="number" step="any" inputmode="decimal" placeholder="Value" aria-label="Value"
        value="${Number.isFinite(f.value) ? esc(String(f.raw ?? f.value)) : ''}">
      <button type="button" class="aces-btn is-ghost is-sm is-icon" data-remove aria-label="Remove filter">${icon('close')}</button>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Controls and URL
// ---------------------------------------------------------------------------

function renderControls() {
  document.querySelectorAll('[data-what]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.what === state.what)));
  document.querySelectorAll('[data-scope]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.scope === state.scope));
    if (b.dataset.scope === 'career') b.textContent = state.what === 'teams' ? `All since ${TEAMS_FROM}` : 'Career';
  });
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  const seasons = state.what === 'teams' ? data.teamSeasons : data.seasons;
  $('xSeasonWrap').hidden = state.scope !== 'season';
  $('xSeason').innerHTML = seasons.map(id => `<option value="${esc(id)}"${id === state.season ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('');
  $('xTeamWrap').hidden = state.what === 'teams';
  const teams = [...TEAM_COLORS].map(cap).sort();
  $('xTeam').innerHTML = `<option value="">All teams</option>${teams.map(t => `<option value="${esc(t)}"${t === state.team ? ' selected' : ''}>${esc(t)}</option>`).join('')}`;
}

function writeUrl() {
  const p = new URLSearchParams(location.search);
  const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
  set('what', state.what !== 'batting' ? state.what : '');
  set('scope', state.scope !== 'season' ? state.scope : '');
  set('season', state.scope === 'season' && state.season !== data.defaultSeason ? state.season : '');
  set('team', state.what !== 'teams' ? state.team : '');
  set('f', state.filters.filter(f => Number.isFinite(f.value)).map(f => `${f.key}:${f.op}:${f.raw ?? f.value}`).join(','));
  set('view', state.view === 'chart' ? 'chart' : '');
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.what = ['batting', 'pitching', 'teams'].includes(p.get('what')) ? p.get('what') : 'batting';
  state.scope = ['career', 'season', 'all'].includes(p.get('scope')) ? p.get('scope') : 'season';
  state.season = p.get('season') || '';
  state.team = TEAM_COLORS.has(String(p.get('team') || '').toLowerCase()) ? cap(p.get('team')) : '';
  state.view = p.get('view') === 'chart' ? 'chart' : 'table';
  state.filters = String(p.get('f') || '').split(',').filter(Boolean).map(s => {
    const [key, op, raw] = s.split(':');
    return { key, op: OPS[op] ? op : 'ge', value: parseFloat(raw), raw };
  });
}

// Drop the table's own URL keys when the table changes shape (another subject).
function clearTableUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of ['preset', 'sort', 'q', 'per', 'shade', 'combine']) p.delete(k);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let seq = 0;

/** Rebuild the table (subject, scope or team changed). */
async function rebuild({ resetTable = false } = {}) {
  const n = ++seq;
  const seasons = state.what === 'teams' ? data.teamSeasons : data.seasons;
  if (!seasons.includes(state.season)) state.season = state.what === 'teams' && !data.teamSeasons.includes(data.defaultSeason) ? data.teamSeasons[0] : data.defaultSeason;
  renderControls();
  if (resetTable) clearTableUrl();
  config = buildConfig();
  // Keep filters on stats this subject has.
  const keys = new Set(statColumns().map(c => c.key));
  state.filters = state.filters.filter(f => keys.has(f.key));
  renderFilters();

  table?.destroy();
  table = mountStatTable($('xTable'), config, {
    emptyMessage: 'Nothing matches. Loosen a filter or pick another season.',
    exportName: `aces-explore-${state.what}-${state.scope === 'season' ? state.season : state.scope}`,
    exportTitle: title(),
    onChange: () => renderChart()
  });
  table.setLoading(true);
  writeUrl();
  const rows = await currentRows();
  if (n !== seq) return;
  data.rows = rows;
  refresh();
}

/** Filters changed: same table, new rows. */
function refresh() {
  if (!table || !data.rows) return;
  const rows = applyFilters(data.rows);
  table.setRows(rows);
  const total = data.rows.length;
  $('xCount').textContent = state.filters.some(f => Number.isFinite(f.value))
    ? `${rows.length} of ${total} ${noun(total)} match`
    : `${total} ${noun(total)}`;
  writeUrl();
  renderChart();
}

const noun = (n) => (state.what === 'teams' ? (n === 1 ? 'team' : 'teams') : n === 1 ? 'player' : 'players');

function title() {
  const what = state.what === 'teams' ? 'Teams' : state.what === 'pitching' ? 'Pitching' : 'Batting';
  const scope = state.scope === 'career' ? (state.what === 'teams' ? `Since ${TEAMS_FROM}` : 'Career')
    : state.scope === 'all' ? 'Every season' : seasonLabel(state.season);
  return `${what} · ${scope}${state.team && state.what !== 'teams' ? ` · ${state.team}` : ''}`;
}

function renderChart() {
  $('xTable').hidden = state.view === 'chart';
  $('xChart').hidden = state.view !== 'chart';
  if (state.view !== 'chart' || !table) return;
  const view = table.getView();
  if (!view) return;
  const numeric = view.columns.filter(c => c.type === 'count' || c.type === 'rate');
  const key = view.sort && numeric.some(c => c.key === view.sort.key) ? view.sort.key : numeric[0]?.key;
  const col = numeric.find(c => c.key === key);
  const opts = numeric.map(c => `<option value="${esc(c.key)}"${c.key === key ? ' selected' : ''}>${esc(c.title ? `${c.label} (${c.title})` : c.label)}</option>`).join('');

  const items = view.rows.map(vr => {
    const cell = vr.cells.find(c => c.col.key === key);
    return { row: vr.row, value: cell?.value, text: cell?.text };
  }).filter(x => typeof x.value === 'number' && Number.isFinite(x.value));
  const shown = state.chartAll ? items : items.slice(0, CHART_TOP);
  const max = Math.max(...shown.map(x => Math.abs(x.value)), 0) || 1;
  const label = (r) => {
    const season = state.scope === 'all' ? ` <span class="x-bar-season">${esc(r.seasonLabel)}</span>` : '';
    if (state.what === 'teams') return `${esc(r.team)}${season}`;
    return `${esc(r.name)}${season}`;
  };
  const bars = shown.map((x, i) => {
    const k = String(x.row.teamKey || '').toLowerCase();
    return `<li class="x-bar">
      <span class="x-bar-rank">${i + 1}</span>
      <span class="x-bar-name">${label(x.row)}</span>
      <span class="x-bar-track"><span class="x-bar-fill${x.value < 0 ? ' is-neg' : ''}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} style="--w:${(Math.abs(x.value) / max * 100).toFixed(1)}%"></span></span>
      <span class="x-bar-val">${esc(x.text ?? '')}</span>
    </li>`;
  }).join('');

  $('xChart').innerHTML = `
    <div class="x-chart-head">
      <label class="aces-field x-chart-pick"><span class="aces-label">Chart</span>
        <span class="aces-select-wrap"><select class="aces-select is-sm" id="xChartStat">${opts}</select></span></label>
      <span class="x-chart-note">${esc(col?.lowerIsBetter ? 'Lowest first' : 'Highest first')}${view.qualifier && view.state.qualified ? ` &middot; ${esc(view.qualifier.label)}` : ''}</span>
    </div>
    ${items.length ? `<ol class="x-bars">${bars}</ol>` : '<p class="aces-empty">Nothing to chart. Loosen a filter or pick another stat.</p>'}
    ${items.length > CHART_TOP ? `<button type="button" class="aces-btn is-sm x-chart-more" data-chart-all>${state.chartAll ? `Show top ${CHART_TOP}` : `Show all ${items.length}`}</button>` : ''}`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

let typing = null;

function wire() {
  document.addEventListener('click', (e) => {
    const what = e.target.closest('[data-what]');
    if (what && what.dataset.what !== state.what) {
      state.what = what.dataset.what;
      return rebuild({ resetTable: true });
    }
    const scope = e.target.closest('[data-scope]');
    if (scope && scope.dataset.scope !== state.scope) { state.scope = scope.dataset.scope; return rebuild(); }
    const view = e.target.closest('[data-view]');
    if (view && view.dataset.view !== state.view) { state.view = view.dataset.view; renderControls(); writeUrl(); return renderChart(); }
    if (e.target.closest('[data-add-filter]')) {
      const first = statColumns().find(c => c.key === (state.what === 'teams' ? 'WPCT' : state.what === 'pitching' ? 'IP' : 'BA')) || statColumns()[0];
      state.filters.push({ key: first.key, op: 'ge', value: NaN, raw: '' });
      renderFilters();
      $('xFilters').querySelector('.x-filter:last-child .x-val')?.focus();
      return;
    }
    if (e.target.closest('[data-clear-filters]')) { state.filters = []; renderFilters(); return refresh(); }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      state.filters.splice(Number(rm.closest('.x-filter').dataset.i), 1);
      renderFilters();
      return refresh();
    }
    if (e.target.closest('[data-chart-all]')) { state.chartAll = !state.chartAll; renderChart(); }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'xSeason') { state.season = e.target.value; return rebuild(); }
    if (e.target.id === 'xTeam') { state.team = e.target.value; return rebuild(); }
    if (e.target.id === 'xChartStat') {
      const col = config.columns.find(c => c.key === e.target.value);
      table.setState({ sort: { key: e.target.value, dir: col?.lowerIsBetter ? 'asc' : 'desc' } });
      return renderChart();
    }
    const f = e.target.closest('.x-filter');
    if (f && e.target.dataset.f !== 'value') {
      const item = state.filters[Number(f.dataset.i)];
      item[e.target.dataset.f] = e.target.value;
      refresh();
    }
  });

  $('xFilters').addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'value') return;
    const item = state.filters[Number(e.target.closest('.x-filter').dataset.i)];
    item.raw = e.target.value.trim();
    item.value = item.raw === '' ? NaN : parseFloat(item.raw);
    clearTimeout(typing);
    typing = setTimeout(refresh, 250);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: 'Explore' });
  readUrl();
  const [players, seasons] = await Promise.all([getAllPlayerStatsOptimized(), getAllSeasons().catch(() => [])]);
  data.bat = buildBattingRows(players);
  data.pit = buildPitchingRows(players);
  data.seasons = sortSeasonIds(data.bat.map(r => r.seasonId).concat(data.pit.map(r => r.seasonId)));
  data.teamSeasons = sortSeasonIds(seasons.map(s => parseStatSeasonId(s.id).id).filter(id => id && parseInt(id, 10) >= TEAMS_FROM));
  data.defaultSeason = pickDefaultSeason(data.seasons, ctx?.config);
  if (!state.season) state.season = data.defaultSeason;

  // Team games for the single-season minimums (Qualified).
  await Promise.all([applyTeamGames(data.bat, { fallbackToPlayerGames: true }), applyTeamGames(data.pit)])
    .catch(err => console.warn('[explore] team games unavailable; Qualified will be empty', err));

  wire();
  await rebuild();
  pageReady();
}

main().catch((err) => showPageError(err, { container: '#xTable' }));
