// js/pages/roster-management.js
// roster-management.html: RSVPs for upcoming games, the batting order and the
// defense by inning. Everyone on a team can RSVP for themselves; captains,
// team staff, league staff and admins can set RSVPs for anyone and build the
// lineup. Rebuilt in v2.0 from the React page; same Firestore data
// (see js/data/lineups.js), so v1 and v2 can be used side by side.

import { initPage, pageReady, showPageState } from '../core/app.js';
import { db, doc, getDoc } from '../core/firebase.js';
import { hasRole } from '../core/auth.js';
import { getCurrentSeason } from '../data/seasons.js';
import { getSeasonGames } from '../data/games.js';
import { normalizeGame } from '../domain/standings.js';
import { todayKey, formatGameDate, formatGameDateTime, formatTime, timeSortValue, formatRelativeDay } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { teamDot } from '../ui/game-shared.js';
import { watchGameRsvps, seasonAverage, installOfflineBridge } from '../data/lineups.js';
import {
  S, SEASON_RULES, RSVP, RSVP_CYCLE, initials, rsvpStatus, rsvpCounts, lastRsvpUpdate,
  canEditRsvp, setRsvp, ensureLineup, currentLineup, currentGame, catcherLocked, flush, hasPending
} from './roster-core.js';
import { renderBatting, renderDefense, lineupAction, lineupDrop } from './roster-lineup.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let unsubs = [];
let allGames = [];

// ---------------------------------------------------------------------------
// Who can do what
// ---------------------------------------------------------------------------

const lower = (s) => String(s || '').trim().toLowerCase();

function teamRole(profile, team) {
  const entry = Object.entries(profile?.teamRoles || {}).find(([k]) => lower(k) === lower(team));
  return entry && entry[1]?.status === 'active' ? entry[1].role : null;
}

function managesTeam(profile, team) {
  if (hasRole(profile, 'league-staff')) return true;
  const role = teamRole(profile, team);
  if (role === 'captain' || role === 'team-staff') return true;
  return !!(profile?.isCaptain && lower(profile.linkedTeam) === lower(team));
}

