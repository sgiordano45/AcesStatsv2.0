// js/ui/search.js
// Global search palette: players, teams, seasons and pages from anywhere.
// Opened by the header's search button (js/ui/nav.js), "/" or Cmd/Ctrl-K.
// Loaded on first use, so pages pay nothing until someone searches.
//
//   import { openSearch } from './js/ui/search.js';
//   openSearch({ ctx });   // ctx: the nav's { signedIn, profile, phase, hasRole, isVisible }
//
// Pages come from nav-config (role, phase and siteConfig visibility apply);
// players, teams and seasons from js/data/search-index.js.

import { buildNav } from '../../nav-config.js';
import { getSearchIndex } from '../data/search-index.js';
import { searchAll } from '../domain/search-index.js';
import { seasonLabel } from '../domain/season-ids.js';
import { escapeHtml as esc, formatPlayerName } from './format.js';
import { icon } from './icons.js';
import { TEAM_COLORS } from './stat-columns.js';

const SITE_ROOT = new URL('../../', import.meta.url).href;
const url = (href) => (/^https?:/.test(href) ? href : new URL(href, SITE_ROOT).href);

// Extra words a page answers to (label and hub already count).
const KEYWORDS = {
  'current-season': 'standings table rankings record',
  schedule: 'games calendar fixtures',
  batting: 'hitting average obp stats',
  pitching: 'era innings pitchers',
  leaders: 'leaderboard top best records milestones clubs pitching',
  teams: 'rosters',
  explore: 'query filter search chart charts graph find',
  compare: 'versus vs head-to-head h2h matchup rivalry players teams',
  players: 'directory roster',
  playoffs: 'bracket postseason',
  champions: 'titles winners',
  'league-rules': 'rules bylaws',
  help: 'faq guide how'
};
const QUICK = ['current-season', 'schedule', 'batting', 'leaders', 'teams'];

let dialog = null;
let state = { ctx: null, pages: [], index: null, items: [], active: 0 };

