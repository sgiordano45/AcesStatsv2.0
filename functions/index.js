// functions/index.js
// Cloud Functions for Firebase Cloud Messaging
// Mountainside Aces Softball Stats Platform

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert UTC timestamp or date to Eastern Time for display
 * CRITICAL FIX: Prevents 7:45 PM ET from displaying as 11:45 PM
 * @param {Date|Number|Object} utcDate - UTC date (Date object, timestamp in ms, or Firestore Timestamp)
 * @returns {Date} Date object representing the same moment in Eastern timezone
 */
function convertToEastern(utcDate) {
  let date;
  
  if (!utcDate) return new Date();
  
  // Handle Firestore Timestamp
  if (utcDate.seconds) {
    date = new Date(utcDate.seconds * 1000);
  }
  // Handle milliseconds timestamp
  else if (typeof utcDate === 'number') {
    date = new Date(utcDate);
  }
  // Handle Date object
  else if (utcDate instanceof Date) {
    date = utcDate;
  }
  // Fallback
  else {
    return new Date();
  }
  
  // Convert UTC to Eastern by using toLocaleString and re-parsing
  const easternString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(easternString);
}

/**
 * Format a time string in 12-hour format with AM/PM (Eastern Time)
 * @param {Date|Number|Object} utcDate - UTC date to format
 * @returns {string} Time string like "7:45 PM"
 */
function formatGameTime(utcDate) {
  const eastern = convertToEastern(utcDate);
  return eastern.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Check if current time is within user's quiet hours
 * @param {Object} quietHours - User's quiet hours settings {enabled, start, end}
 * @returns {boolean} True if in quiet hours (should NOT send notification)
 */
function isInQuietHours(quietHours) {
  if (!quietHours || !quietHours.enabled) {
    return false; // Quiet hours not enabled
  }
  
  // Get current time in Eastern timezone
  const now = new Date();
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentHour = easternTime.getHours();
  const currentMinute = easternTime.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  // Parse start and end times (format: "HH:MM") - assumed to be in Eastern time
  const [startHour, startMinute] = quietHours.start.split(':').map(Number);
  const [endHour, endMinute] = quietHours.end.split(':').map(Number);
  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;
  
  // Handle cases where quiet hours span midnight
  if (startTime < endTime) {
    // Normal case: e.g., 09:00 to 17:00
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Spans midnight: e.g., 22:00 to 08:00
    return currentTime >= startTime || currentTime < endTime;
  }
}

/**
 * Determine if a game ID is a playoff game
 * @param {string} gameId - The game document ID
 * @returns {boolean} True if this is a playoff game
 */
function isPlayoffGame(gameId) {
  return gameId && gameId.startsWith('playoff_');
}

/**
 * Get the current active season
 */
async function getCurrentSeason() {
  const seasonsSnapshot = await db
    .collection('seasons')
    .where('isActive', '==', true)
    .limit(1)
    .get();
  
  if (seasonsSnapshot.empty) {
    console.error('No active season found');
    return null;
  }
  
  const seasonDoc = seasonsSnapshot.docs[0];
  return {
    id: seasonDoc.id,
    ...seasonDoc.data()
  };
}

/**
 * Get FCM tokens for all players on specified teams
 * Uses linkedTeam field on user documents
 */
async function getTeamPlayerTokens(teamIds) {
  const tokens = [];
  
  // Get all users with linkedTeam field
  const usersSnapshot = await db
    .collection('users')
    .where('linkedTeam', '!=', null)
    .get();
  
  // Normalize team IDs for case-insensitive matching
  const normalizedTeamIds = teamIds.map(id => id.toLowerCase());
  
  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const userTeam = userData.linkedTeam?.toLowerCase();
    
    // Check if this user is linked to one of the specified teams
    if (normalizedTeamIds.includes(userTeam)) {
      // Check if user has notifications enabled
      if (userData.notificationsEnabled !== false) {
        const fcmTokens = userData.fcmTokens || [];
        tokens.push(...fcmTokens);
      }
    }
  }
  
  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * Get FCM tokens for team players with specific notification preference
 * Uses linkedTeam field on user documents
 * @param {Array} teamIds - Array of team IDs
 * @param {string} preferenceKey - Key in notificationPreferences to check
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.isGameComplete] - If true, also include users with finalScoreOnly enabled
 * @returns {Array} Array of tokens for users who want this notification type
 */
async function getTeamPlayerTokensWithPreference(teamIds, preferenceKey, options = {}) {
  const tokens = [];
  const { isGameComplete = false } = options;
  
  // Get all users with linkedTeam field
  const usersSnapshot = await db
    .collection('users')
    .where('linkedTeam', '!=', null)
    .get();
  
  // Normalize team IDs for case-insensitive matching
  const normalizedTeamIds = teamIds.map(id => id.toLowerCase());
  
  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const userTeam = userData.linkedTeam?.toLowerCase();
    
    // Check if this user is linked to one of the specified teams
    if (normalizedTeamIds.includes(userTeam)) {
      // Check quiet hours first
      if (isInQuietHours(userData.notificationPreferences?.quietHours)) {
        console.log(`Skipping ${userDoc.id} - in quiet hours`);
        continue;
      }
      
      // Check global notifications enabled AND specific preference
      // Support both 'lineupChanges' (new) and 'lineupUpdates' (legacy)
      const prefs = userData.notificationPreferences || {};
      let preferenceEnabled = false;
      
      if (preferenceKey === 'lineupChanges') {
        // Check both possible field names for lineup notifications
        preferenceEnabled = prefs.lineupChanges !== false && 
                          prefs.lineupUpdates?.enabled !== false;
      } else if (preferenceKey === 'scoreUpdates') {
        // Special handling for score updates - check finalScoreOnly
        if (prefs.scoreUpdates !== false) {
          // User wants all score updates
          preferenceEnabled = true;
        } else if (isGameComplete && prefs.finalScoreOnly === true) {
          // User only wants final scores, and this IS a final score
          preferenceEnabled = true;
          console.log(`Including ${userDoc.id} - finalScoreOnly enabled for completed game`);
        }
      } else {
        // For other preferences, check normally
        preferenceEnabled = prefs[preferenceKey] !== false;
      }
      
      if (userData.notificationsEnabled !== false && preferenceEnabled) {
        const fcmTokens = userData.fcmTokens || [];
        tokens.push(...fcmTokens);
      }
    }
  }
  
  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * Get FCM tokens for users who favorited specified teams
 * @param {Array} teamIds - Array of team IDs
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.isGameComplete] - If true, also include users with finalScoreOnly enabled
 */
async function getFavoriteTeamTokens(teamIds, options = {}) {
  const tokens = [];
  const { isGameComplete = false } = options;
  
  const usersSnapshot = await db
    .collection('users')
    .where('favoriteTeams', 'array-contains-any', teamIds.slice(0, 10)) // Firestore limit
    .get();
  
  usersSnapshot.forEach(doc => {
    const userData = doc.data();
    const prefs = userData.notificationPreferences || {};
    
    // Check if user wants score updates
    let wantsScoreUpdates = false;
    if (prefs.scoreUpdates !== false) {
      // User wants all score updates
      wantsScoreUpdates = true;
    } else if (isGameComplete && prefs.finalScoreOnly === true) {
      // User only wants final scores, and this IS a final score
      wantsScoreUpdates = true;
      console.log(`Including ${doc.id} (favorite) - finalScoreOnly enabled for completed game`);
    }
    
    if (userData.notificationsEnabled !== false && wantsScoreUpdates) {
      const fcmTokens = userData.fcmTokens || [];
      tokens.push(...fcmTokens);
    }
  });
  
  return tokens;
}

/**
 * Get all FCM tokens for users who have announcements enabled
 * @returns {Array} Array of tokens
 */
async function getAllAnnouncementTokens() {
  const tokens = [];
  
  const usersSnapshot = await db
    .collection('users')
    .where('notificationsEnabled', '==', true)
    .get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    
    // Check quiet hours
    if (isInQuietHours(userData.notificationPreferences?.quietHours)) {
      console.log(`Skipping ${userDoc.id} - in quiet hours`);
      continue;
    }
    
    // Check if user wants announcements (default true)
    if (userData.notificationPreferences?.announcements !== false) {
      const fcmTokens = userData.fcmTokens || [];
      tokens.push(...fcmTokens);
    }
  }
  
  return [...new Set(tokens)]; // Remove duplicates
}

/**
 * Send notification to multiple tokens with error handling
 */
async function sendToTokens(tokens, message) {
  if (tokens.length === 0) {
    console.log('No tokens to send to');
    return { successCount: 0, failureCount: 0 };
  }
  
  // CRITICAL: Clean and validate tokens (remove whitespace, ensure strings)
  const cleanedTokens = tokens
    .filter(token => token && typeof token === 'string') // Remove null/undefined
    .map(token => token.trim()) // Remove whitespace
    .filter(token => token.length > 0); // Remove empty strings
  
  if (cleanedTokens.length === 0) {
    console.log('No valid tokens after cleaning');
    return { successCount: 0, failureCount: 0 };
  }
  
  console.log(`Sending to ${cleanedTokens.length} tokens`);
  console.log('First token sample:', cleanedTokens[0].substring(0, 50) + '...');
  
  // CRITICAL: Ensure all data values are strings (FCM requirement)
  const sanitizedData = {};
  if (message.data) {
    Object.keys(message.data).forEach(key => {
      sanitizedData[key] = String(message.data[key]);
    });
  }
  
  // Send individually (avoid /batch endpoint 404 error)
  // Note: sendMulticast() fails with 404 on /batch endpoint
  let successCount = 0;
  let failureCount = 0;
  
  for (const token of cleanedTokens) {
    try {
      // Use individual send() instead of sendMulticast()
      const messageWithToken = {
        token: token,
        notification: message.notification,
        data: sanitizedData,  // Use sanitized data with all strings
        webpush: message.webpush
      };
      
      const messageId = await messaging.send(messageWithToken);
      console.log(`✅ Token succeeded, message ID:`, messageId.substring(0, 20) + '...');
      successCount++;
      
    } catch (error) {
      console.error(`❌ Token failed:`, error.code, error.message);
      console.error(`   Token (first 50 chars):`, token.substring(0, 50));
      failureCount++;
      
      // Log if token should be cleaned up
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log(`   Token should be removed from user profile`);
      }
    }
  }
  
  console.log(`Sent: ${successCount} success, ${failureCount} failed`);
  return { successCount, failureCount };
}

/**
 * Save notification to user's feed in Firestore
 * This allows notifications to persist and be displayed in the dashboard
 * @param {string[]} userIds - Array of user IDs to save notification for
 * @param {Object} notification - Notification details
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body text
 * @param {string} notification.type - Type: game_reminder, score_update, schedule_change, lineup_change, announcement, milestone, rsvp_reminder
 * @param {string} [notification.link] - Optional URL to navigate to when clicked
 * @param {Object} [notification.metadata] - Optional extra data (gameId, teamId, etc.)
 */
async function saveNotificationToFeed(userIds, notification) {
  if (!userIds || userIds.length === 0) {
    console.log('No users to save notification for');
    return;
  }

  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  for (const userId of userIds) {
    const notifRef = db
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .doc(); // Auto-generate ID

    batch.set(notifRef, {
      title: notification.title || 'Notification',
      body: notification.body || '',
      type: notification.type || 'announcement',
      link: notification.link || null,
      metadata: notification.metadata || {},
      read: false,
      createdAt: timestamp
    });
  }

  try {
    await batch.commit();
    console.log(`📥 Saved notification to ${userIds.length} user feeds`);
  } catch (error) {
    console.error('Error saving notifications to feed:', error);
    // Don't throw - notification feed is supplementary to push notifications
  }
}

/**
 * Get user IDs from tokens (for saving to notification feed)
 * @param {string} teamId - Team to get users for
 * @param {string} [preference] - Optional preference to check
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.isGameComplete] - If true, also include users with finalScoreOnly enabled
 * @returns {Promise<string[]>} Array of user IDs
 */
async function getTeamUserIds(teamId, preference = null, options = {}) {
  const userIds = [];
  const normalizedTeamId = teamId.charAt(0).toUpperCase() + teamId.slice(1).toLowerCase();
  const { isGameComplete = false } = options;
  
  const usersSnapshot = await db
    .collection('users')
    .where('linkedTeam', 'in', [teamId, teamId.toLowerCase(), normalizedTeamId])
    .get();

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    
    // Check if user has notifications enabled
    if (userData.notificationsEnabled === false) continue;
    
    // Check quiet hours
    if (isInQuietHours(userData.notificationPreferences?.quietHours)) continue;
    
    // Check specific preference if provided
    if (preference) {
      const prefs = userData.notificationPreferences || {};
      let prefEnabled = false;
      
      if (preference === 'scoreUpdates') {
        // Special handling for score updates - check finalScoreOnly
        if (prefs.scoreUpdates !== false) {
          prefEnabled = true;
        } else if (isGameComplete && prefs.finalScoreOnly === true) {
          prefEnabled = true;
        }
      } else {
        prefEnabled = prefs[preference] !== false;
      }
      
      if (!prefEnabled) continue;
    }
    
    userIds.push(userDoc.id);
  }
  
  return userIds;
}

/**
 * Get user IDs who receive announcements (for saving to notification feed)
 * @returns {Promise<string[]>} Array of user IDs
 */
async function getAnnouncementUserIds() {
  const userIds = [];
  
  const usersSnapshot = await db
    .collection('users')
    .where('notificationsEnabled', '==', true)
    .get();

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    
    // Check quiet hours
    if (isInQuietHours(userData.notificationPreferences?.quietHours)) {
      continue;
    }
    
    // Check if user wants announcements (default true)
    if (userData.notificationPreferences?.announcements !== false) {
      userIds.push(userDoc.id);
    }
  }
  
  return userIds;
}

// ============================================================================
// 1. LINEUP CHANGES (Triggered when lineup is updated)
// ============================================================================

