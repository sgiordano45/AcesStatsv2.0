// js/core/app.js
// The page shell. Every v2.0 page starts with one call:
//
//   import { initPage, pageReady, showPageError, bindActions } from './js/core/app.js';
//
//   const { user, profile, config } = await initPage({ title: 'Batting' });
//   // ... load and render ...
//   pageReady();
//
// initPage() does what each page used to do for itself (init, showAuthGate,
// checkAuthorization, showMainContent, hideLoading - 8 to 24 copies each):
//   - sets the tab title
//   - applies the saved theme straight away and loads theme-toggle.js
//   - loads the shared nav (nav-component.js) unless { nav: false }
//   - shows an offline banner while the device is offline
//   - catches uncaught errors (error boundary; see REPORT_CLIENT_ERRORS)
//   - waits for auth and site config together, then gates the page:
//       requiresAuth: true  -> signed-out visitors go to signin.html
//       role: 'captain'     -> others see an access message in the page
//     (see hasRole in auth.js for the role names). A gated-out page's
//     initPage() never resolves, so the page's own code simply doesn't run.
//
// Page markup conventions (all optional):
//   [data-page-loading]  shown until pageReady() (skeleton or spinner)
//   [data-page-content]  hidden until pageReady(); also where the access and
//                        error messages render (else <main>; on a page with
//                        neither, the message goes at the top of .page-container)
//   [data-action="name"] click targets handled by bindActions({ name() {} })

import { IS_LIVE } from './env.js';
import { db, collection, addDoc, serverTimestamp } from './firebase.js';
import { authReady, onAuthChange, getCurrentUser, hasRole } from './auth.js';
import { getSiteConfig } from './config.js';
import { showToast } from '../ui/toast.js';

export { onAuthChange };

export const SITE_NAME = 'Mountainside Aces';

// Site root, worked out from this file's own URL (js/core/app.js), so it is
// right at acessoftballreference.com/, on the /AcesStatsv2.0/ preview, and
// from pages in subfolders such as admin/.
export const SITE_ROOT = new URL('../../', import.meta.url).href;

/** Absolute URL for a path relative to the site root: siteUrl('signin.html'). */
export function siteUrl(path = '') {
  return new URL(path, SITE_ROOT).href;
}

// Write uncaught errors to the clientErrors collection. Off until its rules
// block is deployed (writes are rejected without it). Errors are always
// logged to the console either way.
const REPORT_CLIENT_ERRORS = false;
const MAX_REPORTS_PER_PAGE = 5;

// ---------------------------------------------------------------------------
// initPage
// ---------------------------------------------------------------------------

let initPromise = null;

/**
 * @param {object} [options]
 * @param {string} [options.title]          Tab title; ' - Mountainside Aces' is appended.
 * @param {boolean} [options.requiresAuth]  Send signed-out visitors to sign in.
 * @param {string|string[]} [options.role]  Required role(s); implies requiresAuth.
 * @param {boolean} [options.nav=true]      Load the shared nav.
 * @param {boolean} [options.offlineBanner=true]
 * @param {string} [options.deniedMessage]  Text for the access message.
 * @returns {Promise<{ user: object|null, profile: object|null, config: object }>}
 */
export function initPage(options = {}) {
  if (initPromise) {
    console.warn('[app] initPage() called twice; returning the first result');
    return initPromise;
  }
  initPromise = runInit(options);
  return initPromise;
}

async function runInit({
  title,
  requiresAuth = false,
  role = null,
  nav = true,
  offlineBanner = true,
  deniedMessage
} = {}) {
  installErrorBoundary();
  ensureStateStyles(); // so [hidden] wins over page CSS like display:flex
  if (title) document.title = `${title} - ${SITE_NAME}`;
  applySavedTheme();
  loadScriptOnce('theme-toggle.js', () => !!window.ThemeManager);
  if (offlineBanner) installOfflineBanner();
  if (nav) {
    import(siteUrl('nav-component.js')).catch((err) => console.error('[app] nav failed to load', err));
  }

  const [{ user, profile }, config] = await Promise.all([authReady(), getSiteConfig()]);

  if ((requiresAuth || role) && !user) {
    redirectToSignIn();
    return new Promise(() => {}); // leaving the page
  }

  if (role && !hasRole(profile, role)) {
    showAccessDenied(deniedMessage);
    return new Promise(() => {}); // page code does not run
  }

  return { user, profile, config };
}

