// js/admin/aggregate-stats.js
// admin/aggregate-stats.html: rebuild player totals from game-level stats.
// The aggregation, bWAR, hit streak, box score, merge and career logic below
// is the old page's, moved unchanged (only alert/confirm became the site's
// toast and dialog, and the log lost its emoji). The page shell, season list,
// test mode switch and button wiring are new.
//
//   aggregatedPlayerStats       production totals (test mode: aggregatedPlayerStats_test)
//   aggregatedPlayerStats2025Splits  2025 partial game data, splits only
//   gameBoxScores, hitStreaks   built from game docs after aggregating
// ?season=2026-fall preselects the season and &test=1 turns test mode on
// (the stats pipeline links here that way).

import { initPage, pageReady } from '../core/app.js';
import {
  db, collection, collectionGroup, doc, getDocs, getDoc, setDoc, updateDoc,
  deleteField, query, where, documentId
} from '../core/firebase.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { mountAdminShell } from './shell.js';

// Seasons with game-level stats (full aggregation to production): 2026 Summer on.
let GAME_BASED_SEASONS = ['2026-summer', '2026-fall', '2027-summer', '2027-fall'];
// 2025 seasons: partial game data, splits only, separate collection
const SPLITS_ONLY_SEASONS = ['2025-summer', '2025-fall'];
const SPLITS_2025_COLLECTION = 'aggregatedPlayerStats2025Splits';

let testModeEnabled = false;

function getAggregatedCollection() {
  return testModeEnabled ? 'aggregatedPlayerStats_test' : 'aggregatedPlayerStats';
}

function setTestMode(on) {
  testModeEnabled = !!on;
  document.getElementById('testModeCheckbox').checked = testModeEnabled;
  document.getElementById('testModeBanner').hidden = !testModeEnabled;
  document.body.classList.toggle('agg-test', testModeEnabled);
  log(testModeEnabled
    ? 'Test mode on: season aggregation writes to aggregatedPlayerStats_test. Production is not touched.'
    : 'Test mode off: season aggregation writes to production (aggregatedPlayerStats).', 'header');
}
window.toggleTestMode = () => setTestMode(document.getElementById('testModeCheckbox').checked);

// ============================================
// UTILITY FUNCTIONS
// ============================================

function log(message, type = 'info') {
  const output = document.getElementById('output');
  const line = document.createElement('div');
  line.className = `agg-line is-${type}`;
  const time = document.createElement('span');
  time.className = 'agg-time';
  time.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  line.append(time, document.createTextNode(String(message ?? '')));
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}
window.log = log;

function updateSeasonStats(players, games, batting, pitching) {
  document.getElementById('seasonStatsDisplay').style.display = 'grid';
  document.getElementById('playersWithGames').textContent = players;
  document.getElementById('totalGamesProcessed').textContent = games;
  document.getElementById('battingUpdated').textContent = batting;
  document.getElementById('pitchingUpdated').textContent = pitching;
}
window.updateSeasonStats = updateSeasonStats;

function update2025SplitsStats(players, games, updated) {
  document.getElementById('splits2025StatsDisplay').style.display = 'grid';
  document.getElementById('splits2025Players').textContent = players;
  document.getElementById('splits2025Games').textContent = games;
  document.getElementById('splits2025Updated').textContent = updated;
}
window.update2025SplitsStats = update2025SplitsStats;

function updateFullStats(processed, legacy, auth, skipped, errors) {
  document.getElementById('fullStatsDisplay').style.display = 'grid';
  document.getElementById('playersProcessed').textContent = processed;
  document.getElementById('legacyCount').textContent = legacy;
  document.getElementById('authCount').textContent = auth;
  document.getElementById('skippedCount').textContent = skipped;
  document.getElementById('errorCount').textContent = errors;
}
window.updateFullStats = updateFullStats;

window.clearOutput = function() {
  document.getElementById('output').textContent = '';
  document.getElementById('seasonStatsDisplay').style.display = 'none';
  document.getElementById('fullStatsDisplay').style.display = 'none';
  document.getElementById('splits2025StatsDisplay').style.display = 'none';
};

// ============================================
// 2025 SPLITS-ONLY AGGREGATION (NEW)
// ============================================

window.preview2025Splits = async function() {
  const seasonId = document.getElementById('season2025Select').value;
  if (!seasonId) {
    showToast('Please select a 2025 season first', 'error');
    return;
  }

  const btn = document.getElementById('preview2025Btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`PREVIEW: 2025 Splits for ${seasonId}`, 'header');
  log(' NO CHANGES WILL BE MADE TO DATABASE', 'header');
  log(`Target collection: ${SPLITS_2025_COLLECTION}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  try {
    const result = await gatherSplitsData(seasonId);
    
    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('PREVIEW COMPLETE', 'header');
    log(`Found ${result.playerCount} players with ${result.totalGames} total games`, 'success');
    log('No changes were made. Click "Aggregate 2025 Splits" to save.', 'splits');
    
    update2025SplitsStats(result.playerCount, result.totalGames, 0);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error('Preview error:', error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Preview';
  }
};

window.aggregate2025Splits = async function() {
  const seasonId = document.getElementById('season2025Select').value;
  if (!seasonId) {
    showToast('Please select a 2025 season first', 'error');
    return;
  }

  const confirmed = await confirmModal(
    `This will aggregate splits data for ${seasonId} into:\n\n` +
    `${SPLITS_2025_COLLECTION}\n\n` +
    `This data is PARTIAL and does NOT include all players.\n` +
    `Production stats (acesBPI, career) will NOT be modified.\n\n` +
    `Continue?`
  );
  if (!confirmed) return;

  const btn = document.getElementById('aggregate2025Btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`Aggregating 2025 Splits for ${seasonId}`, 'header');
  log(`Target collection: ${SPLITS_2025_COLLECTION}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  try {
    // Step 1: Gather splits data
    const result = await gatherSplitsData(seasonId);
    
    // Step 2: Save to 2025 splits collection
    log('');
    log('Saving splits data...', 'splits');
    
    let savedCount = 0;
    let errorCount = 0;
    
    for (const [legacyId, playerData] of result.playerSplits) {
      try {
        const docRef = window.doc(window.db, SPLITS_2025_COLLECTION, legacyId);
        const existingDoc = await window.getDoc(docRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : {};
        
        // Merge seasons
        const existingSeasons = existingData.seasons || {};
        existingSeasons[seasonId] = playerData.seasonSplits;
        
        // Calculate career splits from all 2025 seasons in this collection
        const careerSplits = calculate2025CareerSplits(existingSeasons);
        
        await window.setDoc(docRef, {
          name: playerData.playerName,
          seasons: existingSeasons,
          careerSplits: careerSplits,
          lastUpdated: new Date(),
          dataNote: 'Partial game data - not all games/players included'
        }, { merge: true });
        
        savedCount++;
        log(`  ${playerData.playerName}: ${playerData.games} games, ${Object.keys(playerData.seasonSplits.vsOpponent || {}).length} opponents`, 'success');
        
      } catch (error) {
        log(`  Error saving ${legacyId}: ${error.message}`, 'error');
        errorCount++;
      }
    }
    
    update2025SplitsStats(result.playerCount, result.totalGames, savedCount);
    
    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('AGGREGATION COMPLETE', 'header');
    log(`${savedCount} players saved to ${SPLITS_2025_COLLECTION}`, 'success');
    if (errorCount > 0) log(`${errorCount} errors`, 'error');
    log('Production stats remain unchanged.', 'splits');
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error('Aggregation error:', error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Aggregate 2025 Splits';
  }
};

async function gatherSplitsData(seasonId) {
  // Get all player legacy IDs from aggregatedPlayerStats
  log('Step 1: Getting player IDs from aggregatedPlayerStats...', 'splits');
  
  const aggregatedRef = window.collection(window.db, 'aggregatedPlayerStats');
  const aggregatedSnap = await window.getDocs(aggregatedRef);
  
  const playerLegacyIds = new Set();
  const legacyToName = new Map();
  
  aggregatedSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.migrated) return;
    
    let legacyId;
    let playerName;
    
    if (data.isAuthUser && data.linkedPlayer) {
      legacyId = data.linkedPlayer.toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
      playerName = data.linkedPlayer;
    } else {
      legacyId = docSnap.id;
      playerName = data.name || docSnap.id;
    }
    
    playerLegacyIds.add(legacyId);
    legacyToName.set(legacyId, playerName);
  });
  
  log(`Found ${playerLegacyIds.size} player IDs to check`, 'success');
  
  // Query each player's games for this season
  log('');
  log('Step 2: Scanning player game stats...', 'splits');
  
  const playerSplits = new Map();
  let totalGames = 0;
  let checkedCount = 0;
  
  for (const legacyId of playerLegacyIds) {
    try {
      const gamesRef = window.collection(window.db, 'playerStats', legacyId, 'games');
      const gamesSnap = await window.getDocs(gamesRef);
      
      const seasonGames = [];
      gamesSnap.forEach(gameDoc => {
        const data = gameDoc.data();
        if (data.seasonId === seasonId) {
          seasonGames.push({ gameId: gameDoc.id, ...data });
        }
      });
      
      if (seasonGames.length > 0) {
        const seasonSplits = calculateSeasonSplits(seasonGames);
        playerSplits.set(legacyId, {
          playerName: legacyToName.get(legacyId) || legacyId,
          games: seasonGames.length,
          seasonSplits: seasonSplits
        });
        totalGames += seasonGames.length;
        
        log(`  ${legacyToName.get(legacyId)}: ${seasonGames.length} games found`);
      }
      
    } catch (err) {
      // Player might not have game stats
    }
    
    checkedCount++;
    if (checkedCount % 50 === 0) {
      log(`  Checked ${checkedCount}/${playerLegacyIds.size} players...`);
    }
  }
  
  log(`Found ${playerSplits.size} players with game data`, 'success');
  
  return {
    playerCount: playerSplits.size,
    totalGames: totalGames,
    playerSplits: playerSplits
  };
}

function calculateSeasonSplits(games) {
  const splits = {
    games: games.length,
    atBats: 0, hits: 0, runs: 0, walks: 0,
    doubles: 0, triples: 0, homeRuns: 0, rbi: 0,
    vsOpponent: {},
    home: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
    away: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
    regular: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
    playoff: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 }
  };
  
  games.forEach(game => {
    splits.atBats += game.atBats || 0;
    splits.hits += game.hits || 0;
    splits.runs += game.runs || 0;
    splits.walks += game.walks || 0;
    splits.doubles += game.doubles || 0;
    splits.triples += game.triples || 0;
    splits.homeRuns += game.homeRuns || 0;
    splits.rbi += game.rbi || 0;
    
    // Opponent breakdown
    const opponent = game.opponent || 'Unknown';
    if (!splits.vsOpponent[opponent]) {
      splits.vsOpponent[opponent] = {
        games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
        doubles: 0, triples: 0, homeRuns: 0, rbi: 0
      };
    }
    const opp = splits.vsOpponent[opponent];
    opp.games++;
    opp.atBats += game.atBats || 0;
    opp.hits += game.hits || 0;
    opp.runs += game.runs || 0;
    opp.walks += game.walks || 0;
    opp.doubles += game.doubles || 0;
    opp.triples += game.triples || 0;
    opp.homeRuns += game.homeRuns || 0;
    opp.rbi += game.rbi || 0;
    
    // Home/Away
    const homeAway = game.isHome === true ? splits.home : splits.away;
    homeAway.games++;
    homeAway.atBats += game.atBats || 0;
    homeAway.hits += game.hits || 0;
    homeAway.runs += game.runs || 0;
    homeAway.walks += game.walks || 0;
    homeAway.doubles += game.doubles || 0;
    homeAway.triples += game.triples || 0;
    homeAway.homeRuns += game.homeRuns || 0;
    homeAway.rbi += game.rbi || 0;
    
    // Regular/Playoff
    const isPlayoff = game.isPlayoff === true || game.gameType === 'playoff';
    const gameType = isPlayoff ? splits.playoff : splits.regular;
    gameType.games++;
    gameType.atBats += game.atBats || 0;
    gameType.hits += game.hits || 0;
    gameType.runs += game.runs || 0;
    gameType.walks += game.walks || 0;
    gameType.doubles += game.doubles || 0;
    gameType.triples += game.triples || 0;
    gameType.homeRuns += game.homeRuns || 0;
    gameType.rbi += game.rbi || 0;
  });
  
  // Calculate averages
  splits.battingAverage = splits.atBats > 0 ? splits.hits / splits.atBats : 0;
  splits.onBasePercentage = (splits.atBats + splits.walks) > 0
    ? (splits.hits + splits.walks) / (splits.atBats + splits.walks) : 0;
  
  // Calculate per-split averages
  [splits.home, splits.away, splits.regular, splits.playoff].forEach(split => {
    split.battingAverage = split.atBats > 0 ? split.hits / split.atBats : 0;
    split.onBasePercentage = (split.atBats + split.walks) > 0
      ? (split.hits + split.walks) / (split.atBats + split.walks) : 0;
  });
  
  // Calculate per-opponent averages
  Object.values(splits.vsOpponent).forEach(opp => {
    opp.battingAverage = opp.atBats > 0 ? opp.hits / opp.atBats : 0;
    opp.onBasePercentage = (opp.atBats + opp.walks) > 0
      ? (opp.hits + opp.walks) / (opp.atBats + opp.walks) : 0;
  });
  
  // Restructure to match expected format
  return {
    games: splits.games,
    atBats: splits.atBats,
    hits: splits.hits,
    runs: splits.runs,
    walks: splits.walks,
    doubles: splits.doubles,
    triples: splits.triples,
    homeRuns: splits.homeRuns,
    rbi: splits.rbi,
    battingAverage: splits.battingAverage,
    onBasePercentage: splits.onBasePercentage,
    vsOpponent: splits.vsOpponent,
    splits: {
      home: splits.home,
      away: splits.away,
      regular: splits.regular,
      playoff: splits.playoff
    }
  };
}

