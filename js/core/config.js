// js/core/config.js
// Current season and league phase, read from Firestore instead of hard-coded.
// Replaces the 15 files with '2026-summer' and the 16 loadSeasons copies.
//
//   import { getSiteConfig, getCurrentSeasonId } from './js/core/config.js';
//   const { currentSeasonId, previousSeasonId, phase } = await getSiteConfig();
//
// Where the answer comes from, in order:
//   1. siteConfig/current  { currentSeasonId, previousSeasonId?, phase?, openingDay? }
//      New doc (Phase 1 adds it, season-setup-wizard will write it). Additive:
//      the live site ignores it.
//   2. seasons where isActive == true (what firebase-data.js getCurrentSeason()
//      uses today), so this works before siteConfig/current exists.
//   3. The last answer this browser saw (localStorage), for offline starts.
// previousSeasonId, when not set in the doc, is the season just before the
// current one in season order. phase, when not set, is 'regular' while a season
// is active and 'offseason' otherwise; 'playoffs' only comes from the doc.
//
// The result is cached in memory and in sessionStorage for 10 minutes, so
// moving between pages costs no extra reads.

import { db, doc, getDoc, collection, getDocs } from './firebase.js';

// ---------------------------------------------------------------------------
// Season IDs ('2026-summer')
// ---------------------------------------------------------------------------

export const SEASON_TYPE_ORDER = { spring: 0, summer: 1, fall: 2, winter: 3 };

const SEASON_ID_RE = /^(\d{4})-(spring|summer|fall|winter)$/;

/** True for a real season ID; false for sandbox or test IDs. */
export function isSeasonId(id) {
  return SEASON_ID_RE.test(String(id || ''));
}

/** '2026-summer' -> { year: 2026, type: 'summer' }; null if not a season ID. */
export function parseSeasonId(id) {
  const m = SEASON_ID_RE.exec(String(id || ''));
  return m ? { year: Number(m[1]), type: m[2] } : null;
}

/** Sortable number: 2026-spring 20260, 2026-summer 20261, 2026-fall 20262. */
export function seasonSortKey(id) {
  const [y, t] = String(id || '').split('-');
  return (parseInt(y, 10) || 0) * 10 + (SEASON_TYPE_ORDER[t] ?? 9);
}

/** Array.sort comparator, newest season first. */
export function compareSeasonsDesc(a, b) {
  return seasonSortKey(typeof b === 'string' ? b : b.id) - seasonSortKey(typeof a === 'string' ? a : a.id);
}

