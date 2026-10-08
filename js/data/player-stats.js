// js/data/player-stats.js
// Batting and pitching stats: aggregatedPlayerStats (one doc per player, seasons
// keyed '2026-summer-teal') plus the older playerStats / pitchingStats
// subcollection reads. Migrated legacy profiles (migrated: true) are skipped.
// Moved unchanged from firebase-data.js; firebase-data.js re-exports these.

import { db, collection, doc, getDocs, getDoc } from '../core/firebase.js';
import { getAllPlayers, searchPlayers } from './players.js';

/**
 * Resolve player name to the correct player ID and data
 * Handles legacy profiles, merged profiles, and name variations
 * @param {string} searchName - The name being searched
 * @returns {Promise<Object|null>} Resolved player data with correct ID and name
 */
export async function resolvePlayerName(searchName) {
  try {
    
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const searchLower = searchName.toLowerCase();
    const searchNormalized = searchName.toLowerCase().replace(/\s+/g, '_');
    
    let foundPlayer = null;
    let bestMatch = null;
    let bestMatchScore = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      const dataName = (data.name || data.displayName || '').toLowerCase();
      const dataNameNormalized = dataName.replace(/\s+/g, '_');
      
      // Exact match - highest priority
      if (dataName === searchLower) {
        foundPlayer = { id: doc.id, ...data };
        return;
      }
      
      // Normalized match (steve_giordano = Steve Giordano)
      if (dataNameNormalized === searchNormalized) {
        if (bestMatchScore < 90) {
          bestMatch = { id: doc.id, ...data };
          bestMatchScore = 90;
        }
      }
      
      // Partial match with scoring
      const searchParts = searchLower.split(/\s+/);
      const dataParts = dataName.split(/\s+/);
      
      if (searchParts.length >= 2 && dataParts.length >= 2) {
        const lastNameMatch = searchParts[searchParts.length - 1] === dataParts[dataParts.length - 1];
        const firstNameMatch = searchParts[0] === dataParts[0];
        const firstNamePartial = searchParts[0].startsWith(dataParts[0]) || dataParts[0].startsWith(searchParts[0]);
        
        let score = 0;
        if (lastNameMatch) score += 50;
        if (firstNameMatch) score += 40;
        else if (firstNamePartial) score += 30;
        
        if (score > bestMatchScore) {
          bestMatch = { id: doc.id, ...data };
          bestMatchScore = score;
        }
      }
    });
    
    const result = foundPlayer || bestMatch;
    
    if (result) {
      return {
        id: result.id,
        name: result.name || result.displayName,
        displayName: result.displayName || result.name,
        ...result
      };
    }
    
    console.warn(`Could not resolve player name: "${searchName}"`);
    return null;
    
  } catch (error) {
    console.error('Error resolving player name:', error);
    return null;
  }
}

/**
 * Get player by ID or name (with resolution)
 * @param {string} identifier - Player ID or name
 * @returns {Promise<Object|null>} Player data
 */
export async function getPlayerByIdentifier(identifier) {
  try {
    // First, try as ID
    const playerData = await getPlayerStatsOptimized(identifier);
    if (playerData && !playerData.migrated) {
      return playerData;
    }
    
    // If not found or migrated, try resolving as name
    return await resolvePlayerName(identifier);
    
  } catch (error) {
    console.error('Error getting player by identifier:', error);
    return null;
  }
}

/**
 * Get a specific season's stats from player data
 * @param {Object} playerData - Player object from aggregatedPlayerStats
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Object|null} Season stats or null if not found
 */
export function getSeasonFromPlayer(playerData, seasonId) {
  if (!playerData || !playerData.seasons) {
    return null;
  }
  return playerData.seasons[seasonId] || null;
}

/**
 * Get a specific season's pitching stats from player data
 * @param {Object} playerData - Player object from aggregatedPlayerStats
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Object|null} Season pitching stats or null if not found
 */