function calculate2025CareerSplits(seasonsObject) {
  const career = {
    games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
    vsOpponent: {},
    splits: {
      home: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      away: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      regular: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      playoff: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 }
    }
  };
  
  Object.values(seasonsObject).forEach(season => {
    career.games += season.games || 0;
    career.atBats += season.atBats || 0;
    career.hits += season.hits || 0;
    career.runs += season.runs || 0;
    career.walks += season.walks || 0;
    
    // Aggregate vsOpponent
    if (season.vsOpponent) {
      Object.entries(season.vsOpponent).forEach(([opponent, oppStats]) => {
        if (!career.vsOpponent[opponent]) {
          career.vsOpponent[opponent] = {
            games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
            doubles: 0, triples: 0, homeRuns: 0, rbi: 0
          };
        }
        const careerOpp = career.vsOpponent[opponent];
        careerOpp.games += oppStats.games || 0;
        careerOpp.atBats += oppStats.atBats || 0;
        careerOpp.hits += oppStats.hits || 0;
        careerOpp.runs += oppStats.runs || 0;
        careerOpp.walks += oppStats.walks || 0;
      });
    }
    
    // Aggregate splits
    if (season.splits) {
      ['home', 'away', 'regular', 'playoff'].forEach(splitKey => {
        const seasonSplit = season.splits[splitKey];
        const careerSplit = career.splits[splitKey];
        if (seasonSplit) {
          careerSplit.games += seasonSplit.games || 0;
          careerSplit.atBats += seasonSplit.atBats || 0;
          careerSplit.hits += seasonSplit.hits || 0;
          careerSplit.runs += seasonSplit.runs || 0;
          careerSplit.walks += seasonSplit.walks || 0;
        }
      });
    }
  });
  
  // Calculate averages
  career.battingAverage = career.atBats > 0 ? career.hits / career.atBats : 0;
  career.onBasePercentage = (career.atBats + career.walks) > 0
    ? (career.hits + career.walks) / (career.atBats + career.walks) : 0;
  
  // Calculate per-split averages
  Object.values(career.splits).forEach(split => {
    split.battingAverage = split.atBats > 0 ? split.hits / split.atBats : 0;
    split.onBasePercentage = (split.atBats + split.walks) > 0
      ? (split.hits + split.walks) / (split.atBats + split.walks) : 0;
  });
  
  // Calculate per-opponent averages
  Object.values(career.vsOpponent).forEach(opp => {
    opp.battingAverage = opp.atBats > 0 ? opp.hits / opp.atBats : 0;
    opp.onBasePercentage = (opp.atBats + opp.walks) > 0
      ? (opp.hits + opp.walks) / (opp.atBats + opp.walks) : 0;
  });
  
  return career;
}

// ============================================
// PREVIEW FUNCTION (2026+ - READ-ONLY)
// ============================================

window.previewGameBasedSeason = async function() {
  const seasonId = document.getElementById('seasonSelect').value;
  if (!seasonId) {
    showToast('Please select a season first', 'error');
    return;
  }

  const btn = document.getElementById('previewSeasonBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`PREVIEW: Game-Level Stats for ${seasonId}`, 'header');
  log(' NO CHANGES WILL BE MADE TO DATABASE', 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  try {
    // STEP 1: Get all player legacy IDs from aggregatedPlayerStats
    log('Step 1: Getting player IDs from aggregatedPlayerStats...', 'game');
    
    const aggregatedRef = window.collection(window.db, 'aggregatedPlayerStats');
    const aggregatedSnap = await window.getDocs(aggregatedRef);
    
    const playerLegacyIds = new Set();
    
    aggregatedSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.migrated) return; // Skip migrated profiles
      
      // Determine the legacyId to query for game stats
      let legacyId;
      if (data.isAuthUser && data.linkedPlayer) {
        // Auth user - derive legacyId from linkedPlayer name
        legacyId = data.linkedPlayer.toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
      } else {
        // Legacy user - doc ID is the legacyId
        legacyId = docSnap.id;
      }
      playerLegacyIds.add(legacyId);
    });
    
    const playerIds = Array.from(playerLegacyIds);
    log(`Found ${playerIds.length} player IDs to check`, 'success');

    // Query each player's games for this season
    log('');
    log('Scanning player game stats...', 'game');
    
    const playersWithGames = [];
    let totalGamesFound = 0;
    let checkedCount = 0;
    const teamStats = {}; // teamId -> { players: Set, gameEntries: 0, uniqueGames: Set }

    for (const legacyId of playerIds) {
      try {
        const gamesRef = window.collection(window.db, 'playerStats', legacyId, 'games');
        const gamesSnap = await window.getDocs(gamesRef);

        let seasonGames = 0;
        gamesSnap.forEach(gameDoc => {
          const data = gameDoc.data();
          if (data.seasonId === seasonId) {
            seasonGames++;

            // Build per-team summary
            const team = (data.teamId || 'unknown').toLowerCase();
            if (!teamStats[team]) {
              teamStats[team] = { players: new Set(), gameEntries: 0, uniqueGames: new Set() };
            }
            teamStats[team].players.add(legacyId);
            teamStats[team].gameEntries++;
            if (data.gameId) teamStats[team].uniqueGames.add(data.gameId);
          }
        });

        if (seasonGames > 0) {
          playersWithGames.push({ legacyId, games: seasonGames });
          totalGamesFound += seasonGames;
        }
      } catch (err) {
        // Player might not have game stats
      }

      checkedCount++;
      if (checkedCount % 50 === 0) {
        log(`  Checked ${checkedCount}/${playerIds.length} players...`);
      }
    }

    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('PREVIEW RESULTS', 'header');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log(`Players with games: ${playersWithGames.length}`, 'success');
    log(`Total games found: ${totalGamesFound}`, 'success');
    log('');

    // Show top players
    playersWithGames.sort((a, b) => b.games - a.games);
    log('Top players by games:');
    playersWithGames.slice(0, 10).forEach(p => {
      log(`  ${p.legacyId}: ${p.games} games`);
    });

    if (playersWithGames.length > 10) {
      log(`  ... and ${playersWithGames.length - 10} more players`);
    }

    updateSeasonStats(playersWithGames.length, totalGamesFound, 0, 0);

    // Fetch season games to compute games played and submission status per team.
    // A game counts as submitted if EITHER the statsSubmittedHome/Away flag is set
    // OR the gameId appears in playerStats (covers early games before the flag existed
    // and acts as a fallback for any failed flag writes).
    const teamGamesPlayed = {}; // team (lowercase) -> { played: 0, submittedIds: Set }
    try {
      const seasonGamesRef = window.collection(window.db, 'seasons', seasonId, 'games');
      const seasonGamesSnap = await window.getDocs(seasonGamesRef);
      const now = Date.now();

      seasonGamesSnap.forEach(gameDoc => {
        const g = gameDoc.data();
        const gameId = gameDoc.id;

        // Parse game date
        let gameMs = null;
        if (g.date?.seconds) {
          gameMs = g.date.seconds * 1000;
        } else if (g.date && typeof g.date === 'string') {
          const d = new Date(g.date);
          if (!isNaN(d.getTime())) gameMs = d.getTime();
        }
        if (!gameMs || gameMs > now) return; // skip future/undated games

        const homeTeam = (g.homeTeamName || g['home team'] || g.homeTeam || '').toLowerCase();
        const awayTeam = (g.awayTeamName || g['away team'] || g.awayTeam || '').toLowerCase();

        if (homeTeam) {
          if (!teamGamesPlayed[homeTeam]) teamGamesPlayed[homeTeam] = { played: 0, submittedIds: new Set() };
          teamGamesPlayed[homeTeam].played++;
          // Flag-based OR playerStats-based (uniqueGames)
          const flagSet = !!g.statsSubmittedHome;
          const inPlayerStats = teamStats[homeTeam]?.uniqueGames?.has(gameId) || false;
          if (flagSet || inPlayerStats) teamGamesPlayed[homeTeam].submittedIds.add(gameId);
        }
        if (awayTeam) {
          if (!teamGamesPlayed[awayTeam]) teamGamesPlayed[awayTeam] = { played: 0, submittedIds: new Set() };
          teamGamesPlayed[awayTeam].played++;
          const flagSet = !!g.statsSubmittedAway;
          const inPlayerStats = teamStats[awayTeam]?.uniqueGames?.has(gameId) || false;
          if (flagSet || inPlayerStats) teamGamesPlayed[awayTeam].submittedIds.add(gameId);
        }
      });
    } catch (err) {
      log(`Could not load season games for completion check: ${err.message}`, 'warning');
    }

    // Render per-team summary table
    const tbody = document.getElementById('teamSummaryBody');
    tbody.innerHTML = '';

    // Merge teamStats and teamGamesPlayed \u2014 include teams from either source
    const allTeams = new Set([
      ...Object.keys(teamStats),
      ...Object.keys(teamGamesPlayed)
    ]);
    const sortedTeams = Array.from(allTeams).sort();

    sortedTeams.forEach(team => {
      const data = teamStats[team] || { players: new Set(), gameEntries: 0, uniqueGames: new Set() };
      const played = teamGamesPlayed[team]?.played ?? '\u2014';
      const submitted = teamGamesPlayed[team]
        ? teamGamesPlayed[team].submittedIds.size
        : data.uniqueGames.size;
      const missing = (typeof played === 'number' && typeof submitted === 'number')
        ? played - submitted
        : '\u2014';
      const missingColor = missing > 0 ? '#dc2626' : missing === 0 ? '#16a34a' : '#64748b';
      const missingText = missing > 0 ? `${missing}` : missing === 0 ? '0' : '\u2014';

      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #e2e8f0';
      row.innerHTML = `
        <td style="padding: 8px 12px; font-weight: 600; text-transform: capitalize;">${team}</td>
        <td style="padding: 8px 12px; text-align: center;">${data.players.size || '\u2014'}</td>
        <td style="padding: 8px 12px; text-align: center;">${played}</td>
        <td style="padding: 8px 12px; text-align: center;">${submitted}</td>
        <td style="padding: 8px 12px; text-align: center; color: ${missingColor}; font-weight: 600;">${missingText}</td>
      `;
      tbody.appendChild(row);
    });
    document.getElementById('teamSummaryDisplay').style.display = sortedTeams.length > 0 ? 'block' : 'none';
    
    log('');
    log('No changes were made. Click "Aggregate Season" to process and save.', 'game');
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error('Preview error:', error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Preview';
  }
};

// ============================================
// AGGREGATION FUNCTION (2026+)
// ============================================

window.aggregateGameBasedSeason = async function() {
  const seasonId = document.getElementById('seasonSelect').value;
  if (!seasonId) {
    showToast('Please select a season first', 'error');
    return;
  }

  const testModeNote = testModeEnabled 
    ? `\n\nTEST MODE: Data will be written to "${getAggregatedCollection()}" (production is safe)`
    : '';

  const confirmed = await confirmModal(
    `This will aggregate all game stats for ${seasonId} and update career totals.\n\n` +
    `Tip: Use "Preview" first to see what will change.${testModeNote}\n\n` +
    `Continue with aggregation?`
  );
  if (!confirmed) return;

  const btn = document.getElementById('aggregateSeasonBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`Aggregating Game-Level Stats for ${seasonId}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  if (testModeEnabled) {
    log(`TEST MODE: Writing to ${getAggregatedCollection()}`, 'header');
  }

  try {
    // STEP 1: Get all player IDs and build legacyId \u2192 documentId mapping
    log('Step 1: Getting player IDs and building ID mapping...', 'game');
    
    const aggregatedRef = window.collection(window.db, 'aggregatedPlayerStats');
    const aggregatedSnap = await window.getDocs(aggregatedRef);
    
    const playerLegacyIds = new Set();
    const legacyToDocId = new Map();  // Maps legacyId -> actual document ID
    const docIdToPlayerInfo = new Map(); // Maps docId -> player info for non-sub detection
    
    aggregatedSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.migrated) return; // Skip migrated profiles
      
      const docId = docSnap.id;
      let legacyId;
      
      if (data.isAuthUser && data.linkedPlayer) {
        // Auth user - derive legacyId from linkedPlayer name
        legacyId = data.linkedPlayer.toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
        log(`  Auth user: ${data.linkedPlayer} (${legacyId}) \u2192 docId: ${docId}`);
      } else {
        // Legacy user - doc ID is the legacyId
        legacyId = docId;
      }
      
      playerLegacyIds.add(legacyId);
      legacyToDocId.set(legacyId, docId);
      docIdToPlayerInfo.set(docId, {
        name: data.name || data.linkedPlayer || legacyId,
        isAuthUser: data.isAuthUser || false,
        existingData: data
      });
    });
    
    const playerIds = Array.from(playerLegacyIds);
    log(`Found ${playerIds.length} unique player IDs to check`, 'success');
    log(`Built mapping for ${legacyToDocId.size} players`, 'success');

    // Query each player's games for this season
    log('');
    log('Scanning player game stats...', 'game');
    
    const playerBattingGames = new Map();
    const playerPitchingGames = new Map();
    let checkedCount = 0;
    
    for (const legacyId of playerIds) {
      // Check batting stats
      try {
        const gamesRef = window.collection(window.db, 'playerStats', legacyId, 'games');
        const gamesSnap = await window.getDocs(gamesRef);
        
        gamesSnap.forEach(gameDoc => {
          const data = gameDoc.data();
          // Only include games for this season
          if (data.seasonId === seasonId) {
            if (!playerBattingGames.has(legacyId)) {
              playerBattingGames.set(legacyId, []);
            }
            playerBattingGames.get(legacyId).push({
              gameId: gameDoc.id,
              ...data
            });
          }
        });
      } catch (err) {
        // Player might not have any game stats yet
      }
      
      // Check pitching stats
      try {
        const pitchingRef = window.collection(window.db, 'pitchingStats', legacyId, 'games');
        const pitchingSnap = await window.getDocs(pitchingRef);
        
        pitchingSnap.forEach(gameDoc => {
          const data = gameDoc.data();
          // Only include games for this season
          if (data.seasonId === seasonId) {
            if (!playerPitchingGames.has(legacyId)) {
              playerPitchingGames.set(legacyId, []);
            }
            playerPitchingGames.get(legacyId).push({
              gameId: gameDoc.id,
              ...data
            });
          }
        });
      } catch (err) {
        // Player might not have pitching stats
      }
      
      checkedCount++;
      if (checkedCount % 50 === 0) {
        log(`  Checked ${checkedCount}/${playerIds.length} players...`);
      }
    }

    // Split substitute games (isSub: true) out so they never touch a player's regular season line.
    // They are written separately as "{seasonId}-{team}-sub" season entries (Step 4b).
    const playerSubGames = new Map();
    for (const [subLegacyId, allGames] of Array.from(playerBattingGames)) {
      const subGames = allGames.filter(g => g.isSub === true);
      if (subGames.length === 0) continue;
      playerSubGames.set(subLegacyId, subGames);
      const regularGames = allGames.filter(g => g.isSub !== true);
      if (regularGames.length > 0) {
        playerBattingGames.set(subLegacyId, regularGames);
      } else {
        playerBattingGames.delete(subLegacyId);
      }
    }
    if (playerSubGames.size > 0) {
      log(`Found ${playerSubGames.size} player(s) with substitute games (kept out of regular season totals)`, 'success');
    }

    log(`Found ${playerBattingGames.size} players with batting games`, 'success');
    log(`Found ${playerPitchingGames.size} players with pitching games`, 'success');

    // STEP 2: Calculate season totals for all players (first pass - no acesBPI yet)
    log('');
    log('Step 2: Calculating season totals...', 'game');

    let battingUpdatedCount = 0;
    let pitchingUpdatedCount = 0;
    let totalGamesProcessed = 0;
    let errorCount = 0;
    
    // Store all season totals for acesBPI calculation
    const allSeasonTotals = new Map(); // legacyId -> seasonTotals

    for (const [legacyId, games] of playerBattingGames) {
      const seasonTotals = {
        games: games.length,
        atBats: 0,
        hits: 0,
        runs: 0,
        walks: 0,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        rbi: 0,
        strikeouts: 0,
        stolenBases: 0,
        team: null,
        playerName: null,
        vsOpponent: {},  // Per-opponent breakdown
        splits: {        // Home/Away and Playoff/Regular splits
          home: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
          away: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
          regular: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
          playoff: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 }
        }
      };

      games.forEach(game => {
        seasonTotals.atBats += game.atBats || 0;
        seasonTotals.hits += game.hits || 0;
        seasonTotals.runs += game.runs || 0;
        seasonTotals.walks += game.walks || 0;
        seasonTotals.doubles += game.doubles || 0;
        seasonTotals.triples += game.triples || 0;
        seasonTotals.homeRuns += game.homeRuns || 0;
        seasonTotals.rbi += game.rbi || 0;
        seasonTotals.strikeouts += game.strikeouts || 0;
        seasonTotals.stolenBases += game.stolenBases || 0;
        if (!seasonTotals.team) seasonTotals.team = game.teamId || '';
        if (!seasonTotals.playerName) seasonTotals.playerName = game.playerName || '';
        
        // Track per-opponent stats
        const opponent = game.opponent || 'Unknown';
        if (!seasonTotals.vsOpponent[opponent]) {
          seasonTotals.vsOpponent[opponent] = {
            games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
            doubles: 0, triples: 0, homeRuns: 0, rbi: 0
          };
        }
        const opp = seasonTotals.vsOpponent[opponent];
        opp.games++;
        opp.atBats += game.atBats || 0;
        opp.hits += game.hits || 0;
        opp.runs += game.runs || 0;
        opp.walks += game.walks || 0;
        opp.doubles += game.doubles || 0;
        opp.triples += game.triples || 0;
        opp.homeRuns += game.homeRuns || 0;
        opp.rbi += game.rbi || 0;
        
        // Track Home/Away splits
        const homeAwaySplit = game.isHome === true ? seasonTotals.splits.home : seasonTotals.splits.away;
        homeAwaySplit.games++;
        homeAwaySplit.atBats += game.atBats || 0;
        homeAwaySplit.hits += game.hits || 0;
        homeAwaySplit.runs += game.runs || 0;
        homeAwaySplit.walks += game.walks || 0;
        homeAwaySplit.doubles += game.doubles || 0;
        homeAwaySplit.triples += game.triples || 0;
        homeAwaySplit.homeRuns += game.homeRuns || 0;
        homeAwaySplit.rbi += game.rbi || 0;
        
        // Track Playoff/Regular splits
        const isPlayoffGame = game.isPlayoff === true || game.gameType === 'playoff';
        const gameTypeSplit = isPlayoffGame ? seasonTotals.splits.playoff : seasonTotals.splits.regular;
        gameTypeSplit.games++;
        gameTypeSplit.atBats += game.atBats || 0;
        gameTypeSplit.hits += game.hits || 0;
        gameTypeSplit.runs += game.runs || 0;
        gameTypeSplit.walks += game.walks || 0;
        gameTypeSplit.doubles += game.doubles || 0;
        gameTypeSplit.triples += game.triples || 0;
        gameTypeSplit.homeRuns += game.homeRuns || 0;
        gameTypeSplit.rbi += game.rbi || 0;
      });

      // Calculate basic stats for season totals
      seasonTotals.battingAverage = seasonTotals.atBats > 0 ? seasonTotals.hits / seasonTotals.atBats : 0;
      seasonTotals.onBasePercentage = (seasonTotals.atBats + seasonTotals.walks) > 0
        ? (seasonTotals.hits + seasonTotals.walks) / (seasonTotals.atBats + seasonTotals.walks) : 0;
      seasonTotals.runsPerPA = (seasonTotals.atBats + seasonTotals.walks) > 0
        ? seasonTotals.runs / (seasonTotals.atBats + seasonTotals.walks) : 0;
      
      // Calculate per-opponent averages
      Object.values(seasonTotals.vsOpponent).forEach(opp => {
        opp.battingAverage = opp.atBats > 0 ? opp.hits / opp.atBats : 0;
        opp.onBasePercentage = (opp.atBats + opp.walks) > 0
          ? (opp.hits + opp.walks) / (opp.atBats + opp.walks) : 0;
      });
      
      // Calculate splits averages (home/away, playoff/regular)
      Object.values(seasonTotals.splits).forEach(split => {
        split.battingAverage = split.atBats > 0 ? split.hits / split.atBats : 0;
        split.onBasePercentage = (split.atBats + split.walks) > 0
          ? (split.hits + split.walks) / (split.atBats + split.walks) : 0;
      });

      allSeasonTotals.set(legacyId, seasonTotals);
      totalGamesProcessed += games.length;
    }
    
    // Store games for career high / hit streak detection later
    const playerGamesMap = playerBattingGames;

    // STEP 3: Calculate league averages for acesBPI
    log('');
    log('Step 3: Calculating league averages for acesBPI...', 'game');
    
    // Determine max games played (for reference/logging only)
    let maxGames = 0;
    allSeasonTotals.forEach(stats => {
      if (stats.games > maxGames) maxGames = stats.games;
    });
    
    log(`  Max games in season: ${maxGames}`);
    
    // Collect stats from all players for mean/stddev calculation
    // Note: sub flag check kept for backward compatibility with old seasons
    const nonSubStats = {
      battingAverage: [],
      onBasePercentage: [],
      runsPerPA: [],
      games: []
    };
    
    allSeasonTotals.forEach((stats, legacyId) => {
      // Only exclude if explicitly marked as sub (for old data or future use)
      const isSub = (stats.sub || '').toLowerCase() === 'yes';
      
      if (!isSub && stats.atBats > 0) {
        nonSubStats.battingAverage.push(stats.battingAverage);
        nonSubStats.onBasePercentage.push(stats.onBasePercentage);
        nonSubStats.runsPerPA.push(stats.runsPerPA);
        nonSubStats.games.push(stats.games);
      }
    });
    
    log(`  Players for league averages: ${nonSubStats.battingAverage.length}`);
    
    // Calculate mean and standard deviation for each stat
    function calcMean(arr) {
      if (arr.length === 0) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    
    function calcStdDev(arr, mean) {
      if (arr.length < 2) return 1; // Avoid division by zero
      const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
      return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / arr.length) || 1;
    }
    
    const leagueStats = {
      battingAverage: { mean: calcMean(nonSubStats.battingAverage), stdDev: 0 },
      onBasePercentage: { mean: calcMean(nonSubStats.onBasePercentage), stdDev: 0 },
      runsPerPA: { mean: calcMean(nonSubStats.runsPerPA), stdDev: 0 },
      games: { mean: calcMean(nonSubStats.games), stdDev: 0 }
    };
    
    leagueStats.battingAverage.stdDev = calcStdDev(nonSubStats.battingAverage, leagueStats.battingAverage.mean);
    leagueStats.onBasePercentage.stdDev = calcStdDev(nonSubStats.onBasePercentage, leagueStats.onBasePercentage.mean);
    leagueStats.runsPerPA.stdDev = calcStdDev(nonSubStats.runsPerPA, leagueStats.runsPerPA.mean);
    leagueStats.games.stdDev = calcStdDev(nonSubStats.games, leagueStats.games.mean);
    
    log(`  League BA: ${leagueStats.battingAverage.mean.toFixed(3)} (\u03c3=${leagueStats.battingAverage.stdDev.toFixed(3)})`);
    log(`  League OBP: ${leagueStats.onBasePercentage.mean.toFixed(3)} (\u03c3=${leagueStats.onBasePercentage.stdDev.toFixed(3)})`);
    log(`  League R/PA: ${leagueStats.runsPerPA.mean.toFixed(3)} (\u03c3=${leagueStats.runsPerPA.stdDev.toFixed(3)})`);
    log(`  League Games: ${leagueStats.games.mean.toFixed(1)} (\u03c3=${leagueStats.games.stdDev.toFixed(1)})`);

    // STEP 4: Calculate acesBPI and save all player data
    log('');
    log('Step 4: Calculating acesBPI and saving...', 'game');
    
    // acesBPI weights: 50% BA, 10% OBP, 30% Runs/PA, 10% Games
    const weights = { battingAverage: 0.5, onBasePercentage: 0.1, runsPerPA: 0.3, games: 0.1 };
    
    function calcZScore(value, mean, stdDev) {
      if (stdDev === 0) return 0;
      return (value - mean) / stdDev;
    }

    for (const [legacyId, seasonTotals] of allSeasonTotals) {
      try {
        // Calculate z-scores
        const zScores = {
          battingAverage: calcZScore(seasonTotals.battingAverage, leagueStats.battingAverage.mean, leagueStats.battingAverage.stdDev),
          onBasePercentage: calcZScore(seasonTotals.onBasePercentage, leagueStats.onBasePercentage.mean, leagueStats.onBasePercentage.stdDev),
          runsPerPA: calcZScore(seasonTotals.runsPerPA, leagueStats.runsPerPA.mean, leagueStats.runsPerPA.stdDev),
          games: calcZScore(seasonTotals.games, leagueStats.games.mean, leagueStats.games.stdDev)
        };
        
        // Weighted average of z-scores
        const weightedZScore = 
          (zScores.battingAverage * weights.battingAverage) +
          (zScores.onBasePercentage * weights.onBasePercentage) +
          (zScores.runsPerPA * weights.runsPerPA) +
          (zScores.games * weights.games);
        
        // acesBPI = 50 + 10 * weighted z-score
        seasonTotals.acesBPI = 50 + (10 * weightedZScore);
        
        // Get the correct document ID (authUID for auth users, legacyId for legacy users)
        const docId = legacyToDocId.get(legacyId) || legacyId;
        const playerInfo = docIdToPlayerInfo.get(docId) || {};
        
        // Get existing data (from test or production collection)
        const aggregatedDocRef = window.doc(window.db, getAggregatedCollection(), docId);
        const existingDoc = await window.getDoc(aggregatedDocRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : {};
        const existingSeasons = { ...(existingData.seasons || {}) };

        existingSeasons[seasonId] = seasonTotals;

        const career = recalculateCareer(existingSeasons);

        await window.setDoc(aggregatedDocRef, {
          ...existingData,
          name: existingData.name || seasonTotals.playerName,
          seasons: existingSeasons,
          career: career,
          totalSeasons: Object.keys(existingSeasons).length,
          lastUpdated: new Date(),
          lastGameAggregation: seasonId
        }, { merge: true });

        battingUpdatedCount++;

        const avgDisplay = seasonTotals.atBats > 0 
          ? '.' + (seasonTotals.battingAverage * 1000).toFixed(0).padStart(3, '0') : '.000';
        const oppCount = Object.keys(seasonTotals.vsOpponent).length;
        const homeGames = seasonTotals.splits.home.games;
        const awayGames = seasonTotals.splits.away.games;
        const playoffGames = seasonTotals.splits.playoff.games;
        log(`  ${seasonTotals.playerName || legacyId}: ${seasonTotals.games} G (${homeGames}H/${awayGames}A, ${playoffGames} playoff), ${avgDisplay} BA, ${seasonTotals.acesBPI.toFixed(1)} BPI, vs ${oppCount} teams \u2192 ${docId}`, 'success');

        updateSeasonStats(playerBattingGames.size, totalGamesProcessed, battingUpdatedCount, pitchingUpdatedCount);

      } catch (error) {
        log(`  Error with ${legacyId}: ${error.message}`, 'error');
        errorCount++;
      }
    }

    // STEP 4b: Substitute seasons. Each team a player subbed for gets its own
    // "{seasonId}-{team}-sub" entry flagged sub: "yes" (same shape as legacy sub seasons).
    // recalculateCareer() already counts these toward career totals but not acesBPI.
    // Old sub entries for this season are rebuilt from game docs on every run, so removing a sub removes his entry.
    log('');
    log('Step 4b: Processing substitute games...', 'game');

    const subKeyFor = (team) => `${seasonId}-${String(team || 'unknown').toLowerCase().replace(/\s+/g, '_')}-sub`;
    const isSubKeyForSeason = (k) => k.startsWith(`${seasonId}-`) && k.endsWith('-sub');

    const newSubEntries = new Map(); // legacyId -> { seasonKey -> totals }
    for (const [subLegacyId, games] of playerSubGames) {
      const byKey = {};
      games.forEach(game => {
        const key = subKeyFor(game.teamId);
        if (!byKey[key]) {
          byKey[key] = {
            games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
            doubles: 0, triples: 0, homeRuns: 0, rbi: 0,
            strikeouts: 0, stolenBases: 0,
            team: game.teamId || '',
            playerName: game.playerName || '',
            homeTeam: game.homeTeam || null,
            sub: 'yes'
          };
        }
        const t = byKey[key];
        t.games++;
        t.atBats += game.atBats || 0;
        t.hits += game.hits || 0;
        t.runs += game.runs || 0;
        t.walks += game.walks || 0;
        t.doubles += game.doubles || 0;
        t.triples += game.triples || 0;
        t.homeRuns += game.homeRuns || 0;
        t.rbi += game.rbi || 0;
        t.strikeouts += game.strikeouts || 0;
        t.stolenBases += game.stolenBases || 0;
      });
      Object.values(byKey).forEach(t => {
        t.battingAverage = t.atBats > 0 ? t.hits / t.atBats : 0;
        t.onBasePercentage = (t.atBats + t.walks) > 0 ? (t.hits + t.walks) / (t.atBats + t.walks) : 0;
        t.runsPerPA = (t.atBats + t.walks) > 0 ? t.runs / (t.atBats + t.walks) : 0;
        t.acesBPI = 0; // subs do not receive acesBPI (shown as N/A on the player page)
      });
      newSubEntries.set(subLegacyId, byKey);
    }

    // Who needs a write: players with sub games now, plus anyone holding stale sub entries from an earlier run
    const subTargets = new Map(); // docId -> legacyId
    for (const subLegacyId of newSubEntries.keys()) {
      subTargets.set(legacyToDocId.get(subLegacyId) || subLegacyId, subLegacyId);
    }
    for (const [subLegacyId, subDocId] of legacyToDocId) {
      const seasonsSnapshot = docIdToPlayerInfo.get(subDocId)?.existingData?.seasons || {};
      if (Object.keys(seasonsSnapshot).some(isSubKeyForSeason)) {
        subTargets.set(subDocId, subLegacyId);
      }
    }

    let subUpdatedCount = 0;
    for (const [subDocId, subLegacyId] of subTargets) {
      try {
        const subRef = window.doc(window.db, getAggregatedCollection(), subDocId);
        const subSnap = await window.getDoc(subRef); // fresh read: includes the regular season just written above
        if (!subSnap.exists()) continue;

        const subData = subSnap.data();
        const mergedSeasons = { ...(subData.seasons || {}) };
        const entries = newSubEntries.get(subLegacyId) || {};

        const staleKeys = Object.keys(mergedSeasons).filter(k => isSubKeyForSeason(k) && !entries[k]);
        staleKeys.forEach(k => delete mergedSeasons[k]);
        Object.assign(mergedSeasons, entries);

        const seasonUpdates = { ...entries };
        staleKeys.forEach(k => { seasonUpdates[k] = window.deleteField(); });

        await window.setDoc(subRef, {
          seasons: seasonUpdates,
          career: recalculateCareer(mergedSeasons),
          totalSeasons: Object.keys(mergedSeasons).length,
          lastUpdated: new Date()
        }, { merge: true });

        subUpdatedCount++;
        Object.entries(entries).forEach(([key, t]) => {
          log(`  Substitute: ${t.playerName || subLegacyId} \u2192 ${key} (${t.games} G, ${t.hits}/${t.atBats})`, 'success');
        });
        staleKeys.forEach(k => log(`  Removed stale substitute entry ${k} for ${subLegacyId}`));
      } catch (error) {
        log(`  Substitute error with ${subLegacyId}: ${error.message}`, 'error');
        errorCount++;
      }
    }
    log(`Substitute seasons updated: ${subUpdatedCount}`, 'success');

    // Handle pitching stats (similar structure)
    log('');
    log('Step 5: Processing pitching stats...', 'pitching');
    
    for (const [legacyId, games] of playerPitchingGames) {
      try {
        const pitchingTotals = {
          games: games.length,
          inningsPitched: 0,
          runsAllowed: 0,
          earnedRuns: 0,
          strikeouts: 0,
          walks: 0,
          hits: 0,
          wins: 0,
          losses: 0,
          saves: 0,
          team: null
        };
        
        games.forEach(game => {
          pitchingTotals.inningsPitched += game.inningsPitched || 0;
          pitchingTotals.runsAllowed += game.runsAllowed || 0;
          pitchingTotals.earnedRuns += game.earnedRuns || 0;
          pitchingTotals.strikeouts += game.strikeouts || 0;
          pitchingTotals.walks += game.walks || 0;
          pitchingTotals.hits += game.hits || 0;
          pitchingTotals.wins += game.wins || 0;
          pitchingTotals.losses += game.losses || 0;
          pitchingTotals.saves += game.saves || 0;
          if (!pitchingTotals.team) pitchingTotals.team = game.teamId || '';
        });
        
        pitchingTotals.earnedRunAverage = pitchingTotals.inningsPitched > 0
          ? (pitchingTotals.runsAllowed * 7) / pitchingTotals.inningsPitched : 0;
        
        const docId = legacyToDocId.get(legacyId) || legacyId;
        const aggregatedDocRef = window.doc(window.db, getAggregatedCollection(), docId);
        const existingDoc = await window.getDoc(aggregatedDocRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : {};
        const existingPitchingSeasons = { ...(existingData.pitchingSeasons || {}) };
        
        existingPitchingSeasons[seasonId] = pitchingTotals;
        
        const pitchingCareer = recalculatePitchingCareer(existingPitchingSeasons);
        
        await window.setDoc(aggregatedDocRef, {
          pitchingSeasons: existingPitchingSeasons,
          pitchingCareer: pitchingCareer,
          lastUpdated: new Date()
        }, { merge: true });
        
        pitchingUpdatedCount++;
        log(`  ${legacyId}: ${pitchingTotals.games} G, ${pitchingTotals.inningsPitched.toFixed(1)} IP, ${pitchingTotals.earnedRunAverage.toFixed(2)} ERA`, 'pitching');
        
      } catch (error) {
        log(`  Pitching error ${legacyId}: ${error.message}`, 'error');
      }
    }

    // STEP 6: Detect career highs and hit streaks
    log('');
    log('Step 6: Detecting career highs and hit streaks...', 'game');
    
    let careerHighsCreated = 0;
    let hitStreaksCreated = 0;
    
    for (const [legacyId, games] of playerGamesMap) {
      try {
        const docId = legacyToDocId.get(legacyId) || legacyId;
        const playerInfo = docIdToPlayerInfo.get(docId) || {};
        const seasonTotals = allSeasonTotals.get(legacyId);
        const playerName = seasonTotals?.playerName || playerInfo.name || legacyId;
        const teamId = seasonTotals?.team || '';
        
        // Sort games by date for streak detection
        const sortedGames = [...games].sort((a, b) => {
          const dateA = a.gameDate?.toDate?.() || new Date(a.gameDate) || new Date(0);
          const dateB = b.gameDate?.toDate?.() || new Date(b.gameDate) || new Date(0);
          return dateA - dateB;
        });
        
        // =====================
        // CAREER HIGHS DETECTION
        // =====================
        // Find max hits and runs in THIS season's games
        let maxHitsGame = null;
        let maxRunsGame = null;
        let maxHits = 0;
        let maxRuns = 0;
        
        sortedGames.forEach(game => {
          if ((game.hits || 0) > maxHits) {
            maxHits = game.hits;
            maxHitsGame = game;
          }
          if ((game.runs || 0) > maxRuns) {
            maxRuns = game.runs;
            maxRunsGame = game;
          }
        });
        
        // Get existing career highs from ALL games (including past seasons)
        let existingMaxHits = 0;
        let existingMaxRuns = 0;
        
        try {
          const allGamesRef = window.collection(window.db, 'playerStats', legacyId, 'games');
          const allGamesSnap = await window.getDocs(allGamesRef);
          
          allGamesSnap.forEach(gameDoc => {
            const gameData = gameDoc.data();
            // Only count games from PREVIOUS seasons (not current)
            if (gameData.seasonId !== seasonId) {
              existingMaxHits = Math.max(existingMaxHits, gameData.hits || 0);
              existingMaxRuns = Math.max(existingMaxRuns, gameData.runs || 0);
            }
          });
        } catch (err) {
          // No previous games, that's fine
        }
        
        // Create career high documents if new highs are set (minimum 3 to be notable)
        if (maxHits >= 3 && maxHits > existingMaxHits && maxHitsGame) {
          const careerHighDocId = `${docId}_hits_${maxHitsGame.gameId || seasonId}`;
          
          // Check if this career high already exists
          const existingCareerHigh = await window.getDoc(
            window.doc(window.db, 'careerHighs', careerHighDocId)
          );
          
          if (!existingCareerHigh.exists()) {
            await window.setDoc(
              window.doc(window.db, 'careerHighs', careerHighDocId),
              {
                playerId: docId,
                playerLegacyId: legacyId,
                playerName: playerName,
                teamId: teamId?.toLowerCase() || null,
                teamName: teamId || null,
                seasonId: seasonId,
                stat: 'hits',
                value: maxHits,
                previousHigh: existingMaxHits,
                gameId: maxHitsGame.gameId || null,
                opponent: maxHitsGame.opponent || null,
                gameDate: maxHitsGame.gameDate || null,
                achievedAt: new Date()
              }
            );
            careerHighsCreated++;
            log(`  Career high: ${playerName} - ${maxHits} hits (prev: ${existingMaxHits})`, 'success');
          }
        }
        
        if (maxRuns >= 3 && maxRuns > existingMaxRuns && maxRunsGame) {
          const careerHighDocId = `${docId}_runs_${maxRunsGame.gameId || seasonId}`;
          
          // Check if this career high already exists
          const existingCareerHigh = await window.getDoc(
            window.doc(window.db, 'careerHighs', careerHighDocId)
          );
          
          if (!existingCareerHigh.exists()) {
            await window.setDoc(
              window.doc(window.db, 'careerHighs', careerHighDocId),
              {
                playerId: docId,
                playerLegacyId: legacyId,
                playerName: playerName,
                teamId: teamId?.toLowerCase() || null,
                teamName: teamId || null,
                seasonId: seasonId,
                stat: 'runs',
                value: maxRuns,
                previousHigh: existingMaxRuns,
                gameId: maxRunsGame.gameId || null,
                opponent: maxRunsGame.opponent || null,
                gameDate: maxRunsGame.gameDate || null,
                achievedAt: new Date()
              }
            );
            careerHighsCreated++;
            log(`  Career high: ${playerName} - ${maxRuns} runs (prev: ${existingMaxRuns})`, 'success');
          }
        }
        
        // =====================
        // HIT STREAK DETECTION
        // =====================
        // Calculate current hitting streak from sorted games
        let currentStreak = 0;
        let maxStreak = 0;
        let streakStartDate = null;
        let streakEndDate = null;
        let maxStreakStart = null;
        let maxStreakEnd = null;
        
        sortedGames.forEach((game, idx) => {
          if ((game.hits || 0) >= 1) {
            if (currentStreak === 0) {
              streakStartDate = game.gameDate;
            }
            currentStreak++;
            streakEndDate = game.gameDate;
            
            if (currentStreak > maxStreak) {
              maxStreak = currentStreak;
              maxStreakStart = streakStartDate;
              maxStreakEnd = streakEndDate;
            }
          } else {
            currentStreak = 0;
            streakStartDate = null;
          }
        });
        
        // Create hit streak document for notable streaks (5+)
        if (maxStreak >= 5) {
          const hitStreakDocId = `${docId}_${seasonId}_${maxStreak}`;
          
          // Check if this exact streak already exists
          const existingStreak = await window.getDoc(
            window.doc(window.db, 'hitStreaks', hitStreakDocId)
          );
          
          if (!existingStreak.exists()) {
            await window.setDoc(
              window.doc(window.db, 'hitStreaks', hitStreakDocId),
              {
                playerId: docId,
                playerLegacyId: legacyId,
                playerName: playerName,
                teamId: teamId?.toLowerCase() || null,
                teamName: teamId || null,
                seasonId: seasonId,
                streakLength: maxStreak,
                startDate: maxStreakStart || null,
                endDate: maxStreakEnd || null,
                achievedAt: new Date()
              }
            );
            hitStreaksCreated++;
            log(`  Hit streak: ${playerName} - ${maxStreak} games`, 'success');
          }
        }
        
      } catch (error) {
        log(`  Error detecting achievements for ${legacyId}: ${error.message}`, 'error');
      }
    }
    
    log(`  Career highs created: ${careerHighsCreated}`, careerHighsCreated > 0 ? 'success' : 'skip');
    log(`  Hit streaks created: ${hitStreaksCreated}`, hitStreaksCreated > 0 ? 'success' : 'skip');

    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('AGGREGATION COMPLETE', 'header');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log(`Batting stats updated: ${battingUpdatedCount}`, 'success');
    log(`Pitching stats updated: ${pitchingUpdatedCount}`, 'success');
    log(`Total games processed: ${totalGamesProcessed}`, 'success');
    log(`Career highs detected: ${careerHighsCreated}`, careerHighsCreated > 0 ? 'success' : 'skip');
    log(`Hit streaks detected: ${hitStreaksCreated}`, hitStreaksCreated > 0 ? 'success' : 'skip');
    if (errorCount > 0) log(`Errors: ${errorCount}`, 'error');
    
    updateSeasonStats(playerBattingGames.size, totalGamesProcessed, battingUpdatedCount, pitchingUpdatedCount);

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error('Aggregation error:', error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Aggregate Season';
  }
};

// ============================================
// MERGE PLAYER RECORDS
// ============================================

window.runMergePlayer = async function(previewOnly = true) {
  const sourceId = document.getElementById('mergeSourceId').value.trim();
  const targetId = document.getElementById('mergeTargetId').value.trim();
  if (!sourceId || !targetId) { showToast('Enter both source and target player IDs', 'error'); return; }
  if (sourceId === targetId) { showToast('Source and target cannot be the same', 'error'); return; }

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`Merge Player Records \u2014 ${previewOnly ? 'PREVIEW' : 'EXECUTE'}`, 'header');
  log(`  Source (retire): ${sourceId}`, 'header');
  log(`  Target (keep):   ${targetId}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  const statsDiv = document.getElementById('mergeStatsDisplay');
  statsDiv.style.display = 'grid';

  try {
    // \u2500\u2500 Games \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('');
    log('Step 1: Scanning source games...', 'game');
    const sourceGamesRef = window.collection(window.db, 'playerStats', sourceId, 'games');
    const sourceGamesSnap = await window.getDocs(sourceGamesRef);
    log(`  Found ${sourceGamesSnap.size} game documents under playerStats/${sourceId}/games`);

    const targetGamesRef = window.collection(window.db, 'playerStats', targetId, 'games');
    const targetGamesSnap = await window.getDocs(targetGamesRef);
    const targetGameIds = new Set(targetGamesSnap.docs.map(d => d.id));
    log(`  Target already has ${targetGamesSnap.size} game documents`);

    let gamesCopied = 0;
    let gamesSkipped = 0;
    for (const gameDoc of sourceGamesSnap.docs) {
      if (targetGameIds.has(gameDoc.id)) {
        log(`   Game ${gameDoc.id} already exists in target \u2014 skipping (target wins)`, 'warning');
        gamesSkipped++;
      } else {
        if (!previewOnly) {
          await window.setDoc(
            window.doc(window.db, 'playerStats', targetId, 'games', gameDoc.id),
            gameDoc.data()
          );
        } else {
          log(`  \u2192 Would copy game ${gameDoc.id}`);
        }
        gamesCopied++;
      }
    }
    log(`  Games to copy: ${gamesCopied} | Already in target (skipped): ${gamesSkipped}`, 'success');
    document.getElementById('mergeGamesCopied').textContent = gamesCopied;

    // \u2500\u2500 Seasons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('');
    log('Step 2: Scanning source seasons...', 'game');
    const sourceSeasonsRef = window.collection(window.db, 'playerStats', sourceId, 'seasons');
    const sourceSeasonsSnap = await window.getDocs(sourceSeasonsRef);
    log(`  Found ${sourceSeasonsSnap.size} season documents under playerStats/${sourceId}/seasons`);

    const targetSeasonsRef = window.collection(window.db, 'playerStats', targetId, 'seasons');
    const targetSeasonsSnap = await window.getDocs(targetSeasonsRef);
    const targetSeasonIds = new Set(targetSeasonsSnap.docs.map(d => d.id));
    log(`  Target already has ${targetSeasonsSnap.size} season documents`);

    let seasonsCopied = 0;
    let seasonsSkipped = 0;
    for (const seasonDoc of sourceSeasonsSnap.docs) {
      if (targetSeasonIds.has(seasonDoc.id)) {
        log(`   Season ${seasonDoc.id} already exists in target \u2014 skipping (target wins)`, 'warning');
        seasonsSkipped++;
      } else {
        if (!previewOnly) {
          await window.setDoc(
            window.doc(window.db, 'playerStats', targetId, 'seasons', seasonDoc.id),
            seasonDoc.data()
          );
        } else {
          log(`  \u2192 Would copy season ${seasonDoc.id}`);
        }
        seasonsCopied++;
      }
    }
    log(`  Seasons to copy: ${seasonsCopied} | Already in target (skipped): ${seasonsSkipped}`, 'success');
    document.getElementById('mergeSeasonsCopied').textContent = seasonsCopied;

    // \u2500\u2500 Mark aggregatedPlayerStats source as migrated \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('');
    log('Step 3: aggregatedPlayerStats source doc...', 'game');
    const aggSourceRef = window.doc(window.db, 'aggregatedPlayerStats', sourceId);
    const aggSourceSnap = await window.getDoc(aggSourceRef);
    if (aggSourceSnap.exists()) {
      log(`  Found aggregatedPlayerStats/${sourceId}`);
      if (!previewOnly) {
        await window.setDoc(aggSourceRef, { migrated: true }, { merge: true });
        log(`  Marked migrated: true`, 'success');
      } else {
        log(`  \u2192 Would set migrated: true on aggregatedPlayerStats/${sourceId}`);
      }
      document.getElementById('mergeAggMarked').textContent = previewOnly ? 'Preview' : '';
    } else {
      log(`  \u2139  No aggregatedPlayerStats/${sourceId} doc found (may be under a different ID)`, 'warning');
      document.getElementById('mergeAggMarked').textContent = 'N/A';
    }

    log('');
    if (previewOnly) {
      log('Preview complete \u2014 no data written. Review above then click Execute Merge.', 'success');
    } else {
      log(`Merge complete! ${gamesCopied} games + ${seasonsCopied} seasons copied to ${targetId}.`, 'success');
      log(`   Source docs at playerStats/${sourceId}/ are NOT deleted \u2014 remove them manually once you've verified.`, 'warning');
      log(`   Re-run the main aggregator to rebuild ${targetId}'s season totals from the merged game history.`, 'success');
    }

  } catch (err) {
    log(`Error during merge: ${err.message}`, 'error');
    console.error(err);
  }
};

// ============================================
// GAME RECAP BOX SCORE BUILDER
// Consolidates each game's batting + pitching docs into gameBoxScores/{seasonId}_{gameId}
// ============================================

window.runBoxScoreBuilder = async function(previewOnly = true) {
  const seasonId = document.getElementById('seasonSelect').value;
  if (!seasonId) { showToast('Please select a season first', 'error'); return; }

  const previewBtn = document.getElementById('boxScorePreviewBtn');
  const writeBtn   = document.getElementById('boxScoreWriteBtn');
  previewBtn.disabled = true;
  writeBtn.disabled   = true;

  document.getElementById('boxScoreStatsDisplay').style.display = 'grid';
  document.getElementById('boxScoreGames').textContent   = '0';
  document.getElementById('boxScoreRows').textContent    = '0';
  document.getElementById('boxScoreWritten').textContent = '0';

  log('');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`Game Recap Box Scores \u2014 ${seasonId} ${previewOnly ? '(PREVIEW \u2014 no writes)' : '(WRITE MODE)'}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  try {
    // \u2500\u2500 Step 1: Roster (same legacy-ID sources game-recap.html used) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('Step 1: Loading player roster...', 'game');
    const [aggSnap, usersSnap] = await Promise.all([
      window.getDocs(window.collection(window.db, 'aggregatedPlayerStats')),
      window.getDocs(window.collection(window.db, 'users'))
    ]);

    const legacyIds = new Set();
    const legacyToAuth = {};
    aggSnap.forEach(d => { if (!d.data().migrated) legacyIds.add(d.id); });
    usersSnap.forEach(d => {
      const mp = d.data().mergedFromProfile;
      if (mp) { legacyIds.add(mp); legacyToAuth[mp] = d.id; }
    });
    const ids = [...legacyIds];
    log(`  ${ids.length} player IDs to check`, 'success');

    // \u2500\u2500 Step 2: Pull this season's game docs for every player \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('Step 2: Reading per-player game docs...', 'game');
    const prefix = `${seasonId}_`;
    const rangeFilters = () => [
      window.where(window.documentId(), '>=', prefix),
      window.where(window.documentId(), '<=', prefix + '\uf8ff')
    ];

    const games = new Map(); // gameDocId -> { batting: [], pitching: [], legacyIds: Set }
    const bucket = gid => {
      if (!games.has(gid)) games.set(gid, { batting: [], pitching: [], legacyIds: new Set() });
      return games.get(gid);
    };

    const CHUNK = 10;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await Promise.all(ids.slice(i, i + CHUNK).map(async legacyId => {
        const [bSnap, pSnap] = await Promise.all([
          window.getDocs(window.query(window.collection(window.db, 'playerStats', legacyId, 'games'), ...rangeFilters())),
          window.getDocs(window.query(window.collection(window.db, 'pitchingStats', legacyId, 'games'), ...rangeFilters()))
        ]);
        bSnap.forEach(s => {
          const g = bucket(s.id);
          g.batting.push({ id: s.id, _legacyId: legacyId, ...s.data() });
          g.legacyIds.add(legacyId);
        });
        pSnap.forEach(s => {
          const g = bucket(s.id);
          g.pitching.push({ id: s.id, _legacyId: legacyId, ...s.data() });
          g.legacyIds.add(legacyId);
        });
      }));
      if ((i / CHUNK) % 5 === 4 || i + CHUNK >= ids.length) {
        log(`  Checked ${Math.min(i + CHUNK, ids.length)} / ${ids.length} players`);
      }
    }

    let totalRows = 0;
    games.forEach(g => { totalRows += g.batting.length + g.pitching.length; });
    document.getElementById('boxScoreGames').textContent = games.size;
    document.getElementById('boxScoreRows').textContent  = totalRows;
    log(`  Found ${games.size} games with stats (${totalRows} player rows)`, 'success');

    if (previewOnly) {
      log('');
      log('\u2500\u2500 Preview \u2500\u2500', 'header');
      [...games.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([gid, g]) => {
        log(`  ${gid} \u2014 ${g.batting.length} batting, ${g.pitching.length} pitching`, 'success');
      });
      document.getElementById('boxScoreWritten').textContent = '\u2014';
      log('Preview complete. Nothing written.', 'success');
    } else {
      // \u2500\u2500 Step 3: Write (only after every read succeeded) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      log('');
      log('Step 3: Writing gameBoxScores...', 'game');
      let written = 0;
      for (const [gid, g] of games) {
        const subsetMap = {};
        g.legacyIds.forEach(lid => { if (legacyToAuth[lid]) subsetMap[lid] = legacyToAuth[lid]; });
        await window.setDoc(window.doc(window.db, 'gameBoxScores', gid), {
          seasonId,
          gameDocId: gid,
          batting: g.batting,
          pitching: g.pitching,
          legacyToAuth: subsetMap,
          builtAt: new Date().toISOString()
        });
        written++;
        document.getElementById('boxScoreWritten').textContent = written;
      }
      log(`  Wrote ${written} box score docs`, 'success');
      log('Box score build complete.', 'success');
    }
  } catch (err) {
    console.error(err);
    log(`Box score builder error: ${err.message}`, 'error');
  }

  previewBtn.disabled = false;
  writeBtn.disabled   = false;
};

// ============================================
// bWAR CALCULATOR
// ============================================

window.runBWARCalculator = async function(previewOnly = true) {
  const seasonId = document.getElementById('seasonSelect').value;
  if (!seasonId) { showToast('Please select a season first', 'error'); return; }

  const previewBtn = document.getElementById('bwarPreviewBtn');
  const writeBtn   = document.getElementById('bwarWriteBtn');
  previewBtn.disabled = true;
  writeBtn.disabled   = true;

  const statsDiv = document.getElementById('bwarStatsDisplay');
  statsDiv.style.display = 'grid';

  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`bWAR Calculator \u2014 ${seasonId} ${previewOnly ? '(PREVIEW)' : '(WRITE)'}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  // \u2500\u2500 Calibrated weights \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const W = {
    wBB:     0.30,
    wFlat:   0.70,   // flat weight for 1B/2B/3B (non-HR hits)
    wHR:     1.40,
    replPct: 50,     // replacement level as % of league avg wOBA
    minPA:   20,
    rpwMul:  0.5,    // RPW = R/G \u00d7 rpwMul
  };

  log(`Weights: wBB=${W.wBB} wFlat=${W.wFlat} wHR=${W.wHR} | Replacement=${W.replPct}% | Min PA=${W.minPA} | RPW=${W.rpwMul}\u00d7R/G`);

  try {
    // \u2500\u2500 Step 1: Load all season player stats \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('');
    log('Step 1: Loading player stats...', 'game');
    const statsSnap = await window.getDocs(window.collection(window.db, 'aggregatedPlayerStats'));
    const players = [];
    statsSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.migrated) return;
      const matchingKeys = Object.keys(data.seasons || {}).filter(k => k.startsWith(seasonId) && !k.endsWith('-sub'));
      if (!matchingKeys.length) return;
      const seasonKey = matchingKeys[0];
      const s = data.seasons[seasonKey];
      const ab = Number(s.atBats) || 0;
      const bb = Number(s.walks)  || 0;
      const pa = ab + bb;
      if (pa === 0) return;
      players.push({
        docId:     docSnap.id,
        seasonKey,
        name:      data.name || data.linkedPlayer || docSnap.id,
        team:      s.team || '',
        pa,
        h:         Number(s.hits)     || 0,
        bb,
        hr:        Number(s.homeRuns) || 0,
      });
    });
    log(`  Found ${players.length} players with PA > 0 for ${seasonId}`, 'success');

    // \u2500\u2500 Step 2: Load completed game scores for R/G \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const useHistoricalRPW = document.getElementById('bwarHistoricalRPW')?.checked ?? false;
    // Detect season type: "fall" or "summer" (or null if neither keyword present)
    const seasonType = seasonId.toLowerCase().includes('fall')
      ? 'fall'
      : seasonId.toLowerCase().includes('summer')
        ? 'summer'
        : null;

    let totalRuns = 0, numGames = 0;
    let rpwSource = '';

    // Helper: sum completed games from a single season subcollection
    async function sumSeasonGames(sid) {
      let r = 0, g = 0;
      const snap = await window.getDocs(
        window.query(window.collection(window.db, 'seasons', sid, 'games'), window.where('status', '==', 'completed'))
      );
      snap.forEach(doc => {
        const d = doc.data();
        const hs = Number(d.homeScore ?? d['home score'] ?? 0) || 0;
        const as = Number(d.awayScore ?? d['away score'] ?? 0) || 0;
        if (d.winner && d.winner.trim() !== '') { r += hs + as; g++; }
      });
      // Fallback: no status=completed docs \u2014 scan all and check winner
      if (g === 0) {
        const all = await window.getDocs(window.collection(window.db, 'seasons', sid, 'games'));
        all.forEach(doc => {
          const d = doc.data();
          const hs = Number(d.homeScore ?? d['home score'] ?? 0) || 0;
          const as = Number(d.awayScore ?? d['away score'] ?? 0) || 0;
          if (d.winner && d.winner.trim() !== '') { r += hs + as; g++; }
        });
      }
      return { runs: r, games: g };
    }

    if (useHistoricalRPW && seasonType) {
      log(`Step 2: Loading historical R/G across all ${seasonType} seasons...`, 'game');
      const allSeasonsSnap = await window.getDocs(window.collection(window.db, 'seasons'));
      const matchingSeasons = allSeasonsSnap.docs
        .map(d => d.id)
        .filter(id => id.toLowerCase().includes(seasonType))
        .sort();

      log(`  ${seasonType} seasons found: ${matchingSeasons.join(', ')}`);

      for (const sid of matchingSeasons) {
        const { runs, games } = await sumSeasonGames(sid);
        const rpgStr = games > 0 ? (runs / games).toFixed(2) : '\u2014';
        log(`  ${sid}: ${games} games \u00b7 ${runs} runs \u00b7 ${rpgStr} R/G${sid === seasonId ? ' \u2190 current' : ''}`);
        totalRuns += runs;
        numGames  += games;
      }
      rpwSource = `historical \u2014 ${matchingSeasons.length} ${seasonType} season(s): ${matchingSeasons.join(', ')}`;
    } else {
      log(`Step 2: Loading completed games for run environment (current season)...`, 'game');
      const { runs, games } = await sumSeasonGames(seasonId);
      totalRuns = runs;
      numGames  = games;
      rpwSource = `current season (${seasonId})`;
    }

    const leagueRPG = numGames > 0 ? totalRuns / numGames : 14;
    const RPW = leagueRPG * W.rpwMul;
    log(`  Total: ${numGames} games \u00b7 ${totalRuns} runs \u00b7 ${leagueRPG.toFixed(2)} R/G \u00b7 RPW=${RPW.toFixed(2)}`, 'success');
    log(`  R/G source: ${rpwSource}`);

    // \u2500\u2500 Step 3: Compute wOBA per player \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    log('Step 3: Computing wOBA and bWAR...', 'game');
    const withWOBA = players.map(p => {
      const nonHR = Math.max(0, p.h - p.hr);
      const woba = (W.wBB * p.bb + W.wFlat * nonHR + W.wHR * p.hr) / p.pa;
      return { ...p, woba };
    });

    // PA-weighted league average
    const totalPA     = withWOBA.reduce((s, p) => s + p.pa, 0);
    const leagueWOBA  = totalPA > 0
      ? withWOBA.reduce((s, p) => s + p.woba * p.pa, 0) / totalPA : 0;
    const replWOBA    = leagueWOBA * (W.replPct / 100);

    log(`  League avg wOBA: ${leagueWOBA.toFixed(3)} \u00b7 Replacement: ${replWOBA.toFixed(3)}`);

    // \u2500\u2500 Step 4: Compute final bWAR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const results = withWOBA.map(p => {
      const rar     = (p.woba - replWOBA) * p.pa;
      const bwarRaw = RPW > 0 ? rar / RPW : 0;
      const bwarSimp = p.pa >= W.minPA ? Math.max(0, bwarRaw) : 0;
      return { ...p, bwarSimp };
    });

    const qualified = results.filter(p => p.pa >= W.minPA);
    const topPlayer = [...results].sort((a, b) => b.bwarSimp - a.bwarSimp)[0];

    log(`  ${qualified.length} qualified players (\u2265${W.minPA} PA) \u00b7 Top: ${topPlayer?.name} ${topPlayer?.bwarSimp?.toFixed(2)}`);

    // Update stat cards
    document.getElementById('bwarPlayersCalc').textContent      = results.length;
    document.getElementById('bwarQualified').textContent        = qualified.length;
    document.getElementById('bwarLeagueAvgDisplay').textContent = leagueWOBA.toFixed(3);
    document.getElementById('bwarRPWDisplay').textContent       = RPW.toFixed(2);
    document.getElementById('bwarRPWSource').textContent        = rpwSource;

    // \u2500\u2500 Step 5: Preview or Write \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if (previewOnly) {
      log('');
      log('\u2500\u2500 Preview (top 20 by bWAR) \u2500\u2500', 'header');
      [...results]
        .sort((a, b) => b.bwarSimp - a.bwarSimp)
        .slice(0, 20)
        .forEach((p, i) => {
          const qual = p.pa >= W.minPA ? '' : ' unqualified';
          log(`  ${String(i+1).padStart(2)}. ${p.name} (${p.team}) \u2014 PA:${p.pa} H:${p.h} HR:${p.hr} BB:${p.bb} | wOBA:${p.woba.toFixed(3)} \u2192 bWAR:${p.bwarSimp.toFixed(2)}${qual}`, 'success');
        });
      log('');
      log('Preview complete \u2014 no data written.', 'success');
      document.getElementById('bwarWritten').textContent = '\u2014';
    } else {
      log('');
      log('Step 5: Writing bWAR to Firestore...', 'game');
      let writtenCount = 0;
      for (const p of results) {
        try {
          const docRef = window.doc(window.db, getAggregatedCollection(), p.docId);
          await window.setDoc(docRef, {
            seasons: { [p.seasonKey]: { bwarSimp: p.bwarSimp } }
          }, { merge: true });
          writtenCount++;
        } catch (err) {
          log(`  Error writing ${p.name}: ${err.message}`, 'error');
        }
      }
      document.getElementById('bwarWritten').textContent = writtenCount;
      log(`  Written bWAR for ${writtenCount} players`, 'success');
      log('');
      log('bWAR write complete.', 'success');
    }

  } catch (err) {
    log(`bWAR calculator error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    previewBtn.disabled = false;
    writeBtn.disabled   = false;
  }
};

// ============================================
// CROSS-SEASON HIT STREAK CALCULATOR
// ============================================

window.runStreakCalculator = async function(previewOnly = true) {
  const previewBtn = document.getElementById('streakPreviewBtn');
  const writeBtn = document.getElementById('streakWriteBtn');
  previewBtn.disabled = true;
  writeBtn.disabled = true;

  if (!previewOnly) {
    const confirmed = await confirmModal(
      'This will write cross-season hit streak records to the hitStreaks collection.\n\n' +
      'Only streaks of 5+ games that don\'t already exist will be written.\n\n' +
      'This does NOT touch aggregatedPlayerStats or career totals.\n\n' +
      'Continue?'
    );
    if (!confirmed) {
      previewBtn.disabled = false;
      writeBtn.disabled = false;
      return;
    }
  }

  log('');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log(`Cross-Season Hit Streak Calculator ${previewOnly ? '(PREVIEW \u2014 no writes)' : '(WRITE MODE)'}`, 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');

  try {
    // Build legacyId \u2192 docId mapping from aggregatedPlayerStats
    log('Loading player roster...', 'game');
    const aggregatedRef = window.collection(window.db, 'aggregatedPlayerStats');
    const aggregatedSnap = await window.getDocs(aggregatedRef);

    const legacyToDocId = new Map();
    const docIdToInfo = new Map();

    aggregatedSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.migrated) return;
      const docId = docSnap.id;
      let legacyId;
      if (data.isAuthUser && data.linkedPlayer) {
        legacyId = data.linkedPlayer.toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
      } else {
        legacyId = docId;
      }
      legacyToDocId.set(legacyId, docId);
      docIdToInfo.set(docId, { name: data.name || data.linkedPlayer || legacyId });
    });

    log(`Found ${legacyToDocId.size} players`, 'success');
    log('');

    let playersChecked = 0;
    let notableCount = 0;
    let writtenCount = 0;
    let skippedCount = 0;
    const total = legacyToDocId.size;

    for (const [legacyId, docId] of legacyToDocId) {
      try {
        const playerInfo = docIdToInfo.get(docId) || {};
        const playerName = playerInfo.name || legacyId;

        // Load ALL games across ALL seasons \u2014 no seasonId filter
        const gamesRef = window.collection(window.db, 'playerStats', legacyId, 'games');
        const gamesSnap = await window.getDocs(gamesRef);

        if (gamesSnap.empty) {
          playersChecked++;
          continue;
        }

        const allGames = [];
        gamesSnap.forEach(gameDoc => {
          allGames.push({ gameId: gameDoc.id, ...gameDoc.data() });
        });

        // Sort globally by date across all seasons
        allGames.sort((a, b) => {
          const dateA = a.gameDate?.toDate?.() || new Date(a.gameDate) || new Date(0);
          const dateB = b.gameDate?.toDate?.() || new Date(b.gameDate) || new Date(0);
          return dateA - dateB;
        });

        // Streak detection across the full sorted game list
        let currentStreak = 0;
        let maxStreak = 0;
        let streakStartDate = null;
        let streakEndDate = null;
        let maxStreakStart = null;
        let maxStreakEnd = null;
        let currentStreakSeasons = new Set();
        let maxStreakSeasons = new Set();

        allGames.forEach(game => {
          if ((game.hits || 0) >= 1) {
            if (currentStreak === 0) streakStartDate = game.gameDate;
            currentStreak++;
            streakEndDate = game.gameDate;
            if (game.seasonId) currentStreakSeasons.add(game.seasonId);

            if (currentStreak > maxStreak) {
              maxStreak = currentStreak;
              maxStreakStart = streakStartDate;
              maxStreakEnd = streakEndDate;
              maxStreakSeasons = new Set(currentStreakSeasons);
            }
          } else {
            currentStreak = 0;
            streakStartDate = null;
            currentStreakSeasons = new Set();
          }
        });

        // Active streak: walk backwards from most recent game
        let activeStreak = 0;
        let activeStreakStart = null;
        let activeStreakSeasons = new Set();
        for (let i = allGames.length - 1; i >= 0; i--) {
          if ((allGames[i].hits || 0) >= 1) {
            activeStreak++;
            activeStreakStart = allGames[i].gameDate;
            if (allGames[i].seasonId) activeStreakSeasons.add(allGames[i].seasonId);
          } else {
            break;
          }
        }

        const isNotable = maxStreak >= 5 || activeStreak >= 3;

        if (isNotable) {
          notableCount++;
          const isCrossSeason = maxStreakSeasons.size > 1;
          const seasonsArray = [...maxStreakSeasons].sort();
          const seasonLabel = isCrossSeason
            ? `CROSS-SEASON (${seasonsArray.join(' \u2192 ')})`
            : seasonsArray[0] || 'unknown';

          const activeLabel = activeStreak >= 3
            ? ` | ACTIVE: ${activeStreak}-game streak`
            : activeStreak > 0
              ? ` | active: ${activeStreak}`
              : ' | active: 0';

          log(`  ${playerName}: max ${maxStreak} games (${seasonLabel})${activeLabel}`);

          if (!previewOnly) {
            // Stable doc ID \u2014 one doc per player for cross-season streaks.
            // Previously used "${docId}_allSeasons_${maxStreak}" which created a new doc
            // every time the max streak grew, leaving stale docs with active currentStreak values.
            const hitStreakDocId = `${docId}_allSeasons`;

            const docData = {
              playerId: docId,
              playerLegacyId: legacyId,
              playerName,
              seasonId: isCrossSeason ? 'crossSeason' : (seasonsArray[0] || null),
              crossSeason: isCrossSeason,
              seasonsSpanned: seasonsArray,
              streakLength: maxStreak,
              startDate: maxStreakStart || null,
              endDate: maxStreakEnd || null,
              currentStreak: activeStreak,
              currentStreakStart: activeStreakStart || null,
              currentStreakSeasons: [...activeStreakSeasons].sort(),
              achievedAt: new Date()
            };

            // Always full-overwrite so every aggregation run stays fresh
            await window.setDoc(
              window.doc(window.db, 'hitStreaks', hitStreakDocId),
              docData
            );
            writtenCount++;
            log(`    Written/updated: ${hitStreakDocId}`, 'success');

            // Zero out any old versioned docs (e.g. ${docId}_allSeasons_8) so they no
            // longer appear as active streaks on the leaderboard.
            try {
              const oldVersionedQuery = window.query(
                window.collection(window.db, 'hitStreaks'),
                window.where('playerId', '==', docId),
                window.where('crossSeason', '==', true)
              );
              const oldVersionedSnap = await window.getDocs(oldVersionedQuery);
              for (const oldDoc of oldVersionedSnap.docs) {
                if (oldDoc.id !== hitStreakDocId && (oldDoc.data().currentStreak || 0) > 0) {
                  await window.updateDoc(oldDoc.ref, { currentStreak: 0 });
                  log(`    Zeroed stale doc: ${oldDoc.id}`, 'skip');
                }
              }
            } catch (cleanupErr) {
              log(`    Cleanup error for ${docId}: ${cleanupErr.message}`, 'error');
            }
          }
        }

        playersChecked++;
        if (playersChecked % 25 === 0) {
          log(`  Checked ${playersChecked}/${total} players...`);
        }

      } catch (err) {
        log(`  Error for ${legacyId}: ${err.message}`, 'error');
        playersChecked++;
      }
    }

    // Update stat cards
    document.getElementById('streakStatsDisplay').style.display = 'flex';
    document.getElementById('streakPlayersChecked').textContent = playersChecked;
    document.getElementById('streakNotable').textContent = notableCount;
    document.getElementById('streakWritten').textContent = writtenCount;
    document.getElementById('streakSkipped').textContent = skippedCount;

    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('STREAK CALCULATION COMPLETE', 'header');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log(`Players checked: ${playersChecked}`, 'success');
    log(`Notable streaks (5+): ${notableCount}`, notableCount > 0 ? 'success' : 'skip');
    if (!previewOnly) {
      log(`New docs written: ${writtenCount}`, writtenCount > 0 ? 'success' : 'skip');
      log(`Existing docs updated (currentStreak refreshed): ${skippedCount}`, skippedCount > 0 ? 'success' : 'skip');
    } else {
      log('Run in Write mode to persist these results.', 'skip');
    }

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error('Streak calculator error:', error);
  } finally {
    previewBtn.disabled = false;
    writeBtn.disabled = false;
  }
};

// ============================================
// CAREER RECALCULATION
// ============================================

function recalculateCareer(seasonsObject) {
  const career = {
    games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
    doubles: 0, triples: 0, homeRuns: 0, rbi: 0,
    strikeouts: 0, stolenBases: 0,
    acesBPITotal: 0, acesBPICount: 0,
    vsOpponent: {},  // Career vs opponent totals
    splits: {        // Career splits aggregated from seasons with game-level data
      home: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      away: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      regular: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 },
      playoff: { games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0 }
    }
  };

  Object.entries(seasonsObject).forEach(([seasonId, season]) => {
    career.games += season.games || 0;
    career.atBats += season.atBats || 0;
    career.hits += season.hits || 0;
    career.runs += season.runs || 0;
    career.walks += season.walks || 0;
    career.doubles += season.doubles || 0;
    career.triples += season.triples || 0;
    career.homeRuns += season.homeRuns || 0;
    career.rbi += season.rbi || 0;
    career.strikeouts += season.strikeouts || 0;
    career.stolenBases += season.stolenBases || 0;
    
    const sub = (season.sub || '').toLowerCase();
    if (season.acesBPI && season.acesBPI > 0 && sub !== 'yes') {
      career.acesBPITotal += season.acesBPI;
      career.acesBPICount++;
    }
    
    // Aggregate vsOpponent data from seasons that have it (game-based seasons)
    if (season.vsOpponent) {
      Object.entries(season.vsOpponent).forEach(([opponent, oppStats]) => {
        if (!career.vsOpponent[opponent]) {
          career.vsOpponent[opponent] = {
            games: 0, atBats: 0, hits: 0, runs: 0, walks: 0,
            doubles: 0, triples: 0, homeRuns: 0, rbi: 0
          };
        }
        const careerOpp = career.vsOpponent[opponent];
        careerOpp.games += oppStats.games || 0;
        careerOpp.atBats += oppStats.atBats || 0;
        careerOpp.hits += oppStats.hits || 0;
        careerOpp.runs += oppStats.runs || 0;
        careerOpp.walks += oppStats.walks || 0;
        careerOpp.doubles += oppStats.doubles || 0;
        careerOpp.triples += oppStats.triples || 0;
        careerOpp.homeRuns += oppStats.homeRuns || 0;
        careerOpp.rbi += oppStats.rbi || 0;
      });
    }
    
    // Aggregate splits data from seasons that have it (game-based seasons)
    if (season.splits) {
      ['home', 'away', 'regular', 'playoff'].forEach(splitKey => {
        const seasonSplit = season.splits[splitKey];
        const careerSplit = career.splits[splitKey];
        if (seasonSplit) {
          careerSplit.games += seasonSplit.games || 0;
          careerSplit.atBats += seasonSplit.atBats || 0;
          careerSplit.hits += seasonSplit.hits || 0;
          careerSplit.runs += seasonSplit.runs || 0;
          careerSplit.walks += seasonSplit.walks || 0;
          careerSplit.doubles += seasonSplit.doubles || 0;
          careerSplit.triples += seasonSplit.triples || 0;
          careerSplit.homeRuns += seasonSplit.homeRuns || 0;
          careerSplit.rbi += seasonSplit.rbi || 0;
        }
      });
    }
  });

  career.battingAverage = career.atBats > 0 ? career.hits / career.atBats : 0;
  career.onBasePercentage = (career.atBats + career.walks) > 0
    ? (career.hits + career.walks) / (career.atBats + career.walks) : 0;
  career.acesBPI = career.acesBPICount > 0 ? career.acesBPITotal / career.acesBPICount : 0;
  
  // Calculate per-opponent career averages
  Object.values(career.vsOpponent).forEach(opp => {
    opp.battingAverage = opp.atBats > 0 ? opp.hits / opp.atBats : 0;
    opp.onBasePercentage = (opp.atBats + opp.walks) > 0
      ? (opp.hits + opp.walks) / (opp.atBats + opp.walks) : 0;
  });
  
  // Calculate career splits averages
  Object.values(career.splits).forEach(split => {
    split.battingAverage = split.atBats > 0 ? split.hits / split.atBats : 0;
    split.onBasePercentage = (split.atBats + split.walks) > 0
      ? (split.hits + split.walks) / (split.atBats + split.walks) : 0;
  });

  delete career.acesBPITotal;
  delete career.acesBPICount;

  return career;
}

function recalculatePitchingCareer(pitchingSeasonsObject) {
  const career = {
    games: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0,
    strikeouts: 0, walks: 0, hits: 0, wins: 0, losses: 0, saves: 0
  };

  Object.values(pitchingSeasonsObject).forEach(season => {
    career.games += season.games || 0;
    career.inningsPitched += season.inningsPitched || 0;
    career.runsAllowed += season.runsAllowed || 0;
    career.earnedRuns += season.earnedRuns || 0;
    career.strikeouts += season.strikeouts || 0;
    career.walks += season.walks || 0;
    career.hits += season.hits || 0;
    career.wins += season.wins || 0;
    career.losses += season.losses || 0;
    career.saves += season.saves || 0;
  });

  career.earnedRunAverage = career.inningsPitched > 0
    ? (career.runsAllowed * 7) / career.inningsPitched : 0;

  return career;
}

// ============================================
// FULL AGGREGATION (LEGACY)
// ============================================

window.runFullAggregation = async function() {
  const confirmed = await confirmModal(
    'This will recalculate career stats for ALL players from their season data.\n\n' +
    'This is typically only needed if data gets out of sync.\n\n' +
    'Continue?'
  );
  if (!confirmed) return;

  const btn = document.getElementById('aggregateBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log('Full Career Recalculation', 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  
  if (testModeEnabled) {
    log(`TEST MODE: Reading/writing to ${getAggregatedCollection()}`);
  }
  
  try {
    const statsRef = window.collection(window.db, getAggregatedCollection());
    const snapshot = await window.getDocs(statsRef);
    
    log(`Found ${snapshot.size} documents to process`);
    
    let processed = 0, legacyCount = 0, authCount = 0, skipped = 0, errors = 0;
    
    for (const docSnap of snapshot.docs) {
      const playerData = docSnap.data();
      
      if (playerData.migrated) {
        skipped++;
        continue;
      }
      
      try {
        if (!playerData.seasons || Object.keys(playerData.seasons).length === 0) {
          skipped++;
          continue;
        }
        
        const career = recalculateCareer(playerData.seasons);
        
        await window.setDoc(
          window.doc(window.db, getAggregatedCollection(), docSnap.id),
          { career, lastUpdated: new Date() },
          { merge: true }
        );
        
        processed++;
        if (playerData.isAuthUser) authCount++;
        else legacyCount++;
        
        if (processed % 25 === 0) {
          log(`Processed ${processed} players...`);
          updateFullStats(processed, legacyCount, authCount, skipped, errors);
        }
        
      } catch (error) {
        log(`Error processing ${docSnap.id}: ${error.message}`, 'error');
        errors++;
      }
    }
    
    log('');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log('RECALCULATION COMPLETE', 'header');
    log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
    log(`Processed: ${processed}`, 'success');
    log(`Legacy: ${legacyCount}`, 'legacy');
    log(`Auth users: ${authCount}`, 'auth');
    log(`Skipped: ${skipped}`, 'skip');
    if (errors > 0) log(`Errors: ${errors}`, 'error');
    
    updateFullStats(processed, legacyCount, authCount, skipped, errors);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Recalculate All Careers';
  }
};

// ============================================
// VERIFICATION
// ============================================

window.verifyAggregation = async function() {
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  log('Verifying Aggregated Collections', 'header');
  log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'header');
  
  if (testModeEnabled) {
    log(`TEST MODE: Verifying ${getAggregatedCollection()}`);
  }
  
  try {
    // Check main collection
    const statsRef = window.collection(window.db, getAggregatedCollection());
    const snapshot = await window.getDocs(statsRef);
    
    log(`\nMain Collection: ${getAggregatedCollection()}`, 'header');
    log(`Found ${snapshot.size} documents`, 'success');
    
    let authUserCount = 0, legacyCount = 0, migratedCount = 0, hasGameBasedSeasons = 0;
    const issues = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      if (data.migrated) migratedCount++;
      else if (data.isAuthUser) authUserCount++;
      else legacyCount++;
      
      if (data.seasons) {
        const hasGameBased = Object.keys(data.seasons).some(s => GAME_BASED_SEASONS.includes(s));
        if (hasGameBased) hasGameBasedSeasons++;
      }
      
      if (!data.name && !data.displayName) issues.push(`${doc.id}: Missing name`);
      if (data.career && data.career.battingAverage > 1) issues.push(`${doc.id}: Invalid batting average`);
    });
    
    log(`  Legacy players: ${legacyCount}`);
    log(`  Auth users: ${authUserCount}`);
    log(`  Migrated: ${migratedCount}`);
    log(`  Has 2026+ seasons: ${hasGameBasedSeasons}`);
    log(`  Active total: ${legacyCount + authUserCount}`);
    
    // Check 2025 splits collection
    log(`\n2025 Splits Collection: ${SPLITS_2025_COLLECTION}`, 'header');
    
    try {
      const splits2025Ref = window.collection(window.db, SPLITS_2025_COLLECTION);
      const splits2025Snap = await window.getDocs(splits2025Ref);
      
      log(`Found ${splits2025Snap.size} documents`, 'success');
      
      let has2025Summer = 0, has2025Fall = 0;
      splits2025Snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.seasons?.['2025-summer']) has2025Summer++;
        if (data.seasons?.['2025-fall']) has2025Fall++;
      });
      
      log(`  2025-summer: ${has2025Summer} players`);
      log(`  2025-fall: ${has2025Fall} players`);
      
    } catch (err) {
      log(`  Collection not found or empty`, 'skip');
    }
    
    // Check for duplicates in main collection
    const nameMap = new Map();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.migrated) return;
      const name = data.name || data.displayName;
      if (name) {
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name).push(doc.id);
      }
    });
    
    const duplicates = Array.from(nameMap.entries()).filter(([name, ids]) => ids.length > 1);
    
    if (duplicates.length > 0) {
      log(`\nPotential duplicates found:`, 'error');
      duplicates.forEach(([name, ids]) => log(`  ${name}: ${ids.join(', ')}`, 'error'));
    } else {
      log(`\nNo duplicates found!`, 'success');
    }
    
    if (issues.length > 0) {
      log(`\nIssues found:`, 'error');
      issues.slice(0, 10).forEach(issue => log(`  ${issue}`, 'error'));
      if (issues.length > 10) log(`  ... and ${issues.length - 10} more`, 'error');
    } else {
      log(`\nNo data issues found!`, 'success');
    }
    
  } catch (error) {
    log(`Verification error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
};

// ============================================
// START
// ============================================

const isGameSeason = (id) => { const m = /^(\d{4})-(summer|fall)$/.exec(id || ''); return !!m && Number(m[1]) >= 2026; };

async function main() {
  const ctx = await initPage({ title: 'Aggregate stats', role: 'league-staff', deniedMessage: 'The stats aggregator is for admins and league staff.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/aggregate-stats.html');

  const seasons = (await getAllSeasons()).map(s => s.id).filter(isGameSeason).sort().reverse();
  GAME_BASED_SEASONS = [...new Set([...GAME_BASED_SEASONS, ...seasons])];
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, ctx.config?.previousSeasonId, seasons[0]]
    .find(id => id && seasons.includes(id));
  const sel = document.getElementById('seasonSelect');
  sel.innerHTML = seasons.map(id => `<option value="${esc(id)}">${esc(seasonLabel(id))}</option>`).join('');
  if (start) sel.value = start;
  sel.addEventListener('change', () => {
    const p = new URLSearchParams(location.search);
    p.set('season', sel.value);
    history.replaceState(null, '', `?${p}`);
    document.querySelectorAll('[data-season-name]').forEach(el => { el.textContent = seasonLabel(sel.value); });
  });
  document.querySelectorAll('[data-season-name]').forEach(el => { el.textContent = start ? seasonLabel(start) : ''; });

  // Buttons: data-run="functionName" with optional data-arg="true|false"
  document.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => {
    const fn = window[b.dataset.run];
    if (typeof fn !== 'function') return;
    const arg = b.dataset.arg;
    fn(arg === undefined ? undefined : arg === 'true');
  }));
  document.getElementById('testModeCheckbox').addEventListener('change', window.toggleTestMode);

  pageReady();
  log(`Signed in as ${ctx.profile?.displayName || ctx.profile?.name || ctx.user.email}. Pick a season, preview, then aggregate.`);
  if (params.get('test') === '1') setTestMode(true);
}

main().catch(err => {
  console.error('[aggregate] start failed', err);
  pageReady();
  showToast(`Could not start: ${err.message || err}`, 'error');
});
