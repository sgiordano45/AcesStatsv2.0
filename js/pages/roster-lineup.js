// js/pages/roster-lineup.js
// Batting order and defense panels for roster-management.html, plus the
// tools around them: load from a past game, templates, copy, print and
// marking a lineup final. State and edits are in roster-core.js.

import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import {
  S, INNINGS, RSVP, initials, lastName, playerOf, resolveId, avgText, rsvpStatus,
  availablePlayers, currentLineup, currentGame, spotOf, benchSize, catcherLocked,
  batPlace, batAppend, batRemove, batMove, batCompact, batSet,
  posAssign, posClear, benchAdd, benchRemove, copyInning, clearDefense, flush
} from './roster-core.js';
import {
  loadLineup, setBattingFinal, setFieldingFinal, listTemplates, saveTemplate, deleteTemplate
} from '../data/lineups.js';

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const gameTitle = (g) => (g ? `${g.label} ${g.isHome ? 'vs' : 'at'} ${g.opponent}` : '');

function rsvpFlag(p) {
  if (!p || p.unknown) return p?.unknown ? '<span class="rm-flag is-no">Not on roster</span>' : '';
  const s = rsvpStatus(p);
  if (s === 'yes') return '';
  return `<span class="rm-flag ${RSVP[s].cls}">${esc(RSVP[s].label)}</span>`;
}

function playerChip(p, { drag = false, act = '', data = '', meta = true, flag = true } = {}) {
  const tag = act ? 'button' : 'div';
  const attrs = [
    act ? `type="button" data-act="${act}"` : '',
    drag ? `draggable="true" data-drag="${esc(p.id)}"` : '',
    data
  ].filter(Boolean).join(' ');
  const avg = avgText(p);
  return `<${tag} class="rm-pl${p.id === S.me?.id ? ' is-me' : ''}${p.unknown ? ' is-unknown' : ''}" ${attrs}>
    <span class="aces-avatar rm-av" aria-hidden="true">${esc(initials(p.name))}</span>
    <span class="rm-pl-name"><span class="rm-pl-full">${esc(p.name)}</span>${meta ? `<small>${p.jersey ? `#${esc(p.jersey)}` : ''}${avg ? `${p.jersey ? ' \u00b7 ' : ''}${avg}` : ''}</small>` : ''}</span>
    ${flag ? rsvpFlag(p) : ''}
  </${tag}>`;
}

function finalBadge(final) {
  return final
    ? `<span class="aces-badge is-win">${icon('lock')} Final</span>`
    : '<span class="aces-badge is-outline">Draft</span>';
}

function toolsMenu(kind) {
  return `<div class="rm-tools">
    <button class="aces-btn is-sm is-ghost" type="button" data-act="past" data-kind="${kind}">${icon('calendar')} From a past game</button>
    <button class="aces-btn is-sm is-ghost" type="button" data-act="templates" data-kind="${kind}">${icon('clipboard')} Templates</button>
    <button class="aces-btn is-sm is-ghost" type="button" data-act="copy" data-kind="${kind}">${icon('copy')} Copy</button>
    <button class="aces-btn is-sm is-ghost" type="button" data-act="print" data-kind="${kind}">${icon('print')} Print</button>
  </div>`;
}

function maybeToggle() {
  return `<label class="rm-check"><input type="checkbox" data-change="maybe"${S.includeMaybe ? ' checked' : ''}> Include Maybes</label>`;
}

function failedCard() {
  return `<section class="aces-card rm-card"><div class="aces-empty">${icon('alert-circle')}<p class="aces-empty-title">Couldn't load the lineup</p><p>Check your connection and try again.</p>
    <button class="aces-btn is-primary" type="button" data-act="retry-lineup">${icon('refresh')} Try again</button></div></section>`;
}

// ---------------------------------------------------------------------------
// Batting order
// ---------------------------------------------------------------------------

