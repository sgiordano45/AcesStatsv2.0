// js/pages/me.js
// me.html: everything about you in one page, in sections (me.html#favorites).
// It replaces my-dashboard, profile, profile-fan and favorites, a section at a
// time; until a section is built here, its tab links to the old page.
//
// Built so far: Dashboard (next game with RSVP, your season, to-do list,
// notifications, upcoming games), Favorites, Profile, Notifications and
// Account (js/pages/me-*.js), each loaded when first opened.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { getDisplaySeasonId } from '../core/config.js';
import {
  db, doc, collection, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { findPlayerStatsForUser } from '../data/player-stats.js';
import { normalizeGame } from '../domain/standings.js';
import { parseGameDateTime, formatTime, formatRelativeDay, formatGameDate, daysBetween, todayKey } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { mySeason, myStatsHtml } from '../ui/my-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const GAME_LENGTH_MS = 2 * 60 * 60 * 1000;   // a game is over two hours after it starts
const UPCOMING = 5;

// Sections. `old` is where the section still lives until it's rebuilt here.
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'favorites', label: 'Favorites', icon: 'star' },
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'directory', label: 'Directory', icon: 'id-card', old: 'profile.html#tab-directory' },
  { id: 'account', label: 'Account', icon: 'lock' },
  { id: 'tools', label: 'Your tools', icon: 'clipboard', old: 'profile.html', role: 'team-staff' }
];

const state = { ctx: null, profile: null, uid: '', canWrite: false, seasonId: '', team: '', games: [], rsvps: new Map(), notes: [], unsub: null };

// ---------------------------------------------------------------------------
// Shell: tabs from the hash
// ---------------------------------------------------------------------------

function sections() {
  return SECTIONS.filter(s => !s.role || hasRole(state.profile, s.role));
}

function renderTabs(active) {
  $('meTabs').innerHTML = sections().map(s => s.old
    ? `<a class="aces-tab" href="${esc(s.old)}">${icon(s.icon)}<span>${esc(s.label)}</span></a>`
    : `<a class="aces-tab" href="#${s.id}"${s.id === active ? ' aria-current="page"' : ''}>${icon(s.icon)}<span>${esc(s.label)}</span></a>`).join('');
}

// ---------------------------------------------------------------------------
// Games: next, upcoming, and what captains still owe
// ---------------------------------------------------------------------------

function teamGames(raw) {
  const t = state.team.toLowerCase();
  return raw.map(r => ({ raw: r, g: normalizeGame(r) }))
    .filter(({ g }) => g.home.toLowerCase() === t || g.away.toLowerCase() === t)
    .map(({ raw, g }) => ({
      ...g,
      raw,
      isHome: g.home.toLowerCase() === t,
      opponent: g.home.toLowerCase() === t ? g.away : g.home,
      start: parseGameDateTime(raw.date, raw.time),
      decided: !!g.winner || !!g.unmatchedWinner,
      field: raw.field || raw.location || ''
    }))
    .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));
}

function gameHref(g) {
  if (g.type === 'playoff' && g.id) return `game-preview.html?gameId=${encodeURIComponent(g.id)}`;
  const q = new URLSearchParams({ home: g.home, away: g.away });
  if (g.dateKey) q.set('date', g.dateKey);
  return `game-preview.html?${q}`;
}

/** Upcoming: not decided and not over yet. Owed (staff): over, missing a score or this side's stats. */
function splitGames(games, now = new Date()) {
  const upcoming = [];
  const needScore = [];
  const needStats = [];
  for (const g of games) {
    const over = g.start && g.start.getTime() + GAME_LENGTH_MS < now.getTime();
    if (!g.decided && !g.hasScores) {
      if (over) needScore.push(g); else if (g.start) upcoming.push(g);
      continue;
    }
    if (!over) continue;
    const r = g.raw;
    const sideDone = g.isHome ? r.statsSubmittedHome === true : r.statsSubmittedAway === true;
    if (r.statsSubmitted !== true && !sideDone) needStats.push(g);
  }
  return { upcoming, needScore, needStats };
}