/** Send the visitor to sign in, remembering where to come back to. */
export function redirectToSignIn() {
  const here = window.location.href;
  try { sessionStorage.setItem('authReturnUrl', here); } catch { /* ignore */ }
  window.location.href = `${siteUrl('signin.html')}?next=${encodeURIComponent(here)}`;
}

// ---------------------------------------------------------------------------
// Loading, empty, access and error states
// ---------------------------------------------------------------------------

const STATE_CSS = `
[data-page-loading][hidden],[data-page-content][hidden]{display:none!important}
.aces-state{max-width:480px;margin:48px auto;padding:24px;text-align:center;border-radius:8px;
  background:var(--card-bg,#fff);color:var(--text-dark,#1f2937);border:1px solid var(--border-color,#e2e8f0);
  font:400 15px/1.5 Inter,system-ui,-apple-system,sans-serif}
.aces-state h2{margin:0 0 8px;font-size:20px;line-height:1.3}
.aces-state p{margin:0 0 16px;color:var(--text-light,#64748b)}
.aces-state-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.aces-state a,.aces-state button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;
  border-radius:8px;font:600 15px/1 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;
  border:1px solid var(--border-color,#cbd5e1);background:var(--card-bg,#fff);color:inherit}
.aces-state .is-primary{background:var(--primary-color,#2d5016);border-color:transparent;color:#fff}
.aces-offline{position:fixed;top:0;left:0;right:0;z-index:9998;padding:calc(6px + env(safe-area-inset-top,0px)) 16px 6px;
  text-align:center;background:#334155;color:#fff;font:600 13px/1.4 Inter,system-ui,sans-serif}
`;

function ensureStateStyles() {
  if (document.getElementById('aces-app-styles')) return;
  const style = document.createElement('style');
  style.id = 'aces-app-styles';
  style.textContent = STATE_CSS;
  document.head.appendChild(style);
}

// Where a state card goes. With a real content container, the card replaces
// what's in it. Without one (a legacy page), the card is added at the top of
// .page-container, after the nav, and nothing else is removed.
function placeCard(card, container) {
  const host = container
    ? (typeof container === 'string' ? document.querySelector(container) : container)
    : (document.querySelector('[data-page-content]') || document.querySelector('main'));
  if (host) {
    host.replaceChildren(card);
    host.hidden = false;
    return;
  }
  const page = document.querySelector('.page-container') || document.body;
  const nav = page.querySelector(':scope > .filters-nav');
  if (nav) nav.after(card); else page.prepend(card);
}

/**
 * Reveal the page: hide [data-page-loading] elements and show
 * [data-page-content] ones. Call once the first render is done.
 */
export function pageReady() {
  document.querySelectorAll('[data-page-loading]').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('[data-page-content]').forEach((el) => { el.hidden = false; });
}

/**
 * Replace the page content with a short message card.
 * @param {{ title: string, message?: string, actions?: Array<{label: string, href?: string, onClick?: Function, primary?: boolean}>, container?: string|Element }} state
 */
export function showPageState({ title, message = '', actions = [], container } = {}) {
  ensureStateStyles();
  const card = document.createElement('div');
  card.className = 'aces-state';
  card.setAttribute('role', 'status');
  const h = document.createElement('h2');
  h.textContent = title;
  card.appendChild(h);
  if (message) {
    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);
  }
  if (actions.length) {
    const bar = document.createElement('div');
    bar.className = 'aces-state-actions';
    actions.forEach((a) => {
      const el = document.createElement(a.href ? 'a' : 'button');
      if (a.href) el.href = a.href; else el.type = 'button';
      if (a.onClick) el.addEventListener('click', a.onClick);
      if (a.primary) el.className = 'is-primary';
      el.textContent = a.label;
      bar.appendChild(el);
    });
    card.appendChild(bar);
  }
  document.querySelectorAll('.aces-state').forEach((el) => el.remove());
  document.querySelectorAll('[data-page-loading]').forEach((el) => { el.hidden = true; });
  placeCard(card, container);
  return card;
}

function showAccessDenied(message) {
  showPageState({
    title: 'Not available',
    message: message || "Your account doesn't have access to this page. If you think it should, ask a league admin.",
    actions: [{ label: 'Go to home page', href: siteUrl('index.html'), primary: true }]
  });
}

/**
 * Show a friendly error in place of the page content, with a Try again button.
 * Use as the catch for a page's main load:
 *   loadPage().catch((err) => showPageError(err));
 */
export function showPageError(error, { message, container } = {}) {
  if (error) {
    console.error('[app] page error', error);
    reportError({ message: error?.message || String(error), stack: error?.stack, kind: 'page' });
  }
  return showPageState({
    title: 'Something went wrong',
    message: message || "This page couldn't load. Check your connection and try again.",
    actions: [{ label: 'Try again', onClick: () => window.location.reload(), primary: true }],
    container
  });
}

