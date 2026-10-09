// js/pages/schedule.js
// schedule.html: the season's schedule.
//
//   Calendar  a month grid with a chip per game (the old page's view)
//   List      games by day, today marked, finished games with scores
// Both: team filter (or Playoffs), Hide finished, your team's games marked.
// Signed-in players start filtered to their own team (View As aware).
// Each game links to its preview, or its recap once it has a result.
// Add to calendar uses the calendar Cloud Function (calendar-subscription.js
// builds the URL): subscribe, Google Calendar, download .ics, or copy the link.
//
// URL: schedule.html?season=2026-fall&team=Teal&view=list&hide=1
// The season defaults to the current one, or the latest in the offseason.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getDisplaySeasonId, getSeasons } from '../core/config.js';
import { getUserTeamIds } from '../core/auth.js';
import { getSeasonGames } from '../data/games.js';
import { getCalendarUrl } from '../../calendar-subscription.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { normalizeGames, isDecided } from '../domain/standings.js';
import { formatGameDate, formatTime, todayKey, dateFromKey, timeSortValue } from '../domain/dates.js';
import { seasonLabel, parseStatSeasonId } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const PLAYOFFS = '__playoffs__';
const VIEW_KEY = 'aces-schedule-view';

const state = { seasonId: '', games: [], seasons: [], myTeam: '', team: '', view: 'calendar', hide: false };

const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const isMine = (g) => !!state.myTeam && (g.home === state.myTeam || g.away === state.myTeam);
const done = (g) => isDecided(g) && g.hasScores;
const matches = (g) => (!state.team ? true : state.team === PLAYOFFS ? g.type === 'playoff' : g.home === state.team || g.away === state.team);
/** The team results are shown for: the filtered team, else your own. */
const viewTeam = () => (state.team && state.team !== PLAYOFFS ? state.team : state.myTeam);
/** 'W' | 'L' | 'T' for a team in a finished game, else ''. */
function resultFor(g, team) {
  if (!team || !done(g) || (g.home !== team && g.away !== team)) return '';
  if (g.result === 'tie') return 'T';
  return (g.result === 'home') === (g.home === team) ? 'W' : 'L';
}
const resultBadge = (r, g, team) => {
  const mine = g.home === team ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
  return `<span class="sc-result is-${r.toLowerCase()}" title="${r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Tie'}"><b>${r}</b>${mine[0]}-${mine[1]}</span>`;
};
const visible = () => state.games.filter(g => matches(g) && (!state.hide || !done(g)));

