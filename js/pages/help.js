// js/pages/help.js
// help.html: every guide in one page, with a search box. Sections come from
// js/data/help-content.js; staff sections show only to people with the role
// (admins see everything). Each topic is a <details> with its own id, so
// help.html#run-the-live-draft opens straight to it. The old guide pages
// forward to their section (help.html#captains and so on).

import { initPage, pageReady } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { HELP_SECTIONS } from '../data/help-content.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
let sections = [];

const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function render() {
  $('helpChips').innerHTML = sections.map(s =>
    `<a class="aces-chip" href="#${esc(s.id)}">${icon(s.icon)}<span>${esc(s.title)}</span></a>`).join('');
  $('helpBody').innerHTML = sections.map(s => `
    <section class="help-section" id="${esc(s.id)}" data-section>
      <div class="help-section-head">
        <h2 class="help-section-title">${icon(s.icon)} ${esc(s.title)}</h2>
        ${s.audience ? '<span class="aces-badge is-outline">For your role</span>' : ''}
      </div>
      ${s.intro ? `<p class="help-intro">${esc(s.intro)}</p>` : ''}
      <div class="help-topics">${s.topics.map(t => `
        <details class="help-topic" id="${esc(t.id)}" data-text="${esc(norm(`${t.title} ${t.keywords || ''} ${plain(t.body)}`))}">
          <summary><span>${esc(t.title)}</span>${icon('chevron-down')}</summary>
          <div class="help-topic-body">${t.body}</div>
        </details>`).join('')}
      </div>
    </section>`).join('');
}

function filter(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  let shown = 0;
  document.querySelectorAll('[data-section]').forEach(sec => {
    let any = 0;
    sec.querySelectorAll('.help-topic').forEach(t => {
      const hit = !words.length || words.every(w => t.dataset.text.includes(w));
      t.hidden = !hit;
      if (hit) any++;
      // Open matches while searching; close them again when the box is cleared.
      if (words.length) t.open = hit && any <= 3; else if (!t.dataset.keep) t.open = false;
    });
    sec.hidden = !any;
    shown += any;
  });
  $('helpCount').textContent = words.length ? `${shown} topic${shown === 1 ? '' : 's'} match` : '';
  $('helpEmpty').hidden = shown > 0;
}

/** Open the topic or section named by the hash. */
function openHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'DETAILS') { el.open = true; el.dataset.keep = '1'; }
  el.scrollIntoView({ block: 'start' });
}

async function main() {
  const ctx = await initPage({ title: 'Help' });
  const profile = ctx?.profile;
  sections = HELP_SECTIONS.filter(s => !s.audience || hasRole(profile, s.audience));
  render();
  let t = null;
  $('helpSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => filter(e.target.value), 120); });
  window.addEventListener('hashchange', openHash);
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('helpSearch').value = q; filter(q); }
  openHash();
  pageReady();
}

main();
