// js/admin/schedule.js
// admin/schedule.html: the season schedule in one place, as tabs.
//   Overview    what is published: counts, dates, games and home/away by team,
//               plus postponed games and pending rework moves
//   Edit a game one game's date, time, field, teams or status (schedule-editor.js)
//   Rework      drag games to new days after rainouts, publish together (schedule-rework.js)
//   Build       the generator, season setup and workshop (their own pages)
// One season picker drives every tab. ?season=&tab=overview|edit|rework|build
// (&game= with tab=edit opens that game). The old editor and rework addresses
// redirect here.

import { initPage, pageReady, siteUrl } from '../core/app.js';
import { db, doc, getDoc } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { getAllSeasons } from '../data/seasons.js';
import { normalizeGame } from '../domain/standings.js';
import { parseGameDateTime, formatGameDate } from '../domain/dates.js';
import { seasonLabel, sortSeasonIds } from '../domain/season-ids.js';
import { mountAdminShell } from './shell.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { mountEditor, editorSeason } from './schedule-editor.js';
import { mountRework, reworkSeason } from './schedule-rework.js';

const $ = (id) => document.getElementById(id);
const TABS = ['overview', 'edit', 'rework', 'build'];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let seasonId = '';
let tab = 'overview';
const stale = { overview: true, edit: true, rework: true };

