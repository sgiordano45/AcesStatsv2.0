// js/pages/me-profile.js
// me.html#profile: photo, display name, player link and player details.
// Replaced the header and Player Info tab of profile.html (profile-fan.html's
// display name too). Same users/{uid} fields as before:
//   preferredDisplayName, profilePhotoURL / profilePhotoStoragePath,
//   nickname, number, bats (R/L/S), throws (R/L), position (P, C, 1B ... UTL),
//   secondaryPositions. Player details are also copied to the legacy
//   users/{mergedFromProfile} doc, as profile.html did.

import { db, doc, getDoc, updateDoc, serverTimestamp } from '../core/firebase.js';
import { hasRole, USER_ROLES } from '../core/auth.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, formatPlayerName } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const POSITIONS = [['P', 'Pitcher'], ['C', 'Catcher'], ['1B', 'First base'], ['2B', 'Second base'], ['3B', 'Third base'],
  ['SS', 'Shortstop'], ['IF', 'Infield'], ['LF', 'Left field'], ['CF', 'Center field'], ['RF', 'Right field'], ['OF', 'Outfield'], ['UTL', 'Utility']];
const POS_ALIASES = { PITCHER: 'P', CATCHER: 'C', UTILITY: 'UTL' };

let ctx = null;     // { uid, canWrite, profile, user, player, team }
let host = null;
let merged = null;  // users/{mergedFromProfile}: older player details

const val = (k) => ctx.profile[k] || merged?.[k] || '';
const code = (v) => { const u = String(v || '').toUpperCase(); return POS_ALIASES[u] || u; };

function photoUrl() {
  const p = ctx.profile;
  if (p.profilePhotoURL) return p.profilePhotoURL;
  if (ctx.viewingAs) return p.photoURL || '';
  return ctx.user?.photoURL || p.photoURL || '';
}

function displayName() {
  const p = ctx.profile;
  return p.preferredDisplayName || p.displayName || (ctx.viewingAs ? '' : ctx.user?.displayName) || p.email || 'You';
}

function memberSince() {
  const c = ctx.profile.createdAt;
  const d = c?.toDate ? c.toDate() : c ? new Date(c) : (!ctx.viewingAs && ctx.user?.metadata?.creationTime ? new Date(ctx.user.metadata.creationTime) : null);
  return d && !Number.isNaN(d.getTime()) ? d.getFullYear() : null;
}

function aceSince() {
  const years = Object.keys(ctx.player?.seasons || {}).map(k => parseInt(k, 10)).filter(Number.isFinite);
  return years.length ? Math.min(...years) : null;
}

function roleBadges() {
  const p = ctx.profile;
  const out = [];
  if (hasRole(p, 'admin')) out.push('Admin');
  else if (hasRole(p, 'league-staff')) out.push('League staff');
  const teamRoles = Object.entries(p.teamRoles || {}).filter(([, r]) => r?.status === 'active');
  for (const [team, r] of teamRoles) out.push(`${r.role === USER_ROLES.CAPTAIN ? 'Captain' : 'Team staff'}, ${team.charAt(0).toUpperCase()}${team.slice(1)}`);
  if (!teamRoles.length && p.isCaptain === true) out.push('Captain');
  return out;
}

const isFan = () => [USER_ROLES.FAN, USER_ROLES.FAMILY].includes(ctx.profile.userRole) && !ctx.profile.linkedPlayer;