export function getPitchingSeasonFromPlayer(playerData, seasonId) {
  if (!playerData || !playerData.pitchingSeasons) {
    return null;
  }
  return playerData.pitchingSeasons[seasonId] || null;
}

/**
 * Get all season IDs for a player (sorted by most recent first)
 * @param {Object} playerData - Player object from aggregatedPlayerStats
 * @returns {Array<string>} Array of season IDs
 */
export function getPlayerSeasonIds(playerData) {
  if (!playerData || !playerData.seasons) {
    return [];
  }
  // Sort season IDs in reverse chronological order
  return Object.keys(playerData.seasons).sort().reverse();
}

/**
 * Convert seasons object to array format (for backwards compatibility)
 * @param {Object} playerData - Player object from aggregatedPlayerStats
 * @returns {Array} Array of season objects with seasonId included
 */
export function seasonsObjectToArray(playerData) {
  if (!playerData || !playerData.seasons) {
    return [];
  }
  
  return Object.entries(playerData.seasons).map(([seasonId, stats]) => ({
    seasonId,
    ...stats
  })).sort((a, b) => b.seasonId.localeCompare(a.seasonId)); // Most recent first
}

/**
 * Convert pitching seasons object to array format
 * @param {Object} playerData - Player object from aggregatedPlayerStats
 * @returns {Array} Array of pitching season objects with seasonId included
 */
export function pitchingSeasonsObjectToArray(playerData) {
  if (!playerData || !playerData.pitchingSeasons) {
    return [];
  }
  
  return Object.entries(playerData.pitchingSeasons).map(([seasonId, stats]) => ({
    seasonId,
    ...stats
  })).sort((a, b) => b.seasonId.localeCompare(a.seasonId));
}

/**
 * Get all player stats from aggregated collection (OPTIMIZED - FAST!)
 * Uses single collection instead of subcollections
 * FAST: 1-50 reads vs 100-500 reads with original function
 * SKIPS migrated legacy profiles to prevent duplicates
 * @returns {Array} Array of player objects with complete stats
 */
export async function getAllPlayerStatsOptimized() {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
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
    console.error('Error fetching aggregated player stats:', error);
    return await getAllPlayerStats(); // Fallback to original
  }
}

/**
 * Get all pitching stats from aggregated collection (OPTIMIZED - FAST!)
 * Uses single collection instead of subcollections
 * FAST: 1-50 reads vs 100-500 reads with original function
 * SKIPS migrated legacy profiles to prevent duplicates
 * @returns {Array} Array of player objects with complete pitching stats
 */
export async function getAllPitchingStatsOptimized() {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const pitchers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      // Only include players who have pitching data
      if (data.pitchingSeasons && Object.keys(data.pitchingSeasons).length > 0) {
        pitchers.push({
          id: doc.id,
          ...data,
          playerId: doc.id,
          playerName: data.name
        });
      }
    });
    
    return pitchers;
    
  } catch (error) {
    console.error('Error fetching aggregated pitching stats:', error);
    return [];
  }
}

/**
 * Get single player's complete stats from aggregated collection (OPTIMIZED - FAST!)
 * FAST: 1 read vs 10-20 reads with original function
 * @param {string} userId - Player ID
 * @returns {Object} Player object with career and all season stats
 */
export async function getPlayerStatsOptimized(userId) {
  try {
    const playerRef = doc(db, 'aggregatedPlayerStats', userId);
    const playerSnap = await getDoc(playerRef);
    
    if (playerSnap.exists()) {
      const data = playerSnap.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        console.warn(`Player ${userId} is a migrated legacy profile, skipping`);
        return null;
      }
      
      return {
        id: playerSnap.id,
        ...data,
        playerId: playerSnap.id,
        playerName: data.name
      };
    }
    
    console.warn(`No aggregated stats found for player ${userId}, using original method`);
    return null;
    
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return null;
  }
}

/**
 * Get ALL players' stats for a specific season from aggregated collection (FIXED!)
 * Handles team-specific season keys like "2025-fall-orange", "2025-fall-blue"
 * SKIPS migrated legacy profiles to prevent duplicates
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Array} Array of player stats for that season
 */