export function renderBatting() {
  const L = currentLineup();
  if (!L?.loaded) return '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  if (L.failed) return failedCard();
  if (!S.canManage) return battingView(L);

  const locked = L.batFinal;
  const size = Math.max(S.rules.battingOrderSize, L.batting.length);
  const inOrder = new Set(L.batting.filter(Boolean));
  const free = availablePlayers().filter((p) => !inOrder.has(p.id));
  const filled = inOrder.size;

  const slots = Array.from({ length: size }, (_, i) => {
    const p = playerOf(L.batting[i], L);
    if (!p) {
      return `<li class="rm-slot is-empty" data-drop="bat:${i}"><span class="rm-num">${i + 1}</span>
        ${locked ? '<span class="rm-empty-text">Empty</span>' : `<button class="rm-add" type="button" data-act="bat-pick" data-i="${i}">${icon('plus')} Add a player</button>`}</li>`;
    }
    return `<li class="rm-slot" data-drop="bat:${i}"><span class="rm-num">${i + 1}</span>
      ${playerChip(p, { drag: !locked })}
      ${locked ? '' : `<span class="rm-slot-btns">
        <button class="aces-btn is-icon is-sm is-ghost" type="button" data-act="bat-up" data-i="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${icon('chevron-up')}</button>
        <button class="aces-btn is-icon is-sm is-ghost" type="button" data-act="bat-down" data-i="${i}" aria-label="Move down"${i === size - 1 ? ' disabled' : ''}>${icon('chevron-down')}</button>
        <button class="aces-btn is-icon is-sm is-ghost rm-x" type="button" data-act="bat-remove" data-i="${i}" aria-label="Take ${esc(p.name)} out">${icon('close')}</button>
      </span>`}</li>`;
  }).join('');

  return `<section class="aces-card rm-card">
    <div class="aces-card-head rm-head">
      <h2 class="aces-card-title">Batting order ${finalBadge(locked)}</h2>
      ${toolsMenu('batting')}
    </div>
    ${locked ? `<div class="aces-notice is-success rm-final">${icon('lock')}<div><strong>This batting order is final.</strong> Players see it on this page. <button class="rm-link" type="button" data-act="bat-final" data-on="0">Edit the order</button></div></div>` : `
    <p class="rm-hint">${filled} of ${S.rules.battingOrderSize} spots filled. Drag players into place, or tap a player to add them to the next open spot.</p>`}
    <div class="rm-bat${locked ? ' is-locked' : ''}">
      <ol class="rm-slots" aria-label="Batting order">${slots}</ol>
      ${locked ? '' : `<aside class="rm-pool" data-drop="pool">
        <div class="rm-pool-head"><h3>Available <small>${free.length}</small></h3>${maybeToggle()}</div>
        ${free.length
          ? `<div class="rm-pool-list">${free.map((p) => playerChip(p, { drag: true, act: 'bat-add', data: `data-pid="${esc(p.id)}"` })).join('')}</div>`
          : `<p class="rm-pool-empty">${availablePlayers().length ? 'Everyone who is in has a spot.' : 'No one has said they are in yet.'}</p>`}
        <div class="rm-pool-btns">
          <button class="aces-btn is-sm" type="button" data-act="bat-fill"${free.length ? '' : ' disabled'}>Add everyone</button>
          <button class="aces-btn is-sm is-ghost" type="button" data-act="bat-compact"${filled ? '' : ' disabled'}>Close gaps</button>
          <button class="aces-btn is-sm is-ghost" type="button" data-act="bat-clear"${filled ? '' : ' disabled'}>Clear</button>
        </div>
      </aside>`}
    </div>
    ${locked ? '' : `<div class="rm-finalize"><button class="aces-btn is-primary" type="button" data-act="bat-final" data-on="1"${filled ? '' : ' disabled'}>${icon('lock')} Mark batting order final</button>
      <span class="aces-hint">Locks the order and shows it to your players.</span></div>`}
  </section>`;
}

function battingView(L) {
  const ids = L.batting.filter(Boolean);
  if (!L.batFinal || !ids.length) {
    return `<section class="aces-card rm-card"><div class="aces-empty">${icon('clipboard')}<p>Your captain hasn't posted the batting order for this game yet.</p></div></section>`;
  }
  return `<section class="aces-card rm-card">
    <div class="aces-card-head rm-head"><h2 class="aces-card-title">Batting order ${finalBadge(true)}</h2>
      <div class="rm-tools"><button class="aces-btn is-sm is-ghost" type="button" data-act="copy" data-kind="batting">${icon('copy')} Copy</button></div></div>
    <ol class="rm-slots is-view">${ids.map((id, i) => `<li class="rm-slot"><span class="rm-num">${i + 1}</span>${playerChip(playerOf(id, L), { flag: false })}</li>`).join('')}</ol>
  </section>`;
}

// ---------------------------------------------------------------------------
// Defense
// ---------------------------------------------------------------------------

function inningCount(L, n) {
  return Object.keys(L.fielding[n] || {}).length;
}