function render() {
  const p = ctx.profile;
  const name = displayName();
  const photo = photoUrl();
  const team = ctx.team;
  const k = team.toLowerCase();
  const since = memberSince();
  const ace = aceSince();
  const google = ctx.viewingAs ? '' : (ctx.user?.displayName || '');
  const dis = ctx.canWrite ? '' : ' disabled';
  const opt = (value, label, current) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;

  host.innerHTML = `
    <section class="aces-card me-who">
      <div class="me-photo">
        ${photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="me-photo-initial" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>`}
        ${ctx.canWrite ? `<label class="aces-btn is-sm me-photo-btn">${icon('camera')}<span>Change</span><input type="file" accept="image/*" data-photo hidden></label>` : ''}
      </div>
      <div class="me-who-text">
        <h2 class="me-who-name">${esc(name)}</h2>
        <p class="me-who-line">
          ${p.linkedPlayer || ctx.player ? `${icon('user-check')} <a href="${ctx.player ? `player.html?id=${encodeURIComponent(ctx.player.id)}` : '#'}">${esc(formatPlayerName(ctx.player?.name || p.linkedPlayer))}</a>` : `${icon('link')} <a href="link-player.html">Link your player record</a>`}
          ${team ? `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?team=${encodeURIComponent(team)}"><span class="aces-team-dot"></span>${esc(team)}</a>` : ''}
        </p>
        <div class="aces-cluster me-badges">
          ${ace ? `<span class="aces-badge is-outline">Ace since ${ace}</span>` : ''}
          ${since ? `<span class="aces-badge is-outline">Member since ${since}</span>` : ''}
          ${roleBadges().map(r => `<span class="aces-badge is-brand">${esc(r)}</span>`).join('')}
        </div>
        ${p.profilePhotoURL && ctx.canWrite && ctx.user?.photoURL ? '<button type="button" class="aces-btn is-ghost is-sm" data-google-photo>Use my Google photo</button>' : ''}
      </div>
    </section>

    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('user')} Display name</h2></div>
      <form class="me-form" data-form="name">
        <label class="aces-field"><span class="aces-label">How your name shows around the site</span>
          <input class="aces-input" name="preferredDisplayName" value="${esc(p.preferredDisplayName || '')}" placeholder="${esc(google || 'e.g. Steve instead of Stephen')}" maxlength="40"${dis}>
        </label>
        ${google ? `<p class="aces-hint">Leave it blank to use your Google name, ${esc(google)}.</p>` : ''}
        ${ctx.canWrite ? '<div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Save</button></div>' : ''}
      </form>
    </section>

    ${isFan() ? '' : `<section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('bat')} Player details</h2></div>
      <form class="me-form" data-form="player">
        <div class="me-form-grid">
          <label class="aces-field"><span class="aces-label">Nickname</span><input class="aces-input" name="nickname" value="${esc(val('nickname'))}" maxlength="30"${dis}></label>
          <label class="aces-field"><span class="aces-label">Jersey number(s)</span><input class="aces-input" name="number" value="${esc(val('number'))}" placeholder="e.g. 24" maxlength="12"${dis}></label>
          <label class="aces-field"><span class="aces-label">Bats</span><span class="aces-select-wrap"><select class="aces-select" name="bats"${dis}>
            ${opt('', 'Choose', code(val('bats')))}${opt('R', 'Right', code(val('bats')))}${opt('L', 'Left', code(val('bats')))}${opt('S', 'Switch', code(val('bats')))}</select></span></label>
          <label class="aces-field"><span class="aces-label">Throws</span><span class="aces-select-wrap"><select class="aces-select" name="throws"${dis}>
            ${opt('', 'Choose', code(val('throws')))}${opt('R', 'Right', code(val('throws')))}${opt('L', 'Left', code(val('throws')))}</select></span></label>
          <label class="aces-field"><span class="aces-label">Primary position</span><span class="aces-select-wrap"><select class="aces-select" name="position"${dis}>
            ${opt('', 'Choose', code(val('position')))}${POSITIONS.map(([c, l]) => opt(c, l, code(val('position')))).join('')}</select></span></label>
          <label class="aces-field"><span class="aces-label">Other positions</span><input class="aces-input" name="secondaryPositions" value="${esc(p.secondaryPositions || '')}" placeholder="e.g. 2B, SS, OF" maxlength="40"${dis}></label>
        </div>
        ${ctx.canWrite ? '<div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Save details</button></div>' : ''}
      </form>
    </section>`}`;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

async function save(updates, { alsoMerged = false } = {}) {
  await updateDoc(doc(db, 'users', ctx.uid), { ...updates, updatedAt: serverTimestamp() });
  Object.assign(ctx.profile, updates);
  if (alsoMerged && ctx.profile.mergedFromProfile) {
    // The legacy player doc still feeds some older pages; keep it in step.
    try {
      await updateDoc(doc(db, 'users', ctx.profile.mergedFromProfile), { ...updates, updatedAt: serverTimestamp() });
    } catch (err) {
      console.warn('[me] legacy player doc not updated', err);
    }
  }
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form || !ctx.canWrite) return;
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (form.dataset.form === 'name') {
      const v = form.elements.preferredDisplayName.value.trim();
      await save({ preferredDisplayName: v || null });
      showToast(v ? 'Display name saved.' : 'Using your Google name.', 'success');
    } else {
      const f = form.elements;
      await save({
        nickname: f.nickname.value.trim(),
        number: f.number.value.trim(),
        bats: f.bats.value,
        throws: f.throws.value,
        position: f.position.value,
        secondaryPositions: f.secondaryPositions.value.trim()
      }, { alsoMerged: true });
      showToast('Player details saved.', 'success');
    }
    render();
  } catch (err) {
    console.error('[me] profile save failed', err);
    showToast('Could not save. Try again.', 'error');
    btn.disabled = false;
  }
}

async function onPhoto(file) {
  if (!file || !ctx.canWrite) return;
  if (!file.type.startsWith('image/')) return showToast('Choose an image file.', 'info');
  if (file.size > 5 * 1024 * 1024) return showToast('Photos need to be under 5 MB.', 'info');
  showToast('Uploading photo...', 'info');
  try {
    const { uploadProfilePhoto, deleteOldProfilePhoto } = await import('../../firebase-storage.js');
    const res = await uploadProfilePhoto(file, ctx.uid);
    const old = ctx.profile.profilePhotoStoragePath;
    await save({ profilePhotoURL: res.downloadURL, profilePhotoStoragePath: res.storagePath, profilePhotoUpdatedAt: new Date() });
    if (old) deleteOldProfilePhoto(old).catch(err => console.warn('[me] old photo not deleted', err));
    render();
    showToast('Photo updated.', 'success');
  } catch (err) {
    console.error('[me] photo upload failed', err);
    showToast(err?.message || 'Could not upload the photo.', 'error');
  }
}

async function useGooglePhoto() {
  try {
    const old = ctx.profile.profilePhotoStoragePath;
    await save({ profilePhotoURL: null, profilePhotoStoragePath: null, profilePhotoUpdatedAt: new Date() });
    if (old) {
      const { deleteOldProfilePhoto } = await import('../../firebase-storage.js');
      deleteOldProfilePhoto(old).catch(err => console.warn('[me] old photo not deleted', err));
    }
    render();
    showToast('Using your Google photo.', 'success');
  } catch (err) {
    console.error('[me] photo switch failed', err);
    showToast('Could not switch photos.', 'error');
  }
}

/**
 * @param {HTMLElement} el
 * @param {{ uid, canWrite, viewingAs, profile, user, player, team }} o
 */
export async function mountProfile(el, o) {
  ctx = o;
  host = el;
  if (o.profile.mergedFromProfile && o.profile.mergedFromProfile !== o.uid) {
    try {
      const snap = await getDoc(doc(db, 'users', o.profile.mergedFromProfile));
      merged = snap.exists() ? snap.data() : null;
    } catch {
      merged = null;
    }
  }
  render();
  host.addEventListener('submit', onSubmit);
  host.addEventListener('change', (e) => { if (e.target.matches('[data-photo]')) onPhoto(e.target.files?.[0]); });
  host.addEventListener('click', (e) => { if (e.target.closest('[data-google-photo]')) useGooglePhoto(); });
}