export async function getSeasonPlayerStatsOptimized(seasonId) {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const players = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      // Check if player has stats for this season
      if (!data.seasons) return;
      
      // Find season keys that start with the seasonId (e.g., "2025-fall")
      // This matches "2025-fall-orange", "2025-fall-blue", etc.
      const matchingKeys = Object.keys(data.seasons).filter(key =>
        key.startsWith(seasonId) && !key.endsWith('-sub')  // skip substitute-appearance entries
      );
      
      // If player has stats for this season (any team)
      if (matchingKeys.length > 0) {
        // Use the first matching key (player's most recent team for this season)
        const seasonKey = matchingKeys[0];
        const seasonStats = data.seasons[seasonKey];
        
        // Extract team from the season key (e.g., "2025-fall-orange" -> "orange")
        const teamFromKey = seasonKey.split('-').slice(2).join('-');

        players.push({
          id: doc.id,
          playerId: doc.id,
          playerName: data.name || data.displayName || doc.id,
          name: data.name || data.displayName || doc.id,
          email: data.email || '',
          currentTeam: teamFromKey || data.currentTeam || '',
          team: teamFromKey || seasonStats.team || data.currentTeam || '',
          photoURL: data.photoURL || '',
          // Auth user info for legacyId resolution
          linkedPlayer: data.linkedPlayer || null,
          isAuthUser: data.isAuthUser || false,
          // Include the specific season stats (includes vsOpponent for that season)
          ...seasonStats,
          // Also include career vsOpponent for historical context
          careerVsOpponent: data.career?.vsOpponent || {},
          seasonId: seasonId,
          seasonKey: seasonKey // Keep track of full key for debugging
        });
      }
    });
    
    return players;
    
  } catch (error) {
    console.error(`Error fetching season stats for ${seasonId}:`, error);
    return [];
  }
}

/**
 * Get ALL pitching stats for a season from aggregated collection (FIXED!)
 * Handles team-specific season keys like "2025-fall-orange", "2025-fall-blue"
 * SKIPS migrated legacy profiles to prevent duplicates
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Array} Array of pitching stats for that season
 */
export async function getSeasonPitchingStatsOptimized(seasonId) {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const players = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      // Check if player has pitching stats for this season
      if (!data.pitchingSeasons) return;
      
      // Find season keys that start with the seasonId
      const matchingKeys = Object.keys(data.pitchingSeasons).filter(key =>
        key.startsWith(seasonId)
      );
      
      // If player has pitching stats for this season (any team)
      if (matchingKeys.length > 0) {
        // Use the first matching key
        const seasonKey = matchingKeys[0];
        const seasonStats = data.pitchingSeasons[seasonKey];
        
        // Extract team from the season key
        const teamFromKey = seasonKey.split('-').slice(2).join('-');

        players.push({
          id: doc.id,
          playerId: doc.id,
          playerName: data.name || data.displayName || doc.id,
          name: data.name || data.displayName || doc.id,
          email: data.email || '',
          currentTeam: teamFromKey || data.currentTeam || '',
          team: teamFromKey || seasonStats.team || data.currentTeam || '',
          photoURL: data.photoURL || '',
          // Include the specific season pitching stats
          ...seasonStats,
          seasonId: seasonId,
          seasonKey: seasonKey
        });
      }
    });
    
    return players;
    
  } catch (error) {
    console.error(`Error fetching pitching stats for ${seasonId}:`, error);
    return [];
  }
}

/**
 * Search players by name using aggregated collection (OPTIMIZED)
 * SKIPS migrated legacy profiles to prevent duplicates
 * @param {string} searchTerm - Name to search for
 * @returns {Array} Matching players with stats
 */
