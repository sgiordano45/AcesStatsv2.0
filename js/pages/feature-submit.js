// js/pages/feature-submit.js
// feature-submit.html: send feedback (an idea, an improvement, a bug or a
// content fix). Anyone can send one; signed-in members' submissions carry
// their account and show below the form with their status.
//
// The Related page list comes from nav-config.js, so it matches the menus.
// ?page=<file> (or arriving from another page on the site) preselects it.
//
// Data: featureSubmissions { category, title, description, pageRef, priority,
// status ('new' | 'reviewing' | 'planned' | 'in-progress' | 'completed' |
// 'declined'), submittedAt, submittedBy { uid, displayName, email } | null,
// isAnonymous, adminNotes, resolvedAt, resolvedBy }. Content managers work the
// list on admin/features.html; a member can read their own.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { db, collection, addDoc, getDocs, query, where, serverTimestamp } from '../core/firebase.js';
import { buildNav, pageFile } from '../../nav-config.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const CATEGORIES = [
  ['feature', 'New feature', 'sparkles'],
  ['improvement', 'Improvement', 'trending-up'],
  ['bug', 'Bug', 'alert-circle'],
  ['content', 'Content fix', 'edit'],
  ['other', 'Other', 'message']
];
const PRIORITIES = [
  ['low', 'Nice to have'],
  ['medium', 'Moderately important'],
  ['high', 'Very important'],
  ['critical', 'Critical: something is broken']
];
const STATUS = {
  new: ['Received', ''],
  reviewing: ['Reviewing', 'is-outline'],
  planned: ['Planned', 'is-accent'],
  'in-progress': ['In progress', 'is-accent'],
  completed: ['Done', 'is-win'],
  declined: ['Not planned', 'is-loss']
};
const TITLE_MAX = 100;
const DESC_MAX = 2000;

const S = { ctx: null, user: null, name: '', pages: [], mine: [] };

const catLabel = (c) => (CATEGORIES.find(([id]) => id === c) || CATEGORIES[4])[1];

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

// ---------------------------------------------------------------------------
// Related page options, grouped by hub
// ---------------------------------------------------------------------------

function pageGroups() {
  const nav = buildNav({ signedIn: !!S.user, profile: S.ctx.profile, hasRole });
  const groups = [];
  const flat = (tabs) => tabs.flatMap((t) => (t.pages ? t.pages : [t])).filter((p) => !p.external);
  groups.push(['Home', [{ href: nav.home.href, label: 'Home page' }]]);
  nav.hubs.forEach((h) => { const list = flat(h.tabs); if (list.length) groups.push([h.label, list]); });
  const me = nav.me.flatMap((s) => s.pages).filter((p) => !p.external && p.id !== 'feature-submit');
  if (me.length) groups.push(['Me', me]);
  return groups;
}

