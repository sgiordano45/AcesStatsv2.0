// js/data/awards.js
// Award docs.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, getDocs, query, where } from '../core/firebase.js';

/**
 * Get all awards
 * @returns {Array} Array of award objects
 */
export async function getAllAwards() {
  const awardsSnapshot = await getDocs(collection(db, 'awards'));
  return awardsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get awards for a specific season
 * @param {string} seasonId - Season ID
 * @returns {Array} Array of awards
 */
export async function getSeasonAwards(seasonId) {
  const q = query(
    collection(db, 'awards'),
    where('seasonId', '==', seasonId)
  );
  const awardsSnapshot = await getDocs(q);
  return awardsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get all awards for a specific player
 * @param {string} playerName - The player's name
 * @returns {Promise<Array>} Array of award objects
 */
export async function getPlayerAwards(playerName) {
  try {
    const q = query(
      collection(db, 'awards'),
      where('playerName', '==', playerName)
    );
    const awardsSnapshot = await getDocs(q);
    
    const allAwards = awardsSnapshot.docs.map(doc => {
      const award = doc.data();
      return {
        id: doc.id,
        category: award.category,
        playerName: award.playerName,
        seasonId: award.seasonId,
        value: award.value,
        createdAt: award.createdAt,
        // Parse seasonId to get year and season for display
        year: award.seasonId ? award.seasonId.split('-')[0] : '',
        season: award.seasonId ? award.seasonId.split('-')[1] : ''
      };
    });
    
    // Sort by year (desc) then season
    allAwards.sort((a, b) => {
      if (a.year !== b.year) return b.year.localeCompare(a.year);
      return b.season.localeCompare(a.season);
    });
    
    return allAwards;
  } catch (error) {
    console.error('Error fetching player awards:', error);
    throw error;
  }
}