export async function searchPlayersOptimized(searchTerm) {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const players = [];
    const lowerSearch = searchTerm.toLowerCase();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      if (data.name && data.name.toLowerCase().includes(lowerSearch)) {
        players.push({
          id: doc.id,
          ...data,
          playerId: doc.id,
          playerName: data.name
        });
      }
    });
    
    return players;
    
  } catch (error) {
    console.error('Error searching players:', error);
    return await searchPlayers(searchTerm); // Fallback
  }
}

/**
 * Get top players by a specific stat from aggregated collection (OPTIMIZED)
 * SKIPS migrated legacy profiles to prevent duplicates
 * @param {string} statPath - Path to stat (e.g., 'career.battingAverage')
 * @param {number} limitCount - Number of top players to return
 * @param {number} minGames - Minimum games played to qualify (default: 0)
 * @returns {Array} Top players sorted by stat
 */
export async function getTopPlayersByStat(statPath, limitCount = 10, minGames = 0) {
  try {
    const statsRef = collection(db, 'aggregatedPlayerStats');
    const snapshot = await getDocs(statsRef);
    
    const players = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // CRITICAL: Skip migrated legacy profiles
      if (data.migrated === true) {
        return;
      }
      
      // Filter by minimum games if specified
      if (minGames > 0 && (!data.career || data.career.games < minGames)) {
        return;
      }
      
      players.push({
        id: doc.id,
        ...data,
        playerId: doc.id,
        playerName: data.name
      });
    });
    
    // Get the stat value from nested path (e.g., 'career.battingAverage')
    const getNestedValue = (obj, path) => {
      return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };
    
    // Sort by the stat
    players.sort((a, b) => {
      const aVal = getNestedValue(a, statPath) || 0;
      const bVal = getNestedValue(b, statPath) || 0;
      return bVal - aVal; // Descending
    });
    
    return players.slice(0, limitCount);
    
  } catch (error) {
    console.error(`Error fetching top players by ${statPath}:`, error);
    return [];
  }
}

/**
 * Get top players for a specific season and stat (OPTIMIZED!)
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @param {string} statName - Stat name (e.g., 'battingAverage', 'hits', 'runs')
 * @param {number} limitCount - Number of top players to return
 * @param {number} minAtBats - Minimum at-bats to qualify (default: 0)
 * @returns {Array} Top players for that season sorted by stat
 */
export async function getTopSeasonPlayersByStat(seasonId, statName, limitCount = 10, minAtBats = 0) {
  try {
    const seasonPlayers = await getSeasonPlayerStatsOptimized(seasonId);
    
    // Filter by minimum at-bats if specified
    const qualifiedPlayers = minAtBats > 0
      ? seasonPlayers.filter(p => (p.atBats || 0) >= minAtBats)
      : seasonPlayers;
    
    // Sort by the stat
    qualifiedPlayers.sort((a, b) => {
      const aVal = a[statName] || 0;
      const bVal = b[statName] || 0;
      return bVal - aVal; // Descending
    });
    
    return qualifiedPlayers.slice(0, limitCount);
    
  } catch (error) {
    console.error(`Error fetching top players for season ${seasonId} by ${statName}:`, error);
    return [];
  }
}

/**
 * Get player's career batting stats
 * @param {string} userId - Player ID
 * @returns {Object} Career stats
 */
export async function getPlayerCareerStats(userId) {
  const statsDoc = await getDoc(doc(db, 'playerStats', userId, 'career', 'overall'));
  if (!statsDoc.exists()) {
    return null;
  }
  return statsDoc.data();
}

/**
 * Get player's batting stats for a specific season
 * @param {string} userId - Player ID
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Object} Season stats
 */
export async function getPlayerSeasonStats(userId, seasonId) {
  const statsDoc = await getDoc(doc(db, 'playerStats', userId, 'seasons', seasonId));
  if (!statsDoc.exists()) {
    return null;
  }
  return statsDoc.data();
}

/**
 * Get ALL players' stats for a specific season (ORIGINAL - SLOWER)
 * Use getSeasonPlayerStatsOptimized() for better performance
 * @param {string} seasonId - Season ID (e.g., "2025-fall")
 * @returns {Array} Array of player stats
 */
