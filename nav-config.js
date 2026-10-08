// nav-config.js - Centralized Navigation Configuration
// Edit this file to reorganize pages across tiers

import { db, collection, getDocs } from './firebase-config.js';

// Store visibility configuration from Firebase
let visibilityConfig = {};
let configLoaded = false;

// Function to fetch page visibility from Firebase
export async function loadPageVisibility() {
  if (configLoaded) {
    return visibilityConfig;
  }

  // Check localStorage cache first (15-min TTL) — survives iOS PWA restarts unlike sessionStorage
  try {
    const cached   = localStorage.getItem('_navVisConfig');
    const cachedTs = parseInt(localStorage.getItem('_navVisConfigTs') || '0', 10);
    const parsedCache = cached ? JSON.parse(cached) : null;
    const cacheAge = Date.now() - cachedTs;
    // Only use cache if: it exists, is fresh, AND is non-empty
    // (empty cache = was written during a broken Firestore session, discard it)
    if (parsedCache && Object.keys(parsedCache).length > 0 && cacheAge < 15 * 60 * 1000) {
      visibilityConfig = parsedCache;
      configLoaded = true;
      console.log('✅ Page visibility loaded from localStorage cache');
      return visibilityConfig;
    }
  } catch (e) { /* localStorage unavailable — fall through to Firestore */ }

  try {
    if (typeof db === 'undefined') {
      console.warn('⚠️ Firebase not loaded, using default visibility');
      configLoaded = true;
      return visibilityConfig;
    }

    const pagesRef = collection(db, 'siteConfig', 'navigation', 'pages');
    const pagesSnapshot = await getDocs(pagesRef);

    pagesSnapshot.forEach(doc => {
      visibilityConfig[doc.id] = doc.data();
    });

    configLoaded = true;
    console.log('✅ Loaded page visibility config from Firestore');

    // Cache in localStorage (15-min TTL) — persists across iOS PWA restarts
    try {
      localStorage.setItem('_navVisConfig', JSON.stringify(visibilityConfig));
      localStorage.setItem('_navVisConfigTs', Date.now().toString());
    } catch (e) { /* silent fail */ }

    return visibilityConfig;
  } catch (error) {
    console.error('❌ Error loading page visibility:', error);
    configLoaded = true;
    return visibilityConfig;
  }
}

// Helper function to check if page should be visible
export function isPageVisible(pageId) {
  const config = visibilityConfig[pageId];
  // Default to visible if no config exists
  return config === undefined || config.visible !== false;
}

// Function to get filtered navigation structure by visibility
export function getFilteredNavStructure() {
  const filtered = {
    primary: [],
    secondary: [],
    tertiary: [],
    auth: [],
    authPublic: []
  };

  Object.keys(NAV_STRUCTURE).forEach(tier => {
    filtered[tier] = NAV_STRUCTURE[tier].filter(page => {
      return isPageVisible(page.id);
    });
  });

  return filtered;
}

// ===========================================================================
// v2.0 NAV TREE
// One tree of hubs -> tabs -> pages, read by the v2.0 header, hub tabs and
// mobile bottom bar. Icons are names from icons.svg (see js/ui/icons.js).
//
// A page:  { id, href, label, icon, role?, signedIn?, phase?, also?, external? }
//   id      matches the doc ID in Firestore siteConfig/navigation/pages, so
//           { visible: false } there still hides it. Keep IDs stable.
//   role    a hasRole() name or list ('team-staff', 'captain', 'league-staff',
//           'admin', or a specialRoles key). Implies signedIn.
//   phase   'regular' | 'playoffs' | 'offseason' (or a list): shown only then.
//   ignoreSiteConfig  list it whatever siteConfig/navigation/pages says.
//   also    other pages that belong here: no tab of their own, but opening
//           one highlights this tab (detail pages, pages merged in Phase 3).
// A tab is a page, or a group { key, label, icon, pages: [...] } that shows a
// second row of tabs. A group's row is the tab set its merged page gets in
// Phase 3; it links to its first visible page.
// ===========================================================================

const CONTRIBUTOR_ROLES = ['contributor', 'photographer', 'oddsmaker', 'eulogist', 'mediaManager', 'league-staff'];