export function renderDefense() {
  const L = currentLineup();
  if (!L?.loaded) return '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span></div>';
  if (L.failed) return failedCard();
  if (!S.canManage) return defenseView(L);

  const locked = L.fieldFinal;
  const n = S.inning;
  const row = L.fielding[n] || {};
  const bench = L.bench[n] || [];
  const cLocked = catcherLocked();
  const pool = availablePlayers();
  const used = new Set([...Object.values(row), ...bench]);
  const free = pool.filter((p) => !used.has(p.id));

  const innings = INNINGS.map((i) => {
    const c = inningCount(L, i);
    return `<button class="aces-segment${i === n ? ' is-active' : ''}" type="button" data-act="inning" data-n="${i}" aria-pressed="${i === n}">
      ${i}<small class="rm-seg-count${c >= S.rules.positions.length - (cLocked ? 1 : 0) ? ' is-full' : ''}">${c}</small></button>`;
  }).join('');

  const positions = S.rules.positions.map((pos) => {
    const p = playerOf(row[pos], L);
    const isC = pos === 'C' && cLocked;
    const lockedRow = locked || isC;
    return `<li class="rm-pos${isC ? ' is-locked' : ''}" ${lockedRow ? '' : `data-drop="pos:${pos}"`}>
      <span class="rm-pos-label">${isC ? icon('lock', { className: 'is-sm' }) : ''}${esc(pos)}</span>
      ${p ? playerChip(p, { drag: !locked, flag: true, meta: false, act: locked ? '' : 'pos-pick', data: `data-pos="${pos}"` })
        : isC ? `<span class="rm-empty-text">Needs ${S.rules.catcherMinPlayers}+ players in</span>`
          : locked ? '<span class="rm-empty-text">Open</span>'
            : `<button class="rm-add" type="button" data-act="pos-pick" data-pos="${pos}">${icon('plus')} Pick</button>`}
      ${p && !locked ? `<button class="aces-btn is-icon is-sm is-ghost rm-x" type="button" data-act="pos-clear" data-pos="${pos}" aria-label="Clear ${esc(pos)}">${icon('close')}</button>` : ''}
    </li>`;
  }).join('');

  const benchList = bench.map((id) => {
    const p = playerOf(id, L);
    return `<li class="rm-pos is-bench">${playerChip(p, { drag: !locked, meta: false })}
      ${locked ? '' : `<button class="aces-btn is-icon is-sm is-ghost rm-x" type="button" data-act="bench-remove" data-pid="${esc(id)}" aria-label="Take ${esc(p.name)} off the bench">${icon('close')}</button>`}</li>`;
  }).join('');

  return `<section class="aces-card rm-card">
    <div class="aces-card-head rm-head">
      <h2 class="aces-card-title">Defense ${finalBadge(locked)}</h2>
      ${toolsMenu('defense')}
    </div>
    ${locked ? `<div class="aces-notice is-success rm-final">${icon('lock')}<div><strong>The defense is final.</strong> Players see it on this page. <button class="rm-link" type="button" data-act="field-final" data-on="0">Edit the defense</button></div></div>` : ''}
    <div class="rm-inning-bar">
      <div class="aces-segmented rm-innings" role="group" aria-label="Inning">${innings}</div>
      ${locked ? '' : `<div class="rm-inning-btns">
        ${n > 1 ? `<button class="aces-btn is-sm is-ghost" type="button" data-act="inning-copy">${icon('copy')} Same as inning ${n - 1}</button>` : ''}
        <button class="aces-btn is-sm is-ghost" type="button" data-act="inning-all">Use for every inning</button>
      </div>`}
    </div>
    <div class="rm-def${locked ? ' is-locked' : ''}">
      <div>
        <h3 class="rm-sub">Inning ${n} positions</h3>
        <ul class="rm-positions">${positions}</ul>
      </div>
      <div>
        <h3 class="rm-sub">Bench <small>${bench.length} of ${benchSize()}</small></h3>
        <ul class="rm-positions rm-bench" ${locked ? '' : 'data-drop="bench"'}>${benchList || '<li class="rm-pos is-empty"><span class="rm-empty-text">No one on the bench</span></li>'}</ul>
        ${locked ? '' : `<div class="rm-pool is-inline" data-drop="free">
          <div class="rm-pool-head"><h3>Not placed in inning ${n} <small>${free.length}</small></h3>${maybeToggle()}</div>
          ${free.length ? `<div class="rm-pool-list">${free.map((p) => playerChip(p, { drag: true, act: 'free-pick', meta: false, data: `data-pid="${esc(p.id)}"` })).join('')}</div>`
            : `<p class="rm-pool-empty">${pool.length ? 'Everyone has a spot this inning.' : 'No one has said they are in yet.'}</p>`}
        </div>`}
      </div>
    </div>
    ${overview(L, { clickable: true })}
    ${locked ? '' : `<div class="rm-finalize">
      <button class="aces-btn is-primary" type="button" data-act="field-final" data-on="1"${INNINGS.some((i) => inningCount(L, i)) ? '' : ' disabled'}>${icon('lock')} Mark defense final</button>
      <button class="aces-btn is-ghost rm-danger" type="button" data-act="def-reset">${icon('trash')} Reset defense</button>
    </div>`}
  </section>`;
}

