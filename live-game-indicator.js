// live-game-indicator.js
// Real-time live game indicator for index.html news banner and This Week module

import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    getDocs,
    onSnapshot,
    doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getCurrentSeason, getSeasonGames } from './firebase-data.js';

// Store active listeners for cleanup
let activeListeners = [];
let liveGames = [];
let currentSeasonId = null;

/**
 * Check if a game is currently live based on metadata timestamp
 * A game is considered "live" if metadata was updated in the last 30 minutes
 */
function isGameLive(metadata) {
    if (!metadata || !metadata.lastUpdated) return false;
    
    const lastUpdated = metadata.lastUpdated.toDate ? 
        metadata.lastUpdated.toDate() : 
        new Date(metadata.lastUpdated);
    
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return lastUpdated > thirtyMinutesAgo;
}

/**
 * Find all games that might be live:
 * 1. Games scheduled for today
 * 2. Games scheduled within the next 7 days (for testing/early starts)
 * 3. Any game with recent metadata activity
 */
async function getTrackableGames() {
    try {
        const currentSeason = await getCurrentSeason();
        if (!currentSeason) return [];
        
        currentSeasonId = currentSeason.id;
        
        const allGames = await getSeasonGames(currentSeason.id);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Look at games from today through next 7 days
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const trackableGames = allGames.filter(game => {
            // Skip games that already have a winner (completed)
            if (game.winner) return false;
            
            let gameDate;
            if (game.date && game.date.seconds) {
                gameDate = new Date(game.date.seconds * 1000);
            } else if (game.date) {
                gameDate = new Date(game.date);
            } else {
                return false;
            }
            
            gameDate.setHours(0, 0, 0, 0);
            
            // Include games from today through next week
            return gameDate >= today && gameDate <= nextWeek;
        }).map(game => ({
            ...game,
            seasonId: currentSeason.id
        }));
        
        return trackableGames;
    } catch (error) {
        console.error('Error getting trackable games:', error);
        return [];
    }
}

/**
 * Subscribe to live game updates for a specific game
 */
function subscribeToGameMetadata(seasonId, gameId, callback) {
    const metadataRef = doc(db, 'seasons', seasonId, 'games', gameId, 'metadata', 'current');
    
    return onSnapshot(metadataRef, 
        (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.data());
            } else {
                callback(null);
            }
        },
        (error) => {
            console.error(`Error subscribing to game ${gameId} metadata:`, error);
            callback(null);
        }
    );
}

/**
 * Get team display name from game object
 */
function getTeamName(game, isHome) {
    if (isHome) {
        return game.homeTeamName || game["home team"] || game.homeTeamId || "Home";
    }
    return game.awayTeamName || game["away team"] || game.awayTeamId || "Away";
}

/**
 * Initialize live game tracking for today's games
 * Returns a cleanup function to unsubscribe all listeners
 */
export async function initializeLiveGameTracking(onUpdate) {
    console.log('🔴 Initializing live game tracking...');
    
    // Cleanup any existing listeners
    cleanupListeners();
    
    try {
        const trackableGames = await getTrackableGames();
        console.log(`📅 Found ${trackableGames.length} games to monitor for live activity`);
        
        if (trackableGames.length === 0) {
            onUpdate([]);
            return;
        }
        
        // Subscribe to metadata for each game
        trackableGames.forEach(game => {
            const gameId = game.id;
            const seasonId = game.seasonId;
            
            const unsubscribe = subscribeToGameMetadata(seasonId, gameId, (metadata) => {
                updateLiveGameState(game, metadata, onUpdate);
            });
            
            activeListeners.push(unsubscribe);
        });
        
        console.log(`✅ Subscribed to ${activeListeners.length} games for live updates`);
        
    } catch (error) {
        console.error('Error initializing live game tracking:', error);
        onUpdate([]);
    }
}

/**
 * Update the live game state when metadata changes
 */
function updateLiveGameState(game, metadata, onUpdate) {
    const gameId = game.id;
    const isLive = isGameLive(metadata);
    
    // Find existing entry for this game
    const existingIndex = liveGames.findIndex(g => g.id === gameId);
    
    if (isLive && metadata) {
        const liveGameData = {
            id: gameId,
            homeTeam: getTeamName(game, true),
            awayTeam: getTeamName(game, false),
            homeScore: metadata.homeScore || 0,
            awayScore: metadata.awayScore || 0,
            inning: metadata.inning || 1,
            outs: metadata.outs || 0,
            isTop: metadata.isTop !== false, // Default to top of inning
            lastUpdated: metadata.lastUpdated,
            seasonId: game.seasonId
        };
        
        if (existingIndex >= 0) {
            liveGames[existingIndex] = liveGameData;
        } else {
            liveGames.push(liveGameData);
        }
        
        console.log(`🔴 LIVE: ${liveGameData.awayTeam} ${liveGameData.awayScore} @ ${liveGameData.homeTeam} ${liveGameData.homeScore}`);
    } else {
        // Remove from live games if no longer active
        if (existingIndex >= 0) {
            liveGames.splice(existingIndex, 1);
            console.log(`⚪ Game ${gameId} is no longer live`);
        }
    }
    
    // Trigger update callback
    onUpdate([...liveGames]);
}

/**
 * Get the current list of live games
 */
export function getLiveGames() {
    return [...liveGames];
}

/**
 * Get the current season ID (useful for linking to game tracker)
 */
export function getCurrentSeasonId() {
    return currentSeasonId;
}

/**
 * Check if a specific game is currently live
 */
export function isGameCurrentlyLive(gameId) {
    return liveGames.some(g => g.id === gameId);
}

/**
 * Get live game data for a specific game
 */
export function getLiveGameData(gameId) {
    return liveGames.find(g => g.id === gameId) || null;
}

/**
 * Cleanup all active listeners
 */
export function cleanupListeners() {
    activeListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    activeListeners = [];
    liveGames = [];
}

/**
 * Format live game for display in news banner
 */
export function formatLiveGame(game) {
    const inningHalf = game.isTop ? 'Top' : 'Bot';
    const inningText = `${inningHalf} ${game.inning}`;
    
    return `🔴 LIVE: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore} (${inningText})`;
}

/**
 * Generate CSS for live indicator styling
 */
export function getLiveIndicatorStyles() {
    return `
/* Live Game Indicator Styles */
.news-live {
    color: #ff4444 !important;
    font-weight: 700 !important;
    animation: livePulse 2s ease-in-out infinite;
}

.news-live::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #ff4444;
    border-radius: 50%;
    margin-right: 6px;
    animation: liveDot 1s ease-in-out infinite;
}

@keyframes livePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
}

@keyframes liveDot {
    0%, 100% { 
        opacity: 1;
        transform: scale(1);
    }
    50% { 
        opacity: 0.5;
        transform: scale(0.8);
    }
}

/* Live score badge for game cards */
.live-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: linear-gradient(135deg, #ff4444, #cc0000);
    color: white;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    animation: livePulse 2s ease-in-out infinite;
}

.live-badge::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    animation: liveDot 1s ease-in-out infinite;
}

/* Live score display */
.live-score {
    font-weight: 700;
    color: #ff4444;
}
`;
}