exports.sendLineupChange = functions.firestore
  .document('seasons/{seasonId}/games/{gameId}/lineups/{teamId}')
  .onWrite(async (change, context) => {
    const seasonId = context.params.seasonId;
    const gameId = context.params.gameId;
    const teamId = context.params.teamId;
    
    // Get the lineup data
    const after = change.after.exists ? change.after.data() : null;
    
    if (!after) {
      console.log('Lineup deleted - no notification needed');
      return null;
    }
    
    console.log(`📋 Lineup changed for ${teamId} in game ${gameId}`);
    
    // Get the game details
    const gameDoc = await db
      .collection('seasons')
      .doc(seasonId)
      .collection('games')
      .doc(gameId)
      .get();
    
    if (!gameDoc.exists) {
      console.log('Game not found');
      return null;
    }
    
    const game = gameDoc.data();
    
    // Get tokens for this team (only those who want lineup notifications)
    const tokens = await getTeamPlayerTokensWithPreference([teamId], 'lineupChanges');
    
    if (tokens.length === 0) {
      console.log('No tokens to notify');
      return null;
    }
    
    // Format team name
    const teamName = teamId.charAt(0).toUpperCase() + teamId.slice(1);
    
    // Determine if this is a playoff game
    const isPlayoff = isPlayoffGame(gameId);
    const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
    
    // Determine opponent
    const opponent = game.homeTeamId === teamId ? game.awayTeamName : game.homeTeamName;
    
    const message = {
      notification: {
        title: `📋 ${teamName} Lineup Posted`,
        body: `${gameTypeEmoji}Lineup is set for the game vs ${opponent}. Check your position!`
      },
      data: {
        type: 'lineup_change',
        seasonId: seasonId,
        gameId: gameId,
        teamId: teamId,
        isPlayoff: String(isPlayoff),
        clickAction: `/roster-management.html?game=${gameId}`
      },
      webpush: {
        fcmOptions: {
          link: `/roster-management.html?game=${gameId}`
        }
      }
    };
    
    await sendToTokens(tokens, message);
    
    // Save to notification feed for users on this team
    const userIds = await getTeamUserIds(teamId, 'lineupChanges');
    await saveNotificationToFeed(userIds, {
      title: message.notification.title,
      body: message.notification.body,
      type: 'lineup_change',
      link: `/roster-management.html?game=${gameId}`,
      metadata: { seasonId, gameId, teamId, isPlayoff }
    });
    
    return null;
  });

// ============================================================================
// 2. SCORE UPDATES (Triggered when game score changes)
// ============================================================================

exports.sendScoreUpdate = functions.firestore
  .document('seasons/{seasonId}/games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const seasonId = context.params.seasonId;
    const gameId = context.params.gameId;
    
    // Only send notification if score changed
    if (before.homeScore === after.homeScore && before.awayScore === after.awayScore) {
      return null;
    }
    
    // Check if this was a game completion (winner now set)
    const isGameComplete = !before.winner && after.winner;
    
    console.log(`⚾ Score update: ${after.homeTeamName} ${after.homeScore} - ${after.awayTeamName} ${after.awayScore}${isGameComplete ? ' (FINAL)' : ''}`);
    
    // Get tokens for both teams - pass isGameComplete to include finalScoreOnly users
    const teamTokens = await getTeamPlayerTokensWithPreference(
      [after.homeTeamId, after.awayTeamId], 
      'scoreUpdates',
      { isGameComplete }
    );
    
    // Also get tokens for users who favorited these teams
    const favoriteTokens = await getFavoriteTeamTokens(
      [after.homeTeamId, after.awayTeamId],
      { isGameComplete }
    );
    
    const allTokens = [...new Set([...teamTokens, ...favoriteTokens])];
    
    if (allTokens.length === 0) {
      console.log('No tokens to notify');
      return null;
    }
    
    // Determine if this is a playoff game
    const isPlayoff = isPlayoffGame(gameId);
    const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
    
    let title, body;
    
    if (isGameComplete) {
      const winnerName = after.winner.charAt(0).toUpperCase() + after.winner.slice(1);
      title = `${gameTypeEmoji}⚾ Final Score`;
      body = `${after.homeTeamName} ${after.homeScore} - ${after.awayTeamName} ${after.awayScore}. ${winnerName} wins!`;
    } else {
      title = `${gameTypeEmoji}⚾ Score Update`;
      body = `${after.homeTeamName} ${after.homeScore} - ${after.awayTeamName} ${after.awayScore}`;
    }
    
    const message = {
      notification: { title, body },
      data: {
        type: 'score_update',
        seasonId: seasonId,
        gameId: gameId,
        homeScore: String(after.homeScore),
        awayScore: String(after.awayScore),
        isComplete: String(isGameComplete),
        isPlayoff: String(isPlayoff),
        clickAction: `/game-tracker.html?game=${gameId}`
      },
      webpush: {
        fcmOptions: {
          link: `/game-tracker.html?game=${gameId}`
        }
      }
    };
    
    await sendToTokens(allTokens, message);
    
    // Save to notification feed for users on both teams - pass isGameComplete
    const homeUserIds = await getTeamUserIds(after.homeTeamId, 'scoreUpdates', { isGameComplete });
    const awayUserIds = await getTeamUserIds(after.awayTeamId, 'scoreUpdates', { isGameComplete });
    const allUserIds = [...new Set([...homeUserIds, ...awayUserIds])];
    
    await saveNotificationToFeed(allUserIds, {
      title,
      body,
      type: 'score_update',
      link: `/game-tracker.html?game=${gameId}`,
      metadata: { seasonId, gameId, homeScore: after.homeScore, awayScore: after.awayScore, isComplete: isGameComplete, isPlayoff }
    });
    
    return null;
  });

// ============================================================================
// 3. PLAYER MILESTONES (Triggered when player stats update)
// ============================================================================

exports.checkPlayerMilestone = functions.firestore
  .document('aggregatedPlayerStats/{playerId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const playerId = context.params.playerId;
    
    // Check for milestone thresholds
    const milestones = [];
    
    // Hits milestones
    const hitsMilestones = [50, 100, 150, 200, 250, 300];
    for (const milestone of hitsMilestones) {
      if ((before.career?.hits || 0) < milestone && (after.career?.hits || 0) >= milestone) {
        milestones.push({
          type: 'hits',
          value: milestone,
          stat: after.career.hits
        });
      }
    }
    
    // Runs milestones
    const runsMilestones = [25, 50, 75, 100, 150, 200];
    for (const milestone of runsMilestones) {
      if ((before.career?.runs || 0) < milestone && (after.career?.runs || 0) >= milestone) {
        milestones.push({
          type: 'runs',
          value: milestone,
          stat: after.career.runs
        });
      }
    }
    
    // Games milestones
    const gamesMilestones = [25, 50, 75, 100, 150];
    for (const milestone of gamesMilestones) {
      if ((before.career?.games || 0) < milestone && (after.career?.games || 0) >= milestone) {
        milestones.push({
          type: 'games',
          value: milestone,
          stat: after.career.games
        });
      }
    }
    
    if (milestones.length === 0) {
      return null;
    }
    
    const playerName = after.playerName || after.name || 'Unknown Player';
    const currentTeam = after.currentTeam || after.team || null;
    
    console.log(`🎯 Milestone reached for ${playerName}: ${milestones.map(m => `${m.value} ${m.type}`).join(', ')}`);
    
    // Get current season for activity feed
    const currentSeason = await getCurrentSeason();
    const seasonId = currentSeason?.id || null;
    
    // Process each milestone
    for (const milestone of milestones) {
      const milestoneDocId = `${playerId}_${milestone.type}_${milestone.value}`;
      
      // Check if this milestone was already awarded (prevents duplicates on re-runs)
      const existingMilestone = await db.collection('milestones').doc(milestoneDocId).get();
      
      if (!existingMilestone.exists) {
        // Create milestone document - this triggers onMilestoneReached for activity feed
        await db.collection('milestones').doc(milestoneDocId).set({
          playerId: playerId,
          playerName: playerName,
          playerLegacyId: after.legacyId || playerId,
          teamId: currentTeam?.toLowerCase() || null,
          teamName: currentTeam || null,
          type: milestone.type,
          value: milestone.value,
          currentStat: milestone.stat,
          seasonId: seasonId,
          achievedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`📝 Created milestone document: ${milestoneDocId}`);
      } else {
        console.log(`⏭️ Milestone ${milestoneDocId} already exists, skipping`);
      }
    }
    
    // Get the player's user account if linked (for push notification)
    const playerNameForSearch = after.playerName || after.name || '';
    
    let userDoc = null;
    let userId = null;
    
    // Check if the playerId IS a user ID (auth-based player)
    const directUserDoc = await db.collection('users').doc(playerId).get();
    if (directUserDoc.exists && directUserDoc.data().linkedPlayer) {
      userDoc = directUserDoc;
      userId = playerId;
    } else {
      // Otherwise search for user with linkedPlayer matching this player's name
      const usersSnapshot = await db
        .collection('users')
        .where('linkedPlayer', '==', playerNameForSearch)
        .limit(1)
        .get();
      
      if (!usersSnapshot.empty) {
        userDoc = usersSnapshot.docs[0];
        userId = userDoc.id;
      }
    }
    
    // If no linked user, we still created the milestone doc for activity feed
    if (!userDoc || !userDoc.exists) {
      console.log('Player not linked to user account - milestone recorded but no push notification');
      return null;
    }
    
    const userData = userDoc.data();
    
    // Check notification preferences
    if (userData.notificationsEnabled === false || 
        userData.notificationPreferences?.milestones === false) {
      console.log('User has milestones notifications disabled');
      return null;
    }
    
    const fcmTokens = userData.fcmTokens || [];
    if (fcmTokens.length === 0) {
      console.log('User has no FCM tokens');
      return null;
    }
    
    // Send push notification for each milestone
    for (const milestone of milestones) {
      const message = {
        notification: {
          title: `🎯 Milestone Reached!`,
          body: `Congratulations! You've reached ${milestone.value} career ${milestone.type}!`
        },
        data: {
          type: 'milestone',
          playerId: playerId,
          milestoneType: milestone.type,
          milestoneValue: String(milestone.value),
          currentStat: String(milestone.stat),
          clickAction: `/player.html?id=${playerId}`
        },
        webpush: {
          fcmOptions: {
            link: `/player.html?id=${playerId}`
          }
        }
      };
      
      await sendToTokens(fcmTokens, message);
      
      // Save to notification feed for this user
      await saveNotificationToFeed([userId], {
        title: message.notification.title,
        body: message.notification.body,
        type: 'milestone',
        link: `/player.html?id=${playerId}`,
        metadata: { playerId, milestoneType: milestone.type, milestoneValue: milestone.value }
      });
    }
    
    return null;
  });

// ============================================================================
// 4. GAME REMINDERS (Scheduled function - runs daily at 9 AM)
// ============================================================================

exports.sendGameReminders = functions.pubsub
  .schedule('0 9 * * *')  // 9 AM daily
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('⏰ Running daily game reminders...');
    
    // Get current season
    const currentSeason = await getCurrentSeason();
    if (!currentSeason) {
      console.log('No active season');
      return null;
    }
    
    // Get games for tomorrow using ET midnight boundaries to avoid UTC day-shift
    // (e.g. an 8:45 PM ET game is 00:45 UTC next day — UTC-midnight queries would miss it)
    const now = new Date();
    const etDateStr = now.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }); // "MM/DD/YYYY"
    const [etM, etD, etY] = etDateStr.split('/').map(Number);

    function etMidnightUTC(y, m, d) {
      const date = new Date(y, m - 1, d); // JS handles month/day overflow automatically
      const month = date.getMonth() + 1;
      const isDST = month >= 3 && month <= 11; // EDT March–November, EST otherwise
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), isDST ? 4 : 5));
    }

    const tomorrow = etMidnightUTC(etY, etM, etD + 1);
    const dayAfter  = etMidnightUTC(etY, etM, etD + 2);
    
    console.log(`Looking for games between ${tomorrow.toISOString()} and ${dayAfter.toISOString()}`);
    
    // Query games for tomorrow
    const gamesSnapshot = await db
      .collection('seasons')
      .doc(currentSeason.id)
      .collection('games')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(tomorrow))
      .where('date', '<', admin.firestore.Timestamp.fromDate(dayAfter))
      .get();
    
    if (gamesSnapshot.empty) {
      console.log('No games scheduled for tomorrow');
      return null;
    }
    
    console.log(`Found ${gamesSnapshot.size} games for tomorrow`);
    
    // Send reminders for each game
    for (const gameDoc of gamesSnapshot.docs) {
      const game = gameDoc.data();
      const gameId = gameDoc.id;
      
      console.log(`Processing game: ${game.homeTeamName} vs ${game.awayTeamName}`);
      
      // Get tokens for both teams
      const tokens = await getTeamPlayerTokensWithPreference(
        [game.homeTeamId, game.awayTeamId], 
        'gameReminders'
      );
      
      if (tokens.length === 0) {
        console.log('No tokens for this game');
        continue;
      }
      
        // Format game time
              const gameDate = game.date.toDate();
              const timeString = formatGameTime(gameDate);  // NOW USES EASTERN TIME CONVERSION

              // Determine if this is a playoff game
              const isPlayoff = isPlayoffGame(gameId);
              const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
              
              // Format the date
              const dateString = gameDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: 'America/New_York'
              });

              const message = {
                  notification: {
                  title: '⏰ Game Tomorrow!',
                  body: `${gameTypeEmoji}${game.homeTeamName} vs ${game.awayTeamName} - ${dateString} at ${timeString}`
                },
                  data: {
                  type: 'game_reminder',
                  seasonId: currentSeason.id,
                  gameId: gameDoc.id,
                  isPlayoff: String(isPlayoff),
                  clickAction: `/roster-management.html?game=${gameDoc.id}`
                },
                  webpush: {
          fcmOptions: {
            link: `/roster-management.html?game=${gameDoc.id}`
          }
        }
      };
      
      await sendToTokens(tokens, message);
      
      // Save to notification feed for users on both teams
      const homeUserIds = await getTeamUserIds(game.homeTeamId, 'gameReminders');
      const awayUserIds = await getTeamUserIds(game.awayTeamId, 'gameReminders');
      const allUserIds = [...new Set([...homeUserIds, ...awayUserIds])];
      
      await saveNotificationToFeed(allUserIds, {
        title: message.notification.title,
        body: message.notification.body,
        type: 'game_reminder',
        link: `/roster-management.html?game=${gameDoc.id}`,
        metadata: { seasonId: currentSeason.id, gameId: gameDoc.id, isPlayoff }
      });
    }
    
    return null;
  });

// ============================================================================
// 5. RSVP REMINDERS (Runs twice daily for upcoming games)
// ============================================================================

