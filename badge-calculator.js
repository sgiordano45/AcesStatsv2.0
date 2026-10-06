/**
 * Badge Calculator for Mountainside Aces
 * 
 * Calculates player badges based on game-level statistics.
 * Can be run client-side or in Cloud Functions.
 * 
 * Usage:
 *   import { BadgeCalculator } from './badge-calculator.js';
 *   const calculator = new BadgeCalculator(db);
 *   await calculator.calculateAllBadges('2025-fall');
 */

// ============================================
// BADGE DEFINITIONS
// ============================================

export const BADGE_DEFINITIONS = {
  // ----------------------------------------
  // HITTING BADGES
  // ----------------------------------------
  hitStreak: {
    id: 'hitStreak',
    name: 'Hit Streak',
    category: 'hitting',
    type: 'tiered',
    icon: '🔥',
    iconPath: '/assets/badges/hitting/hit-streak',
    tiers: {
      bronze: { name: 'Hot Bat', threshold: 3, description: 'Hit in 3 consecutive games' },
      silver: { name: 'Hot Streak', threshold: 5, description: 'Hit in 5 consecutive games' },
      gold: { name: 'On Fire', threshold: 8, description: 'Hit in 8+ consecutive games' }
    }
  },
  
  multiHitGames: {
    id: 'multiHitGames',
    name: 'Multi-Hit Game',
    category: 'hitting',
    type: 'tiered',
    icon: '💥',
    iconPath: '/assets/badges/hitting/multi-hit',
    tiers: {
      bronze: { name: 'Seeing It Well', threshold: 3, description: '3+ hits in a single game' },
      silver: { name: 'Locked In', threshold: 4, description: '4+ hits in a single game' },
      gold: { name: 'Unstoppable', threshold: 5, description: '5+ hits in a single game' }
    }
  },
  
  seasonHits: {
    id: 'seasonHits',
    name: 'Season Hits',
    category: 'hitting',
    type: 'tiered',
    icon: '🏆',
    iconPath: '/assets/badges/hitting/season-hits',
    tiers: {
      bronze: { name: 'Contact Hitter', threshold: 15, description: '15+ hits in a season' },
      silver: { name: 'Hit Machine', threshold: 25, description: '25+ hits in a season' },
      gold: { name: 'Silver Slugger', threshold: 35, description: '35+ hits in a season' }
    }
  },
  
  seasonRuns: {
    id: 'seasonRuns',
    name: 'Season Runs',
    category: 'hitting',
    type: 'tiered',
    icon: '🏃',
    iconPath: '/assets/badges/hitting/season-runs',
    tiers: {
      bronze: { name: 'Run Scorer', threshold: 10, description: '10+ runs in a season' },
      silver: { name: 'Rally Starter', threshold: 18, description: '18+ runs in a season' },
      gold: { name: 'Run Machine', threshold: 25, description: '25+ runs in a season' }
    }
  },
  
  seasonWalks: {
    id: 'seasonWalks',
    name: 'Season Walks',
    category: 'hitting',
    type: 'tiered',
    icon: '👁️',
    iconPath: '/assets/badges/hitting/season-walks',
    tiers: {
      bronze: { name: 'Good Eye', threshold: 5, description: '5+ walks in a season' },
      silver: { name: 'Patient Hitter', threshold: 10, description: '10+ walks in a season' },
      gold: { name: 'The Walken', threshold: 15, description: '15+ walks in a season' }
    }
  },
  
  bigGames: {
    id: 'bigGames',
    name: 'Big Game',
    category: 'hitting',
    type: 'tiered',
    icon: '🎆',
    iconPath: '/assets/badges/hitting/big-game',
    tiers: {
      bronze: { name: 'Big Day', threshold: 2, description: '2+ runs scored in a single game' },
      silver: { name: 'Crooked Number', threshold: 3, description: '3+ runs scored in a single game' },
      gold: { name: 'One-Man Rally', threshold: 4, description: '4+ runs scored in a single game' }
    }
  },
  
  ironMan: {
    id: 'ironMan',
    name: 'Iron Man',
    category: 'milestone',
    type: 'single',
    icon: '⛓️',
    iconPath: '/assets/badges/milestone/iron-man',
    description: 'Play in every regular season and playoff game for your team',
    requirement: 'Appear in all team games (regular season + playoffs) — awarded at end of season',
    seasonEndOnly: true
  },
  
  tableSetter: {
    id: 'tableSetter',
    name: 'Table Setter',
    category: 'hitting',
    type: 'single',
    icon: '🍽️',
    iconPath: '/assets/badges/hitting/table-setter',
    description: 'More walks than games played',
    requirement: 'Walks > Games Played'
  },
  
  // ----------------------------------------
  // PITCHING BADGES
  // ----------------------------------------
  scorelessOutings: {
    id: 'scorelessOutings',
    name: 'Scoreless Outings',
    category: 'pitching',
    type: 'tiered',
    icon: '🔒',
    iconPath: '/assets/badges/pitching/scoreless',
    tiers: {
      bronze: { name: 'Clean Inning', threshold: 1, description: '1 scoreless outing (min 1 IP)' },
      silver: { name: 'Shutdown', threshold: 3, description: '3 scoreless outings' },
      gold: { name: 'Lockdown', threshold: 5, description: '5+ scoreless outings' }
    }
  },
  
  seasonInnings: {
    id: 'seasonInnings',
    name: 'Season Innings',
    category: 'pitching',
    type: 'tiered',
    icon: '💪',
    iconPath: '/assets/badges/pitching/season-innings',
    tiers: {
      bronze: { name: 'Reliable Arm', threshold: 25, description: '25+ innings pitched in a season' },
      silver: { name: 'Workhorse', threshold: 50, description: '50+ innings pitched in a season' },
      gold: { name: 'Ace', threshold: 75, description: '75+ innings pitched in a season' }
    }
  },
  
  lowRunGames: {
    id: 'lowRunGames',
    name: 'Low-Run Games',
    category: 'pitching',
    type: 'tiered',
    icon: '🛡️',
    iconPath: '/assets/badges/pitching/low-run',
    tiers: {
      bronze: { name: 'Bend Don\'t Break', threshold: 1, description: 'Allow 2 or fewer runs in a game (min 2 IP)' },
      silver: { name: 'Quality Outing', threshold: 3, description: '3 games allowing 2 or fewer runs (min 2 IP each)' },
      gold: { name: 'Consistent Arm', threshold: 5, description: '5+ games allowing 2 or fewer runs (min 2 IP each)' }
    }
  },
  
  ironclad: {
    id: 'ironclad',
    name: 'Ironclad',
    category: 'pitching',
    type: 'single',
    icon: '🏰',
    iconPath: '/assets/badges/pitching/ironclad',
    description: 'Allow 0 runs across 3+ innings in a single game',
    requirement: '0 RA with 3+ IP in one game'
  },
  
  staffAce: {
    id: 'staffAce',
    name: 'Staff Ace',
    category: 'pitching',
    type: 'single',
    icon: '👑',
    iconPath: '/assets/badges/pitching/staff-ace',
    description: 'Lowest runs allowed per inning among qualifying pitchers (min 10 IP)',
    requirement: 'Best RA/IP ratio (min 10 IP)'
  },
  
  // ----------------------------------------
  // TWO-WAY BADGES
  // ----------------------------------------
  twoWay: {
    id: 'twoWay',
    name: 'Two-Way Player',
    category: 'two-way',
    type: 'tiered',
    icon: '☯️',
    iconPath: '/assets/badges/two-way/two-way',
    tiers: {
      bronze: { name: 'Dual Threat', threshold: { hits: 10, ip: 10 }, description: '10+ hits AND 10+ innings pitched' },
      silver: { name: 'Two-Way Player', threshold: { hits: 15, ip: 15 }, description: '15+ hits AND 15+ innings pitched' },
      gold: { name: 'Shohei', threshold: { hits: 20, ip: 20, scoreless: 2 }, description: '20+ hits AND 20+ IP with 2+ scoreless outings' }
    }
  },
  
  // ----------------------------------------
  // OPPONENT/RIVALRY BADGES
  // ----------------------------------------
  kryptonite: {
    id: 'kryptonite',
    name: 'Kryptonite',
    category: 'pitching',
    type: 'single',
    icon: '💎',
    iconPath: '/assets/badges/pitching/kryptonite',
    description: 'Allow 2 or fewer runs against the same opponent twice',
    requirement: '≤2 RA vs same team 2+ times'
  },
  
  nemesis: {
    id: 'nemesis',
    name: 'Nemesis',
    category: 'pitching',
    type: 'single',
    icon: '🎭',
    iconPath: '/assets/badges/pitching/nemesis',
    description: 'Face the same opponent 3+ times while pitching',
    requirement: 'Pitch 3+ games vs same opponent'
  },
  
  // ----------------------------------------
  // MILESTONE BADGES
  // ----------------------------------------
  openingDayHero: {
    id: 'openingDayHero',
    name: 'Opening Day Hero',
    category: 'milestone',
    type: 'single',
    icon: '📅',
    iconPath: '/assets/badges/milestone/opening-day-hero',
    description: 'Get a hit on the league\'s Opening Day',
    requirement: 'Hit in the season\'s first game day'
  },
  
  // ----------------------------------------
  // HIDDEN BADGES
  // ----------------------------------------
  theArchitect: {
    id: 'theArchitect',
    name: 'The Architect',
    category: 'hidden',
    type: 'single',
    icon: '🏗️',
    iconPath: '/assets/badges/hidden/the-architect',
    description: 'Score a run in 10 different games',
    revealText: '"Building something special"',
    hidden: true
  },
  
  quietStorm: {
    id: 'quietStorm',
    name: 'Quiet Storm',
    category: 'hidden',
    type: 'single',
    icon: '🌩️',
    iconPath: '/assets/badges/hidden/quiet-storm',
    description: 'Lead the team in runs without leading in hits',
    revealText: '"Doing damage without the headlines"',
    hidden: true
  },
  
  dejaVu: {
    id: 'dejaVu',
    name: 'Déjà Vu',
    category: 'hidden',
    type: 'single',
    icon: '🔄',
    iconPath: '/assets/badges/hidden/deja-vu',
    description: 'Same stat line (H/BB/R) in 3 different games (min 1 H, BB, or R)',
    revealText: '"Haven\'t we been here before?"',
    hidden: true
  },
  
  perfectTen: {
    id: 'perfectTen',
    name: 'Perfect 10',
    category: 'hidden',
    type: 'single',
    icon: '🎯',
    iconPath: '/assets/badges/hidden/perfect-ten',
    description: 'Exactly 10 hits, 10 runs, and 10 walks in a season',
    revealText: '"Perfectly balanced, as all things should be"',
    hidden: true
  },
  
  invisibleMan: {
    id: 'invisibleMan',
    name: 'Invisible Man',
    category: 'hidden',
    type: 'single',
    icon: '👻',
    iconPath: '/assets/badges/hidden/invisible-man',
    description: '5+ walks with 0 hits in a game',
    revealText: '"They couldn\'t find the zone"',
    hidden: true
  },
  
  luckySeven: {
    id: 'luckySeven',
    name: 'Lucky 7',
    category: 'hidden',
    type: 'single',
    icon: '🍀',
    iconPath: '/assets/badges/hidden/lucky-seven',
    description: 'Exactly 7 hits against the same opponent across all matchups',
    revealText: '"They just can\'t figure you out"',
    hidden: true
  },
  
  theStreakLives: {
    id: 'theStreakLives',
    name: 'The Streak Lives',
    category: 'hidden',
    type: 'single',
    icon: '⚡',
    iconPath: '/assets/badges/hidden/the-streak-lives',
    description: 'Get a hit in the final game to extend a hit streak to 6+',
    revealText: '"Kept it alive when it mattered most"',
    hidden: true
  },
  
  zeroToHero: {
    id: 'zeroToHero',
    name: 'Zero to Hero',
    category: 'hidden',
    type: 'multi',
    icon: '🦸',
    iconPath: '/assets/badges/hidden/zero-to-hero',
    description: 'Score 3+ runs in a game after being hitless in the previous 3 games',
    revealText: '"A tale of redemption"',
    hidden: true
  },
  
  // ----------------------------------------
  // PLAYOFF BADGES
  // ----------------------------------------
  playoffPerformer: {
    id: 'playoffPerformer',
    name: 'Playoff Performer',
    category: 'milestone',
    type: 'single',
    icon: '🏆',
    iconPath: '/assets/badges/milestone/playoff-performer',
    description: 'Get a hit in every playoff game played',
    requirement: 'Hit in all playoff games (min 2 games)'
  },
  
  postseasonAce: {
    id: 'postseasonAce',
    name: 'Postseason Ace',
    category: 'milestone',
    type: 'single',
    icon: '🎖️',
    iconPath: '/assets/badges/milestone/postseason-ace',
    description: 'Pitch a scoreless outing in the playoffs',
    requirement: 'Scoreless playoff appearance (min 1 IP)'
  },
  
  giantSlayer: {
    id: 'giantSlayer',
    name: 'Giant Slayer',
    category: 'pitching',
    type: 'single',
    icon: '⚔️',
    iconPath: '/assets/badges/pitching/giant-slayer',
    description: 'Hold a top-3 team to their lowest run total of the season',
    requirement: 'Pitch when top team scores season-low'
  }
};

