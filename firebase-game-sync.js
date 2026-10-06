// firebase-game-sync.js
// Real-time game tracking synchronization for dual-team tracking
// Uses /seasons/{seasonId}/games/{gameId}/ structure exclusively

import { db } from './firebase-data.js';
import { 
    doc, 
    collection, 
    setDoc, 
    getDoc, 
    onSnapshot, 
    serverTimestamp, 
    deleteDoc,
    query,
    where,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Subscribe to game metadata (inning, outs, scores)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {function} callback - Called with metadata updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToGameMetadata(seasonId, gameId, callback) {
    try {
        const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
        
        return onSnapshot(metadataRef, 
            (snapshot) => {
                if (snapshot.exists()) {
                    console.log('[SYNC] Game metadata updated:', snapshot.data());
                    callback(snapshot.data());
                } else {
                    // Initialize with default values
                    callback({
                        inning: 1,
                        outs: 0,
                        homeScore: 0,
                        awayScore: 0,
                        lastUpdated: null
                    });
                }
            },
            (error) => {
                console.error('Error subscribing to game metadata:', error);
                callback(null);
            }
        );
    } catch (error) {
        console.error('Error setting up metadata subscription:', error);
        return () => {};
    }
}

/**
 * Subscribe to presence tracking (who's actively tracking)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {function} callback - Called with presence updates (array of trackers)
 * @returns {function} Unsubscribe function
 */
export function subscribeToPresence(seasonId, gameId, callback) {
    try {
        const presenceRef = collection(db, 'seasons', seasonId, 'games', gameId, 'presence');
        
        return onSnapshot(presenceRef,
            (snapshot) => {
                const trackers = [];
                snapshot.forEach(doc => {
                    trackers.push({
                        userId: doc.id,
                        ...doc.data()
                    });
                });
                console.log('[PRESENCE] Active trackers:', trackers.length);
                callback(trackers);
            },
            (error) => {
                console.error('Error subscribing to presence:', error);
                callback([]);
            }
        );
    } catch (error) {
        console.error('Error setting up presence subscription:', error);
        return () => {};
    }
}

/**
 * Subscribe to game state for a specific team
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} teamId - Team ID
 * @param {function} callback - Called with game state updates
 * @returns {function} Unsubscribe function
 */
export function subscribeToGameState(seasonId, gameId, teamId, callback) {
    try {
        const gameStateRef = doc(db, 'seasons', seasonId, 'games', gameId, 'gameState', teamId);
        
        return onSnapshot(gameStateRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    console.log(`[SYNC] Game state updated for team ${teamId}:`, {
                        inning: data.inning,
                        atBats: data.atBats?.length || 0,
                        plays: data.plays?.length || 0
                    });
                    callback(data);
                } else {
                    // Initialize with empty state
                    callback({
                        teamId,
                        atBats: [],
                        plays: [],
                        lastUpdated: null
                    });
                }
            },
            (error) => {
                console.error(`Error subscribing to game state for team ${teamId}:`, error);
                callback(null);
            }
        );
    } catch (error) {
        console.error('Error setting up game state subscription:', error);
        return () => {};
    }
}

/**
 * Update game metadata
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {object} metadata - Metadata to update (inning, outs, scores)
 */
