// js/pages/me-account.js
// me.html#account: sign-in details, password, help links and sign out.
// Replaced the Settings tab of profile.html and the Account tab of
// profile-fan.html. (Their Default Stats View, Default Season and public
// favorites switches weren't read by any page, so they were left behind.)

import { signOutUser } from '../core/auth.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

let ctx = null;     // { canWrite, viewingAs, profile, user }
let host = null;

function method() {
  if (ctx.viewingAs) {
    const p = ctx.profile;
    return p.registrationMethod === 'google' || String(p.photoURL || '').includes('googleusercontent') ? 'google' : 'password';
  }
  const ids = (ctx.user?.providerData || []).map(p => p.providerId);
  return ids.includes('password') ? 'password' : ids.includes('google.com') ? 'google' : 'other';
}

function render() {
  const how = method();
  const email = ctx.viewingAs ? ctx.profile.email : ctx.user?.email;
  host.innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('id-card')} Sign-in</h2></div>
      <dl class="me-dl">
        <div><dt>Email</dt><dd>${esc(email || 'Unknown')}</dd></div>
        <div><dt>Signs in with</dt><dd>${how === 'google' ? 'Google' : how === 'password' ? 'Email and password' : 'Other'}</dd></div>
      </dl>
    </section>

    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('lock')} Password</h2></div>
      ${how === 'password'
        ? (ctx.canWrite ? `<form class="me-form" data-form="password">
            <label class="aces-field"><span class="aces-label">Current password</span><input class="aces-input" type="password" name="current" autocomplete="current-password" required></label>
            <div class="me-form-grid">
              <label class="aces-field"><span class="aces-label">New password</span><input class="aces-input" type="password" name="next" autocomplete="new-password" minlength="6" required></label>
              <label class="aces-field"><span class="aces-label">Confirm new password</span><input class="aces-input" type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>
            </div>
            <p class="aces-hint">At least 6 characters.</p>
            <div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Change password</button>
              <a class="aces-btn is-ghost is-sm" href="reset-password.html">Forgot it?</a></div>
          </form>` : '<p class="me-help">Password changes are off while viewing as someone else.</p>')
        : `<p class="me-help">You sign in with Google, so your password and security settings live in your Google account.</p>
           <a class="aces-btn is-sm" href="https://myaccount.google.com/security" target="_blank" rel="noopener">${icon('external-link')} Google account security</a>`}
    </section>

    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('help')} Help</h2></div>
      <ul class="me-links">
        <li><a href="help.html">${icon('book')}<span><strong>Help center</strong><span>Guides for every part of the site</span></span></a></li>
        <li><a href="aces-features-guide.html">${icon('sparkles')}<span><strong>What you can do</strong><span>A tour of the features</span></span></a></li>
        <li><a href="profile-setup-guide.html">${icon('clipboard-check')}<span><strong>Setup checklist</strong><span>Link your player, turn on notifications</span></span></a></li>
      </ul>
    </section>

    ${ctx.viewingAs ? '' : `<section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('log-out')} Sign out</h2></div>
      <p class="me-help">Signs you out on this device only.</p>
      <button type="button" class="aces-btn is-sm" data-signout>Sign out</button>
    </section>`}`;
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form="password"]');
  if (!form || !ctx.canWrite) return;
  e.preventDefault();
  const f = form.elements;
  if (f.next.value !== f.confirm.value) return showToast("The new passwords don't match.", 'info');
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const { changeUserPassword } = await import('../core/account.js');
    const res = await changeUserPassword(f.current.value, f.next.value);
    if (res?.success) {
      form.reset();
      showToast('Password changed.', 'success');
    } else {
      showToast(res?.message || 'Could not change the password.', 'error');
    }
  } catch (err) {
    console.error('[me] password change failed', err);
    showToast('Could not change the password.', 'error');
  }
  btn.disabled = false;
}

/**
 * @param {HTMLElement} el
 * @param {{ canWrite: boolean, viewingAs: boolean, profile: object, user: object }} o
 */
export function mountAccount(el, o) {
  ctx = o;
  host = el;
  render();
  host.addEventListener('submit', onSubmit);
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-signout]')) signOutUser({ redirectTo: 'index.html' });
  });
}
