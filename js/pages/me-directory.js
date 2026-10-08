// js/pages/me-directory.js
// me.html#directory: your listing in the Aces Directory (aces-directory.html).
// Replaced the Directory tab of profile.html and profile-fan.html. Same
// users/{uid} fields: directoryOptIn, directoryPhone, directoryOccupation,
// directorySkills (cleared when you opt out, as before).

import { db, doc, updateDoc, serverTimestamp } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

let ctx = null;   // { uid, canWrite, profile }
let host = null;

function render() {
  const p = ctx.profile;
  const on = p.directoryOptIn === true;
  const dis = ctx.canWrite ? '' : ' disabled';
  host.innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head">
        <h2 class="aces-card-title">${icon('id-card')} Your directory listing</h2>
        <a class="aces-section-link" href="aces-directory.html">Open the directory</a>
      </div>
      <p class="me-help">The Aces Directory lets members find each other for work, skills and favors. Only signed-in members can see it, and you can change or remove your listing any time.</p>
      <form class="me-form" data-form="directory">
        <label class="me-switch">
          <span class="me-switch-text"><strong>List me in the directory</strong><span>Show my name, phone and the details below to other members</span></span>
          <input type="checkbox" name="optIn"${on ? ' checked' : ''}${dis}>
          <span class="me-switch-track" aria-hidden="true"></span>
        </label>
        <div class="me-dir-fields"${on ? '' : ' hidden'}>
          <div class="me-form-grid">
            <label class="aces-field"><span class="aces-label">Phone</span>
              <input class="aces-input" type="tel" name="phone" value="${esc(p.directoryPhone || '')}" placeholder="(555) 123-4567" autocomplete="tel"${dis}></label>
            <label class="aces-field"><span class="aces-label">Occupation (optional)</span>
              <input class="aces-input" name="occupation" value="${esc(p.directoryOccupation || '')}" placeholder="Teacher, electrician, owns a bakery..." maxlength="100"${dis}></label>
          </div>
          <label class="aces-field"><span class="aces-label">Skills and interests (optional)</span>
            <textarea class="aces-input me-textarea" name="skills" rows="3" maxlength="200" placeholder="Photography, carpentry, web design..."${dis}>${esc(p.directorySkills || '')}</textarea></label>
          <p class="aces-hint">Up to 200 characters.</p>
        </div>
        ${ctx.canWrite ? '<div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Save listing</button></div>' : ''}
      </form>
    </section>`;
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form="directory"]');
  if (!form || !ctx.canWrite) return;
  e.preventDefault();
  const f = form.elements;
  const optIn = f.optIn.checked;
  const updates = {
    directoryOptIn: optIn,
    directoryPhone: optIn ? f.phone.value.trim() : '',
    directoryOccupation: optIn ? f.occupation.value.trim() : '',
    directorySkills: optIn ? f.skills.value.trim() : ''
  };
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await updateDoc(doc(db, 'users', ctx.uid), { ...updates, updatedAt: serverTimestamp() });
    Object.assign(ctx.profile, updates);
    showToast(optIn ? 'Your listing is saved.' : "You're out of the directory.", 'success');
    render();
  } catch (err) {
    console.error('[me] directory save failed', err);
    showToast('Could not save. Try again.', 'error');
    btn.disabled = false;
  }
}

/**
 * @param {HTMLElement} el
 * @param {{ uid: string, canWrite: boolean, profile: object }} o
 */
export function mountDirectory(el, o) {
  ctx = o;
  host = el;
  render();
  host.addEventListener('submit', onSubmit);
  host.addEventListener('change', (e) => {
    if (e.target.name === 'optIn') host.querySelector('.me-dir-fields').hidden = !e.target.checked;
  });
}