async function loadRsvps(games) {
  await Promise.all(games.map(async (g) => {
    try {
      const snap = await getDocs(collection(db, 'rsvps', g.id, 'responses'));
      const all = {};
      snap.forEach(d => { all[d.id] = d.data(); });
      state.rsvps.set(g.id, all);
    } catch (err) {
      console.warn('[me] RSVPs unavailable for', g.id, err);
      state.rsvps.set(g.id, {});
    }
  }));
}

const myRsvp = (gameId) => state.rsvps.get(gameId)?.[state.uid]?.status || '';

async function setRsvp(gameId, status) {
  if (!state.canWrite) return showToast('RSVPs are read-only while viewing as someone else.', 'info');
  try {
    await setDoc(doc(db, 'rsvps', gameId, 'responses', state.uid), {
      status,
      playerName: state.profile.displayName || state.profile.preferredDisplayName || state.ctx.user?.displayName || 'Unknown',
      teamId: state.team,
      updatedAt: serverTimestamp(),
      updatedBy: state.ctx.user.uid
    }, { merge: true });
    const all = state.rsvps.get(gameId) || {};
    all[state.uid] = { ...(all[state.uid] || {}), status };
    state.rsvps.set(gameId, all);
    renderDashboard();
    showToast(status === 'yes' ? "You're in." : status === 'no' ? "Got it, you're out." : 'Marked as maybe.', 'success');
  } catch (err) {
    console.error('[me] RSVP failed', err);
    showToast('Could not save your RSVP. Try again.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Notifications (users/{uid}/notifications, live)
// ---------------------------------------------------------------------------

const NOTE_ICON = {
  game_reminder: 'calendar', rsvp_reminder: 'mail', score_update: 'trophy', schedule_change: 'refresh',
  lineup_change: 'list', announcement: 'megaphone', milestone: 'party', team_update: 'users'
};

function noteTime(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function watchNotifications() {
  try {
    const q = query(collection(db, 'users', state.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
    state.unsub = onSnapshot(q, (snap) => {
      state.notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotes();
    }, (err) => {
      console.warn('[me] notifications unavailable', err);
      state.notes = [];
      renderNotes();
    });
  } catch (err) {
    console.warn('[me] notifications unavailable', err);
  }
}

async function noteAction(kind, id) {
  if (!state.canWrite) return;
  const ref = (nid) => doc(db, 'users', state.uid, 'notifications', nid);
  try {
    if (kind === 'read') await updateDoc(ref(id), { read: true });
    else if (kind === 'clear') await deleteDoc(ref(id));
    else if (kind === 'read-all') await Promise.all(state.notes.filter(n => !n.read).map(n => updateDoc(ref(n.id), { read: true })));
    else if (kind === 'clear-all') await Promise.all(state.notes.map(n => deleteDoc(ref(n.id))));
  } catch (err) {
    console.error('[me] notification update failed', err);
    showToast('Could not update notifications.', 'error');
  }
}

function renderNotes() {
  const el = $('meNotes');
  if (!el) return;
  const unread = state.notes.filter(n => !n.read).length;
  const head = `<div class="aces-card-head">
      <h2 class="aces-card-title">${icon('bell')} Notifications${unread ? ` <span class="aces-badge is-accent">${unread}</span>` : ''}</h2>
      ${state.notes.length && state.canWrite ? `<div class="aces-cluster">
        ${unread ? '<button type="button" class="aces-btn is-ghost is-sm" data-note="read-all">Mark all read</button>' : ''}
        <button type="button" class="aces-btn is-ghost is-sm" data-note="clear-all">Clear all</button></div>` : ''}
    </div>`;
  if (!state.notes.length) {
    el.innerHTML = `${head}<p class="me-empty">No notifications. Game reminders, score updates and announcements show up here.</p>`;
    return;
  }
  el.innerHTML = `${head}<ul class="me-notes">${state.notes.map(n => `
    <li class="me-note${n.read ? '' : ' is-unread'}" data-id="${esc(n.id)}"${n.link ? ` data-link="${esc(n.link)}"` : ''}>
      <span class="me-note-icon">${icon(NOTE_ICON[n.type] || 'bell')}</span>
      <span class="me-note-text"><strong>${esc(n.title || 'Notification')}</strong>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small>${esc(noteTime(n.createdAt))}</small></span>
      ${state.canWrite ? `<button type="button" class="aces-btn is-ghost is-sm is-icon" data-note="clear" aria-label="Clear">${icon('close')}</button>` : ''}
    </li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// To-do
// ---------------------------------------------------------------------------

function notificationTodo() {
  if (!('Notification' in window)) return null;
  const p = state.profile;
  const on = p?.notificationsEnabled === true;
  const perm = Notification.permission;
  const href = '#notifications';
  if (!on) return { icon: 'bell', title: 'Turn on notifications', text: 'Schedule changes, RSVP reminders and scores', href };
  if (perm === 'denied') return { icon: 'bell', title: 'Notifications are blocked', text: 'Allow them for this site in your browser settings', href, urgent: true };
  if (perm === 'default') return { icon: 'bell', title: 'Finish notification setup', text: 'One more tap to start getting alerts', href, urgent: true };
  if (!(p?.fcmTokens || []).length) return { icon: 'refresh', title: 'Refresh notifications', text: 'This device needs to be set up again', href };
  return null;
}

function todos({ upcoming, needScore, needStats }, playerLinked) {
  const out = [];
  if (state.staff && needScore.length) out.push({ icon: 'hash', title: 'Submit scores', text: `${needScore.length} game${needScore.length === 1 ? '' : 's'} need a final score`, href: 'submit-score.html', urgent: true });
  if (state.staff && needStats.length) out.push({ icon: 'calculator', title: 'Submit stats', text: `${needStats.length} game${needStats.length === 1 ? '' : 's'} need your team's stats`, href: 'submit-stats.html', urgent: needStats.length >= 3 });
  const pending = upcoming.slice(0, UPCOMING).filter(g => !myRsvp(g.id));
  if (pending.length) {
    const soon = pending.some(g => g.dateKey && daysBetween(todayKey(), g.dateKey) <= 2);
    out.push({ icon: 'mail', title: 'RSVP', text: `${pending.length} upcoming game${pending.length === 1 ? '' : 's'} need your answer`, href: '#upcoming', urgent: soon });
  }
  if (!playerLinked) out.push({ icon: 'link', title: 'Link your player record', text: 'See your stats here and on the home page', href: 'link-player.html' });
  if (!state.profile?.displayName) out.push({ icon: 'user', title: 'Add your display name', text: 'How your name shows around the site', href: 'profile.html' });
  const n = notificationTodo();
  if (n) out.push(n);
  return out;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const chip = (team) => {
  const k = String(team || '').toLowerCase();
  return team ? `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?team=${encodeURIComponent(team)}"><span class="aces-team-dot"></span>${esc(team)}</a>` : '';
};

function rsvpButtons(g) {
  const mine = myRsvp(g.id);
  const btn = (status, label) => `<button type="button" class="aces-segment" data-rsvp="${status}" data-game="${esc(g.id)}" aria-pressed="${mine === status}"${state.canWrite ? '' : ' disabled'}>${label}</button>`;
  return `<div class="aces-segmented me-rsvp" role="group" aria-label="RSVP">${btn('yes', 'In')}${btn('maybe', 'Maybe')}${btn('no', 'Out')}</div>`;
}

function teamCounts(gameId) {
  const all = Object.values(state.rsvps.get(gameId) || {});
  const c = { yes: 0, maybe: 0, no: 0 };
  for (const r of all) if (c[r.status] !== undefined) c[r.status]++;
  return c;
}

function nextGameCard(g) {
  if (!g) {
    return `<div class="aces-card-head"><h2 class="aces-card-title">${icon('calendar')} Next game</h2></div>
      <p class="me-empty">${state.team ? 'No games on the schedule yet.' : 'Link your account to a team to see your games here.'}</p>`;
  }
  const days = g.dateKey ? daysBetween(todayKey(), g.dateKey) : null;
  const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatRelativeDay(g.dateKey);
  const counts = state.staff ? teamCounts(g.id) : null;
  return `<div class="aces-card-head">
      <h2 class="aces-card-title">${icon('calendar')} Next game</h2>
      <a class="aces-section-link" href="${esc(gameHref(g))}">Preview</a>
    </div>
    <div class="me-next">
      <div class="me-next-match">
        <span class="me-next-vs">${g.isHome ? 'vs' : 'at'}</span>${chip(g.opponent)}
        ${g.type === 'playoff' ? '<span class="aces-badge is-accent">Playoff</span>' : ''}
      </div>
      <p class="me-next-when"><strong>${esc(when)}</strong>${g.raw.time ? ` · ${esc(formatTime(g.raw.time))}` : ''}${g.field ? ` · ${esc(g.field)}` : ''}</p>
      <div class="me-next-rsvp"><span class="aces-label">Are you in?</span>${rsvpButtons(g)}</div>
      ${counts ? `<p class="me-next-team">${icon('users')} Team so far: <strong>${counts.yes}</strong> in · ${counts.maybe} maybe · ${counts.no} out
        <a href="roster-management.html">Roster</a></p>` : ''}
    </div>`;
}

let split = null;
let player = null;

function renderDashboard() {
  const games = split || { upcoming: [], needScore: [], needStats: [] };
  const [next, ...later] = games.upcoming;

  $('meNext').innerHTML = nextGameCard(next);

  const list = todos(games, !!player);
  $('meTodo').innerHTML = `<div class="aces-card-head"><h2 class="aces-card-title">${icon('clipboard-check')} To do${list.length ? ` <span class="aces-badge${list.some(t => t.urgent) ? ' is-loss' : ''}">${list.length}</span>` : ''}</h2></div>
    ${list.length ? `<ul class="me-todo">${list.map(t => `<li><a class="me-todo-item${t.urgent ? ' is-urgent' : ''}" href="${esc(t.href)}">
        <span class="me-todo-icon">${icon(t.icon)}</span><span class="me-todo-text"><strong>${esc(t.title)}</strong><span>${esc(t.text)}</span></span>${icon('chevron-right')}</a></li>`).join('')}</ul>`
      : `<p class="me-empty is-done">${icon('check-circle')} All caught up.</p>`}`;

  $('meStats').innerHTML = `<div class="aces-card-head"><h2 class="aces-card-title">${icon('bat')} My season</h2>
      ${player ? `<a class="aces-section-link" href="player.html?id=${encodeURIComponent(player.id)}">My page</a>` : ''}</div>
    ${player ? myStatsHtml(player, { seasonId: state.seasonId, finished: state.ctx.config?.phase === 'offseason' })
      : '<p class="me-empty">Link your account to your player record to see your stats. <a href="link-player.html">Link now</a></p>'}`;

  const upcoming = later.slice(0, UPCOMING - 1);
  $('meUpcoming').hidden = !upcoming.length;
  $('meUpcoming').innerHTML = `<div class="aces-card-head"><h2 class="aces-card-title">${icon('calendar-days')} Coming up</h2>
      <a class="aces-section-link" href="schedule.html">Schedule</a></div>
    <ul class="me-games">${upcoming.map(g => `<li>
      <a class="me-game" href="${esc(gameHref(g))}"><span class="me-game-when">${esc(formatGameDate(g.raw.date))}${g.raw.time ? ` · ${esc(formatTime(g.raw.time))}` : ''}</span>
        <span class="me-game-opp">${g.isHome ? 'vs' : 'at'} ${esc(g.opponent)}</span></a>
      ${rsvpButtons(g)}</li>`).join('')}</ul>`;
}

/** Who you are: player record, team, greeting. Shared by every section. */
async function loadMe() {
  const p = state.profile;
  // Player stats first: they also tell us the team when the profile doesn't.
  player = await findPlayerStatsForUser(p, state.uid).catch(() => null);
  state.team = cap(p?.linkedTeam || p?.team || (player ? mySeason(player, state.seasonId).team : '') || player?.currentTeam || '');
  state.staff = state.ctx.config?.phase !== 'offseason' && hasRole(p, 'team-staff');

  const first = (p?.preferredDisplayName || p?.displayName || state.ctx.user?.displayName || '').split(' ')[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  $('meTitle').textContent = first ? `${hello}, ${first}` : hello;
  $('meKicker').innerHTML = `${state.team ? `${chip(state.team)} ` : ''}<span>${esc(seasonLabel(state.seasonId))}</span>`;
}

async function loadDashboard() {
  renderDashboard();   // stats and to-dos straight away; games fill in below

  if (state.team && state.ctx.config?.phase !== 'offseason') {
    try {
      const games = teamGames(await getSeasonGames(state.seasonId));
      split = splitGames(games);
      await loadRsvps(split.upcoming.slice(0, UPCOMING));
    } catch (err) {
      console.warn('[me] games unavailable', err);
    }
  }
  renderDashboard();
  watchNotifications();
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const loaded = new Set();

async function show(id) {
  const built = sections().filter(s => !s.old);
  if (!built.some(s => s.id === id)) id = 'dashboard';
  renderTabs(id);
  document.querySelectorAll('[data-section]').forEach(el => { el.hidden = el.dataset.section !== id; });
  if (loaded.has(id)) return;
  loaded.add(id);
  if (id === 'dashboard') {
    await loadDashboard();
  } else if (id === 'favorites') {
    const { mountFavorites } = await import('./me-favorites.js');
    await mountFavorites($('meFavorites'), { uid: state.uid, canWrite: state.canWrite, seasonId: state.seasonId, profile: state.profile });
  } else if (id === 'profile') {
    const { mountProfile } = await import('./me-profile.js');
    await mountProfile($('meProfile'), {
      uid: state.uid, canWrite: state.canWrite, viewingAs: !!state.ctx.impersonating,
      profile: state.profile, user: state.ctx.user, player, team: state.team
    });
  } else if (id === 'notifications') {
    const { mountNotifications } = await import('./me-notifications.js');
    await mountNotifications($('meNotifications'), { uid: state.uid, canWrite: state.canWrite, viewingAs: !!state.ctx.impersonating, profile: state.profile });
  } else if (id === 'account') {
    const { mountAccount } = await import('./me-account.js');
    mountAccount($('meAccount'), { canWrite: state.canWrite, viewingAs: !!state.ctx.impersonating, profile: state.profile, user: state.ctx.user });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function wire() {
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-rsvp]');
    if (r) return setRsvp(r.dataset.game, r.dataset.rsvp);
    const n = e.target.closest('[data-note]');
    if (n) {
      e.stopPropagation();
      return noteAction(n.dataset.note, n.closest('.me-note')?.dataset.id);
    }
    const item = e.target.closest('.me-note');
    if (item) {
      const note = state.notes.find(x => x.id === item.dataset.id);
      if (note && !note.read) noteAction('read', note.id);
      if (item.dataset.link) location.href = item.dataset.link;
    }
  });
  window.addEventListener('pagehide', () => state.unsub?.());
}

async function main() {
  const ctx = await initPage({ title: 'Me', requiresAuth: true });
  state.ctx = ctx;
  state.profile = ctx.profile || {};
  state.uid = ctx.profile?.id || ctx.user?.uid;
  // View As shows someone else's page; nothing is saved as them.
  state.canWrite = !ctx.impersonating && state.uid === ctx.user?.uid;
  state.seasonId = (ctx.config?.phase !== 'offseason' && ctx.config?.currentSeasonId) || await getDisplaySeasonId();

  wire();
  await loadMe();
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  await show(location.hash.slice(1));
  pageReady();
}

main().catch((err) => showPageError(err, { container: '#meBody' }));