/** Teams this person can open. League staff and admins get every team. */
function teamChoices(profile, seasonTeams) {
  const named = (t) => seasonTeams.find((s) => lower(s) === lower(t));
  if (hasRole(profile, 'league-staff')) {
    const own = profile?.linkedTeam && named(profile.linkedTeam) ? profile.linkedTeam : null;
    return [...new Set([...(own ? [own] : []), ...seasonTeams.filter((t) => lower(t) !== lower(own))])];
  }
  const out = [];
  // The linked team keeps its stored spelling: lineups are saved under it.
  if (profile?.linkedTeam && named(profile.linkedTeam)) out.push(profile.linkedTeam);
  Object.entries(profile?.teamRoles || {}).forEach(([k, v]) => {
    if (v?.status === 'active' && named(k) && !out.some((t) => lower(t) === lower(k))) out.push(named(k));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function gameRow(g, team) {
  const isHome = lower(g.home) === lower(team);
  return {
    id: g.id,
    dateKey: g.dateKey,
    time: g.time,
    opponent: isHome ? g.away : g.home,
    isHome,
    type: g.type,
    round: g.round,
    status: g.status,
    location: g.location,
    label: formatGameDateTime(g.dateKey, g.time),
    short: formatGameDate(g.dateKey, 'short')
  };
}

async function loadRoster(team, seasonId) {
  const snap = await getDoc(doc(db, 'rosters', `${seasonId}-${lower(team)}`));
  if (!snap.exists()) return [];
  return (snap.data().players || []).map((p) => {
    const authId = p.authId || '';
    const legacyId = p.id || '';
    return {
      id: authId || legacyId,
      authId,
      legacyId,
      name: p.name || '',
      jersey: p.number ? String(p.number) : '',
      isCaptain: !!p.captain,
      avg: null
    };
  }).filter((p) => p.id && p.name).sort((a, b) => a.name.localeCompare(b.name));
}

async function openTeam(team) {
  unsubs.forEach((u) => u());
  unsubs = [];
  await flush();

  S.team = team;
  S.canManage = managesTeam(S.profile, team);
  S.staffOnly = S.canManage && !hasRole(S.profile, 'league-staff') && teamRole(S.profile, team) === 'team-staff';
  S.rsvps = {};
  S.lineups = {};
  S.templates = null;

  S.players = await loadRoster(team, S.season.id).catch((err) => {
    console.error('[roster] roster', err);
    return [];
  });
  S.byId = new Map(S.players.map((p) => [p.id, p]));
  S.me = S.players.find((p) => (p.authId && p.authId === S.user.uid) || (S.profile?.linkedPlayer && p.name === S.profile.linkedPlayer)) || null;

  const today = todayKey();
  const mine = allGames.filter((g) => lower(g.home) === lower(team) || lower(g.away) === lower(team));
  const byTime = (a, b) => (a.dateKey === b.dateKey ? timeSortValue(a.time) - timeSortValue(b.time) : a.dateKey < b.dateKey ? -1 : 1);
  S.games = mine.filter((g) => g.dateKey && g.dateKey >= today).sort(byTime).map((g) => gameRow(g, team));
  S.past = mine.filter((g) => g.dateKey && g.dateKey < today).sort((a, b) => -byTime(a, b)).map((g) => gameRow(g, team));

  const wanted = params.get('game');
  S.gameId = S.games.some((g) => g.id === wanted) ? wanted : S.games[0]?.id || '';

  // Live RSVPs for every upcoming game (the first snapshot is the initial read).
  S.games.forEach((g) => {
    unsubs.push(watchGameRsvps(g.id, (map) => {
      S.rsvps[g.id] = map;
      scheduleRender();
    }));
  });

  if (S.canManage) loadAverages();
  if (S.gameId) await ensureLineup(S.gameId);
  syncUrl();
  render();
}

async function loadAverages() {
  const team = S.team;
  await Promise.all(S.players.map(async (p) => { p.avg = await seasonAverage(p, S.season.id); }));
  if (team === S.team) scheduleRender();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function syncUrl() {
  const q = new URLSearchParams();
  if (S.teamChoices.length > 1) q.set('team', S.team);
  if (S.gameId) q.set('game', S.gameId);
  if (S.tab !== 'rsvp') q.set('tab', S.tab);
  const qs = q.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function renderHead() {
  $('rmKicker').textContent = `${S.season.label}${S.team ? ` \u00b7 ${S.team}` : ''}`;
  const role = !S.canManage ? '' : S.staffOnly ? 'Team staff' : hasRole(S.profile, 'league-staff') && !managesOwn() ? 'League staff' : 'Captain';
  $('rmWho').innerHTML = `${S.me ? `Signed in as ${esc(S.me.name)}` : S.profile?.displayName ? `Signed in as ${esc(S.profile.displayName)}` : ''}${role ? ` <span class="aces-badge is-brand">${esc(role)}</span>` : ''}`;
  const pick = $('rmTeamPick');
  if (S.teamChoices.length > 1) {
    pick.hidden = false;
    $('rmTeam').innerHTML = S.teamChoices.map((t) => `<option value="${esc(t)}"${t === S.team ? ' selected' : ''}>${esc(t)}</option>`).join('');
  } else pick.hidden = true;
}

function managesOwn() {
  const role = teamRole(S.profile, S.team);
  return role === 'captain' || role === 'team-staff' || (S.profile?.isCaptain && lower(S.profile.linkedTeam) === lower(S.team));
}

function renderGames() {
  const box = $('rmGames');
  if (!S.games.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = S.games.map((g) => {
    const c = rsvpCounts(g.id);
    const sel = g.id === S.gameId;
    return `<button class="rm-game${sel ? ' is-active' : ''}" type="button" data-act="game" data-id="${esc(g.id)}" aria-pressed="${sel}">
      <span class="rm-game-day">${esc(formatRelativeDay(g.dateKey))}${g.time ? ` \u00b7 ${esc(formatTime(g.time))}` : ''}</span>
      <span class="rm-game-opp">${g.isHome ? 'vs' : 'at'} ${teamDot(g.opponent)} ${esc(g.opponent)}</span>
      <span class="rm-game-meta">${g.type === 'playoff' ? `<span class="aces-badge is-accent">${icon('trophy')} ${esc(g.round || 'Playoffs')}</span>` : ''}<span class="rm-game-in${c.yes < S.rules.minPlayers ? ' is-short' : ''}">${c.yes} in</span></span>
    </button>`;
  }).join('');
}

function renderTabs() {
  const tabs = [['rsvp', 'RSVPs', 'user-check'], ['batting', 'Batting order', 'bat'], ['defense', 'Defense', 'field']];
  const L = currentLineup();
  $('rmTabs').innerHTML = tabs.map(([key, label, ic]) => {
    const final = key === 'batting' ? L?.batFinal : key === 'defense' ? L?.fieldFinal : false;
    return `<button class="aces-tab${S.tab === key ? ' is-active' : ''}" type="button" role="tab" aria-selected="${S.tab === key}" data-act="tab" data-tab="${key}">
      ${icon(ic)} ${label}${final ? ` ${icon('lock', { className: 'is-sm', label: 'final' })}` : ''}</button>`;
  }).join('');
}

function statusButtons(p, gameId, { big = false } = {}) {
  const s = rsvpStatus(p, gameId);
  if (!canEditRsvp(p)) {
    return `<span class="rm-status ${RSVP[s].cls}">${icon(RSVP[s].icon, { className: 'is-sm' })} ${esc(RSVP[s].label)}</span>`;
  }
  return `<div class="aces-segmented rm-rsvp${big ? ' is-big' : ''}" role="group" aria-label="RSVP for ${esc(p.name)}">
    ${['yes', 'maybe', 'no'].map((k) => `<button class="aces-segment ${RSVP[k].cls}${s === k ? ' is-active' : ''}" type="button" aria-pressed="${s === k}"
      data-act="rsvp" data-pid="${esc(p.id)}" data-game="${esc(gameId)}" data-status="${s === k ? 'none' : k}">${icon(RSVP[k].icon, { className: 'is-sm' })} ${esc(RSVP[k].long)}</button>`).join('')}
  </div>`;
}

function renderRsvp() {
  const g = currentGame();
  if (!g) return '';
  const c = rsvpCounts(g.id);
  const last = lastRsvpUpdate(g.id);
  const notes = [];
  if (c.yes < S.rules.minPlayers) notes.push(`Only ${c.yes} in. ${S.rules.name} games need ${S.rules.minPlayers} to play.`);
  if (catcherLocked(g.id)) notes.push(`Catcher is off until ${S.rules.catcherMinPlayers} players are in (${c.yes} now).`);

  const groups = ['yes', 'maybe', 'no', 'none'].map((k) => {
    const list = S.players.filter((p) => rsvpStatus(p, g.id) === k);
    if (!list.length) return '';
    return `<div class="rm-group"><h3 class="rm-sub ${RSVP[k].cls}">${icon(RSVP[k].icon, { className: 'is-sm' })} ${esc(RSVP[k].label)} <small>${list.length}</small></h3>
      <ul class="rm-people">${list.map((p) => `<li class="rm-person${p.id === S.me?.id ? ' is-me' : ''}">
        <span class="aces-avatar rm-av" aria-hidden="true">${esc(initials(p.name))}</span>
        <span class="rm-pl-name"><span class="rm-pl-full">${esc(p.name)}${p.id === S.me?.id ? ' <span class="aces-badge is-brand">You</span>' : ''}</span><small>${p.jersey ? `#${esc(p.jersey)}` : ''}${p.isCaptain ? `${p.jersey ? ' \u00b7 ' : ''}Captain` : ''}</small></span>
        ${statusButtons(p, g.id)}
      </li>`).join('')}</ul></div>`;
  }).join('');

  const mine = S.me ? `<section class="aces-card rm-card rm-mine-card">
      <div><h2 class="aces-card-title">Are you playing?</h2><p class="rm-hint">${esc(g.label)} ${g.isHome ? 'vs' : 'at'} ${esc(g.opponent)}${g.location ? ` \u00b7 ${esc(g.location)}` : ''}</p></div>
      ${statusButtons(S.me, g.id, { big: true })}
    </section>` : '';

  return `${mine}
    <section class="aces-card rm-card">
      <div class="aces-card-head rm-head"><h2 class="aces-card-title">Who's in</h2>
        ${last ? `<span class="aces-hint">${icon('clock', { className: 'is-sm' })} Last change ${esc(relTime(last))}</span>` : ''}</div>
      <div class="aces-stats rm-counts">
        ${['yes', 'maybe', 'no', 'none'].map((k) => `<div class="aces-stat ${RSVP[k].cls}"><span class="aces-stat-value">${c[k]}</span><span class="aces-stat-label">${esc(RSVP[k].label)}</span></div>`).join('')}
      </div>
      ${notes.map((n) => `<div class="aces-notice is-warning rm-note">${icon('alert')}<div>${esc(n)}</div></div>`).join('')}
      ${S.players.length ? groups : '<div class="aces-empty"><p>No roster has been set up for this team yet.</p></div>'}
    </section>
    ${S.games.length > 1 ? renderGrid() : ''}`;
}

/** Every player against every upcoming game. Tap a cell to cycle its RSVP. */
function renderGrid() {
  const head = S.games.map((g) => `<th scope="col"><button class="rm-th-btn${g.id === S.gameId ? ' is-active' : ''}" type="button" data-act="game" data-id="${esc(g.id)}">${esc(g.short)}<small>${g.isHome ? 'vs' : 'at'} ${esc(g.opponent)}</small></button></th>`).join('');
  const rows = S.players.map((p) => `<tr${p.id === S.me?.id ? ' class="is-me"' : ''}><th scope="row">${esc(p.name)}</th>${S.games.map((g) => {
    const s = rsvpStatus(p, g.id);
    const can = canEditRsvp(p);
    const next = RSVP_CYCLE[(RSVP_CYCLE.indexOf(s) + 1) % RSVP_CYCLE.length];
    return `<td>${can
      ? `<button class="rm-cell ${RSVP[s].cls}" type="button" data-act="rsvp" data-pid="${esc(p.id)}" data-game="${esc(g.id)}" data-status="${next}" aria-label="${esc(p.name)}, ${esc(g.short)}: ${esc(RSVP[s].long)}. Tap to change.">${icon(RSVP[s].icon)}</button>`
      : `<span class="rm-cell ${RSVP[s].cls}" aria-label="${esc(RSVP[s].long)}">${icon(RSVP[s].icon)}</span>`}</td>`;
  }).join('')}</tr>`).join('');
  const totals = `<tr class="rm-total"><th scope="row">In</th>${S.games.map((g) => `<td>${rsvpCounts(g.id).yes}</td>`).join('')}</tr>`;
  return `<section class="aces-card rm-card">
    <div class="aces-card-head rm-head"><h2 class="aces-card-title">All upcoming games</h2><span class="aces-hint">${S.canManage ? 'Tap a box to change it.' : 'Tap your row to change your RSVP.'}</span></div>
    <div class="aces-table-wrap"><table class="aces-table is-compact is-sticky-first rm-rsvp-grid">
      <thead><tr><th scope="col">Player</th>${head}</tr></thead><tbody>${rows}${totals}</tbody>
    </table></div>
  </section>`;
}

function relTime(date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function render() {
  if (!S.season) return;
  renderHead();
  const panel = $('rmPanel');
  const noGames = !S.games.length;
  $('rmGames').hidden = noGames;
  $('rmTabs').hidden = noGames;
  if (!S.team) {
    panel.innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('users')}<p class="aces-empty-title">You're not on a team this season</p><p>Ask your captain to add you to the roster, or link your profile to your player on the <a href="me.html#profile">Me page</a>.</p></div></div>`;
    return;
  }
  renderGames();
  if (noGames) {
    panel.innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games coming up</p><p>${esc(S.team)} has no games left on the ${esc(S.season.label)} schedule.</p></div></div>`;
    return;
  }
  renderTabs();
  const scrollY = window.scrollY;
  panel.innerHTML = S.tab === 'batting' ? renderBatting() : S.tab === 'defense' ? renderDefense() : renderRsvp();
  window.scrollTo(0, scrollY);
}
S.render = scheduleRender;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function selectGame(id) {
  if (id === S.gameId) return;
  await flush();
  S.gameId = id;
  S.inning = 1;
  syncUrl();
  render();
  await ensureLineup(id);
  render();
}

function wireEvents() {
  const root = $('main');
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !root.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'game') { selectGame(el.dataset.id); return; }
    if (act === 'tab') {
      S.tab = el.dataset.tab;
      syncUrl();
      render();
      return;
    }
    if (act === 'rsvp') { setRsvp(el.dataset.pid, el.dataset.game, el.dataset.status); return; }
    if (act === 'retry-lineup') {
      delete S.lineups[S.gameId];
      render();
      await ensureLineup(S.gameId);
      render();
      return;
    }
    if (!S.canManage && !['copy'].includes(act)) return;
    await lineupAction(act, el);
  });

  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'rmTeam') {
      $('rmPanel').innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span></div>';
      await openTeam(el.value);
    } else if (el.dataset.change === 'maybe') {
      S.includeMaybe = el.checked;
      render();
    }
  });

  // Drag and drop (mouse and trackpad; touch uses the tap controls).
  let dragId = null;
  root.addEventListener('dragstart', (e) => {
    const el = e.target.closest('[data-drag]');
    if (!el) return;
    dragId = el.dataset.drag;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* ignore */ }
    el.classList.add('is-dragging');
  });
  root.addEventListener('dragend', (e) => {
    e.target.closest?.('[data-drag]')?.classList.remove('is-dragging');
    root.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over'));
    dragId = null;
  });
  root.addEventListener('dragover', (e) => {
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!zone.classList.contains('is-over')) {
      root.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over'));
      zone.classList.add('is-over');
    }
  });
  root.addEventListener('drop', (e) => {
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('is-over');
    const id = dragId;
    dragId = null;
    lineupDrop(id, zone.dataset.drop);
  });

  window.addEventListener('online', () => { if (hasPending()) flush(); });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start() {
  const ctx = await initPage({ title: 'Roster and RSVPs', requiresAuth: true });
  S.user = ctx.user;
  S.profile = ctx.profile || {};

  // offline-queue.js replays saved RSVPs and lineup edits through
  // window.FirebaseRoster, so set that up before it loads.
  installOfflineBridge();
  import('../../offline-queue.js').catch((err) => console.warn('[roster] offline queue unavailable', err));

  const season = await getCurrentSeason().catch(() => null);
  if (!season) {
    pageReady();
    showPageState({
      title: 'No season in progress',
      message: 'RSVPs and lineups open when the next season starts.',
      actions: [{ label: 'Home', href: 'index.html', primary: true }],
      container: '#rmPanel'
    });
    $('rmGames').hidden = true;
    $('rmTabs').hidden = true;
    return;
  }
  S.season = { ...season, label: seasonLabel(season.id) };
  S.rules = /summer/i.test(`${season.season || ''} ${season.id}`) ? SEASON_RULES.summer : SEASON_RULES.fall;

  allGames = (await getSeasonGames(season.id).catch((err) => {
    console.error('[roster] games', err);
    return [];
  })).map((raw) => ({ ...normalizeGame(raw), location: raw.location || raw.field || '' }));
  const seasonTeams = [...new Set(allGames.flatMap((g) => [g.home, g.away]).filter(Boolean))].sort();

  S.teamChoices = teamChoices(S.profile, seasonTeams);
  const wanted = params.get('team');
  const team = S.teamChoices.find((t) => lower(t) === lower(wanted)) || S.teamChoices[0] || '';
  const tab = params.get('tab');
  if (['rsvp', 'batting', 'defense'].includes(tab)) S.tab = tab;

  wireEvents();
  if (team) await openTeam(team);
  else render();
  pageReady();
}

start().catch((err) => {
  console.error('[roster] failed to start', err);
  pageReady();
  showToast("Couldn't load the roster. Refresh to try again.", 'error');
});
