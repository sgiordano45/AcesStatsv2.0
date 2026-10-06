// js/data/seasons.js
// Season docs. New code should prefer js/core/config.js (getSiteConfig,
// getSeasons), which caches and reads siteConfig/current first.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, getDocs, query, where } from '../core/firebase.js';

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
 * @returns {Object} Active season object
 */
export async function getCurrentSeason() {
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