/** Positions down the side, innings across, then the bench and playing time. */
function overview(L, { clickable = false } = {}) {
  const head = INNINGS.map((i) => `<th scope="col">${clickable
    ? `<button class="rm-th-btn${i === S.inning ? ' is-active' : ''}" type="button" data-act="inning" data-n="${i}">${i}</button>` : i}</th>`).join('');
  const rows = S.rules.positions.map((pos) => `<tr><th scope="row">${esc(pos)}</th>${INNINGS.map((i) => {
    const p = playerOf(L.fielding[i]?.[pos], L);
    return `<td>${p ? esc(lastName(p.name)) : '<span class="rm-dim">-</span>'}</td>`;
  }).join('')}</tr>`).join('');
  const benchRow = `<tr class="is-bench"><th scope="row">Bench</th>${INNINGS.map((i) => {
    const names = (L.bench[i] || []).map((id) => esc(lastName(playerOf(id, L).name)));
    return `<td>${names.length ? names.join('<br>') : '<span class="rm-dim">-</span>'}</td>`;
  }).join('')}</tr>`;

  // Innings in the field for everyone placed at least once.
  const counts = new Map();
  INNINGS.forEach((i) => {
    Object.values(L.fielding[i] || {}).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    (L.bench[i] || []).forEach((id) => { if (!counts.has(id)) counts.set(id, 0); });
  });
  const set = INNINGS.filter((i) => inningCount(L, i)).length;
  const time = [...counts.entries()]
    .map(([id, c]) => ({ p: playerOf(id, L), c }))
    .sort((a, b) => a.c - b.c || a.p.name.localeCompare(b.p.name));

  return `<div class="rm-overview">
    <h3 class="rm-sub">All innings</h3>
    <div class="aces-table-wrap"><table class="aces-table is-compact rm-grid">
      <thead><tr><th scope="col">Pos</th>${head}</tr></thead>
      <tbody>${rows}${benchRow}</tbody>
    </table></div>
    ${time.length && set ? `<p class="rm-time"><strong>Innings in the field</strong> (of ${set} set): ${time.map(({ p, c }) => `<span class="${c < set / 2 ? 'is-low' : ''}">${esc(p.name)} ${c}</span>`).join(', ')}</p>` : ''}
  </div>`;
}

function defenseView(L) {
  if (!L.fieldFinal) {
    return `<section class="aces-card rm-card"><div class="aces-empty">${icon('field')}<p>Your captain hasn't posted the defense for this game yet.</p></div></section>`;
  }
  return `<section class="aces-card rm-card">
    <div class="aces-card-head rm-head"><h2 class="aces-card-title">Defense ${finalBadge(true)}</h2>
      <div class="rm-tools"><button class="aces-btn is-sm is-ghost" type="button" data-act="copy" data-kind="defense">${icon('copy')} Copy</button></div></div>
    ${myInnings(L)}
    ${overview(L)}
  </section>`;
}

function myInnings(L) {
  if (!S.me) return '';
  const spots = INNINGS.map((i) => spotOf(L, i, S.me.id));
  if (!spots.some(Boolean)) return '';
  return `<p class="rm-mine"><strong>You:</strong> ${spots.map((s, i) => `${i + 1}: ${s === 'bench' ? 'Bench' : s ? esc(s) : '-'}`).join(' \u00b7 ')}</p>`;
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

/** A list of choices in a dialog. Resolves the picked value, or null. */
async function pick(title, items, { note = '' } = {}) {
  let picked = null;
  const body = items.length
    ? `<ul class="rm-pick">${items.map((it) => `<li><button type="button" class="rm-pick-btn${it.danger ? ' is-danger' : ''}" data-pick="${esc(it.value)}"${it.disabled ? ' disabled' : ''}>
        <span>${esc(it.label)}</span>${it.meta ? `<small>${esc(it.meta)}</small>` : ''}</button></li>`).join('')}</ul>`
    : '<p>No one to pick.</p>';
  await openModal({
    title,
    html: (note ? `<p class="rm-pick-note">${esc(note)}</p>` : '') + body,
    actions: [],
    onOpen: (dialog) => {
      dialog.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pick]');
        if (!btn || btn.disabled) return;
        picked = btn.dataset.pick;
        dialog.querySelector('.aces-modal-x')?.click();
      });
    }
  });
  return picked;
}

