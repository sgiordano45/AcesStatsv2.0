// js/ui/nav.js
// v2.0 site header: logo, the five hubs, search slot, theme switch and the
// avatar ("Me") menu, plus the hub's tab row and a group's second row.
// Built from the tree in nav-config.js (buildNav), for the effective viewer
// (View As aware), the site phase and siteConfig/navigation/pages.
//
//   import { mountHeader } from './js/ui/nav.js';
//   mountHeader();            // idempotent; nav-component.js calls it
//
// Desktop and tablet (769 px and up) for now. On phones css/nav.css hides it
// and the old hamburger from nav-component.js stays until push 5c.

import { buildNav, locatePage, loadPageVisibility, isPageVisible } from '../../nav-config.js';
import { onAuthChange, hasRole, signOutUser, isViewingAs, clearViewAs } from '../core/auth.js';
import { getPhase } from '../core/config.js';
import { icon } from './icons.js';

const SITE_ROOT = new URL('../../', import.meta.url).href;
const url = (href) => (/^https?:/.test(href) ? href : new URL(href, SITE_ROOT).href);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mounted = false;
let state = { user: null, profile: null, phase: null };
let els = null;

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
        <span class="aces-logo__text">Mountainside <b>Aces</b></span>
      </a>
      <nav class="aces-hubs" aria-label="Site">${hubLinks}</nav>
      <div class="aces-header__end">
        <div class="aces-header__search" data-nav-search></div>
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
  syncSpacer();
}

// Hover (or keyboard focus) menu under a hub: every tab, with a group's
// pages listed under its name, so any page is one click from anywhere.
function hubMenu(hub, here) {
  const items = hub.tabs.map((t) => (t.pages
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
  const h = els.header.offsetHeight;
  if (!h) return; // header hidden (phones)
  document.querySelectorAll('body *').forEach((el) => {
    if (els.header.contains(el)) return;
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky') return;
    if (el.dataset.acesStickyTop === undefined) {
      const top = parseFloat(cs.top);
      if (Number.isNaN(top) || top >= h) return;
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
  els.header.addEventListener('click', async (e) => {
    if (e.target.closest('.aces-me__btn')) {
      setMenu(!els.header.querySelector('.aces-me')?.classList.contains('is-open'));
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
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.aces-me')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
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
  document.body.prepend(header, spacer);
  document.documentElement.classList.add('has-aces-header');
  els = { header, bar, spacer, tabs };
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
