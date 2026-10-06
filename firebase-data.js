// firebase-data.js
// Helper functions to fetch data from Firebase

// Import Firebase configuration and initialized instances from firebase-config.js
// This ensures persistence is enabled BEFORE any Firestore operations
import {
  app,
  db,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  query,
  where,
  orderBy,
  limit
} from './firebase-config.js';

// Re-export app and db for firebase-auth.js and other files
export { app, db,doc, getDoc  };

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert player name to userId format
 * "John Doe" -> "john_doe"
 */
function nameToUserId(name) {
  return name.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Convert userId back to display name
 * "john_doe" -> "John Doe"
 */
function userIdToName(userId) {
  return userId.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Resolve player name to the correct player ID and data
 * Handles legacy profiles, merged profiles, and name variations
 * @param {string} searchName - The name being searched
 * @returns {Promise<Object|null>} Resolved player data with correct ID and name
 */
export async function resolvePlayerName(searchName) {
  try {
    console.log(`ðŸ” Resolving player name: "${searchName}"`);
    
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
      console.log(`âœ… Resolved "${searchName}" to "${result.name}" (ID: ${result.id}, Score: ${foundPlayer ? 100 : bestMatchScore})`);
      return {
        id: result.id,
        name: result.name || result.displayName,
        displayName: result.displayName || result.name,
        ...result
      };
    }
    
    console.warn(`âš ï¸ Could not resolve player name: "${searchName}"`);
    return null;
    
  } catch (error) {
    console.error('âŒ Error resolving player name:', error);
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
    console.error('âŒ Error getting player by identifier:', error);
    return null;
  }
}

// ============================================
// NEW: SEASON OBJECT HELPERS
// ============================================

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

// ============================================
// NEW: OPTIMIZED AGGREGATED STATS FUNCTIONS
// ============================================

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
    
    console.log(`Ã¢Å“â€œ Loaded ${players.length} players from aggregated collection (optimized)`);
    return players;
    
  } catch (error) {
    console.error('Error fetching aggregated player stats:', error);
    console.log('Falling back to original getAllPlayerStats()...');
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
    
    console.log(`Ã¢Å“â€œ Loaded ${pitchers.length} pitchers from aggregated collection (optimized)`);
    return pitchers;
    
  } catch (error) {
    console.error('Error fetching aggregated pitching stats:', error);
    console.log('Falling back to original method...');
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
    
    console.log(`Ã¢Å“â€œ Found ${players.length} players with stats for season ${seasonId}`);
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
    
    console.log(`Ã¢Å“â€œ Found ${players.length} players with pitching stats for season ${seasonId}`);
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
    
    console.log(`Ã¢Å“â€œ Found ${players.length} players matching "${searchTerm}"`);
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
    
    console.log(`Ã¢Å“â€œ Found ${players.length} players on team ${teamName}`);
    return players;
    
  } catch (error) {
    console.error(`Error fetching players for team ${teamName}:`, error);
    return [];
  }
}

// ============================================
// PLAYER FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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
      console.log(`No player found with name: ${playerName}`);
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

// ============================================
// TEAM FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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

// ============================================
// BATTING STATS FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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

// ============================================
// PITCHING STATS FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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

// ============================================
// GAMES FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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

// ============================================
// ADD THIS FUNCTION TO firebase-data.js
// ============================================
// Add after the getSeasonGames() function

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
    
    console.log(`Ã¢Å“â€¦ Loaded ${previews.length} previews for season ${seasonId}`);
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

// ============================================
// AWARDS FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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

// ============================================
// SEASON FUNCTIONS (ORIGINAL - PRESERVED)
// ============================================

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