const BUILD = [
  { n: 1, title: 'Build', text: 'Pick the season type and teams, set the parameters, and generate a balanced schedule. Download it as a CSV to fine-tune, or send it straight to the site.',
    tools: [['admin/schedule-generator.html', 'Schedule generator', true], ['admin/season-setup.html', 'Season setup wizard']] },
  { n: 2, title: 'Tune', text: 'Import the CSV, swap games, balance days and time slots, group doubleheaders, and watch the fairness scores and opponent grid update as you go.',
    tools: [['admin/schedule-workshop.html', 'Schedule workshop', true]] },
  { n: 3, title: 'Publish', text: 'Use Export to Firebase in the workshop (or the generator) to write the games to the season. The Overview tab then shows what is published.',
    tools: [['admin/schedule-workshop.html', 'Export from the workshop']] }
];

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function summarize(raw) {
  const now = Date.now();
  const teams = new Map();
  const team = (name) => teams.get(name) || teams.set(name, { name, games: 0, home: 0, away: 0, played: 0 }).get(name);
  let first = null, last = null, undated = 0, played = 0, regular = 0, postponed = 0;
  for (const r of raw) {
    if (r.status === 'postponed') postponed++;
    const g = normalizeGame(r);
    if (g.type !== 'regular') continue;
    regular++;
    const start = parseGameDateTime(r.date, r.time);
    if (!start) undated++;
    else {
      if (!first || start < first) first = start;
      if (!last || start > last) last = start;
    }
    const done = !!g.winner || !!g.unmatchedWinner || g.hasScores || (start && start.getTime() < now);
    if (done) played++;
    if (g.home) { const t = team(g.home); t.games++; t.home++; if (done) t.played++; }
    if (g.away) { const t = team(g.away); t.games++; t.away++; if (done) t.played++; }
  }
  return { regular, other: raw.length - regular, undated, played, postponed, first, last, teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

function renderOverview(s, pending) {
  const go = (t, text) => `<button class="aces-btn is-sm" type="button" data-goto="${t}">${esc(text)}</button>`;
  const todo = [];
  if (s.postponed) todo.push(`<li class="tr-check is-warn">${icon('alert')}<span>${plural(s.postponed, 'game')} postponed and waiting for a new date. ${go('rework', 'Open rework')}</span></li>`);
  if (pending) todo.push(`<li class="tr-check is-warn">${icon('alert')}<span>${plural(pending, 'move')} in the rework draft, not published yet. ${go('rework', 'Review moves')}</span></li>`);
  if (s.undated) todo.push(`<li class="tr-check is-warn">${icon('alert')}<span>${plural(s.undated, 'game')} with no date or time. ${go('edit', 'Edit a game')}</span></li>`);
  $('schTodo').innerHTML = todo.join('');
  $('schTodo').hidden = !todo.length;

  if (!s.regular) {
    $('schStatus').innerHTML = `<p class="stp-empty">Nothing published for ${esc(seasonLabel(seasonId))} yet. ${go('build', 'Build the schedule')}</p>`;
    $('schTeams').innerHTML = '';
    return;
  }
  const counts = s.teams.map(t => t.games);
  const minG = Math.min(...counts);
  const maxG = Math.max(...counts);
  const worstHA = Math.max(...s.teams.map(t => Math.abs(t.home - t.away)));
  const flag = (bad, text) => (bad ? `<span class="aces-badge is-alert">${esc(text)}</span>` : '');
  $('schStatus').innerHTML = `<dl class="adm-status">
      <div><dt>Regular-season games</dt><dd>${s.regular}${s.other ? ` <span class="stp-dim">+ ${s.other} other</span>` : ''}</dd></div>
      <div><dt>Teams</dt><dd>${s.teams.length}</dd></div>
      <div><dt>Dates</dt><dd>${s.first ? `${esc(formatGameDate(s.first))} to ${esc(formatGameDate(s.last))}` : 'None set'}</dd></div>
      <div><dt>Games per team</dt><dd>${minG === maxG ? minG : `${minG} to ${maxG}`} ${flag(minG !== maxG, 'Uneven')}</dd></div>
      <div><dt>Home/away gap</dt><dd>${worstHA === 0 ? 'Even' : `Up to ${worstHA}`} ${flag(worstHA > 1, 'Check')}</dd></div>
      <div><dt>Played</dt><dd>${s.played} of ${s.regular}</dd></div>
    </dl>`;
  $('schTeams').innerHTML = `<div class="aces-table-wrap"><table class="aces-table stp-table">
    <thead><tr><th>Team</th><th class="is-num">Games</th><th class="is-num">Home</th><th class="is-num">Away</th><th class="is-num">Played</th><th class="is-num">Left</th></tr></thead>
    <tbody>${s.teams.map(t => `<tr>
      <td>${esc(t.name)}</td>
      <td class="is-num">${t.games}${t.games !== maxG ? ' <span class="aces-badge is-alert">Short</span>' : ''}</td>
      <td class="is-num">${t.home}</td>
      <td class="is-num">${t.away}${Math.abs(t.home - t.away) > 1 ? ' <span class="aces-badge is-alert">Uneven</span>' : ''}</td>
      <td class="is-num">${t.played}</td>
      <td class="is-num">${t.games - t.played}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function loadOverview() {
  $('schStatus').innerHTML = '<p class="adm-hint">Loading...</p>';
  $('schTeams').innerHTML = '';
  try {
    const [raw, draftSnap] = await Promise.all([
      getSeasonGames(seasonId),
      getDoc(doc(db, 'seasons', seasonId, 'scheduleDraft', 'current')).catch(() => null)
    ]);
    const pending = draftSnap?.exists() ? Object.keys(draftSnap.data().changes || {}).length : 0;
    renderOverview(summarize(raw), pending);
  } catch (err) {
    console.error('[schedule] load failed', err);
    $('schStatus').innerHTML = `<p class="adm-hint">Could not load ${esc(seasonLabel(seasonId))}: ${esc(err.message || err)}</p>`;
  }
}

function renderBuild() {
  $('schSteps').innerHTML = BUILD.map(s => `<li class="aces-card stp-step">
    <div class="stp-step-head">
      <span class="stp-num" aria-hidden="true">${s.n}</span>
      <div class="stp-step-text"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
    </div>
    <div class="stp-actions">${s.tools.map(([href, name, primary]) =>
      `<a class="aces-btn is-sm${primary ? ' is-primary' : ''}" href="${esc(siteUrl(href))}">${esc(name)}</a>`).join('')}</div>
  </li>`).join('');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

async function setTab(name, { game = '' } = {}) {
  tab = TABS.includes(name) ? name : 'overview';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
  const p = new URLSearchParams(location.search);
  p.set('tab', tab);
  if (tab !== 'edit') p.delete('game');
  history.replaceState(null, '', `?${p}`);
  if (!seasonId) return;
  if (tab === 'overview' && stale.overview) { stale.overview = false; await loadOverview(); }
  if (tab === 'edit' && (stale.edit || game)) { const force = stale.edit; stale.edit = false; await editorSeason(seasonId, game, force); }
  if (tab === 'rework' && stale.rework) { const force = stale.rework; stale.rework = false; await reworkSeason(seasonId, force); }
}

async function main() {
  const ctx = await initPage({ title: 'Schedule', role: 'league-staff', deniedMessage: 'Schedule tools are for league staff and admins.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/schedule.html');
  mountEditor(ctx);
  mountRework(ctx);
  renderBuild();

  const seasons = await getAllSeasons();
  const ids = sortSeasonIds(seasons.map(s => s.id));
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, ids[0]].find(id => id && ids.includes(id));
  const sel = $('schSeason');
  sel.innerHTML = ids.map(id => `<option value="${esc(id)}">${esc(seasonLabel(id))}${id === ctx.config?.currentSeasonId ? ' (current)' : ''}</option>`).join('');
  if (start) sel.value = start;
  seasonId = start || '';
  sel.addEventListener('change', () => {
    seasonId = sel.value;
    Object.keys(stale).forEach(k => { stale[k] = true; });
    const p = new URLSearchParams(location.search);
    p.set('season', seasonId);
    p.delete('game');
    history.replaceState(null, '', `?${p}`);
    setTab(tab);
  });

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) { e.preventDefault(); setTab(b.dataset.goto); } });
  // A save in one tab makes the others reload next time they open.
  window.addEventListener('aces:schedule-changed', (e) => {
    stale.overview = true;
    if (e.detail?.from !== 'edit') stale.edit = true;
    if (e.detail?.from !== 'rework') stale.rework = true;
  });
  window.addEventListener('aces:rework-draft', () => { stale.overview = true; });

  pageReady();
  await setTab(params.get('tab') || 'overview', { game: params.get('game') || '' });
}

main();
