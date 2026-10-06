// js/ui/modal.js
// The one dialog component, built on the native <dialog> element (focus
// trapping, Esc and the backdrop come from the browser). Replaces per-page
// showAlert / custom confirm overlays and the blocking alert()/confirm().
//
//   import { confirmModal, alertModal, promptModal, openModal } from './js/ui/modal.js';
//
//   if (await confirmModal('Delete this game?', { danger: true, confirmLabel: 'Delete' })) { ... }
//   await alertModal('Stats submitted.');
//   const note = await promptModal('Reason for the change', { placeholder: 'Optional' });
//
//   const choice = await openModal({
//     title: 'Who scored?',
//     body: someElement,                         // a Node, or plain text
//     actions: [
//       { label: 'Cancel', value: null },
//       { label: 'Save', value: 'save', variant: 'primary' }
//     ]
//   });
//
// Every function returns a promise that settles when the dialog closes.
// Text options (title, message, labels) are set with textContent; only the
// `html` option inserts markup, so keep user text out of it.

const CSS = `
.aces-modal{border:0;padding:0;border-radius:12px;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 48px);
  background:var(--card-bg,#fff);color:var(--text-dark,#1f2937);box-shadow:var(--shadow-lg,0 12px 32px rgba(0,0,0,.2));
  font:400 15px/1.5 Inter,system-ui,-apple-system,sans-serif}
.aces-modal.is-wide{width:min(720px,calc(100vw - 32px))}
.aces-modal::backdrop{background:rgba(15,23,42,.55)}
.aces-modal[open]{animation:aces-modal-in 150ms ease}
@keyframes aces-modal-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.aces-modal-inner{display:flex;flex-direction:column;max-height:inherit}
.aces-modal-head{display:flex;align-items:center;gap:8px;padding:16px 16px 0 20px}
.aces-modal-title{flex:1;margin:0;font-size:18px;font-weight:700;line-height:1.3}
.aces-modal-x{flex:none;width:44px;height:44px;margin:-6px -6px -6px 0;border:0;border-radius:8px;background:none;color:inherit;
  font-size:24px;line-height:1;cursor:pointer;opacity:.6}
.aces-modal-x:hover{opacity:1;background:var(--hover-bg,rgba(0,0,0,.05))}
.aces-modal-body{padding:12px 20px 4px;overflow:auto;overflow-wrap:anywhere}
.aces-modal-body p{margin:0 0 8px}
.aces-modal-input{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:10px 12px;min-height:44px;
  border:1px solid var(--input-border,#cbd5e1);border-radius:8px;background:var(--input-bg,#fff);color:inherit;font:inherit}
.aces-modal-input:focus{outline:2px solid var(--primary-color,#2d5016);outline-offset:0;border-color:transparent}
.aces-modal-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:16px 20px 20px}
.aces-modal-btn{min-height:44px;min-width:88px;padding:0 16px;border-radius:8px;border:1px solid var(--border-color,#cbd5e1);
  background:var(--card-bg,#fff);color:inherit;font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer}
.aces-modal-btn:hover{background:var(--hover-bg,#f1f5f9)}
.aces-modal-btn.is-primary{background:var(--primary-color,#2d5016);border-color:transparent;color:#fff}
.aces-modal-btn.is-danger{background:#b91c1c;border-color:transparent;color:#fff}
.aces-modal-btn.is-primary:hover,.aces-modal-btn.is-danger:hover{filter:brightness(1.1)}
.aces-modal-btn:focus-visible,.aces-modal-x:focus-visible{outline:2px solid var(--primary-color,#2d5016);outline-offset:2px}
@media (max-width:480px){.aces-modal-actions{flex-direction:column-reverse}.aces-modal-btn{width:100%}}
@media (prefers-reduced-motion:reduce){.aces-modal[open]{animation:none}}
`;

