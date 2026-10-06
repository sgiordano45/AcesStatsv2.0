// js/data/games.js
// Game docs (seasons/{seasonId}/games) and the older previews collection.
// Raw docs come back as stored; js/domain/standings.js and dates.js read them.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, doc, getDocs, getDocsFromServer, getDoc } from '../core/firebase.js';

/**
 * Get all games for a season
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Array} Array of game objects
 */
export async function getSeasonGames(seasonId) {
  // Always fetch from server so standings and results reflect the latest submitted scores,
  // bypassing any stale IndexedDB cache from earlier page loads.
  const gamesSnapshot = await getDocsFromServer(
    collection(db, 'seasons', seasonId, 'games')
  );
  return gamesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get all game previews for a season
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Array} Array of preview objects
 */
export async function getSeasonPreviews(seasonId) {
  try {
    const previewsSnapshot = await getDocs(
      collection(db, 'seasons', seasonId, 'previews')
    );
    
    const previews = previewsSnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firebase Timestamp to date string if needed
      let dateString = "";
      if (data.date && data.date.seconds) {
        const dateObj = new Date(data.date.seconds * 1000);
        dateString = dateObj.toLocaleDateString('en-US');
      } else if (data.date) {
        dateString = data.date;
      }
      
      return {
        id: doc.id,
        "home team": data.homeTeam || "",
        "away team": data.awayTeam || "",
        homeTeamId: data.homeTeamId || "",
        awayTeamId: data.awayTeamId || "",
        "home odds": data.homeOdds !== undefined ? data.homeOdds : null,
        "away odds": data.awayOdds !== undefined ? data.awayOdds : null,
        date: dateString,
        time: data.time || "",
        preview: data.preview || "",
        status: data.status || ""
      };
    });
    
    return previews;
    
  } catch (error) {
    console.error(`Error fetching previews for ${seasonId}:`, error);
    return [];
  }
}

/**
 * Get single game by ID
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @returns {Object} Game object
 */
export async function getGame(seasonId, gameId) {
  const gameDoc = await getDoc(doc(db, 'seasons', seasonId, 'games', gameId));
  if (!gameDoc.exists()) {
    return null;
  }
  return {
    id: gameDoc.id,
    ...gameDoc.data()
  };
}