// ============================================
// BADGE CALCULATOR CLASS
// ============================================

export class BadgeCalculator {
  constructor(db, options = {}) {
    this.db = db;
    this.collection = options.collection || null; // Firestore collection function
    this.getDocs = options.getDocs || null;
    this.doc = options.doc || null;
    this.getDoc = options.getDoc || null;
    this.setDoc = options.setDoc || null;
    this.serverTimestamp = options.serverTimestamp || null;
    this.testMode = options.testMode || false;
    this.seasonComplete = options.seasonComplete || false;
    this.seasonId = null;
    this.isPartialData = false;
  }

  /**
   * Calculate all badges for a season
   */
  async calculateAllBadges(seasonId) {
    console.log(`🏆 Starting badge calculation for season: ${seasonId}`);
    this.seasonId = seasonId;
    this.isPartialData = seasonId.startsWith('2025');
    
    // Load all game data for the season
    const [battingData, pitchingData] = await Promise.all([
      this.loadBattingData(seasonId),
      this.loadPitchingData(seasonId)
    ]);

    console.log(`📊 Loaded ${Object.keys(battingData).length} batters, ${Object.keys(pitchingData).length} pitchers`);

    // Compute total games per team from batting data (unique game IDs across all players on each team).
    // This covers regular season + playoffs without needing a separate schedule lookup.
    const teamGameIds = {};
    Object.values(battingData).forEach(player => {
      const tid = (player.teamId || '').toLowerCase().trim();
      if (!tid) return;
      if (!teamGameIds[tid]) teamGameIds[tid] = new Set();
      player.games.forEach(g => teamGameIds[tid].add(g.id));
    });
    const teamTotalGames = {};
    Object.entries(teamGameIds).forEach(([tid, ids]) => {
      teamTotalGames[tid] = ids.size;
    });
    console.log('🏟️ Team game totals (from batting data):', teamTotalGames);
    
    // Get unique players
    const allPlayerIds = new Set([
      ...Object.keys(battingData),
      ...Object.keys(pitchingData)
    ]);
    
    console.log(`👥 Processing ${allPlayerIds.size} unique players`);
    
    // Find the actual Opening Day (earliest game date in the season)
    // Use gameDateFormatted (YYYY-MM-DD string) to avoid UTC timestamp issues
    // with bulk-imported games whose Firestore timestamps may reflect wrong dates
    let openingDay = null; // stored as 'YYYY-MM-DD' string
    Object.values(battingData).forEach(player => {
      player.games.forEach(game => {
        const dateStr = game.gameDateFormatted || (() => {
          const d = game.gameDate instanceof Date ? game.gameDate : new Date(game.gameDate);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        })();
        if (!openingDay || dateStr < openingDay) {
          openingDay = dateStr;
        }
      });
    });
    console.log(`Opening Day detected: ${openingDay || 'N/A'}`);
    
    const results = {
      seasonId,
      calculatedAt: new Date().toISOString(),
      isPartialData: this.isPartialData,
      playerBadges: {},
      badgeSummary: {
        total: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        hidden: 0
      },
      leaderboard: []
    };
    
    // Calculate badges for each player
    for (const playerId of allPlayerIds) {
      const playerBatting = battingData[playerId] || { games: [], totals: {} };
      const playerPitching = pitchingData[playerId] || { games: [], totals: {} };
      
      const badges = this.calculatePlayerBadges(playerId, playerBatting, playerPitching, battingData, pitchingData, openingDay, this.seasonComplete, teamTotalGames);
      
      if (Object.keys(badges.earned).length > 0) {
        results.playerBadges[playerId] = badges;
        
        // Update summary counts
        Object.values(badges.earned).forEach(badge => {
          results.badgeSummary.total++;
          if (badge.tier) {
            results.badgeSummary[badge.tier]++;
          }
          if (badge.hidden) {
            results.badgeSummary.hidden++;
          }
        });
        
        // Add to leaderboard
        results.leaderboard.push({
          playerId,
          playerName: badges.playerName,
          teamId: badges.teamId,
          badgeCount: Object.keys(badges.earned).length,
          gold: Object.values(badges.earned).filter(b => b.tier === 'gold').length,
          silver: Object.values(badges.earned).filter(b => b.tier === 'silver').length,
          bronze: Object.values(badges.earned).filter(b => b.tier === 'bronze').length
        });
      }
    }
    
    // Sort leaderboard
    results.leaderboard.sort((a, b) => {
      // Sort by gold first, then silver, then bronze, then total
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      if (b.bronze !== a.bronze) return b.bronze - a.bronze;
      return b.badgeCount - a.badgeCount;
    });
    
    console.log(`✅ Badge calculation complete!`);
    console.log(`   Total badges: ${results.badgeSummary.total}`);
    console.log(`   Gold: ${results.badgeSummary.gold}, Silver: ${results.badgeSummary.silver}, Bronze: ${results.badgeSummary.bronze}`);
    console.log(`   Hidden: ${results.badgeSummary.hidden}`);
    
    return results;
  }

