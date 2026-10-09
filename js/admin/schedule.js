// js/admin/schedule.js
// admin/schedule.html: one place for the season schedule. The tools still live
// in their own pages; this page puts them in order (Build, Tune, Publish, In
// season), opens each one, and shows what is published for a season: game
// count, dates, and games and home/away by team, so balance problems show up
// without opening the workshop.
//
// Retired into this page: schedule-balancer.html (its features are all in the
// workshop), offseason-schedule.html (the workshop's live analysis does it).

import { initPage, pageReady, siteUrl } from '../core/app.js';
import { getSeasonGames } from '../data/games.js';
import { getAllSeasons } from '../data/seasons.js';
import { normalizeGame } from '../domain/standings.js';
import { parseGameDateTime, formatGameDate } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { mountAdminShell } from './shell.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);

const STEPS = [
  { n: 1, title: 'Build', text: 'Pick the season type and teams, set the parameters, and generate a balanced schedule. Download it as a CSV to fine-tune, or send it straight to the site.',
    tools: [['admin/schedule-generator.html', 'Schedule generator', true], ['admin/season-setup.html', 'Season setup wizard']] },
  { n: 2, title: 'Tune', text: 'Import the CSV, swap games, balance days and time slots, group doubleheaders, and watch the fairness scores and opponent grid update as you go.',
    tools: [['admin/schedule-workshop.html', 'Schedule workshop', true]] },
  { n: 3, title: 'Publish', text: 'Use Export to Firebase in the workshop (or the generator) to write the games to the season. The counts below show what is published.',
    tools: [['admin/schedule-workshop.html', 'Export from the workshop']] },
  { n: 4, title: 'In season', text: 'Change one game (date, time, field, teams), or rework a stretch of the season after rainouts.',
    tools: [['admin/schedule-editor.html', 'Edit a game', true], ['admin/schedule-rework.html', 'Rework after rainouts']] }
];

function renderSteps(published, played) {
  $('schSteps').innerHTML = STEPS.map(s => {
    const status = s.n === 4 ? (played ? 'is-todo' : '') : published ? 'is-done' : '';
    const label = s.n === 4 ? (played ? 'Season under way' : 'After opening day') : published ? 'Done' : 'To do';
    return `<li class="aces-card stp-step ${status}">
      <div class="stp-step-head">
        <span class="stp-num" aria-hidden="true">${s.n}</span>
        <div class="stp-step-text"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
        <span class="stp-state">${icon(status === 'is-done' ? 'check' : 'clock')}<span>${esc(label)}</span></span>
      </div>
      <div class="stp-actions">${s.tools.map(([href, name, primary]) =>
        `<a class="aces-btn is-sm${primary ? ' is-primary' : ''}" href="${esc(siteUrl(href))}">${esc(name)}</a>`).join('')}</div>
    </li>`;
  }).join('');
}

function summarize(raw) {
  const now = Date.now();
  const teams = new Map();
  const team = (name) => teams.get(name) || teams.set(name, { name, games: 0, home: 0, away: 0, played: 0 }).get(name);
  let first = null;
  let last = null;
  let undated = 0;
  let played = 0;
  let regular = 0;
  for (const r of raw) {
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
  return { regular, other: raw.length - regular, undated, played, first, last, teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

function renderSummary(seasonId, s) {
  if (!s.regular) {
    $('schStatus').innerHTML = `<p class="stp-empty">Nothing published for ${esc(seasonLabel(seasonId))} yet. Build it in steps 1 to 3.</p>`;
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
    </dl>
    ${s.undated ? `<p class="stp-note">${icon('alert')} ${s.undated} game${s.undated === 1 ? ' has' : 's have'} no date or time.</p>` : ''}`;

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

async function show(seasonId) {
  $('schStatus').innerHTML = '<p class="adm-hint">Loading...</p>';
  $('schTeams').innerHTML = '';
  try {
    const s = summarize(await getSeasonGames(seasonId));
    renderSteps(s.regular > 0, s.played > 0);
    renderSummary(seasonId, s);
  } catch (err) {
    console.error('[schedule] load failed', err);
    $('schStatus').innerHTML = `<p class="adm-hint">Could not load ${esc(seasonLabel(seasonId))}: ${esc(err.message || err)}</p>`;
  }
}

async function main() {
  const ctx = await initPage({ title: 'Schedule', role: 'league-staff', deniedMessage: 'Schedule tools are for league staff and admins.' });
  mountAdminShell(ctx.profile, 'admin/schedule.html');
  renderSteps(false, false);

  // Newest first, so a season being built for next year is easy to pick.
  const seasons = (await getAllSeasons()).sort((a, b) => b.id.localeCompare(a.id));
  const fromUrl = new URLSearchParams(location.search).get('season');
  const start = [fromUrl, ctx.config?.currentSeasonId, seasons[0]?.id].find(id => id && seasons.some(s => s.id === id));
  const sel = $('schSeason');
  sel.innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}${s.id === ctx.config?.currentSeasonId ? ' (current)' : ''}</option>`).join('');
  if (start) sel.value = start;
  sel.addEventListener('change', () => {
    history.replaceState(null, '', `?season=${encodeURIComponent(sel.value)}`);
    show(sel.value);
  });

  pageReady();
  if (start) await show(start);
}

main();
