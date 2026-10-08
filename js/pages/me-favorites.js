// js/pages/me-favorites.js
// me.html#favorites: favorite teams (record, place, next game) and up to 10
// favorite players (this season's line), with add and remove. Replaced
// favorites.html and the Favorites tab of profile.html / profile-fan.html.
//
// Stored on users/{uid} as favoriteTeams (team names) and favoritePlayers
// (player names), as before, so the old pages keep reading the same lists.

import { db, doc, getDoc, updateDoc, serverTimestamp } from '../core/firebase.js';
import { getSeasonSummary } from '../data/summaries.js';
import { getSearchIndex } from '../data/search-index.js';
import { battingLine } from '../domain/stats.js';
import { formatTime, formatRelativeDay } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { mySeason } from '../ui/my-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, formatPlayerName } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const MAX_PLAYERS = 10;
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const TEAMS = [...TEAM_COLORS].map(cap).sort();
const norm = (s) => formatPlayerName(String(s || '')).toLowerCase().trim();

let ctx = null;          // { uid, canWrite, seasonId, profile }
let host = null;
let teams = [];
let players = [];
let summary = null;
let index = null;
const playerDocs = new Map();   // name (normalized) -> aggregatedPlayerStats doc or null

const ordinal = (n) => {
  const v = n % 100;
  return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th');
};

