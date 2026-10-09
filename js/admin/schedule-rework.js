// js/admin/schedule-rework.js
// admin/schedule-rework.html: move many games after rainouts.
// Drag a game onto a new day (postponed games wait in the tray), set its time
// and a reason. Moves are a shared draft at seasons/{id}/scheduleDraft/current,
// so other staff see the same plan live; nothing touches the schedule until
// Publish, which writes every moved game (see schedule-shared.js) and gives
// you the update to send. Games already played can't be moved here.

import { initPage, pageReady } from '../core/app.js';
import { db, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, serverTimestamp } from '../core/firebase.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel } from '../domain/season-ids.js';
import { todayKey } from '../domain/dates.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { mountAdminShell } from './shell.js';
import { loadGames, gameFields, clashes, niceDate, keyOf, dateOfKey, to24, from24, minutes, updateMessage, whatsappUrl } from './schedule-shared.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let ctx = null;
let seasonId = '';
let games = [];
let draft = {};          // gameId -> { newDate, newTime, reason, movedBy, movedAt }
let draftRef = null;
let unsub = null;
let month = new Date();
let sortables = [];

const who = () => ctx.profile?.displayName || ctx.profile?.name || ctx.user.email;
const byId = (id) => games.find(g => g.id === id);

/** A game as it would be with its pending move. */
function eff(g) {
  const c = draft[g.id];
  return c ? { ...g, dateKey: c.newDate, time: c.newTime, status: 'scheduled', moved: true } : { ...g, moved: false };
}
const effAll = () => games.map(eff);

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

async function putChange(id, change) {
  draft[id] = change;
  renderAll();
  try {
    await setDoc(draftRef, { changes: { [id]: change }, updatedAt: serverTimestamp(), updatedBy: who() }, { merge: true });
  } catch (err) {
    console.error('[rework] draft save failed', err);
    showToast('Could not save that move. Check your connection.', 'error');
  }
}

async function dropChange(id) {
  delete draft[id];
  renderAll();
  try { await updateDoc(draftRef, { [`changes.${id}`]: deleteField() }); }
  catch (err) { if (err.code !== 'not-found') console.error('[rework] clear failed', err); }
}

