// js/ui/nav.js
// v2.0 site header: logo, the five hubs, search slot, theme switch and the
// avatar ("Me") menu, plus the hub's tab row and a group's second row.
// Built from the tree in nav-config.js (buildNav), for the effective viewer
// (View As aware), the site phase and siteConfig/navigation/pages.
//
//   import { mountHeader } from './js/ui/nav.js';
//   mountHeader();            // idempotent; nav-component.js calls it
//
// Phones (768 px and below): the top bar keeps the logo, ?, theme and avatar
// and scrolls away with the page; the hubs move to a fixed bottom bar
// (Home, Season, Stats, Teams, Me), and Me opens a sheet with History, Play,
// Help, Install App and everything in the avatar menu.

import { buildNav, locatePage, loadPageVisibility, isPageVisible } from '../../nav-config.js';
import { onAuthChange, hasRole, signOutUser, isViewingAs, clearViewAs } from '../core/auth.js';
import { getPhase } from '../core/config.js';
import { icon } from './icons.js';

const SITE_ROOT = new URL('../../', import.meta.url).href;
const url = (href) => (/^https?:/.test(href) ? href : new URL(href, SITE_ROOT).href);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mounted = false;
let state = { user: null, profile: null, phase: null, sheetOpen: false };
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
let els = null;
let searchCtx = null;   // the nav context the search palette filters pages by

// Global search (js/ui/search.js), loaded the first time it opens.
function openSearch(query = '') {
  import('./search.js')
    .then((m) => m.openSearch({ ctx: searchCtx, query }))
    .catch((err) => console.error('[nav] search failed to load', err));
}

