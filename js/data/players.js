// js/data/players.js
// Player profiles in the users collection (display name, number, bats/throws).
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, doc, getDocs, getDoc } from '../core/firebase.js';

/** "john_doe" -> "John Doe" */
function userIdToName(userId) {
  return userId.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Get all players
 * @returns {Array} Array of player objects
 */
export async function getAllPlayers() {
  const playersSnapshot = await getDocs(collection(db, 'users'));
  return playersSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    displayName: doc.data().displayName || userIdToName(doc.id)
  }));
}

/**
 * Get single player by ID
 * @param {string} userId - Player ID (e.g., "john_doe")
 * @returns {Object} Player object
 */
export async function getPlayer(userId) {
  const playerDoc = await getDoc(doc(db, 'users', userId));
  if (!playerDoc.exists()) {
    return null;
  }
  return {
    id: playerDoc.id,
    ...playerDoc.data(),
    displayName: playerDoc.data().displayName || userIdToName(playerDoc.id)
  };
}

/**
 * Search players by name
 * @param {string} searchTerm - Name to search for
 * @returns {Array} Matching players
 */
export async function searchPlayers(searchTerm) {
  const players = await getAllPlayers();
  const term = searchTerm.toLowerCase();
  return players.filter(p =>
    p.displayName.toLowerCase().includes(term)
  );
}

/**
 * Get player info by display name
 * @param {string} playerName - The player's display name
 * @returns {Promise<Object|null>} Player info object or null
 */
export async function getPlayerInfo(playerName) {
  try {
    const players = await getAllPlayers();
    const player = players.find(p => p.displayName === playerName);
    
    if (!player) {
      return null;
    }
    
    return {
      id: player.id,
      displayName: player.displayName,
      number: player.number,
      nickname: player.nickname,
      photo: player.photo,
      bats: player.bats || player.batting,
      throws: player.throws || player.throwing,
      position: player.position,
      captain: player.captain
    };
  } catch (error) {
    console.error('Error fetching player info:', error);
    return null;
  }
}