export const NAV_HUBS = [
  {
    id: 'season', label: 'Season', icon: 'calendar',
    tabs: [
      { id: 'current-season', href: 'current-season.html', label: 'Standings', icon: 'list',
        also: ['current-season-team.html', 'season.html'] },
      { id: 'schedule', href: 'schedule.html', label: 'Schedule', icon: 'calendar-days' },
      // Playoffs: the phase limits when each page can show; Bracket, Clinching and
      // Championship preview are also switched on by hand in siteConfig/navigation/pages
      // (late regular season / once the final is set). Projections runs all regular season.
      { key: 'playoffs', label: 'Playoffs', icon: 'trophy', pages: [
        { id: 'playoffs', href: 'playoffs.html', label: 'Bracket', icon: 'trophy', phase: ['regular', 'playoffs'] },
        { id: 'clinching', href: 'playoff-clinching.html', label: 'Clinching', icon: 'lock', phase: 'regular' },
        { id: 'projections', href: 'projections.html', label: 'Projections', icon: 'trending-up', phase: 'regular' },
        { id: 'champ-preview', href: 'championship-preview.html', label: 'Championship preview', icon: 'crown', phase: 'playoffs' },
      ] },
      { id: 'weekend-preview', href: 'weekend-preview.html', label: 'Preview', icon: 'binoculars',
        also: ['game-preview.html', 'game-recap.html'] },
      { id: 'stream', href: 'media.html#live', label: 'Live', icon: 'radio' },
      { key: 'rules', label: 'Rules', icon: 'scale', pages: [
        { id: 'league-rules', href: 'league-rules.html', label: 'Rules', icon: 'scale' },
        { id: 'rule-proposal', href: 'rule-proposals.html', label: 'Proposals', icon: 'clipboard' },
        { id: 'rule-review', href: 'rule-review.html', label: 'Review', icon: 'clipboard-check' },
      ] },
      { id: 'activity', href: 'activity.html', label: 'Activity', icon: 'activity' },
      // Offseason planning: admin and league staff only, in any phase, so they
      // can prepare before the offseason starts. Listed whatever
      // siteConfig/navigation/pages says (the old nav still reads those docs).
      { key: 'offseason', label: 'Offseason', icon: 'snowflake', pages: [
        { id: 'offseason-hub', href: 'offseason.html', label: 'Offseason hub', icon: 'snowflake', role: 'league-staff', ignoreSiteConfig: true },
        { id: 'offseason-schedule', href: 'offseason-schedule.html', label: 'Schedule', icon: 'calendar-days', role: 'league-staff', ignoreSiteConfig: true },
        { id: 'offseason-roster', href: 'offseason-roster.html', label: 'Rosters', icon: 'users', role: 'league-staff', ignoreSiteConfig: true },
        { id: 'draft', href: 'draft.html', label: 'Draft', icon: 'shuffle', role: 'league-staff', ignoreSiteConfig: true },
        { id: 'countdown', href: 'countdown.html', label: 'Countdown', icon: 'timer', role: 'league-staff', ignoreSiteConfig: true },
      ] },
    ],
  },
  {
    id: 'stats', label: 'Stats', icon: 'chart-bar',
    tabs: [
      { id: 'batting', href: 'batting.html', label: 'Batting', icon: 'bat' },
      { id: 'pitching', href: 'pitching.html', label: 'Pitching', icon: 'softball' },
      { id: 'leaders', href: 'leaders.html', label: 'Leaders', icon: 'crown',
        also: ['milestones.html', 'pitching_leaders.html'] },
      { id: 'compare', href: 'compare.html', label: 'Compare', icon: 'arrow-left-right',
        also: ['team_compare.html', 'h2h_grid.html'] },
      { id: 'explore', href: 'explore.html', label: 'Explore', icon: 'search',
        also: ['query-stats.html', 'charts.html'] },
      { id: 'team-stats', href: 'team-stats.html', label: 'Team stats', icon: 'table' },
      { id: 'scouting-report', href: 'scouting-report.html', label: 'Scouting', icon: 'binoculars' },
    ],
  },
  {
    id: 'teams', label: 'Teams & Players', shortLabel: 'Teams', icon: 'users',
    tabs: [
      { id: 'teams', href: 'teams.html', label: 'Teams', icon: 'shield',
        also: ['team.html'] },
      { id: 'players', href: 'players.html', label: 'Players', icon: 'user',
        also: ['player.html', 'pitcher.html', 'player-splits.html', 'player_new.html', 'card-export.html'] },
      { id: 'roster-tracker', href: 'roster-tracker.html', label: 'Roster tracker', icon: 'clipboard' },
      { id: 'directory', href: 'aces-directory.html', label: 'Directory', icon: 'id-card', signedIn: true },
    ],
  },
  {
    id: 'history', label: 'History', icon: 'scroll',
    tabs: [
      { id: 'seasons', href: 'seasons.html', label: 'Seasons', icon: 'calendar' },
      { id: 'champions', href: 'champions.html', label: 'Champions', icon: 'trophy', phase: 'offseason' },
      { key: 'awards', label: 'Awards', icon: 'award', pages: [
        { id: 'awards', href: 'awards.html', label: 'Awards', icon: 'award' },
        { id: 'aceys-2026', href: 'aceys-2026.html', label: 'Aceys 2026', icon: 'star' },
      ] },
      { id: 'recap', href: 'recap.html', label: 'Year in review', icon: 'book', phase: 'offseason',
        also: ['aces-wrapped.html'] },
      { id: 'playoff-history', href: 'playoff-history.html', label: 'Playoff history', icon: 'flag' },
      { id: 'trophy-case', href: 'trophy-case.html', label: 'Trophy case', icon: 'medal',
        also: ['badge-weekly.html'] },
      { id: 'history', href: 'league-history.html', label: 'League history', icon: 'scroll',
        also: ['aces-23-0.html'] },
      { id: 'media', href: 'media.html', label: 'Media', icon: 'images',
        also: ['pictures.html', 'stream.html', 'photo-upload.html'] },
    ],
  },
  {
    id: 'play', label: 'Play', icon: 'gamepad',
    tabs: [
      { id: 'games', href: 'games.html', label: 'Daily games', icon: 'puzzle',
        also: ['aces-wordle.html', 'immaculate-grid.html', 'higher-lower.html', 'who-am-i.html',
               'aces-connections.html', 'roster-recall.html'] },
      { id: 'pickem', href: 'pickem.html', label: "Pick'em", icon: 'check-circle', signedIn: true },
      { id: 'aces-dfs', href: 'dfs.html', label: 'DFS', icon: 'dice', signedIn: true,
        also: ['dfs-week.html'] },
      { id: 'side-bets', href: 'side-bets.html', label: 'Side bets', icon: 'handshake', signedIn: true },
      { id: 'violations', href: 'violations.html', label: 'Wall of Shame', icon: 'flame' },
    ],
  },
  {
    // Help: not one of the five hubs in the bar. It opens from the ? button in
    // the header (and the More sheet on phones) and gets its own tab row.
    id: 'help', label: 'Help', icon: 'help', utility: true,
    tabs: [
      { id: 'help', href: 'help.html', label: 'Help center', icon: 'help',
        also: ['aces-features-guide.html', 'profile-setup-guide.html', 'mountainside-aces-signup-guide.html',
          'scoring-guide.html', 'calendar-export-guide.html', 'game-tracker-guide.html', 'captain-guide.html',
          'contributor-guide.html', 'league-staff-guide.html', 'offseason-guide.html'] },
    ],
  },
];

