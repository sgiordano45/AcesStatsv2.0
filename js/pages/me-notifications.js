// js/pages/me-notifications.js
// me.html#notifications: push on this device, which pushes to send, quiet
// hours, and email preferences. Replaced the Preferences tab of profile.html.
//
// Fields on users/{uid} (as the Cloud Functions read them):
//   fcmTokens[], notificationsEnabled            (firebase-messaging.js)
//   notificationPreferences: { gameReminders, rsvpReminders, scheduleChanges,
//     lineupChanges, announcements, scoreUpdates, finalScoreOnly, milestones,
//     captainRsvpAlerts, quietHours: { enabled, start, end } }   (booleans)
//   emailPreferences: { gameReminders, scheduleChanges, finalScore,
//     rsvpReminders, milestones, pickemReminders, captainRsvpAlert }
// Older docs store some push preferences as { enabled }; both shapes read here.

import { db, doc, getDoc, updateDoc } from '../core/firebase.js';
import { hasRole } from '../core/auth.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

let ctx = null;      // { uid, canWrite, profile }
let host = null;
let data = {};       // fresh users/{uid}
let device = { supported: true, permission: 'default', token: null, here: false };

const PUSH = [
  { group: 'Games', items: [
    ['gameReminders', 'Game reminders', 'The morning before your game', true],
    ['rsvpReminders', 'RSVP reminders', "Daily nudges if you haven't answered for an upcoming game", true],
    ['scheduleChanges', 'Schedule changes', 'Game time, date or opponent changes', true],
    ['lineupChanges', 'Lineup changes', 'Batting order and fielding updates', true],
    ['captainRsvpAlerts', 'Low RSVP alert', 'A day before a game if fewer than 9 have said they’re in', true, 'captain']
  ] },
  { group: 'League and scores', items: [
    ['announcements', 'League announcements', 'Important league-wide news', true],
    ['scoreUpdates', 'Final scores', 'When games finish', false]
  ] },
  { group: 'You', items: [
    ['milestones', 'Milestones', 'Career milestones like 100 hits', true]
  ] }
];

const EMAIL = [
  ['gameReminders', 'Game day reminder', 'Morning-of email with time and field', false],
  ['scheduleChanges', 'Schedule changes', 'When a game time, date or field changes', false],
  ['finalScore', 'Final score', "A recap when your team's game is done", false],
  ['rsvpReminders', 'RSVP reminder', "If you haven't answered for an upcoming game", false],
  ['captainRsvpAlert', 'Low RSVP alert', 'A day before a game if fewer than 9 are in', false, 'captain'],
  ['pickemReminders', "Pick'em", "Monday recap and preview, plus a reminder before picks lock", true],
  ['milestones', 'Milestones', 'When you hit a career milestone', false]
];

/** A push preference as a boolean: true / false, or the older { enabled } shape. */
function pushPref(key, dflt) {
  const v = (data.notificationPreferences || {})[key];
  if (typeof v === 'boolean') return v;
  if (v && typeof v === 'object' && 'enabled' in v) return v.enabled !== false;
  return dflt;
}
function emailPref(key, dflt) {
  const v = (data.emailPreferences || {})[key];
  return typeof v === 'boolean' ? v : dflt;
}

const isCaptain = () => hasRole(ctx.profile, 'captain') || data.userRole === 'captain' || data.isCaptain === true;

function toggle(name, label, hint, checked) {
  return `<label class="me-switch">
    <span class="me-switch-text"><strong>${esc(label)}</strong><span>${esc(hint)}</span></span>
    <input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}${ctx.canWrite ? '' : ' disabled'}>
    <span class="me-switch-track" aria-hidden="true"></span>
  </label>`;
}

// ---------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------

