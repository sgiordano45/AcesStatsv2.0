// js/admin/rosters.js
// admin/rosters.html: one place for season rosters.
//   Teams          edit a team's roster (numbers, positions, captain, move, remove, add)
//   Import CSV     playerName,team rows placed onto the season's rosters
//   From offseason copy the offseason board into the season (rosters-import.js)
//   Check & fix    linked accounts, IDs and profile fields (rosters-check.js)
// Edits in Teams, Import and Offseason are staged and saved together from the
// bar at the bottom. ?season=&tab=teams|import|offseason|check&team=teal

import { initPage, pageReady } from '../core/app.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { mountAdminShell } from './shell.js';
import { S, loadSeason, loadUsers, teamList, isDirty, dirtyTeams, directory, resolvePlayer, placePlayer, findInSeason, saveChanges, revert } from './rosters-data.js';
import { mountImport, refreshImport } from './rosters-import.js';
import { mountCheck, refreshCheck } from './rosters-check.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const HANDS = ['-', 'R', 'L', 'S'];

let ctx = null;
let current = '';      // selected team key
let tab = 'teams';

// ---------------------------------------------------------------------------
// Tabs and the save bar
// ---------------------------------------------------------------------------

function setTab(name) {
  tab = name;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  const p = new URLSearchParams(location.search);
  p.set('tab', name);
  history.replaceState(null, '', `?${p}`);
  if (name === 'import') refreshImport();
  if (name === 'check') refreshCheck();
}

export function changed() {
  const d = dirtyTeams();
  $('rosBar').hidden = !d.length;
  $('rosBarText').textContent = d.length ? `Unsaved changes: ${d.map(t => t.teamName).join(', ')}` : '';
  renderTeamList();
}

