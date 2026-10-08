// js/core/auth.js
// Signed-in user, their profile, and role checks, on core/firebase.js.
//
//   import { onAuthChange, authReady, isAdmin, canSubmitForTeam } from './js/core/auth.js';
//
//   onAuthChange((user, profile, view) => { ... });  // every change, profile included
//   const { user, profile, view } = await authReady(); // first answer only
//
// "View as" (admin-view-as.html): profile is always the real signed-in
// user's. view = { profile, realProfile, impersonating }, where view.profile
// is the profile to show the page as: the viewed user's while an admin is
// using View As, else the same as profile. Pages that personalise or show
// role-based UI should use view.profile; writes still go out as the real user.
//
// One Firebase listener per page no matter how many callers subscribe, and one
// read of users/{uid} per sign-in, shared by everyone (nav, page, role checks).
//
// Behaviour carried over from firebase-auth.js onAuthChange:
//   - 10 s safety net: a hung SDK counts as signed out instead of a spinner forever
//   - ID token force-refresh before the first callback (the RSVP-flicker fix)
//   - visit tracking on users/{uid}, throttled to once per 5 minutes per tab
//   - FCM token refresh when older than 7 days (live domain only)
//   - weekly redirect to the profile setup guide while notifications are off
//     (live domain only: the preview cannot turn notifications on)
//
// Role checks are copied unchanged from firebase-auth.js (dual-role system:
// league roles admin / league-staff plus per-team captain / team-staff in
// teamRoles, with the legacy isCaptain / linkedTeam fallbacks). In Phase 1
// firebase-auth.js re-exports these from here, so there is one copy.

import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  auth, db, IS_LIVE,
  doc, getDoc, updateDoc, serverTimestamp, increment
} from './firebase.js';

export { auth };

// The legacy nav (nav-component.js) waits for window.auth and this event,
// which firebase-auth.js used to provide. Same auth instance either way.
if (typeof window !== 'undefined') {
  window.auth = auth;
  window.dispatchEvent(new CustomEvent('firebase-auth-ready'));
}

// ===========================================================================
// Auth state
// ===========================================================================

const AUTH_TIMEOUT_MS = 10000;

const state = {
  settled: false,   // true once Firebase (or the timeout) has answered
  user: null,
  profile: null,
  viewProfile: null // the viewed user's profile while View As is on, else null
};

const subscribers = new Set();
let readyResolve;
const readyPromise = new Promise((resolve) => { readyResolve = resolve; });
let listening = false;
let changeSeq = 0;

function currentView() {
  const { profile, viewProfile } = state;
  return { profile: viewProfile || profile, realProfile: profile, impersonating: !!viewProfile };
}

function notify() {
  const { user, profile } = state;
  const view = currentView();
  subscribers.forEach((cb) => {
    try { cb(user, profile, view); } catch (err) { console.error('[auth] subscriber failed', err); }
  });
}

async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.warn('[auth] could not load profile', err?.code || err);
    return null;
  }
}

function settle(user, profile, viewProfile = null) {
  state.user = user;
  state.profile = profile;
  state.viewProfile = viewProfile;
  if (!state.settled) {
    state.settled = true;
    readyResolve({ user, profile, view: currentView() });
  }
  notify();
}

function startListening() {
  if (listening) return;
  listening = true;

  const timeoutId = setTimeout(() => {
    if (!state.settled) {
      console.warn('[auth] no answer from Firebase after 10 s; treating as signed out');
      settle(null, null);
    }
  }, AUTH_TIMEOUT_MS);

  onAuthStateChanged(auth, async (user) => {
    const seq = ++changeSeq;
    clearTimeout(timeoutId);

    let profile = null;
    let viewProfile = null;
    if (user) {
      // Stale tokens cause silent write failures; refresh before anyone writes.
      try { await user.getIdToken(true); } catch (err) { console.warn('[auth] token refresh failed', err?.message || err); }
      profile = await loadProfile(user.uid);
      viewProfile = await resolveViewAs(user, profile);
    } else {
      clearViewAs(); // a real sign-out ends View As (not the 10 s timeout)
    }

    // A newer auth change arrived while we were loading: let it win.
    if (seq !== changeSeq) return;
    settle(user, profile, viewProfile);

    if (user) {
      trackVisit(user);
      if (IS_LIVE) {
        refreshFcmTokenIfNeeded(profile).catch((err) => console.warn('[auth] FCM refresh skipped', err?.message || err));
        checkProfileSetupRedirect(user, profile);
      }
    }
  });
}

