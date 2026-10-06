// js/data/teams.js
// Team docs and the players currently on a team.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, doc, getDocs, getDoc, query, where } from '../core/firebase.js';

/**
 * Get all teams
 * @returns {Array} Array of team objects
 */
export async function getAllTeams() {
  const teamsSnapshot = await getDocs(collection(db, 'teams'));
  return teamsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get single team by ID
 * @param {string} teamId - Team ID (e.g., "black")
 * @returns {Object} Team object
 */
export async function getTeam(teamId) {
  const teamDoc = await getDoc(doc(db, 'teams', teamId));
  if (!teamDoc.exists()) {
    return null;
  }
  return {
    id: teamDoc.id,
    ...teamDoc.data()
  };
}

/**
 * Get players by team from aggregated collection (OPTIMIZED)
 * SKIPS migrated legacy profiles to prevent duplicates
 * @param {string} teamName - Team name
 * @returns {Array} Players on that team
 */
export async function getPlayersByTeamOptimized(teamName) {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const q = query(
      statsRef,
      where('currentTeam', '==', teamName)
    );
    
    const snapshot = await getDocs(q);
    
    const players = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      players.push({
        id: doc.id,
        ...data,
        playerId: doc.id,
        playerName: data.name
      });
    });
    
    return players;
    
  } catch (error) {
    console.error(`Error fetching players for team ${teamName}:`, error);
    return [];
  }
}