function moveTo(id, dateKey, { force = false } = {}) {
  const g = byId(id);
  if (!g) return;
  if (g.played) { showToast('That game has been played. Use the schedule editor if it really needs changing.', 'error'); renderAll(); return; }
  if (!force && dateKey === g.dateKey && !draft[id] && g.status !== 'postponed') { renderAll(); return; }
  putChange(id, {
    newDate: dateKey,
    newTime: draft[id]?.newTime || g.time || '7:00 PM',
    reason: draft[id]?.reason || (g.status === 'postponed' ? 'Rain make-up' : ''),
    movedBy: who(), movedAt: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function chip(g, all, { tray = false } = {}) {
  const e = eff(g);
  const warn = clashes(e, all);
  const sub = tray ? `was ${niceDate(g.dateKey)} ${g.time}` : e.moved ? `from ${niceDate(g.dateKey)} ${g.time}` : '';
  return `<div class="srw-chip${e.moved ? ' is-moved' : ''}${g.played ? ' is-locked' : ''}${warn.length ? ' is-warn' : ''}" data-game="${esc(g.id)}" title="${esc(warn.join('. '))}">
    <span class="srw-chip-time">${esc(e.time || 'TBD')}${warn.length ? icon('alert') : ''}</span>
    <span class="srw-chip-teams">${esc(g.away)} at ${esc(g.home)}</span>
    ${sub ? `<span class="srw-chip-sub">${esc(sub)}</span>` : ''}
  </div>`;
}

function renderCalendar() {
  $('srwMonth').textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const all = effAll();
  const byDay = {};
  all.forEach(g => {
    if ((g.status === 'postponed' || g.status === 'cancelled') && !g.moved) return;
    (byDay[g.dateKey] = byDay[g.dateKey] || []).push(g);
  });
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = todayKey();
  let html = DAYS.map(d => `<div class="srw-dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = keyOf(d);
    const list = (byDay[k] || []).sort((a, b) => minutes(a.time) - minutes(b.time));
    html += `<div class="srw-day${d.getMonth() === month.getMonth() ? '' : ' is-out'}${k === today ? ' is-today' : ''}${k < today ? ' is-past' : ''}" data-date="${k}">
      <span class="srw-num">${d.getDate()}</span>
      ${list.map(g => chip(byId(g.id), all)).join('')}
    </div>`;
  }
  $('srwGrid').innerHTML = html;
}

function renderTray() {
  const waiting = games.filter(g => (g.status === 'postponed') && !draft[g.id]);
  $('srwTrayCount').textContent = waiting.length;
  const all = effAll();
  $('srwTray').innerHTML = waiting.length ? waiting.map(g => chip(g, all, { tray: true })).join('') : '<p class="sse-dim">No postponed games waiting.</p>';
}

function renderChanges() {
  const ids = Object.keys(draft).filter(byId);
  $('srwCount').textContent = ids.length;
  $('srwPublish').disabled = !ids.length;
  $('srwDiscard').disabled = !ids.length;
  if (!ids.length) { $('srwChanges').innerHTML = '<p class="sse-dim">No moves yet. Drag a game onto a new day, or click one to change its time.</p>'; return; }
  const all = effAll();
  $('srwChanges').innerHTML = ids.sort((a, b) => draft[a].newDate.localeCompare(draft[b].newDate)).map(id => {
    const g = byId(id);
    const c = draft[id];
    const warn = clashes(eff(g), all);
    return `<div class="srw-change${warn.length ? ' is-warn' : ''}" data-change="${esc(id)}">
      <div class="srw-change-head"><strong>${esc(g.away)} at ${esc(g.home)}</strong>
        <button class="aces-btn is-sm is-ghost" type="button" data-revert="${esc(id)}">Undo</button></div>
      <div class="sse-dim">${esc(niceDate(g.dateKey))} ${esc(g.time)} to <strong>${esc(niceDate(c.newDate))}</strong></div>
      <div class="srw-change-row">
        <input class="aces-input" type="date" data-f="date" value="${esc(c.newDate)}" aria-label="New date">
        <input class="aces-input" type="time" data-f="time" step="300" value="${esc(to24(c.newTime))}" aria-label="New time">
      </div>
      <input class="aces-input" type="text" data-f="reason" value="${esc(c.reason || '')}" placeholder="Reason (optional)" aria-label="Reason">
      ${warn.length ? `<ul class="tr-checks">${warn.map(w => `<li class="tr-check is-warn">${icon('alert')}<span>${esc(w)}</span></li>`).join('')}</ul>` : ''}
      ${c.movedBy ? `<span class="srw-by">Moved by ${esc(c.movedBy)}</span>` : ''}
    </div>`;
  }).join('');
}

function bindDrag() {
  sortables.forEach(s => s.destroy());
  sortables = [];
  if (!window.Sortable) return;
  const opts = {
    group: 'srw', animation: 150, draggable: '.srw-chip:not(.is-locked)', filter: '.is-locked',
    onEnd: (e) => {
      const id = e.item.dataset.game;
      const to = e.to.dataset.date;
      if (!id || e.from === e.to) { renderAll(); return; }
      if (to === 'TRAY') {
        const g = byId(id);
        if (g?.status === 'postponed') dropChange(id);
        else { showToast('Only postponed games go back in the tray', 'info'); renderAll(); }
        return;
      }
      moveTo(id, to);
    }
  };
  document.querySelectorAll('.srw-day').forEach(el => sortables.push(new window.Sortable(el, opts)));
  sortables.push(new window.Sortable($('srwTray'), opts));
}

function renderAll() {
  renderTray();
  renderCalendar();
  renderChanges();
  bindDrag();
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish() {
  const ids = Object.keys(draft).filter(byId);
  if (!ids.length) return;
  const all = effAll();
  const clashing = ids.filter(id => clashes(eff(byId(id)), all).length);
  if (!(await confirmModal(`Publish ${plural(ids.length, 'change')} to the live schedule?${clashing.length ? ` ${plural(clashing.length, 'game')} still ${clashing.length === 1 ? 'has' : 'have'} a clash.` : ''} Everyone sees it right away.`, { confirmLabel: 'Publish', danger: clashing.length > 0 }))) return;
  const btn = $('srwPublish');
  btn.disabled = true;
  btn.textContent = 'Publishing...';
  try {
    const batch = writeBatch(db);
    const lines = [];
    ids.forEach(id => {
      const g = byId(id);
      const c = draft[id];
      batch.update(doc(db, 'seasons', seasonId, 'games', id), {
        ...gameFields({ dateKey: c.newDate, time: c.newTime, status: 'scheduled' }, who()),
        manuallyEdited: true, rescheduleReason: c.reason || null
      });
      lines.push({ away: g.away, home: g.home, from: `${niceDate(g.dateKey, 'long')} ${g.time}`, to: `${niceDate(c.newDate, 'long')} ${c.newTime}${g.location ? `, ${g.location}` : ''}`, reason: c.reason });
    });
    await batch.commit();
    await deleteDoc(draftRef);
    const msg = updateMessage(lines);
    $('srwMsg').value = msg;
    $('srwWa').href = whatsappUrl(msg);
    $('srwDone').hidden = false;
    $('srwDone').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Schedule published', 'success');
    games = await loadGames(seasonId);
    renderAll();
  } catch (err) {
    console.error('[rework] publish failed', err);
    showToast(`Publish failed: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Publish to the live schedule';
    btn.disabled = !Object.keys(draft).length;
  }
}

async function discard() {
  if (!(await confirmModal('Throw away every pending move? Other staff lose them too.', { danger: true, confirmLabel: 'Discard all' }))) return;
  try { await deleteDoc(draftRef); } catch (err) { console.error('[rework] discard failed', err); }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function openSeason(id) {
  seasonId = id;
  $('srwDone').hidden = true;
  games = await loadGames(id);
  if (unsub) unsub();
  draftRef = doc(db, 'seasons', id, 'scheduleDraft', 'current');
  draft = {};
  unsub = onSnapshot(draftRef, snap => { draft = snap.exists() ? (snap.data().changes || {}) : {}; renderAll(); },
    err => console.error('[rework] draft listener', err));
  const today = todayKey();
  const next = games.find(g => !g.played && g.dateKey >= today) || games[games.length - 1];
  const anchor = next?.dateKey ? dateOfKey(next.dateKey) : new Date();
  month = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  renderAll();
}

async function main() {
  ctx = await initPage({ title: 'Schedule rework', role: 'league-staff', deniedMessage: 'Schedule rework is for admins and league staff.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/schedule-rework.html');
  const seasons = (await getAllSeasons()).sort((a, b) => b.id.localeCompare(a.id));
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, seasons.find(s => s.isActive)?.id, seasons[0]?.id].find(id => id && seasons.some(s => s.id === id));
  $('srwSeason').innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}</option>`).join('');
  if (start) $('srwSeason').value = start;
  $('srwSeason').addEventListener('change', () => {
    history.replaceState(null, '', `?season=${encodeURIComponent($('srwSeason').value)}`);
    openSeason($('srwSeason').value);
  });
  $('srwPrev').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); bindDrag(); });
  $('srwNext').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); bindDrag(); });
  $('srwGrid').addEventListener('click', (e) => {
    const c = e.target.closest('.srw-chip');
    if (!c) return;
    const g = byId(c.dataset.game);
    if (!g || g.played) return;
    if (!draft[g.id]) moveTo(g.id, g.dateKey, { force: true });
    requestAnimationFrame(() => document.querySelector(`[data-change="${CSS.escape(g.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  });
  $('srwChanges').addEventListener('click', (e) => { const b = e.target.closest('[data-revert]'); if (b) dropChange(b.dataset.revert); });
  $('srwChanges').addEventListener('change', (e) => {
    const box = e.target.closest('[data-change]');
    if (!box) return;
    const id = box.dataset.change;
    const c = { ...draft[id], movedBy: who(), movedAt: new Date().toISOString() };
    if (e.target.dataset.f === 'date' && e.target.value) c.newDate = e.target.value;
    if (e.target.dataset.f === 'time' && e.target.value) c.newTime = from24(e.target.value);
    if (e.target.dataset.f === 'reason') c.reason = e.target.value.trim();
    putChange(id, c);
  });
  $('srwPublish').addEventListener('click', publish);
  $('srwDiscard').addEventListener('click', discard);
  $('srwMsg').addEventListener('input', () => { $('srwWa').href = whatsappUrl($('srwMsg').value); });
  $('srwCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('srwMsg').value); showToast('Copied', 'success'); } catch { showToast('Select the text and copy it', 'info'); }
  });
  pageReady();
  if (start) await openSeason(start);
}

main().catch(err => {
  console.error('[rework] start failed', err);
  pageReady();
  showToast(`Could not start: ${err.message || err}`, 'error');
});