  /**
   * Load total game counts per team from the season schedule.
   * Used to determine whether a player appeared in every team game (Iron Man badge).
   * Counts all games (regular season + playoffs) for each team.
   */
  async loadScheduleData(seasonId) {
    const teamGameCounts = {};
    try {
      const gamesRef = this.collection(this.db, 'seasons', seasonId, 'games');
      const gamesSnap = await this.getDocs(gamesRef);
      gamesSnap.forEach(gameDoc => {
        const data = gameDoc.data();
        // Support both camelCase and snake_case field names
        // Normalize to slug format (lowercase, spaces → underscores) to match teamId in batting data
        const normalize = str => (str || '').toLowerCase().trim().replace(/\s+/g, '_');
        const home = normalize(data.homeTeam || data['home team'] || '');
        const away = normalize(data.awayTeam || data['away team'] || '');
        if (home && home !== 'tbd') teamGameCounts[home] = (teamGameCounts[home] || 0) + 1;
        if (away && away !== 'tbd') teamGameCounts[away] = (teamGameCounts[away] || 0) + 1;
      });
      console.log(`📅 Loaded schedule for ${seasonId}: ${gamesSnap.size} games, team counts:`, teamGameCounts);
    } catch (e) {
      console.warn(`Could not load schedule for ${seasonId} (Iron Man badge will be skipped):`, e);
    }
    return teamGameCounts;
  }