export async function getSeasonPlayerStats(seasonId) {
  const players = await getAllPlayers();
  const statsPromises = players.map(async (player) => {
    const seasonStats = await getPlayerSeasonStats(player.id, seasonId);
    if (!seasonStats) return null;
    
    return {
      ...player,
      ...seasonStats,
      playerId: player.id,
      playerName: player.displayName
    };
  });
  
  const results = await Promise.all(statsPromises);
  return results.filter(stat => stat !== null);
}

/**
 * Get ALL players' career stats (ORIGINAL - SLOWER)
 * Use getAllPlayerStatsOptimized() for better performance
 * @returns {Array} Array of player career stats
 */
export async function getAllPlayerStats() {
  const players = await getAllPlayers();
  const statsPromises = players.map(async (player) => {
    const careerStats = await getPlayerCareerStats(player.id);
    if (!careerStats) return null;
    
    return {
      ...player,
      ...careerStats,
      playerId: player.id,
      playerName: player.displayName
    };
  });
  
  const results = await Promise.all(statsPromises);
  return results.filter(stat => stat !== null);
}

/**
 * Get player's career pitching stats
 * @param {string} userId - Player ID
 * @returns {Object} Career pitching stats
 */
export async function getPlayerCareerPitching(userId) {
  const statsDoc = await getDoc(doc(db, 'pitchingStats', userId, 'career', 'overall'));
  if (!statsDoc.exists()) {
    return null;
  }
  return statsDoc.data();
}

/**
 * Get player's pitching stats for a specific season
 * @param {string} userId - Player ID
 * @param {string} seasonId - Season ID
 * @returns {Object} Season pitching stats
 */
export async function getPlayerSeasonPitching(userId, seasonId) {
  const statsDoc = await getDoc(doc(db, 'pitchingStats', userId, 'seasons', seasonId));
  if (!statsDoc.exists()) {
    return null;
  }
  return statsDoc.data();
}

/**
 * Get ALL pitching stats for a season (ORIGINAL - SLOWER)
 * Use getSeasonPitchingStatsOptimized() for better performance
 * @param {string} seasonId - Season ID
 * @returns {Array} Array of pitching stats
 */
export async function getSeasonPitchingStats(seasonId) {
  const players = await getAllPlayers();
  const statsPromises = players.map(async (player) => {
    const seasonStats = await getPlayerSeasonPitching(player.id, seasonId);
    if (!seasonStats) return null;
    
    return {
      ...player,
      ...seasonStats,
      playerId: player.id,
      playerName: player.displayName
    };
  });
  
  const results = await Promise.all(statsPromises);
  return results.filter(stat => stat !== null);
}

/**
 * The aggregatedPlayerStats doc for a signed-in user, or null. Accounts link
 * to stats in a few ways over the years, so try each quietly in order:
 * profile.playerId, the auth UID (users/{uid} id), mergedFromProfile (the
 * legacy ID), then linkedPlayer as an ID or as a name ("Steve Giordano" ->
 * steve_giordano). Migrated legacy docs are skipped.
 * @param {object} profile users/{uid} doc as { id, ...data }
 * @param {string} [uid]
 */
export async function findPlayerStatsForUser(profile, uid) {
  const linked = String(profile?.linkedPlayer || '').trim();
  const ids = [
    profile?.playerId,
    uid || profile?.uid || profile?.id,
    profile?.mergedFromProfile,
    linked && !/\s/.test(linked) ? linked : '',
    linked ? linked.toLowerCase().replace(/\s+/g, '_') : ''
  ].filter(Boolean);
  for (const id of [...new Set(ids)]) {
    try {
      const snap = await getDoc(doc(db, 'aggregatedPlayerStats', id));
      if (!snap.exists() || snap.data().migrated === true) continue;
      const data = snap.data();
      return { id: snap.id, ...data, playerId: snap.id, playerName: data.name };
    } catch (err) {
      console.warn(`[player-stats] lookup ${id} failed`, err);
    }
  }
  return null;
}
