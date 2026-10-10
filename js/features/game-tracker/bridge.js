// js/features/game-tracker/bridge.js
// Firebase side of game-tracker-v2.html: saves and loads game state, results
// and presence, and exposes them as window.FirebaseGameTracker for the React
// app (app.js). Moved unchanged from the inline module in game-tracker.html;
// only the import paths changed.

import { getCurrentUser, onAuthChange, getUserProfile } from '../../../firebase-auth.js';
import { getCurrentSeason, getAllTeams, getSeasonPlayerStatsOptimized } from '../../../firebase-data.js';
import { getUpcomingTeamGames, getBattingOrder } from '../../../firebase-roster.js';
import { getTeamRosterForTracker } from '../../../firebase_game_tracker.js';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from '../../../firebase-data.js';
		
		import { 
    subscribeToGameState,
    subscribeToGameMetadata,
    updateGameMetadata,
    updateGameState,
    updatePresence,
    removePresence,
    canUserTrackTeam,
    getGameTrackingPermissions,
    subscribeToPresence,
    loadGameState as loadGameStateSync,
    clearGameState as clearGameStateSync,
    loadGameMetadata as loadGameMetadataSync,
    clearGameMetadata,
    resetGameMetadata,
    fullGameReset
} from '../../../firebase-game-sync.js';




// Save game state to Firebase
async function saveGameState(gameId, teamId, teamName, gameState, battingOrder, currentUserInfo, seasonId = null, gameObj = null) {
    const { userId, userName } = currentUserInfo;

    if (!seasonId) {
console.error('\u274c Cannot save game state: seasonId is required');
return;
    }

    // OFFLINE CHECK
    if (!navigator.onLine) {
console.log('\ud83d\udce1 Offline - queuing game state update');

try {
    await window.offlineQueue.addToQueue('SCORE_UPDATE', {
        gameId: gameId,
        teamId: teamId,
        teamName: teamName,
        score: gameState.score.yourTeam,
        inning: gameState.inning,
        outs: gameState.outs,
        bases: gameState.bases,
        playHistory: gameState.playHistory,
        battingOrder: battingOrder.map(p => p.id),
        timestamp: Date.now()
    });
    console.log('\u2705 Game state queued');
} catch (error) {
    console.error('Failed to queue game state:', error);
}
return; // Exit early - don't try Firebase
    }

    // ONLINE - Save with new structure
    try {
// Save team game state
await updateGameState(seasonId, gameId, teamId, {
    teamId,
    teamName,
    atBats: gameState.atBats || [],
    plays: gameState.playHistory || [],
    battingOrder: battingOrder.map(p => p.id),
    currentBatter: gameState.currentBatter ?? 0,
    inning: gameState.inning,
    outs: gameState.outs,
    bases: gameState.bases,
    score: gameState.score.yourTeam,
    isYourTeamBatting: gameState.isYourTeamBatting,
    gameActive: gameState.gameActive,
    metadata: {
        lastUpdatedBy: userId,
        lastUpdatedByName: userName
    }
});

// Also update shared game metadata with current scores/inning/outs
// This keeps the metadata in sync for both teams
try {
    // Determine home and away scores based on which team this is
    const isHome = gameObj ? (gameObj.homeTeam?.toLowerCase() === teamName.toLowerCase()) : false;
    
    // IMPORTANT: Only save OUR score - don't overwrite opponent's score
    // The opponent will save their own score when they track
    // Using merge:true means we only update the fields we specify
    const metadataUpdate = {
        inning: gameState.inning,
        // Only save our team's score
        [isHome ? 'homeScore' : 'awayScore']: gameState.score.yourTeam
    };
    
    // Only write outs and currentBattingTeam when YOUR team is batting
    // This prevents overwriting opponent's data during their half-inning
    if (gameState.isYourTeamBatting) {
        metadataUpdate.outs = gameState.outs;
        metadataUpdate.currentBattingTeam = teamId;
    }
    
    await updateGameMetadata(seasonId, gameId, metadataUpdate);
} catch (metadataError) {
    console.warn('Could not update game metadata:', metadataError);
}

console.log('\ud83d\udcbe Game state saved');
    } catch (error) {
console.error('Error saving game state:', error);
    }
}

// Helper function for ordinal suffixes
function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
}


// Wrapper for loadGameState that requires seasonId
async function loadGameState(gameId, teamId, seasonId) {
    if (!seasonId) {
        console.error('\u274c loadGameState requires seasonId');
        return null;
    }
    
    try {
        return await loadGameStateSync(seasonId, gameId, teamId);
    } catch (error) {
        console.error('Error loading game state:', error);
        return null;
    }
}



// Wrapper for clearGameState that requires seasonId
async function clearGameState(gameId, teamId, seasonId) {
    if (!seasonId) {
        console.error('\u274c clearGameState requires seasonId');
        return;
    }
    
    try {
        await clearGameStateSync(seasonId, gameId, teamId);
        console.log('\ud83d\uddd1\ufe0f Game state cleared');
    } catch (error) {
        console.error('Error clearing game state:', error);
    }
}


