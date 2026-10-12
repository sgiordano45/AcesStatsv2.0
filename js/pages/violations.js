// js/pages/violations.js
// violations.html: the Wall of Shame. Anyone can look; captains, league staff
// and Mall Cops report violations and add photos.
//
//   Log            every violation, newest first, with team / severity / search
//                  filters and one-tap reactions.
//   Shame board    most violations per player (worst severity breaks ties).
//   Gallery        photos; tap one to see it large.
//
// The season row (All time + each season from 2025 Summer) filters all three
// counts and both lists. URL: ?season=2026-fall&tab=board
//
// Data: violations { seasonId, offenderName, offenderTeam, ruleViolated,
// severity 1-5, description, gameContext, anonymous, isMallCop, reporterName,
// reporterUid, reactions { laugh, shocked, thumbs }, createdAt, editedAt };
// violationPhotos { url, storagePath, caption, uploadedBy, uploadedByUid,
// uploadedAt } with the file in Storage under violation-gallery/.
// Editing: league staff, or the person who reported it. Deleting: league staff.

import { initPage, pageReady, showPageError, siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import {
  db, storage, collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, increment
} from '../core/firebase.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const FIRST_SEASON = '2025-summer';
const SEV = {
  1: 'Minor slip',
  2: 'Classic move',
  3: "That's a foul",
  4: 'Egregious',
  5: 'Hall of Shame'
};
const RULES = {
  Conduct: [
    'Arguing with an umpire', 'Unsportsmanlike conduct', 'Excessive trash talk',
    'Celebrating an out like it was a World Series win', 'Leaving before the lineup is set'
  ],
  'Equipment & Uniform': [
    'Wrong jersey / no jersey', 'Wearing sunglasses at night', 'Bringing the wrong color helmet', 'Using an illegal bat'
  ],
  'Game Play': [
    'Batting out of order', 'Slow play / delay of game', 'Running through a stop sign', 'Forgetting the lineup card',
    'Missing mandatory games without notice', 'Dropped a routine fly ball (weather: clear)'
  ],
  'Social & Legendary': [
    'Arriving late to the game', 'Leaving without helping with equipment', 'Celebrating a foul ball',
    'Claiming a ball was fair when it was clearly foul', 'Forgetting to RSVP (again)', 'Other (see description)'
  ]
};
const REACTIONS = [
  ['laugh', 'party', 'Funny'],
  ['shocked', 'alert-circle', 'Shocking'],
  ['thumbs', 'check', 'Guilty']
];
const TABS = [
  ['log', 'Log', 'list'],
  ['board', 'Shame board', 'flame'],
  ['gallery', 'Gallery', 'images']
];
const REACTED_KEY = 'aces_reactions';

const S = {
  ctx: null, uid: '', name: '', canReport: false, staff: false,
  seasons: [], teams: [], violations: [], photos: [],
  season: '', tab: 'log', team: '', sev: '', q: '',
  reacted: new Set()
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function teamChip(team) {
  if (!team) return '';
  const k = String(team).toLowerCase();
  return `<span class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}><span class="aces-team-dot"></span>${esc(cap(team))}</span>`;
}

const sevBadge = (n) => `<span class="aces-badge vs-sev is-sev-${n}">${n >= 4 ? icon('flame') : ''}${esc(SEV[n] || `Level ${n}`)}</span>`;

const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function loadReacted() {
  try { S.reacted = new Set(JSON.parse(localStorage.getItem(REACTED_KEY) || '[]')); } catch { S.reacted = new Set(); }
}
function saveReacted() {
  try { localStorage.setItem(REACTED_KEY, JSON.stringify([...S.reacted])); } catch { /* private window */ }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function loadSeasons() {
  const all = await getAllSeasons().catch(() => []);
  const min = seasonSortKey(FIRST_SEASON);
  S.seasons = all.filter((s) => /^\d{4}-(spring|summer|fall)$/.test(s.id) && seasonSortKey(s.id) >= min)
    .sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id))
    .map((s) => ({ id: s.id, label: seasonLabel(s.id), current: s.isActive === true }));
}

async function loadTeams() {
  const snap = await getDocs(collection(db, 'teams')).catch(() => null);
  const names = [];
  snap?.forEach((d) => { const t = d.data(); if (t.active === true && t.name) names.push(t.name); });
  S.teams = names.sort((a, b) => a.localeCompare(b));
}

async function loadViolations() {
  const snap = await getDocs(query(collection(db, 'violations'), orderBy('createdAt', 'desc')));
  S.violations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadPhotos() {
  try {
    const snap = await getDocs(query(collection(db, 'violationPhotos'), orderBy('uploadedAt', 'desc')));
    S.photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[violations] gallery', err);
    S.photos = [];
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const inSeason = (v) => !S.season || v.seasonId === S.season;

function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.violations.filter((v) => {
    if (!inSeason(v)) return false;
    if (S.team && String(v.offenderTeam || '').toLowerCase() !== S.team.toLowerCase()) return false;
    if (S.sev && String(v.severity) !== S.sev) return false;
    if (q && ![v.offenderName, v.description, v.ruleViolated].some((x) => String(x || '').toLowerCase().includes(q))) return false;
    return true;
  });
}

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('season');
  u.searchParams.delete('tab');
  if (S.season) u.searchParams.set('season', S.season);
  if (S.tab !== 'log') u.searchParams.set('tab', S.tab);
  history.replaceState(null, '', u);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  renderHead();
  renderSeasons();
  renderStats();
  $('vsTabs').innerHTML = TABS.map(([id, label, ic]) => {
    const n = id === 'gallery' ? S.photos.length : null;
    return `<a class="aces-tab" href="?tab=${id}" data-goto="${id}"${id === S.tab ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${n ? ` <small>${n}</small>` : ''}</a>`;
  }).join('');
  TABS.forEach(([id]) => { $(`vs-${id}`).hidden = id !== S.tab; });
  if (S.tab === 'log') renderLog();
  if (S.tab === 'board') renderBoard();
  if (S.tab === 'gallery') renderGallery();
  syncUrl();
}

function renderHead() {
  $('vsActions').innerHTML = S.canReport
    ? `<button type="button" class="aces-btn is-primary" data-act="report">${icon('megaphone')}Report a violation</button>`
    : '';
}

function renderSeasons() {
  const btn = (id, label, extra = '') =>
    `<button type="button" class="aces-segment" data-season="${esc(id)}" aria-pressed="${S.season === id}">${esc(label)}${extra}</button>`;
  $('vsSeasons').innerHTML = btn('', 'All time') + S.seasons.map((s) =>
    btn(s.id, s.label, s.current ? ' <span class="vs-live" aria-label="current season"></span>' : '')).join('');
}

function renderStats() {
  const list = S.violations.filter(inSeason);
  const per = {};
  list.forEach((v) => { if (v.offenderName) per[v.offenderName] = (per[v.offenderName] || 0) + 1; });
  const repeat = Object.values(per).filter((n) => n > 1).length;
  const teams = new Set(list.map((v) => String(v.offenderTeam || '').toLowerCase()).filter(Boolean)).size;
  const worst = list.filter((v) => Number(v.severity) === 5).length;
  $('vsStats').innerHTML = [
    [list.length, 'Violations'],
    [repeat, 'Repeat offenders'],
    [teams, 'Teams represented'],
    [worst, 'Hall of Shame level']
  ].map(([v, l]) => `<div class="aces-stat"><span class="aces-stat-value">${v}</span><span class="aces-stat-label">${l}</span></div>`).join('');
}

// ---- Log ------------------------------------------------------------------

function renderLog() {
  const teams = [...new Set([...S.teams, ...S.violations.map((v) => v.offenderTeam).filter(Boolean)].map(cap))].sort();
  const list = filtered();
  const tools = `<div class="vs-tools">
    <label class="vs-search">${icon('search')}<span class="u-sr-only">Search violations</span><input class="aces-input" type="search" data-f="q" placeholder="Search players, rules, stories" value="${esc(S.q)}"></label>
    <span class="aces-select-wrap"><select class="aces-select" data-f="team" aria-label="Team"><option value="">All teams</option>${teams.map((t) => `<option value="${esc(t)}"${t.toLowerCase() === S.team.toLowerCase() ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span>
    <span class="aces-select-wrap"><select class="aces-select" data-f="sev" aria-label="Severity"><option value="">Any severity</option>${Object.entries(SEV).map(([n, l]) => `<option value="${n}"${S.sev === n ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span>
  </div>`;
  const body = list.length
    ? `<ul class="vs-feed">${list.map(card).join('')}</ul>`
    : `<div class="aces-empty"><p class="aces-empty-title">${S.violations.some(inSeason) ? 'Nothing matches those filters.' : "Everyone's been behaving."}</p><p>${S.violations.some(inSeason) ? 'Try a different team, severity or search.' : 'No violations on record. Give it a game or two.'}</p></div>`;
  $('vs-log').innerHTML = tools + `<p class="vs-count" id="vsCount">${plural(list.length, 'violation')}</p>` + body;
}

function reporterLine(v) {
  if (v.anonymous) return `${icon('eye-off')}Anonymous ${v.isMallCop ? 'Mall Cop' : 'captain'}`;
  if (v.isMallCop) return `${icon('whistle')}Mall Cop ${esc(v.reporterName || '')}`;
  return `${icon('clipboard')}Reported by ${esc(v.reporterName || 'a captain')}`;
}

function card(v) {
  const sev = Math.min(Math.max(parseInt(v.severity, 10) || 1, 1), 5);
  const canEdit = S.staff || (S.uid && v.reporterUid === S.uid);
  const reactions = REACTIONS.map(([key, ic, label]) => {
    const done = S.reacted.has(`${v.id}_${key}`);
    return `<button type="button" class="vs-react${done ? ' is-done' : ''}" data-react="${key}" data-id="${esc(v.id)}" aria-pressed="${done}" aria-label="${label}" title="${label}">${icon(ic)}<span>${Number(v.reactions?.[key]) || 0}</span></button>`;
  }).join('');
  const tools = (canEdit || S.staff) ? `<span class="vs-tools-inline">
      ${canEdit ? `<button type="button" class="aces-btn is-icon is-ghost" data-act="edit" data-id="${esc(v.id)}" aria-label="Edit">${icon('edit')}</button>` : ''}
      ${S.staff ? `<button type="button" class="aces-btn is-icon is-ghost" data-act="delete" data-id="${esc(v.id)}" aria-label="Delete">${icon('trash')}</button>` : ''}
    </span>` : '';
  return `<li class="aces-card vs-card is-sev-${sev}">
    <div class="vs-card-head">
      <span class="vs-avatar"${colorAttr(v.offenderTeam)}>${esc(initials(v.offenderName))}</span>
      <div class="vs-who">
        <strong class="vs-name">${esc(v.offenderName || 'Unknown player')}</strong>
        <span class="vs-sub">${teamChip(v.offenderTeam)}${v.seasonId && !S.season ? `<span>${esc(seasonLabel(v.seasonId))}</span>` : ''}</span>
      </div>
      <div class="vs-side">${sevBadge(sev)}<span class="vs-date">${esc(fmtDate(v.createdAt))}</span></div>
    </div>
    <p class="vs-rule">${icon('flag')}${esc(v.ruleViolated || '')}</p>
    ${v.description ? `<blockquote class="vs-story">${esc(v.description)}</blockquote>` : ''}
    ${v.gameContext ? `<p class="vs-context">${icon('softball')}${esc(v.gameContext)}</p>` : ''}
    <div class="vs-foot">
      <span class="vs-reporter">${reporterLine(v)}</span>
      <span class="vs-reactions">${reactions}${tools}</span>
    </div>
  </li>`;
}

function colorAttr(team) {
  const k = String(team || '').toLowerCase();
  return TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : '';
}

// ---- Shame board ----------------------------------------------------------

function renderBoard() {
  const per = new Map();
  S.violations.filter(inSeason).forEach((v) => {
    if (!v.offenderName) return;
    const key = v.offenderName.trim().toLowerCase();
    const row = per.get(key) || { name: v.offenderName.trim(), team: v.offenderTeam, count: 0, worst: 0, last: '' };
    row.count++;
    row.worst = Math.max(row.worst, parseInt(v.severity, 10) || 0);
    row.last = row.last || v.ruleViolated || '';
    per.set(key, row);
  });
  const rows = [...per.values()].sort((a, b) => (b.count - a.count) || (b.worst - a.worst) || a.name.localeCompare(b.name)).slice(0, 25);
  if (!rows.length) {
    $('vs-board').innerHTML = '<div class="aces-empty"><p class="aces-empty-title">No offenders yet.</p><p>Check back after a few games.</p></div>';
    return;
  }
  let rank = 0;
  const body = rows.map((r, i) => {
    if (i === 0 || r.count !== rows[i - 1].count || r.worst !== rows[i - 1].worst) rank = i + 1;
    return `<tr${rank <= 3 ? ' class="vs-podium"' : ''}>
      <td class="is-rank">${rank <= 3 ? `<span class="vs-medal is-${rank}" aria-label="Rank ${rank}">${icon('medal')}</span>` : rank}</td>
      <td><strong>${esc(r.name)}</strong><span class="vs-board-last">${esc(r.last)}</span></td>
      <td>${teamChip(r.team)}</td>
      <td class="is-num vs-board-count">${r.count}</td>
      <td class="vs-hide-sm">${r.worst ? sevBadge(r.worst) : ''}</td>
    </tr>`;
  }).join('');
  $('vs-board').innerHTML = `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">Most wanted</h2></div>
    <p class="vs-sub-text">${S.season ? esc(seasonLabel(S.season)) : 'All time'}: most violations, worst offense breaks ties.</p>
    <div class="aces-table-wrap"><table class="aces-table vs-board">
      <thead><tr><th class="is-rank">#</th><th>Player</th><th>Team</th><th class="is-num">Count</th><th class="vs-hide-sm">Worst</th></tr></thead>
      <tbody>${body}</tbody></table></div>
  </section>`;
}

// ---- Gallery ----------------------------------------------------------------

function renderGallery() {
  const add = S.canReport
    ? `<div class="vs-gallery-head"><p class="vs-sub-text">Photographic evidence. Tap a photo to see it full size.</p><button type="button" class="aces-btn" data-act="upload">${icon('upload')}Add photo</button></div>`
    : '<p class="vs-sub-text">Photographic evidence. Tap a photo to see it full size.</p>';
  const grid = S.photos.length
    ? `<ul class="vs-gallery">${S.photos.map((p) => `<li class="vs-photo">
        <button type="button" class="vs-photo-open" data-photo="${esc(p.id)}" aria-label="${esc(p.caption || 'Open photo')}">
          <img src="${esc(p.url)}" alt="${esc(p.caption || 'Wall of Shame photo')}" loading="lazy">
        </button>
        ${p.caption ? `<span class="vs-photo-cap">${esc(p.caption)}</span>` : ''}
        ${S.canReport ? `<button type="button" class="vs-photo-del" data-act="delete-photo" data-id="${esc(p.id)}" aria-label="Remove photo">${icon('close')}</button>` : ''}
      </li>`).join('')}</ul>`
    : '<div class="aces-empty"><p class="aces-empty-title">No photos yet.</p><p>The wall is bare.</p></div>';
  $('vs-gallery').innerHTML = add + grid;
}

function openPhoto(id) {
  const p = S.photos.find((x) => x.id === id);
  if (!p) return;
  const body = document.createElement('figure');
  body.className = 'vs-lightbox';
  body.innerHTML = `<img src="${esc(p.url)}" alt="${esc(p.caption || 'Wall of Shame photo')}">${p.caption || p.uploadedBy ? `<figcaption>${esc(p.caption || '')}${p.uploadedBy ? `<small>Added by ${esc(p.uploadedBy)}</small>` : ''}</figcaption>` : ''}`;
  openModal({ title: p.caption || 'Photo', body, wide: true, actions: [{ label: 'Close', value: null }] });
}

async function uploadPhoto() {
  const body = document.createElement('form');
  body.className = 'vs-form';
  body.innerHTML = `
    <label class="aces-field"><span class="aces-label">Photo</span><input class="aces-input" type="file" name="file" accept="image/*" required></label>
    <label class="aces-field"><span class="aces-label">Caption (optional)</span><input class="aces-input" name="caption" maxlength="100"></label>
    <p class="vs-form-error" hidden></p>`;
  let file = null, caption = '';
  const go = await openModal({
    title: 'Add a photo', body,
    actions: [{ label: 'Cancel', value: null }, { label: 'Upload', value: 'up', variant: 'primary' }],
    beforeClose: (v) => {
      if (v !== 'up') return true;
      file = body.elements.file.files[0] || null;
      caption = body.elements.caption.value.trim();
      const err = !file ? 'Choose a photo first.' : file.size > 10 * 1024 * 1024 ? 'Photos must be under 10 MB.' : '';
      const p = body.querySelector('.vs-form-error');
      p.textContent = err;
      p.hidden = !err;
      return !err;
    }
  });
  if (go !== 'up' || !file) return;
  showToast('Uploading...', 'info');
  try {
    const path = `violation-gallery/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await addDoc(collection(db, 'violationPhotos'), {
      url, storagePath: path, caption: caption || null,
      uploadedBy: S.name, uploadedByUid: S.uid, uploadedAt: serverTimestamp()
    });
    await loadPhotos();
    S.tab = 'gallery';
    render();
    showToast('Photo added to the gallery.', 'success');
  } catch (err) {
    console.error('[violations] upload', err);
    showToast('Upload failed. Try again.', 'error');
  }
}

async function deletePhoto(id) {
  const p = S.photos.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmModal('Remove this photo from the gallery?', { title: 'Remove photo', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'violationPhotos', id));
    if (p.storagePath) { try { await deleteObject(ref(storage, p.storagePath)); } catch { /* file already gone */ } }
    S.photos = S.photos.filter((x) => x.id !== id);
    render();
    showToast('Photo removed.', 'success');
  } catch (err) {
    console.error('[violations] delete photo', err);
    showToast("That didn't remove. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Report / edit
// ---------------------------------------------------------------------------

function formHtml(v) {
  const season = v?.seasonId || S.season || S.seasons.find((s) => s.current)?.id || S.seasons[0]?.id || '';
  const [date, opp] = String(v?.gameContext || '').split(' \u00b7 ');
  const teams = [...new Set([...S.teams, v?.offenderTeam].filter(Boolean))];
  const known = Object.values(RULES).flat();
  const rule = v?.ruleViolated || '';
  const sev = String(v?.severity || '');
  return `
    <div class="vs-form-row">
      <label class="aces-field"><span class="aces-label">Player</span><input class="aces-input" name="offenderName" maxlength="80" required placeholder="First Last" value="${esc(v?.offenderName || '')}"></label>
      <label class="aces-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" name="offenderTeam" required>
        <option value="">Pick a team</option>${teams.map((t) => `<option value="${esc(t)}"${t === v?.offenderTeam ? ' selected' : ''}>${esc(cap(t))}</option>`).join('')}</select></span></label>
    </div>
    <label class="aces-field"><span class="aces-label">Rule broken</span><span class="aces-select-wrap"><select class="aces-select" name="ruleViolated" required>
      <option value="">Pick the offense</option>
      ${Object.entries(RULES).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((r) => `<option${r === rule ? ' selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>`).join('')}
      ${rule && !known.includes(rule) ? `<option selected>${esc(rule)}</option>` : ''}
    </select></span></label>
    <fieldset class="vs-sev-pick"><legend class="aces-label">Severity</legend>
      ${Object.entries(SEV).map(([n, l]) => `<label class="vs-sev-opt is-sev-${n}"><input type="radio" name="severity" value="${n}"${sev === n ? ' checked' : ''}><span><strong>${n}</strong>${esc(l)}</span></label>`).join('')}
    </fieldset>
    <label class="aces-field"><span class="aces-label">What happened</span><textarea class="aces-input" name="description" rows="4" maxlength="1500" required placeholder="The full story. The league needs to know.">${esc(v?.description || '')}</textarea></label>
    <div class="vs-form-row">
      <label class="aces-field"><span class="aces-label">Date (optional)</span><input class="aces-input" type="date" name="gameDate" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '')}"></label>
      <label class="aces-field"><span class="aces-label">Game (optional)</span><input class="aces-input" name="gameOpponent" maxlength="60" placeholder="vs. Blue" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(date || '') ? (opp || '') : (v?.gameContext || ''))}"></label>
    </div>
    <div class="vs-form-row">
      <label class="aces-field"><span class="aces-label">Season</span><span class="aces-select-wrap"><select class="aces-select" name="seasonId" required>
        ${S.seasons.map((s) => `<option value="${esc(s.id)}"${s.id === season ? ' selected' : ''}>${esc(s.label)}${s.current ? ' (current)' : ''}</option>`).join('')}</select></span></label>
      <label class="vs-check"><input type="checkbox" name="anonymous"${v?.anonymous ? ' checked' : ''}><span><strong>Post anonymously</strong><small>Your name won't show. League staff can still see who reported it.</small></span></label>
    </div>
    <p class="vs-form-error" hidden></p>`;
}

async function report(v = null) {
  const body = document.createElement('form');
  body.className = 'vs-form';
  body.innerHTML = formHtml(v);
  let values = null;
  const res = await openModal({
    title: v ? 'Edit violation' : 'Report a violation',
    body, wide: true,
    actions: [{ label: 'Cancel', value: null }, { label: v ? 'Save' : 'Add to the wall', value: 'save', variant: 'primary' }],
    beforeClose: (val) => {
      if (val !== 'save') return true;
      const f = new FormData(body);
      const get = (k) => String(f.get(k) || '').trim();
      values = {
        seasonId: get('seasonId'), offenderName: get('offenderName'), offenderTeam: get('offenderTeam'),
        ruleViolated: get('ruleViolated'), severity: parseInt(get('severity'), 10) || 0,
        description: get('description'),
        gameContext: [get('gameDate'), get('gameOpponent')].filter(Boolean).join(' \u00b7 ') || null,
        anonymous: f.get('anonymous') === 'on'
      };
      const err = !values.offenderName ? 'Add the player\'s name.'
        : !values.offenderTeam ? 'Pick their team.'
          : !values.ruleViolated ? 'Pick the rule they broke.'
            : !values.severity ? 'Pick a severity.'
              : !values.description ? 'Tell the story.'
                : !values.seasonId ? 'Pick a season.' : '';
      const p = body.querySelector('.vs-form-error');
      p.textContent = err;
      p.hidden = !err;
      return !err;
    }
  });
  if (res !== 'save' || !values) return;
  try {
    if (v) {
      await updateDoc(doc(db, 'violations', v.id), { ...values, editedAt: serverTimestamp() });
      showToast('Violation updated.', 'success');
    } else {
      const p = S.ctx.profile;
      await addDoc(collection(db, 'violations'), {
        ...values,
        isMallCop: !hasRole(p, 'captain') && hasRole(p, 'mallCop'),
        reporterName: values.anonymous ? null : S.name,
        reporterUid: S.uid,
        reactions: { laugh: 0, shocked: 0, thumbs: 0 },
        createdAt: serverTimestamp()
      });
      showToast('Added to the Wall of Shame.', 'success');
    }
    await loadViolations();
    if (values.seasonId && S.season && S.season !== values.seasonId) S.season = values.seasonId;
    S.tab = 'log';
    render();
    if (!v) share(values);
  } catch (err) {
    console.error('[violations] save', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

async function share(v) {
  const text = [
    `Wall of Shame: ${v.offenderName} (${cap(v.offenderTeam)}) just got reported.`,
    `Rule: ${v.ruleViolated}`,
    `Severity: ${SEV[v.severity] || v.severity}`,
    v.description ? `"${v.description.slice(0, 140)}${v.description.length > 140 ? '...' : ''}"` : '',
    '',
    siteUrl('violations.html')
  ].filter((x, i) => x || i === 4).join('\n');
  const go = await openModal({
    title: 'Tell the group?',
    body: 'Let the group chat know about this one?',
    actions: [{ label: 'Not now', value: null }, { label: 'Copy message', value: 'copy' }, { label: 'Send to WhatsApp', value: 'wa', variant: 'primary' }]
  });
  if (go === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (go === 'copy') {
    try { await navigator.clipboard.writeText(text); showToast('Copied. Paste it in the group chat.', 'success'); } catch { showToast("Couldn't copy on this device.", 'error'); }
  }
}

async function remove(v) {
  const ok = await confirmModal(`Remove ${v.offenderName}'s violation (${v.ruleViolated}) from the wall? This can't be undone.`, { title: 'Remove violation', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'violations', v.id));
    S.violations = S.violations.filter((x) => x.id !== v.id);
    render();
    showToast('Violation removed.', 'success');
  } catch (err) {
    console.error('[violations] delete', err);
    showToast("That didn't remove. Try again.", 'error');
  }
}

async function react(id, key, btn) {
  const k = `${id}_${key}`;
  const v = S.violations.find((x) => x.id === id);
  if (!v || S.reacted.has(k)) return;
  if (!S.uid) { showToast('Sign in to react.', 'info'); return; }
  S.reacted.add(k);
  saveReacted();
  v.reactions = { ...(v.reactions || {}), [key]: (Number(v.reactions?.[key]) || 0) + 1 };
  btn.classList.add('is-done');
  btn.setAttribute('aria-pressed', 'true');
  btn.querySelector('span').textContent = v.reactions[key];
  try {
    await updateDoc(doc(db, 'violations', id), { [`reactions.${key}`]: increment(1) });
  } catch (err) {
    console.error('[violations] react', err);
    S.reacted.delete(k);
    saveReacted();
    v.reactions[key] -= 1;
    renderLog();
    showToast("That didn't count. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

function wire() {
  const root = $('vsRoot');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto],[data-season],[data-act],[data-react],[data-photo]');
    if (!t) return;
    if (t.dataset.goto) { e.preventDefault(); S.tab = t.dataset.goto; render(); return; }
    if (t.dataset.season !== undefined) { S.season = t.dataset.season; render(); return; }
    if (t.dataset.react) { react(t.dataset.id, t.dataset.react, t); return; }
    if (t.dataset.photo) { openPhoto(t.dataset.photo); return; }
    const v = S.violations.find((x) => x.id === t.dataset.id);
    switch (t.dataset.act) {
      case 'report': report(); break;
      case 'edit': if (v) report(v); break;
      case 'delete': if (v) remove(v); break;
      case 'upload': uploadPhoto(); break;
      case 'delete-photo': deletePhoto(t.dataset.id); break;
      default: break;
    }
  });
  const onFilter = (e) => {
    const f = e.target.closest('[data-f]');
    if (!f) return;
    S[f.dataset.f] = f.value;
    if (f.dataset.f === 'q') {
      // Keep focus in the search box: redraw only the list.
      const keep = f.selectionStart;
      renderLog();
      const box = $('vs-log').querySelector('[data-f="q"]');
      box.focus();
      try { box.setSelectionRange(keep, keep); } catch { /* search inputs in some browsers */ }
    } else {
      renderLog();
    }
  };
  root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) onFilter(e); });
  root.addEventListener('change', (e) => { if (e.target.matches('select[data-f]')) onFilter(e); });
}

async function main() {
  const ctx = await initPage({ title: 'Wall of Shame' });
  S.ctx = ctx;
  const p = ctx.profile;
  S.uid = ctx.user?.uid || '';
  S.name = p?.preferredDisplayName || p?.displayName || ctx.user?.displayName || 'Captain';
  S.canReport = !!ctx.user && hasRole(p, ['captain', 'mallCop']);
  S.staff = !!ctx.user && hasRole(p, 'league-staff');
  loadReacted();

  await Promise.all([loadSeasons(), loadTeams(), loadViolations(), loadPhotos()]);

  const params = new URLSearchParams(location.search);
  const sid = params.get('season');
  if (sid && S.seasons.some((s) => s.id === sid)) S.season = sid;
  const tab = params.get('tab');
  if (TABS.some(([id]) => id === tab)) S.tab = tab;

  wire();
  render();
  pageReady();
}

main().catch((err) => showPageError(err, { message: "The Wall of Shame couldn't load. Check your connection and try again." }));
