// js/admin/schedule-editor.js
// The Edit a game tab of admin/schedule.html: change one game's date, time,
// place, teams or status, then share the update. Saves straight to the live game doc (all
// date/time and team fields together, see schedule-shared.js).
// For moving many games at once there is the Rework tab.
// ?tab=edit&game= opens a game.

import { db, doc, updateDoc } from '../core/firebase.js';
import { todayKey } from '../domain/dates.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { loadGames, teamsOf, locationsOf, gameFields, clashes, niceDate, to24, from24, updateMessage, whatsappUrl } from './schedule-shared.js';

const $ = (id) => document.getElementById(id);
let ctx = null;
let seasonId = '';
let games = [];
let show = 'upcoming';
let team = '';
let sel = null;
let lastMessage = '';

const who = () => ctx.profile?.displayName || ctx.profile?.name || ctx.user.email;

function renderList() {
  const today = todayKey();
  let list = games;
  if (show === 'upcoming') list = list.filter(g => !g.played && (!g.dateKey || g.dateKey >= today || g.status === 'postponed'));
  if (show === 'postponed') list = list.filter(g => g.status === 'postponed' || g.status === 'cancelled');
  if (team) list = list.filter(g => g.home === team || g.away === team);
  $('sedCount').textContent = `${list.length} of ${games.length}`;
  if (!list.length) { $('sedList').innerHTML = '<p class="sse-empty">No games match.</p>'; return; }
  const byDay = new Map();
  list.forEach(g => { const k = g.dateKey || 'tbd'; (byDay.get(k) || byDay.set(k, []).get(k)).push(g); });
  $('sedList').innerHTML = [...byDay.entries()].map(([k, gs]) => `<section class="sed-day">
    <h3>${esc(k === 'tbd' ? 'No date' : niceDate(k, 'long'))}</h3>
    <ul>${gs.map(g => {
      const badge = g.status === 'postponed' ? '<span class="aces-badge is-alert">Postponed</span>'
        : g.status === 'cancelled' ? '<span class="aces-badge is-loss">Cancelled</span>'
        : g.played ? `<span class="aces-badge is-outline">Final${g.raw.homeScore != null ? ` ${esc(g.raw.awayScore)}-${esc(g.raw.homeScore)}` : ''}</span>` : '';
      return `<li><button type="button" class="sed-game${sel?.id === g.id ? ' is-on' : ''}" data-game="${esc(g.id)}">
        <span class="sed-time">${esc(g.time || 'TBD')}</span>
        <span class="sed-teams">${esc(g.away)} at ${esc(g.home)}</span>
        <span class="sed-where">${esc(g.location)}</span>
        ${g.type === 'playoff' ? `<span class="aces-badge is-brand">${esc(g.round || 'Playoff')}</span>` : ''}${badge}
      </button></li>`;
    }).join('')}</ul></section>`).join('');
}

function current() {
  return {
    dateKey: $('sedDate').value, time: from24($('sedTime').value),
    home: $('sedHome').value, away: $('sedAway').value,
    location: $('sedWhere').value.trim(), status: $('sedStatus').value
  };
}

function renderChecks() {
  if (!sel) return;
  const v = current();
  const changes = [];
  if (v.dateKey !== sel.dateKey || v.time !== sel.time) changes.push('when');
  if (v.home !== sel.home || v.away !== sel.away) changes.push('teams');
  if (v.location !== sel.location) changes.push('where');
  if (v.status !== sel.status) changes.push('status');
  const notes = [];
  if (v.home === v.away) notes.push(['bad', 'Home and away are the same team.']);
  clashes({ ...v, id: sel.id }, games).forEach(c => notes.push(['warn', c]));
  if (changes.includes('teams') && (sel.played || sel.hasStats)) notes.push(['warn', 'This game has a result or stats. Changing the teams does not move them.']);
  if (changes.includes('when') && sel.played) notes.push(['warn', 'This game has already been played.']);
  $('sedChecks').innerHTML = notes.map(([k, t]) => `<li class="tr-check is-${k === 'bad' ? 'warn' : k}">${icon('alert')}<span>${esc(t)}</span></li>`).join('');
  $('sedSave').disabled = !changes.length && !$('sedNote').value.trim() || v.home === v.away || !v.dateKey;
  $('sedSave').textContent = changes.length ? 'Save changes' : 'Nothing changed';
}