async function checkDevice() {
  device = { supported: 'Notification' in window, permission: 'default', token: null, here: false };
  if (!device.supported || ctx.viewingAs) return;
  device.permission = Notification.permission;
  if (device.permission !== 'granted') return;
  try {
    const { getCurrentDeviceToken } = await import('../../firebase-messaging.js');
    device.token = await getCurrentDeviceToken();
    device.here = !!device.token && (data.fcmTokens || []).includes(device.token);
  } catch (err) {
    console.warn('[me] device token unavailable', err);
  }
}

function blockedHelp() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'On iPhone: add this site to your Home Screen, then Settings, Notifications, Aces, Allow. Open it from the Home Screen and come back here.';
  if (/Android/.test(ua)) return 'On Android: Settings, Apps, your browser (or Aces), Notifications, Allow. Then reload this page.';
  return 'Click the lock icon next to the address bar, set Notifications to Allow, then reload this page.';
}

function deviceCard() {
  const n = (data.fcmTokens || []).length;
  const devices = n ? `${n} device${n === 1 ? '' : 's'}` : '';
  let status = '';
  let action = '';
  let tone = '';
  if (ctx.viewingAs) {
    status = n ? `Push is on for ${devices}.` : data.notificationsEnabled ? 'Turned on, but no devices are registered.' : 'Push is off.';
  } else if (!device.supported) {
    status = "This browser can't get push notifications. Try Chrome, Edge, Firefox or Safari, or add the site to your Home Screen on iPhone.";
    tone = 'is-muted';
  } else if (device.permission === 'denied') {
    status = 'Notifications are blocked for this site.';
    tone = 'is-alert';
    action = `<p class="me-help">${esc(blockedHelp())}</p><button type="button" class="aces-btn is-sm" data-push="reload">${icon('refresh')} Reload</button>`;
  } else if (device.here) {
    status = `Push is on for this device${n > 1 ? ` and ${n - 1} other${n > 2 ? 's' : ''}` : ''}.`;
    tone = 'is-on';
    action = '<button type="button" class="aces-btn is-sm" data-push="off">Turn off on this device</button>';
  } else {
    status = n ? `Push is on for ${devices}, but not this one.` : device.permission === 'granted' ? 'Almost there: one more tap to finish setup.' : 'Push is off on this device.';
    action = `<button type="button" class="aces-btn is-primary is-sm" data-push="on">${icon('bell')} ${device.permission === 'granted' ? 'Finish setup' : 'Turn on push'}</button>`;
  }
  return `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('smartphone')} Push on this device</h2></div>
    <p class="me-push-status ${tone}">${esc(status)}</p>
    ${ctx.canWrite ? action : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const cap = isCaptain();
  const qh = data.notificationPreferences?.quietHours || {};
  const save = (what) => (ctx.canWrite ? `<div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Save ${what}</button></div>` : '');
  host.innerHTML = `
    ${deviceCard()}
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('bell')} What to push</h2></div>
      <p class="me-help">These apply to every device with push on.</p>
      <form class="me-form" data-form="push">
        ${PUSH.map(g => `<fieldset class="me-fieldset"><legend>${esc(g.group)}</legend>
          ${g.items.filter(([, , , , role]) => !role || cap).map(([k, l, h, d]) => toggle(k, l, h, pushPref(k, d))).join('')}
        </fieldset>`).join('')}
        <fieldset class="me-fieldset"><legend>Quiet hours</legend>
          ${toggle('quietHours', 'Pause pushes overnight', 'Nothing is sent between these times', qh.enabled ?? true)}
          <div class="me-form-grid me-quiet">
            <label class="aces-field"><span class="aces-label">From</span><input class="aces-input" type="time" name="quietStart" value="${esc(qh.start || '22:00')}"${ctx.canWrite ? '' : ' disabled'}></label>
            <label class="aces-field"><span class="aces-label">Until</span><input class="aces-input" type="time" name="quietEnd" value="${esc(qh.end || '08:00')}"${ctx.canWrite ? '' : ' disabled'}></label>
          </div>
        </fieldset>
        ${save('push settings')}
      </form>
    </section>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('mail')} Email</h2></div>
      <p class="me-help">Sent to <strong>${esc(data.email || ctx.profile.email || 'your account email')}</strong>. League announcements always come by email.</p>
      <form class="me-form" data-form="email">
        <fieldset class="me-fieldset">
          ${EMAIL.filter(([, , , , role]) => !role || cap).map(([k, l, h, d]) => toggle(k, l, h, emailPref(k, d))).join('')}
        </fieldset>
        ${save('email settings')}
      </form>
    </section>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function refresh() {
  const snap = await getDoc(doc(db, 'users', ctx.uid));
  data = snap.exists() ? snap.data() : {};
  await checkDevice();
  render();
}