function preselect() {
  const param = new URLSearchParams(location.search).get('page');
  if (param) return param;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin) {
      const f = pageFile(ref.pathname);
      if (f && f !== 'feature-submit.html') return f;
    }
  } catch { /* no referrer */ }
  return '';
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderForm() {
  const chosen = preselect();
  const groups = pageGroups();
  const known = groups.some(([, list]) => list.some((p) => p.href.split(/[?#]/)[0] === chosen.split(/[?#]/)[0]));
  const who = S.user
    ? `<div class="fs-who"><span class="fs-avatar" aria-hidden="true">${esc((S.name || '?').charAt(0).toUpperCase())}</span><span><strong>${esc(S.name)}</strong><small>Linked to your account, so you can follow its status below.</small></span></div>`
    : `<p class="aces-notice">${icon('user')}<span>You're sending this anonymously. <a href="signin.html">Sign in</a> to follow its status.</span></p>`;

  $('fsForm').innerHTML = `
    ${who}
    <fieldset class="fs-cats"><legend class="aces-label">What kind of feedback?</legend>
      <div class="fs-cat-row">${CATEGORIES.map(([id, label, ic]) => `<label class="fs-cat"><input type="radio" name="category" value="${id}"><span>${icon(ic)}${esc(label)}</span></label>`).join('')}</div>
    </fieldset>
    <label class="aces-field"><span class="aces-label">Title</span>
      <input class="aces-input" name="title" maxlength="${TITLE_MAX}" required placeholder="A short summary">
      <span class="aces-hint fs-count" data-count="title">0/${TITLE_MAX}</span></label>
    <label class="aces-field"><span class="aces-label">Details</span>
      <textarea class="aces-input" name="description" rows="6" maxlength="${DESC_MAX}" required placeholder="As much detail as you can. For a bug: what you did, what you expected and what happened instead."></textarea>
      <span class="aces-hint fs-count" data-count="description">0/${DESC_MAX}</span></label>
    <div class="fs-row">
      <label class="aces-field"><span class="aces-label">Related page (optional)</span><span class="aces-select-wrap"><select class="aces-select" name="pageRef">
        <option value="">None in particular</option>
        ${groups.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((p) => `<option value="${esc(p.href)}"${p.href.split(/[?#]/)[0] === chosen.split(/[?#]/)[0] ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</optgroup>`).join('')}
        ${chosen && !known ? `<option value="${esc(chosen)}" selected>${esc(chosen)}</option>` : ''}
        <option value="other">Other or several pages</option>
      </select></span></label>
      <label class="aces-field"><span class="aces-label">How important is it to you?</span><span class="aces-select-wrap"><select class="aces-select" name="priority">
        ${PRIORITIES.map(([v, l]) => `<option value="${v}"${v === 'medium' ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select></span></label>
    </div>
    <p class="fs-error" hidden></p>
    <div class="fs-actions"><button type="submit" class="aces-btn is-primary">${icon('upload')}Send feedback</button></div>`;
}

function renderDone() {
  $('fsForm').hidden = true;
  $('fsDone').hidden = false;
  $('fsDone').innerHTML = `
    <span class="fs-done-icon">${icon('check-circle')}</span>
    <h2>Thanks, it's in.</h2>
    <p>${S.user ? "You'll see its status below as it moves along." : 'Thanks for helping make the site better.'}</p>
    <div class="fs-actions">
      <button type="button" class="aces-btn is-primary" data-act="again">${icon('plus')}Send another</button>
      <a class="aces-btn" href="index.html">${icon('home')}Home</a>
    </div>`;
}

function renderMine() {
  const box = $('fsMine');
  if (!S.user) { box.hidden = true; return; }
  box.hidden = false;
  const list = [...S.mine].sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));
  box.innerHTML = `<div class="aces-card-head"><h2 class="aces-card-title">Your feedback</h2></div>
    ${list.length ? `<ul class="fs-mine">${list.map((s) => {
      const [label, cls] = STATUS[s.status] || STATUS.new;
      return `<li class="fs-item">
        <div class="fs-item-head"><strong>${esc(s.title || '')}</strong><span class="aces-badge ${cls}">${esc(label)}</span></div>
        <span class="fs-item-meta">${esc(catLabel(s.category))} &middot; ${esc(fmtDate(s.submittedAt) || 'Just now')}</span>
      </li>`;
    }).join('')}</ul>` : '<p class="fs-empty">Nothing yet. What you send shows up here.</p>'}`;
}

// ---------------------------------------------------------------------------
// Load and save
// ---------------------------------------------------------------------------

async function loadMine() {
  if (!S.user) return;
  try {
    const snap = await getDocs(query(collection(db, 'featureSubmissions'), where('submittedBy.uid', '==', S.user.uid)));
    S.mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[feature-submit] your submissions', err);
    S.mine = [];
  }
}

async function submit(form) {
  const f = new FormData(form);
  const get = (k) => String(f.get(k) || '').trim();
  const category = get('category');
  const title = get('title');
  const description = get('description');
  const err = !category ? 'Pick what kind of feedback this is.' : !title ? 'Add a title.' : !description ? 'Add the details.' : '';
  const p = form.querySelector('.fs-error');
  p.textContent = err;
  p.hidden = !err;
  if (err) return;

  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const u = S.user;
    const data = {
      category, title, description,
      pageRef: get('pageRef') || null,
      priority: get('priority') || 'medium',
      status: 'new',
      submittedAt: serverTimestamp(),
      submittedBy: u ? { uid: u.uid, displayName: S.name || null, email: u.email || null } : null,
      isAnonymous: !u,
      adminNotes: '',
      resolvedAt: null,
      resolvedBy: null
    };
    await addDoc(collection(db, 'featureSubmissions'), data);
    if (u) S.mine.push({ ...data, submittedAt: null });
    renderDone();
    renderMine();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error('[feature-submit] save', e);
    showToast("That didn't send. Try again.", 'error');
  } finally {
    btn.disabled = false;
  }
}

function wire() {
  const form = $('fsForm');
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
  form.addEventListener('input', (e) => {
    const k = e.target.name;
    const out = form.querySelector(`[data-count="${k}"]`);
    if (!out) return;
    const max = k === 'title' ? TITLE_MAX : DESC_MAX;
    const n = e.target.value.length;
    out.textContent = `${n}/${max}`;
    out.classList.toggle('is-near', n > max * 0.9);
  });
  $('fsDone').addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="again"]')) return;
    $('fsDone').hidden = true;
    form.hidden = false;
    renderForm();
    form.querySelector('input[name="category"]')?.focus();
  });
}

async function main() {
  const ctx = await initPage({ title: 'Feedback' });
  S.ctx = ctx;
  S.user = ctx.user || null;
  const p = ctx.realProfile || ctx.profile;
  S.name = p?.preferredDisplayName || p?.displayName || S.user?.displayName || (S.user?.email ? S.user.email.split('@')[0] : '');
  await loadMine();
  renderForm();
  renderMine();
  wire();
  pageReady();
}

main().catch((err) => showPageError(err));