const chip = (team) => {
  const k = String(team || '').toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?team=${encodeURIComponent(team)}"><span class="aces-team-dot"></span>${esc(team)}</a>`;
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function indexEntry(name) {
  const n = norm(name);
  return (index?.players || []).find(p => norm(p.name) === n) || null;
}

async function loadPlayer(name) {
  const key = norm(name);
  if (playerDocs.has(key)) return playerDocs.get(key);
  const entry = indexEntry(name);
  let data = null;
  if (entry?.id) {
    try {
      const snap = await getDoc(doc(db, 'aggregatedPlayerStats', entry.id));
      if (snap.exists()) data = { id: snap.id, ...snap.data() };
    } catch (err) {
      console.warn('[me] favorite player unavailable', name, err);
    }
  }
  playerDocs.set(key, data);
  return data;
}

async function save(field, list) {
  if (!ctx.canWrite) {
    showToast('Favorites are read-only while viewing as someone else.', 'info');
    return false;
  }
  try {
    await updateDoc(doc(db, 'users', ctx.uid), { [field]: list, updatedAt: serverTimestamp() });
    ctx.profile[field] = list;
    return true;
  } catch (err) {
    console.error('[me] saving favorites failed', err);
    showToast('Could not save your favorites. Try again.', 'error');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function teamCard(name) {
  const row = (summary?.standings || []).find(r => r.team.toLowerCase() === name.toLowerCase());
  const next = (summary?.upcoming || []).find(g => g.home.toLowerCase() === name.toLowerCase() || g.away.toLowerCase() === name.toLowerCase());
  const record = row ? `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}` : '';
  return `<li class="fav-card" data-team-color="${esc(name.toLowerCase())}">
    <div class="fav-card-head">${chip(name)}
      ${ctx.canWrite ? `<button type="button" class="aces-btn is-ghost is-sm is-icon" data-unfav-team="${esc(name)}" aria-label="Remove ${esc(name)}">${icon('close')}</button>` : ''}
    </div>
    ${row ? `<p class="fav-line"><strong>${esc(record)}</strong> &middot; ${esc(ordinal(row.rank))} place${row.streak ? ` &middot; ${esc(row.streak)}` : ''}</p>` : `<p class="fav-line is-muted">No games yet in ${esc(seasonLabel(ctx.seasonId))}</p>`}
    ${next ? `<p class="fav-next">${icon('calendar')} ${next.home.toLowerCase() === name.toLowerCase() ? `vs ${esc(next.away)}` : `at ${esc(next.home)}`} &middot; ${esc(formatRelativeDay(next.dateKey))}${next.time ? ` &middot; ${esc(formatTime(next.time))}` : ''}</p>` : ''}
  </li>`;
}

function playerCard(name, data) {
  const s = data ? mySeason(data, ctx.seasonId) : null;
  const team = s?.team || indexEntry(name)?.team || '';
  const line = s?.line && s.line.atBats + s.line.walks > 0 ? s.line : null;
  const b = line ? battingLine(line) : null;
  const id = data?.id || indexEntry(name)?.id;
  const href = id ? `player.html?id=${encodeURIComponent(id)}` : `player.html?name=${encodeURIComponent(name)}`;
  return `<li class="fav-card"${team ? ` data-team-color="${esc(team.toLowerCase())}"` : ''}>
    <div class="fav-card-head">
      <a class="fav-name" href="${esc(href)}">${esc(formatPlayerName(name))}</a>
      ${ctx.canWrite ? `<button type="button" class="aces-btn is-ghost is-sm is-icon" data-unfav-player="${esc(name)}" aria-label="Remove ${esc(name)}">${icon('close')}</button>` : ''}
    </div>
    ${team ? `<div>${chip(team)}</div>` : ''}
    ${line
      ? `<p class="fav-line"><strong>${esc(fmtAvg(b.avg))}</strong> BA &middot; ${esc(fmtAvg(b.obp))} OBP &middot; ${line.hits} H &middot; ${line.games} G</p>`
      : `<p class="fav-line is-muted">No stats in ${esc(seasonLabel(ctx.seasonId))} yet</p>`}
    ${b && b.avg >= 0.4 && line.atBats >= 10 ? '<p class="fav-flag">Hitting .400+</p>' : ''}
  </li>`;
}

function render() {
  const teamOpts = TEAMS.filter(t => !teams.includes(t)).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const names = (index?.players || []).filter(p => !players.some(f => norm(f) === norm(p.name)));
  const full = players.length >= MAX_PLAYERS;

  host.innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('trophy')} Favorite teams</h2></div>
      ${teams.length ? `<ul class="fav-grid">${teams.map(teamCard).join('')}</ul>` : '<p class="me-empty">No favorite teams yet. Add one to see its record and next game here.</p>'}
      ${ctx.canWrite && teamOpts ? `<form class="fav-add" data-add="team">
        <span class="aces-select-wrap"><select class="aces-select is-sm" name="team" aria-label="Team to add"><option value="">Add a team</option>${teamOpts}</select></span>
        <button type="submit" class="aces-btn is-sm">${icon('plus')} Add</button>
      </form>` : ''}
    </section>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('star')} Favorite players <span class="fav-count">${players.length}/${MAX_PLAYERS}</span></h2></div>
      ${players.length ? `<ul class="fav-grid">${players.map(n => playerCard(n, playerDocs.get(norm(n)))).join('')}</ul>` : '<p class="me-empty">No favorite players yet. Add up to 10 to follow their season here.</p>'}
      ${ctx.canWrite ? (full ? '<p class="me-empty">That&rsquo;s 10. Remove one to add another.</p>' : `<form class="fav-add" data-add="player">
        <input class="aces-input" name="player" list="favPlayerList" placeholder="Add a player" autocomplete="off" aria-label="Player to add">
        <datalist id="favPlayerList">${names.map(p => `<option value="${esc(p.name)}">${esc(p.team || '')}</option>`).join('')}</datalist>
        <button type="submit" class="aces-btn is-sm">${icon('plus')} Add</button>
      </form>`) : ''}
    </section>`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function onSubmit(e) {
  const form = e.target.closest('.fav-add');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.add === 'team') {
    const t = form.elements.team.value;
    if (!t || teams.includes(t)) return;
    const next = [...teams, t];
    if (await save('favoriteTeams', next)) { teams = next; render(); showToast(`${t} added to favorites.`, 'success'); }
    return;
  }
  const typed = form.elements.player.value.trim();
  if (!typed) return;
  const entry = indexEntry(typed);
  if (!entry) return showToast('Pick a player from the list.', 'info');
  if (players.some(p => norm(p) === norm(entry.name))) return showToast(`${entry.name} is already a favorite.`, 'info');
  if (players.length >= MAX_PLAYERS) return;
  const next = [...players, entry.name];
  if (await save('favoritePlayers', next)) {
    players = next;
    await loadPlayer(entry.name);
    render();
    showToast(`${entry.name} added to favorites.`, 'success');
  }
}

async function onClick(e) {
  const t = e.target.closest('[data-unfav-team]');
  const p = e.target.closest('[data-unfav-player]');
  if (t) {
    const next = teams.filter(x => x !== t.dataset.unfavTeam);
    if (await save('favoriteTeams', next)) { teams = next; render(); }
  } else if (p) {
    const next = players.filter(x => x !== p.dataset.unfavPlayer);
    if (await save('favoritePlayers', next)) { players = next; render(); }
  }
}

/**
 * @param {HTMLElement} el
 * @param {{ uid: string, canWrite: boolean, seasonId: string, profile: object }} o
 */
export async function mountFavorites(el, o) {
  ctx = o;
  host = el;
  teams = (o.profile.favoriteTeams || []).map(cap);
  players = [...(o.profile.favoritePlayers || [])];
  host.innerHTML = '<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></section>';
  // allowBuild false: a stale stored summary is fine for records; never build 50 reads here.
  const [sum, ix] = await Promise.all([
    getSeasonSummary(o.seasonId, { allowBuild: false }).catch(() => null),
    getSearchIndex().catch(() => null)
  ]);
  summary = sum?.summary || null;
  index = ix;
  await Promise.all(players.map(loadPlayer));
  render();
  host.addEventListener('submit', onSubmit);
  host.addEventListener('click', onClick);
}