/**
 * Subscribe to sign-in changes. The callback gets (user, profile), where
 * profile is the users/{uid} doc as { id, ...data } or null. If auth has
 * already answered, the callback runs right away with the current state.
 * @returns {Function} unsubscribe
 */
export function onAuthChange(callback) {
  subscribers.add(callback);
  startListening();
  if (state.settled) queueMicrotask(() => subscribers.has(callback) && callback(state.user, state.profile));
  return () => subscribers.delete(callback);
}

/** Resolves once with the first auth answer: { user, profile }. */
export function authReady() {
  startListening();
  return readyPromise;
}

/** Current Firebase user, or null (null too before auth has answered). */
export function getCurrentUser() {
  return state.user ?? auth.currentUser ?? null;
}

/** Current users/{uid} profile (the real signed-in user's), or null. */
export function getCurrentProfile() {
  return state.profile;
}

/** Profile to show the page as: the viewed user's during View As, else the real one. */
export function getEffectiveProfile() {
  return state.viewProfile || state.profile;
}

/** True while an admin is using View As. */
export function isViewingAs() {
  return !!state.viewProfile;
}

/** Re-read the profile (after the page changes it) and tell subscribers. */
export async function refreshProfile() {
  const user = getCurrentUser();
  if (!user) return null;
  const profile = await loadProfile(user.uid);
  const viewProfile = await resolveViewAs(user, profile);
  settle(user, profile, viewProfile);
  return profile;
}

/** Sign out. Pass a page to go to afterwards (relative URL). */
export async function signOutUser({ redirectTo = null } = {}) {
  clearViewAs();
  await signOut(auth);
  try { sessionStorage.removeItem('lastVisitTracked'); } catch { /* ignore */ }
  if (redirectTo) window.location.href = redirectTo;
}

// ---------------------------------------------------------------------------
// View As (state written by admin-impersonate.js, per tab in sessionStorage)
// ---------------------------------------------------------------------------

const VIEW_AS_KEY = 'aces_impersonated_user';
const VIEW_AS_ADMIN_KEY = 'aces_real_admin_user';

function readJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** End View As for this tab (same keys admin-impersonate.js stopImpersonation clears). */
export function clearViewAs() {
  try {
    sessionStorage.removeItem(VIEW_AS_KEY);
    sessionStorage.removeItem(VIEW_AS_ADMIN_KEY);
  } catch { /* ignore */ }
}

// The viewed user's profile, or null when View As is off or not allowed.
// Only honoured for an admin, and only for the admin who started it (a
// different account signing in on the same tab drops it). The profile is
// re-read from users/{uid} so it is current and keeps Firestore types; the
// stored copy is the fallback.
async function resolveViewAs(user, profile) {
  const target = readJson(VIEW_AS_KEY);
  if (!target) return null;
  if (!profile) return null; // profile didn't load: leave the state for the next try
  const targetUid = target.uid || target.id;
  const startedBy = readJson(VIEW_AS_ADMIN_KEY)?.uid;
  if (!isAdmin(profile) || !targetUid || targetUid === user.uid || (startedBy && startedBy !== user.uid)) {
    clearViewAs();
    return null;
  }
  const fresh = await loadProfile(targetUid);
  return { ...(fresh || target), id: targetUid, uid: targetUid };
}

// ---------------------------------------------------------------------------
// Side effects carried over from firebase-auth.js
// ---------------------------------------------------------------------------

const VISIT_THROTTLE_MS = 5 * 60 * 1000;

async function trackVisit(user) {
  try {
    const last = parseInt(sessionStorage.getItem('lastVisitTracked') || '0', 10);
    if (Date.now() - last < VISIT_THROTTLE_MS) return;
    await updateDoc(doc(db, 'users', user.uid), {
      lastVisit: serverTimestamp(),
      lastVisitPage: window.location.pathname,
      visitCount: increment(1)
    });
    sessionStorage.setItem('lastVisitTracked', String(Date.now()));
  } catch (err) {
    if (err?.code !== 'not-found') console.warn('[auth] visit not tracked', err?.message || err);
  }
}

async function refreshFcmTokenIfNeeded(profile) {
  if (!profile || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!profile.notificationsEnabled) return;
  const raw = profile.lastTokenUpdate;
  const last = !raw ? null : typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
  const days = last && !Number.isNaN(last.getTime()) ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (days <= 7) return;
  const { requestNotificationPermission } = await import('../../firebase-messaging.js');
  await requestNotificationPermission(profile.id);
}