// The avatar menu ("Me"). Sections show only when one of their pages does.

export const ME_MENU = [
  {
    key: 'me', label: null, pages: [
      { id: 'profile', href: 'me.html#profile', label: 'Profile', icon: 'user', signedIn: true,
        also: ['profile.html', 'profile-fan.html'] },
      { id: 'dashboard', href: 'me.html', label: 'Dashboard', icon: 'grid', signedIn: true,
        also: ['my-dashboard.html'] },
      { id: 'favorites', href: 'me.html#favorites', label: 'Favorites', icon: 'star', signedIn: true,
        also: ['favorites.html'] },
      { id: 'notifications', href: 'notifications.html', label: 'Notifications', icon: 'bell', signedIn: true },
      { id: 'photo-upload', href: 'media.html#upload', label: 'Upload photos', icon: 'upload', signedIn: true,
        role: ['team-staff', 'league-staff', 'photographer'] },
    ],
  },
  {
    key: 'team', label: 'My team', pages: [
      { id: 'submit-score', href: 'submit-score.html', label: 'Submit scores', icon: 'hash', role: 'team-staff' },
      { id: 'submit-stats', href: 'submit-stats.html', label: 'Submit stats', icon: 'calculator', role: 'team-staff' },
      { id: 'game-tracker', href: 'game-tracker.html', label: 'Game tracker', icon: 'clipboard', role: 'team-staff' },
      { id: 'roster-management', href: 'roster-management.html', label: 'Roster management', icon: 'users', role: 'team-staff' },
      { id: 'captain-roster-edit', href: 'captain-roster-edit.html', label: 'Edit roster', icon: 'edit', role: 'team-staff' },
      { id: 'manage-team', href: 'manage-team.html', label: 'Manage team', icon: 'settings', role: 'team-staff' },
      { id: 'team-scouting-report', href: 'team-scouting-report.html', label: 'Team scouting report', icon: 'binoculars', role: 'captain' },
    ],
  },
  {
    key: 'contributor', label: 'Contributor', pages: [
      { id: 'contributor', href: 'contributor.html', label: 'Contributor dashboard', icon: 'sparkles', role: CONTRIBUTOR_ROLES },
    ],
  },
  {
    key: 'staff', label: 'League staff', pages: [
      { id: 'commissioner-hub', href: 'commissioner-hub.html', label: 'Commissioner hub', icon: 'megaphone', role: 'league-staff' },
      { id: 'league-staff-admin', href: 'league-staff-admin.html', label: 'League staff admin', icon: 'shield', role: 'league-staff' },
      { id: 'aceys-admin', href: 'admin-aceys.html', label: 'Aceys admin', icon: 'award', role: 'league-staff' },
    ],
  },
  {
    key: 'admin', label: 'Admin', pages: [
      { id: 'admin-hub', href: 'admin-pages.html', label: 'Admin Hub', icon: 'settings', role: 'admin' },
      { id: 'admin-view-as', href: 'admin-view-as.html', label: 'View As', icon: 'eye', role: 'admin' },
    ],
  },
  {
    key: 'more', label: null, pages: [
      { id: 'feature-submit', href: 'feature-submit.html', label: 'Feedback', icon: 'message' },
      { id: 'aces-shop', href: 'https://acesmountainside.com/', label: 'Aces Shop', icon: 'external-link', external: true },
    ],
  },
];