/** '2026-summer' -> '2026 Summer'. Unknown shapes pass through unchanged. */
export function formatSeasonLabel(id) {
  const parsed = parseSeasonId(id);
  if (!parsed) return String(id || '');
  return `${parsed.year} ${parsed.type.charAt(0).toUpperCase()}${parsed.type.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

export const PHASES = Object.freeze({
  REGULAR: 'regular',
  PLAYOFFS: 'playoffs',
  OFFSEASON: 'offseason'
});

const VALID_PHASES = new Set(Object.values(PHASES));

// ---------------------------------------------------------------------------
// Seasons list
// ---------------------------------------------------------------------------

let seasonsPromise = null;

/**
 * Every doc in `seasons`, newest first, as { id, ...data }.
 * includeNonStandard: true also returns sandbox/test IDs.
 * One read of the collection per page load.
 */
export async function getSeasons({ includeNonStandard = false, force = false } = {}) {
  if (force) seasonsPromise = null;
  seasonsPromise ??= getDocs(collection(db, 'seasons'))
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compareSeasonsDesc))
    .catch((err) => { seasonsPromise = null; throw err; });
  const all = await seasonsPromise;
  return includeNonStandard ? all : all.filter((s) => isSeasonId(s.id));
}

/** The season just before `seasonId` among `seasons` docs (or by ID math as a fallback). */
export async function getPreviousSeasonId(seasonId) {
  if (!seasonId) return null;
  try {
    const ids = (await getSeasons()).map((s) => s.id);
    const key = seasonSortKey(seasonId);
    return ids.find((id) => seasonSortKey(id) < key) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Site config
// ---------------------------------------------------------------------------

const SESSION_KEY = 'aces:siteConfig:v1';
const LAST_KNOWN_KEY = 'aces:siteConfig:lastKnown:v1';
const TTL_MS = 10 * 60 * 1000;

let configPromise = null;
let configValue = null;

function readStorage(store, key) {
  try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; }
}

function writeStorage(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch { /* private mode or full */ }
}

// Firestore Timestamp, Date or string -> 'YYYY-MM-DD' (local date), else null.
function toDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const d = typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadFromFirestore() {
  let current = null;
  try {
    const snap = await getDoc(doc(db, 'siteConfig', 'current'));
    current = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('[config] siteConfig/current unreadable, falling back to seasons', err);
  }

  let currentSeasonId = current?.currentSeasonId || null;
  let source = currentSeasonId ? 'siteConfig' : null;
  let activeSeason = null;

  if (!currentSeasonId) {
    const seasons = await getSeasons();
    activeSeason = seasons.find((s) => s.isActive === true) || null;
    currentSeasonId = activeSeason?.id || null;
    source = 'seasons';
  }

  const previousSeasonId = current?.previousSeasonId || (await getPreviousSeasonId(currentSeasonId));

  let phase = VALID_PHASES.has(current?.phase) ? current.phase : null;
  if (!phase) phase = (source === 'siteConfig' || activeSeason) ? PHASES.REGULAR : PHASES.OFFSEASON;

  return {
    currentSeasonId,
    previousSeasonId,
    phase,
    openingDay: toDateString(current?.openingDay ?? activeSeason?.startDate),
    source,
    loadedAt: Date.now()
  };
}

/**
 * Current season, previous season and phase.
 * @param {{ force?: boolean }} [options]  force: skip the caches and re-read.
 * @returns {Promise<{currentSeasonId: string|null, previousSeasonId: string|null,
 *   phase: 'regular'|'playoffs'|'offseason', openingDay: string|null,
 *   source: 'siteConfig'|'seasons'|'cache'|'none', loadedAt: number}>}
 */
export function getSiteConfig({ force = false } = {}) {
  if (!force && configPromise) return configPromise;

  if (!force) {
    const cached = readStorage(sessionStorage, SESSION_KEY);
    if (cached && Date.now() - cached.loadedAt < TTL_MS) {
      configValue = cached;
      configPromise = Promise.resolve(cached);
      return configPromise;
    }
  }

  configPromise = loadFromFirestore()
    .then((value) => {
      configValue = value;
      writeStorage(sessionStorage, SESSION_KEY, value);
      if (value.currentSeasonId) writeStorage(localStorage, LAST_KNOWN_KEY, value);
      return value;
    })
    .catch((err) => {
      console.warn('[config] could not load site config', err);
      configPromise = null; // let the next call retry
      const lastKnown = readStorage(localStorage, LAST_KNOWN_KEY);
      configValue = lastKnown
        ? { ...lastKnown, source: 'cache' }
        : { currentSeasonId: null, previousSeasonId: null, phase: PHASES.OFFSEASON, openingDay: null, source: 'none', loadedAt: Date.now() };
      return configValue;
    });

  return configPromise;
}

/** The config from the last completed load, or null if none yet (no read). */
export function getSiteConfigSync() {
  return configValue;
}

/** Drop cached config so the next getSiteConfig() reads Firestore. */
export function clearSiteConfigCache() {
  configPromise = null;
  configValue = null;
  seasonsPromise = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export async function getCurrentSeasonId() {
  return (await getSiteConfig()).currentSeasonId;
}

export async function getPhase() {
  return (await getSiteConfig()).phase;
}

export async function isOffseason() {
  return (await getPhase()) === PHASES.OFFSEASON;
}

export async function isPlayoffs() {
  return (await getPhase()) === PHASES.PLAYOFFS;
}

/**
 * Season a page should show: ?season= in the URL when it is a valid season ID,
 * else the current season.
 */
export async function getSelectedSeasonId(param = 'season') {
  const fromUrl = new URLSearchParams(globalThis.location?.search || '').get(param);
  if (isSeasonId(fromUrl)) return fromUrl;
  return getCurrentSeasonId();
}