exports.sendRsvpReminders = functions.pubsub
  .schedule('0 10,18 * * *')  // 10 AM and 6 PM daily
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('📋 Checking for RSVP reminders...');
    
    const currentSeason = await getCurrentSeason();
    if (!currentSeason) {
      console.log('No active season');
      return null;
    }
    
    // Get games in the next 3 days
    const now = new Date();
    const threeDaysOut = new Date(now);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    
    const gamesSnapshot = await db
      .collection('seasons')
      .doc(currentSeason.id)
      .collection('games')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(now))
      .where('date', '<', admin.firestore.Timestamp.fromDate(threeDaysOut))
      .get();
    
    if (gamesSnapshot.empty) {
      console.log('No upcoming games in next 3 days');
      return null;
    }
    
    console.log(`Found ${gamesSnapshot.size} games in next 3 days`);
    
    for (const gameDoc of gamesSnapshot.docs) {
      const game = gameDoc.data();
      const gameId = gameDoc.id;
      
      console.log(`Processing RSVPs for: ${game.homeTeamName || game.homeTeam} vs ${game.awayTeamName || game.awayTeam}`);
      
      // Get all RSVPs for this game
      const rsvpsSnapshot = await db
        .collection('rsvps')
        .doc(gameId)
        .collection('responses')
        .get();
      
      const rsvpdUserIds = new Set();
      rsvpsSnapshot.forEach(doc => {
        const data = doc.data();
        // Only count "yes" or "no" as valid RSVPs - "none" means they haven't committed
        if (data.status === 'yes' || data.status === 'no') {
          rsvpdUserIds.add(doc.id);
        }
      });
      
      console.log(`${rsvpdUserIds.size} players have RSVP'd (yes/no)`);
      
      // Get all users with linkedTeam matching either team
      // Normalize team IDs for case-insensitive matching
      const teamIds = [game.homeTeamId, game.awayTeamId].filter(Boolean);
      const normalizedTeamIds = teamIds.map(id => id?.toLowerCase());
      
      const usersSnapshot = await db
        .collection('users')
        .where('linkedTeam', '!=', null)
        .get();
      
      // Find players who haven't RSVP'd
      const needsRSVP = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const userTeam = userData.linkedTeam?.toLowerCase();
        
        // Skip if not on either team
        if (!normalizedTeamIds.includes(userTeam)) {
          continue;
        }
        
        // Skip if already RSVP'd (yes or no)
        if (rsvpdUserIds.has(userId)) {
          continue;
        }
        
        // Check quiet hours
        if (isInQuietHours(userData.notificationPreferences?.quietHours)) {
          console.log(`Skipping ${userId} - in quiet hours`);
          continue;
        }
        
        // Check if user wants RSVP reminders
        if (userData.notificationsEnabled !== false && 
            userData.notificationPreferences?.rsvpReminders !== false) {
          const fcmTokens = userData.fcmTokens || [];
          if (fcmTokens.length > 0) {
            needsRSVP.push({
              userId,
              tokens: fcmTokens,
              playerName: userData.linkedPlayer || userData.displayName
            });
          }
        }
      }
      
      console.log(`${needsRSVP.length} players need RSVP reminder`);
      
      if (needsRSVP.length === 0) {
        continue;
      }
      
      // Calculate game timing for message
      const gameDate = game.date.toDate();
      const now = new Date();
      
      // Compare calendar dates in Eastern time
      const gameDay = new Date(gameDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      
      // Reset to midnight for date comparison
      gameDay.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.round((gameDay - today) / (1000 * 60 * 60 * 24));
      
      let timeText;
      if (daysDiff === 0) {
        timeText = 'today';
      } else if (daysDiff === 1) {
        timeText = 'tomorrow';
      } else {
        timeText = `in ${daysDiff} days`;
      }
      
      // Determine if this is a playoff game
      const isPlayoff = isPlayoffGame(gameId);
      const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
      
      // Send reminders
      for (const player of needsRSVP) {
        const message = {
          notification: {
            title: '📋 RSVP Reminder',
            body: `${gameTypeEmoji}Don't forget to RSVP for ${game.homeTeamName || game.homeTeam} vs ${game.awayTeamName || game.awayTeam} ${timeText}!`
          },
          data: {
            type: 'rsvp_reminder',
            seasonId: currentSeason.id,
            gameId: gameId,
            isPlayoff: String(isPlayoff),
            clickAction: `/roster-management.html?game=${gameId}`
          },
          webpush: {
            fcmOptions: {
              link: `/roster-management.html?game=${gameId}`
            }
          }
        };
        
        await sendToTokens(player.tokens, message);
        
        // Save to notification feed for this specific user
        await saveNotificationToFeed([player.userId], {
          title: message.notification.title,
          body: message.notification.body,
          type: 'rsvp_reminder',
          link: `/roster-management.html?game=${gameId}`,
          metadata: { seasonId: currentSeason.id, gameId, isPlayoff }
        });
      }
    }
    
    return null;
  });


// ============================================================================
// CAPTAIN LOW RSVP ALERT (Runs twice daily - checks games within 24-36 hours)
// Notifies captains when their team doesn't have enough confirmed players
// ============================================================================

exports.sendCaptainRsvpAlerts = functions.pubsub
  .schedule('0 9,18 * * *')  // 9 AM and 6 PM daily
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('👨‍✈️ Checking for captain RSVP alerts...');
    
    const currentSeason = await getCurrentSeason();
    if (!currentSeason) {
      console.log('No active season');
      return null;
    }
    
    // Minimum players needed to field a team (configurable)
    const MIN_PLAYERS_NEEDED = 8;
    
    // Get games in the next 24-36 hours
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(tomorrow.getHours() + 36); // 36 hours out
    
    const gamesSnapshot = await db
      .collection('seasons')
      .doc(currentSeason.id)
      .collection('games')
      .where('date', '>=', admin.firestore.Timestamp.fromDate(now))
      .where('date', '<', admin.firestore.Timestamp.fromDate(tomorrow))
      .get();
    
    if (gamesSnapshot.empty) {
      console.log('No games in next 36 hours');
      return null;
    }
    
    console.log(`Found ${gamesSnapshot.size} games in next 36 hours`);
    
    for (const gameDoc of gamesSnapshot.docs) {
      const game = gameDoc.data();
      const gameId = gameDoc.id;
      
      // Skip if already completed
      if (game.winner || game.status === 'completed') {
        continue;
      }
      
      console.log(`Checking RSVPs for: ${game.homeTeamName || game.homeTeam} vs ${game.awayTeamName || game.awayTeam}`);
      
      // Get all RSVPs for this game
      const rsvpsSnapshot = await db
        .collection('rsvps')
        .doc(gameId)
        .collection('responses')
        .get();
      
      // Count "Yes" RSVPs by team
      const yesCountByTeam = {};
      const homeTeamId = (game.homeTeamId || game.homeTeam || '').toLowerCase();
      const awayTeamId = (game.awayTeamId || game.awayTeam || '').toLowerCase();
      
      yesCountByTeam[homeTeamId] = 0;
      yesCountByTeam[awayTeamId] = 0;
      
      rsvpsSnapshot.forEach(doc => {
        const rsvp = doc.data();
        if (rsvp.status === 'yes') {
          const teamId = (rsvp.teamId || '').toLowerCase();
          if (teamId === homeTeamId) {
            yesCountByTeam[homeTeamId]++;
          } else if (teamId === awayTeamId) {
            yesCountByTeam[awayTeamId]++;
          }
        }
      });
      
      console.log(`RSVP Yes counts - ${homeTeamId}: ${yesCountByTeam[homeTeamId]}, ${awayTeamId}: ${yesCountByTeam[awayTeamId]}`);
      
      // Format game date for message
      const gameDate = game.date.toDate();
      const dateText = gameDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York'
      });
      
      // Check each team and alert captains if needed
      const teamsToAlert = [
        { teamId: homeTeamId, teamName: game.homeTeamName || game.homeTeam, yesCount: yesCountByTeam[homeTeamId] },
        { teamId: awayTeamId, teamName: game.awayTeamName || game.awayTeam, yesCount: yesCountByTeam[awayTeamId] }
      ];
      
      for (const team of teamsToAlert) {
        if (team.yesCount >= MIN_PLAYERS_NEEDED) {
          console.log(`${team.teamName} has enough players (${team.yesCount})`);
          continue;
        }
        
        console.log(`⚠️ ${team.teamName} is short! Only ${team.yesCount} confirmed`);
        
        // Find captain(s) for this team
        const captainsSnapshot = await db
          .collection('users')
          .where('isCaptain', '==', true)
          .get();
        
        const teamCaptains = [];
        for (const captainDoc of captainsSnapshot.docs) {
          const captainData = captainDoc.data();
          const captainTeam = (captainData.linkedTeam || '').toLowerCase();
          
          // Match captain to team
          if (captainTeam === team.teamId) {
            // Check notifications enabled and quiet hours
            if (captainData.notificationsEnabled !== false &&
                !isInQuietHours(captainData.notificationPreferences?.quietHours)) {
              
              // Check if captain has opted out of these alerts
              if (captainData.notificationPreferences?.captainRsvpAlerts === false) {
                console.log(`Captain ${captainDoc.id} has opted out of RSVP alerts`);
                continue;
              }
              
              const fcmTokens = captainData.fcmTokens || [];
              if (fcmTokens.length > 0) {
                teamCaptains.push({
                  userId: captainDoc.id,
                  tokens: fcmTokens,
                  name: captainData.displayName || captainData.linkedPlayer || 'Captain'
                });
              }
            }
          }
        }
        
        if (teamCaptains.length === 0) {
          console.log(`No captains found for ${team.teamName} with notifications enabled`);
          continue;
        }
        
        console.log(`Alerting ${teamCaptains.length} captain(s) for ${team.teamName}`);
        
        // Determine opponent
        const opponent = team.teamId === homeTeamId
          ? (game.awayTeamName || game.awayTeam)
          : (game.homeTeamName || game.homeTeam);
        
        // Determine urgency
        const isUrgent = team.yesCount < 7;
        const emoji = isUrgent ? '🚨' : '⚠️';
        const needed = MIN_PLAYERS_NEEDED - team.yesCount;
        
        // Send alert to each captain
        for (const captain of teamCaptains) {
          const message = {
            notification: {
              title: `${emoji} Low RSVP Alert`,
              body: `Only ${team.yesCount} confirmed for ${dateText} game vs ${opponent}. Need ${needed} more to field a full team!`
            },
            data: {
              type: 'captain_rsvp_alert',
              seasonId: currentSeason.id,
              gameId: gameId,
              teamId: team.teamId,
              yesCount: String(team.yesCount),
              clickAction: `/roster-management.html?team=${team.teamId}&game=${gameId}`
            },
            webpush: {
              fcmOptions: {
                link: `/roster-management.html?team=${team.teamId}&game=${gameId}`
              }
            }
          };
          
          await sendToTokens(captain.tokens, message);
          
          // Save to notification feed
          await saveNotificationToFeed([captain.userId], {
            title: message.notification.title,
            body: message.notification.body,
            type: 'captain_rsvp_alert',
            link: `/roster-management.html?team=${team.teamId}&game=${gameId}`,
            metadata: {
              seasonId: currentSeason.id,
              gameId,
              teamId: team.teamId,
              yesCount: team.yesCount,
              needed: needed
            }
          });
        }
      }
    }
    
    console.log('👨‍✈️ Captain RSVP alerts complete');
    return null;
  });
// ============================================================================
// 6. SCHEDULE CHANGES (Triggered when game schedule details change)
// ============================================================================
// 2026+ UPDATE: Now triggers on games collection instead of previews subcollection
// All game data (schedule, scores, preview) is now in unified game documents

exports.sendScheduleChange = functions.firestore
  .document('seasons/{seasonId}/games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const seasonId = context.params.seasonId;
    const gameId = context.params.gameId;
    
    // 2026+ UPDATE: Get team info directly from the game document (no separate fetch needed)
    const game = after;
    
    // Helper function to convert 24-hour time to 12-hour format
    function formatTime12Hour(timeStr) {
      if (!timeStr || timeStr === 'TBD') return timeStr;
      
      // Check if already in 12-hour format (contains AM/PM)
      if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
        return timeStr;
      }
      
      // Try to parse 24-hour format (e.g., "18:00" or "18:30")
      const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
      }
      
      return timeStr;
    }
    
    // Helper function to format dates and timestamps
    function formatValue(value) {
      if (!value) return 'TBD';
      
      // Check if it's a Firestore Timestamp
      if (value && typeof value.toDate === 'function') {
        try {
          const date = value.toDate();
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/New_York'
          });
        } catch (error) {
          console.error('Error formatting timestamp:', error);
          return 'TBD';
        }
      }
      
      // If it's already a string, return it
      return String(value);
    }
    
    // Check what changed - ONLY schedule-related fields (not scores or preview text)
    const changes = [];
    
    // Date changed (handle both Timestamp objects and strings)
    const beforeDateStr = JSON.stringify(before.date);
    const afterDateStr = JSON.stringify(after.date);
    if (beforeDateStr !== afterDateStr) {
      changes.push(`Date: ${formatValue(before.date)} → ${formatValue(after.date)}`);
    }
    
    // Time changed
    if (before.time !== after.time) {
      changes.push(`Time: ${formatTime12Hour(before.time) || 'TBD'} → ${formatTime12Hour(after.time) || 'TBD'}`);
    }
    
    // Location changed
    if (before.location !== after.location) {
      changes.push(`Location: ${formatValue(before.location)} → ${formatValue(after.location)}`);
    }
    
    // Field changed
    if (before.field !== after.field) {
      changes.push(`Field: ${formatValue(before.field)} → ${formatValue(after.field)}`);
    }
    
    // Opponent changed (rare but possible)
    if (before.homeTeamId !== after.homeTeamId || before.awayTeamId !== after.awayTeamId) {
      changes.push(`Matchup changed`);
    }
    
    // If nothing schedule-related changed, don't send notification
    // (This prevents notifications for score updates, preview text, etc.)
    if (changes.length === 0) {
      return null;
    }
    
    // Get team names (support both naming conventions)
    const homeTeamName = game.homeTeamName || game["home team"] || game.homeTeamId || 'Home';
    const awayTeamName = game.awayTeamName || game["away team"] || game.awayTeamId || 'Away';
    
    console.log(`📅 Schedule changed for ${homeTeamName} vs ${awayTeamName}: ${changes.join(', ')}`);
    
    // Get tokens for both teams (only those who want schedule change notifications)
    const tokens = await getTeamPlayerTokensWithPreference(
      [game.homeTeamId, game.awayTeamId], 
      'scheduleChanges'
    );
    
    if (tokens.length === 0) {
      console.log('No tokens to notify');
      return null;
    }
    
    // Determine if this is a playoff game
    const isPlayoff = isPlayoffGame(gameId);
    const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
    
    const message = {
      notification: {
        title: '📅 Game Schedule Changed',
        body: `${gameTypeEmoji}${homeTeamName} vs ${awayTeamName} - ${changes[0]}`
      },
      data: {
        type: 'schedule_change',
        seasonId: seasonId,
        gameId: gameId,
        changes: changes.join('; '),
        isPlayoff: String(isPlayoff),
        clickAction: `/roster-management.html?game=${gameId}`
      },
      webpush: {
        fcmOptions: {
          link: `/roster-management.html?game=${gameId}`
        }
      }
    };
    
    await sendToTokens(tokens, message);
    
    // Save to notification feed for users on both teams
    const homeUserIds = await getTeamUserIds(game.homeTeamId, 'scheduleChanges');
    const awayUserIds = await getTeamUserIds(game.awayTeamId, 'scheduleChanges');
    const allUserIds = [...new Set([...homeUserIds, ...awayUserIds])];
    
    await saveNotificationToFeed(allUserIds, {
      title: message.notification.title,
      body: message.notification.body,
      type: 'schedule_change',
      link: `/roster-management.html?game=${gameId}`,
      metadata: { seasonId, gameId, changes: changes.join('; '), isPlayoff }
    });
    
    return null;
  });

// ============================================================================
// 7. LEAGUE ANNOUNCEMENTS (Callable function for admins)
// ============================================================================

/**
 * Send a league-wide announcement
 * Callable by admins and league staff only
 * 
 * @param {Object} data - { title, body, link?, priority? }
 * @param {Object} context - Firebase callable context
 */
