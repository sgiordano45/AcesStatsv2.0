// js/pages/league-rules.js
// league-rules.html: the rules themselves are in the page. This adds the
// section bar (with the current section marked), search with highlighting,
// the Summer / Fall filter, and the official documents.
//
// URL: league-rules.html?season=fall&q=mercy#in-game
// Data: leagueDocuments (active == true, by order): title, description,
// category (town | league | insurance | field), url, uploadedAt.

import { initPage, pageReady } from '../core/app.js';
import { db, collection, query, where, orderBy, getDocs } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
const DOC_ICONS = { town: 'home', league: 'softball', insurance: 'shield', field: 'map-pin' };
const S = { season: '', q: '' };

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

async function loadDocuments() {
  const box = $('lrDocs');
  try {
    const snap = await getDocs(query(collection(db, 'leagueDocuments'), where('active', '==', true), orderBy('order', 'asc')));
    if (snap.empty) { box.innerHTML = '<li class="lr-docs-empty">No documents right now.</li>'; return; }
    box.innerHTML = snap.docs.map((d) => {
      const v = d.data();
      const when = v.uploadedAt?.toDate ? v.uploadedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const url = /^https?:\/\//i.test(v.url || '') ? v.url : '';
      return `<li><a class="lr-doc" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>
        <span class="lr-doc-icon">${icon(DOC_ICONS[v.category] || 'book')}</span>
        <span class="lr-doc-body"><b>${esc(v.title || 'Document')}</b>
          ${v.description ? `<span>${esc(v.description)}</span>` : ''}
          <small>${v.category ? `<span class="aces-badge is-outline">${esc(v.category)}</span>` : ''}${when ? `Updated ${esc(when)}` : ''}</small></span>
        ${icon('external-link')}
      </a></li>`;
    }).join('');
  } catch (err) {
    console.error('[rules] documents', err);
    box.innerHTML = '<li class="lr-docs-empty">Documents couldn\'t be loaded. Try again later.</li>';
  }
}

// ---------------------------------------------------------------------------
// Section bar
// ---------------------------------------------------------------------------

function buildJump() {
  const sections = [...document.querySelectorAll('.lr-section')];
  $('lrJump').innerHTML = sections.map((s) => `<a class="aces-chip lr-jump-link" href="#${esc(s.id)}" data-jump="${esc(s.id)}">${icon(s.dataset.icon || 'list')}${esc(s.dataset.title || s.id)}</a>`).join('');
  if (!('IntersectionObserver' in window)) return;
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
    const current = sections.find((s) => !s.hidden && seen.get(s.id) !== null && seen.get(s.id) !== undefined);
    $('lrJump').querySelectorAll('[data-jump]').forEach((a) => {
      const on = current && a.dataset.jump === current.id;
      a.classList.toggle('is-current', !!on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }, { rootMargin: '-120px 0px -55% 0px' });
  sections.forEach((s) => io.observe(s));
}

// ---------------------------------------------------------------------------
// Search and season filter
// ---------------------------------------------------------------------------

const originals = new Map();   // element -> its original HTML (for un-highlighting)

function highlight(el, term) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) if (node.textContent.toLowerCase().includes(term)) nodes.push(node);
  nodes.forEach((t) => {
    const text = t.textContent;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    let at;
    while ((at = lower.indexOf(term, i)) !== -1) {
      if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(at, at + term.length);
      frag.appendChild(mark);
      i = at + term.length;
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    t.parentNode.replaceChild(frag, t);
  });
}

const seasonOk = (el) => !S.season || !el.dataset.season || el.dataset.season === S.season;

function apply({ scroll = false } = {}) {
  const term = S.q.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('.lr-section').forEach((sec) => {
    if (sec.id === 'documents') { sec.hidden = !!term; return; }
    let any = false;
    sec.querySelectorAll('.lr-group').forEach((g) => {
      let groupAny = false;
      const groupOk = seasonOk(g);
      const groupHit = term && g.querySelector('h3')?.textContent.toLowerCase().includes(term);
      g.querySelectorAll('.lr-rule').forEach((r) => {
        if (!originals.has(r)) originals.set(r, r.innerHTML);
        r.innerHTML = originals.get(r);
        r.querySelectorAll('li[data-season]').forEach((li) => { li.hidden = !seasonOk(li); });
        const visibleText = [...r.childNodes].map((n) => (n.nodeType === 1 && n.hidden ? '' : n.textContent)).join(' ').toLowerCase();
        const ok = groupOk && seasonOk(r) && (!term || groupHit || visibleText.includes(term));
        r.hidden = !ok;
        if (ok) { groupAny = true; shown += 1; if (term) highlight(r, term); }
      });
      g.hidden = !groupAny;
      any = any || groupAny;
    });
    sec.hidden = !any;
  });
  document.querySelectorAll('.lr-jump-link').forEach((a) => { a.hidden = !!document.getElementById(a.dataset.jump)?.hidden; });
  $('lrEmpty').hidden = shown > 0;
  $('lrCount').textContent = term || S.season
    ? `${shown} rule${shown === 1 ? '' : 's'}${term ? ` matching "${S.q.trim()}"` : ''}${S.season ? ` for ${S.season === 'summer' ? 'Summer' : 'Fall'}` : ''}`
    : '';
  const u = new URL(location.href);
  if (S.season) u.searchParams.set('season', S.season); else u.searchParams.delete('season');
  if (S.q.trim()) u.searchParams.set('q', S.q.trim()); else u.searchParams.delete('q');
  history.replaceState(null, '', u);
  if (scroll && term) document.querySelector('.lr-section:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wire() {
  let t = null;
  $('lrSearch').addEventListener('input', (e) => {
    S.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => apply(), 120);
  });
  $('lrSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply({ scroll: true }); } });
  $('lrSeason').addEventListener('click', (e) => {
    const b = e.target.closest('[data-season]');
    if (!b) return;
    S.season = b.dataset.season;
    $('lrSeason').querySelectorAll('[data-season]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });
}

async function main() {
  await initPage({ title: 'League Rules' });
  const q = new URLSearchParams(location.search);
  S.season = ['summer', 'fall'].includes(q.get('season')) ? q.get('season') : '';
  S.q = q.get('q') || '';
  $('lrSearch').value = S.q;
  $('lrSeason').querySelectorAll('[data-season]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.season === S.season)));
  buildJump();
  wire();
  if (S.q || S.season) apply();
  pageReady();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  await loadDocuments();
}

main().catch((err) => { console.error('[rules]', err); pageReady(); });
