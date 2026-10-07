// js/data/summaries.js
// The home page's season summary (js/domain/summary.js), stored by the
// buildSeasonSummary Cloud Function at siteConfig/summaries/seasons/{seasonId}.
//
//   const { summary, source } = await getSeasonSummary('2026-fall');
//   source: 'stored' (one doc read) | 'browser' (built here from the games and
//   player stats, when the doc is missing, from an older SUMMARY_VERSION, or
//   older than MAX_AGE_HOURS)
//
// The browser never writes the doc; the function (and its admin Rebuild call) do.

import { db, doc, getDoc, functions } from '../core/firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { getSeasonGames } from './games.js';
import { getAllPlayerStatsOptimized } from './player-stats.js';
import { buildSeasonSummary, SUMMARY_VERSION } from '../domain/summary.js';

export const MAX_AGE_HOURS = 24;

export const summaryRef = (seasonId) => doc(db, 'siteConfig', 'summaries', 'seasons', seasonId);

function isFresh(s) {
  if (!s || s.version !== SUMMARY_VERSION) return false;
  const built = Date.parse(s.builtAt || '');
  return Number.isFinite(built) && Date.now() - built < MAX_AGE_HOURS * 3600 * 1000;
}

/** Builds the summary in the browser (about 300 reads). */
export async function buildSummaryHere(seasonId) {
  const [games, players] = await Promise.all([getSeasonGames(seasonId), getAllPlayerStatsOptimized()]);
  return buildSeasonSummary({ seasonId, games, players });
}

export async function getSeasonSummary(seasonId, { allowBuild = true } = {}) {
  if (!seasonId) return { summary: null, source: 'none' };
  try {
    const snap = await getDoc(summaryRef(seasonId));
    const stored = snap.exists() ? snap.data() : null;
    if (isFresh(stored)) return { summary: stored, source: 'stored' };
    if (!allowBuild && stored) return { summary: stored, source: 'stored-old' };
  } catch (err) {
    console.warn('[summaries] stored summary unavailable; building here', err);
  }
  return { summary: await buildSummaryHere(seasonId), source: 'browser' };
}

/** Admin / league staff: ask the Cloud Function to rebuild and store the summary now. */
export async function rebuildSeasonSummary(seasonId) {
  const call = httpsCallable(functions, 'rebuildSeasonSummary');
  const res = await call({ seasonId });
  return res.data;
}