async function onPush(kind, btn) {
  if (kind === 'reload') return location.reload();
  btn.disabled = true;
  try {
    const m = await import('../../firebase-messaging.js');
    if (kind === 'on') {
      const token = await m.requestNotificationPermission(ctx.uid);
      if (token) showToast('Push is on for this device.', 'success');
      else if ('Notification' in window && Notification.permission === 'denied') showToast('Notifications are blocked. See the steps below.', 'info');
    } else {
      const token = device.token || await m.getCurrentDeviceToken();
      if (token) await m.removeFCMToken(ctx.uid, token);
      showToast('Push is off for this device.', 'success');
    }
  } catch (err) {
    console.error('[me] push change failed', err);
    showToast('Could not change push for this device.', 'error');
  }
  await refresh();
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form || !ctx.canWrite) return;
  e.preventDefault();
  const f = form.elements;
  const on = (k) => !!f[k]?.checked;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (form.dataset.form === 'push') {
      const prev = data.notificationPreferences || {};
      const prefs = {
        gameReminders: on('gameReminders'),
        rsvpReminders: on('rsvpReminders'),
        scheduleChanges: on('scheduleChanges'),
        lineupChanges: on('lineupChanges'),
        announcements: on('announcements'),
        scoreUpdates: on('scoreUpdates'),
        finalScoreOnly: typeof prev.finalScoreOnly === 'boolean' ? prev.finalScoreOnly : true,
        milestones: on('milestones'),
        captainRsvpAlerts: f.captainRsvpAlerts ? on('captainRsvpAlerts') : prev.captainRsvpAlerts !== false,
        quietHours: { enabled: on('quietHours'), start: f.quietStart.value || '22:00', end: f.quietEnd.value || '08:00' }
      };
      await updateDoc(doc(db, 'users', ctx.uid), { notificationPreferences: prefs });
      data.notificationPreferences = prefs;
      showToast('Push settings saved.', 'success');
    } else {
      const prev = data.emailPreferences || {};
      const prefs = {
        gameReminders: on('gameReminders'),
        scheduleChanges: on('scheduleChanges'),
        finalScore: on('finalScore'),
        rsvpReminders: on('rsvpReminders'),
        milestones: on('milestones'),
        pickemReminders: on('pickemReminders'),
        captainRsvpAlert: f.captainRsvpAlert ? on('captainRsvpAlert') : prev.captainRsvpAlert === true
      };
      await updateDoc(doc(db, 'users', ctx.uid), { emailPreferences: prefs });
      data.emailPreferences = prefs;
      showToast('Email settings saved.', 'success');
    }
  } catch (err) {
    console.error('[me] saving preferences failed', err);
    showToast('Could not save. Try again.', 'error');
  }
  btn.disabled = false;
}

/**
 * @param {HTMLElement} el
 * @param {{ uid: string, canWrite: boolean, viewingAs: boolean, profile: object }} o
 */
export async function mountNotifications(el, o) {
  ctx = o;
  host = el;
  host.innerHTML = '<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span></section>';
  await refresh();
  host.addEventListener('submit', onSubmit);
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-push]');
    if (b && (ctx.canWrite || b.dataset.push === 'reload')) onPush(b.dataset.push, b);
  });
}