exports.sendAnnouncement = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to send announcements.'
    );
  }
  
  const userId = context.auth.uid;
  
  // Verify admin, league-staff, or captain role
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'User profile not found.'
    );
  }
  
  const userData = userDoc.data();
  const userRole = userData.role || userData.userRole || 'fan';
  const isCaptain = userData.isCaptain === true || userRole === 'captain';
  const allowedRoles = ['admin', 'league-staff'];
  
  // Captains can send, but only to specific recipients (enforced below)
  if (!allowedRoles.includes(userRole) && !isCaptain) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins, league staff, and captains can send announcements.'
    );
  }
  
  // Validate required fields
  const { title, body, link, priority, recipientUserIds } = data;
  
  // Captains MUST specify recipients (can't send to everyone)
  if (isCaptain && !allowedRoles.includes(userRole) && (!recipientUserIds || recipientUserIds.length === 0)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Captains must specify recipients.'
    );
  }
  
  if (!title || !body) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Title and body are required.'
    );
  }
  
  if (title.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Title must be 100 characters or less.'
    );
  }
  
  if (body.length > 500) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Body must be 500 characters or less.'
    );
  }
  
  console.log(`📢 Sending announcement from ${userData.displayName || userId}: "${title}"`);
  
  // Get tokens based on whether specific recipients are provided
  let tokens = [];
  let targetUserIds = [];
  
  if (recipientUserIds && recipientUserIds.length > 0) {
    // Send to specific users only
    console.log(`Filtering to ${recipientUserIds.length} specific recipients`);
    targetUserIds = recipientUserIds;
    
    // Get tokens for specific users
    for (const recipientId of recipientUserIds) {
      const recipientDoc = await db.collection('users').doc(recipientId).get();
      if (!recipientDoc.exists) continue;
      
      const recipientData = recipientDoc.data();
      
      // Check if user has notifications enabled and wants announcements
      if (recipientData.notificationsEnabled !== false && 
          recipientData.notificationPreferences?.announcements !== false) {
        const fcmTokens = recipientData.fcmTokens || [];
        tokens.push(...fcmTokens);
      }
    }
  } else {
    // Send to all users with announcements enabled (league-wide)
    console.log('Sending to all users with announcements enabled');
    tokens = await getAllAnnouncementTokens();
    targetUserIds = await getAnnouncementUserIds();
  }
  
  if (tokens.length === 0) {
    console.log('No tokens to notify');
    return { 
      success: true, 
      message: 'Announcement created but no users to notify.',
      recipientCount: 0 
    };
  }
  
  console.log(`Found ${tokens.length} tokens to notify`);
  
  // Determine click action
  const clickAction = link || '/index.html';
  
  // Determine emoji based on priority
  let emoji = '📢';
  if (priority === 'urgent') {
    emoji = '🚨';
  } else if (priority === 'info') {
    emoji = 'ℹ️';
  }
  
  const message = {
    notification: {
      title: `${emoji} ${title}`,
      body: body
    },
    data: {
      type: 'announcement',
      priority: priority || 'normal',
      sentBy: userId,
      sentByName: userData.displayName || 'League Admin',
      timestamp: new Date().toISOString(),
      clickAction: clickAction
    },
    webpush: {
      fcmOptions: {
        link: clickAction
      }
    }
  };
  
  const result = await sendToTokens(tokens, message);
  
  // Save to notification feed for targeted users only
  try {
    await saveNotificationToFeed(targetUserIds, {
      title: `${emoji} ${title}`,
      body: body,
      type: 'announcement',
      link: clickAction,
      metadata: { sentBy: userId, sentByName: userData.displayName || 'League Admin', priority: priority || 'normal' }
    });
  } catch (feedErr) {
    console.error('⚠️ Failed to save to notification feeds:', feedErr.message);
  }

  // Log the announcement to Firestore for history
  try {
    await db.collection('announcements').add({
      title: title,
      body: body,
      link: link || null,
      priority: priority || 'normal',
      sentBy: userId,
      sentByName: userData.displayName || 'League Admin',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      recipientCount: result.successCount,
      failureCount: result.failureCount,
      targetedUserCount: targetUserIds.length,
      wasFiltered: !!(recipientUserIds && recipientUserIds.length > 0)
    });
  } catch (firestoreErr) {
    console.error('⚠️ Failed to log announcement to Firestore:', firestoreErr.message);
  }
  
  console.log(`✅ Announcement sent: ${result.successCount} success, ${result.failureCount} failed (targeted ${targetUserIds.length} users)`);
  
  return {
    success: true,
    message: `Announcement sent to ${result.successCount} of ${targetUserIds.length} targeted users.`,
    recipientCount: result.successCount,
    failureCount: result.failureCount,
    targetedUserCount: targetUserIds.length
  };
});

// ============================================================================
// 7b. UNSEND ANNOUNCEMENT (Remove from all notification feeds)
// ============================================================================

/**
 * Unsend/recall an announcement - removes from all user notification feeds
 * Callable by admins and league staff only
 * 
 * @param {Object} data - { announcementId, title? } - ID from announcements collection
 * @param {Object} context - Firebase callable context
 */
exports.unsendAnnouncement = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to unsend announcements.'
    );
  }
  
  const userId = context.auth.uid;
  
  // Verify admin or league-staff role
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'User profile not found.'
    );
  }
  
  const userData = userDoc.data();
  const userRole = userData.role || userData.userRole || 'fan';
  const allowedRoles = ['admin', 'league-staff'];
  
  if (!allowedRoles.includes(userRole)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins and league staff can unsend announcements.'
    );
  }
  
  const { announcementId, title } = data;
  
  if (!announcementId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Announcement ID is required.'
    );
  }
  
  console.log(`🗑️ Unsending announcement ${announcementId} by ${userData.displayName || userId}`);
  
  // Get all users and delete matching notifications from their feeds
  const usersSnapshot = await db.collection('users').get();
  
  let deletedCount = 0;
  const batch = db.batch();
  let batchCount = 0;
  const MAX_BATCH = 500; // Firestore batch limit
  
  for (const userDoc of usersSnapshot.docs) {
    // Query this user's notifications for matching announcement
    const notificationsRef = db.collection('users').doc(userDoc.id).collection('notifications');
    
    // Match by title if provided, otherwise we need the exact notification ID
    let matchQuery;
    if (title) {
      matchQuery = notificationsRef
        .where('type', '==', 'announcement')
        .where('title', '==', title);
    } else {
      // If no title, try to match by metadata.announcementId if we stored it
      matchQuery = notificationsRef.where('type', '==', 'announcement');
    }
    
    const matchingNotifs = await matchQuery.get();
    
    for (const notifDoc of matchingNotifs.docs) {
      batch.delete(notifDoc.ref);
      batchCount++;
      deletedCount++;
      
      // Commit batch if approaching limit
      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batchCount = 0;
      }
    }
  }
  
  // Commit remaining batch
  if (batchCount > 0) {
    await batch.commit();
  }
  
  // Optionally delete or mark the announcement record
  try {
    await db.collection('announcements').doc(announcementId).update({
      unsent: true,
      unsentAt: admin.firestore.FieldValue.serverTimestamp(),
      unsentBy: userId
    });
  } catch (e) {
    console.warn('Could not update announcement record:', e);
  }
  
  console.log(`✅ Unsent announcement: removed ${deletedCount} notifications from user feeds`);
  
  return {
    success: true,
    message: `Removed notification from ${deletedCount} user feeds.`,
    deletedCount
  };
});

// ============================================================================
// 7c. CLEANUP NOTIFICATIONS (Admin tool for bulk removal)
// ============================================================================

/**
 * Cleanup/remove notifications in bulk - admin only
 * Useful for removing accidental notifications or clearing old ones
 * 
 * @param {Object} data - { title?, type?, all? }
 * @param {Object} context - Firebase callable context
 */
exports.cleanupNotifications = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in.'
    );
  }
  
  const userId = context.auth.uid;
  
  // Verify admin role only (not even league-staff for this)
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'User profile not found.'
    );
  }
  
  const userData = userDoc.data();
  const userRole = userData.role || userData.userRole || 'fan';
  const isAdmin = userRole === 'admin' || userData.isAdmin === true;
  
  if (!isAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can run bulk cleanup.'
    );
  }
  
  const { title, type, all } = data;
  
  if (!title && !type && !all) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Specify title, type, or all:true'
    );
  }
  
  console.log(`🧹 Cleanup requested by ${userData.displayName || userId}:`, { title, type, all });
  
  const usersSnapshot = await db.collection('users').get();
  
  let totalDeleted = 0;
  let usersAffected = 0;
  
  for (const userDoc of usersSnapshot.docs) {
    const notificationsRef = db.collection('users').doc(userDoc.id).collection('notifications');
    
    let matchingNotifs;
    if (all === true) {
      matchingNotifs = await notificationsRef.get();
    } else if (title) {
      matchingNotifs = await notificationsRef.where('title', '==', title).get();
    } else if (type) {
      matchingNotifs = await notificationsRef.where('type', '==', type).get();
    }
    
    if (matchingNotifs && !matchingNotifs.empty) {
      usersAffected++;
      for (const notifDoc of matchingNotifs.docs) {
        await notifDoc.ref.delete();
        totalDeleted++;
      }
    }
  }
  
  console.log(`✅ Cleanup complete: ${totalDeleted} notifications from ${usersAffected} users`);
  
  return {
    success: true,
    message: `Deleted ${totalDeleted} notifications from ${usersAffected} users.`,
    totalDeleted,
    usersAffected
  };
});

// ============================================================================
// 8. TEST NOTIFICATION (Callable function for users to test their setup)
// ============================================================================

/**
 * Send a test notification to the current user
 * Allows users to verify their notification setup is working
 * 
 * @param {Object} data - { token? } - Optional specific token to test
 * @param {Object} context - Firebase callable context
 */
exports.testNotification = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to test notifications.'
    );
  }
  
  const userId = context.auth.uid;
  
  // Get user's FCM tokens
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'User profile not found.'
    );
  }
  
  const userData = userDoc.data();
  
  // Check if notifications are enabled
  if (userData.notificationsEnabled === false) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Notifications are disabled for your account. Please enable them first.'
    );
  }
  
  // Get tokens - either specific token from request or all user tokens
  let tokensToTest = [];
  
  if (data && data.token) {
    // Test specific token
    tokensToTest = [data.token];
  } else {
    // Test all user tokens
    tokensToTest = userData.fcmTokens || [];
  }
  
  if (tokensToTest.length === 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No FCM tokens found. Please enable notifications in your browser first.'
    );
  }
  
  console.log(`🧪 Sending test notification to ${userData.displayName || userId} (${tokensToTest.length} tokens)`);
  
  const message = {
    notification: {
      title: '🧪 Test Notification',
      body: `Success! Notifications are working for ${userData.displayName || 'your account'}.`
    },
    data: {
      type: 'test',
      timestamp: new Date().toISOString(),
      clickAction: '/profile.html'
    },
    webpush: {
      fcmOptions: {
        link: '/profile.html'
      }
    }
  };
  
  const result = await sendToTokens(tokensToTest, message);
  
  // If some tokens failed, clean them up
  if (result.failureCount > 0) {
    console.log(`Cleaning up ${result.failureCount} failed tokens for user ${userId}`);
    // Note: In production, you might want to remove invalid tokens here
  }
  
  if (result.successCount === 0) {
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send test notification. Your tokens may be invalid. Try disabling and re-enabling notifications.'
    );
  }
  
  console.log(`✅ Test notification sent: ${result.successCount} success, ${result.failureCount} failed`);
  
  return {
    success: true,
    message: `Test notification sent successfully!`,
    successCount: result.successCount,
    failureCount: result.failureCount
  };
});

// ============================================================================
// MANUAL TRIGGER: Game Reminders (Admin only - for testing)
// ============================================================================

exports.triggerGameReminders = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  
  // Verify admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  const isAdmin = userData?.role === 'admin' || userData?.isAdmin === true;
  
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  console.log('🧪 Manual trigger: Game reminders');
  
  // Get current season
  const currentSeason = await getCurrentSeason();
  if (!currentSeason) {
    return { success: false, message: 'No active season' };
  }
  
  // Allow override of date range for testing
  const daysAhead = data.daysAhead ?? 1; // Default: tomorrow
  
  const now = new Date();
  const targetStart = new Date(now);
  targetStart.setDate(targetStart.getDate() + daysAhead);
  targetStart.setHours(0, 0, 0, 0);
  
  const targetEnd = new Date(targetStart);
  targetEnd.setDate(targetEnd.getDate() + 1);
  
  console.log(`Looking for games between ${targetStart.toISOString()} and ${targetEnd.toISOString()}`);
  
  // Query games
  const gamesSnapshot = await db
    .collection('seasons')
    .doc(currentSeason.id)
    .collection('games')
    .where('date', '>=', admin.firestore.Timestamp.fromDate(targetStart))
    .where('date', '<', admin.firestore.Timestamp.fromDate(targetEnd))
    .get();
  
  if (gamesSnapshot.empty) {
    return { success: true, message: `No games found for ${daysAhead} day(s) ahead`, gamesFound: 0, seasonId: currentSeason.id };
  }
  
  let notificationsSent = 0;
  const gamesSummary = [];
  
  for (const gameDoc of gamesSnapshot.docs) {
    const game = gameDoc.data();
    const gameId = gameDoc.id;
    
    // Handle both field name cases (homeTeamId and homeTeamID)
    const homeTeamId = game.homeTeamId || game.homeTeamID;
    const awayTeamId = game.awayTeamId || game.awayTeamID;
    
    console.log(`Processing: ${game.homeTeamName || homeTeamId} vs ${game.awayTeamName || awayTeamId}`);
    
    const tokens = await getTeamPlayerTokensWithPreference(
      [homeTeamId, awayTeamId].filter(Boolean),
      'gameReminders'
    );
    
    gamesSummary.push({
      gameId,
      matchup: `${game.homeTeamName || homeTeamId} vs ${game.awayTeamName || awayTeamId}`,
      tokensFound: tokens.length
    });
    
    if (tokens.length === 0) {
      console.log('No tokens for this game');
      continue;
    }
    
      const gameDate = game.date.toDate();
    const timeString = formatGameTime(gameDate);  // NOW USES EASTERN TIME CONVERSION
          
          const dateString = gameDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/New_York'
          });
          
          const isPlayoff = isPlayoffGame(gameId);
          const gameTypeEmoji = isPlayoff ? '🏆 ' : '';
          
          const message = {
            notification: {
              title: '⏰ Game Reminder (TEST)',
              body: `${gameTypeEmoji}${game.homeTeamName || homeTeamId} vs ${game.awayTeamName || awayTeamId} - ${dateString} at ${timeString}`
            },
      data: {
        type: 'game_reminder',
        seasonId: currentSeason.id,
        gameId: gameId,
        isPlayoff: String(isPlayoff),
        clickAction: `/roster-management.html?game=${gameId}`
      },
      webpush: {
        fcmOptions: {
          link: `/roster-management.html?game=${gameId}`
        }
      }
    };
      console.log('Message body:', message.notification.body);
      
    const result = await sendToTokens(tokens, message);
    notificationsSent += result.successCount;
  }
  
  return {
    success: true,
    seasonId: currentSeason.id,
    gamesFound: gamesSnapshot.size,
    notificationsSent,
    games: gamesSummary
  };
});

