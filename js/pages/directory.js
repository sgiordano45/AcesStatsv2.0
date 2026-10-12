// js/pages/directory.js
// aces-directory.html (signed-in members): two tabs.
//
//   Members           everyone who opted in on me.html#directory: name, team,
//                     phone, occupation and skills, searchable and by team.
//   Recommendations   businesses members recommend, by category; anyone can add
//                     one, and its author (or league staff) can edit or delete it.
//
// URL: ?tab=recs&cat=plumber&q=joe
// Data: users where directoryOptIn == true (directoryPhone, directoryOccupation,
// directorySkills, linkedTeam, profilePhotoURL); businessRecommendations
// (businessName, category, description, recommenderName, recommenderUid,
// recommenderEmail, createdAt, updatedAt). Category values are fixed by the
// Firestore rules.

import { initPage, pageReady, showPageError, siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp } from '../core/firebase.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const CATS = {
  contractor: ['Contractor / handyman', 'home'],
  electrician: ['Electrician', 'zap'],
  plumber: ['Plumber', 'shield'],
  mechanic: ['Mechanic / auto', 'settings'],
  restaurant: ['Restaurant / food', 'star'],
  landscaping: ['Landscaping / lawn', 'leaf'],
  hvac: ['HVAC', 'snowflake'],
  other: ['Other', 'grid']
};
const catLabel = (c) => (CATS[c] || CATS.other)[0];
const catIcon = (c) => (CATS[c] || CATS.other)[1];

const S = { ctx: null, staff: false, me: '', tab: 'members', members: [], recs: [], q: '', team: '', cat: '' };

function chip(team) {
  if (!team) return '';
  const name = String(team).charAt(0).toUpperCase() + String(team).slice(1);
  const k = name.toLowerCase();
  return `<span class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}><span class="aces-team-dot"></span>${esc(name)}</span>`;
}

function phoneText(p) {
  const d = String(p || '').replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : String(p || '');
}