const typingInField = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function ensureStyles() {
  for (const file of ['css/tokens.css', 'css/nav.css']) {
    const href = url(file);
    if ([...document.styleSheets].some((s) => s.href === href) || document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

function ensureThemeScript() {
  if (window.ThemeManager || document.querySelector('script[src$="theme-toggle.js"]')) return;
  const s = document.createElement('script');
  s.src = url('theme-toggle.js');
  document.head.appendChild(s);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function displayName(user, profile) {
  return profile?.displayName || profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Me';
}

function link(page, cls, current) {
  const ext = page.external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const cur = current ? ' aria-current="page"' : '';
  return `<a class="${cls}${current ? ' is-active' : ''}" href="${esc(url(page.href))}"${ext}${cur}>${icon(page.icon)}<span>${esc(page.label)}</span></a>`;
}

function render() {
  const { user, profile, phase } = state;
  const here = locatePage(location.pathname);
  const ctx = { signedIn: !!user, profile, phase, hasRole, isVisible: isPageVisible, currentId: here?.pageId };
  searchCtx = { ...ctx, currentId: null };
  const nav = buildNav(ctx);
  const hub = nav.hubs.find((h) => h.id === here?.hubId);
  const tab = hub?.tabs.find((t) => (t.key || t.id) === here?.tabKey);

  // Top bar
  const hubLinks = nav.hubs.filter((h) => h.href && !h.utility).map((h) => {
    const active = h.id === here?.hubId;
    const label = h.shortLabel
      ? `<span class="aces-hub__full">${esc(h.label)}</span><span class="aces-hub__short">${esc(h.shortLabel)}</span>`
      : `<span>${esc(h.label)}</span>`;
    const hubLink = `<a class="aces-hub${active ? ' is-active' : ''}" href="${esc(url(h.href))}"${active ? ' aria-current="true"' : ''}>${icon(h.icon)}${label}</a>`;
    return `<div class="aces-hubitem">${hubLink}${hubMenu(h, here)}</div>`;
  }).join('');

  const name = displayName(user, profile);
  const viewing = isViewingAs();
  const meOpen = els?.header.querySelector('.aces-me')?.classList.contains('is-open');
  const meSections = nav.me.map((sec) => `
      <div class="aces-me__section">
        ${sec.label ? `<div class="aces-me__label">${esc(sec.label)}</div>` : ''}
        ${sec.pages.map((p) => link(p, 'aces-me__item', here?.pageId === p.id)).join('')}
      </div>`).join('');

  const account = user ? `
      <div class="aces-me${meOpen ? ' is-open' : ''}">
        <button type="button" class="aces-me__btn" aria-haspopup="true" aria-expanded="${meOpen ? 'true' : 'false'}" aria-label="Account menu">
          <span class="aces-avatar${viewing ? ' is-viewing' : ''}">${esc(initials(name))}</span>
          <span class="aces-me__name">${esc(name)}</span>${icon('chevron-down')}
        </button>
        <div class="aces-me__menu" role="menu">
          <div class="aces-me__who">${viewing ? `<span class="aces-me__viewing">Viewing as</span>` : ''}<b>${esc(name)}</b>${user.email && !viewing ? `<span>${esc(user.email)}</span>` : ''}</div>
          ${meSections}
          <div class="aces-me__section">
            ${viewing ? `<button type="button" class="aces-me__item" data-nav-exit-view>${icon('eye-off')}<span>Exit View As</span></button>` : ''}
            <button type="button" class="aces-me__item" data-nav-signout>${icon('log-out')}<span>Sign out</span></button>
          </div>
        </div>
      </div>`
    : `<a class="aces-signin" href="${esc(url('signin.html'))}?next=${encodeURIComponent(location.href)}">${icon('log-in')}<span>Sign in</span></a>`;

  els.bar.innerHTML = `
    <div class="aces-header__inner">
      <a class="aces-logo" href="${esc(url(nav.home.href))}" aria-label="Mountainside Aces home">
        <img src="${esc(url('icons/icon-192.png'))}" alt="" width="32" height="32">
        <span class="aces-logo__text"><span class="aces-logo__town">Mountainside </span><b>Aces</b></span>
      </a>
      <div class="aces-hubs" role="navigation" aria-label="Site">${hubLinks}</div>
      <div class="aces-header__end">
        <div class="aces-header__search" data-nav-search>
          <button type="button" class="aces-search-btn" data-search-open aria-label="Search players, teams, seasons and pages" title="Search (/)">
            ${icon('search')}<span class="aces-search-btn__text">Search</span><kbd>/</kbd>
          </button>
        </div>
        ${helpButton(nav, here)}
        <button type="button" class="aces-icon-btn" data-theme-toggle aria-label="Switch light or dark mode">
          <span class="aces-theme-moon">${icon('moon')}</span><span class="aces-theme-sun">${icon('sun')}</span>
        </button>
        ${account}
      </div>
    </div>`;

  // Tab rows (only on pages that sit in a hub)
  if (hub && hub.tabs.length) {
    const tabs = hub.tabs.map((t) => link({ ...t, href: t.href }, 'aces-tab', (t.key || t.id) === here.tabKey)).join('');
    const sub = tab?.pages && tab.pages.length > 1
      ? `<div class="aces-subtabs" role="navigation" aria-label="${esc(tab.label)}">${tab.pages.map((p) => link(p, 'aces-subtab', p.id === here.pageId)).join('')}</div>`
      : '';
    els.tabs.innerHTML = `<div class="aces-tabs__row" role="navigation" aria-label="${esc(hub.label)}">${tabs}</div>${sub}`;
    els.tabs.hidden = false;
    // Keep the current tab in view on narrow screens without scrolling the page.
    els.tabs.querySelectorAll('.aces-tabs__row, .aces-subtabs').forEach((row) => {
      const active = row.querySelector('.is-active');
      if (active && row.scrollWidth > row.clientWidth) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    });
  } else {
    els.tabs.innerHTML = '';
    els.tabs.hidden = true;
  }
  renderMobile(nav, here, { name, viewing, meSections });
  syncSpacer();
}

// --- Phones: bottom bar and the Me sheet ------------------------------------

function renderMobile(nav, here, { name, viewing, meSections }) {
  const { user } = state;
  const hubHref = (id) => nav.hubs.find((h) => h.id === id)?.href;
  const inMe = ['me', 'history', 'play', 'help'].includes(here?.hubId);
  const item = (id, label, iconName, href) => {
    const active = here?.hubId === id;
    return `<a class="aces-bottom__item${active ? ' is-active' : ''}" href="${esc(url(href))}"${active ? ' aria-current="true"' : ''}>${icon(iconName)}<span>${esc(label)}</span></a>`;
  };
  els.bottom.innerHTML = [
    item('home', 'Home', 'home', nav.home.href),
    ...['season', 'stats', 'teams'].map((id) => {
      const h = nav.hubs.find((x) => x.id === id);
      return h?.href ? item(id, h.shortLabel || h.label, h.icon, h.href) : '';
    }),
    `<button type="button" class="aces-bottom__item${inMe || state.sheetOpen ? ' is-active' : ''}" data-sheet-open aria-haspopup="dialog" aria-expanded="${state.sheetOpen}">
      ${user ? `<span class="aces-avatar is-sm${viewing ? ' is-viewing' : ''}">${esc(initials(name))}</span>` : icon('user')}<span>Me</span>
    </button>`,
  ].join('');

  const more = [
    ['history', 'History', 'scroll'],
    ['play', 'Play', 'gamepad'],
    ['help', 'Help', 'help'],
  ].filter(([id]) => hubHref(id)).map(([id, label, ic]) => {
    const active = here?.hubId === id;
    return `<a class="aces-sheet__tile${active ? ' is-active' : ''}" href="${esc(url(hubHref(id)))}">${icon(ic)}<span>${label}</span></a>`;
  });
  if (!isInstalled() && typeof window.triggerPWAInstall === 'function') {
    more.push(`<button type="button" class="aces-sheet__tile" data-nav-install>${icon('smartphone')}<span>Install app</span></button>`);
  }

  const who = user
    ? `<span class="aces-avatar${viewing ? ' is-viewing' : ''}">${esc(initials(name))}</span>
       <div class="aces-sheet__name">${viewing ? '<span class="aces-me__viewing">Viewing as</span>' : ''}<b>${esc(name)}</b></div>`
    : `<span class="aces-avatar">${icon('user')}</span><div class="aces-sheet__name"><b>Not signed in</b></div>`;
  const account = user
    ? `<div class="aces-me__section">
        ${viewing ? `<button type="button" class="aces-me__item" data-nav-exit-view>${icon('eye-off')}<span>Exit View As</span></button>` : ''}
        <button type="button" class="aces-me__item" data-nav-signout>${icon('log-out')}<span>Sign out</span></button>
      </div>`
    : `<div class="aces-sheet__actions">
        <a class="aces-sheet__btn is-primary" href="${esc(url('signin.html'))}?next=${encodeURIComponent(location.href)}">${icon('log-in')}<span>Sign in</span></a>
        <a class="aces-sheet__btn" href="${esc(url('signup.html'))}">${icon('user-plus')}<span>Create account</span></a>
      </div>`;

  els.sheet.innerHTML = `
    <div class="aces-sheet__backdrop" data-sheet-close></div>
    <div class="aces-sheet__panel" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="aces-sheet__head">
        ${who}
        <button type="button" class="aces-sheet__close" data-sheet-close aria-label="Close menu">${icon('close')}</button>
      </div>
      <div class="aces-sheet__label">More</div>
      <div class="aces-sheet__tiles">${more.join('')}</div>
      ${meSections}
      ${account}
    </div>`;
  els.sheet.hidden = !state.sheetOpen;
}

function setSheet(open) {
  state.sheetOpen = open;
  els.sheet.hidden = !open;
  document.documentElement.classList.toggle('aces-sheet-open', open);
  els.bottom.querySelector('[data-sheet-open]')?.setAttribute('aria-expanded', String(open));
  els.bottom.querySelector('[data-sheet-open]')?.classList.toggle('is-active', open || ['me', 'history', 'play', 'help'].includes(locatePage(location.pathname)?.hubId));
  if (open) els.sheet.querySelector('.aces-sheet__close')?.focus();
}

// Hover (or keyboard focus) menu under a hub: every tab, with a group's
// pages listed under its name, so any page is one click from anywhere.
function hubMenu(hub, here) {
  const items = hub.tabs.map((t) => (t.pages && t.pages.length === 1
    ? link({ ...t.pages[0], label: t.label, icon: t.icon }, 'aces-hubmenu__item', t.pages[0].id === here?.pageId)
    : t.pages
    ? `<div class="aces-hubmenu__group">${esc(t.label)}</div>${t.pages.map((p) => link(p, 'aces-hubmenu__item is-sub', p.id === here?.pageId)).join('')}`
    : link(t, 'aces-hubmenu__item', t.id === here?.pageId))).join('');
  return `<div class="aces-hubmenu">${items}</div>`;
}

// The ? button opens the Help area (help.html and the guides).
function helpButton(nav, here) {
  const help = nav.hubs.find((h) => h.id === 'help');
  if (!help?.href) return '';
  const active = here?.hubId === 'help';
  return `<a class="aces-icon-btn${active ? ' is-active' : ''}" href="${esc(url(help.href))}" aria-label="Help and guides" title="Help and guides"${active ? ' aria-current="true"' : ''}>${icon('help')}</a>`;
}

// The bar is fixed; a spacer of the same height keeps page content below it.
function syncSpacer() {
  if (!els) return;
  els.spacer.style.height = `${els.header.offsetHeight}px`;
  liftStickies();
}

// Legacy bars that stick at top: 0 would slide under the fixed header, so
// they stick just below it instead. Runs on mount, on load and after resizes.
function liftStickies() {
  const fixed = getComputedStyle(els.header).position === 'fixed';
  const h = fixed ? els.header.offsetHeight : 0; // on phones the header scrolls away
  document.querySelectorAll('body *').forEach((el) => {
    if (els.header.contains(el)) return;
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky') return;
    if (el.dataset.acesStickyTop === undefined) {
      const top = parseFloat(cs.top);
      if (Number.isNaN(top) || top >= els.header.offsetHeight) return;
      el.dataset.acesStickyTop = String(top);
    }
    el.style.top = `${h + parseFloat(el.dataset.acesStickyTop)}px`;
  });
}

function setMenu(open) {
  const me = els.header.querySelector('.aces-me');
  if (!me) return;
  me.classList.toggle('is-open', open);
  me.querySelector('.aces-me__btn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function wireEvents() {
  const onClick = async (e) => {
    if (e.target.closest('.aces-me__btn')) {
      if (isPhone()) setSheet(true);
      else setMenu(!els.header.querySelector('.aces-me')?.classList.contains('is-open'));
      return;
    }
    if (e.target.closest('[data-search-open]')) { setSheet(false); openSearch(); return; }
    if (e.target.closest('[data-sheet-open]')) { setSheet(!state.sheetOpen); return; }
    if (e.target.closest('[data-sheet-close]')) { setSheet(false); return; }
    if (e.target.closest('[data-nav-install]')) {
      setSheet(false);
      window.triggerPWAInstall?.();
      return;
    }
    if (e.target.closest('[data-nav-signout]')) {
      e.preventDefault();
      try { await signOutUser(); } finally { location.reload(); }
      return;
    }
    if (e.target.closest('[data-nav-exit-view]')) {
      e.preventDefault();
      clearViewAs();
      location.reload();
    }
  };
  [els.header, els.bottom, els.sheet].forEach((el) => el.addEventListener('click', onClick));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.aces-me')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setMenu(false); if (state.sheetOpen) setSheet(false); }
    // "/" (outside a text field) or Cmd/Ctrl-K opens search.
    const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (cmdK || (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typingInField(e.target))) {
      e.preventDefault();
      setMenu(false);
      openSearch();
    }
  });
  if ('ResizeObserver' in window) new ResizeObserver(syncSpacer).observe(els.header);
  window.addEventListener('resize', syncSpacer);
}

/**
 * Mount the header once per page. Safe to call again: later calls do nothing.
 * The old desktop link row is not drawn any more (nav-component.js); an empty
 * .filters-nav card left behind is hidden.
 */
export async function mountHeader() {
  if (mounted || document.getElementById('aces-header')) return;
  mounted = true;
  ensureStyles();
  ensureThemeScript();

  // A div, not <header>: some legacy pages style every <header> element.
  const header = document.createElement('div');
  header.setAttribute('role', 'banner');
  header.id = 'aces-header';
  header.className = 'aces-header';
  const spacer = document.createElement('div');
  spacer.className = 'aces-header-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  const bar = document.createElement('div');
  bar.className = 'aces-header__bar';
  const tabs = document.createElement('div');
  tabs.className = 'aces-tabs';
  tabs.hidden = true;
  header.append(bar, tabs);
  const bottom = document.createElement('div'); // not <nav>: legacy pages style nav elements
  bottom.className = 'aces-bottom';
  bottom.setAttribute('role', 'navigation');
  bottom.setAttribute('aria-label', 'Main');
  const sheet = document.createElement('div');
  sheet.className = 'aces-sheet';
  sheet.hidden = true;
  document.body.prepend(header, spacer);
  document.body.append(bottom, sheet);
  document.documentElement.classList.add('has-aces-header');
  els = { header, bar, spacer, tabs, bottom, sheet };
  wireEvents();
  hideEmptyFiltersNav();

  render(); // signed-out shape straight away; filled in when auth answers
  window.addEventListener('load', () => { liftStickies(); setTimeout(liftStickies, 1500); });
  const [phase] = await Promise.all([
    getPhase().catch(() => null),
    loadPageVisibility().catch(() => null),
  ]);
  state.phase = phase;
  render();
  onAuthChange((user, profile, view) => {
    state.user = user;
    state.profile = view?.profile || profile || null;
    render();
  });
}

function hideEmptyFiltersNav() {
  const check = () => document.querySelectorAll('.filters-nav').forEach((el) => {
    const empty = !el.querySelector('*:not(.nav-container)') && !el.textContent.trim();
    el.classList.toggle('aces-nav-empty', empty);
  });
  check();
  document.querySelectorAll('.filters-nav').forEach((el) => new MutationObserver(check).observe(el, { childList: true, subtree: true }));
}
