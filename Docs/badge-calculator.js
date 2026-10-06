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
    tiers: {
      bronze: { name: 'Big Day', threshold: 2, description: '2+ runs scored in a single game' },
      silver: { name: 'Crooked Number', threshold: 3, description: '3+ runs scored in a single game' },
      gold: { name: 'One-Man Rally', threshold: 4, description: '4+ runs scored in a single game' }
    }
  },
  
  ironMan: {
    id: 'ironMan',
    name: 'Iron Man',
    category: 'hitting',
    type: 'single',
    icon: '⛓️',
    description: 'Get at least 1 hit in every regular season game',
    requirement: 'Hit in every game of the regular season'
  },
  
  tableSetter: {
    id: 'tableSetter',
    name: 'Table Setter',
    category: 'hitting',
    type: 'single',
    icon: '🍽️',
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
    tiers: {
      bronze: { name: 'Reliable Arm', threshold: 10, description: '10+ innings pitched in a season' },
      silver: { name: 'Workhorse', threshold: 20, description: '20+ innings pitched in a season' },
      gold: { name: 'Ace', threshold: 30, description: '30+ innings pitched in a season' }
    }
  },
  
  lowRunGames: {
    id: 'lowRunGames',
    name: 'Low-Run Games',
    category: 'pitching',
    type: 'tiered',
    icon: '🛡️',
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
    description: 'Allow 0 runs across 3+ innings in a single game',
    requirement: '0 RA with 3+ IP in one game'
  },
  
  staffAce: {
    id: 'staffAce',
    name: 'Staff Ace',
    category: 'pitching',
    type: 'single',
    icon: '👑',
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
    description: 'Allow 2 or fewer runs against the same opponent twice',
    requirement: '≤2 RA vs same team 2+ times'
  },
  
  nemesis: {
    id: 'nemesis',
    name: 'Nemesis',
    category: 'pitching',
    type: 'single',
    icon: '🎭',
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
    description: 'Get a hit in the first game of the season',
    requirement: 'Hit in season opener'
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
    description: 'Same stat line (hits/walks/runs) in 3 different games',
    revealText: '"Haven\'t we been here before?"',
    hidden: true
  },
  
  perfectTen: {
    id: 'perfectTen',
    name: 'Perfect 10',
    category: 'hidden',
    type: 'single',
    icon: '🎯',
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
    description: '5+ walks with 0 hits in a game',
    revealText: '"They couldn\'t find the zone"',
    hidden: true
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
    this.setDoc = options.setDoc || null;
    this.serverTimestamp = options.serverTimestamp || null;
    this.testMode = options.testMode || false;
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
    const battingData = await this.loadBattingData(seasonId);
    const pitchingData = await this.loadPitchingData(seasonId);
    
    console.log(`📊 Loaded ${Object.keys(battingData).length} batters, ${Object.keys(pitchingData).length} pitchers`);
    
    // Get unique players
    const allPlayerIds = new Set([
      ...Object.keys(battingData),
      ...Object.keys(pitchingData)
    ]);
    
    console.log(`👥 Processing ${allPlayerIds.size} unique players`);
    
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
      
      const badges = this.calculatePlayerBadges(playerId, playerBatting, playerPitching, battingData, pitchingData);
      
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
   * Load batting game data for a season
   */
  async loadBattingData(seasonId) {
    const playerData = {};
    
    try {
      // Query all players who have game data
      // Structure: playerStats/{playerId}/games/{gameDocId}
      const playersRef = this.collection(this.db, 'playerStats');
      const playersSnap = await this.getDocs(playersRef);
      
      for (const playerDoc of playersSnap.docs) {
        const playerId = playerDoc.id;
        const gamesRef = this.collection(this.db, 'playerStats', playerId, 'games');
        const gamesSnap = await this.getDocs(gamesRef);
        
        const games = [];
        let playerName = '';
        let teamId = '';
        
        gamesSnap.forEach(gameDoc => {
          const data = gameDoc.data();
          if (data.seasonId === seasonId) {
            games.push({
              id: gameDoc.id,
              ...data,
              gameDate: data.gameDate?.toDate ? data.gameDate.toDate() : new Date(data.gameDate)
            });
            if (!playerName) playerName = data.playerName || playerId;
            if (!teamId) teamId = data.teamId || '';
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
          
          playerData[playerId] = {
            playerId,
            playerName,
            teamId,
            games,
            totals
          };
        }
      }
    } catch (error) {
      console.error('Error loading batting data:', error);
    }
    
    return playerData;
  }

  /**
   * Load pitching game data for a season
   */
  async loadPitchingData(seasonId) {
    const playerData = {};
    
    try {
      const playersRef = this.collection(this.db, 'pitchingStats');
      const playersSnap = await this.getDocs(playersRef);
      
      for (const playerDoc of playersSnap.docs) {
        const playerId = playerDoc.id;
        const gamesRef = this.collection(this.db, 'pitchingStats', playerId, 'games');
        const gamesSnap = await this.getDocs(gamesRef);
        
        const games = [];
        let playerName = '';
        let teamId = '';
        
        gamesSnap.forEach(gameDoc => {
          const data = gameDoc.data();
          if (data.seasonId === seasonId) {
            games.push({
              id: gameDoc.id,
              ...data,
              gameDate: data.gameDate?.toDate ? data.gameDate.toDate() : new Date(data.gameDate)
            });
            if (!playerName) playerName = data.playerName || playerId;
            if (!teamId) teamId = data.teamId || '';
          }
        });
        
        if (games.length > 0) {
          games.sort((a, b) => a.gameDate - b.gameDate);
          
          const totals = {
            games: games.length,
            inningsPitched: games.reduce((sum, g) => sum + (g.inningsPitched || 0), 0),
            runsAllowed: games.reduce((sum, g) => sum + (g.runsAllowed || 0), 0)
          };
          
          playerData[playerId] = {
            playerId,
            playerName,
            teamId,
            games,
            totals
          };
        }
      }
    } catch (error) {
      console.error('Error loading pitching data:', error);
    }
    
    return playerData;
  }

  /**
   * Calculate all badges for a single player
   */
  calculatePlayerBadges(playerId, battingData, pitchingData, allBattingData, allPitchingData) {
    const earned = {};
    const progress = {};
    
    const playerName = battingData.playerName || pitchingData.playerName || playerId;
    const teamId = battingData.teamId || pitchingData.teamId || '';
    
    // ===== HITTING BADGES =====
    if (battingData.games && battingData.games.length > 0) {
      
      // Hit Streak
      const hitStreak = this.calculateHitStreak(battingData.games);
      const hitStreakBadge = this.evaluateTieredBadge('hitStreak', hitStreak.maxStreak);
      if (hitStreakBadge) {
        earned.hitStreak = { ...hitStreakBadge, value: hitStreak.maxStreak };
      }
      progress.hitStreak = { current: hitStreak.currentStreak, max: hitStreak.maxStreak };
      
      // Multi-Hit Games
      const maxHitsInGame = Math.max(...battingData.games.map(g => g.hits || 0));
      const multiHitBadge = this.evaluateTieredBadge('multiHitGames', maxHitsInGame);
      if (multiHitBadge) {
        earned.multiHitGames = { ...multiHitBadge, value: maxHitsInGame };
      }
      
      // Season Hits
      const seasonHitsBadge = this.evaluateTieredBadge('seasonHits', battingData.totals.hits);
      if (seasonHitsBadge) {
        earned.seasonHits = { ...seasonHitsBadge, value: battingData.totals.hits };
      }
      
      // Season Runs
      const seasonRunsBadge = this.evaluateTieredBadge('seasonRuns', battingData.totals.runs);
      if (seasonRunsBadge) {
        earned.seasonRuns = { ...seasonRunsBadge, value: battingData.totals.runs };
      }
      
      // Season Walks
      const seasonWalksBadge = this.evaluateTieredBadge('seasonWalks', battingData.totals.walks);
      if (seasonWalksBadge) {
        earned.seasonWalks = { ...seasonWalksBadge, value: battingData.totals.walks };
      }
      
      // Big Games (max runs in a game)
      const maxRunsInGame = Math.max(...battingData.games.map(g => g.runs || 0));
      const bigGameBadge = this.evaluateTieredBadge('bigGames', maxRunsInGame);
      if (bigGameBadge) {
        earned.bigGames = { ...bigGameBadge, value: maxRunsInGame };
      }
      
      // Iron Man - hit in every game (regular season only)
      const regularGames = battingData.games.filter(g => !g.isPlayoff);
      const gamesWithHits = regularGames.filter(g => (g.hits || 0) >= 1).length;
      if (regularGames.length >= 10 && gamesWithHits === regularGames.length) {
        earned.ironMan = {
          badgeId: 'ironMan',
          ...BADGE_DEFINITIONS.ironMan,
          value: regularGames.length
        };
      }
      
      // Table Setter - more walks than games
      if (battingData.totals.walks > battingData.totals.games) {
        earned.tableSetter = {
          badgeId: 'tableSetter',
          ...BADGE_DEFINITIONS.tableSetter,
          value: battingData.totals.walks
        };
      }
      
      // Opening Day Hero
      const firstGame = battingData.games[0];
      if (firstGame && (firstGame.hits || 0) >= 1) {
        // Check if this was actually the first game of the season
        earned.openingDayHero = {
          badgeId: 'openingDayHero',
          ...BADGE_DEFINITIONS.openingDayHero,
          gameDate: firstGame.gameDate
        };
      }
      
      // ===== HIDDEN BADGES (HITTING) =====
      
      // The Architect - runs in 10 different games
      const gamesWithRuns = battingData.games.filter(g => (g.runs || 0) >= 1).length;
      if (gamesWithRuns >= 10) {
        earned.theArchitect = {
          badgeId: 'theArchitect',
          ...BADGE_DEFINITIONS.theArchitect,
          value: gamesWithRuns,
          hidden: true
        };
      }
      
      // Perfect 10 - exactly 10/10/10
      if (battingData.totals.hits === 10 && 
          battingData.totals.runs === 10 && 
          battingData.totals.walks === 10) {
        earned.perfectTen = {
          badgeId: 'perfectTen',
          ...BADGE_DEFINITIONS.perfectTen,
          hidden: true
        };
      }
      
      // Déjà Vu - same stat line 3x
      const statLines = {};
      battingData.games.forEach(g => {
        const key = `${g.hits || 0}-${g.walks || 0}-${g.runs || 0}`;
        statLines[key] = (statLines[key] || 0) + 1;
      });
      const maxSameStatLine = Math.max(...Object.values(statLines));
      if (maxSameStatLine >= 3) {
        earned.dejaVu = {
          badgeId: 'dejaVu',
          ...BADGE_DEFINITIONS.dejaVu,
          value: maxSameStatLine,
          hidden: true
        };
      }
      
      // Invisible Man - 5+ walks with 0 hits in a game
      const invisibleGame = battingData.games.find(g => (g.walks || 0) >= 5 && (g.hits || 0) === 0);
      if (invisibleGame) {
        earned.invisibleMan = {
          badgeId: 'invisibleMan',
          ...BADGE_DEFINITIONS.invisibleMan,
          value: invisibleGame.walks,
          hidden: true
        };
      }
    }
    
    // ===== PITCHING BADGES =====
    if (pitchingData.games && pitchingData.games.length > 0) {
      
      // Scoreless Outings (0 RA with 1+ IP)
      const scorelessOutings = pitchingData.games.filter(
        g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 1
      ).length;
      const scorelessBadge = this.evaluateTieredBadge('scorelessOutings', scorelessOutings);
      if (scorelessBadge) {
        earned.scorelessOutings = { ...scorelessBadge, value: scorelessOutings };
      }
      
      // Season Innings
      const seasonInningsBadge = this.evaluateTieredBadge('seasonInnings', pitchingData.totals.inningsPitched);
      if (seasonInningsBadge) {
        earned.seasonInnings = { ...seasonInningsBadge, value: pitchingData.totals.inningsPitched };
      }
      
      // Low-Run Games (≤2 RA with 2+ IP)
      const lowRunGames = pitchingData.games.filter(
        g => (g.runsAllowed || 0) <= 2 && (g.inningsPitched || 0) >= 2
      ).length;
      const lowRunBadge = this.evaluateTieredBadge('lowRunGames', lowRunGames);
      if (lowRunBadge) {
        earned.lowRunGames = { ...lowRunBadge, value: lowRunGames };
      }
      
      // Ironclad - 0 RA with 3+ IP in one game
      const ironcladGame = pitchingData.games.find(
        g => (g.runsAllowed || 0) === 0 && (g.inningsPitched || 0) >= 3
      );
      if (ironcladGame) {
        earned.ironclad = {
          badgeId: 'ironclad',
          ...BADGE_DEFINITIONS.ironclad,
          value: ironcladGame.inningsPitched
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
        earned.kryptonite = {
          badgeId: 'kryptonite',
          ...BADGE_DEFINITIONS.kryptonite,
          opponent: kryptoniteOpponent[0],
          value: kryptoniteOpponent[1]
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
        earned.nemesis = {
          badgeId: 'nemesis',
          ...BADGE_DEFINITIONS.nemesis,
          opponent: nemesisOpponent[0],
          value: nemesisOpponent[1]
        };
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
          value: { hits, ip, scorelessCount }
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
              hidden: true
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
      
      // Save individual player badges
      for (const [playerId, badges] of Object.entries(results.playerBadges)) {
        const playerRef = this.doc(this.db, collectionName, `${results.seasonId}_${playerId}`);
        await this.setDoc(playerRef, {
          ...badges,
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