function openGame(id) {
  sel = games.find(g => g.id === id);
  if (!sel) return;
  const p = new URLSearchParams(location.search);
  p.set('game', id);
  history.replaceState(null, '', `?${p}`);
  const teams = teamsOf(games);
  const opts = (v) => teams.map(t => `<option${t === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
  $('sedAway').innerHTML = opts(sel.away);
  $('sedHome').innerHTML = opts(sel.home);
  $('sedDate').value = sel.dateKey;
  $('sedTime').value = to24(sel.time);
  $('sedWhere').value = sel.location;
  $('sedStatus').value = ['scheduled', 'postponed', 'cancelled', 'completed'].includes(sel.status) ? sel.status : 'scheduled';
  $('sedNote').value = '';
  $('sedLock').checked = true;
  $('sedTitle').textContent = `${sel.away} at ${sel.home}`;
  $('sedNow').textContent = `Now: ${niceDate(sel.dateKey, 'long')}, ${sel.time || 'no time'}${sel.location ? `, ${sel.location}` : ''}. Game ID ${sel.id}.`;
  $('sedShare').hidden = true;
  $('sedEditor').hidden = false;
  renderList();
  renderChecks();
  $('sedEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function save() {
  if (!sel) return;
  const v = current();
  const was = `${niceDate(sel.dateKey, 'long')}, ${sel.time || 'TBD'}${sel.location ? `, ${sel.location}` : ''}`;
  if (sel.played && (v.dateKey !== sel.dateKey || v.home !== sel.home || v.away !== sel.away)
    && !(await confirmModal('This game has already been played. Change it anyway?', { danger: true, confirmLabel: 'Change it' }))) return;
  const btn = $('sedSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const fields = gameFields(v, who());
    fields.manuallyEdited = $('sedLock').checked;
    const note = $('sedNote').value.trim();
    if (note) fields.rescheduleReason = note;
    await updateDoc(doc(db, 'seasons', seasonId, 'games', sel.id), fields);
    showToast('Game saved', 'success');
    window.dispatchEvent(new CustomEvent('aces:schedule-changed', { detail: { from: 'edit' } }));
    const now = `${niceDate(v.dateKey, 'long')}, ${v.time || 'TBD'}${v.location ? `, ${v.location}` : ''}`;
    lastMessage = updateMessage([{ away: v.away, home: v.home, from: was, to: now, reason: note, status: v.status }]);
    $('sedMsg').value = lastMessage;
    $('sedWa').href = whatsappUrl(lastMessage);
    $('sedShare').hidden = false;
    const id = sel.id;
    games = await loadGames(seasonId);
    sel = games.find(g => g.id === id);
    renderList();
    renderChecks();
  } catch (err) {
    console.error('[schedule-editor] save failed', err);
    showToast(`Could not save: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function openSeason(id, game = '') {
  seasonId = id;
  sel = null;
  $('sedEditor').hidden = true;
  $('sedList').innerHTML = '<p class="sse-dim">Loading games...</p>';
  games = await loadGames(id);
  $('sedTeam').innerHTML = '<option value="">All teams</option>' + teamsOf(games).map(t => `<option>${esc(t)}</option>`).join('');
  $('sedPlaces').innerHTML = locationsOf(games).map(l => `<option value="${esc(l)}"></option>`).join('');
  team = '';
  renderList();
  if (game && games.some(g => g.id === game)) {
    const g = games.find(x => x.id === game);
    if (g.played) { show = 'all'; document.querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.show === 'all'))); renderList(); }
    openGame(game);
  }
}

/**
 * Sets up the Edit a game tab of admin/schedule.html.
 * @param {object} c  the initPage context
 */
export function mountEditor(c) {
  ctx = c;
  document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
    show = b.dataset.show;
    document.querySelectorAll('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));
  $('sedTeam').addEventListener('change', (e) => { team = e.target.value; renderList(); });
  $('sedList').addEventListener('click', (e) => { const b = e.target.closest('[data-game]'); if (b) openGame(b.dataset.game); });
  ['sedDate', 'sedTime', 'sedHome', 'sedAway', 'sedWhere', 'sedStatus', 'sedNote'].forEach(id => $(id).addEventListener('input', renderChecks));
  $('sedSwap').addEventListener('click', () => { const a = $('sedAway').value; $('sedAway').value = $('sedHome').value; $('sedHome').value = a; renderChecks(); });
  $('sedSave').addEventListener('click', save);
  $('sedClose').addEventListener('click', () => {
    sel = null;
    $('sedEditor').hidden = true;
    const p = new URLSearchParams(location.search);
    p.delete('game');
    history.replaceState(null, '', `?${p}`);
    renderList();
  });
  $('sedMsg').addEventListener('input', () => { $('sedWa').href = whatsappUrl($('sedMsg').value); });
  $('sedCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('sedMsg').value); showToast('Copied', 'success'); } catch { showToast('Select the text and copy it', 'info'); }
  });
}

/** Loads a season into the editor (and opens a game when given). */
export async function editorSeason(id, game = '', force = false) {
  if (seasonId === id && !game && !force) return;
  await openSeason(id, game);
}