  /**
   * Load batting game data for a season
   * Gets player list from aggregatedPlayerStats, converts names to legacy IDs,
   * then checks playerStats subcollections for game data
   */
  async loadBattingData(seasonId) {
    const playerData = {};
    
    try {
      // First, get all players from aggregatedPlayerStats
      const allPlayersRef = this.collection(this.db, 'aggregatedPlayerStats');
      const allPlayersSnap = await this.getDocs(allPlayersRef);
      
      console.log(`📊 Found ${allPlayersSnap.size} players in aggregatedPlayerStats`);
      
      // Track which legacy IDs we've already processed to avoid duplicates
      const processedLegacyIds = new Set();
      
      // For each player, check if they have game-level data
      for (const playerDoc of allPlayersSnap.docs) {
        const playerInfo = playerDoc.data();
        
        // Skip migrated legacy profiles
        if (playerInfo.migrated === true) continue;
        
        // Get the player name to convert to legacy ID
        const playerName = playerInfo.linkedPlayer || playerInfo.name || playerInfo.displayName;
        if (!playerName) continue;
        
        // Convert player name to legacy ID format: "Steve Giordano" → "steve_giordano"
        const legacyId = playerName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');
        
        // Skip if we've already processed this legacy ID
        if (processedLegacyIds.has(legacyId)) continue;
        processedLegacyIds.add(legacyId);
        
        try {
          const gamesRef = this.collection(this.db, 'playerStats', legacyId, 'games');
          const gamesSnap = await this.getDocs(gamesRef);
          
          const games = [];
          let teamId = playerInfo.currentTeam || '';
          
          gamesSnap.forEach(gameDoc => {
            const data = gameDoc.data();
            // Filter by season
            if (data.seasonId === seasonId) {
              games.push({
                id: gameDoc.id,
                ...data,
                gameDateFormatted: data.gameDateFormatted || null,
                gameDate: data.gameDate?.seconds 
                  ? new Date(data.gameDate.seconds * 1000) 
                  : (data.gameDate?.toDate ? data.gameDate.toDate() : new Date(data.gameDateFormatted || data.gameDate))
              });
              // Get team from game data if available
              if (data.teamId) teamId = data.teamId;
            }
          });
          
          if (games.length > 0) {
            // Sort games by date
            games.sort((a, b) => a.gameDate - b.gameDate);
            
            // Calculate totals
            const totals = {
              games: games.length,
              atBats: games.reduce((sum, g) => sum + (g.atBats || 0), 0),
              hits: games.reduce((sum, g) => sum + (g.hits || 0), 0),
              runs: games.reduce((sum, g) => sum + (g.runs || 0), 0),
              walks: games.reduce((sum, g) => sum + (g.walks || 0), 0)
            };
            
            playerData[legacyId] = {
              playerId: legacyId,
              playerName,
              teamId,
              games,
              totals
            };
          }
        } catch (gameError) {
          // No game data for this player, skip silently
        }
      }
      
      console.log(`✅ Found ${Object.keys(playerData).length} players with batting game data for ${seasonId}`);
      
    } catch (error) {
      console.error('Error loading batting data:', error);
    }
    
    return playerData;
  }

  /**
   * Load pitching game data for a season
   * Gets player list from aggregatedPlayerStats, converts names to legacy IDs,
   * then checks pitchingStats subcollections for game data
   */
  async loadPitchingData(seasonId) {
    const playerData = {};
    
    try {
      // First, get all players from aggregatedPlayerStats
      const allPlayersRef = this.collection(this.db, 'aggregatedPlayerStats');
      const allPlayersSnap = await this.getDocs(allPlayersRef);
      
      // Track which legacy IDs we've already processed to avoid duplicates
      const processedLegacyIds = new Set();
      
      // For each player, check if they have pitching game-level data
      for (const playerDoc of allPlayersSnap.docs) {
        const playerInfo = playerDoc.data();
        
        // Skip migrated legacy profiles
        if (playerInfo.migrated === true) continue;
        
        // Get the player name to convert to legacy ID
        const playerName = playerInfo.linkedPlayer || playerInfo.name || playerInfo.displayName;
        if (!playerName) continue;
        
        // Convert player name to legacy ID format: "Steve Giordano" → "steve_giordano"
        const legacyId = playerName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');
        
        // Skip if we've already processed this legacy ID
        if (processedLegacyIds.has(legacyId)) continue;
        processedLegacyIds.add(legacyId);
        
        try {
          const gamesRef = this.collection(this.db, 'pitchingStats', legacyId, 'games');
          const gamesSnap = await this.getDocs(gamesRef);
          
          const games = [];
          let teamId = playerInfo.currentTeam || '';
          
          gamesSnap.forEach(gameDoc => {
            const data = gameDoc.data();
            // Filter by season
            if (data.seasonId === seasonId) {
              games.push({
                id: gameDoc.id,
                ...data,
                gameDateFormatted: data.gameDateFormatted || null,
                gameDate: data.gameDate?.seconds 
                  ? new Date(data.gameDate.seconds * 1000) 
                  : (data.gameDate?.toDate ? data.gameDate.toDate() : new Date(data.gameDateFormatted || data.gameDate))
              });
              if (data.teamId) teamId = data.teamId;
            }
          });
          
          if (games.length > 0) {
            games.sort((a, b) => a.gameDate - b.gameDate);
            
            const totals = {
              games: games.length,
              inningsPitched: games.reduce((sum, g) => sum + (g.inningsPitched || 0), 0),
              runsAllowed: games.reduce((sum, g) => sum + (g.runsAllowed || 0), 0)
            };
            
            playerData[legacyId] = {
              playerId: legacyId,
              playerName,
              teamId,
              games,
              totals
            };
          }
        } catch (gameError) {
          // No pitching game data for this player, skip silently
        }
      }
      
      console.log(`✅ Found ${Object.keys(playerData).length} players with pitching game data for ${seasonId}`);
      
    } catch (error) {
      console.error('Error loading pitching data:', error);
    }
    
    return playerData;
  }