export const NAV_HOME = { id: 'home', href: 'index.html', label: 'Home', icon: 'home' };

// Mobile bottom bar, left to right. 'more' opens a sheet with MORE_SHEET.
export const MOBILE_BAR = ['home', 'season', 'stats', 'teams', 'me'];
export const MORE_SHEET = ['history', 'play', 'help'];

// Pages that are deliberately in no hub: sign-in flow, admin tools (reached
// from the Admin Hub), hidden pages, and pages due to be deleted.
export const NAV_UNLISTED = {
  noNav: ['signin.html', 'signup.html', 'reset-password.html', 'verify-email.html', 'offline.html'],
  hidden: ['boxes-pool.html', 'link-player.html', 'player-questionnaire.html'],
  adminTools: ['aggregate-stats.html', 'approve-links.html', 'captain-questionnaire-review.html',
    'games-admin.html', 'league-schedule-editor.html', 'player-import.html', 'playoff-eligibility-tracker.html',
    'schedule-2027-proposal.html', 'schedule-balancer.html', 'schedule-generator.html', 'schedule-rework.html',
    'schedule-workshop.html', 'season-setup-wizard.html', 'signup-card-export.html', 'wordle-admin.html',
    'aggregate-stats-legacy.html', 'gc-data-cleaner.html', 'submit-stats-legacy.html', 'bwar-explorer.html'],
  toDelete: [],
};

// --- Tree helpers (pure: no Firebase, no DOM) -------------------------------

const isGroup = (tab) => Array.isArray(tab.pages);
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Every page in the tree (home, hubs, Me menu), each with hubId and tabKey. */
export function navPages() {
  const out = [{ ...NAV_HOME, hubId: 'home', tabKey: 'home' }];
  NAV_HUBS.forEach((hub) => hub.tabs.forEach((tab) => {
    if (isGroup(tab)) tab.pages.forEach((p) => out.push({ ...p, hubId: hub.id, tabKey: tab.key }));
    else out.push({ ...tab, hubId: hub.id, tabKey: tab.id });
  }));
  ME_MENU.forEach((sec) => sec.pages.forEach((p) => out.push({ ...p, hubId: 'me', tabKey: sec.key })));
  return out;
}