function playerItems(list, n = null) {
  const L = currentLineup();
  return list.map((p) => {
    const where = n ? spotOf(L, n, p.id) : null;
    const s = rsvpStatus(p);
    const meta = [
      where === 'bench' ? 'On the bench' : where ? `Playing ${where}` : '',
      s !== 'yes' ? RSVP[s].label : '',
      avgText(p)
    ].filter(Boolean).join(' \u00b7 ');
    return { value: p.id, label: p.name, meta };
  });
}

async function pickBatter(idx) {
  const L = currentLineup();
  const inOrder = new Set(L.batting.filter(Boolean));
  const free = availablePlayers().filter((p) => !inOrder.has(p.id));
  const id = await pick(`Batting ${idx + 1}`, playerItems(free));
  if (id) batPlace(id, idx);
}

async function pickForPosition(pos) {
  const n = S.inning;
  const L = currentLineup();
  const items = playerItems(availablePlayers(), n);
  if (L.fielding[n]?.[pos]) items.push({ value: '__clear', label: `Leave ${pos} open`, danger: true });
  const id = await pick(`Inning ${n}: ${pos}`, items);
  if (id === '__clear') posClear(n, pos);
  else if (id) posAssign(n, pos, id);
}

async function placePlayer(pid) {
  const n = S.inning;
  const L = currentLineup();
  const p = playerOf(pid, L);
  const cLocked = catcherLocked();
  const items = S.rules.positions.map((pos) => {
    const holder = playerOf(L.fielding[n]?.[pos], L);
    const off = pos === 'C' && cLocked;
    return { value: pos, label: pos, meta: off ? 'Locked' : holder ? `Now: ${holder.name}` : 'Open', disabled: off };
  });
  items.push({ value: '__bench', label: 'Bench', meta: `${(L.bench[n] || []).length} of ${benchSize()}` });
  const choice = await pick(`Inning ${n}: ${p.name}`, items);
  if (choice === '__bench') { if (!benchAdd(n, pid)) showToast('The bench is full for this inning.', 'warning'); }
  else if (choice) posAssign(n, choice, pid);
}

// ---------------------------------------------------------------------------
// Past games and templates
// ---------------------------------------------------------------------------

async function fromPastGame(kind) {
  if (!S.past.length) { showToast('No earlier games this season.', 'info'); return; }
  const id = await pick(kind === 'batting' ? 'Batting order from' : 'Defense from', S.past.map((g) => ({
    value: g.id, label: `${g.short} ${g.isHome ? 'vs' : 'at'} ${g.opponent}`
  })), { note: 'Players no longer on the roster are left out.' });
  if (!id) return;
  const raw = await loadLineup(id, S.team).catch(() => null);
  if (!raw) { showToast("Couldn't read that game's lineup.", 'error'); return; }

  if (kind === 'batting') {
    const ids = raw.order.map(resolveId).filter(Boolean);
    const kept = ids.filter((x) => S.byId.has(x));
    if (!kept.length) { showToast('No batting order was saved for that game.', 'info'); return; }
    batSet(kept);
    const notIn = kept.filter((x) => rsvpStatus(S.byId.get(x)) !== 'yes').length;
    showToast(`Loaded ${kept.length} batters.${ids.length > kept.length ? ` ${ids.length - kept.length} left out.` : ''}${notIn ? ` ${notIn} haven't said they're in.` : ''}`, 'success');
  } else {
    const filled = Object.values(raw.fielding).some((r) => Object.keys(r || {}).length);
    if (!filled) { showToast('No defense was saved for that game.', 'info'); return; }
    applyDefense(raw.fielding, raw.bench);
    showToast('Defense loaded.', 'success');
  }
  S.render();
}