export async function updateGameMetadata(seasonId, gameId, metadata) {
    try {
        const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
        
        await setDoc(metadataRef, {
            ...metadata,
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        console.log('[SYNC] Game metadata updated:', metadata);
    } catch (error) {
        console.error('Error updating game metadata:', error);
        throw error;
    }
}

/**
 * Update game state for a team
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} teamId - Team ID
 * @param {object} gameState - Complete game state
 */
export async function updateGameState(seasonId, gameId, teamId, gameState) {
    try {
        const gameStateRef = doc(db, 'seasons', seasonId, 'games', gameId, 'gameState', teamId);
        
        await setDoc(gameStateRef, {
            ...gameState,
            teamId,
            lastUpdated: serverTimestamp()
        });
        
        console.log(`[SYNC] Game state saved for team ${teamId}`);
    } catch (error) {
        console.error(`Error updating game state for team ${teamId}:`, error);
        throw error;
    }
}

/**
 * Update user presence (mark user as actively tracking)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {string} teamId - Team being tracked
 * @param {string} userName - User's display name
 * @param {string} role - 'tracker' or 'viewer'
 */
export async function updatePresence(seasonId, gameId, userId, teamId, userName, role = 'tracker') {
    try {
        const presenceRef = doc(db, 'seasons', seasonId, 'games', gameId, 'presence', userId);
        
        await setDoc(presenceRef, {
            userId,
            teamId,
            userName,
            role,
            lastSeen: serverTimestamp()
        });
        
        console.log(`[PRESENCE] Updated for ${userName} (${role}) tracking ${teamId}`);
    } catch (error) {
        console.error('Error updating presence:', error);
        throw error;
    }
}

/**
 * Remove user presence (user stopped tracking)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 */
export async function removePresence(seasonId, gameId, userId) {
    try {
        const presenceRef = doc(db, 'seasons', seasonId, 'games', gameId, 'presence', userId);
        await deleteDoc(presenceRef);
        
        console.log(`[PRESENCE] Removed for user ${userId}`);
    } catch (error) {
        console.error('Error removing presence:', error);
        throw error;
    }
}

/**
 * Check if user has permission to track a specific team
 * @param {object} userProfile - User's profile from /users/{uid}
 * @param {string} teamId - Team ID to check
 * @returns {boolean} True if user can track this team
 */
export function canUserTrackTeam(userProfile, teamId) {
    if (!userProfile) return false;
    
    // Admins and league staff can track any team
    if (userProfile.isAdmin || 
        userProfile.userRole === 'admin' ||
        userProfile.userRole === 'league-staff') {
        return true;
    }

    // Scorekeepers can track their linked team
    if (userProfile.specialRoles?.scorekeeper === true &&
        userProfile.linkedTeam?.toLowerCase() === teamId?.toLowerCase()) {
        return true;
    }

    // Check teamRoles map (captain or team-staff, active status)
    if (userProfile.teamRoles && typeof userProfile.teamRoles === 'object' && !Array.isArray(userProfile.teamRoles)) {
        const entry = Object.entries(userProfile.teamRoles).find(
            ([key]) => key.toLowerCase() === teamId?.toLowerCase()
        );
        if (entry) {
            const teamRole = entry[1];
            if (teamRole.status === 'active' &&
                (teamRole.role === 'captain' || teamRole.role === 'team-staff')) {
                return true;
            }
        }
    }

    // Legacy: isCaptain flag with linkedTeam match
    if (userProfile.isCaptain &&
        userProfile.linkedTeam?.toLowerCase() === teamId?.toLowerCase()) {
        return true;
    }
    
    return false;
}

/**
 * Get user's tracking permissions for a game
 * @param {object} userProfile - User's profile from /users/{uid}
 * @param {object} game - Game object with homeTeam and awayTeam
 * @returns {object} { canTrackHome: boolean, canTrackAway: boolean, canTrackBoth: boolean }
 */
export function getGameTrackingPermissions(userProfile, game) {
    const canTrackHome = canUserTrackTeam(userProfile, game.homeTeam);
    const canTrackAway = canUserTrackTeam(userProfile, game.awayTeam);
    
    return {
        canTrackHome,
        canTrackAway,
        canTrackBoth: canTrackHome && canTrackAway
    };
}

/**
 * Load saved game state from Firebase
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} teamId - Team ID
 * @returns {object|null} Saved game state or null
 */
export async function loadGameState(seasonId, gameId, teamId) {
    try {
        const gameStateRef = doc(db, 'seasons', seasonId, 'games', gameId, 'gameState', teamId);
        const snapshot = await getDoc(gameStateRef);
        
        if (snapshot.exists()) {
            console.log(`[SYNC] Loaded saved game state for team ${teamId}`);
            return snapshot.data();
        }
        
        return null;
    } catch (error) {
        console.error(`Error loading game state for team ${teamId}:`, error);
        return null;
    }
}

/**
 * Load game metadata (one-time fetch, not subscription)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @returns {object|null} Game metadata or null
 */
export async function loadGameMetadata(seasonId, gameId) {
    try {
        const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
        const snapshot = await getDoc(metadataRef);
        
        if (snapshot.exists()) {
            console.log(`[SYNC] Loaded game metadata for game ${gameId}`);
            return snapshot.data();
        }
        
        return null;
    } catch (error) {
        console.error(`Error loading game metadata:`, error);
        return null;
    }
}

/**
 * Clear game state for a team (mark as completed)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 * @param {string} teamId - Team ID
 */
export async function clearGameState(seasonId, gameId, teamId, clearedBy = null) {
    try {
        const gameStateRef = doc(db, 'seasons', seasonId, 'games', gameId, 'gameState', teamId);
        
        // Mark as completed - preserve plays/data for reference, just flag as done
        await setDoc(gameStateRef, {
            gameActive: false,
            cleared: true,
            clearedAt: serverTimestamp(),
            ...(clearedBy ? {
                metadata: {
                    lastUpdatedBy: clearedBy.id,
                    lastUpdatedByName: clearedBy.name
                }
            } : {})
        }, { merge: true });
        
        console.log(`[CLEAR] Game state marked complete for team ${teamId}`);
    } catch (error) {
        console.error(`Error clearing game state for team ${teamId}:`, error);
        throw error;
    }
}

/**
 * Clear game metadata (shared state like inning, score)
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 */
export async function clearGameMetadata(seasonId, gameId) {
    try {
        const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
        
        // Mark game as completed - preserve final scores for reference
        await setDoc(metadataRef, {
            gameActive: false,
            gameCompleted: true,
            completedAt: serverTimestamp(),
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        console.log(`[CLEAR] Game metadata marked complete for game ${gameId}`);
    } catch (error) {
        console.error(`Error clearing game metadata:`, error);
        throw error;
    }
}

/**
 * Hard reset game metadata (for fresh starts / stale data cleanup)
 * Unlike clearGameMetadata, this wipes scores and resets to defaults
 * @param {string} seasonId - Season ID
 * @param {string} gameId - Game ID
 */
export async function resetGameMetadata(seasonId, gameId) {
    try {
        const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
        
        await setDoc(metadataRef, {
            inning: 1,
            outs: 0,
            halfInning: 'top',
            homeScore: 0,
            awayScore: 0,
            homePitcher: null,
            awayPitcher: null,
            currentBattingTeam: null,
            gameActive: true,
            gameCompleted: false,
            lastUpdated: serverTimestamp()
        });
        
        console.log(`[RESET] Game metadata hard reset for game ${gameId}`);
    } catch (error) {
        console.error(`Error resetting game metadata:`, error);
        throw error;
    }
}

/**
 * Full game reset - clears both teams' game states AND metadata
 * Use with caution - this affects all trackers
 * @param {string} seasonId - Season ID  
 * @param {string} gameId - Game ID
 * @param {string} homeTeam - Home team ID
 * @param {string} awayTeam - Away team ID
 */
export async function fullGameReset(seasonId, gameId, homeTeam, awayTeam) {
    try {
        // Clear both teams' game states
        await clearGameState(seasonId, gameId, homeTeam);
        await clearGameState(seasonId, gameId, awayTeam);
        
        // Hard reset shared metadata (wipe scores for fresh start)
        await resetGameMetadata(seasonId, gameId);
        
        console.log(`[RESET] Full game reset complete for ${homeTeam} vs ${awayTeam}`);
        return { success: true };
    } catch (error) {
        console.error('Error in full game reset:', error);
        throw error;
    }
}
