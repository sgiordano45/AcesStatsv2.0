// js/data/seasons.js
// Season docs. New code should prefer js/core/config.js (getSiteConfig,
// getSeasons), which caches and reads siteConfig/current first.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, getDocs, query, where, doc, getDoc } from '../core/firebase.js';
import { getSiteConfig, PHASES } from '../core/config.js';

/**
 * Get all seasons
 * @returns {Array} Array of season objects
 */
export async function getAllSeasons() {
  const seasonsSnapshot = await getDocs(collection(db, 'seasons'));
  return seasonsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get the current active season
 * The season named by siteConfig/current (null during the offseason, as when
 * no season is marked isActive). Without that doc, the season marked isActive.
 * @returns {Object} Active season object
 */
export async function getCurrentSeason() {
  try {
    const { currentSeasonId, phase, source } = await getSiteConfig();
    if (source === 'siteConfig') {
      if (!currentSeasonId || phase === PHASES.OFFSEASON) return null;
      const snap = await getDoc(doc(db, 'seasons', currentSeasonId));
      if (snap.exists()) return { id: snap.id, ...snap.data() };
      console.warn(`[seasons] siteConfig/current names ${currentSeasonId}, which has no seasons doc; using isActive`);
    }
  } catch (err) {
    console.warn('[seasons] site config unavailable; using isActive', err);
  }
  return getActiveFlaggedSeason();
}

// The season marked isActive (how the current season was found before
// siteConfig/current, and still how Cloud Functions find it).
async function getActiveFlaggedSeason() {
  const q = query(
    collection(db, 'seasons'),
    where('isActive', '==', true)
  );
  const seasonsSnapshot = await getDocs(q);
  
  if (seasonsSnapshot.empty) {
    return null;
  }
  
  const seasonDoc = seasonsSnapshot.docs[0];
  return {
    id: seasonDoc.id,
    ...seasonDoc.data()
  };
}
