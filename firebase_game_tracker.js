/**
 * Firebase Game Tracker Module
 * Handles fetching game-specific lineup data for the game tracker
 */

import { db } from './firebase-data.js';
import { doc, getDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Get the batting order for a specific game
 * @param {string} gameId - The game ID
 * @param {string} teamName - The team name
 * @returns {Promise<Array>} Array of player objects in batting order
 */
export async function getGameBattingOrder(gameId, teamName) {
  try {
    const battingOrderRef = doc(db, 'battingOrders', `${gameId}_${teamName}`);
    const battingOrderSnap = await getDoc(battingOrderRef);
    
    if (!battingOrderSnap.exists()) {
      console.log('No batting order found for this game');
      return [];
    }
    
    const data = battingOrderSnap.data();
    const playerIds = data.order || [];
    
    // Fetch player details for each ID
    const players = await Promise.all(
      playerIds.map(async (playerId) => {
        if (!playerId) return null;
        
        try {
          const playerDoc = await getDoc(doc(db, 'users', playerId));
          if (playerDoc.exists()) {
            const playerData = playerDoc.data();
            return {
              id: playerId,
              name: playerData.linkedPlayer || playerData.displayName,
              number: playerData.number || '0',
              position: playerData.position || 'IF/OF'
            };
          }
        } catch (error) {
          console.warn(`Could not fetch player ${playerId}:`, error);
        }
        return null;
      })
    );
    
    return players.filter(p => p !== null);
  } catch (error) {
    console.error('Error fetching batting order:', error);
    return [];
  }
}

/**
 * Get defensive positions for all innings of a game
 * @param {string} gameId - The game ID
 * @param {string} teamName - The team name
 * @returns {Promise<Object>} Object mapping innings to positions to players
 */
export async function getGameDefensivePositions(gameId, teamName) {
  try {
    const positionsRef = doc(db, 'fieldingPositions', `${gameId}_${teamName}`);
    const positionsSnap = await getDoc(positionsRef);
    
    if (!positionsSnap.exists()) {
      console.log('No defensive positions found for this game');
      return {};
    }
    
    const data = positionsSnap.data();
    const innings = data.innings || {};
    
    // Convert player IDs to player objects for each inning/position
    const defensiveLineup = {};
    
    for (const [inning, positions] of Object.entries(innings)) {
      defensiveLineup[inning] = {};
      
      for (const [position, playerData] of Object.entries(positions)) {
        if (playerData && playerData.id) {
          defensiveLineup[inning][position] = {
            id: playerData.id,
            name: playerData.name,
            number: playerData.number || '0',
            position: position
          };
        }
      }
    }
    
    return defensiveLineup;
  } catch (error) {
    console.error('Error fetching defensive positions:', error);
    return {};
  }
}

/**
 * Get bench players for all innings of a game
 * @param {string} gameId - The game ID
 * @param {string} teamName - The team name
 * @returns {Promise<Object>} Object mapping innings to arrays of bench players
 */
export async function getGameBenchPlayers(gameId, teamName) {
  try {
    const benchRef = doc(db, 'benchPlayers', `${gameId}_${teamName}`);
    const benchSnap = await getDoc(benchRef);
    
    if (!benchSnap.exists()) {
      console.log('No bench players found for this game');
      return {};
    }
    
    const data = benchSnap.data();
    return data.innings || {};
  } catch (error) {
    console.error('Error fetching bench players:', error);
    return {};
  }
}

/**
 * Get RSVPs for a specific game
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} Object mapping player IDs to RSVP status
 */
export async function getGameRSVPs(gameId) {
  try {
    const rsvpRef = doc(db, 'gameRSVPs', gameId);
    const rsvpSnap = await getDoc(rsvpRef);
    
    if (!rsvpSnap.exists()) {
      console.log('No RSVPs found for this game');
      return {};
    }
    
    return rsvpSnap.data().rsvps || {};
  } catch (error) {
    console.error('Error fetching RSVPs:', error);
    return {};
  }
}

/**
 * Get complete game lineup data (batting order, defense, bench, RSVPs)
 * @param {string} gameId - The game ID
 * @param {string} teamName - The team name
 * @returns {Promise<Object>} Complete lineup data
 */
export async function getCompleteGameLineup(gameId, teamName) {
  try {
    const [battingOrder, defensivePositions, benchPlayers, rsvps] = await Promise.all([
      getGameBattingOrder(gameId, teamName),
      getGameDefensivePositions(gameId, teamName),
      getGameBenchPlayers(gameId, teamName),
      getGameRSVPs(gameId)
    ]);
    
    return {
      battingOrder,
      defensivePositions,
      benchPlayers,
      rsvps,
      gameId,
      teamName
    };
  } catch (error) {
    console.error('Error fetching complete game lineup:', error);
    return {
      battingOrder: [],
      defensivePositions: {},
      benchPlayers: {},
      rsvps: {},
      gameId,
      teamName
    };
  }
}

/**
 * Check if a lineup has been set for a game
 * @param {string} gameId - The game ID
 * @param {string} teamName - The team name
 * @returns {Promise<boolean>} True if lineup exists
 */
export async function hasLineupBeenSet(gameId, teamName) {
  try {
    const battingOrderRef = doc(db, 'battingOrders', `${gameId}_${teamName}`);
    const battingOrderSnap = await getDoc(battingOrderRef);
    return battingOrderSnap.exists();
  } catch (error) {
    console.error('Error checking lineup:', error);
    return false;
  }
}

/**
 * Get team roster from rosters collection for use in game tracker.
 * Uses rosters/{seasonId}-{teamName} as single source of truth —
 * works before any stats exist (new season, missed game 1, etc.)
 *
 * Returns players shaped for game-tracker's battingOrder/players state:
 *   id       — legacy snake_case ID (e.g. "ralph_pombo") — matches batting order storage
 *   authId   — Firebase Auth UID (for permission checks)
 *   name     — display name (e.g. "Ralph Pombo")
 *   number   — jersey number string, or '' if not set
 *   position — position string
 *   avatar   — 2-char initials for display
 *   battingAvg — '.000' placeholder (stats come from aggregatedPlayerStats, not roster)
 *
 * @param {string} teamName - Team name (e.g. "Teal", "Army") — case insensitive
 * @param {string} seasonId - Season ID (e.g. "2026-summer")
 * @returns {Promise<Array>} Array of player objects
 */
export async function getTeamRosterForTracker(teamName, seasonId) {
  try {
    const docId = `${seasonId}-${teamName.toLowerCase()}`;
    const rosterRef = doc(db, 'rosters', docId);
    const snap = await getDoc(rosterRef);

    if (!snap.exists()) {
      console.warn(`getTeamRosterForTracker: no roster doc at rosters/${docId}`);
      return [];
    }

    const players = (snap.data().players || [])
      .filter(p => p.name) // skip empty entries
      .map((p, index) => {
        const name = p.name.trim();
        const nameParts = name.split(' ');
        const avatar = nameParts.length > 1
          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
          : name.substring(0, 2).toUpperCase();

        return {
          id: p.id || '',           // snake_case legacy ID — matches lineups/ batting order
          authId: p.authId || '',   // Firebase Auth UID
          name,
          number: p.number ? String(p.number) : '',
          position: p.position || 'IF/OF',
          avatar,
          battingAvg: '.000'        // placeholder — tracker doesn't need live avg
        };
      });

    console.log(`getTeamRosterForTracker: loaded ${players.length} players from rosters/${docId}`);
    return players;

  } catch (error) {
    console.error('getTeamRosterForTracker error:', error);
    return [];
  }
}