function ensureStyles() {
  if (document.getElementById('aces-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'aces-modal-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

let openCount = 0;
let savedOverflow = '';

function lockScroll() {
  if (openCount++ === 0) {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
}

function unlockScroll() {
  if (--openCount === 0) document.documentElement.style.overflow = savedOverflow;
}

/**
 * Open a dialog and wait for it to close.
 * @param {object} options
 * @param {string} [options.title]
 * @param {string|Node} [options.body]   Plain text (split into paragraphs on blank lines) or a DOM node.
 * @param {string} [options.html]        Trusted markup for the body. Never user text.
 * @param {Array<{label: string, value?: any, variant?: 'primary'|'danger'|'secondary', autofocus?: boolean}>} [options.actions]
 * @param {boolean} [options.dismissible=true]  Esc, the X and a backdrop tap close it with dismissValue.
 * @param {any} [options.dismissValue=null]
 * @param {boolean} [options.wide=false]
 * @param {(dialog: HTMLDialogElement) => void} [options.onOpen]  Called once it is in the page.
 * @param {(value: any, dialog: HTMLDialogElement) => boolean|void} [options.beforeClose]
 *        Return false to keep it open (for example, to validate a form).
 * @returns {Promise<any>} The clicked action's value, or dismissValue.
 */
export function openModal(options = {}) {
  const {
    title = '',
    body,
    html,
    actions = [{ label: 'OK', value: true, variant: 'primary' }],
    dismissible = true,
    dismissValue = null,
    wide = false,
    onOpen,
    beforeClose
  } = options;

  ensureStyles();
  const opener = document.activeElement;

  const dialog = document.createElement('dialog');
  dialog.className = 'aces-modal' + (wide ? ' is-wide' : '');
  const titleId = `aces-modal-title-${Date.now().toString(36)}`;
  if (title) dialog.setAttribute('aria-labelledby', titleId);

  const inner = document.createElement('div');
  inner.className = 'aces-modal-inner';
  dialog.appendChild(inner);

  if (title || dismissible) {
    const head = document.createElement('div');
    head.className = 'aces-modal-head';
    const h = document.createElement('h2');
    h.className = 'aces-modal-title';
    h.id = titleId;
    h.textContent = title;
    head.appendChild(h);
    if (dismissible) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'aces-modal-x';
      x.setAttribute('aria-label', 'Close');
      x.textContent = '\u00d7';
      x.addEventListener('click', () => finish(dismissValue, true));
      head.appendChild(x);
    }
    inner.appendChild(head);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'aces-modal-body';
  if (html != null) {
    bodyEl.innerHTML = html;
  } else if (body instanceof Node) {
    bodyEl.appendChild(body);
  } else if (body != null && body !== '') {
    String(body).split(/\n{2,}/).forEach((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      bodyEl.appendChild(p);
    });
  }
  inner.appendChild(bodyEl);

  let autofocusBtn = null;
  if (actions.length) {
    const bar = document.createElement('div');
    bar.className = 'aces-modal-actions';
    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aces-modal-btn' + (action.variant === 'primary' ? ' is-primary' : action.variant === 'danger' ? ' is-danger' : '');
      btn.textContent = action.label;
      btn.addEventListener('click', () => finish('value' in action ? action.value : action.label));
      if (action.autofocus) autofocusBtn = btn;
      bar.appendChild(btn);
    });
    inner.appendChild(bar);
  }

  let resolvePromise;
  let done = false;
  const result = new Promise((resolve) => { resolvePromise = resolve; });

  function finish(value, dismissed = false) {
    if (done) return;
    if (!dismissed && beforeClose && beforeClose(value, dialog) === false) return;
    done = true;
    dialog.close();
    dialog.remove();
    unlockScroll();
    if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus();
    resolvePromise(value);
  }

  // Esc fires 'cancel'. Block it when the dialog must be answered.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (dismissible) finish(dismissValue, true);
  });

  // A tap on the backdrop lands on the <dialog> itself, outside the inner box.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && dismissible) finish(dismissValue, true);
  });

  document.body.appendChild(dialog);
  lockScroll();
  dialog.showModal();

  // Focus: an explicit autofocus action, else the first input, else the primary button.
  const firstInput = bodyEl.querySelector('input, select, textarea');
  const primary = inner.querySelector('.aces-modal-btn.is-primary, .aces-modal-btn.is-danger');
  (autofocusBtn || firstInput || primary || inner.querySelector('.aces-modal-btn'))?.focus();

  onOpen?.(dialog);
  return result;
}

/**
 * Message with one OK button. Resolves when closed.
 */
export async function alertModal(message, { title = '', okLabel = 'OK' } = {}) {
  await openModal({
    title,
    body: message,
    actions: [{ label: okLabel, value: true, variant: 'primary' }],
    dismissValue: true
  });
}

/**
 * Yes/no question. Resolves true for confirm, false for cancel or dismiss.
 * danger: true styles the confirm button red, for deletes and other
 * changes that cannot be undone.
 */
export async function confirmModal(message, {
  title = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false
} = {}) {
  const value = await openModal({
    title,
    body: message,
    actions: [
      { label: cancelLabel, value: false, autofocus: danger },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' }
    ],
    dismissValue: false
  });
  return value === true;
}

/**
 * Ask for one line of text. Resolves the trimmed string, or null on cancel.
 */
export async function promptModal(message, {
  title = '',
  defaultValue = '',
  placeholder = '',
  inputType = 'text',
  required = false,
  okLabel = 'OK',
  cancelLabel = 'Cancel'
} = {}) {
  const wrap = document.createElement('div');
  if (message) {
    const label = document.createElement('label');
    label.textContent = message;
    label.htmlFor = 'aces-modal-input';
    wrap.appendChild(label);
  }
  const input = document.createElement('input');
  input.id = 'aces-modal-input';
  input.className = 'aces-modal-input';
  input.type = inputType;
  input.value = defaultValue;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  wrap.appendChild(input);

  const OK = Symbol('ok');
  const value = await openModal({
    title,
    body: wrap,
    actions: [
      { label: cancelLabel, value: null },
      { label: okLabel, value: OK, variant: 'primary' }
    ],
    beforeClose: (v) => {
      if (v === OK && required && !input.value.trim()) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return false;
      }
      return true;
    },
    onOpen: () => {
      input.select();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.closest('dialog')?.querySelector('.aces-modal-btn.is-primary')?.click();
        }
      });
    }
  });
  return value === OK ? input.value.trim() : null;
}

export const modal = { open: openModal, alert: alertModal, confirm: confirmModal, prompt: promptModal };
export default modal;