  /**
   * Calculate all badges for a single player
   */
  calculatePlayerBadges(playerId, battingData, pitchingData, allBattingData, allPitchingData, openingDay, seasonComplete = false, teamTotalGames = {}) {
    const earned = {};
    const progress = {};
    
    const playerName = battingData.playerName || pitchingData.playerName || playerId;
    const teamId = battingData.teamId || pitchingData.teamId || '';
    
    // Most recent batting game — hoisted so two-way badges outside the batting block can use it
    const lastGame = (battingData.games && battingData.games.length > 0)
      ? battingData.games[battingData.games.length - 1]
      : null;

    // ===== HITTING BADGES =====
    if (battingData.games && battingData.games.length > 0) {

      // Hit Streak
      const hitStreak = this.calculateHitStreak(battingData.games);
      const hitStreakBadge = this.evaluateTieredBadge('hitStreak', hitStreak.maxStreak);
      if (hitStreakBadge) {
        // Use most recent game as proxy for when the streak badge was earned
        earned.hitStreak = { ...hitStreakBadge, value: hitStreak.maxStreak, gameDate: lastGame?.gameDate || null };
      }
      progress.hitStreak = { current: hitStreak.currentStreak, max: hitStreak.maxStreak };

      // Multi-Hit Games
      const maxHitsInGame = Math.max(...battingData.games.map(g => g.hits || 0));
      const multiHitBadge = this.evaluateTieredBadge('multiHitGames', maxHitsInGame);
      if (multiHitBadge) {
        const multiHitGame = battingData.games.find(g => (g.hits || 0) === maxHitsInGame);
        earned.multiHitGames = { ...multiHitBadge, value: maxHitsInGame, gameDate: multiHitGame?.gameDate || null };
      }

      // Season Hits
      const seasonHitsBadge = this.evaluateTieredBadge('seasonHits', battingData.totals.hits);
      if (seasonHitsBadge) {
        earned.seasonHits = { ...seasonHitsBadge, value: battingData.totals.hits, gameDate: lastGame?.gameDate || null };
      }

      // Season Runs
      const seasonRunsBadge = this.evaluateTieredBadge('seasonRuns', battingData.totals.runs);
      if (seasonRunsBadge) {
        earned.seasonRuns = { ...seasonRunsBadge, value: battingData.totals.runs, gameDate: lastGame?.gameDate || null };
      }

      // Season Walks
      const seasonWalksBadge = this.evaluateTieredBadge('seasonWalks', battingData.totals.walks);
      if (seasonWalksBadge) {
        earned.seasonWalks = { ...seasonWalksBadge, value: battingData.totals.walks, gameDate: lastGame?.gameDate || null };
      }

      // Big Games (max runs in a game)
      const maxRunsInGame = Math.max(...battingData.games.map(g => g.runs || 0));
      const bigGameBadge = this.evaluateTieredBadge('bigGames', maxRunsInGame);
      if (bigGameBadge) {
        const bigGameEntry = battingData.games.find(g => (g.runs || 0) === maxRunsInGame);
        earned.bigGames = { ...bigGameBadge, value: maxRunsInGame, gameDate: bigGameEntry?.gameDate || null };
      }

      // Iron Man - played in every team game (regular season + playoffs), end of season only
      if (seasonComplete) {
        const tid = (battingData.teamId || '').toLowerCase().trim();
        const totalTeamGames = teamTotalGames[tid] || 0;
        const playerAppearances = battingData.games.length;
        if (totalTeamGames > 0 && playerAppearances === totalTeamGames) {
          earned.ironMan = {
            badgeId: 'ironMan',
            ...BADGE_DEFINITIONS.ironMan,
            value: playerAppearances,
            gameDate: lastGame?.gameDate || null
          };
        }
      }

      // Table Setter - more walks than games
      if (battingData.totals.walks > battingData.totals.games) {
        earned.tableSetter = {
          badgeId: 'tableSetter',
          ...BADGE_DEFINITIONS.tableSetter,
          value: battingData.totals.walks,
          gameDate: lastGame?.gameDate || null
        };
      }
      
      // Opening Day Hero - must get a hit in a game on the actual opening day
      // openingDay is a 'YYYY-MM-DD' string to avoid UTC timestamp issues
      if (openingDay) {
        const openingDayGame = battingData.games.find(g => {
          const dateStr = g.gameDateFormatted || (() => {
            const d = g.gameDate instanceof Date ? g.gameDate : new Date(g.gameDate);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          })();
          return dateStr === openingDay;
        });
        
        if (openingDayGame && (openingDayGame.hits || 0) >= 1) {
          earned.openingDayHero = {
            badgeId: 'openingDayHero',
            ...BADGE_DEFINITIONS.openingDayHero,
            gameDate: openingDayGame.gameDate
          };
        }
      }
      
      // ===== HIDDEN BADGES (HITTING) =====
      
      // The Architect - runs in 10 different games
      const gamesWithRuns = battingData.games.filter(g => (g.runs || 0) >= 1).length;
      if (gamesWithRuns >= 10) {
        earned.theArchitect = {
          badgeId: 'theArchitect',
          ...BADGE_DEFINITIONS.theArchitect,
          value: gamesWithRuns,
          hidden: true,
          gameDate: lastGame?.gameDate || null
        };
      }

      // Perfect 10 - exactly 10/10/10
      if (battingData.totals.hits === 10 &&
          battingData.totals.runs === 10 &&
          battingData.totals.walks === 10) {
        earned.perfectTen = {
          badgeId: 'perfectTen',
          ...BADGE_DEFINITIONS.perfectTen,
          hidden: true,
          gameDate: lastGame?.gameDate || null
        };
      }
      
      // Déjà Vu - same stat line 3x (must have at least 1 hit, run, or walk)
      const statLines = {};
      battingData.games.forEach(g => {
        const hits = g.hits || 0;
        const walks = g.walks || 0;
        const runs = g.runs || 0;
        
        // Only count meaningful stat lines (at least 1 hit, walk, or run)
        if (hits >= 1 || walks >= 1 || runs >= 1) {
          const key = `${hits}-${walks}-${runs}`;
          statLines[key] = (statLines[key] || 0) + 1;
        }
      });
      const statLineValues = Object.values(statLines);
      const maxSameStatLine = statLineValues.length > 0 ? Math.max(...statLineValues) : 0;
      if (maxSameStatLine >= 3) {
        // Find which stat line it was
        const winningStatLine = Object.entries(statLines).find(([k, v]) => v === maxSameStatLine)?.[0];
        earned.dejaVu = {
          badgeId: 'dejaVu',
          ...BADGE_DEFINITIONS.dejaVu,
          value: maxSameStatLine,
          statLine: winningStatLine,
          hidden: true,
          gameDate: lastGame?.gameDate || null
        };
      }
      
      // Invisible Man - 5+ walks with 0 hits in a game
      const invisibleGame = battingData.games.find(g => (g.walks || 0) >= 5 && (g.hits || 0) === 0);
      if (invisibleGame) {
        earned.invisibleMan = {
          badgeId: 'invisibleMan',
          ...BADGE_DEFINITIONS.invisibleMan,
          value: invisibleGame.walks,
          hidden: true,
          gameDate: invisibleGame.gameDate || null
        };
      }
      
      // Lucky 7 - exactly 7 hits against the same opponent
      const hitsVsOpponent = {};
      battingData.games.forEach(g => {
        const opp = (g.opponent || '').toLowerCase();
        if (opp) {
          hitsVsOpponent[opp] = (hitsVsOpponent[opp] || 0) + (g.hits || 0);
        }
      });
      const luckySevenOpponent = Object.entries(hitsVsOpponent).find(([opp, hits]) => hits === 7);
      if (luckySevenOpponent) {
        // Use the most recent game vs that opponent as the earned date
        const luckySevenGames = battingData.games.filter(g => (g.opponent || '').toLowerCase() === luckySevenOpponent[0]);
        const luckySevenLastGame = luckySevenGames[luckySevenGames.length - 1];
        earned.luckySeven = {
          badgeId: 'luckySeven',
          ...BADGE_DEFINITIONS.luckySeven,
          opponent: luckySevenOpponent[0],
          value: 7,
          hidden: true,
          gameDate: luckySevenLastGame?.gameDate || null
        };
      }
      
      // The Streak Lives - hit in the final game of the season to end with a 6+ game hit streak
      // Only evaluated when the season is marked complete, so it doesn't fire prematurely mid-season
      if (seasonComplete) {
      const sortedGames = [...battingData.games].sort((a, b) => {
        const dateA = a.gameDate instanceof Date ? a.gameDate : new Date(a.gameDate);
        const dateB = b.gameDate instanceof Date ? b.gameDate : new Date(b.gameDate);
        return dateB - dateA; // Most recent first
      });

      if (sortedGames.length > 0) {
        const finalGame = sortedGames[0];
        const finalGameHadHit = (finalGame.hits || 0) >= 1;

        if (finalGameHadHit) {
          // Check if this extended a streak to 6+
          // Count consecutive games with hits ending at the final game
          let streakAtEnd = 0;
          for (const game of sortedGames) {
            if ((game.hits || 0) >= 1) {
              streakAtEnd++;
            } else {
              break;
            }
          }
          
          if (streakAtEnd >= 6) {
            earned.theStreakLives = {
              badgeId: 'theStreakLives',
              ...BADGE_DEFINITIONS.theStreakLives,
              value: streakAtEnd,
              hidden: true,
              gameDate: finalGame.gameDate || null
            };
          }
        }
      }
      } // end seasonComplete gate for theStreakLives

      // Zero to Hero - score 3+ runs in a game after being hitless in the previous 3 games
      // Can be earned multiple times; stored as an array of occurrences
      const regularSeasonGames = battingData.games.filter(g => !g.isPlayoff);
      if (regularSeasonGames.length >= 4) { // Need at least 4 games for the 3-game lookback to be meaningful
        const zeroToHeroOccurrences = [];
        for (let i = 3; i < regularSeasonGames.length; i++) {
          const currentGame = regularSeasonGames[i];
          if ((currentGame.runs || 0) < 3) continue;

          const prev3 = regularSeasonGames.slice(i - 3, i);
          const hitlessInPrev3 = prev3.every(g => (g.hits || 0) === 0);

          if (hitlessInPrev3) {
            zeroToHeroOccurrences.push({
              gameIndex: i,
              gameDate: currentGame.gameDate || null,
              runsScored: currentGame.runs,
              hitlessPriorGames: 3
            });
          }
        }

        if (zeroToHeroOccurrences.length > 0) {
          earned.zeroToHero = {
            badgeId: 'zeroToHero',
            ...BADGE_DEFINITIONS.zeroToHero,
            occurrences: zeroToHeroOccurrences,
            count: zeroToHeroOccurrences.length,
            // Use the most recent occurrence date for display
            gameDate: zeroToHeroOccurrences[zeroToHeroOccurrences.length - 1].gameDate,
            hidden: true
          };
        }
      }
      
      // ===== PLAYOFF HITTING BADGES =====
      const playoffBattingGames = battingData.games.filter(g => g.isPlayoff === true);
      if (playoffBattingGames.length >= 2) {
        // Playoff Performer - hit in every playoff game
        const playoffGamesWithHit = playoffBattingGames.filter(g => (g.hits || 0) >= 1).length;
        if (playoffGamesWithHit === playoffBattingGames.length) {
          earned.playoffPerformer = {
            badgeId: 'playoffPerformer',
            ...BADGE_DEFINITIONS.playoffPerformer,
            value: playoffBattingGames.length,
            gameDate: playoffBattingGames[playoffBattingGames.length - 1]?.gameDate || null
          };
        }
      }
    }
    
    // ===== PITCHING BADGES =====
    if (pitchingData.games && pitchingData.games.length > 0) {

      // Most recent pitching game — used as "earned on" date for cumulative pitching badges
      const lastPitchingGame = pitchingData.games[pitchingData.games.length - 1];

      // Scoreless Outings (0 RA with 1+ IP)
      const scorelessOutings = pitchingData.games.filter(
        g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 1
      ).length;
      const scorelessBadge = this.evaluateTieredBadge('scorelessOutings', scorelessOutings);
      if (scorelessBadge) {
        earned.scorelessOutings = { ...scorelessBadge, value: scorelessOutings, gameDate: lastPitchingGame?.gameDate || null };
      }

      // Season Innings
      const seasonInningsBadge = this.evaluateTieredBadge('seasonInnings', pitchingData.totals.inningsPitched);
      if (seasonInningsBadge) {
        earned.seasonInnings = { ...seasonInningsBadge, value: pitchingData.totals.inningsPitched, gameDate: lastPitchingGame?.gameDate || null };
      }

      // Low-Run Games (≤2 RA with 2+ IP)
      const lowRunGames = pitchingData.games.filter(
        g => (g.runsAllowed || 0) <= 2 && (g.inningsPitched || 0) >= 2
      ).length;
      const lowRunBadge = this.evaluateTieredBadge('lowRunGames', lowRunGames);
      if (lowRunBadge) {
        earned.lowRunGames = { ...lowRunBadge, value: lowRunGames, gameDate: lastPitchingGame?.gameDate || null };
      }

      // Ironclad - 0 RA with 3+ IP in one game
      const ironcladGame = pitchingData.games.find(
        g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 3
      );
      if (ironcladGame) {
        earned.ironclad = {
          badgeId: 'ironclad',
          ...BADGE_DEFINITIONS.ironclad,
          value: ironcladGame.inningsPitched,
          gameDate: ironcladGame.gameDate || null
        };
      }

      // Kryptonite - ≤2 RA vs same opponent 2+ times
      const opponentRA = {};
      pitchingData.games.forEach(g => {
        if ((g.runsAllowed || 0) <= 2 && (g.inningsPitched || 0) >= 1) {
          const opp = (g.opponent || '').toLowerCase();
          opponentRA[opp] = (opponentRA[opp] || 0) + 1;
        }
      });
      const kryptoniteOpponent = Object.entries(opponentRA).find(([opp, count]) => count >= 2);
      if (kryptoniteOpponent) {
        const kryptoniteGames = pitchingData.games.filter(g => (g.opponent || '').toLowerCase() === kryptoniteOpponent[0]);
        earned.kryptonite = {
          badgeId: 'kryptonite',
          ...BADGE_DEFINITIONS.kryptonite,
          opponent: kryptoniteOpponent[0],
          value: kryptoniteOpponent[1],
          gameDate: kryptoniteGames[kryptoniteGames.length - 1]?.gameDate || null
        };
      }

      // Nemesis - pitch 3+ games vs same opponent
      const opponentGames = {};
      pitchingData.games.forEach(g => {
        const opp = (g.opponent || '').toLowerCase();
        opponentGames[opp] = (opponentGames[opp] || 0) + 1;
      });
      const nemesisOpponent = Object.entries(opponentGames).find(([opp, count]) => count >= 3);
      if (nemesisOpponent) {
        const nemesisGames = pitchingData.games.filter(g => (g.opponent || '').toLowerCase() === nemesisOpponent[0]);
        earned.nemesis = {
          badgeId: 'nemesis',
          ...BADGE_DEFINITIONS.nemesis,
          opponent: nemesisOpponent[0],
          value: nemesisOpponent[1],
          gameDate: nemesisGames[nemesisGames.length - 1]?.gameDate || null
        };
      }

      // ===== PLAYOFF PITCHING BADGES =====
      const playoffPitchingGames = pitchingData.games.filter(g => g.isPlayoff === true);

      // Postseason Ace - scoreless outing in playoffs (min 1 IP)
      const scorelessPlayoffGame = playoffPitchingGames.find(
        g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 1
      );
      if (scorelessPlayoffGame) {
        earned.postseasonAce = {
          badgeId: 'postseasonAce',
          ...BADGE_DEFINITIONS.postseasonAce,
          value: scorelessPlayoffGame.inningsPitched,
          opponent: scorelessPlayoffGame.opponent,
          gameDate: scorelessPlayoffGame.gameDate || null
        };
      }
      
      // Giant Slayer - hold a top-3 team to their lowest run total
      // Build opponent run totals from all pitching data to find top teams
      const teamRunsAllowed = {}; // Runs scored BY each opponent (against all pitchers)
      Object.values(allPitchingData).forEach(pitcher => {
        (pitcher.games || []).forEach(g => {
          if (!g.isPlayoff) {
            const opp = (g.opponent || '').toLowerCase();
            if (opp) {
              if (!teamRunsAllowed[opp]) {
                teamRunsAllowed[opp] = { totalRuns: 0, games: [], minRuns: Infinity };
              }
              const runs = g.runsAllowed || 0;
              teamRunsAllowed[opp].totalRuns += runs;
              teamRunsAllowed[opp].games.push({ runs, pitcher: pitcher.playerId });
              if (runs < teamRunsAllowed[opp].minRuns) {
                teamRunsAllowed[opp].minRuns = runs;
              }
            }
          }
        });
      });
      
      // Find top 3 teams by total runs scored (against our pitchers)
      const sortedTeams = Object.entries(teamRunsAllowed)
        .sort((a, b) => b[1].totalRuns - a[1].totalRuns)
        .slice(0, 3)
        .map(([team]) => team);
      
      // Check if this pitcher held a top-3 team to their season low
      for (const game of pitchingData.games) {
        if (game.isPlayoff) continue;
        const opp = (game.opponent || '').toLowerCase();
        if (sortedTeams.includes(opp)) {
          const oppData = teamRunsAllowed[opp];
          const gameRuns = game.runsAllowed || 0;
          // Check if this game was the minimum for that opponent
          if (gameRuns === oppData.minRuns && gameRuns <= 2) {
            earned.giantSlayer = {
              badgeId: 'giantSlayer',
              ...BADGE_DEFINITIONS.giantSlayer,
              opponent: opp,
              value: gameRuns,
              gameDate: game.gameDate || null
            };
            break; // Only need one
          }
        }
      }
    }
    
    // ===== TWO-WAY BADGES =====
    if (battingData.totals && pitchingData.totals) {
      const hits = battingData.totals.hits || 0;
      const ip = pitchingData.totals.inningsPitched || 0;
      const scorelessCount = pitchingData.games ? 
        pitchingData.games.filter(g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 1).length : 0;
      
      const twoWayDef = BADGE_DEFINITIONS.twoWay;
      let twoWayTier = null;
      
      if (hits >= 20 && ip >= 20 && scorelessCount >= 2) {
        twoWayTier = 'gold';
      } else if (hits >= 15 && ip >= 15) {
        twoWayTier = 'silver';
      } else if (hits >= 10 && ip >= 10) {
        twoWayTier = 'bronze';
      }
      
      if (twoWayTier) {
        earned.twoWay = {
          badgeId: 'twoWay',
          tier: twoWayTier,
          name: twoWayDef.tiers[twoWayTier].name,
          icon: twoWayDef.icon,
          category: twoWayDef.category,
          value: { hits, ip, scorelessCount },
          gameDate: lastGame?.gameDate || null
        };
      }

      // Quiet Storm (hidden) - lead team in runs but not hits
      // This requires team context - we'll check it if we have team data
      if (teamId && allBattingData) {
        const teamPlayers = Object.values(allBattingData).filter(p => p.teamId === teamId);
        if (teamPlayers.length > 1) {
          const sortedByRuns = [...teamPlayers].sort((a, b) => (b.totals?.runs || 0) - (a.totals?.runs || 0));
          const sortedByHits = [...teamPlayers].sort((a, b) => (b.totals?.hits || 0) - (a.totals?.hits || 0));

          if (sortedByRuns[0]?.playerId === playerId && sortedByHits[0]?.playerId !== playerId) {
            earned.quietStorm = {
              badgeId: 'quietStorm',
              ...BADGE_DEFINITIONS.quietStorm,
              value: battingData.totals.runs,
              hidden: true,
              gameDate: lastGame?.gameDate || null
            };
          }
        }
      }
    }
    
    return {
      playerId,
      playerName,
      teamId,
      seasonId: this.seasonId,
      earned,
      progress,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate hit streak from games
   */
  calculateHitStreak(games) {
    let currentStreak = 0;
    let maxStreak = 0;
    
    // Games should already be sorted by date
    for (const game of games) {
      if ((game.hits || 0) >= 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    
    return { currentStreak, maxStreak };
  }

  /**
   * Evaluate a tiered badge based on a value
   */
  evaluateTieredBadge(badgeId, value) {
    const def = BADGE_DEFINITIONS[badgeId];
    if (!def || def.type !== 'tiered') return null;
    
    // Check tiers from highest to lowest
    if (value >= def.tiers.gold.threshold) {
      return {
        badgeId,
        tier: 'gold',
        name: def.tiers.gold.name,
        icon: def.icon,
        category: def.category,
        description: def.tiers.gold.description
      };
    } else if (value >= def.tiers.silver.threshold) {
      return {
        badgeId,
        tier: 'silver',
        name: def.tiers.silver.name,
        icon: def.icon,
        category: def.category,
        description: def.tiers.silver.description
      };
    } else if (value >= def.tiers.bronze.threshold) {
      return {
        badgeId,
        tier: 'bronze',
        name: def.tiers.bronze.name,
        icon: def.icon,
        category: def.category,
        description: def.tiers.bronze.description
      };
    }
    
    return null;
  }

  /**
   * Save badge results to Firestore
   */
  async saveBadgeResults(results) {
    if (!this.setDoc || !this.doc) {
      console.warn('Firestore write functions not provided, skipping save');
      return;
    }
    
    const collectionName = this.testMode ? 'playerBadges_test' : 'playerBadges';
    
    try {
      // Save season summary
      const summaryRef = this.doc(this.db, collectionName, `season_${results.seasonId}`);
      await this.setDoc(summaryRef, {
        seasonId: results.seasonId,
        calculatedAt: this.serverTimestamp ? this.serverTimestamp() : new Date(),
        isPartialData: results.isPartialData,
        summary: results.badgeSummary,
        leaderboard: results.leaderboard.slice(0, 20) // Top 20
      });
      
      // Save individual player badges — preserve earnedAt timestamps for existing badges
      for (const [playerId, badges] of Object.entries(results.playerBadges)) {
        const playerRef = this.doc(this.db, collectionName, `${results.seasonId}_${playerId}`);

        // Read existing doc to preserve earnedAt for badges that were already awarded
        let existingEarned = {};
        try {
          const existing = await this.getDoc ? this.getDoc(playerRef) : null;
          if (existing && existing.exists && existing.exists()) {
            existingEarned = existing.data()?.earned || {};
          }
        } catch (e) {
          // If read fails, proceed without preservation
        }

        // Stamp earnedAt on each badge: preserve existing, set now for new ones
        const now = new Date().toISOString();
        const earnedWithTimestamps = {};
        for (const [badgeId, badge] of Object.entries(badges.earned || {})) {
          earnedWithTimestamps[badgeId] = {
            ...badge,
            earnedAt: existingEarned[badgeId]?.earnedAt || (badge.gameDate ? (badge.gameDate instanceof Date ? badge.gameDate.toISOString() : badge.gameDate) : now)
          };
        }

        await this.setDoc(playerRef, {
          ...badges,
          earned: earnedWithTimestamps,
          updatedAt: this.serverTimestamp ? this.serverTimestamp() : new Date()
        });
      }
      
      console.log(`💾 Saved badge results to ${collectionName}`);
    } catch (error) {
      console.error('Error saving badge results:', error);
      throw error;
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get badge definition by ID
 */
export function getBadgeDefinition(badgeId) {
  return BADGE_DEFINITIONS[badgeId] || null;
}

/**
 * Get all badges in a category
 */
export function getBadgesByCategory(category) {
  return Object.values(BADGE_DEFINITIONS).filter(b => b.category === category);
}

/**
 * Get badge icon HTML - uses custom image if available, falls back to emoji
 * @param {string} badgeId - The badge ID
 * @param {string} tier - Optional tier (bronze/silver/gold)
 * @param {number} size - Icon size in pixels (default 48)
 * @returns {string} HTML for the badge icon
 */
export function getBadgeIconHtml(badgeId, tier = null, size = 48) {
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) return `<span class="badge-icon-emoji" style="font-size: ${size}px;">🏅</span>`;
  
  if (def.iconPath) {
    // Custom graphic exists - build the full path
    const tierSuffix = tier ? `-${tier}` : '';
    const imgSrc = `${def.iconPath}${tierSuffix}.png`;
    return `<img src="${imgSrc}" alt="${def.name}" class="badge-icon-img" style="width: ${size}px; height: ${size}px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="badge-icon-emoji" style="font-size: ${size}px; display: none;">${def.icon || '🏅'}</span>`;
  }
  
  // Fallback to emoji
  return `<span class="badge-icon-emoji" style="font-size: ${size}px;">${def.icon || '🏅'}</span>`;
}

/**
 * Get tier color class
 */
export function getTierColorClass(tier) {
  switch (tier) {
    case 'gold': return 'gold-tier';
    case 'silver': return 'silver-tier';
    case 'bronze': return 'bronze-tier';
    default: return '';
  }
}

/**
 * Format badge for display
 */
export function formatBadgeForDisplay(badge) {
  const def = BADGE_DEFINITIONS[badge.badgeId];
  return {
    ...badge,
    definition: def,
    tierClass: getTierColorClass(badge.tier),
    displayName: badge.name || def?.name || badge.badgeId
  };
}