async function save() {
  const btn = $('rosSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const r = await saveChanges({ who: ctx.user.uid });
    showToast(`Saved ${plural(r.teams, 'team')}${r.profiles ? `, updated ${plural(r.profiles, 'profile')}` : ''}`, 'success');
    changed();
    renderTeam();
    refreshImport();
  } catch (err) {
    console.error('[rosters] save failed', err);
    showToast(`Could not save: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function undoAll() {
  if (!(await confirmModal('Throw away all unsaved roster changes?', { danger: true, confirmLabel: 'Undo changes' }))) return;
  dirtyTeams().forEach(revert);
  changed();
  renderTeam();
  refreshImport();
}

// ---------------------------------------------------------------------------
// Teams tab
// ---------------------------------------------------------------------------

function renderTeamList() {
  const teams = teamList();
  $('rosTeams').innerHTML = teams.length ? teams.map(t => `<button class="ros-team${t.key === current ? ' is-on' : ''}" type="button" data-team="${esc(t.key)}" aria-pressed="${t.key === current}">
    <span>${esc(t.teamName)}</span>
    <span class="ros-count">${t.players.length}${isDirty(t) ? '<span class="ros-dot" title="Unsaved changes"></span>' : ''}</span>
  </button>`).join('') : '<p class="sse-dim">No teams for this season yet. Copy them from the offseason board or import a CSV.</p>';
}

function handSelect(field, value, label) {
  return `<select class="aces-select ros-hand" data-f="${field}" aria-label="${label}">${HANDS.map(h => `<option${h === (value || '-') ? ' selected' : ''}>${h}</option>`).join('')}</select>`;
}

function renderTeam() {
  const t = S.teams.get(current);
  if (!t) { $('rosRoster').innerHTML = ''; $('rosTeamHead').hidden = true; return; }
  $('rosTeamHead').hidden = false;
  $('rosTeamName').textContent = t.teamName;
  const captains = t.players.filter(p => p.captain).map(p => p.name);
  const linked = t.players.filter(p => p.authId).length;
  $('rosTeamMeta').textContent = `${plural(t.players.length, 'player')}, ${linked} with an account${captains.length ? `. Captain: ${captains.join(', ')}` : ''}${t.exists ? '' : '. No roster saved yet.'}`;
  const others = teamList().filter(x => x.key !== t.key);
  const rows = t.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.name.localeCompare(b.p.name));
  $('rosRoster').innerHTML = t.players.length ? `<div class="aces-table-wrap"><table class="aces-table ros-table">
    <thead><tr><th scope="col">Player</th><th scope="col">#</th><th scope="col">Pos</th><th scope="col">Bats</th><th scope="col">Throws</th><th scope="col">Captain</th><th scope="col">Move to</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
    <tbody>${rows.map(({ p, i }) => `<tr data-i="${i}">
      <th scope="row"><span class="ros-name">${esc(p.name)}</span>
        <span class="ros-id">${esc(p.id || 'no ID')}${p.authId ? ' <span class="aces-badge is-win">Account</span>' : ''}</span></th>
      <td><input class="sse-in ros-num" data-f="number" value="${esc(p.number || '')}" inputmode="numeric" maxlength="3" aria-label="${esc(p.name)} number"></td>
      <td><input class="sse-in ros-pos" data-f="position" value="${esc(p.position === '-' ? '' : p.position)}" maxlength="6" aria-label="${esc(p.name)} position"></td>
      <td>${handSelect('bats', p.bats, `${p.name} bats`)}</td>
      <td>${handSelect('throws', p.throws, `${p.name} throws`)}</td>
      <td class="ros-center"><input type="checkbox" data-f="captain" ${p.captain ? 'checked' : ''} aria-label="${esc(p.name)} captain"></td>
      <td><select class="aces-select ros-move" data-f="move" aria-label="Move ${esc(p.name)}"><option value="">-</option>${others.map(o => `<option value="${esc(o.key)}">${esc(o.teamName)}</option>`).join('')}</select></td>
      <td><button class="aces-btn is-sm is-ghost" type="button" data-remove aria-label="Remove ${esc(p.name)}">${icon('trash')}</button></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="sse-empty">Nobody on this team yet. Add players below.</p>';
}

function onRosterChange(e) {
  const tr = e.target.closest('tr[data-i]');
  const t = S.teams.get(current);
  if (!tr || !t) return;
  const p = t.players[Number(tr.dataset.i)];
  const f = e.target.dataset.f;
  if (f === 'number') p.number = e.target.value.trim() || null;
  else if (f === 'position') p.position = e.target.value.trim().toUpperCase() || '-';
  else if (f === 'bats' || f === 'throws') p[f] = e.target.value;
  else if (f === 'captain') p.captain = e.target.checked;
  else if (f === 'move' && e.target.value) {
    const to = S.teams.get(e.target.value);
    placePlayer(p, to);
    showToast(`${p.name} moved to ${to.teamName}`, 'info');
    renderTeam();
  } else return;
  changed();
}

async function onRosterClick(e) {
  const b = e.target.closest('[data-remove]');
  if (!b) return;
  const t = S.teams.get(current);
  const i = Number(b.closest('tr').dataset.i);
  const p = t.players[i];
  if (!(await confirmModal(`Take ${p.name} off ${t.teamName}? Their stats stay; they just won't be on this season's roster.`, { danger: true, confirmLabel: 'Remove' }))) return;
  t.players.splice(i, 1);
  renderTeam();
  changed();
}

async function addPlayer(e) {
  e.preventDefault();
  const name = $('rosAddName').value.trim().replace(/\s+/g, ' ');
  const t = S.teams.get(current);
  if (!name || !t) return;
  const player = resolvePlayer(name);
  const at = findInSeason(player);
  if (at && at.team === t) { showToast(`${player.name} is already on ${t.teamName}`, 'info'); return; }
  if (at && !(await confirmModal(`${player.name} is on ${at.team.teamName} this season. Move them to ${t.teamName}?`, { confirmLabel: 'Move' }))) return;
  placePlayer(player, t);
  $('rosAddName').value = '';
  renderTeam();
  changed();
  showToast(`${player.name} added${player.authId ? '' : ' (no linked account)'}`, 'success');
}

function fillDirectory() {
  $('rosNames').innerHTML = directory().map(p => `<option value="${esc(p.name)}"></option>`).join('');
}

function selectTeam(key) {
  current = key;
  const p = new URLSearchParams(location.search);
  if (key) p.set('team', key); else p.delete('team');
  history.replaceState(null, '', `?${p}`);
  renderTeamList();
  renderTeam();
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

async function openSeason(seasonId, team = '') {
  $('rosRoster').innerHTML = '<p class="sse-dim">Loading rosters...</p>';
  await loadSeason(seasonId);
  S.keepProfiles = seasonId === (ctx.config?.currentSeasonId || seasonId);
  $('rosKeep').checked = S.keepProfiles;
  fillDirectory();
  const keys = teamList().map(t => t.key);
  current = keys.includes(team) ? team : (keys.includes(current) ? current : keys[0] || '');
  selectTeam(current);
  changed();
  refreshImport();
  refreshCheck(true);
}

async function main() {
  ctx = await initPage({ title: 'Rosters', role: 'league-staff', deniedMessage: 'Rosters are managed by admins and league staff.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/rosters.html');

  const seasons = (await getAllSeasons()).sort((a, b) => b.id.localeCompare(a.id));
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, seasons.find(s => s.isActive)?.id, seasons[0]?.id]
    .find(id => id && seasons.some(s => s.id === id));
  const sel = $('rosSeason');
  sel.innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}${s.isActive ? ' (current)' : ''}</option>`).join('');
  if (start) sel.value = start;
  let shown = start;
  sel.addEventListener('change', async () => {
    if (dirtyTeams().length && !(await confirmModal('You have unsaved roster changes. Switch seasons and lose them?', { danger: true, confirmLabel: 'Switch' }))) { sel.value = shown; return; }
    shown = sel.value;
    const p = new URLSearchParams(location.search);
    p.set('season', sel.value);
    p.delete('team');
    history.replaceState(null, '', `?${p}`);
    await openSeason(sel.value);
  });

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('rosTeams').addEventListener('click', (e) => { const b = e.target.closest('[data-team]'); if (b) selectTeam(b.dataset.team); });
  $('rosRoster').addEventListener('change', onRosterChange);
  $('rosRoster').addEventListener('click', onRosterClick);
  $('rosAdd').addEventListener('submit', addPlayer);
  $('rosSave').addEventListener('click', save);
  $('rosUndo').addEventListener('click', undoAll);
  $('rosKeep').addEventListener('change', (e) => { S.keepProfiles = e.target.checked; });
  window.addEventListener('beforeunload', (e) => { if (dirtyTeams().length) { e.preventDefault(); e.returnValue = ''; } });

  mountImport({ changed, user: ctx.user });
  mountCheck({ user: ctx.user, reload: () => openSeason(S.seasonId, current) });
  pageReady();
  await loadUsers().catch(err => console.warn('[rosters] users unavailable', err));
  if (start) await openSeason(start, params.get('team') || '');
  setTab(['teams', 'import', 'offseason', 'check'].includes(params.get('tab')) ? params.get('tab') : 'teams');
}

main().catch(err => {
  console.error('[rosters] start failed', err);
  pageReady();
  showToast(`Could not start: ${err.message || err}`, 'error');
});