/** File name of a URL or path: '/AcesStatsv2.0/' -> 'index.html'. */
export function pageFile(pathOrUrl = (typeof location !== 'undefined' ? location.pathname : '')) {
  const path = String(pathOrUrl).split(/[?#]/)[0];
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file || 'index.html';
}

/**
 * Where a page sits: { hubId, tabKey, pageId } or null for unlisted pages.
 * hubId is 'home', a hub id or 'me'. For a page listed under `also`, pageId
 * is the page it belongs to.
 */
export function locatePage(pathOrUrl) {
  const file = pageFile(pathOrUrl);
  for (const p of navPages()) {
    if (p.external) continue;
    if (p.href === file || asList(p.also).includes(file)) {
      return { hubId: p.hubId, tabKey: p.tabKey, pageId: p.id };
    }
  }
  return null;
}

/**
 * Whether a page shows for this viewer.
 * ctx: { signedIn, profile, phase, hasRole(profile, role), isVisible(id), currentId }
 * The page being viewed (currentId) skips the siteConfig and phase checks, so
 * its tab is there even while it is hidden or out of phase for everyone else.
 * Sign-in and role checks still apply to it.
 */
export function pageAllowed(page, ctx = {}) {
  const { signedIn = false, profile = null, phase = null, hasRole = null, isVisible = null, currentId = null } = ctx;
  const isCurrent = !!currentId && page.id === currentId;
  if ((page.signedIn || page.role) && !signedIn) return false;
  if (page.role && !(hasRole && hasRole(profile, page.role))) return false;
  if (isCurrent) return true;
  if (isVisible && !page.ignoreSiteConfig && !isVisible(page.id)) return false;
  if (page.phase && !asList(page.phase).includes(phase)) return false;
  return true;
}

/**
 * The tree pruned for one viewer: { home, hubs, me }. Groups keep only their
 * allowed pages and link to the first; empty groups, tabs and Me sections are
 * dropped. Hubs stay even when empty, so the bar never shifts.
 */
export function buildNav(ctx = {}) {
  const hubs = NAV_HUBS.map((hub) => {
    const tabs = hub.tabs.map((tab) => {
      if (!isGroup(tab)) return pageAllowed(tab, ctx) ? tab : null;
      const pages = tab.pages.filter((p) => pageAllowed(p, ctx));
      return pages.length ? { ...tab, pages, href: pages[0].href } : null;
    }).filter(Boolean);
    return { ...hub, tabs, href: tabs[0]?.href || null };
  });
  const me = ME_MENU
    .map((sec) => ({ ...sec, pages: sec.pages.filter((p) => pageAllowed(p, ctx)) }))
    .filter((sec) => sec.pages.length);
  return { home: NAV_HOME, hubs, me };
}

// ===========================================================================
// LEGACY: the four-tier structure below is read by nav-component.js until
// push 5b replaces it with the header built on the tree above.
// ===========================================================================

export const NAV_STRUCTURE = {
  // Tier 1: PRIMARY - Core pages (always visible on desktop)
  primary: [
    { id: 'home', href: 'index.html', label: 'Home', icon: '🏠', priority: 1 },
    { id: 'current-season', href: 'current-season.html', label: 'Current Season', icon: '☀️', priority: 1 },
    { id: 'schedule', href: 'schedule.html', label: 'League Schedule', icon: '📅', priority: 1 },
    { id: 'activity', href: 'activity.html', label: 'Activity Feed', icon: '📣', priority: 1 },
    { id: 'league-rules', href: 'league-rules.html', label: 'League Rules', icon: '⚖️', priority: 1 },
    { id: 'batting', href: 'batting.html', label: 'Batting Stats', icon: '⚾', priority: 1, class: 'batting' },
    { id: 'pitching', href: 'pitching.html', label: 'Pitching Stats', icon: '🥎', priority: 1, class: 'pitching' },
    { id: 'teams', href: 'teams.html', label: 'All Teams', icon: '🏆', priority: 1 },
    { id: 'players', href: 'players.html', label: 'All Players', icon: '👥', priority: 1 },
  ],
  
  // Tier 2: SECONDARY - Important pages (shown contextually on desktop)
  secondary: [
    { id: 'weekend-preview', href: 'weekend-preview.html', label: 'Weekend Preview', icon: '🔮', priority: 2 },
    { id: 'stream', href: 'stream.html', label: 'Live Stream', icon: '📹', priority: 2 },
    { id: 'playoffs', href: 'playoffs.html', label: 'Playoff Bracket', icon: '🥇', priority: 2 },
    { id: 'projections', href: 'projections.html', label: 'Playoff Projections', icon: '🎱', priority: 2 },
    { id: 'clinching', href: 'playoff-clinching.html', label: 'Playoff Clinching', icon: '🔒', priority: 2 },
    { id: 'seasons', href: 'seasons.html', label: 'All Seasons', icon: '📅', priority: 2 },
    { id: 'champions', href: 'champions.html', label: 'Champions', icon: '🏆', priority: 2 },
    { id: 'recap', href: 'recap.html', label: 'Year in Review', icon: '📖', priority: 2 },
    { id: 'leaders', href: 'leaders.html', label: 'Career Leaders', icon: '👑', priority: 2 },
    { id: 'awards', href: 'awards.html', label: 'Awards', icon: '🏅', priority: 2 },
    { id: 'games', href: 'games.html', label: 'Daily Games', icon: '🎮', priority: 2 },
    { id: 'trophy-case', href: 'trophy-case.html', label: 'Trophy Case', icon: '🏅', priority: 2 },
  ],

  // Tier 3: TERTIARY - Specialty pages (mobile-only unless contextually relevant)
  tertiary: [
    { id: 'compare', href: 'compare.html', label: 'Compare', icon: '🔀', priority: 3 },
    { id: 'history', href: 'league-history.html', label: 'League History', icon: '📜', priority: 3 },
    { id: 'explore', href: 'explore.html', label: 'Explore', icon: '📊', priority: 3 },
    { id: 'team-stats', href: 'team-stats.html', label: 'Team Stats', icon: '🏟️', priority: 3 },
    { id: 'scouting-report', href: 'scouting-report.html', label: 'Scouting Report', icon: '🔭', priority: 3 },
    { id: 'pictures', href: 'pictures.html', label: 'Gallery', icon: '📷', priority: 3 },
    { id: 'media', href: 'media.html', label: 'Media Hub', icon: '📺', priority: 3 },
    { id: 'rule-proposal', href: 'rule-proposals.html', label: 'Rule Proposals', icon: '📋', priority: 3 },
    { id: 'rule-review', href: 'rule-review.html', label: 'Rule Review', icon: '📝', priority: 3 },
    { id: 'aceys-2026', href: 'aceys-2026.html', label: 'The Aceys 2026', icon: '🏆', priority: 3 },
    { id: 'aces-23-0', href: 'aces-23-0.html', label: '23-0', icon: '🎰', priority: 3 },
    { id: 'champ-preview', href: 'championship-preview.html', label: 'Championship Preview', icon: '🎊', priority: 3 },
    { id: 'playoff-history', href: 'playoff-history.html', label: 'Playoff History', icon: '🗂️', priority: 3 },
    { id: 'feature-submit', href: 'feature-submit.html', label: 'Submit Feedback', icon: '💡', priority: 3 },
    { id: 'help', href: 'help.html', label: 'Help Center', icon: '📚', priority: 3 },
    { id: 'roster-tracker', href: 'roster-tracker.html', label: 'Roster Tracker', icon: '📋', priority: 3 },
    { id: 'violations', href: 'violations.html', label: 'Wall of Shame', icon: '🏛️', priority: 3 },
    // game-preview removed - requires specific game ID parameter
  ],
  
  // Tier 4: AUTH - User-specific pages (only visible when authenticated)
  auth: [
    { id: 'dashboard', href: 'me.html', label: 'My Dashboard', icon: '📋', priority: 4, requiresAuth: true },
    { id: 'profile', href: 'profile.html', label: 'My Profile', icon: '👤', priority: 4, requiresAuth: true },
    { id: 'contributor', href: 'contributor.html', label: 'Contributor Dashboard', icon: '✨', priority: 4, requiresAuth: true, requiresRole: 'contributor' },
    { id: 'favorites', href: 'me.html#favorites', label: 'Favorites', icon: '⭐', priority: 4, requiresAuth: true },
    { id: 'side-bets', href: 'side-bets.html', label: 'Side Bets', icon: '🎲', priority: 4, requiresAuth: true },
    { id: 'aces-dfs', href: 'dfs.html', label: 'Aces DFS', icon: '💰', priority: 4, requiresAuth: true },
    { id: 'pickem', href: 'pickem.html', label: "Weekly Pick'em", icon: '✅', priority: 4, requiresAuth: true },
    { id: 'roster-management', href: 'roster-management.html', label: 'Roster Management', icon: '✉️', priority: 4, requiresAuth: true },
    { id: 'game-tracker', href: 'game-tracker.html', label: 'Game Tracker', icon: '📊', priority: 4, requiresAuth: true },
    { id: 'captain-guide', href: 'captain-guide.html', label: "Captain's Guide", icon: '👨‍✈️', priority: 4, requiresAuth: true, requiresRole: 'captain' },
    { id: 'captain-roster-edit', href: 'captain-roster-edit.html', label: 'Edit Roster', icon: '✏️', priority: 4, requiresAuth: true, requiresRole: 'captain' },
    { id: 'team-scouting-report', href: 'team-scouting-report.html', label: 'Team Scouting Report', icon: '📋', priority: 4, requiresAuth: true, requiresRole: 'captain' },
    { id: 'league-staff-admin', href: 'league-staff-admin.html', label: 'League Staff Admin', icon: '⚙️', priority: 4, requiresAuth: true, requiresRole: 'league_staff' },
    { id: 'commissioner-hub', href: 'commissioner-hub.html', label: 'Commissioner Hub', icon: '📢', priority: 4, requiresAuth: true, requiresRole: 'league_staff' },
    { id: 'directory', href: 'aces-directory.html', label: 'Aces Directory', icon: '📇', priority: 4, requiresAuth: true },
    { id: 'submit-score', href: 'submit-score.html', label: 'Submit Scores', icon: '🔢️', priority: 4, requiresAuth: true },
    { id: 'submit-stats', href: 'submit-stats.html', label: 'Submit Stats', icon: '🧮', priority: 4, requiresAuth: true },
    { id: 'photo-upload', href: 'photo-upload.html', label: 'Upload Photos', icon: '📤️', priority: 4, requiresAuth: true },
    { id: 'offseason-hub', href: 'offseason.html', label: 'Offseason Hub', icon: '🎣️', priority: 4, requiresAuth: true },
    { id: 'aces-shop', href: 'https://acesmountainside.com/', label: 'Aces Shop', icon: '🛒', priority: 4, requiresAuth: true, external: true },
    { id: 'spray-intake', href: 'admin-spray-intake.html', label: 'Spray Chart Intake', icon: '🎯', priority: 4, requiresAuth: true, requiresRole: 'admin' },
    { id: 'aceys-admin', href: 'admin-aceys.html', label: 'Aceys Admin', icon: '🏆', priority: 4, requiresAuth: true, requiresRole: 'league_staff' },
    { id: 'admin-hub', href: 'admin-pages.html', label: 'Admin Hub', icon: '🛠️', priority: 4, requiresAuth: true, requiresRole: 'admin' },
    { id: 'admin-view-as', href: 'admin-view-as.html', label: 'View As User', icon: '🎭', priority: 4, requiresAuth: true, requiresRole: 'admin' },
  ],

  // Public auth pages (signin handles both signin and signup - don't show in nav)
  authPublic: [
    { id: 'signin', href: 'signin.html', label: 'Sign In', icon: '🔐', priority: 5, hideFromNav: true },
  ]
};

// Flatten all pages into a single lookup object
export const ALL_PAGES = {};
['primary', 'secondary', 'tertiary', 'auth', 'authPublic'].forEach(tier => {
  NAV_STRUCTURE[tier].forEach(page => {
    ALL_PAGES[page.id] = page;
  });
});

// Page-specific configurations: which links to show on desktop
export const PAGE_CONFIGS = {
  'index.html': {
    desktop: [] // No desktop nav on home page
  },

  'stream.html': {
    desktop: ['home', 'current-season', 'weekend-preview', 'stream']
  },
  
  'current-season.html': {
    desktop: ['home', 'current-season', 'schedule', 'league-rules', 'weekend-preview', 'playoffs','clinching','projections', 'batting', 'pitching']
  },
  
  'league-rules.html': {
    desktop: ['home', 'current-season', 'league-rules', 'batting', 'pitching', 'teams', 'players']
  },
  
  'weekend-preview.html': {
    desktop: ['home', 'current-season', 'schedule', 'league-rules', 'playoffs', 'clinching','projections', 'batting', 'pitching']
  },
  
  'projections.html': {
    desktop: ['home', 'current-season', 'weekend-preview', 'playoffs', 'projections', 'batting', 'pitching', 'teams']
  },
    
  'playoff-clinching.html': {
    desktop: ['home', 'current-season', 'weekend-preview', 'playoffs', 'projections']
  },
  
  'batting.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'players', 'leaders', 'compare', 'charts']
  },
  
  'pitching.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'players', 'leaders', 'compare', 'charts']
  },
  
  'teams.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'teams', 'players', 'team-compare', 'h2h']
  },
  
  'team.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'teams', 'players', 'team-compare', 'h2h']
  },
  
  'players.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'teams', 'players', 'leaders', 'compare']
  },
  
  'player.html': {
    desktop: ['home', 'batting', 'pitching', 'players', 'leaders', 'compare']
  },
  
  'seasons.html': {
    desktop: ['home', 'current-season', 'seasons', 'champions', 'batting', 'pitching', 'teams', 'players', 'awards']
  },
  
  'season.html': {
    desktop: ['home', 'current-season', 'seasons', 'batting', 'pitching', 'teams', 'players']
  },
  
  'leaders.html': {
    desktop: ['home', 'current-season', 'batting', 'pitching', 'players', 'leaders', 'awards']
  },
  
  'awards.html': {
    desktop: ['home', 'current-season', 'seasons', 'champions', 'leaders', 'awards', 'players']
  },
  
  'recap.html': {
    desktop: ['home', 'current-season', 'seasons', 'recap', 'champions', 'awards', 'leaders', 'teams', 'players']
  },
  
  'champions.html': {
    desktop: ['home', 'current-season', 'seasons', 'champions', 'recap', 'awards', 'leaders', 'teams']
  },

  'trophy-case.html': {
    desktop: ['home', 'current-season', 'champions', 'awards', 'leaders', 'players']
  },

  
  'compare.html': {
    desktop: ['home', 'batting', 'pitching', 'players', 'leaders', ]
  },
  
  
  
  'league-history.html': {
    desktop: ['home', 'current-season', 'teams', 'team-compare', 'h2h']
  },
  
  
  
  'pictures.html': {
    desktop: ['home', 'current-season', 'teams', 'players', 'pictures']
  },

  'activity.html': {
    desktop: ['home', 'current-season', 'pictures', 'players', 'teams']
  },
  
  'games.html': {
    desktop: ['home', 'current-season', 'players', 'teams']
  },
  
  // Game preview page - no nav needed (accessed via weekend-preview game cards)
  'game-preview.html': {
    desktop: ['home', 'current-season', 'weekend-preview']
  },

  'schedule.html': {
    desktop: ['home', 'current-season', 'schedule', 'weekend-preview', 'batting', 'pitching', 'teams']
  },

  'current-season-team.html': {
    desktop: ['home', 'current-season', 'schedule', 'batting', 'pitching', 'teams', 'players']
  },

  'championship-preview.html': {
    desktop: ['home', 'current-season', 'playoffs', 'weekend-preview']
  },

  'playoff-history.html': {
    desktop: ['home', 'playoffs', 'seasons', 'champions']
  },

  'rule-proposals.html': {
    desktop: ['home', 'league-rules', 'rule-review']
  },

  'rule-review.html': {
    desktop: ['home', 'league-rules', 'rule-proposal']
  },

  'feature-submit.html': {
    desktop: []
  },

  'help.html': {
    desktop: ['home']
  },

  'roster-tracker.html': {
    desktop: ['home', 'current-season', 'teams', 'players', 'seasons', 'history']
  },

  'violations.html': {
    desktop: ['home', 'current-season', 'league-rules', 'teams', 'players']
  },

  // Auth-specific pages
  'my-dashboard.html': {
    desktop: []
  },
  
  'profile.html': {
    desktop: []
  },
  
  'favorites.html': {
    desktop: []
  },
  
  'game-tracker.html': {
    desktop: ['home', 'current-season', 'roster-management', 'batting', 'teams']
  },
  
  'roster-management.html': {
    desktop: []
  },
  
  'captain-guide.html': {
    desktop: ['home', 'roster-management']
  },

  'captain-roster-edit.html': {
    desktop: ['home', 'roster-management', 'submit-stats', 'game-tracker']
  },
  
  'league-staff-admin.html': {
    desktop: []
  },

  'commissioner-hub.html': {
    desktop: []
  },

  'admin-spray-intake.html': {
    desktop: []
  },


  'admin-aceys.html': {
    desktop: []
  },

  'aceys-2026.html': {
    desktop: []
  },

  'aces-23-0.html': {
    desktop: []
  },
  
  'offseason.html': {
    desktop: []
  },

  'aces-wrapped.html': {
    desktop: []
  },

  'media.html': {
    desktop: ['home', 'pictures', 'media']
  },

  // Signin page (handles both signin and signup) - minimal nav
  'signin.html': {
    desktop: ['home']
  }
};

// Default config for any page not specifically configured
export const DEFAULT_CONFIG = {
  desktop: ['home', 'current-season', 'batting', 'pitching', 'teams', 'players']
};