// ============================================================================
// 9. CALENDAR SUBSCRIPTION (HTTP endpoint for iCal feeds)
// ============================================================================

// League configuration for calendar
const LEAGUE_CONFIG = {
  name: 'Mountainside Aces Softball',
  timezone: 'America/New_York',
  defaultLocation: 'Mountainside, NJ',
  prodId: '-//Mountainside Aces//Softball Schedule//EN'
};

/**
 * Calendar endpoint - generates dynamic iCal feeds
 * 
 * Usage:
 *   GET /calendar              - All games for current season
 *   GET /calendar?team=orange  - Specific team's games
 *   GET /calendar?season=2025-fall - Specific season
 */
exports.calendar = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const { team, season } = req.query;
    
    // Determine which season to fetch
    let seasonId = season;
    if (!seasonId) {
      // Find the active season
      const seasonsSnap = await db.collection('seasons')
        .where('isActive', '==', true)
        .limit(1)
        .get();
      
      if (seasonsSnap.empty) {
        // Fallback to most recent season
        const allSeasons = await db.collection('seasons')
          .orderBy('year', 'desc')
          .limit(1)
          .get();
        
        if (allSeasons.empty) {
          res.status(404).send('No seasons found');
          return;
        }
        seasonId = allSeasons.docs[0].id;
      } else {
        seasonId = seasonsSnap.docs[0].id;
      }
    }
    
    console.log(`📅 Generating calendar for season: ${seasonId}, team: ${team || 'all'}`);
    
    // Fetch games
    const gamesRef = db.collection('seasons').doc(seasonId).collection('games');
    const gamesSnap = await gamesRef.get();
    
    let games = [];
    gamesSnap.forEach(doc => {
      const data = doc.data();
      games.push({
        id: doc.id,
        ...data
      });
    });
    
    // Filter by team if specified
    if (team) {
      const teamLower = team.toLowerCase();
      games = games.filter(g => {
        const homeTeam = (g.homeTeamId || g.homeTeamName || g['home team'] || '').toLowerCase();
        const awayTeam = (g.awayTeamId || g.awayTeamName || g['away team'] || '').toLowerCase();
        return homeTeam.includes(teamLower) || awayTeam.includes(teamLower);
      });
    }
    
    // Sort by date
    games.sort((a, b) => {
      const dateA = getGameTimestamp(a);
      const dateB = getGameTimestamp(b);
      return dateA - dateB;
    });
    
    // Generate iCal
    const icalContent = generateICal(games, seasonId, team);
    
    // Set headers for calendar subscription
    const filename = team 
      ? `aces-${team.toLowerCase()}-${seasonId}.ics`
      : `aces-${seasonId}.ics`;
    
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    res.status(200).send(icalContent);
    
  } catch (error) {
    console.error('❌ Calendar generation error:', error);
    res.status(500).send('Error generating calendar');
  }
});

// Calendar helper functions
function getGameTimestamp(game) {
  if (game.date?.seconds) {
    return game.date.seconds * 1000;
  } else if (game.date && typeof game.date === 'string') {
    return new Date(game.date).getTime();
  }
  return 0;
}