// ---------------------------------------------------------------------------
// data-action delegation (replaces inline onclick)
// ---------------------------------------------------------------------------

/**
 * One delegated listener for every [data-action] element under root.
 *   <button data-action="save" data-id="42">Save</button>
 *   bindActions({ save(el, event) { saveGame(el.dataset.id); } });
 * Unknown actions are ignored. Returns a function that removes the listeners.
 * @param {Record<string, (el: HTMLElement, event: Event) => any>} handlers
 * @param {{ root?: Element|Document, events?: string[] }} [options]
 */
export function bindActions(handlers, { root = document, events = ['click'] } = {}) {
  const listener = (event) => {
    const el = event.target.closest?.('[data-action]');
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action];
    if (!handler) return;
    if (event.type === 'click' && el.tagName === 'A' && el.getAttribute('href') === '#') event.preventDefault();
    try {
      const result = handler(el, event);
      if (result && typeof result.catch === 'function') result.catch((err) => handleActionError(err));
    } catch (err) {
      handleActionError(err);
    }
  };
  events.forEach((type) => root.addEventListener(type, listener));
  return () => events.forEach((type) => root.removeEventListener(type, listener));
}

function handleActionError(err) {
  console.error('[app] action failed', err);
  showToast(err?.userMessage || 'That didn\u2019t work. Please try again.', 'error');
  reportError({ message: err?.message || String(err), stack: err?.stack, kind: 'action' });
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

// Set data-theme before anything paints, matching theme-toggle.js's choice
// (saved preference, else the system setting). theme-toggle.js then takes over.
function applySavedTheme() {
  let theme = null;
  try { theme = localStorage.getItem('aces-theme'); } catch { /* ignore */ }
  if (!theme) theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

/** Add a classic <script> once (by resolved URL, or when isLoaded() says it's there). */
export function loadScriptOnce(path, isLoaded) {
  const src = siteUrl(path);
  if (isLoaded?.()) return Promise.resolve();
  const existing = [...document.scripts].find((s) => s.src === src);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${path}`));
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------------

let offlineInstalled = false;

function installOfflineBanner() {
  if (offlineInstalled) return;
  offlineInstalled = true;
  ensureStateStyles();
  let banner = null;
  const show = () => {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'aces-offline';
    banner.setAttribute('role', 'status');
    banner.textContent = 'You\u2019re offline. Showing saved data.';
    document.body.appendChild(banner);
  };
  const hide = (announce) => {
    if (!banner) return;
    banner.remove();
    banner = null;
    if (announce) showToast('Back online', 'success', { duration: 2500 });
  };
  window.addEventListener('offline', show);
  window.addEventListener('online', () => hide(true));
  if (navigator.onLine === false) show();
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

let boundaryInstalled = false;
let reportsSent = 0;
const reported = new Set();

function installErrorBoundary() {
  if (boundaryInstalled) return;
  boundaryInstalled = true;

  window.addEventListener('error', (event) => {
    // "Script error." with no detail comes from cross-origin scripts and extensions.
    if (!event.error && (!event.message || event.message === 'Script error.')) return;
    reportError({
      message: event.message || event.error?.message,
      stack: event.error?.stack,
      source: event.filename,
      line: event.lineno,
      col: event.colno,
      kind: 'error'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError({ message: reason?.message || String(reason), stack: reason?.stack, kind: 'rejection' });
  });
}

/**
 * Record an error. Always deduped and capped per page; written to
 * clientErrors only when REPORT_CLIENT_ERRORS is on.
 */
export function reportError({ message, stack, source, line, col, kind = 'error' } = {}) {
  const key = `${kind}:${message}`;
  if (reported.has(key) || reportsSent >= MAX_REPORTS_PER_PAGE) return;
  reported.add(key);
  reportsSent++;
  if (!REPORT_CLIENT_ERRORS || !navigator.onLine) return;
  addDoc(collection(db, 'clientErrors'), {
    kind,
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').slice(0, 2000),
    source: source || null,
    line: line ?? null,
    col: col ?? null,
    page: window.location.pathname + window.location.search,
    host: window.location.host,
    live: IS_LIVE,
    uid: getCurrentUser()?.uid || null,
    userAgent: navigator.userAgent.slice(0, 300),
    at: serverTimestamp()
  }).catch(() => { /* never let reporting throw */ });
}