function syncUrl() {
  const u = new URL(location.href);
  ['tab', 'q', 'team', 'cat'].forEach((k) => u.searchParams.delete(k));
  if (S.tab === 'recs') u.searchParams.set('tab', 'recs');
  if (S.q.trim()) u.searchParams.set('q', S.q.trim());
  if (S.tab === 'members' && S.team) u.searchParams.set('team', S.team);
  if (S.tab === 'recs' && S.cat) u.searchParams.set('cat', S.cat);
  history.replaceState(null, '', u);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

async function loadMembers() {
  const snap = await getDocs(query(collection(db, 'users'), where('directoryOptIn', '==', true)));
  S.members = snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      name: v.displayName || v.linkedPlayer || 'Member',
      phone: v.directoryPhone || '',
      occupation: v.directoryOccupation || '',
      skills: v.directorySkills || '',
      photo: v.profilePhotoURL || v.photoURL || '',
      team: v.linkedTeam || '',
      player: v.linkedPlayer || ''
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function memberCard(m) {
  const initials = m.name.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  return `<li class="aces-card dr-member">
    <div class="dr-member-head">
      ${m.photo ? `<img class="dr-avatar" src="${esc(m.photo)}" alt="" loading="lazy" data-avatar>` : `<span class="dr-avatar is-initials">${esc(initials)}</span>`}
      <div class="dr-who">
        ${m.player ? `<a class="dr-name" href="player.html?${esc(new URLSearchParams({ name: m.player }).toString())}">${esc(m.name)}</a>` : `<span class="dr-name">${esc(m.name)}</span>`}
        ${chip(m.team)}
      </div>
    </div>
    <dl class="dr-facts">
      ${m.occupation ? `<div><dt>${icon('id-card')}<span class="u-sr-only">Occupation</span></dt><dd>${esc(m.occupation)}</dd></div>` : ''}
      ${m.skills ? `<div><dt>${icon('star')}<span class="u-sr-only">Skills</span></dt><dd>${esc(m.skills)}</dd></div>` : ''}
    </dl>
    ${m.phone ? `<div class="dr-actions">
      <a class="aces-btn is-sm" href="tel:${esc(String(m.phone).replace(/[^\d+]/g, ''))}">${icon('smartphone')}${esc(phoneText(m.phone))}</a>
      <a class="aces-btn is-sm is-ghost" href="sms:${esc(String(m.phone).replace(/[^\d+]/g, ''))}">${icon('message')}Text</a>
    </div>` : ''}
  </li>`;
}

function renderMembers() {
  const q = S.q.trim().toLowerCase();
  const list = S.members.filter((m) => (!S.team || m.team.toLowerCase() === S.team)
    && (!q || [m.name, m.occupation, m.skills, m.team].some((x) => String(x).toLowerCase().includes(q))));
  $('drCount').textContent = `${list.length} of ${S.members.length} member${S.members.length === 1 ? '' : 's'}`;
  $('drMembers').innerHTML = list.length ? list.map(memberCard).join('') : '<li class="aces-empty">No members match.</li>';
}

function membersPanel() {
  const p = S.ctx.profile || {};
  const listed = p.directoryOptIn === true;
  const teams = [...new Set(S.members.map((m) => m.team.toLowerCase()).filter(Boolean))].sort();
  $('drMembersTab').innerHTML = `
    <div class="aces-notice dr-me">${icon(listed ? 'check-circle' : 'info')}<div>${listed
      ? 'You\'re listed in the directory.'
      : 'You\'re not in the directory yet. Add your phone, job and skills so other Aces can find you.'}
      <a href="me.html#directory">${listed ? 'Edit your listing' : 'Add yourself'}</a></div></div>
    <div class="dr-tools">
      <label class="dr-search">${icon('search')}<input class="aces-input" type="search" data-f="q" value="${esc(S.q)}" placeholder="Search names, jobs, skills" aria-label="Search members" autocomplete="off"></label>
      <span class="aces-select-wrap"><select class="aces-select" data-f="team" aria-label="Team"><option value="">All teams</option>${teams.map((t) => `<option value="${esc(t)}"${t === S.team ? ' selected' : ''}>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</option>`).join('')}</select></span>
    </div>
    <p class="dr-count" id="drCount" aria-live="polite"></p>
    <ul class="dr-grid" id="drMembers"></ul>`;
  renderMembers();
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

async function loadRecs() {
  const snap = await getDocs(query(collection(db, 'businessRecommendations'), orderBy('createdAt', 'desc')));
  S.recs = snap.docs.map((d) => { const v = d.data(); return { id: d.id, ...v, when: v.createdAt?.toDate ? v.createdAt.toDate() : null }; });
}

const canEdit = (r) => r.recommenderUid === S.me || S.staff;

function recCard(r) {
  return `<li class="aces-card dr-rec">
    <div class="dr-rec-head">
      <span class="dr-cat-icon">${icon(catIcon(r.category))}</span>
      <div><h3>${esc(r.businessName || '')}</h3><span class="dr-cat">${esc(catLabel(r.category))}</span></div>
    </div>
    <p class="dr-rec-text">${esc(r.description || '')}</p>
    <footer class="dr-rec-foot">
      <span>${icon('user')}${esc(r.recommenderName || 'A member')}${r.when ? ` &middot; ${esc(r.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}` : ''}</span>
      ${canEdit(r) ? `<span class="dr-rec-actions">
        <button type="button" class="aces-btn is-sm is-ghost is-icon" data-edit="${esc(r.id)}" aria-label="Edit">${icon('edit')}</button>
        <button type="button" class="aces-btn is-sm is-ghost is-icon" data-delete="${esc(r.id)}" aria-label="Delete">${icon('trash')}</button>
      </span>` : ''}
    </footer>
  </li>`;
}

function renderRecs() {
  const q = S.q.trim().toLowerCase();
  const list = S.recs.filter((r) => (!S.cat || r.category === S.cat)
    && (!q || [r.businessName, r.description, r.recommenderName].some((x) => String(x || '').toLowerCase().includes(q))));
  $('drRecs').innerHTML = list.length ? list.map(recCard).join('')
    : `<li class="aces-empty">${S.recs.length ? 'No recommendations match.' : 'No recommendations yet. Be the first.'}</li>`;
  $('drCats').querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === S.cat)));
}

function recsPanel() {
  const counts = {};
  S.recs.forEach((r) => { counts[r.category] = (counts[r.category] || 0) + 1; });
  $('drRecsTab').innerHTML = `
    <div class="dr-tools">
      <label class="dr-search">${icon('search')}<input class="aces-input" type="search" data-f="q" value="${esc(S.q)}" placeholder="Search businesses" aria-label="Search recommendations" autocomplete="off"></label>
      <button type="button" class="aces-btn is-primary" data-add>${icon('plus')}Recommend a business</button>
    </div>
    <div class="dr-cats" id="drCats">
      <button type="button" class="aces-chip" data-cat="" aria-pressed="${!S.cat}">All <small>${S.recs.length}</small></button>
      ${Object.entries(CATS).map(([k, [label, ic]]) => `<button type="button" class="aces-chip" data-cat="${k}" aria-pressed="${S.cat === k}">${icon(ic)}${esc(label.split(' /')[0])}${counts[k] ? ` <small>${counts[k]}</small>` : ''}</button>`).join('')}
    </div>
    <ul class="dr-grid" id="drRecs"></ul>`;
  renderRecs();
}

function recForm(r = null) {
  const name = S.ctx.profile?.displayName || S.ctx.profile?.linkedPlayer || S.ctx.user?.displayName || 'A member';
  const body = document.createElement('form');
  body.className = 'dr-form';
  body.innerHTML = `
    <label class="aces-field"><span class="aces-label">Business name</span><input class="aces-input" name="businessName" maxlength="100" required value="${esc(r?.businessName || '')}"></label>
    <label class="aces-field"><span class="aces-label">Category</span><span class="aces-select-wrap"><select class="aces-select" name="category" required>
      <option value="">Pick one</option>${Object.entries(CATS).map(([k, [label]]) => `<option value="${k}"${r?.category === k ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></span></label>
    <label class="aces-field"><span class="aces-label">Why do you recommend them?</span><textarea class="aces-input" name="description" rows="4" maxlength="1000" required placeholder="What they did for you and how it went">${esc(r?.description || '')}</textarea></label>
    <p class="dr-form-note">${r ? `Recommended by ${esc(r.recommenderName || name)}.` : `Shown as recommended by ${esc(name)}.`}</p>
    <p class="dr-form-error" hidden></p>`;
  body.addEventListener('submit', (e) => e.preventDefault());
  return { body, name };
}

async function editRec(r = null) {
  const { body, name } = recForm(r);
  let values = null;
  const SAVE = Symbol('save');
  const res = await openModal({
    title: r ? 'Edit recommendation' : 'Recommend a business',
    body,
    actions: [{ label: 'Cancel', value: null }, { label: r ? 'Save' : 'Add', value: SAVE, variant: 'primary' }],
    beforeClose: (v) => {
      if (v !== SAVE) return true;
      const f = new FormData(body);
      values = { businessName: String(f.get('businessName') || '').trim(), category: String(f.get('category') || ''), description: String(f.get('description') || '').trim() };
      const err = !values.businessName ? 'Add the business name.' : !CATS[values.category] ? 'Pick a category.' : !values.description ? 'Say why you recommend them.' : '';
      const p = body.querySelector('.dr-form-error');
      p.textContent = err;
      p.hidden = !err;
      return !err;
    }
  });
  if (res !== SAVE || !values) return;
  try {
    if (r) {
      await updateDoc(doc(db, 'businessRecommendations', r.id), { ...values, updatedAt: serverTimestamp() });
      showToast('Recommendation updated.', 'success');
    } else {
      await addDoc(collection(db, 'businessRecommendations'), {
        ...values, recommenderName: name, recommenderUid: S.me, recommenderEmail: S.ctx.user?.email || '', createdAt: serverTimestamp()
      });
      showToast('Recommendation added.', 'success');
      shareRec({ ...values, recommenderName: name });
    }
    await loadRecs();
    recsPanel();
  } catch (err) {
    console.error('[directory] save', err);
    showToast('That didn\'t save. Try again.', 'error');
  }
}

async function shareRec(r) {
  const text = `New Aces Directory recommendation: ${r.businessName} (${catLabel(r.category)})\n\n"${r.description}"\n\nRecommended by ${r.recommenderName}\n${siteUrl('aces-directory.html?tab=recs')}`;
  const body = document.createElement('div');
  body.innerHTML = `<p>Let the group chat know about ${esc(r.businessName)}?</p>`;
  const go = await openModal({
    title: 'Thanks for sharing',
    body,
    actions: [{ label: 'Not now', value: null }, { label: 'Copy message', value: 'copy' }, { label: 'Send to WhatsApp', value: 'wa', variant: 'primary' }]
  });
  if (go === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (go === 'copy') {
    try { await navigator.clipboard.writeText(text); showToast('Copied. Paste it in the group chat.', 'success'); } catch { showToast('Couldn\'t copy on this device.', 'error'); }
  }
}

async function removeRec(r) {
  const ok = await confirmModal(`Delete the recommendation for ${r.businessName}? This can't be undone.`, { title: 'Delete recommendation', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'businessRecommendations', r.id));
    showToast('Recommendation deleted.', 'success');
    S.recs = S.recs.filter((x) => x.id !== r.id);
    recsPanel();
  } catch (err) {
    console.error('[directory] delete', err);
    showToast('That didn\'t delete. Try again.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function show(tab) {
  S.tab = tab === 'recs' ? 'recs' : 'members';
  $('drTabs').innerHTML = [['members', 'Members', 'users'], ['recs', 'Recommendations', 'star']].map(([id, label, ic]) =>
    `<a class="aces-tab" href="?tab=${id}" data-goto="${id}"${id === S.tab ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  $('drMembersTab').hidden = S.tab !== 'members';
  $('drRecsTab').hidden = S.tab !== 'recs';
  if (S.tab === 'members') membersPanel(); else recsPanel();
  syncUrl();
}

function wire() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto]');
    if (t && !e.metaKey && !e.ctrlKey) { e.preventDefault(); S.q = ''; show(t.dataset.goto); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { S.cat = c.dataset.cat; renderRecs(); syncUrl(); return; }
    if (e.target.closest('[data-add]')) { editRec(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { const r = S.recs.find((x) => x.id === ed.dataset.edit); if (r) editRec(r); return; }
    const del = e.target.closest('[data-delete]');
    if (del) { const r = S.recs.find((x) => x.id === del.dataset.delete); if (r) removeRec(r); }
  });
  let t = null;
  document.addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'q') return;
    S.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => { (S.tab === 'members' ? renderMembers : renderRecs)(); syncUrl(); }, 120);
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.f === 'team') { S.team = e.target.value; renderMembers(); syncUrl(); }
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-avatar]')) e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'dr-avatar is-initials', textContent: '' }));
  }, true);
}

async function main() {
  S.ctx = await initPage({ title: 'Aces Directory', requiresAuth: true });
  S.me = S.ctx.user?.uid || '';
  S.staff = hasRole(S.ctx.realProfile || S.ctx.profile, 'league-staff');
  try {
    await Promise.all([loadMembers(), loadRecs()]);
  } catch (err) {
    showPageError(err);
    return;
  }
  const q = new URLSearchParams(location.search);
  S.q = q.get('q') || '';
  S.team = (q.get('team') || '').toLowerCase();
  S.cat = CATS[q.get('cat')] ? q.get('cat') : '';
  wire();
  pageReady();
  show(q.get('tab') === 'recs' ? 'recs' : 'members');
}

main().catch((err) => { pageReady(); showPageError(err); });