/** fielding: {inning: {pos: id|player}}, bench: {inning: [id]} */
function applyDefense(fielding, bench = {}) {
  clearDefense();
  const L = currentLineup();
  INNINGS.forEach((n) => {
    Object.entries(fielding[n] || {}).forEach(([pos, val]) => {
      const id = resolveId(val);
      if (id && S.byId.has(id) && S.rules.positions.includes(pos)) posAssign(n, pos, id);
    });
    (bench[n] || []).map(resolveId).filter((id) => id && S.byId.has(id)).forEach((id) => {
      if (!spotOf(L, n, id)) benchAdd(n, id);
    });
  });
}

async function templates(kind) {
  const key = kind === 'batting' ? 'batting' : 'fielding';
  if (!S.templates) {
    try { S.templates = await listTemplates(S.team); } catch (err) {
      console.error('[roster] templates', err);
      showToast("Couldn't load templates.", 'error');
      return;
    }
  }
  const list = S.templates[key];
  const L = currentLineup();
  const canSave = kind === 'batting' ? L.batting.some(Boolean) : INNINGS.some((n) => inningCount(L, n));
  let result = null;

  await openModal({
    title: kind === 'batting' ? 'Batting templates' : 'Defense templates',
    html: `${list.length ? `<ul class="rm-pick">${list.map((t) => `<li class="rm-tpl">
        <button type="button" class="rm-pick-btn" data-tpl="load" data-id="${esc(t.id)}"${L[kind === 'batting' ? 'batFinal' : 'fieldFinal'] ? ' disabled' : ''}><span>${esc(t.name)}</span><small>Load</small></button>
        <button type="button" class="aces-btn is-icon is-sm is-ghost rm-x" data-tpl="delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.name)}">${icon('trash')}</button>
      </li>`).join('')}</ul>` : '<p class="rm-pick-note">No templates saved yet.</p>'}
      <form class="rm-tpl-save" data-tpl-form>
        <label class="aces-label" for="rmTplName">Save this ${kind === 'batting' ? 'batting order' : 'defense'} as a template</label>
        <div class="rm-tpl-row"><input class="aces-input" id="rmTplName" maxlength="40" placeholder="${kind === 'batting' ? 'Standard order' : 'Playoff D'}" autocomplete="off"${canSave ? '' : ' disabled'}>
        <button class="aces-btn is-primary" type="submit"${canSave ? '' : ' disabled'}>${icon('save')} Save</button></div>
        ${canSave ? '' : '<p class="aces-hint">Set up a lineup first.</p>'}
      </form>`,
    actions: [],
    onOpen: (dialog) => {
      const close = () => dialog.querySelector('.aces-modal-x')?.click();
      dialog.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tpl]');
        if (!btn || btn.disabled) return;
        result = { action: btn.dataset.tpl, id: btn.dataset.id };
        close();
      });
      dialog.querySelector('[data-tpl-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = dialog.querySelector('#rmTplName').value.trim();
        if (!name) { dialog.querySelector('#rmTplName').focus(); return; }
        result = { action: 'save', name };
        close();
      });
    }
  });
  if (!result) return;

  try {
    if (result.action === 'save') {
      const payload = kind === 'batting'
        ? { order: L.batting.slice() }
        : { positions: Object.fromEntries(INNINGS.filter((n) => inningCount(L, n)).map((n) => [n, { ...L.fielding[n] }])) };
      const id = await saveTemplate(S.team, key, result.name, payload, S.user?.uid);
      S.templates[key] = [{ id, name: result.name, ...payload }, ...list.filter((t) => t.id !== id)];
      showToast(`Saved "${result.name}".`, 'success');
    } else if (result.action === 'delete') {
      const t = list.find((x) => x.id === result.id);
      if (!(await confirmModal(`Delete the template "${t?.name || result.id}"?`, { title: 'Delete template', confirmLabel: 'Delete', danger: true }))) return;
      await deleteTemplate(S.team, key, result.id);
      S.templates[key] = list.filter((x) => x.id !== result.id);
      showToast('Template deleted.', 'success');
    } else {
      const t = list.find((x) => x.id === result.id);
      if (!t) return;
      if (kind === 'batting') {
        const ids = (t.order || []).map(resolveId);
        const kept = ids.map((x) => (x && S.byId.has(x) ? x : null));
        batSet(kept);
        const missing = ids.filter(Boolean).length - kept.filter(Boolean).length;
        showToast(`Loaded "${t.name}".${missing ? ` ${missing} player(s) not on the roster; those spots are empty.` : ''}`, 'success');
      } else {
        applyDefense(t.positions || {});
        showToast(`Loaded "${t.name}".`, 'success');
      }
      S.render();
    }
  } catch (err) {
    console.error('[roster] template', err);
    showToast("That didn't work. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Copy and print
// ---------------------------------------------------------------------------

function lineupText(kind) {
  const L = currentLineup();
  const g = currentGame();
  const head = `${S.team} ${kind === 'batting' ? 'lineup' : 'defense'}: ${gameTitle(g)}${g?.type === 'playoff' ? ` (Playoffs${g.round ? `, ${g.round}` : ''})` : ''}`;
  if (kind === 'batting') {
    const lines = L.batting.filter(Boolean).map((id, i) => `${i + 1}. ${playerOf(id, L).name}`);
    return `${head}\n\n${lines.join('\n')}`;
  }
  const blocks = INNINGS.filter((n) => inningCount(L, n) || (L.bench[n] || []).length).map((n) => {
    const pos = S.rules.positions.filter((p) => L.fielding[n]?.[p]).map((p) => `${p} ${playerOf(L.fielding[n][p], L).name}`);
    const bench = (L.bench[n] || []).map((id) => playerOf(id, L).name);
    return `Inning ${n}: ${pos.join(', ')}${bench.length ? `\n  Bench: ${bench.join(', ')}` : ''}`;
  });
  return `${head}\n\n${blocks.join('\n')}`;
}

async function copyText(kind) {
  const text = lineupText(kind);
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied. Paste it into your group chat.', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    showToast(ok ? 'Copied.' : "Couldn't copy on this device.", ok ? 'success' : 'error');
  }
}

function printLineup(kind) {
  const L = currentLineup();
  const g = currentGame();
  const box = document.getElementById('rmPrint');
  if (!box || !L) return;
  const title = `${esc(S.team)} ${kind === 'batting' ? 'batting order' : 'defense'}`;
  const sub = `${esc(gameTitle(g))}${g?.type === 'playoff' ? ` &middot; Playoffs${g.round ? ` (${esc(g.round)})` : ''}` : ''} &middot; ${esc(S.season?.label || '')}`;
  let body;
  if (kind === 'batting') {
    body = `<ol class="rm-print-list">${L.batting.filter(Boolean).map((id) => {
      const p = playerOf(id, L);
      return `<li><span>${esc(p.name)}</span><span>${p.jersey ? `#${esc(p.jersey)}` : ''}</span></li>`;
    }).join('')}</ol>`;
  } else {
    body = `<table class="rm-print-grid"><thead><tr><th>Pos</th>${INNINGS.map((i) => `<th>${i}</th>`).join('')}</tr></thead><tbody>
      ${S.rules.positions.map((pos) => `<tr><th>${esc(pos)}</th>${INNINGS.map((i) => `<td>${esc(playerOf(L.fielding[i]?.[pos], L)?.name || '')}</td>`).join('')}</tr>`).join('')}
      <tr><th>Bench</th>${INNINGS.map((i) => `<td>${(L.bench[i] || []).map((id) => esc(playerOf(id, L).name)).join('<br>')}</td>`).join('')}</tr>
    </tbody></table>`;
  }
  box.innerHTML = `<h1>${title}</h1><p>${sub}</p>${body}<footer>Mountainside Aces</footer>`;
  const page = document.createElement('style');
  page.textContent = `@page { margin: 12mm; size: ${kind === 'batting' ? 'portrait' : 'landscape'}; }`;
  document.head.appendChild(page);
  document.body.classList.add('rm-printing');
  const done = () => {
    document.body.classList.remove('rm-printing');
    page.remove();
    box.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------

async function setFinal(kind, on) {
  const L = currentLineup();
  const gameId = S.gameId;
  if (on) {
    const msg = kind === 'batting'
      ? 'Lock the batting order? Players will see it on this page. You can edit it again later.'
      : 'Lock the defense? Players will see it on this page. You can edit it again later.';
    if (!(await confirmModal(msg, { title: kind === 'batting' ? 'Mark batting order final' : 'Mark defense final', confirmLabel: 'Mark final' }))) return;
  }
  if (!(await flush())) return;
  if (!navigator.onLine) { showToast('You need to be online to change this.', 'warning'); return; }
  try {
    if (kind === 'batting') {
      await setBattingFinal(gameId, S.team, on, S.user?.uid);
      L.batFinal = on;
    } else {
      const innings = [...L.fieldDocs].filter((n) => INNINGS.includes(n));
      if (!innings.length) { showToast('Set at least one inning first.', 'warning'); return; }
      await setFieldingFinal(gameId, S.team, innings, on, S.user?.uid);
      L.fieldFinal = on;
    }
    showToast(on ? 'Marked final.' : 'Unlocked. Make your changes, then mark it final again.', 'success');
  } catch (err) {
    console.error('[roster] finalize', err);
    showToast("Couldn't change that. Try again.", 'error');
  }
  S.render();
}

// ---------------------------------------------------------------------------
// Actions and drag and drop
// ---------------------------------------------------------------------------

/** Click actions from the lineup panels. Returns true when handled. */
export async function lineupAction(act, el) {
  const L = currentLineup();
  if (!L || L.failed) return false;
  const i = Number(el.dataset.i);
  const n = S.inning;
  switch (act) {
    case 'bat-add': if (!batAppend(el.dataset.pid)) showToast('The batting order is full.', 'warning'); break;
    case 'bat-pick': await pickBatter(i); break;
    case 'bat-up': batMove(i, -1); break;
    case 'bat-down': batMove(i, 1); break;
    case 'bat-remove': batRemove(i); break;
    case 'bat-compact': batCompact(); break;
    case 'bat-fill': {
      const inOrder = new Set(L.batting.filter(Boolean));
      availablePlayers().filter((p) => !inOrder.has(p.id)).forEach((p) => batAppend(p.id));
      break;
    }
    case 'bat-clear':
      if (!(await confirmModal('Take everyone out of the batting order?', { title: 'Clear batting order', confirmLabel: 'Clear', danger: true }))) return true;
      batSet([]);
      break;
    case 'bat-final': await setFinal('batting', el.dataset.on === '1'); return true;
    case 'inning': S.inning = Number(el.dataset.n) || 1; break;
    case 'inning-copy': copyInning(n - 1, n); break;
    case 'inning-all': {
      if (!inningCount(L, n)) { showToast(`Set inning ${n} first.`, 'warning'); return true; }
      if (!(await confirmModal(`Use inning ${n}'s defense and bench for all 7 innings?`, { title: 'Use for every inning', confirmLabel: 'Copy to all' }))) return true;
      INNINGS.filter((x) => x !== n).forEach((x) => copyInning(n, x));
      break;
    }
    case 'pos-pick': await pickForPosition(el.dataset.pos); break;
    case 'pos-clear': posClear(n, el.dataset.pos); break;
    case 'free-pick': await placePlayer(el.dataset.pid); break;
    case 'bench-remove': benchRemove(n, el.dataset.pid); break;
    case 'def-reset':
      if (!(await confirmModal('Clear every position and the bench for all 7 innings?', { title: 'Reset defense', confirmLabel: 'Reset', danger: true }))) return true;
      clearDefense();
      break;
    case 'field-final': await setFinal('defense', el.dataset.on === '1'); return true;
    case 'past': await fromPastGame(el.dataset.kind); return true;
    case 'templates': await templates(el.dataset.kind); return true;
    case 'copy': await copyText(el.dataset.kind); return true;
    case 'print': printLineup(el.dataset.kind); return true;
    default: return false;
  }
  S.render();
  return true;
}

/** A player dropped on a target: 'bat:3', 'pos:SS', 'bench', 'pool' or 'free'. */
export function lineupDrop(pid, target) {
  const L = currentLineup();
  if (!L || L.failed || !pid) return;
  const [kind, arg] = target.split(':');
  const n = S.inning;
  if (kind === 'bat' && !L.batFinal) batPlace(pid, Number(arg));
  else if (kind === 'pool' && !L.batFinal) { const idx = L.batting.indexOf(pid); if (idx !== -1) batRemove(idx); }
  else if (kind === 'pos' && !L.fieldFinal) {
    if (arg === 'C' && catcherLocked()) return;
    const from = spotOf(L, n, pid);
    const holder = L.fielding[n]?.[arg];
    posAssign(n, arg, pid);
    // Swap: whoever held the spot takes the dragged player's old position.
    if (holder && holder !== pid && from && from !== 'bench') posAssign(n, from, holder);
  } else if (kind === 'bench' && !L.fieldFinal) {
    if (!benchAdd(n, pid)) showToast('The bench is full for this inning.', 'warning');
  } else if (kind === 'free' && !L.fieldFinal) {
    const spot = spotOf(L, n, pid);
    if (spot === 'bench') benchRemove(n, pid);
    else if (spot) posClear(n, spot);
  } else return;
  S.render();
}