function gameHref(g) {
  if (done(g) && g.id) return `game-recap.html?${new URLSearchParams({ gameId: g.id, seasonId: state.seasonId })}`;
  if (g.type === 'playoff' && g.id) return `game-preview.html?${new URLSearchParams({ gameId: g.id })}`;
  const q = new URLSearchParams({ home: g.home, away: g.away });
  if (g.dateKey) q.set('date', g.dateKey);
  return `game-preview.html?${q}`;
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------

function renderStats() {
  const list = state.games.filter(matches);
  const played = list.filter(done).length;
  const today = todayKey();
  const next = state.myTeam ? state.games.filter(g => isMine(g) && !done(g) && g.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || timeSortValue(a.time) - timeSortValue(b.time))[0] : null;
  const opp = next ? (next.home === state.myTeam ? next.away : next.home) : '';
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${meta}</span>` : ''}</div>`;
  const label = state.team === PLAYOFFS ? 'Playoff games' : state.team ? `${cap(state.team)} games` : 'Games';
  $('scStats').innerHTML = [
    tile(String(list.length), label),
    tile(String(played), 'Played'),
    tile(String(list.length - played), 'Left'),
    next ? tile(formatGameDate(next.dateKey, 'monthDay'), 'Your next game', `${next.home === state.myTeam ? 'vs' : 'at'} ${dot(opp)}${esc(cap(opp))}${next.time ? ` &middot; ${esc(formatTime(next.time))}` : ''}`)
      : tile(state.myTeam ? '-' : String(new Set(state.games.flatMap(g => [g.home, g.away]).filter(t => t && t !== 'TBD')).size), state.myTeam ? 'Your next game' : 'Teams', state.myTeam ? 'none left' : '')
  ].join('');
}

function renderToolbar() {
  const teams = [...new Set(state.games.filter(g => !g.placeholder).flatMap(g => [g.home, g.away]).filter(t => t && t !== 'TBD'))].sort();
  const hasPlayoffs = state.games.some(g => g.type === 'playoff');
  $('scToolbar').innerHTML = `
    <span class="aces-select-wrap is-inline"><select class="aces-select" id="scTeam" aria-label="Team">
      <option value="">All teams</option>
      ${hasPlayoffs ? `<option value="${PLAYOFFS}"${state.team === PLAYOFFS ? ' selected' : ''}>Playoffs</option>` : ''}
      ${teams.map(t => `<option value="${esc(t)}"${t === state.team ? ' selected' : ''}>${esc(cap(t))}${t === state.myTeam ? ' (my team)' : ''}</option>`).join('')}
    </select></span>
    ${state.myTeam && state.team !== state.myTeam ? `<button type="button" class="aces-chip" data-mine>${dot(state.myTeam)}My team</button>` : ''}
    <button type="button" class="aces-chip" data-hide aria-pressed="${state.hide}">Hide finished</button>
    <div class="aces-segmented sc-view" role="group" aria-label="View">
      <button type="button" class="aces-segment" data-view="calendar" aria-pressed="${state.view === 'calendar'}">${icon('calendar-days')}<span>Calendar</span></button>
      <button type="button" class="aces-segment" data-view="list" aria-pressed="${state.view === 'list'}">${icon('list')}<span>List</span></button>
    </div>`;
}

function renderCalendarButton() {
  $('scCal').innerHTML = `
    <div class="sc-season">
      ${state.seasons.length > 1 ? `<span class="aces-select-wrap is-inline"><select class="aces-select is-sm" id="scSeason" aria-label="Season">
        ${state.seasons.map(s => `<option value="${esc(s.id)}"${s.id === state.seasonId ? ' selected' : ''}>${esc(seasonLabel(s.id))}</option>`).join('')}
      </select></span>` : ''}
      <button type="button" class="aces-btn is-sm" data-calendar>${icon('calendar')}Add to calendar</button>
    </div>`;
}

function calendarTeam() {
  return state.team && state.team !== PLAYOFFS ? state.team : state.myTeam;
}

async function openCalendarMenu() {
  const team = calendarTeam();
  const url = getCalendarUrl({ team: team ? team.toLowerCase() : null, season: state.seasonId });
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const choice = await openModal({
    title: 'Add to calendar',
    html: `<p>${team ? `${esc(cap(team))}'s games` : 'Every game'} for ${esc(seasonLabel(state.seasonId))}. A subscription stays up to date when games move.</p>
      <div class="sc-cal-options">
        <a class="aces-btn is-primary" href="${esc(webcal)}">${icon('calendar')}Subscribe (iPhone, Mac, Outlook)</a>
        <a class="aces-btn" href="${esc(google)}" target="_blank" rel="noopener">${icon('external-link')}Google Calendar</a>
        <a class="aces-btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('download')}Download .ics</a>
        <button type="button" class="aces-btn is-ghost" data-copy>${icon('copy')}Copy link</button>
      </div>
      ${team ? '<p class="sc-cal-hint">To get every team instead, pick All teams first.</p>' : ''}`,
    actions: [{ label: 'Done', value: true, variant: 'secondary' }],
    onOpen: (dialog) => dialog.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); showToast('Calendar link copied.', 'success'); }
      catch { showToast('Could not copy. Long-press the Download link instead.', 'info'); }
    })
  });
  return choice;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function chipHtml(g) {
  const k = String(g.home).toLowerCase();
  const color = TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : '';
  const r = resultFor(g, viewTeam());
  const score = done(g) ? `<span class="sc-chip-score">${r ? `<b class="sc-chip-r">${r}</b> ` : ''}${g.awayScore}-${g.homeScore}</span>` : '';
  const name = (team, win) => `<span class="${done(g) ? (win ? 'is-win' : g.result === 'tie' ? '' : 'is-loss') : ''}">${esc(cap(team))}</span>`;
  return `<a class="sc-chip${isMine(g) ? ' is-mine' : ''}${g.type === 'playoff' ? ' is-playoff' : ''}${done(g) ? ' is-done' : ''}${r ? ` is-${r.toLowerCase()}` : ''}"${color} href="${esc(gameHref(g))}"
      title="${esc(`${cap(g.away)} at ${cap(g.home)}${g.time ? `, ${formatTime(g.time)}` : ''}${done(g) ? `: ${g.awayScore}-${g.homeScore}` : ''}`)}">
    ${g.time ? `<span class="sc-chip-time">${esc(formatTime(g.time))}</span>` : ''}
    <span class="sc-chip-match">${name(g.away, g.result === 'away')} @ ${name(g.home, g.result === 'home')}</span>${score}
  </a>`;
}

function renderCalendar(list) {
  const byMonth = new Map();
  for (const g of list) {
    if (!g.dateKey) continue;
    const mk = g.dateKey.slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(g);
  }
  const today = todayKey();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [...byMonth].sort((a, b) => a[0].localeCompare(b[0])).map(([mk, games]) => {
    const [y, m] = mk.split('-').map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    const byDay = new Map();
    games.forEach(g => { if (!byDay.has(g.dateKey)) byDay.set(g.dateKey, []); byDay.get(g.dateKey).push(g); });
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div class="sc-cell is-empty" aria-hidden="true"></div>');
    for (let d = 1; d <= days; d++) {
      const key = `${mk}-${String(d).padStart(2, '0')}`;
      const day = (byDay.get(key) || []).sort((a, b) => timeSortValue(a.time) - timeSortValue(b.time));
      cells.push(`<div class="sc-cell${key === today ? ' is-today' : ''}${day.some(isMine) ? ' has-mine' : ''}${day.length ? '' : ' is-off'}"${key === today ? ' id="scToday"' : ''}>
        <span class="sc-date">${d}</span>${day.map(chipHtml).join('')}</div>`);
    }
    const title = dateFromKey(`${mk}-01`)?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) || mk;
    return `<section class="aces-card sc-month">
      <div class="aces-card-head"><h2 class="aces-card-title">${esc(title)}</h2><span class="aces-badge is-outline">${games.length} game${games.length === 1 ? '' : 's'}</span></div>
      <div class="sc-grid" role="grid">${DAYS.map(d => `<div class="sc-dow" role="columnheader">${d}</div>`).join('')}${cells.join('')}</div>
    </section>`;
  });
  const undated = list.filter(g => !g.dateKey);
  return months.join('') + (undated.length ? renderList(undated) : '');
}

function rowHtml(g) {
  const lost = (which) => done(g) && g.result && g.result !== 'tie' && g.result !== which;
  const side = (team, score, win, which) => `<span class="sc-side is-${which}${win ? ' is-win' : ''}${lost(which) ? ' is-loss' : ''}">${dot(team)}<span class="sc-team">${esc(cap(team) || 'TBD')}</span>${done(g) ? `<span class="sc-score">${score}</span>` : ''}</span>`;
  const tag = g.type === 'playoff' ? `<span class="aces-badge is-accent">${esc(g.round ? cap(g.round) : 'Playoff')}</span>` : '';
  const mine = isMine(g) ? '<span class="aces-badge is-brand">Your game</span>' : '';
  const status = !done(g) && g.winner ? `<span class="aces-badge is-outline">${esc(g.winner === 'Tie' ? 'Tie' : `${g.winner} won`)}</span>` : '';
  return `<li><a class="sc-row${isMine(g) ? ' is-mine' : ''}${done(g) ? ' is-done' : ''}" href="${esc(gameHref(g))}">
    <span class="sc-when">${(() => { const t = viewTeam(); const r = resultFor(g, t); return r ? resultBadge(r, g, t) : done(g) ? '<span class="sc-final">Final</span>' : esc(g.time ? formatTime(g.time) : ''); })()}</span>
    ${side(g.away, g.awayScore, g.result === 'away', 'away')}<span class="sc-at">@</span>${side(g.home, g.homeScore, g.result === 'home', 'home')}
    <span class="sc-tags">${tag}${mine}${status}</span>${icon('chevron-right')}</a></li>`;
}

function renderList(list) {
  const byDay = new Map();
  [...list].sort((a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || timeSortValue(a.time) - timeSortValue(b.time))
    .forEach(g => { const k = g.dateKey || ''; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(g); });
  const today = todayKey();
  let marked = false;
  return `<div class="sc-days">${[...byDay].map(([k, games]) => {
    // Anchor on today, or the first day after it, so the page can jump there.
    const anchor = !marked && k && k >= today;
    if (anchor) marked = true;
    return `<section class="sc-day${k === today ? ' is-today' : ''}${k && k < today ? ' is-past' : ''}"${anchor ? ' id="scToday"' : ''}>
      <h2>${esc(k ? formatGameDate(k, 'full') : 'Date to be set')}${k === today ? ' <span class="aces-badge is-brand">Today</span>' : ''}</h2>
      <ul>${games.map(rowHtml).join('')}</ul></section>`;
  }).join('')}</div>`;
}

function render({ jump = false } = {}) {
  renderStats();
  const list = visible();
  if (!state.games.length) {
    $('scBody').innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games scheduled yet</p><p>The schedule shows up here once it's published.</p></div></div>`;
    return;
  }
  if (!list.length) {
    $('scBody').innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games match</p><p>${state.hide ? 'Every game here is finished. Turn off Hide finished to see them.' : 'Try All teams.'}</p></div></div>`;
    return;
  }
  $('scBody').innerHTML = state.view === 'list' ? renderList(list) : renderCalendar(list);
  if (jump) requestAnimationFrame(() => $('scToday')?.scrollIntoView({ block: state.view === 'list' ? 'start' : 'center' }));
}

// ---------------------------------------------------------------------------
// State, URL, events
// ---------------------------------------------------------------------------

function writeUrl() {
  const q = new URLSearchParams(location.search);
  const set = (k, v) => (v ? q.set(k, v) : q.delete(k));
  set('team', state.team === PLAYOFFS ? 'playoffs' : state.team);
  set('view', state.view);
  set('hide', state.hide ? '1' : '');
  const s = q.toString();
  history.replaceState({}, '', `${location.pathname}${s ? `?${s}` : ''}`);
  try { localStorage.setItem(VIEW_KEY, state.view); } catch { /* ignore */ }
}

function update(changes, opts) {
  Object.assign(state, changes);
  writeUrl();
  renderToolbar();
  render(opts);
}

function wire() {
  document.addEventListener('change', (e) => {
    if (e.target.id === 'scTeam') update({ team: e.target.value });
    if (e.target.id === 'scSeason') {
      const q = new URLSearchParams(location.search);
      q.set('season', e.target.value);
      location.search = q.toString();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-mine]')) return update({ team: state.myTeam });
    if (e.target.closest('[data-hide]')) return update({ hide: !state.hide });
    const v = e.target.closest('[data-view]');
    if (v) return update({ view: v.dataset.view }, { jump: true });
    if (e.target.closest('[data-calendar]')) openCalendarMenu();
  });
}

function findMyTeam(profile, teams) {
  if (!profile) return '';
  const ids = [profile.linkedTeam, profile.team, ...(getUserTeamIds(profile) || [])].filter(Boolean).map(t => String(t).toLowerCase());
  return teams.find(t => ids.includes(t.toLowerCase())) || '';
}

async function main() {
  const { profile } = await initPage({ title: 'Schedule' });
  const q = new URLSearchParams(location.search);
  const [seasons, displayId] = await Promise.all([getSeasons().catch(() => []), getDisplaySeasonId().catch(() => null)]);
  state.seasons = seasons;
  state.seasonId = parseStatSeasonId(q.get('season') || '').id || displayId || seasons[0]?.id || '';
  if (state.seasonId && !seasons.some(s => s.id === state.seasonId)) state.seasons = [{ id: state.seasonId }, ...seasons];

  const docs = state.seasonId ? await getSeasonGames(state.seasonId) : [];
  state.games = normalizeGames(docs).map((g, i) => ({ ...g, placeholder: !!docs[i]?.isPlaceholder }));
  const teams = [...new Set(state.games.flatMap(g => [g.home, g.away]).filter(Boolean))];
  state.myTeam = findMyTeam(profile, teams);

  const qTeam = q.get('team');
  state.team = qTeam === 'playoffs' ? PLAYOFFS : qTeam ? (teams.find(t => t.toLowerCase() === qTeam.toLowerCase()) || '') : state.myTeam;
  let saved = '';
  try { saved = localStorage.getItem(VIEW_KEY) || ''; } catch { /* ignore */ }
  state.view = ['calendar', 'list'].includes(q.get('view')) ? q.get('view') : ['calendar', 'list'].includes(saved) ? saved : (matchMedia('(max-width: 640px)').matches ? 'list' : 'calendar');
  state.hide = q.get('hide') === '1';

  $('scTitle').textContent = state.seasonId ? `${seasonLabel(state.seasonId)} Schedule` : 'Schedule';
  document.title = `${state.seasonId ? `${seasonLabel(state.seasonId)} ` : ''}Schedule - Mountainside Aces`;
  renderCalendarButton();
  renderToolbar();
  wire();
  pageReady();
  render({ jump: state.view === 'list' });
}

main().catch((err) => { pageReady(); showPageError(err); });