function generateICal(games, seasonId, teamFilter) {
  const lines = [];
  
  // Calendar header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:${LEAGUE_CONFIG.prodId}`);
  lines.push(`X-WR-CALNAME:${teamFilter ? `Aces ${capitalize(teamFilter)} Schedule` : 'Mountainside Aces Schedule'}`);
  lines.push(`X-WR-TIMEZONE:${LEAGUE_CONFIG.timezone}`);
  lines.push('METHOD:PUBLISH');
  lines.push('CALSCALE:GREGORIAN');
  
  // Timezone definition
  lines.push('BEGIN:VTIMEZONE');
  lines.push('TZID:America/New_York');
  lines.push('BEGIN:DAYLIGHT');
  lines.push('TZOFFSETFROM:-0500');
  lines.push('TZOFFSETTO:-0400');
  lines.push('TZNAME:EDT');
  lines.push('DTSTART:19700308T020000');
  lines.push('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU');
  lines.push('END:DAYLIGHT');
  lines.push('BEGIN:STANDARD');
  lines.push('TZOFFSETFROM:-0400');
  lines.push('TZOFFSETTO:-0500');
  lines.push('TZNAME:EST');
  lines.push('DTSTART:19701101T020000');
  lines.push('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU');
  lines.push('END:STANDARD');
  lines.push('END:VTIMEZONE');
  
  // Add each game as an event
  games.forEach(game => {
    const event = generateGameEvent(game, seasonId, teamFilter);
    if (event) {
      lines.push(...event);
    }
  });
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

function generateGameEvent(game, seasonId, teamFilter) {
  const lines = [];
  
  // Get team names
  const homeTeam = game.homeTeamName || game['home team'] || capitalize(game.homeTeamId || 'TBD');
  const awayTeam = game.awayTeamName || game['away team'] || capitalize(game.awayTeamId || 'TBD');
  
  // Parse date - extract year/month/day components directly to avoid UTC timezone issues.
  // new Date("4/27/2026") creates a local date, but setHours() on it in a UTC Cloud Function
  // environment causes evening games (7:45 PM / 8:45 PM ET) to roll over to the next UTC day.
  let dateYear, dateMonth, dateDay;
  if (game.date?.seconds) {
    // Firestore Timestamp - convert to Eastern local date components
    const ts = new Date(game.date.seconds * 1000);
    const eastern = new Date(ts.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    dateYear = eastern.getFullYear();
    dateMonth = eastern.getMonth();
    dateDay = eastern.getDate();
  } else if (game.date) {
    // String date like "4/27/2026" or "Mon 4/27/2026" — strip day-of-week prefix if present
    const cleaned = String(game.date).replace(/^[A-Za-z]{2,3}\s+/, '');
    const parts = cleaned.split(/[\/\-]/);
    if (parts.length >= 3) {
      dateMonth = parseInt(parts[0], 10) - 1;
      dateDay = parseInt(parts[1], 10);
      dateYear = parseInt(parts[2], 10);
    } else {
      return null;
    }
  } else {
    return null; // Skip games without dates
  }

  // Parse time if available
  let startHours = 10, startMinutes = 0; // Default morning game
  if (game.time) {
    const parsedTime = parseTimeString(game.time);
    const tp = parsedTime.split(':').map(Number);
    startHours = tp[0];
    startMinutes = tp[1];
  }

  // Build iCal date strings directly from local components — never mutate a UTC Date object
  const pad = n => String(n).padStart(2, '0');
  const startIcal = `${dateYear}${pad(dateMonth + 1)}${pad(dateDay)}T${pad(startHours)}${pad(startMinutes)}00`;
  const endTotalMinutes = startHours * 60 + startMinutes + 60;
  const endHoursNorm = Math.floor(endTotalMinutes / 60) % 24;
  const endMinutes = endTotalMinutes % 60;
  const endDay = (Math.floor(endTotalMinutes / 60) >= 24) ? dateDay + 1 : dateDay;
  const endIcal = `${dateYear}${pad(dateMonth + 1)}${pad(endDay)}T${pad(endHoursNorm)}${pad(endMinutes)}00`;
  
  // Generate unique ID
  const uid = `${game.id || generateUID()}-${seasonId}@mountainsideaces.com`;
  
  // Determine if this is the filtered team's home or away game
  let summary;
  if (teamFilter) {
    const teamLower = teamFilter.toLowerCase();
    const isHome = (game.homeTeamId || '').toLowerCase().includes(teamLower) ||
                   (homeTeam || '').toLowerCase().includes(teamLower);
    summary = isHome ? `vs ${awayTeam}` : `@ ${homeTeam}`;
  } else {
    summary = `${awayTeam} @ ${homeTeam}`;
  }
  
  // Add game type prefix
  const gameType = game.gameType || game.game_type || 'Regular';
  if (gameType.toLowerCase() === 'playoff') {
    summary = `🏆 PLAYOFF: ${summary}`;
  }
  
  // Location
  const location = game.location || game.field || LEAGUE_CONFIG.defaultLocation;
  
  // Description with score if completed
  let description = `${LEAGUE_CONFIG.name}\\n${seasonId.replace('-', ' ').toUpperCase()}`;
  if (game.homeScore !== undefined && game.awayScore !== undefined && game.winner) {
    description += `\\n\\nFinal Score: ${homeTeam} ${game.homeScore} - ${awayTeam} ${game.awayScore}`;
    description += `\\nWinner: ${capitalize(game.winner)}`;
  }
  
  // Build event
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
  lines.push(`DTSTART;TZID=${LEAGUE_CONFIG.timezone}:${startIcal}`);
  lines.push(`DTEND;TZID=${LEAGUE_CONFIG.timezone}:${endIcal}`);
  lines.push(`SUMMARY:${escapeICalText(summary)}`);
  lines.push(`LOCATION:${escapeICalText(location)}`);
  lines.push(`DESCRIPTION:${escapeICalText(description)}`);
  
  // Status
  if (game.status === 'cancelled' || game.status === 'postponed') {
    lines.push('STATUS:CANCELLED');
  } else if (game.winner) {
    lines.push('STATUS:CONFIRMED');
  } else {
    lines.push('STATUS:TENTATIVE');
  }
  
  lines.push('END:VEVENT');
  
  return lines;
}

function formatICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatICalDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function parseTimeString(timeStr) {
  if (!timeStr) return '10:00';
  
  // Handle "10:00 AM", "2:30 PM" format
  const match = timeStr.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
  if (!match) return '10:00';
  
  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const period = match[3]?.toUpperCase();
  
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
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
    // Win% = (wins + ties×0.5) / (wins + losses + ties) — matches current-season.html
    const totalGames = team.wins + team.losses + team.ties;
    team.winPct = totalGames > 0 ? (team.wins + team.ties * 0.5) / totalGames : 0;
    team.runDifferential = team.runsFor - team.runsAgainst;
    team.streak = calculateStreakFromResults(team.recentResults);
    return team;
  });

  // Sort standings — tiebreaker order matches current-season.html exactly
  return standings.sort((a, b) => {
    // 1. Win percentage
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;

    // 2. Total wins
    if (a.wins !== b.wins) return b.wins - a.wins;

    // 3. Fewest losses
    if (a.losses !== b.losses) return a.losses - b.losses;

    // 4. H2H — only when exactly 2 teams are tied on win%, wins, AND losses
    const teamsAtSameMark = standings.filter(
      t => t.winPct === a.winPct && t.wins === a.wins && t.losses === a.losses
    );
    if (teamsAtSameMark.length === 2) {
      const h2hComp = compareH2H(a, b);
      if (h2hComp !== 0) return h2hComp;
    }

    // 5. Runs Against (fewer is better)
    if (a.runsAgainst !== b.runsAgainst) return a.runsAgainst - b.runsAgainst;

    // 6. Run Differential
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
// 2. MILESTONE REACHED - Triggered when milestone document is created
// ============================================================================

exports.onMilestoneReached = functions.firestore
  .document('milestones/{milestoneId}')
  .onCreate(async (snapshot, context) => {
    const milestone = snapshot.data();
    const milestoneId = context.params.milestoneId;
    
    const playerName = milestone.playerName || 'Unknown Player';
    const playerId = milestone.playerId || milestone.playerLegacyId;
    const seasonId = milestone.seasonId || null;
    
    // Determine icon and title based on milestone type
    let icon = '🎯';
    let title = '';
    let description = '';
    
    switch (milestone.type) {
      case 'hits':
        icon = '🎯';
        title = `${milestone.value} Career Hits`;
        description = `${playerName} reached ${milestone.value} career hits!`;
        break;
      case 'runs':
        icon = '🏃';
        title = `${milestone.value} Career Runs`;
        description = `${playerName} scored their ${milestone.value}th career run!`;
        break;
      case 'games':
        icon = '📅';
        title = `${milestone.value} Career Games`;
        description = `${playerName} played in their ${milestone.value}th game!`;
        break;
      default:
        title = `${milestone.value} ${milestone.type}`;
        description = `${playerName} reached ${milestone.value} career ${milestone.type}!`;
    }
    
    console.log(`🎯 Milestone activity: ${playerName} - ${title}`);
    
    await createActivity({
      type: 'milestone',
      seasonId: seasonId,
      icon: icon,
      playerId: playerId,
      playerName: playerName,
      teamId: milestone.teamId,
      teamName: milestone.teamName,
      title: title,
      description: description,
      linkUrl: `/player.html?id=${playerId}`,
      linkText: 'View Player',
      data: { 
        milestoneType: milestone.type, 
        milestoneValue: milestone.value, 
        currentStat: milestone.currentStat 
      },
      share: {
        type: 'MILESTONE',
        headline: playerName,
        subheadline: title.toUpperCase(),
        stat: String(milestone.value),
        statLabel: milestone.type.toUpperCase()
      }
    });
    
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
// 4. CAREER HIGH - Triggered when careerHighs document is created
// ============================================================================

exports.onCareerHigh = functions.firestore
  .document('careerHighs/{docId}')
  .onCreate(async (snapshot, context) => {
    const careerHigh = snapshot.data();
    const docId = context.params.docId;
    
    const playerName = careerHigh.playerName || 'Unknown Player';
    const playerId = careerHigh.playerId || careerHigh.playerLegacyId;
    const seasonId = careerHigh.seasonId || null;
    
    // Determine the stat type and format
    const stat = careerHigh.stat || careerHigh.type || 'hits';
    const value = careerHigh.value || 0;
    const previous = careerHigh.previousHigh || 0;
    
    console.log(`📈 Career high activity: ${playerName} - ${value} ${stat}`);
    
    await createActivity({
      type: 'career_high',
      seasonId: seasonId,
      icon: '📈',
      playerId: playerId,
      playerName: playerName,
      teamId: careerHigh.teamId || null,
      teamName: careerHigh.teamName || null,
      title: `Career High: ${value} ${capitalize(stat)}`,
      description: `${playerName} set a new single-game record with ${value} ${stat}!`,
      linkUrl: `/player.html?id=${playerId}`,
      linkText: 'View Player',
      data: { 
        stat: stat, 
        value: value, 
        previousHigh: previous, 
        opponent: careerHigh.opponent || null,
        gameId: careerHigh.gameId || null
      },
      share: {
        type: 'CAREER HIGH',
        headline: playerName,
        subheadline: `${value} ${stat.toUpperCase()} IN A GAME`,
        stat: String(value),
        statLabel: stat.toUpperCase()
      }
    });
    
    return null;
  });

// ============================================================================
// 5. HIT STREAK - Triggered when hitStreaks document is created
// ============================================================================

exports.onHitStreak = functions.firestore
  .document('hitStreaks/{docId}')
  .onCreate(async (snapshot, context) => {
    const streak = snapshot.data();
    const docId = context.params.docId;
    
    const playerName = streak.playerName || 'Unknown Player';
    const playerId = streak.playerId || streak.playerLegacyId;
    const seasonId = streak.seasonId || null;
    const streakLength = streak.streakLength || streak.length || 0;
    
    // Only create activity for notable streaks (5+)
    if (streakLength < 5) {
      console.log(`⏭️ Streak of ${streakLength} not notable enough for activity`);
      return null;
    }
    
    console.log(`🔥 Hit streak activity: ${playerName} - ${streakLength} games`);
    
    await createActivity({
      type: 'streak',
      seasonId: seasonId,
      icon: '🔥',
      playerId: playerId,
      playerName: playerName,
      teamId: streak.teamId || null,
      teamName: streak.teamName || null,
      title: `${streakLength}-Game Hit Streak`,
      description: `${playerName} has hit safely in ${streakLength} straight games!`,
      linkUrl: `/player.html?id=${playerId}`,
      linkText: 'View Player',
      data: { 
        streakType: 'hitting', 
        streakLength: streakLength,
        startDate: streak.startDate || null,
        endDate: streak.endDate || null
      },
      share: {
        type: 'HOT STREAK',
        headline: playerName,
        subheadline: `${streakLength}-GAME HIT STREAK 🔥`,
        stat: String(streakLength),
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
// CALLABLE: Send Mass Email via Resend
// Setup: firebase functions:secrets:set RESEND_API_KEY
// Deploy: firebase deploy --only functions:sendMassEmail
// ============================================================================

exports.sendMassEmail = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .https.onCall(async (data, context) => {
  // ── Auth check ────────────────────────────────────────────────────────────
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to send emails.'
    );
  }

  const userId = context.auth.uid;
  const userDoc = await db.collection('users').doc(userId).get();

  if (!userDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }

  const userData = userDoc.data();
  const isEmailAdmin = userData.isAdmin === true ||
                       userData.userRole === 'admin' ||
                       userData.role === 'admin' ||
                       userData.userRole === 'league-staff' ||
                       userData.role === 'league-staff' ||
                       userData.isLeagueStaff === true;

  if (!isEmailAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins and league staff can send mass emails.'
    );
  }

  // ── Validate payload ──────────────────────────────────────────────────────
  const { subject, body, fromName, replyTo, recipients, audienceLabel } = data;

  if (!subject || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Subject and body are required.');
  }

  if (!replyTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid reply-to email address is required.');
  }

  if (!recipients || recipients.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No recipients provided.');
  }

  if (recipients.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot send to more than 500 recipients at once.');
  }

  // ── Load Resend config ────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = 'noreply@acessoftballreference.com';

  if (!apiKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Resend API key not configured. Run: firebase functions:secrets:set RESEND_API_KEY'
    );
  }

  // ── Build email content ───────────────────────────────────────────────────
  const htmlBody = buildEmailHtml(body, fromName || 'Mountainside Aces', userId);
  const textBody = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // Deduplicate, normalize, and exclude sender (they get a copy via the "to" field)
  const emailList = [...new Set(
    recipients
      .map(r => typeof r === 'string' ? r : r.email)
      .filter(Boolean)
      .map(e => e.toLowerCase().trim())
  )].filter(e => e !== (userData.email || '').toLowerCase().trim());

  const senderName = fromName || 'Mountainside Aces';

  let sentCount = 0;
  const errors = [];

  // Always BCC — Resend limits BCC to 50 per call, so chunk into batches
  // "To" is the sender's own email on the first batch; subsequent batches use a silent to
  const BCC_BATCH_SIZE = 44; // 44 BCC + 1 "to" = 45 total, safely under Resend limit
  const batches = [];
  for (let i = 0; i < emailList.length; i += BCC_BATCH_SIZE) {
    batches.push(emailList.slice(i, i + BCC_BATCH_SIZE));
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  console.log(`📧 Sending "${subject}" BCC to ${emailList.length} recipients in ${batches.length} batch(es) (${audienceLabel || 'All Members'})`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (batchIndex > 0) await sleep(1000); // Rate limit: Resend allows 2 req/sec
    const batchBcc = batches[batchIndex];
    const toField = [userData.email];

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${senderName} <${fromEmail}>`,
          to: toField,
          bcc: batchBcc,
          reply_to: replyTo,
          subject: subject,
          html: htmlBody,
          text: textBody
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ Resend BCC batch ${batchIndex + 1} failed (${res.status}):`, errText);
        errors.push(`Batch ${batchIndex + 1}: ${errText}`);
      } else {
        sentCount += batchBcc.length;
        console.log(`✅ BCC batch ${batchIndex + 1}/${batches.length} sent (${batchBcc.length} recipients)`);
      }
    } catch (err) {
      console.error(`❌ Resend BCC batch ${batchIndex + 1} threw:`, err.message);
      errors.push(`Batch ${batchIndex + 1}: ${err.message}`);
    }
  }

  if (sentCount === 0) {
    throw new functions.https.HttpsError(
      'internal',
      `All batches failed. First error: ${errors[0] || 'Unknown error'}`
    );
  }

  // ── Log campaign to Firestore ─────────────────────────────────────────────
  const campaignRef = await db.collection('emailCampaigns').add({
    subject,
    audienceLabel: audienceLabel || 'All Members',
    sendMode: 'bcc',
    sentCount,
    totalRecipients: emailList.length,
    sentBy: userData.displayName || userId,
    sentByUid: userId,
    replyTo,
    fromName: senderName,
    errors: errors.length > 0 ? errors : null,
    sentAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`✅ Mass email complete: "${subject}" → ${sentCount}/${emailList.length} delivered. Campaign: ${campaignRef.id}`);

  return {
    success: true,
    sentCount,
    totalRecipients: emailList.length,
    campaignId: campaignRef.id,
    partialErrors: errors.length > 0 ? errors : null
  };
});

// UID for the Supreme Leader — special email template
const SUPREME_LEADER_UID = '62UYGWPYtkdlqOiaIHtj6CYW1uf1';
const SUPREME_LEADER_PHOTO = 'https://firebasestorage.googleapis.com/v0/b/acessoftballreference-84791.firebasestorage.app/o/email-assets%2Fd7e5219a-b681-444b-bb0c-2b96a053b620.jpeg?alt=media&token=4dbc5405-db99-47d2-b2c3-10d2d2183aa9';

function buildEmailHtml(body, fromName, senderId) {
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const formattedBody = isHtml ? body : body.replace(/\n/g, '<br>');
  const isSupremeLeader = senderId === SUPREME_LEADER_UID;

  const supremeLeaderPrefix = isSupremeLeader
    ? '<tr><td style="padding:16px 36px 0;text-align:center;">' +
      '<div style="display:inline-block;background:linear-gradient(135deg,#7b341e 0%,#c05621 100%);color:#fff;font-size:11px;font-weight:800;letter-spacing:2px;padding:5px 14px;border-radius:20px;text-transform:uppercase;">Official Communication</div>' +
      '<div style="margin-top:10px;font-size:14px;font-style:italic;color:#744210;font-weight:600;">— From the Desk of the Supreme Leader —</div>' +
      '</td></tr>'
    : '';

  const supremeLeaderPhoto = isSupremeLeader
    ? '<tr><td style="padding:24px 36px 8px;text-align:center;">' +
      '<img src="' + SUPREME_LEADER_PHOTO + '" alt="The Supreme Leader" style="width:100%;max-width:480px;border-radius:10px;display:block;margin:0 auto;" />' +
      '<div style="margin-top:8px;font-size:11px;color:#a0aec0;font-style:italic;">The Supreme Leader — Mountainside Aces</div>' +
      '</td></tr>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#2d5016 0%,#1a6b4a 100%);padding:28px 32px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">⚾</div>
            <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">MOUNTAINSIDE ACES</div>
            <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">Recreational Softball League</div>
          </td>
        </tr>
        ${supremeLeaderPrefix}
        <tr>
          <td style="padding:32px 36px;color:#2d3748;font-size:15px;line-height:1.8;">
            ${formattedBody}
          </td>
        </tr>
        ${supremeLeaderPhoto}
        <tr>
          <td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#a0aec0;">
            You're receiving this because you're a member of Mountainside Aces.<br>
            Questions? Reply to this email or visit <a href="https://acessoftballreference.com" style="color:#2d5016;">acessoftballreference.com</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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

// ============================================================================
// STATS SUBMITTED: Notify admin when anyone submits game stats
// ============================================================================

exports.onStatsSubmitted = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .firestore
  .document('seasons/{seasonId}/games/{gameId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after  = change.after.data();

    // Fire when statsSubmittedHome or statsSubmittedAway just flipped to true
    const homeJustSubmitted = before.statsSubmittedHome !== true && after.statsSubmittedHome === true;
    const awayJustSubmitted  = before.statsSubmittedAway  !== true && after.statsSubmittedAway  === true;

    if (!homeJustSubmitted && !awayJustSubmitted) return null;

    const { seasonId, gameId } = context.params;
    const submittedByName  = after.statsSubmittedByName  || 'Someone';
    const submittedForTeam = after.statsSubmittedForTeam || 'Unknown Team';
    const _rawDate = after.gameDateFormatted || after.date;
    const gameDate = _rawDate
      ? (_rawDate.seconds
          ? new Date(_rawDate.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : String(_rawDate))
      : 'Unknown Date';
    const homeTeam = after['home team'] || after.homeTeam || after.home || '';
    const awayTeam = after['away team'] || after.awayTeam || after.away || '';
    const matchup  = homeTeam && awayTeam ? `${awayTeam} @ ${homeTeam}` : submittedForTeam;

    // Which side just submitted, and is the other side still pending?
    const whichSide   = homeJustSubmitted ? 'Home' : 'Away';
    const pendingTeam = after.statsSubmittedHome === true && after.statsSubmittedAway === true
      ? null
      : homeJustSubmitted ? (awayTeam || 'Away team') : (homeTeam || 'Home team');

    const submittedAt = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    console.log(`📊 Stats submitted (${whichSide}) by ${submittedByName} for ${matchup} (${gameDate})${pendingTeam ? ` — ${pendingTeam} still pending` : ' — both sides done'}`);

    // ── Find all admin users ─────────────────────────────────────────────────
    let adminTokens = [];
    let adminEmails = [];

    try {
      // Query by isAdmin flag
      const adminSnap = await db.collection('users')
        .where('isAdmin', '==', true)
        .get();

      // Also catch userRole === 'admin' in case some docs use that
      const roleAdminSnap = await db.collection('users')
        .where('userRole', '==', 'admin')
        .get();

      const seen = new Set();
      const allAdminDocs = [...adminSnap.docs, ...roleAdminSnap.docs];

      for (const userDoc of allAdminDocs) {
        if (seen.has(userDoc.id)) continue;
        seen.add(userDoc.id);

        const data = userDoc.data();
        const tokens = data.fcmTokens || [];
        adminTokens.push(...tokens);
        if (data.email) adminEmails.push(data.email);
      }
    } catch (err) {
      console.error('❌ Error fetching admin users:', err);
    }

    console.log(`👤 Found ${adminEmails.length} admin email(s), ${adminTokens.length} FCM token(s)`);

    // ── FCM Push Notification ────────────────────────────────────────────────
    if (adminTokens.length > 0) {
      try {
        const pushBody = pendingTeam
          ? `${submittedByName} submitted ${whichSide} stats for ${matchup} — ${pendingTeam} still pending`
          : `${submittedByName} submitted ${whichSide} stats for ${matchup} — both sides done ✅`;

        await sendToTokens(adminTokens, {
          notification: {
            title: '📊 Stats Submitted',
            body: pushBody
          },
          data: {
            type: 'stats_submitted',
            gameId: gameId,
            seasonId: seasonId,
            submittedByName: submittedByName,
            team: submittedForTeam,
            side: whichSide,
            link: `/submit-stats.html`
          },
          webpush: {
            fcmOptions: { link: '/submit-stats.html' },
            notification: { icon: '/icons/icon-192x192.png' }
          }
        });
        console.log('✅ FCM push sent to admin(s)');
      } catch (err) {
        console.error('❌ FCM push failed:', err);
      }
    }

    // ── Resend Email ─────────────────────────────────────────────────────────
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ RESEND_API_KEY not set — skipping email notification');
    } else if (adminEmails.length > 0) {
      const subject = `📊 Stats submitted (${whichSide}) — ${matchup}`;
      const pendingRow = pendingTeam
        ? `<tr><td style="padding: 6px 0; color: #718096;">Still pending</td><td style="padding: 6px 0; color: #d97706; font-weight: 600;">⏳ ${pendingTeam}</td></tr>`
        : `<tr><td style="padding: 6px 0; color: #718096;">Status</td><td style="padding: 6px 0; color: #16a34a; font-weight: 600;">✅ Both sides submitted</td></tr>`;
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="background: #2d5016; border-radius: 12px 12px 0 0; padding: 20px 24px;">
            <h2 style="color: #fff; margin: 0; font-size: 1.1rem;">📊 Stats Submission Alert</h2>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
            <p style="margin: 0 0 16px; color: #2d3748; font-size: 0.95rem;">
              <strong>${submittedByName}</strong> just submitted <strong>${whichSide}</strong> player stats.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; color: #4a5568;">
              <tr>
                <td style="padding: 6px 0; color: #718096;">Game</td>
                <td style="padding: 6px 0; font-weight: 600;">${matchup}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #718096;">Date</td>
                <td style="padding: 6px 0;">${gameDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #718096;">Team</td>
                <td style="padding: 6px 0;">${submittedForTeam} (${whichSide})</td>
              </tr>
              ${pendingRow}
              <tr>
                <td style="padding: 6px 0; color: #718096;">Submitted at</td>
                <td style="padding: 6px 0;">${submittedAt} ET</td>
              </tr>
            </table>
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #a0aec0;">
              Remember to run the aggregation update for current-season stats.
            </div>
          </div>
        </div>
      `;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Mountainside Aces <noreply@acessoftballreference.com>',
            to: adminEmails,
            subject: subject,
            html: htmlBody
          })
        });

        if (res.ok) {
          console.log(`✅ Email sent to ${adminEmails.join(', ')}`);
        } else {
          const errText = await res.text();
          console.error(`❌ Resend email failed (${res.status}):`, errText);
        }
      } catch (err) {
        console.error('❌ Resend fetch threw:', err);
      }
    }

    return null;
  });

// ============================================================================
// YOUTUBE LIVE STREAM AUTO-DETECTION
// Polls the YouTube Data API every 3 minutes.
// If the Aces channel is live, writes videoId + title to siteConfig/streamConfig.
// If the channel goes offline, clears the live state (only if auto-detected).
//
// SETUP (one-time, run in terminal):
//   firebase functions:config:set youtube.api_key="YOUR_YOUTUBE_DATA_API_v3_KEY"
//   firebase deploy --only functions
//
// Get a key at: https://console.cloud.google.com/apis/library/youtube.googleapis.com
// Enable "YouTube Data API v3" then create an API key restricted to that API.
// ============================================================================

const ACES_CHANNEL_ID = 'UCFaQJcIQUrjYOZzthFM8TqA';

exports.checkYouTubeLiveStatus = functions.pubsub
  .schedule('every 3 minutes')
  .timeZone('America/New_York')
  .onRun(async () => {
    const apiKey = functions.config().youtube && functions.config().youtube.api_key;

    if (!apiKey) {
      console.error('⚠️  YouTube API key not set. Run: firebase functions:config:set youtube.api_key="YOUR_KEY"');
      return null;
    }

    const streamRef = db.collection('siteConfig').doc('streamConfig');

    try {
      const url =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=id,snippet` +
        `&channelId=${ACES_CHANNEL_ID}` +
        `&eventType=live` +
        `&type=video` +
        `&maxResults=1` +
        `&key=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.error('YouTube API error:', JSON.stringify(data.error));
        return null;
      }

      if (data.items && data.items.length > 0) {
        // Channel is live — write video info to Firestore
        const video = data.items[0];
        const videoId = video.id.videoId;
        const title = video.snippet.title || '';

        const snap = await streamRef.get();
        const current = snap.exists ? snap.data() : {};

        // Only write if something changed (avoid unnecessary writes)
        if (!current.isLive || current.videoId !== videoId) {
          await streamRef.set({
            isLive: true,
            videoId,
            title,
            detectedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'auto'
          });
          console.log(`✅ Live stream detected and published: ${videoId} — "${title}"`);
        } else {
          console.log(`ℹ️  Already showing live stream ${videoId}, no update needed.`);
        }

      } else {
        // Channel is not live — clear only if it was auto-detected (don't clobber manual overrides)
        const snap = await streamRef.get();
        const current = snap.exists ? snap.data() : null;

        if (current && current.isLive && current.source === 'auto') {
          await streamRef.set({
            isLive: false,
            videoId: null,
            title: '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: 'auto'
          });
          console.log('📴 Stream ended — Firestore updated to offline.');
        } else {
          console.log('ℹ️  Channel offline, no active auto-stream to clear.');
        }
      }

    } catch (err) {
      console.error('❌ YouTube live check failed:', err);
    }

    return null;
  });


// ============================================================================
// PICK'EM EMAIL REMINDERS
// Runs daily at 9 AM ET. Emails everyone who has a pick'em entry this season
// and has NOT yet picked one or more games that lock in the next 24 hours.
// Games lock at scheduled first pitch (same rule as pickem.html).
//
// - Opt-out: users/{uid}.emailPreferences.pickemReminders === false
// - Dedupe:  pickem/{seasonId}/reminderLog/{YYYY-MM-DD} (one email per user/day)
// - Uses the same RESEND_API_KEY secret as the other email functions
// - Manual test (admin): triggerPickemReminders({ dryRun: true })
// ============================================================================

const PICKEM_TZ = 'America/New_York';
const PICKEM_DEFAULT_LOCK_MINUTES = 8 * 60; // unparseable time -> lock 8:00 AM ET
const PICKEM_WINDOW_HOURS = 24;
const PICKEM_URL = 'https://acessoftballreference.com/pickem.html';
const PICKEM_PROFILE_URL = 'https://acessoftballreference.com/profile.html';

function pickemEtParts(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: PICKEM_TZ, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date(ms)).forEach(p => { o[p.type] = parseInt(p.value, 10); });
  return { y: o.year, m: o.month - 1, day: o.day, h: o.hour, min: o.minute };
}

// Wall-clock ET -> epoch ms (two passes to handle DST boundaries)
function pickemEtToMs(y, m, day, h, min) {
  const guess = Date.UTC(y, m, day, h, min);
  const p = pickemEtParts(guess);
  const offset = Date.UTC(p.y, p.m, p.day, p.h, p.min) - guess;
  let ms = guess - offset;
  const p2 = pickemEtParts(ms);
  const offset2 = Date.UTC(p2.y, p2.m, p2.day, p2.h, p2.min) - ms;
  if (offset2 !== offset) ms = guess - offset2;
  return ms;
}

function pickemDateParts(g) {
  if (g.date && g.date.seconds) {
    const p = pickemEtParts(g.date.seconds * 1000);
    return { y: p.y, m: p.m, day: p.day };
  }
  if (g.date && typeof g.date === 'string') {
    const parts = g.date.split(/[-\/]/);
    if (parts.length < 3) return null;
    if (parts[0].length === 4) return { y: +parts[0], m: +parts[1] - 1, day: +parts[2] };
    return { y: +parts[2], m: +parts[0] - 1, day: +parts[1] };
  }
  return null;
}

// "7:45 PM" -> minutes after midnight. No AM/PM: weekend 7-11 = AM, otherwise PM.
function pickemTimeToMinutes(t, dp) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]?/) || String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3] ? m[3].toUpperCase() : null;
  if (h > 23 || min > 59) return null;
  if (period === 'A') { if (h === 12) h = 0; }
  else if (period === 'P') { if (h !== 12) h += 12; }
  else if (h < 12) {
    const dow = new Date(Date.UTC(dp.y, dp.m, dp.day)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (!(weekend && h >= 7)) h += 12;
  }
  return h * 60 + min;
}

function pickemEscape(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pickemCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// Returns pickable games (open, real teams, not final/cancelled) locking within the window
function pickemGamesInWindow(rawGames, nowMs, windowMs) {
  const out = [];
  for (const g of rawGames) {
    const dp = pickemDateParts(g);
    if (!dp) continue;
    const homeName = g.homeTeamName || pickemCap(g.homeTeamId) || g['home team'] || 'TBD';
    const awayName = g.awayTeamName || pickemCap(g.awayTeamId) || g['away team'] || 'TBD';
    const status = String(g.status || '').toLowerCase();
    const winnerRaw = g.winner ? String(g.winner).toLowerCase() : '';
    const homeScore = g.homeScore ?? g['home score'] ?? null;
    const awayScore = g.awayScore ?? g['away score'] ?? null;
    const isFinal = status === 'completed' || (!!winnerRaw && homeScore !== null && awayScore !== null);
    const isTBD = !!g.isPlaceholder || homeName === 'TBD' || awayName === 'TBD';
    const cancelled = ['cancelled', 'canceled', 'postponed', 'rainout', 'rained out'].includes(status);
    if (isFinal || isTBD || cancelled) continue;

    const mins = pickemTimeToMinutes(g.time, dp);
    const lockMins = mins === null ? PICKEM_DEFAULT_LOCK_MINUTES : mins;
    const lockAt = pickemEtToMs(dp.y, dp.m, dp.day, Math.floor(lockMins / 60), lockMins % 60);
    if (lockAt <= nowMs || lockAt > nowMs + windowMs) continue;

    out.push({ id: g.id, homeName, awayName, lockAt });
  }
  return out.sort((a, b) => a.lockAt - b.lockAt);
}

function pickemFormatLock(ms) {
  return new Date(ms).toLocaleString('en-US', { timeZone: PICKEM_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function pickemBuildEmail(name, games) {
  const n = games.length;
  const rows = games.map(g => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#2d3748;font-weight:600;">${pickemEscape(g.awayName)} @ ${pickemEscape(g.homeName)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#d97706;text-align:right;white-space:nowrap;">Locks ${pickemEscape(pickemFormatLock(g.lockAt))} ET</td>
    </tr>`).join('');
  const subject = n === 1
    ? "Pick'em reminder: 1 game still needs your pick"
    : `Pick'em reminder: ${n} games still need your picks`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <div style="background:#2d5016;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:1.1rem;">Weekly Pick'em Reminder</h2>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 16px;color:#2d3748;font-size:0.95rem;">
          Hey ${pickemEscape(name)}, you haven't picked ${n === 1 ? 'this game' : 'these games'} yet. Each game locks at first pitch.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">${rows}</table>
        <div style="margin:24px 0 8px;text-align:center;">
          <a href="${PICKEM_URL}" style="display:inline-block;background:#2d5016;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">Make my picks</a>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:0.8rem;color:#a0aec0;">
          You're getting this because you play Pick'em. To stop these, turn off "Pick'em Emails" under
          Email Notifications on your <a href="${PICKEM_PROFILE_URL}" style="color:#a0aec0;">profile</a>.
        </div>
      </div>
    </div>`;
  return { subject, html };
}

async function runPickemReminders({ dryRun = false, force = false, hoursAhead = PICKEM_WINDOW_HOURS } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !dryRun) {
    console.warn('⚠️ RESEND_API_KEY not set - skipping pick\'em reminders');
    return { success: false, message: 'RESEND_API_KEY not set' };
  }

  const season = await getCurrentSeason();
  if (!season) return { success: false, message: 'No active season' };

  const nowMs = Date.now();
  const gamesSnap = await db.collection('seasons').doc(season.id).collection('games').get();
  const rawGames = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const windowGames = pickemGamesInWindow(rawGames, nowMs, hoursAhead * 3600 * 1000);
  if (!windowGames.length) {
    console.log("🎯 Pick'em: no open games locking in the next " + hoursAhead + 'h');
    return { success: true, message: 'No games in window', sent: 0 };
  }

  const entriesSnap = await db.collection('pickem').doc(season.id).collection('entries').get();
  if (entriesSnap.empty) return { success: true, message: 'No pick\'em entries yet', sent: 0 };

  // Dedupe log (one reminder email per user per ET day)
  const p = pickemEtParts(nowMs);
  const dateKey = `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const logRef = db.collection('pickem').doc(season.id).collection('reminderLog').doc(dateKey);
  const logSnap = await logRef.get();
  const alreadySent = new Set(force ? [] : (logSnap.exists ? (logSnap.data().sent || []) : []));
  if (!force) {
    // Anyone who got today's weekly digest (Mondays) already saw their open games
    const digestSnap = await db.collection('pickem').doc(season.id).collection('reminderLog').doc(`digest-${dateKey}`).get();
    if (digestSnap.exists) (digestSnap.data().sent || []).forEach(u => alreadySent.add(u));
  }

  // Who is missing picks?
  const targets = [];
  entriesSnap.forEach(d => {
    if (alreadySent.has(d.id)) return;
    const picks = d.data().picks || {};
    const missing = windowGames.filter(g => !picks[g.id] || !picks[g.id].team);
    if (missing.length) targets.push({ uid: d.id, fallbackName: d.data().displayName, missing });
  });
  if (!targets.length) {
    console.log("🎯 Pick'em: everyone is caught up");
    return { success: true, message: 'Everyone is caught up', sent: 0 };
  }

  // Resolve emails + opt-outs
  const userRefs = targets.map(t => db.collection('users').doc(t.uid));
  const userDocs = [];
  for (let i = 0; i < userRefs.length; i += 300) {
    userDocs.push(...await db.getAll(...userRefs.slice(i, i + 300)));
  }
  const emails = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const u = userDocs[i].exists ? userDocs[i].data() : {};
    if (u.emailPreferences && u.emailPreferences.pickemReminders === false) continue;
    let email = u.email;
    if (!email) {
      try { email = (await admin.auth().getUser(t.uid)).email; } catch (e) { /* no auth record */ }
    }
    if (!email) continue;
    const name = u.preferredDisplayName || u.displayName || t.fallbackName || 'there';
    emails.push({ uid: t.uid, email, name, missing: t.missing });
  }

  console.log(`🎯 Pick'em: ${windowGames.length} games in window, ${targets.length} entrants missing picks, ${emails.length} to email${dryRun ? ' (DRY RUN)' : ''}`);
  if (dryRun) {
    return {
      success: true, dryRun: true, gamesInWindow: windowGames.length, wouldSend: emails.length,
      recipients: emails.map(e => ({ name: e.name, email: e.email, missing: e.missing.length }))
    };
  }

  // Send via Resend batch endpoint (max 100/call; keep chunks small + pace for rate limits)
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const CHUNK = 50;
  let sent = 0, failed = 0;
  for (let i = 0; i < emails.length; i += CHUNK) {
    if (i > 0) await sleep(1000);
    const chunk = emails.slice(i, i + CHUNK);
    const payload = chunk.map(e => {
      const { subject, html } = pickemBuildEmail(e.name, e.missing);
      return { from: 'Mountainside Aces <noreply@acessoftballreference.com>', to: [e.email], subject, html };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        sent += chunk.length;
        await logRef.set({
          sent: admin.firestore.FieldValue.arrayUnion(...chunk.map(e => e.uid)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        failed += chunk.length;
        console.error(`❌ Pick'em batch failed (${res.status}):`, await res.text());
      }
    } catch (err) {
      failed += chunk.length;
      console.error("❌ Pick'em batch threw:", err.message);
    }
  }
  console.log(`✅ Pick'em reminders sent: ${sent}, failed: ${failed}`);
  return { success: failed === 0, sent, failed };
}

exports.sendPickemReminders = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .pubsub
  .schedule('0 9 * * *')
  .timeZone('America/New_York')
  .onRun(async () => {
    await runPickemReminders();
    return null;
  });

// Admin-only manual run. data: { dryRun?: bool, force?: bool, hoursAhead?: number }
exports.triggerPickemReminders = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const u = userDoc.data();
    if (!(u?.role === 'admin' || u?.isAdmin === true || u?.userRole === 'admin')) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }
    return runPickemReminders({
      dryRun: data?.dryRun === true,
      force: data?.force === true,
      hoursAhead: Number(data?.hoursAhead) || PICKEM_WINDOW_HOURS
    });
  });


// ============================================================================
// PICK'EM WEEKLY DIGEST (email)
// Mondays 8 AM ET. One email to every pick'em entrant with:
//   1) Season (YTD) top 5 + the reader's own rank
//   2) Upsets from last week (Mon-Sun)
//   3) This week's games (Mon-Sun) + how many the reader has already picked
// Scoring/upset rules mirror pickem.html exactly.
// Dedupe: pickem/{seasonId}/reminderLog/digest-{YYYY-MM-DD}. The 9 AM daily
// reminder skips anyone who already got the digest that day.
// Manual test (admin): triggerPickemDigest({ dryRun: true })
// ============================================================================

const PICKEM_UPSET_SHARE = 1 / 3;
const PICKEM_UPSET_MIN_PICKS = 3;

function pickemNormalizeGame(g) {
  const dp = pickemDateParts(g);
  if (!dp) return null;
  const homeName = g.homeTeamName || pickemCap(g.homeTeamId) || g['home team'] || 'TBD';
  const awayName = g.awayTeamName || pickemCap(g.awayTeamId) || g['away team'] || 'TBD';
  const homeKey = String(g.homeTeamId || homeName).toLowerCase();
  const awayKey = String(g.awayTeamId || awayName).toLowerCase();
  const status = String(g.status || '').toLowerCase();
  const mins = pickemTimeToMinutes(g.time, dp);
  const lockMins = mins === null ? PICKEM_DEFAULT_LOCK_MINUTES : mins;
  const lockAt = pickemEtToMs(dp.y, dp.m, dp.day, Math.floor(lockMins / 60), lockMins % 60);
  const winnerRaw = g.winner ? String(g.winner).toLowerCase() : '';
  const homeScore = g.homeScore ?? g['home score'] ?? null;
  const awayScore = g.awayScore ?? g['away score'] ?? null;
  const isFinal = status === 'completed' || (!!winnerRaw && homeScore !== null && awayScore !== null);
  const isTBD = !!g.isPlaceholder || homeName === 'TBD' || awayName === 'TBD';
  const cancelled = ['cancelled', 'canceled', 'postponed', 'rainout', 'rained out'].includes(status);
  let winnerKey = null;
  if (isFinal && winnerRaw) {
    if (winnerRaw === homeKey || winnerRaw === homeName.toLowerCase()) winnerKey = homeKey;
    else if (winnerRaw === awayKey || winnerRaw === awayName.toLowerCase()) winnerKey = awayKey;
  }
  const isVoid = cancelled || (isFinal && (!winnerKey || !!g.forfeit));
  return {
    id: g.id, dp, dayKey: pickemDpKey(dp), time: g.time || '', lockAt,
    homeName, awayName, homeKey, awayKey, homeScore, awayScore,
    isFinal, isTBD, cancelled, isVoid, winnerKey,
    isGraded: isFinal && !isVoid
  };
}

const pickemDpKey = (dp) => `${dp.y}-${String(dp.m + 1).padStart(2, '0')}-${String(dp.day).padStart(2, '0')}`;
function pickemAddDays(dp, n) {
  const d = new Date(Date.UTC(dp.y, dp.m, dp.day + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}
const PICKEM_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PICKEM_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// entries: [{ uid, displayName, picks: { gameId: { team, atMs } } }]
function pickemValidPick(entry, g) {
  const p = entry.picks[g.id];
  if (!p || !p.team) return null;
  if (p.atMs && p.atMs > g.lockAt) return null;
  if (p.team !== g.homeKey && p.team !== g.awayKey) return null;
  return p.team;
}

function pickemSplit(entries, g) {
  let home = 0, away = 0;
  entries.forEach(e => {
    const t = pickemValidPick(e, g);
    if (t === g.homeKey) home++;
    else if (t === g.awayKey) away++;
  });
  return { home, away, total: home + away };
}

function pickemUpsetInfo(entries, g) {
  if (!g.isGraded) return null;
  const s = pickemSplit(entries, g);
  if (s.total < PICKEM_UPSET_MIN_PICKS) return null;
  const winnerPicks = g.winnerKey === g.homeKey ? s.home : s.away;
  if (winnerPicks / s.total >= PICKEM_UPSET_SHARE) return null;
  const winnerName = g.winnerKey === g.homeKey ? g.homeName : g.awayName;
  const loserName = g.winnerKey === g.homeKey ? g.awayName : g.homeName;
  return { game: g, winnerName, loserName, winnerPicks, total: s.total };
}

// Standings table, sorted: points, correct, fewest misses, name
function pickemScore(entries, gameList) {
  const upsetById = {};
  gameList.forEach(g => { upsetById[g.id] = !!pickemUpsetInfo(entries, g); });
  const rows = [];
  entries.forEach(e => {
    const row = { uid: e.uid, name: e.displayName, pts: 0, correct: 0, wrong: 0, upsets: 0, picks: 0 };
    gameList.forEach(g => {
      const t = pickemValidPick(e, g);
      if (!t) return;
      row.picks++;
      if (!g.isGraded) return;
      if (t === g.winnerKey) {
        row.correct++; row.pts += 1;
        if (upsetById[g.id]) { row.pts += 1; row.upsets++; }
      } else row.wrong++;
    });
    if (row.picks > 0) rows.push(row);
  });
  rows.sort((a, b) => (b.pts - a.pts) || (b.correct - a.correct) || (a.wrong - b.wrong) || a.name.localeCompare(b.name));
  // Competition ranking: equal pts/correct/wrong share a rank
  rows.forEach((r, i) => {
    r.rank = (i > 0 && rows[i - 1].pts === r.pts && rows[i - 1].correct === r.correct && rows[i - 1].wrong === r.wrong)
      ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

function pickemBuildDigestEmail({ name, uid, top5, ytdRows, upsets, lastWeekLabel, weekGames, weekLabel, picked }) {
  const me = ytdRows.find(r => r.uid === uid);
  const rowsHtml = top5.map(r => `
    <tr${r.uid === uid ? ' style="background:#fef9c3;"' : ''}>
      <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#718096;width:28px;">${r.rank}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#2d3748;font-weight:600;">${pickemEscape(r.name)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#718096;">${r.correct}-${r.wrong}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#2d5016;font-weight:700;">${r.pts} pts</td>
    </tr>`).join('');
  const meLine = me && !top5.some(r => r.uid === uid)
    ? `<p style="margin:10px 0 0;font-size:0.85rem;color:#4a5568;">You're <strong>#${me.rank}</strong> with ${me.pts} pts (${me.correct}-${me.wrong}).</p>`
    : (!me ? `<p style="margin:10px 0 0;font-size:0.85rem;color:#4a5568;">You haven't scored yet &mdash; get some picks in!</p>` : '');

  const standingsHtml = top5.length ? `
    <h3 style="margin:0 0 8px;font-size:1rem;color:#2d3748;">Season Top 5</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">${rowsHtml}</table>${meLine}` : '';

  const upsetsHtml = upsets.length ? `
    <h3 style="margin:24px 0 8px;font-size:1rem;color:#2d3748;">Upsets Last Week</h3>
    <p style="margin:0 0 8px;font-size:0.8rem;color:#718096;">${pickemEscape(lastWeekLabel)} &middot; right pick = 2 pts</p>
    ${upsets.map(u => `
      <div style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:0.875rem;color:#2d3748;">
        <strong>${pickemEscape(u.winnerName)}</strong> beat ${pickemEscape(u.loserName)}
        <span style="color:#d97706;"> &mdash; only ${u.winnerPicks} of ${u.total} picked them</span>
      </div>`).join('')}` : '';

  // Group this week's games by day
  const byDay = {};
  weekGames.forEach(g => { (byDay[g.dayKey] = byDay[g.dayKey] || []).push(g); });
  const weekHtml = Object.keys(byDay).sort().map(k => {
    const g0 = byDay[k][0];
    const label = `${PICKEM_DAYS[new Date(Date.UTC(g0.dp.y, g0.dp.m, g0.dp.day)).getUTCDay()]}, ${PICKEM_MONTHS[g0.dp.m]} ${g0.dp.day}`;
    return `
      <div style="margin-top:12px;font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#718096;">${label}</div>
      ${byDay[k].map(g => {
        const done = picked.has(g.id);
        return `<div style="padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:0.875rem;color:#2d3748;">
          ${pickemEscape(g.awayName)} @ ${pickemEscape(g.homeName)}
          <span style="color:#718096;"> &middot; ${pickemEscape(g.time || pickemFormatLock(g.lockAt))}</span>
          <span style="float:right;color:${done ? '#16a34a' : '#d97706'};">${done ? 'Picked' : 'Needs pick'}</span>
        </div>`;
      }).join('')}`;
  }).join('');
  const nPicked = weekGames.filter(g => picked.has(g.id)).length;
  const previewHtml = `
    <h3 style="margin:24px 0 4px;font-size:1rem;color:#2d3748;">This Week's Games</h3>
    <p style="margin:0;font-size:0.8rem;color:#718096;">${pickemEscape(weekLabel)} &middot; you've picked ${nPicked} of ${weekGames.length} &middot; each game locks at first pitch</p>
    ${weekHtml}`;

  const nMissing = weekGames.length - nPicked;
  const subject = nMissing > 0
    ? `Pick'em: this week's ${weekGames.length} games are open (${nMissing} to pick)`
    : `Pick'em weekly recap: you're all set for this week`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#2d5016;border-radius:12px 12px 0 0;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:1.1rem;">Weekly Pick'em Recap &amp; Preview</h2>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 18px;color:#2d3748;font-size:0.95rem;">Hey ${pickemEscape(name)}, here's where things stand heading into the week.</p>
        ${standingsHtml}
        ${upsetsHtml}
        ${previewHtml}
        <div style="margin:24px 0 8px;text-align:center;">
          <a href="${PICKEM_URL}" style="display:inline-block;background:#2d5016;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">Make my picks</a>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:0.8rem;color:#a0aec0;">
          You're getting this because you play Pick'em. To stop these, turn off "Pick'em Emails" under
          Email Notifications on your <a href="${PICKEM_PROFILE_URL}" style="color:#a0aec0;">profile</a>.
        </div>
      </div>
    </div>`;
  return { subject, html };
}

async function runPickemDigest({ dryRun = false, force = false } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !dryRun) return { success: false, message: 'RESEND_API_KEY not set' };

  const season = await getCurrentSeason();
  if (!season) return { success: false, message: 'No active season' };

  const nowMs = Date.now();
  const [gamesSnap, entriesSnap] = await Promise.all([
    db.collection('seasons').doc(season.id).collection('games').get(),
    db.collection('pickem').doc(season.id).collection('entries').get()
  ]);
  const games = gamesSnap.docs.map(d => pickemNormalizeGame({ id: d.id, ...d.data() })).filter(Boolean);
  const entries = entriesSnap.docs.map(d => {
    const data = d.data();
    const picks = {};
    Object.entries(data.picks || {}).forEach(([gid, p]) => {
      if (p) picks[gid] = { team: p.team, atMs: p.at && p.at.toMillis ? p.at.toMillis() : null };
    });
    return { uid: d.id, displayName: data.displayName || 'Unknown', picks };
  });
  if (!entries.length) return { success: true, message: 'No pick\'em entries yet', sent: 0 };

  // Weeks run Monday-Sunday (ET). Anchor = the Monday on/before today.
  const t = pickemEtParts(nowMs);
  const today = { y: t.y, m: t.m, day: t.day };
  const todayDow = new Date(Date.UTC(today.y, today.m, today.day)).getUTCDay();
  const thisMon = pickemAddDays(today, -((todayDow + 6) % 7));
  const thisSun = pickemAddDays(thisMon, 6);
  const lastMon = pickemAddDays(thisMon, -7);
  const lastSun = pickemAddDays(thisMon, -1);
  const inRange = (g, a, b) => g.dayKey >= pickemDpKey(a) && g.dayKey <= pickemDpKey(b);
  const fmt = (dp) => `${PICKEM_MONTHS[dp.m]} ${dp.day}`;

  const weekGames = games
    .filter(g => inRange(g, thisMon, thisSun) && !g.isFinal && !g.isTBD && !g.cancelled && g.lockAt > nowMs)
    .sort((a, b) => (a.lockAt - b.lockAt) || a.homeName.localeCompare(b.homeName));
  if (!weekGames.length) {
    console.log("📅 Pick'em digest: no open games this week - skipping");
    return { success: true, message: 'No open games this week', sent: 0 };
  }

  const ytdRows = pickemScore(entries, games);
  const gradedYtd = games.filter(g => g.isGraded).length;
  const top5 = gradedYtd ? ytdRows.filter(r => r.rank <= 5).slice(0, 8) : [];   // keeps ties at #5, capped at 8
  const upsets = games
    .filter(g => inRange(g, lastMon, lastSun))
    .map(g => pickemUpsetInfo(entries, g))
    .filter(Boolean)
    .sort((a, b) => (a.winnerPicks / a.total) - (b.winnerPicks / b.total));

  // Dedupe
  const dateKey = pickemDpKey(today);
  const logRef = db.collection('pickem').doc(season.id).collection('reminderLog').doc(`digest-${dateKey}`);
  const logSnap = await logRef.get();
  const alreadySent = new Set(force ? [] : (logSnap.exists ? (logSnap.data().sent || []) : []));

  // Resolve emails + opt-outs
  const targets = entries.filter(e => !alreadySent.has(e.uid));
  const userDocs = [];
  for (let i = 0; i < targets.length; i += 300) {
    userDocs.push(...await db.getAll(...targets.slice(i, i + 300).map(e => db.collection('users').doc(e.uid))));
  }
  const recipients = [];
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i];
    const u = userDocs[i].exists ? userDocs[i].data() : {};
    if (u.emailPreferences && u.emailPreferences.pickemReminders === false) continue;
    let email = u.email;
    if (!email) {
      try { email = (await admin.auth().getUser(e.uid)).email; } catch (err) { /* no auth record */ }
    }
    if (!email) continue;
    const name = u.preferredDisplayName || u.displayName || e.displayName || 'there';
    const picked = new Set(weekGames.filter(g => pickemValidPick(e, g)).map(g => g.id));
    recipients.push({ uid: e.uid, email, name, picked });
  }

  const common = {
    top5, ytdRows, upsets,
    lastWeekLabel: `${fmt(lastMon)} - ${fmt(lastSun)}`,
    weekGames, weekLabel: `${fmt(thisMon)} - ${fmt(thisSun)}`
  };
  console.log(`📅 Pick'em digest: ${weekGames.length} open games, ${upsets.length} upsets last week, ${recipients.length} recipients${dryRun ? ' (DRY RUN)' : ''}`);

  if (dryRun) {
    const sample = recipients[0] ? pickemBuildDigestEmail({ ...common, ...recipients[0] }) : null;
    return {
      success: true, dryRun: true,
      gamesThisWeek: weekGames.length,
      top5: top5.map(r => ({ rank: r.rank, name: r.name, pts: r.pts, record: `${r.correct}-${r.wrong}` })),
      upsets: upsets.map(u => `${u.winnerName} over ${u.loserName} (${u.winnerPicks}/${u.total})`),
      wouldSend: recipients.length,
      recipients: recipients.map(r => ({ name: r.name, email: r.email, picked: r.picked.size })),
      sampleSubject: sample && sample.subject,
      sampleHtml: sample && sample.html
    };
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const CHUNK = 50;
  let sent = 0, failed = 0;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    if (i > 0) await sleep(1000);
    const chunk = recipients.slice(i, i + CHUNK);
    const payload = chunk.map(r => {
      const { subject, html } = pickemBuildDigestEmail({ ...common, ...r });
      return { from: 'Mountainside Aces <noreply@acessoftballreference.com>', to: [r.email], subject, html };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        sent += chunk.length;
        await logRef.set({
          sent: admin.firestore.FieldValue.arrayUnion(...chunk.map(r => r.uid)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        failed += chunk.length;
        console.error(`❌ Pick'em digest batch failed (${res.status}):`, await res.text());
      }
    } catch (err) {
      failed += chunk.length;
      console.error("❌ Pick'em digest batch threw:", err.message);
    }
  }
  console.log(`✅ Pick'em digest sent: ${sent}, failed: ${failed}`);
  return { success: failed === 0, sent, failed };
}

exports.sendPickemDigest = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .pubsub
  .schedule('0 8 * * 1')
  .timeZone('America/New_York')
  .onRun(async () => {
    await runPickemDigest();
    return null;
  });

// Admin-only manual run. data: { dryRun?: bool, force?: bool }
exports.triggerPickemDigest = functions
  .runWith({ secrets: ['RESEND_API_KEY'] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const u = userDoc.data();
    if (!(u?.role === 'admin' || u?.isAdmin === true || u?.userRole === 'admin')) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }
    return runPickemDigest({ dryRun: data?.dryRun === true, force: data?.force === true });
  });