const SETUP_REDIRECT_DAYS = 7;
const SETUP_SKIP_PAGES = [
  'profile.html', 'signin.html', 'signup.html', 'reset-password.html',
  'verify-email.html', 'link-player.html', 'my-dashboard.html', 'me.html'
];

function checkProfileSetupRedirect(user, profile) {
  if (!profile) return;
  const path = window.location.pathname;
  if (SETUP_SKIP_PAGES.some((p) => path.includes(p))) return;
  if (profile.fcmTokens?.length > 0) return;
  if (profile.profileSetupProgress?.notificationsDismissed) return;
  try {
    const key = `setupRedirect_${user.uid}`;
    const last = parseInt(localStorage.getItem(key) || '0', 10);
    if ((Date.now() - last) / 86400000 < SETUP_REDIRECT_DAYS) return;
    localStorage.setItem(key, String(Date.now()));
    sessionStorage.setItem('setupReturnUrl', window.location.href);
  } catch {
    return; // no storage: never redirect, or we'd redirect on every page
  }
  window.location.href = new URL('../../me.html#notifications', import.meta.url).href;
}

// ===========================================================================
// Roles and permissions (from firebase-auth.js, unchanged unless noted)
// ===========================================================================

export const USER_ROLES = {
  PLAYER: 'player',
  CAPTAIN: 'captain',
  TEAM_STAFF: 'team-staff',
  LEAGUE_STAFF: 'league-staff',
  FAN: 'fan',
  FAMILY: 'family',
  ADMIN: 'admin'
};

export const ROLE_PERMISSIONS = {
  player: {
    canViewOwnStats: true, canRSVPForSelf: true, canEditOwnProfile: true, canViewTeamRoster: true,
    canViewSchedule: true, canFavoriteTeams: true, canFavoritePlayers: true,
    canEditRoster: false, canEditLineup: false, canSubmitStats: false, canManageGames: false,
    canManageStaff: false, canRemoveCaptain: false
  },
  'team-staff': {
    canViewOwnStats: true, canRSVPForSelf: true, canEditOwnProfile: true, canViewTeamRoster: true,
    canViewSchedule: true, canEditRoster: true, canEditLineup: true, canManageRSVPs: true,
    canViewAllTeamStats: true, canCreateGames: true, canEditGameDetails: true, canAssignPositions: true,
    canSubmitStats: true, canFavoriteTeams: true, canFavoritePlayers: true,
    // captain-only:
    canManageStaff: false, canRemoveCaptain: false, canPromoteToStaff: false, canTransferCaptaincy: false
  },
  captain: {
    canViewOwnStats: true, canRSVPForSelf: true, canEditOwnProfile: true, canViewTeamRoster: true,
    canViewSchedule: true, canEditRoster: true, canEditLineup: true, canManageRSVPs: true,
    canViewAllTeamStats: true, canCreateGames: true, canEditGameDetails: true, canAssignPositions: true,
    canSubmitStats: true, canFavoriteTeams: true, canFavoritePlayers: true,
    canManageStaff: true, canRemoveCaptain: false, canPromoteToStaff: true, canTransferCaptaincy: true
  },
  'league-staff': {
    canViewAllGames: true, canEditAnyGame: true, canSubmitStatsAnyTeam: true, canManageSeasons: true,
    canViewReports: true, canManageAwards: true, canApproveCaptains: true, canRemoveCaptain: true,
    canOverrideTeamStaff: true
  },
  fan: {
    canViewPublicStats: true, canViewPublicSchedule: true, canFavoriteTeams: true,
    canFavoritePlayers: true, canReceiveNotifications: true
  },
  family: {
    canViewPublicStats: true, canViewPublicSchedule: true, canFavoriteTeams: true,
    canFavoritePlayers: true, canReceiveNotifications: true,
    canViewFamilyMemberStats: true, canReceiveFamilyMemberUpdates: true
  },
  admin: { allPermissions: true }
};

