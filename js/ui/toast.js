// js/ui/toast.js
// The one notification component. Replaces the 26 per-page showToast copies,
// plus showAlert / showMessage where they were used for transient messages.
//
//   import { showToast, toast } from './js/ui/toast.js';
//   showToast('Lineup saved');                     // success, 4 s
//   showToast('Could not save', 'error');          // errors stay 6 s
//   toast.info('New version available', { action: { label: 'Refresh', onClick: () => location.reload() } });
//   toast.error('Offline', { duration: 0 });       // 0 = stays until dismissed
//
// Same call shape as the old showToast(message, type), so moving a page over is
// mostly deleting its local copy. Messages are set with textContent, so user
// text is safe to pass. Styles inject once and read the theme variables with
// fallbacks, so toasts work before css/tokens.css lands. A fixed bottom bar can
// lift them clear by setting --toast-offset on :root.

const TYPES = ['success', 'error', 'warning', 'info'];
const DEFAULT_DURATION = { success: 4000, info: 4000, warning: 5000, error: 6000 };
const MAX_VISIBLE = 3;

// Inline SVG paths (24x24, stroke). Moves to the icons.svg sprite later.
const ICONS = {
  success: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  error: '<path d="M6 6l12 12M18 6L6 18"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>'
};

const CSS = `
.aces-toasts{position:fixed;left:50%;bottom:calc(var(--toast-offset,16px) + env(safe-area-inset-bottom,0px));transform:translateX(-50%);
  z-index:10000;display:flex;flex-direction:column-reverse;gap:8px;width:min(420px,calc(100vw - 32px));pointer-events:none}
.aces-toast{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-radius:8px;
  background:var(--card-bg,#fff);color:var(--text-dark,#1f2937);border:1px solid var(--border-color,#e2e8f0);
  border-left:4px solid var(--aces-toast-accent);box-shadow:var(--shadow-md,0 4px 16px rgba(0,0,0,.12));
  font:500 14px/1.4 Inter,system-ui,-apple-system,sans-serif;pointer-events:auto;
  opacity:0;transform:translateY(8px);transition:opacity 150ms ease,transform 150ms ease}
.aces-toast.is-in{opacity:1;transform:none}
.aces-toast-success{--aces-toast-accent:#2d5016}
.aces-toast-error{--aces-toast-accent:#b91c1c}
.aces-toast-warning{--aces-toast-accent:#b45309}
.aces-toast-info{--aces-toast-accent:#1d4ed8}
[data-theme="dark"] .aces-toast-success{--aces-toast-accent:#4a9d3f}
[data-theme="dark"] .aces-toast-error{--aces-toast-accent:#f87171}
[data-theme="dark"] .aces-toast-warning{--aces-toast-accent:#fbbf24}
[data-theme="dark"] .aces-toast-info{--aces-toast-accent:#60a5fa}
.aces-toast-icon{flex:none;width:20px;height:20px;fill:none;stroke:var(--aces-toast-accent);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.aces-toast-msg{flex:1;min-width:0;overflow-wrap:anywhere}
.aces-toast-action,.aces-toast-close{flex:none;border:0;background:none;color:inherit;cursor:pointer;font:inherit;
  min-height:32px;border-radius:6px}
.aces-toast-action{padding:0 10px;font-weight:700;color:var(--aces-toast-accent)}
.aces-toast-close{width:32px;padding:0;font-size:20px;line-height:1;opacity:.55}
.aces-toast-action:hover,.aces-toast-close:hover{background:var(--hover-bg,rgba(0,0,0,.05));opacity:1}
.aces-toast-action:focus-visible,.aces-toast-close:focus-visible{outline:2px solid var(--aces-toast-accent);outline-offset:1px}
@media (prefers-reduced-motion:reduce){.aces-toast{transition:none}}
`;

let container = null;

function ensureContainer() {
  if (container?.isConnected) return container;
  if (!document.getElementById('aces-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'aces-toast-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  container = document.createElement('div');
  container.className = 'aces-toasts';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);
  return container;
}

function dismiss(el) {
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  clearTimeout(el._timer);
  el.classList.remove('is-in');
  setTimeout(() => el.remove(), 160);
}

/**
 * Show a toast.
 * @param {string} message  Plain text (not HTML).
 * @param {'success'|'error'|'warning'|'info'} [type='success']
 * @param {object} [options]
 * @param {number} [options.duration]  ms before it hides; 0 keeps it until dismissed.
 * @param {{label: string, onClick: Function}} [options.action]  One button, such as Undo or Refresh.
 * @returns {{ dismiss: Function, element: HTMLElement }}
 */
export function showToast(message, type = 'success', options = {}) {
  // Allow showToast(message, { type, ... })
  if (type && typeof type === 'object') { options = type; type = options.type || 'success'; }
  if (!TYPES.includes(type)) type = 'info';

  const host = ensureContainer();
  const el = document.createElement('div');
  el.className = `aces-toast aces-toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  el.innerHTML = `<svg class="aces-toast-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[type]}</svg>`
    + '<span class="aces-toast-msg"></span>';
  el.querySelector('.aces-toast-msg').textContent = String(message ?? '');

  if (options.action?.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aces-toast-action';
    btn.textContent = options.action.label;
    btn.addEventListener('click', () => {
      try { options.action.onClick?.(); } finally { dismiss(el); }
    });
    el.appendChild(btn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'aces-toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u00d7';
  close.addEventListener('click', () => dismiss(el));
  el.appendChild(close);

  // Drop the oldest when too many stack up.
  const live = [...host.children].filter((c) => !c.dataset.leaving);
  live.slice(0, Math.max(0, live.length - MAX_VISIBLE + 1)).forEach(dismiss);

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  const duration = options.duration ?? DEFAULT_DURATION[type];
  const startTimer = () => {
    if (duration > 0) el._timer = setTimeout(() => dismiss(el), duration);
  };
  // Pause while hovered or focused, so an action button can be reached.
  el.addEventListener('mouseenter', () => clearTimeout(el._timer));
  el.addEventListener('mouseleave', startTimer);
  el.addEventListener('focusin', () => clearTimeout(el._timer));
  el.addEventListener('focusout', startTimer);
  startTimer();

  return { dismiss: () => dismiss(el), element: el };
}

/** Remove every toast on screen. */
export function clearToasts() {
  if (container) [...container.children].forEach(dismiss);
}

export const toast = {
  show: showToast,
  success: (message, options) => showToast(message, 'success', options),
  error: (message, options) => showToast(message, 'error', options),
  warning: (message, options) => showToast(message, 'warning', options),
  info: (message, options) => showToast(message, 'info', options),
  clear: clearToasts
};

export default showToast;
