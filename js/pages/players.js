// js/pages/players.js
// players.html: every player who has batted for the Aces.
//
//   By team  each player under the team of their newest regular season, with
//            that season's roster first and past players folded underneath;
//            teams with no players this season are listed under Former teams.
//   Table    one sortable table of career lines (js/ui/table.js).
// Search, This season / All-time and a team filter apply to both views, and
// are kept in the URL: players.html?view=table&scope=all&team=Teal&q=gio
//
// "This season" is the current season, or in the offseason the latest one
// (getDisplaySeasonId), so the page isn't empty between seasons.
// Data: aggregatedPlayerStats (getAllPlayerStatsOptimized) for career lines,
// and rosters/{seasonId}-{team} for who is on each team this season: the
// roster decides the team, so players with no submitted stats yet (a team
// that hasn't entered stats, or a new player) still show up.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, collection, getDocs } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { mountStatTable } from '../ui/table.js';
import { teamChipHtml, TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { battingAverage, onBasePct } from '../domain/stats.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const EXCLUDED_TEAMS = new Set(['kings']);   // a guest team in old data, as the old page left out

const state = { view: 'teams', scope: 'current', team: '', q: '' };
let players = [];
let currentSeason = '';
let me = new Set();
let table = null;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** One entry per player (by stats doc ID) with a career line and their latest team. */
function buildPlayers(docs) {
  const rows = buildBattingRows(docs).filter(r => r.team && !EXCLUDED_TEAMS.has(r.teamKey));
  const byId = new Map();
  for (const r of rows) {
    const key = r.id || r.name;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(r);
  }
  const out = [];
  for (const [id, list] of byId) {
    list.sort((a, b) => b.seasonKey - a.seasonKey);
    const regular = list.filter(r => !r.sub);
    const latest = regular[0] || list[0];   // a sub season only decides the team when there's nothing else
    const t = list.reduce((s, r) => ({ g: s.g + r.games, ab: s.ab + r.atBats, h: s.h + r.hits, r: s.r + r.runs, bb: s.bb + r.walks }), { g: 0, ab: 0, h: 0, r: 0, bb: 0 });
    const seasonIds = new Set(regular.map(r => r.seasonId));
    const years = [...seasonIds].map(s => s.slice(0, 4)).sort();
    const now = list.filter(r => r.seasonId === currentSeason);
    out.push({
      id, name: latest.name, ids: latest.ids,
      team: latest.team, teamKey: latest.teamKey,
      lastSeasonId: latest.seasonId, lastKey: latest.seasonKey,
      current: now.some(r => !r.sub),
      currentSub: !now.some(r => !r.sub) && now.length > 0,
      subOnly: regular.length === 0,
      seasons: seasonIds.size,
      firstYear: years[0] || latest.seasonId.slice(0, 4),
      firstKey: regular.length ? Math.min(...regular.map(r => r.seasonKey)) : 0,
      teamGames: regular.filter(r => r.teamKey === latest.teamKey).reduce((s, r) => s + r.games, 0),
      games: t.g, atBats: t.ab, hits: t.h, runs: t.r, walks: t.bb,
      avg: t.ab ? battingAverage(t.h, t.ab) : null,
      obp: t.ab + t.bb ? onBasePct(t.h, t.bb, t.ab) : null
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** rosters/{seasonId}-{team} docs for one season: [{ team, players: [...] }]. */
async function loadRosters(seasonId) {
  if (!seasonId) return [];
  const snap = await getDocs(collection(db, 'rosters'));
  return snap.docs
    .filter(d => (d.data().seasonId || d.id.split('-').slice(0, 2).join('-')) === seasonId)
    .map(d => {
      const v = d.data();
      const teamKey = String(v.teamName || d.id.split('-').slice(2).join('-')).toLowerCase();
      return { team: teamKey.charAt(0).toUpperCase() + teamKey.slice(1), teamKey, players: Array.isArray(v.players) ? v.players : [] };
    })
    .filter(r => r.players.length && !EXCLUDED_TEAMS.has(r.teamKey));
}

/**
 * Put this season's roster on top of the stats: a rostered player is current
 * on the roster's team (stats or not); someone on a roster with no stats yet
 * gets an entry of their own.
 */
function applyRosters(list, rosters) {
  const byId = new Map(), byName = new Map();
  list.forEach(p => {
    [p.id, ...(p.ids || [])].forEach(id => id && byId.set(String(id), p));
    byName.set(norm(p.name), p);
  });
  for (const r of rosters) {
    for (const rp of r.players) {
      const name = String(rp.name || '').trim();
      if (!name && !rp.id) continue;
      let p = byId.get(String(rp.id || '')) || byId.get(String(rp.authId || '')) || byName.get(norm(name));
      if (!p) {
        p = {
          id: rp.authId || rp.id || '', ids: [rp.id, rp.authId].filter(Boolean), linkByName: !rp.authId,
          name, lastSeasonId: currentSeason, lastKey: seasonSortKey(currentSeason), firstKey: 0, seasons: 0, firstYear: currentSeason.slice(0, 4),
          teamGames: 0, games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, avg: null, obp: null, noStats: true
        };
        list.push(p);
        byName.set(norm(name), p);
      }
      Object.assign(p, {
        team: r.team, teamKey: r.teamKey, current: true, currentSub: false, rostered: true,
        number: rp.number ?? p.number ?? null, captain: !!rp.captain || !!p.captain
      });
      if (!(p.lastKey >= seasonSortKey(currentSeason))) { p.lastSeasonId = currentSeason; p.lastKey = seasonSortKey(currentSeason); }
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** First season on a roster: this season, or rostered now with no regular season before. */
const isNew = (p) => p.current && (!p.firstKey || p.firstKey === seasonSortKey(currentSeason));

const playerHref = (p) => (p.linkByName ? `player.html?name=${encodeURIComponent(p.name)}` : `player.html?id=${encodeURIComponent(p.id)}`);

const isMe = (p) => [p.id, ...(p.ids || [])].some(id => me.has(id));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function filtered() {
  const q = norm(state.q).trim();
  return players.filter(p =>
    (state.scope === 'all' || p.current || p.currentSub) &&
    (!state.team || p.teamKey === state.team.toLowerCase()) &&
    (!q || norm(p.name).includes(q)));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderStats() {
  const current = players.filter(p => p.current);
  const teamsNow = new Set(current.map(p => p.teamKey));
  const seasons = new Set();
  players.forEach(p => seasons.add(p.firstYear));
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  const first = [...seasons].sort()[0];
  $('psStats').innerHTML = [
    tile(String(players.length), 'Players all-time', first ? `since ${first}` : ''),
    tile(String(current.length), 'On a roster', currentSeason ? seasonLabel(currentSeason) : ''),
    tile(String(teamsNow.size), 'Teams', currentSeason ? seasonLabel(currentSeason) : ''),
    tile(String(players.filter(isNew).length), 'First season', currentSeason ? 'new this season' : '')
  ].join('');
}

function teamOptions() {
  const teams = new Map();
  players.forEach(p => teams.set(p.teamKey, p.team));
  return [...teams].sort((a, b) => a[1].localeCompare(b[1]));
}

function renderToolbar() {
  const opts = teamOptions().map(([k, t]) => `<option value="${esc(t)}"${state.team.toLowerCase() === k ? ' selected' : ''}>${esc(t)}</option>`).join('');
  $('psToolbar').innerHTML = `
    <label class="ps-search">${icon('search')}<span class="u-sr-only">Find a player</span>
      <input class="aces-input" type="search" id="psQuery" placeholder="Find a player" value="${esc(state.q)}" autocomplete="off" spellcheck="false"></label>
    <div class="aces-segmented" role="group" aria-label="Which players">
      <button type="button" class="aces-segment" data-scope="current" aria-pressed="${state.scope === 'current'}">${currentSeason ? esc(seasonLabel(currentSeason)) : 'This season'}</button>
      <button type="button" class="aces-segment" data-scope="all" aria-pressed="${state.scope === 'all'}">All-time</button>
    </div>
    <span class="aces-select-wrap is-inline"><select class="aces-select" id="psTeam" aria-label="Team">
      <option value="">All teams</option>${opts}</select></span>
    <div class="aces-segmented ps-view" role="group" aria-label="View">
      <button type="button" class="aces-segment" data-view="teams" aria-pressed="${state.view === 'teams'}">${icon('grid')}<span>By team</span></button>
      <button type="button" class="aces-segment" data-view="table" aria-pressed="${state.view === 'table'}">${icon('table')}<span>Table</span></button>
    </div>`;
}

function playerLine(p) {
  if (p.noStats) return `${p.number ? `#${p.number} · ` : ''}No games yet`;
  const bits = [`${p.games} G`, `${fmtAvg(p.avg, { empty: '-' })} AVG`];
  if (p.current && p.number) bits.unshift(`#${p.number}`);
  bits.push(p.seasons ? `${p.seasons} season${p.seasons === 1 ? '' : 's'}` : 'Sub only');
  return bits.join(' · ');
}

function playerRow(p, { past = false } = {}) {
  const tags = [
    isMe(p) ? '<span class="aces-badge is-accent">You</span>' : '',
    p.captain && p.current ? '<span class="aces-badge is-outline">Captain</span>' : '',
    isNew(p) ? '<span class="aces-badge is-brand">New</span>' : '',
    p.currentSub ? '<span class="aces-badge is-outline">Sub</span>' : ''
  ].join('');
  const initials = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<li><a class="ps-player${isMe(p) ? ' is-me' : ''}" href="${esc(playerHref(p))}">
    <span class="aces-avatar ps-avatar" aria-hidden="true">${esc(initials)}</span>
    <span class="ps-player-text"><strong>${esc(p.name)}${tags}</strong>
      <span>${esc(past ? `Last played ${seasonLabel(p.lastSeasonId)} · ${playerLine(p)}` : playerLine(p))}</span></span>
    ${icon('chevron-right')}</a></li>`;
}

function teamCard(team, list, { former = false } = {}) {
  const key = list[0].teamKey;
  const now = list.filter(p => p.current || p.currentSub).sort((a, b) => Number(b.current) - Number(a.current) || Number(!!b.captain) - Number(!!a.captain) || b.teamGames - a.teamGames || a.name.localeCompare(b.name));
  const past = list.filter(p => !p.current && !p.currentSub).sort((a, b) => b.lastKey - a.lastKey || a.name.localeCompare(b.name));
  const searching = !!state.q.trim();
  const color = TEAM_COLORS.has(key) ? ` data-team-color="${esc(key)}"` : '';
  const logo = `<img class="ps-logo" src="logos/${esc(key)}.png" alt="" loading="lazy" data-logo>`;
  const href = `team.html?${new URLSearchParams({ team, ...(now.length && currentSeason ? { season: currentSeason } : {}) })}`;
  return `<section class="aces-card ps-team"${color}>
    <div class="ps-team-head">
      ${logo}
      <div><h2 class="ps-team-name"><a href="${esc(href)}">${esc(team)}</a></h2>
        <p class="ps-team-meta">${former
          ? `${list.length} player${list.length === 1 ? '' : 's'} · last season ${esc(seasonLabel(past[0]?.lastSeasonId || ''))}`
          : `${now.filter(p => p.current).length} on the ${esc(seasonLabel(currentSeason))} roster${state.scope === 'all' ? ` · ${list.length} all-time` : ''}`}</p></div>
    </div>
    ${now.length ? `<ul class="ps-list">${now.map(p => playerRow(p)).join('')}</ul>` : ''}
    ${past.length && state.scope === 'all' ? (now.length
      ? `<details class="ps-past"${searching ? ' open' : ''}><summary>${icon('chevron-down')}Past players <span>${past.length}</span></summary>
          <ul class="ps-list is-past">${past.map(p => playerRow(p, { past: true })).join('')}</ul></details>`
      : `<ul class="ps-list is-past">${past.map(p => playerRow(p, { past: true })).join('')}</ul>`) : ''}
  </section>`;
}

function renderTeams(list) {
  const groups = new Map();
  for (const p of list) {
    if (!groups.has(p.team)) groups.set(p.team, []);
    groups.get(p.team).push(p);
  }
  const all = [...groups].sort((a, b) => a[0].localeCompare(b[0]));
  const active = all.filter(([, ps]) => ps.some(p => p.current || p.currentSub));
  const former = all.filter(([, ps]) => !ps.some(p => p.current || p.currentSub));
  $('psResults').innerHTML = `
    ${active.length ? `<div class="ps-teams">${active.map(([t, ps]) => teamCard(t, ps)).join('')}</div>` : ''}
    ${former.length ? `<h2 class="ps-section-title">${icon('scroll')}Former teams <span>${former.length}</span></h2>
      <div class="ps-teams is-former">${former.map(([t, ps]) => teamCard(t, ps, { former: true })).join('')}</div>` : ''}`;
}

const tableConfig = {
  id: '',
  cardSub: 'team',
  columns: [
    { key: 'name', label: 'Player', type: 'text', value: r => r.name,
      html: r => `<a href="${esc(playerHref(r))}">${esc(r.name)}</a>${isMe(r) ? ' <span class="aces-badge is-accent">You</span>' : ''}` },
    { key: 'team', label: 'Team', type: 'text', value: r => r.team, html: r => teamChipHtml({ ...r, seasonCount: 1, seasonId: r.lastSeasonId }) },
    { key: 'last', label: 'Last', title: 'Last season played', type: 'text', defaultDir: 'desc', value: r => r.lastKey, format: (v, r) => seasonLabel(r.lastSeasonId), csv: r => seasonLabel(r.lastSeasonId) },
    { key: 'S', label: 'Seasons', title: 'Regular seasons played', type: 'count', shade: false, perGame: false, value: r => r.seasons },
    { key: 'G', label: 'G', type: 'count', perGame: false, value: r => r.games },
    { key: 'AB', label: 'AB', type: 'count', value: r => r.atBats },
    { key: 'H', label: 'H', type: 'count', value: r => r.hits },
    { key: 'R', label: 'R', type: 'count', value: r => r.runs },
    { key: 'BB', label: 'BB', type: 'count', value: r => r.walks },
    { key: 'AVG', label: 'AVG', type: 'rate', value: r => r.avg, format: v => fmtAvg(v, { empty: '-' }) },
    { key: 'OBP', label: 'OBP', type: 'rate', value: r => r.obp, format: v => fmtAvg(v, { empty: '-' }) }
  ],
  presets: [{ key: 'career', label: 'Career', sort: 'name', card: ['G', 'H', 'AVG', 'last'],
    columns: ['name', 'team', 'last', 'S', 'G', 'AB', 'H', 'R', 'BB', 'AVG', 'OBP'] }],
  games: r => r.games,
  // Career AVG and OBP leaders need 150 PA, as on the leaders page.
  qualifier: () => ({ label: 'min 150 PA career', test: r => r.atBats + r.walks >= 150 })
};

function renderTable(list) {
  if (!table) {
    $('psResults').innerHTML = '<div class="aces-card is-flush ps-table"><div id="psTable"></div></div>';
    table = mountStatTable($('psTable'), tableConfig, {
      emptyMessage: 'No players match.',
      exportName: 'aces-players', exportTitle: 'Mountainside Aces players',
      rowClass: r => (isMe(r) ? 'is-me' : '')
    });
  }
  table.setRows(list);
}

function render() {
  const list = filtered();
  if (!list.length) {
    table = null;
    $('psResults').innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('search')}<p class="aces-empty-title">No players match</p>
      <p>${state.scope === 'current' ? `Try All-time to include players from earlier seasons.` : 'Check the spelling or clear the team filter.'}</p></div></div>`;
    return;
  }
  if (state.view === 'table') renderTable(list);
  else { table = null; renderTeams(list); }
}

// ---------------------------------------------------------------------------
// State and events
// ---------------------------------------------------------------------------

function readUrl() {
  const q = new URLSearchParams(location.search);
  state.view = q.get('view') === 'table' ? 'table' : 'teams';
  state.scope = q.get('scope') === 'all' ? 'all' : q.get('scope') === 'current' ? 'current' : state.scope;
  state.team = q.get('team') || '';
  state.q = q.get('q') || '';
}

function writeUrl() {
  const q = new URLSearchParams(location.search);
  const set = (k, v, dflt) => (v && v !== dflt ? q.set(k, v) : q.delete(k));
  set('view', state.view, 'teams');
  set('scope', state.scope, null);
  set('team', state.team, '');
  set('q', state.q.trim(), '');
  const s = q.toString();
  history.replaceState({}, '', `${location.pathname}${s ? `?${s}` : ''}`);
}

function update(changes) {
  Object.assign(state, changes);
  writeUrl();
  renderToolbar();
  render();
}

function wire() {
  let timer = null;
  $('psToolbar').addEventListener('input', (e) => {
    if (e.target.id !== 'psQuery') return;
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; writeUrl(); render(); }, 120);
  });
  $('psToolbar').addEventListener('change', (e) => {
    if (e.target.id === 'psTeam') {
      const team = e.target.value;
      // A team picked with no players this season: show its all-time list.
      const hasNow = players.some(p => p.team === team && (p.current || p.currentSub));
      update({ team, scope: team && !hasNow ? 'all' : state.scope });
    }
  });
  $('psToolbar').addEventListener('click', (e) => {
    const s = e.target.closest('[data-scope]');
    if (s) return update({ scope: s.dataset.scope });
    const v = e.target.closest('[data-view]');
    if (v) return update({ view: v.dataset.view });
  });
  $('psToolbar').addEventListener('keydown', (e) => {
    if (e.target.id === 'psQuery' && e.key === 'Enter') {
      const list = filtered();
      if (list.length === 1) location.href = playerHref(list[0]);
    }
  });
  document.addEventListener('error', (e) => { if (e.target.matches?.('[data-logo]')) e.target.remove(); }, true);
}

async function main() {
  const page = await initPage({ title: 'Players' });
  const [docs, season] = await Promise.all([getAllPlayerStatsOptimized(), getDisplaySeasonId().catch(() => null)]);
  currentSeason = season || '';
  me = new Set([page.user?.uid, page.profile?.id, page.profile?.playerId, page.profile?.mergedFromProfile, page.profile?.linkedPlayerId].filter(Boolean));
  const load = async () => applyRosters(buildPlayers(docs || []), await loadRosters(currentSeason).catch((err) => {
    console.warn('[players] rosters unavailable; teams come from stats', err);
    return [];
  }));
  players = await load();
  if (!currentSeason || !players.some(p => p.current)) {
    // Nothing for the display season yet (no rosters or stats): use the newest season with stats.
    const newest = players.reduce((m, p) => (!p.noStats && p.lastKey > m.key ? { key: p.lastKey, id: p.lastSeasonId } : m), { key: 0, id: '' });
    currentSeason = newest.id;
    players = await load();
  }
  readUrl();
  if (!new URLSearchParams(location.search).get('scope')) state.scope = state.team || state.q ? 'all' : 'current';
  renderStats();
  renderToolbar();
  render();
  wire();
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });

