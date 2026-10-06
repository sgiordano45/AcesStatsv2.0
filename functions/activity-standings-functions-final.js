// ============================================================================
// ACTIVITY FEED & STANDINGS FUNCTIONS
// Mountainside Aces - Add to functions/index.js
// 
// Features:
// - Activity feed entries for games, milestones, badges, career highs, streaks, photos
// - Standings calculation and storage on game completion
// - Activity creation for standings changes
// ============================================================================

// ============================================================================
// HELPER: Create Activity Entry
// ============================================================================

/**
 * Create an activity entry in Firestore
 * @param {Object} activityData - Activity details
 * @returns {Promise<string>} - The created activity document ID
 */
async function createActivity(activityData) {
  const activityRef = db.collection('activity').doc();
  
  const activity = {
    id: activityRef.id,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...activityData
  };
  
  await activityRef.set(activity);
  console.log(`📰 Activity created: ${activityData.type} - ${activityData.title}`);
  
  return activityRef.id;
}

// ============================================================================
// STANDINGS CALCULATION HELPERS
// ============================================================================

/**
 * Calculate standings from an array of completed games
 * Mirrors the client-side logic from current-season.html
 */
function calculateStandingsFromGames(games) {
  const teamStats = {};
  
  games.forEach(game => {
    // Handle both field naming conventions
    const homeTeam = game['home team'] || game.homeTeamName || game.homeTeam || '';
    const awayTeam = game['away team'] || game.awayTeamName || game.awayTeam || '';
    const winner = game.winner || '';
    const homeScore = parseInt(game['home score'] || game.homeScore) || 0;
    const awayScore = parseInt(game['away score'] || game.awayScore) || 0;
    
    if (!homeTeam || !awayTeam) return;
    
    // Initialize team stats
    if (!teamStats[homeTeam]) {
      teamStats[homeTeam] = {
        name: homeTeam,
        teamId: (game.homeTeamId || homeTeam).toLowerCase(),
        wins: 0, losses: 0, ties: 0,
        runsFor: 0, runsAgainst: 0,
        h2h: {},
        recentResults: []
      };
    }
    if (!teamStats[awayTeam]) {
      teamStats[awayTeam] = {
        name: awayTeam,
        teamId: (game.awayTeamId || awayTeam).toLowerCase(),
        wins: 0, losses: 0, ties: 0,
        runsFor: 0, runsAgainst: 0,
        h2h: {},
        recentResults: []
      };
    }
    
    // Update runs
    teamStats[homeTeam].runsFor += homeScore;
    teamStats[homeTeam].runsAgainst += awayScore;
    teamStats[awayTeam].runsFor += awayScore;
    teamStats[awayTeam].runsAgainst += homeScore;
    
    // Initialize H2H if needed
    if (!teamStats[homeTeam].h2h[awayTeam]) {
      teamStats[homeTeam].h2h[awayTeam] = { wins: 0, losses: 0, ties: 0 };
    }
    if (!teamStats[awayTeam].h2h[homeTeam]) {
      teamStats[awayTeam].h2h[homeTeam] = { wins: 0, losses: 0, ties: 0 };
    }
    
    // Determine winner
    const winnerLower = winner.toLowerCase();
    const homeTeamLower = homeTeam.toLowerCase();
    const awayTeamLower = awayTeam.toLowerCase();
    
    if (winnerLower === 'tie') {
      teamStats[homeTeam].ties++;
      teamStats[awayTeam].ties++;
      teamStats[homeTeam].h2h[awayTeam].ties++;
      teamStats[awayTeam].h2h[homeTeam].ties++;
      teamStats[homeTeam].recentResults.push('T');
      teamStats[awayTeam].recentResults.push('T');
    } else if (winnerLower === homeTeamLower || winner === homeTeam) {
      teamStats[homeTeam].wins++;
      teamStats[awayTeam].losses++;
      teamStats[homeTeam].h2h[awayTeam].wins++;
      teamStats[awayTeam].h2h[homeTeam].losses++;
      teamStats[homeTeam].recentResults.push('W');
      teamStats[awayTeam].recentResults.push('L');
    } else if (winnerLower === awayTeamLower || winner === awayTeam) {
      teamStats[awayTeam].wins++;
      teamStats[homeTeam].losses++;
      teamStats[awayTeam].h2h[homeTeam].wins++;
      teamStats[homeTeam].h2h[awayTeam].losses++;
      teamStats[awayTeam].recentResults.push('W');
      teamStats[homeTeam].recentResults.push('L');
    }
  });
  
  // Calculate derived stats
  const standings = Object.values(teamStats).map(team => {
    const totalDecided = team.wins + team.losses;
    team.winPct = totalDecided > 0 ? (team.wins / totalDecided) : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    team.streak = calculateStreakFromResults(team.recentResults);
    return team;
  });
  
  // Sort standings
  return standings.sort((a, b) => {
    // First: Win percentage
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    
    // Check if exactly 2 teams tied
    const teamsAtSameWinPct = standings.filter(t => t.winPct === a.winPct);
    
    // Second: H2H only if exactly 2 teams tied
    if (teamsAtSameWinPct.length === 2) {
      const h2hComp = compareH2H(a, b);
      if (h2hComp !== 0) return h2hComp;
    }
    
    // Third: Runs Against (fewer is better)
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;
    
    // Fourth: Run Differential
    return b.runDifferential - a.runDifferential;
  });
}

function compareH2H(teamA, teamB) {
  const aVsB = teamA.h2h[teamB.name];
  const bVsA = teamB.h2h[teamA.name];
  if (!aVsB || !bVsA) return 0;
  const aH2HWinPct = (aVsB.wins + aVsB.losses) > 0 ? aVsB.wins / (aVsB.wins + aVsB.losses) : 0;
  const bH2HWinPct = (bVsA.wins + bVsA.losses) > 0 ? bVsA.wins / (bVsA.wins + bVsA.losses) : 0;
  return bH2HWinPct - aH2HWinPct;
}

function calculateGamesBack(firstPlace, team) {
  const winDiff = firstPlace.wins - team.wins;
  const lossDiff = team.losses - firstPlace.losses;
  return (winDiff + lossDiff) / 2;
}

function calculateStreakFromResults(recentResults) {
  if (!recentResults || recentResults.length === 0) return null;
  const lastResult = recentResults[recentResults.length - 1];
  let count = 0;
  for (let i = recentResults.length - 1; i >= 0; i--) {
    if (recentResults[i] === lastResult) count++;
    else break;
  }
  return `${lastResult}${count}`;
}

// ============================================================================
// 1. GAME COMPLETED - Creates activity AND updates standings
// ============================================================================

exports.onGameCompleted = functions.firestore
  .document('seasons/{seasonId}/games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const seasonId = context.params.seasonId;
    const gameId = context.params.gameId;
    
    // Only process when game is completed (winner just set)
    if (before.winner || !after.winner) {
      return null;
    }
    
    const isPlayoff = isPlayoffGame(gameId);
    const homeTeam = after.homeTeamName || after['home team'] || capitalize(after.homeTeamId) || 'Home';
    const awayTeam = after.awayTeamName || after['away team'] || capitalize(after.awayTeamId) || 'Away';
    const winnerName = capitalize(after.winner);
    
    console.log(`🏁 Game completed: ${homeTeam} vs ${awayTeam} (${gameId})`);
    
    // ===== CREATE GAME ACTIVITY =====
    const gameTypePrefix = isPlayoff ? '🏆 ' : '';
    
    await createActivity({
      type: 'game',
      seasonId: seasonId,
      icon: '⚾',
      gameId: gameId,
      title: `${homeTeam} ${after.homeScore}, ${awayTeam} ${after.awayScore}`,
      description: `${gameTypePrefix}Final - ${winnerName} wins!`,
      linkUrl: `/game-preview.html?season=${seasonId}&game=${gameId}`,
      linkText: 'View Game',
      data: {
        homeTeam, awayTeam,
        homeTeamId: after.homeTeamId,
        awayTeamId: after.awayTeamId,
        homeScore: after.homeScore,
        awayScore: after.awayScore,
        winner: after.winner,
        isPlayoff
      },
      share: {
        type: isPlayoff ? 'PLAYOFF FINAL' : 'FINAL SCORE',
        headline: `${homeTeam} vs ${awayTeam}`,
        subheadline: `${after.homeScore} - ${after.awayScore}`,
        stat: null,
        statLabel: null
      }
    });
    
    // ===== UPDATE STANDINGS (regular season only) =====
    if (!isPlayoff) {
      try {
        // Get all completed regular season games
        const gamesSnapshot = await db
          .collection('seasons').doc(seasonId)
          .collection('games')
          .where('winner', '!=', null)
          .get();
        
        const regularGames = [];
        gamesSnapshot.forEach(doc => {
          const game = doc.data();
          const docId = doc.id;
          if (!docId.startsWith('playoff_') && game.gameType !== 'Playoff' && !game.isPlayoff) {
            regularGames.push({ id: docId, ...game });
          }
        });
        
        console.log(`📊 Calculating standings from ${regularGames.length} games`);
        
        // Calculate standings
        const standings = calculateStandingsFromGames(regularGames);
        
        // Get previous standings
        const standingsRef = db.collection('seasons').doc(seasonId)
          .collection('standings').doc('current');
        const previousDoc = await standingsRef.get();
        const previousStandings = previousDoc.exists ? previousDoc.data() : null;
        const previousFirstPlace = previousStandings?.rankings?.[0]?.teamId || null;
        
        // Build rankings
        const rankings = standings.map((team, index) => ({
          rank: index + 1,
          teamId: team.teamId || team.name?.toLowerCase(),
          teamName: team.name,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties || 0,
          winPct: Math.round(team.winPct * 1000) / 1000,
          gamesBack: index === 0 ? 0 : calculateGamesBack(standings[0], team),
          runsFor: team.runsFor,
          runsAgainst: team.runsAgainst,
          runDifferential: team.runDifferential,
          streak: team.streak || null
        }));
        
        const currentFirstPlace = rankings[0]?.teamId || null;
        const firstPlaceChanged = previousFirstPlace && currentFirstPlace && 
                                  previousFirstPlace !== currentFirstPlace;
        
        // Store standings
        await standingsRef.set({
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByGameId: gameId,
          gamesIncluded: regularGames.length,
          rankings: rankings,
          previousFirstPlace: previousFirstPlace,
          currentFirstPlace: currentFirstPlace,
          firstPlaceChanged: firstPlaceChanged
        });
        
        console.log(`✅ Standings updated. First place: ${currentFirstPlace}`);
        
        // Create activity if first place changed
        if (firstPlaceChanged) {
          const newLeader = rankings[0];
          console.log(`📊 First place changed: ${previousFirstPlace} → ${currentFirstPlace}`);
          
          await createActivity({
            type: 'standings',
            seasonId: seasonId,
            icon: '📊',
            teamId: newLeader.teamId,
            teamName: newLeader.teamName,
            title: `${newLeader.teamName} takes 1st place!`,
            description: `${newLeader.teamName} moves into first place with a ${newLeader.wins}-${newLeader.losses} record.`,
            linkUrl: `/current-season.html`,
            linkText: 'View Standings',
            data: {
              previousLeader: previousFirstPlace,
              newLeader: currentFirstPlace,
              record: `${newLeader.wins}-${newLeader.losses}`,
              winPct: newLeader.winPct
            },
            share: {
              type: 'STANDINGS UPDATE',
              headline: newLeader.teamName,
              subheadline: 'NOW IN 1ST PLACE 🏆',
              stat: `${newLeader.wins}-${newLeader.losses}`,
              statLabel: 'RECORD'
            }
          });
        }
        
        // Check for big movers (3+ spots gained)
        if (previousStandings?.rankings) {
          for (const current of rankings) {
            const previous = previousStandings.rankings.find(r => r.teamId === current.teamId);
            if (previous && previous.rank - current.rank >= 3) {
              await createActivity({
                type: 'standings',
                seasonId: seasonId,
                icon: '📈',
                teamId: current.teamId,
                teamName: current.teamName,
                title: `${current.teamName} surges to #${current.rank}`,
                description: `${current.teamName} climbs ${previous.rank - current.rank} spots!`,
                linkUrl: `/current-season.html`,
                linkText: 'View Standings',
                data: {
                  previousRank: previous.rank,
                  newRank: current.rank,
                  spotsGained: previous.rank - current.rank
                },
                share: {
                  type: 'ON THE RISE',
                  headline: current.teamName,
                  subheadline: `CLIMBED TO #${current.rank} 📈`,
                  stat: `+${previous.rank - current.rank}`,
                  statLabel: 'SPOTS'
                }
              });
            }
          }
        }
        
      } catch (error) {
        console.error('❌ Error updating standings:', error);
      }
    }
    
    return null;
  });

// ============================================================================
// 2. MILESTONE REACHED - Career stats cross thresholds
// ============================================================================

exports.onMilestoneReached = functions.firestore
  .document('aggregatedPlayerStats/{playerId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const playerId = context.params.playerId;
    
    if (after.migrated === true) return null;
    
    const playerName = after.name || after.displayName || after.playerName || playerId;
    
    // Get season ID from seasons data
    let seasonId = null;
    if (after.seasons && typeof after.seasons === 'object') {
      const seasonKeys = Object.keys(after.seasons);
      seasonId = seasonKeys.length > 0 ? seasonKeys[seasonKeys.length - 1] : null;
    }
    
    // Calculate career totals
    function getCareerTotal(data, stat) {
      if (!data.seasons || typeof data.seasons !== 'object') return 0;
      let total = 0;
      Object.values(data.seasons).forEach(season => {
        total += Number(season[stat]) || 0;
      });
      return total;
    }
    
    const beforeHits = getCareerTotal(before, 'hits');
    const afterHits = getCareerTotal(after, 'hits');
    const beforeRuns = getCareerTotal(before, 'runs');
    const afterRuns = getCareerTotal(after, 'runs');
    const beforeGames = getCareerTotal(before, 'games');
    const afterGames = getCareerTotal(after, 'games');
    
    const milestones = [];
    
    // Hits milestones
    [50, 100, 150, 200, 250, 300, 400, 500].forEach(m => {
      if (beforeHits < m && afterHits >= m) {
        milestones.push({ type: 'hits', value: m, stat: afterHits, icon: '🎯',
          title: `${m} Career Hits`, description: `${playerName} reached ${m} career hits!` });
      }
    });
    
    // Runs milestones
    [25, 50, 75, 100, 150, 200].forEach(m => {
      if (beforeRuns < m && afterRuns >= m) {
        milestones.push({ type: 'runs', value: m, stat: afterRuns, icon: '🏃',
          title: `${m} Career Runs`, description: `${playerName} scored their ${m}th career run!` });
      }
    });
    
    // Games milestones
    [25, 50, 75, 100, 150, 200].forEach(m => {
      if (beforeGames < m && afterGames >= m) {
        milestones.push({ type: 'games', value: m, stat: afterGames, icon: '📅',
          title: `${m} Career Games`, description: `${playerName} played in their ${m}th game!` });
      }
    });
    
    // Create activity for each milestone
    for (const milestone of milestones) {
      console.log(`🎯 Milestone: ${playerName} - ${milestone.title}`);
      await createActivity({
        type: 'milestone',
        seasonId: seasonId,
        icon: milestone.icon,
        playerId: playerId,
        playerName: playerName,
        title: milestone.title,
        description: milestone.description,
        linkUrl: `/player.html?id=${playerId}`,
        linkText: 'View Player',
        data: { milestoneType: milestone.type, milestoneValue: milestone.value, currentStat: milestone.stat },
        share: {
          type: 'MILESTONE',
          headline: playerName,
          subheadline: milestone.title.toUpperCase(),
          stat: String(milestone.value),
          statLabel: milestone.type.toUpperCase()
        }
      });
    }
    
    return null;
  });

// ============================================================================
// 3. BADGE EARNED
// ============================================================================

exports.onBadgeEarned = functions.firestore
  .document('playerBadges/{docId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    
    const docId = context.params.docId;
    if (docId.startsWith('season_')) return null; // Skip summary docs
    
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.data();
    
    const playerId = after.playerId || docId.split('_').slice(1).join('_');
    const playerName = after.playerName || playerId;
    const seasonId = after.seasonId || docId.split('_')[0];
    
    const beforeEarned = before.earned || {};
    const afterEarned = after.earned || {};
    
    // Find new badges
    const newBadges = [];
    for (const [badgeId, badge] of Object.entries(afterEarned)) {
      const hadBefore = beforeEarned[badgeId];
      if (!hadBefore || (badge.tier && badge.tier !== hadBefore.tier)) {
        newBadges.push({ badgeId, ...badge });
      }
    }
    
    // Create activity for up to 3 badges
    for (const badge of newBadges.slice(0, 3)) {
      const tierEmoji = badge.tier === 'gold' ? '🥇' : badge.tier === 'silver' ? '🥈' : badge.tier === 'bronze' ? '🥉' : '🏅';
      const badgeName = badge.name || badge.badgeId;
      
      console.log(`🏅 Badge: ${playerName} earned ${badgeName}`);
      await createActivity({
        type: 'badge',
        seasonId: seasonId,
        icon: badge.icon || tierEmoji,
        playerId: playerId,
        playerName: playerName,
        title: badgeName,
        description: `${playerName} earned the ${badgeName} badge!`,
        linkUrl: `/player.html?id=${playerId}`,
        linkText: 'View Player',
        data: { badgeId: badge.badgeId, badgeName, tier: badge.tier || null, category: badge.category || 'general' },
        share: {
          type: 'BADGE EARNED',
          headline: playerName,
          subheadline: `${badgeName.toUpperCase()} ${tierEmoji}`,
          stat: null,
          statLabel: null
        }
      });
    }
    
    return null;
  });

// ============================================================================
// 4. CAREER HIGH - From game-by-game stats
// ============================================================================

exports.onCareerHigh = functions.firestore
  .document('playerStats/{playerLegacyId}/games/{gameDocId}')
  .onCreate(async (snapshot, context) => {
    const stats = snapshot.data();
    const playerLegacyId = context.params.playerLegacyId;
    const gameDocId = context.params.gameDocId;
    
    const playerName = stats.playerName || playerLegacyId;
    const seasonId = stats.seasonId || null;
    
    // Get previous games to find max stats
    const gamesRef = db.collection('playerStats').doc(playerLegacyId).collection('games');
    const gamesSnapshot = await gamesRef.get();
    
    let maxHits = 0, maxRuns = 0;
    gamesSnapshot.forEach(doc => {
      if (doc.id !== gameDocId) {
        const g = doc.data();
        maxHits = Math.max(maxHits, g.hits || 0);
        maxRuns = Math.max(maxRuns, g.runs || 0);
      }
    });
    
    const newHighs = [];
    if (stats.hits && stats.hits > maxHits && stats.hits >= 3) {
      newHighs.push({ stat: 'hits', value: stats.hits, previous: maxHits });
    }
    if (stats.runs && stats.runs > maxRuns && stats.runs >= 3) {
      newHighs.push({ stat: 'runs', value: stats.runs, previous: maxRuns });
    }
    
    if (newHighs.length === 0) return null;
    
    // Use highest priority (hits > runs)
    const bestHigh = newHighs.sort((a, b) => {
      const priority = { hits: 2, runs: 1 };
      return (priority[b.stat] || 0) - (priority[a.stat] || 0);
    })[0];
    
    console.log(`📈 Career high: ${playerName} - ${bestHigh.value} ${bestHigh.stat}`);
    
    await createActivity({
      type: 'career_high',
      seasonId: seasonId,
      icon: '📈',
      playerId: playerLegacyId,
      playerName: playerName,
      title: `Career High: ${bestHigh.value} ${capitalize(bestHigh.stat)}`,
      description: `${playerName} set a new single-game record with ${bestHigh.value} ${bestHigh.stat}!`,
      linkUrl: `/player.html?id=${playerLegacyId}`,
      linkText: 'View Player',
      data: { stat: bestHigh.stat, value: bestHigh.value, previousHigh: bestHigh.previous, opponent: stats.opponent },
      share: {
        type: 'CAREER HIGH',
        headline: playerName,
        subheadline: `${bestHigh.value} ${bestHigh.stat.toUpperCase()} IN A GAME`,
        stat: String(bestHigh.value),
        statLabel: bestHigh.stat.toUpperCase()
      }
    });
    
    return null;
  });

// ============================================================================
// 5. HIT STREAK
// ============================================================================

exports.onHitStreak = functions.firestore
  .document('playerStats/{playerLegacyId}/games/{gameDocId}')
  .onCreate(async (snapshot, context) => {
    const stats = snapshot.data();
    const playerLegacyId = context.params.playerLegacyId;
    
    if (!stats.hits || stats.hits < 1) return null;
    
    const playerName = stats.playerName || playerLegacyId;
    const seasonId = stats.seasonId || null;
    
    // Get all games sorted by date
    const gamesRef = db.collection('playerStats').doc(playerLegacyId).collection('games');
    const gamesSnapshot = await gamesRef.orderBy('gameDate', 'asc').get();
    
    const games = [];
    gamesSnapshot.forEach(doc => games.push({ id: doc.id, ...doc.data() }));
    
    // Calculate current streak from end
    let currentStreak = 0;
    for (let i = games.length - 1; i >= 0; i--) {
      if ((games[i].hits || 0) >= 1) currentStreak++;
      else break;
    }
    
    // Only notable streaks
    if (![3, 5, 8, 10, 15, 20].includes(currentStreak)) return null;
    
    console.log(`🔥 Hit streak: ${playerName} - ${currentStreak} games`);
    
    await createActivity({
      type: 'streak',
      seasonId: seasonId,
      icon: '🔥',
      playerId: playerLegacyId,
      playerName: playerName,
      title: `${currentStreak}-Game Hit Streak`,
      description: `${playerName} has hit safely in ${currentStreak} straight games!`,
      linkUrl: `/player.html?id=${playerLegacyId}`,
      linkText: 'View Player',
      data: { streakType: 'hitting', streakLength: currentStreak },
      share: {
        type: 'HOT STREAK',
        headline: playerName,
        subheadline: `${currentStreak}-GAME HIT STREAK 🔥`,
        stat: String(currentStreak),
        statLabel: 'GAMES'
      }
    });
    
    return null;
  });

// ============================================================================
// 6. PHOTO UPLOADED
// ============================================================================

exports.onPhotoUploaded = functions.firestore
  .document('teamPhotos/{photoId}')
  .onCreate(async (snapshot, context) => {
    const photo = snapshot.data();
    const photoId = context.params.photoId;
    
    const currentSeason = await getCurrentSeason();
    const seasonId = currentSeason?.id || null;
    const folder = photo.folder || 'league';
    const teamName = folder === 'league' ? 'League' : capitalize(folder);
    
    // Rate limit: Check for recent photo activity for same folder
    const recentQuery = await db.collection('activity')
      .where('type', '==', 'photo')
      .where('data.folder', '==', folder)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (!recentQuery.empty) {
      const lastTimestamp = recentQuery.docs[0].data().timestamp?.toDate() || new Date(0);
      if (lastTimestamp > new Date(Date.now() - 60 * 60 * 1000)) {
        console.log(`📸 Skipping photo activity - recent one exists for ${folder}`);
        return null;
      }
    }
    
    console.log(`📸 Photo activity: ${teamName}`);
    
    await createActivity({
      type: 'photo',
      seasonId: seasonId,
      icon: '📸',
      teamId: folder,
      teamName: teamName,
      title: `New photos added`,
      description: `New photos added to ${teamName} gallery`,
      linkUrl: folder !== 'league' ? `/pictures.html?team=${folder}` : '/pictures.html',
      linkText: 'View Gallery',
      data: { photoId, folder, uploadedBy: photo.uploadedByName || 'Unknown' },
      share: {
        type: 'NEW PHOTOS',
        headline: teamName,
        subheadline: 'GAME DAY GALLERY 📸',
        stat: null,
        statLabel: null
      }
    });
    
    return null;
  });

// ============================================================================
// HTTP: Get Recent Activity
// ============================================================================

exports.getRecentActivity = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const type = req.query.type || null;
    const seasonId = req.query.season || null;
    
    let query = db.collection('activity').orderBy('timestamp', 'desc').limit(limit);
    if (type && type !== 'all') query = query.where('type', '==', type);
    if (seasonId) query = query.where('seasonId', '==', seasonId);
    
    const snapshot = await query.get();
    const activities = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      activities.push({ id: doc.id, ...data, timestamp: data.timestamp?.toDate()?.toISOString() || null });
    });
    
    res.status(200).json({ success: true, count: activities.length, activities });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity' });
  }
});

// ============================================================================
// HTTP: Get Current Standings
// ============================================================================

exports.getCurrentStandings = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  
  try {
    let targetSeasonId = req.query.season || null;
    if (!targetSeasonId) {
      const currentSeason = await getCurrentSeason();
      targetSeasonId = currentSeason?.id;
    }
    
    if (!targetSeasonId) {
      res.status(404).json({ success: false, error: 'No active season found' });
      return;
    }
    
    const standingsDoc = await db.collection('seasons').doc(targetSeasonId)
      .collection('standings').doc('current').get();
    
    if (!standingsDoc.exists) {
      res.status(404).json({ success: false, error: 'Standings not yet calculated' });
      return;
    }
    
    const standings = standingsDoc.data();
    res.status(200).json({
      success: true,
      seasonId: targetSeasonId,
      updatedAt: standings.updatedAt?.toDate()?.toISOString() || null,
      gamesIncluded: standings.gamesIncluded,
      rankings: standings.rankings
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch standings' });
  }
});

// ============================================================================
// CALLABLE: Manual Standings Recalculation (Admin only)
// ============================================================================

exports.recalculateStandings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userRole = userDoc.data()?.role || userDoc.data()?.userRole || 'fan';
  
  if (!['admin', 'league-staff'].includes(userRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }
  
  const seasonId = data.seasonId;
  if (!seasonId) {
    throw new functions.https.HttpsError('invalid-argument', 'Season ID required.');
  }
  
  console.log(`🔄 Manual recalculation for ${seasonId}`);
  
  const gamesSnapshot = await db.collection('seasons').doc(seasonId)
    .collection('games').where('winner', '!=', null).get();
  
  const regularGames = [];
  gamesSnapshot.forEach(doc => {
    const game = doc.data();
    if (!doc.id.startsWith('playoff_') && !game.isPlayoff) {
      regularGames.push({ id: doc.id, ...game });
    }
  });
  
  const standings = calculateStandingsFromGames(regularGames);
  const rankings = standings.map((team, index) => ({
    rank: index + 1,
    teamId: team.teamId || team.name?.toLowerCase(),
    teamName: team.name,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties || 0,
    winPct: Math.round(team.winPct * 1000) / 1000,
    gamesBack: index === 0 ? 0 : calculateGamesBack(standings[0], team),
    runsFor: team.runsFor,
    runsAgainst: team.runsAgainst,
    runDifferential: team.runDifferential,
    streak: team.streak
  }));
  
  await db.collection('seasons').doc(seasonId)
    .collection('standings').doc('current').set({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByGameId: 'manual_recalculation',
      gamesIncluded: regularGames.length,
      rankings: rankings,
      currentFirstPlace: rankings[0]?.teamId
    });
  
  return { success: true, teamsCount: rankings.length, firstPlace: rankings[0]?.teamName };
});

// ============================================================================
// SCHEDULED: Cleanup Old Activity (Weekly)
// ============================================================================

exports.cleanupOldActivity = functions.pubsub
  .schedule('0 3 * * 0')  // Sunday 3 AM
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('🧹 Cleaning up old activity...');
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const oldQuery = await db.collection('activity')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(sixMonthsAgo))
      .limit(500)
      .get();
    
    if (oldQuery.empty) {
      console.log('No old activity to clean up');
      return null;
    }
    
    const batch = db.batch();
    oldQuery.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`🧹 Deleted ${oldQuery.size} old activity items`);
    return null;
  });