function ensureStyles() {
  const href = new URL('css/search.css', SITE_ROOT).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function pagesFor(ctx) {
  const nav = buildNav(ctx || {});
  const out = [];
  const add = (p, hub) => {
    if (!p?.href || p.external || out.some(x => x.id === p.id)) return;
    out.push({ id: p.id, label: p.label, href: p.href, icon: p.icon, hub, keywords: KEYWORDS[p.id] || '' });
  };
  add({ ...nav.home, id: 'home', label: 'Home' }, '');
  for (const hub of nav.hubs) {
    for (const t of hub.tabs) (t.pages ? t.pages : [t]).forEach(p => add(p, hub.label));
  }
  for (const sec of nav.me) sec.pages.forEach(p => add(p, 'Me'));
  return out;
}

const dot = (team) => {
  const key = String(team || '').toLowerCase();
  return `<span class="aces-team-dot"${TEAM_COLORS.has(key) ? ` data-team-color="${esc(key)}"` : ''}></span>`;
};

function rowFor(kind, x) {
  switch (kind) {
    case 'player': return {
      href: `player.html?id=${encodeURIComponent(x.id)}`,
      lead: `<span class="aces-search__ico">${icon('user')}</span>`,
      label: formatPlayerName(x.name),
      meta: [x.team ? `${dot(x.team)}${esc(x.team)}` : '', x.last ? esc(seasonLabel(x.last)) : ''].filter(Boolean).join(' · ')
    };
    case 'team': return {
      href: `team.html?team=${encodeURIComponent(x.name)}`,
      lead: `<span class="aces-search__ico">${dot(x.name)}</span>`,
      label: x.name,
      meta: `${x.n} season${x.n === 1 ? '' : 's'}${x.last ? ` · last ${esc(seasonLabel(x.last))}` : ''}`
    };
    case 'season': return {
      href: `season.html?seasonId=${encodeURIComponent(x.id)}`,
      lead: `<span class="aces-search__ico">${icon('calendar')}</span>`,
      label: seasonLabel(x.id),
      meta: 'Season'
    };
    default: return {
      href: x.href,
      lead: `<span class="aces-search__ico">${icon(x.icon || 'link')}</span>`,
      label: x.label,
      meta: x.hub ? esc(x.hub) : 'Page'
    };
  }
}

const GROUP_LABEL = { player: 'Players', team: 'Teams', season: 'Seasons', page: 'Pages' };

function render() {
  const q = dialog.querySelector('input').value;
  const list = dialog.querySelector('[data-results]');
  let groups;
  if (!q.trim()) {
    groups = [{ kind: 'page', label: 'Jump to', items: QUICK.map(id => state.pages.find(p => p.id === id)).filter(Boolean) }];
  } else {
    groups = searchAll(state.index || {}, state.pages, q).map(g => ({ ...g, label: GROUP_LABEL[g.kind] }));
  }
  state.items = [];
  const html = groups.map(g => `
    <div class="aces-search__group" role="presentation">
      <div class="aces-search__glabel">${esc(g.label)}</div>
      ${g.items.map(x => {
        const r = rowFor(g.kind, x);
        const i = state.items.push(r.href) - 1;
        return `<a class="aces-search__row" role="option" id="aces-sr-${i}" data-i="${i}" href="${esc(url(r.href))}">
          ${r.lead}<span class="aces-search__label">${esc(r.label)}</span><span class="aces-search__meta">${r.meta}</span></a>`;
      }).join('')}
    </div>`).join('');
  const loading = !state.index && q.trim() ? '<p class="aces-search__note">Loading players, teams and seasons…</p>' : '';
  list.innerHTML = html || (q.trim() && state.index ? `<p class="aces-search__note">No matches for “${esc(q.trim())}”.</p>` : '') || loading;
  if (html && loading) list.insertAdjacentHTML('beforeend', loading);
  state.active = 0;
  highlight();
}

function highlight() {
  const rows = dialog.querySelectorAll('.aces-search__row');
  rows.forEach((r, i) => r.classList.toggle('is-active', i === state.active));
  const input = dialog.querySelector('input');
  if (rows[state.active]) {
    input.setAttribute('aria-activedescendant', rows[state.active].id);
    rows[state.active].scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function build() {
  ensureStyles();
  dialog = document.createElement('dialog');
  dialog.className = 'aces-search';
  dialog.setAttribute('aria-label', 'Search');
  dialog.innerHTML = `
    <div class="aces-search__box">
      <div class="aces-search__bar">
        ${icon('search')}
        <input type="search" placeholder="Players, teams, seasons, pages" aria-label="Search" role="combobox"
          aria-expanded="true" aria-controls="aces-search-results" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button type="button" class="aces-search__close" data-close aria-label="Close search">Esc</button>
      </div>
      <div class="aces-search__results" id="aces-search-results" role="listbox" data-results></div>
      <div class="aces-search__foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>/</kbd> or <kbd>⌘K</kbd> to search</span></div>
    </div>`;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('input');
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    const n = dialog.querySelectorAll('.aces-search__row').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); state.active = n ? (state.active + 1) % n : 0; highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.active = n ? (state.active - 1 + n) % n : 0; highlight(); }
    else if (e.key === 'Enter') {
      const href = state.items[state.active];
      if (href) { e.preventDefault(); location.href = url(href); }
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.aces-search__row');
    if (row && Number(row.dataset.i) !== state.active) { state.active = Number(row.dataset.i); highlight(); }
  });
}

export function openSearch({ ctx = null, query = '' } = {}) {
  if (!dialog) build();
  state.ctx = ctx;
  state.pages = pagesFor(ctx);
  const input = dialog.querySelector('input');
  input.value = query;
  if (!dialog.open) dialog.showModal();
  input.focus();
  render();
  if (!state.index) {
    getSearchIndex().then((ix) => { state.index = ix; if (dialog.open) render(); })
      .catch((err) => console.warn('[search] index unavailable', err));
  }
}

export function closeSearch() {
  if (dialog?.open) dialog.close();
}