// Calculate batting stats from play history
function calculateBattingStats(playHistory, battingOrder) {
    const playerStats = {};
    
    // Initialize stats for all players in the batting order
    battingOrder.forEach(player => {
        playerStats[player.id] = {
            playerId: player.id,
            playerName: player.name,
            atBats: 0,
            hits: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            walks: 0,
            strikeouts: 0,
            rbi: 0,
            runs: 0,
            battingAverage: 0,
            onBasePercentage: 0,
            sluggingPercentage: 0
        };
    });
    
    // Process each play
    playHistory.forEach(play => {
        const playerId = battingOrder.find(p => p.name === play.batter)?.id;
        if (!playerId || !playerStats[playerId]) return;
        
        const stats = playerStats[playerId];
        
        // Count at-bats (everything except walks and sac flies)
        if (play.playType !== 'walk' && play.playType !== 'sacfly') {
            stats.atBats++;
        }
        
        // Count hits
        if (play.playType === 'single') {
            stats.hits++;
            stats.singles++;
        } else if (play.playType === 'double') {
            stats.hits++;
            stats.doubles++;
        } else if (play.playType === 'triple') {
            stats.hits++;
            stats.triples++;
        } else if (play.playType === 'homerun') {
            stats.hits++;
            stats.homeRuns++;
        } else if (play.playType === 'walk') {
            stats.walks++;
        } else if (play.playType === 'strikeout') {
            stats.strikeouts++;
        }
        
        // Count RBIs (runs scored on this play)
        if (play.runsScored > 0) {
            stats.rbi += play.runsScored;
        }
        
        // Count runs scored using runnersScored array
        if (play.runnersScored && Array.isArray(play.runnersScored)) {
            play.runnersScored.forEach(runnerName => {
                const runnerId = battingOrder.find(p => p.name === runnerName)?.id;
                if (runnerId && playerStats[runnerId]) {
                    playerStats[runnerId].runs++;
                }
            });
        }
    });
    
    // Calculate derived stats
    Object.values(playerStats).forEach(stats => {
        // Batting Average
        if (stats.atBats > 0) {
            stats.battingAverage = stats.hits / stats.atBats;
        }
        
        // On-Base Percentage
        const plateAppearances = stats.atBats + stats.walks;
        if (plateAppearances > 0) {
            stats.onBasePercentage = (stats.hits + stats.walks) / plateAppearances;
        }
        
        // Slugging Percentage
        if (stats.atBats > 0) {
            const totalBases = stats.singles + (stats.doubles * 2) + (stats.triples * 3) + (stats.homeRuns * 4);
            stats.sluggingPercentage = totalBases / stats.atBats;
        }
    });
    
    return Object.values(playerStats);
}

// Save game results to Firebase
async function saveGameResults(gameId, teamId, seasonId, gameState, battingOrder, isHome, opponentName, removedPlayers = []) {
    try {
        // Combine current batting order with removed players for complete stats
        const allPlayers = [...battingOrder, ...removedPlayers];
        
        // Calculate batting stats for all players who participated
        const battingStats = calculateBattingStats(gameState.playHistory, allPlayers);
        
        // Mark which players left the game early
        battingStats.forEach(stat => {
            if (removedPlayers.find(p => p.id === stat.playerId)) {
                stat.leftGameEarly = true;
            }
        });
        
        // Save to gameResults collection
        const resultsRef = doc(db, 'gameResults', `${gameId}_${teamId}`);
        await setDoc(resultsRef, {
            gameId,
            teamId,
            seasonId,
            opponentName,
            isHome,
            finalScore: {
                yourTeam: gameState.score.yourTeam,
                opponent: gameState.score.opponent
            },
            innings: gameState.inning,
            battingStats,
            playByPlay: gameState.playHistory,
            completedAt: serverTimestamp()
        });
        
        console.log('\u2705 Game results saved with batting stats');
        return { success: true, battingStats };
    } catch (error) {
        console.error('Error saving game results:', error);
        return { success: false, error };
    }
}

// Make functions available globally for React component
window.FirebaseGameTracker = {
    getCurrentUser,
    onAuthChange,
    getUserProfile,
    getCurrentSeason,
    getAllTeams,
    getSeasonPlayerStatsOptimized,
    getTeamRosterForTracker,
    getUpcomingTeamGames,
    getBattingOrder,
    saveGameState: (gameId, teamId, teamName, gameState, battingOrder, userInfo, seasonId, gameObj) => 
        saveGameState(gameId, teamId, teamName, gameState, battingOrder, userInfo, seasonId, gameObj),
    loadGameState,
    clearGameState,
    saveGameResults,
    // Add firebase-game-sync functions
    subscribeToGameState,
    subscribeToGameMetadata,
    updateGameMetadata,
    updateGameState,
    updatePresence,
    removePresence,
    canUserTrackTeam,
    getGameTrackingPermissions,
    subscribeToPresence,
    loadGameStateSync,
    clearGameStateSync,
    loadGameMetadataSync,
    clearGameMetadata,
    resetGameMetadata,
    fullGameReset
};

// Wait for auth state to be determined before signaling ready
let authResolved = false;
let currentAuthUser = null;

onAuthChange((user) => {
    currentAuthUser = user;
    if (!authResolved) {
        authResolved = true;
        console.log('\ud83d\udd10 Auth state resolved:', user ? user.displayName : 'Not signed in');
        window.firebaseReady = true;
        window.dispatchEvent(new Event('firebaseready'));
    }
});

// Store the current user for immediate access
window.getCurrentFirebaseUser = () => currentAuthUser;