// Case-insensitive teamRoles lookup: keys are stored capitalized ("Green"),
// game data uses lower case ("green").
function findTeamRole(teamRoles, teamId) {
  if (!teamRoles || !teamId) return null;
  if (teamRoles[teamId]) return teamRoles[teamId];
  const wanted = teamId.toLowerCase();
  for (const [key, value] of Object.entries(teamRoles)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

function teamIdsMatch(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function hasPermission(user, permission, context = {}) {
  if (!user) return false;
  if (user.userRole === USER_ROLES.ADMIN) return true;
  if (user.customPermissions?.[permission]) return true;

  if (context.teamId) {
    const teamRole = user.teamRoles?.[context.teamId];
    if (!teamRole || teamRole.status !== 'active') return false;
    const rolePerms = ROLE_PERMISSIONS[teamRole.role] || {};
    if (permission === 'canRemoveCaptain') {
      return user.userRole === USER_ROLES.LEAGUE_STAFF || user.userRole === USER_ROLES.ADMIN;
    }
    if (permission === 'canManageStaff') return teamRole.role === USER_ROLES.CAPTAIN;
    return rolePerms[permission] || false;
  }

  const rolePerms = ROLE_PERMISSIONS[user.userRole] || {};
  return rolePerms[permission] || false;
}

export function canManageUser(currentUser, targetUser, teamId) {
  if (currentUser.userRole === USER_ROLES.ADMIN) return true;
  if (currentUser.userRole === USER_ROLES.LEAGUE_STAFF) return true;
  const mine = currentUser.teamRoles?.[teamId];
  const theirs = targetUser.teamRoles?.[teamId];
  if (mine?.role === USER_ROLES.CAPTAIN && mine?.status === 'active') {
    return theirs?.role !== USER_ROLES.CAPTAIN;
  }
  return false;
}

/** Special roles (photographer, oddsmaker, historian, contributor...) in specialRoles. */
export function hasSpecialRole(user, role) {
  if (!user) return false;
  if (user.userRole === USER_ROLES.ADMIN) return true;
  return user.specialRoles?.[role] === true;
}

/** Captain of any team (teamRoles, or the legacy isCaptain / userRole fields). */
export function isUserCaptain(userProfile) {
  if (!userProfile) return false;
  if (userProfile.isCaptain === true) return true;
  if (userProfile.userRole === USER_ROLES.CAPTAIN) return true;
  if (userProfile.teamRoles) {
    return Object.values(userProfile.teamRoles).some(
      (tr) => tr.role === USER_ROLES.CAPTAIN && tr.status === 'active'
    );
  }
  return false;
}

/** Captain of this team (case-insensitive team ID). */
export function isTeamCaptain(userProfile, teamId) {
  if (!userProfile || !teamId) return false;
  const tr = findTeamRole(userProfile.teamRoles, teamId);
  if (tr?.role === USER_ROLES.CAPTAIN && tr?.status === 'active') return true;
  return userProfile.isCaptain === true && teamIdsMatch(userProfile.linkedTeam, teamId);
}

/** Team-staff of this team (case-insensitive team ID). */
export function isTeamStaff(userProfile, teamId) {
  if (!userProfile || !teamId) return false;
  const tr = findTeamRole(userProfile.teamRoles, teamId);
  return tr?.role === USER_ROLES.TEAM_STAFF && tr?.status === 'active';
}

/** Admin or league-staff. */
export function hasLeagueRole(userProfile) {
  if (!userProfile) return false;
  if (userProfile.isAdmin === true) return true;
  return userProfile.userRole === USER_ROLES.ADMIN || userProfile.userRole === USER_ROLES.LEAGUE_STAFF;
}

export function isAdmin(userProfile) {
  if (!userProfile) return false;
  return userProfile.isAdmin === true || userProfile.userRole === USER_ROLES.ADMIN;
}

/** League staff specifically (not admin). */
export function isLeagueStaff(userProfile) {
  if (!userProfile) return false;
  return userProfile.userRole === USER_ROLES.LEAGUE_STAFF;
}

/** Admin, league-staff, or captain of any team. */
export function canAccessCaptainFeatures(userProfile) {
  if (!userProfile) return false;
  return hasLeagueRole(userProfile) || isUserCaptain(userProfile);
}

/** Roster / lineup management for this team. */
export function canManageTeam(userProfile, teamId) {
  if (!userProfile) return false;
  if (hasLeagueRole(userProfile)) return true;
  return isTeamCaptain(userProfile, teamId) || isTeamStaff(userProfile, teamId);
}

/** Score / stats submission for a team (or any team when teamId is omitted). */
export function canSubmitForTeam(userProfile, teamId = null) {
  if (!userProfile) return false;
  if (hasLeagueRole(userProfile)) return true;
  return teamId ? canManageTeam(userProfile, teamId) : isUserCaptain(userProfile);
}

/** Lower-case IDs of teams the user is linked to or holds an active team role on. */
export function getUserTeamIds(userProfile) {
  if (!userProfile) return [];
  const ids = new Set();
  if (userProfile.teamId) ids.add(userProfile.teamId.toLowerCase());
  if (userProfile.linkedTeam) ids.add(userProfile.linkedTeam.toLowerCase());
  if (userProfile.teamRoles && typeof userProfile.teamRoles === 'object') {
    Object.entries(userProfile.teamRoles).forEach(([teamId, tr]) => {
      if (tr?.status === 'active' && (tr.role === USER_ROLES.CAPTAIN || tr.role === USER_ROLES.TEAM_STAFF)) {
        ids.add(teamId.toLowerCase());
      }
    });
  }
  return [...ids];
}

/** Submission rights for a game ({ homeTeamId, awayTeamId }). */
export function canSubmitForGame(userProfile, game) {
  if (!userProfile || !game) return false;
  if (hasLeagueRole(userProfile)) return true;
  const teams = getUserTeamIds(userProfile);
  if (!teams.length) return false;
  return teams.includes((game.homeTeamId || '').toLowerCase()) || teams.includes((game.awayTeamId || '').toLowerCase());
}

/**
 * Highest role for UI badges. Changed from firebase-auth.js: `icon` is now an
 * icon name for the SVG sprite instead of an emoji.
 * @returns {{ role: string, label: string, icon: string }}
 */
export function getPrimaryDisplayRole(userProfile) {
  if (!userProfile) return { role: 'unknown', label: 'Unknown', icon: 'user' };
  if (isAdmin(userProfile)) return { role: 'admin', label: 'Admin', icon: 'crown' };
  if (isLeagueStaff(userProfile)) return { role: 'league-staff', label: 'League Staff', icon: 'gear' };
  if (isUserCaptain(userProfile)) return { role: 'captain', label: 'Captain', icon: 'captain' };
  if (userProfile.teamRoles && Object.values(userProfile.teamRoles).some(
    (tr) => tr.role === USER_ROLES.TEAM_STAFF && tr.status === 'active'
  )) {
    return { role: 'team-staff', label: 'Team Staff', icon: 'clipboard' };
  }
  if (userProfile.userRole === USER_ROLES.PLAYER || userProfile.linkedPlayer) return { role: 'player', label: 'Player', icon: 'softball' };
  if (userProfile.userRole === USER_ROLES.FAMILY) return { role: 'family', label: 'Family', icon: 'family' };
  return { role: 'fan', label: 'Fan', icon: 'megaphone' };
}

/** Active team roles as [{ teamId, role, status, approvedBy, approvedAt }]. */
export function getActiveTeamRoles(userProfile) {
  if (!userProfile?.teamRoles) return [];
  return Object.entries(userProfile.teamRoles)
    .filter(([, tr]) => tr.status === 'active')
    .map(([teamId, tr]) => ({ teamId, role: tr.role, status: tr.status, approvedBy: tr.approvedBy, approvedAt: tr.approvedAt }));
}

/** Team IDs the user captains (teamRoles, else the legacy linkedTeam). */
export function getCaptainTeams(userProfile) {
  if (!userProfile) return [];
  const teams = [];
  if (userProfile.teamRoles) {
    Object.entries(userProfile.teamRoles).forEach(([teamId, tr]) => {
      if (tr.role === USER_ROLES.CAPTAIN && tr.status === 'active') teams.push(teamId);
    });
  }
  if (!teams.length && userProfile.isCaptain && userProfile.linkedTeam) teams.push(userProfile.linkedTeam);
  return teams;
}

/**
 * Page-level gate used by initPage({ role }). Same rules as the nav's
 * userHasRole, so a page link and its gate agree. Higher roles pass lower
 * gates: admin passes everything, league staff passes captain, captain passes
 * team-staff.
 * @param {object|null} profile
 * @param {string|string[]} role  'admin' | 'league-staff' | 'captain' | 'team-staff' |
 *        any specialRoles key ('contributor', 'photographer', ...). An array passes if any passes.
 */
export function hasRole(profile, role) {
  if (!role) return true;
  if (Array.isArray(role)) return role.some((r) => hasRole(profile, r));
  if (!profile) return false;
  if (isAdmin(profile)) return true;

  switch (role) {
    case 'admin':
      return false;
    case 'league-staff':
    case 'league_staff':
      return isLeagueStaff(profile) || profile.isLeagueStaff === true;
    case 'captain':
      return isUserCaptain(profile) || hasRole(profile, 'league-staff');
    case 'team-staff':
    case 'team_staff':
      return Object.values(profile.teamRoles || {}).some(
        (tr) => (tr.role === USER_ROLES.TEAM_STAFF || tr.role === USER_ROLES.CAPTAIN) && tr.status === 'active'
      ) || hasRole(profile, 'captain');
    default:
      return profile.specialRoles?.[role] === true;
  }
}
