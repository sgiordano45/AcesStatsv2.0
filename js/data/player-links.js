// js/data/player-links.js
// Linking an account to a player: request, process, approve, deny, pending,
// cancel, unlink, plus the direct link (linkPlayerToUser) and the stats
// aggregation it runs (aggregatePlayerStats).
// Moved unchanged from firebase-auth.js (only the imports changed and the info
// console.log lines were dropped); firebase-auth.js re-exports these.

import { updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, db, doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp } from '../core/firebase.js';
import { USER_ROLES, hasPermission } from '../core/auth.js';

export async function linkPlayerToUser(userId, playerName, teamId, isCaptain = false) {
  try {
    const user = auth.currentUser;
    
    // Update auth user's display name to match player profile
      if (playerName && user && user.uid === userId) {
      try {
        await updateProfile(user, { displayName: playerName });
      } catch (profileUpdateError) {
        console.error('⚠️ Could not update auth profile:', profileUpdateError);
      }
    }
    
    let existingPlayerData = null;
    let playerUserId = null;
    
    if (playerName) {
      playerUserId = playerName.toLowerCase().replace(/\s+/g, '_');
      
      try {
        const oldPlayerRef = doc(db, 'users', playerUserId);
        const oldPlayerDoc = await getDoc(oldPlayerRef);
        
        if (oldPlayerDoc.exists()) {
          existingPlayerData = oldPlayerDoc.data();
        } else {
        }
      } catch (profileError) {
        console.warn('Could not fetch old player profile:', profileError);
      }
    }
    
    const userRef = doc(db, 'users', userId);
    const updateData = {
      displayName: playerName,
      linkedPlayer: playerName,
      linkedTeam: teamId,
      isCaptain: isCaptain,
      updatedAt: serverTimestamp()
    };
    
    // Determine user role based on captain status
    if (isCaptain) {
      updateData.userRole = USER_ROLES.CAPTAIN;
      
      // Initialize teamRoles if captain
      updateData.teamRoles = {
        [teamId]: {
          role: USER_ROLES.CAPTAIN,
          approvedBy: 'system', // System-assigned captain
          approvedAt: serverTimestamp(),
          canBeRemovedBy: [], // Only league-staff/admin can remove
          status: 'active'
        }
      };
    } else {
      updateData.userRole = USER_ROLES.PLAYER;
    }
    
    // Merge existing player data
    if (existingPlayerData) {
      // CRITICAL FIX: Check for captain status in legacy profile
      if (existingPlayerData.role === 'captain' || existingPlayerData.isCaptain === true) {
        updateData.isCaptain = true;
        updateData.userRole = USER_ROLES.CAPTAIN;
        
        updateData.teamRoles = {
          [teamId]: {
            role: USER_ROLES.CAPTAIN,
            approvedBy: 'system',
            approvedAt: serverTimestamp(),
            canBeRemovedBy: [],
            status: 'active'
          }
        };
        
      }
      
      if (existingPlayerData.favoriteTeams) updateData.favoriteTeams = existingPlayerData.favoriteTeams;
      if (existingPlayerData.favoritePlayers) updateData.favoritePlayers = existingPlayerData.favoritePlayers;
      if (existingPlayerData.stats) updateData.stats = existingPlayerData.stats;
      if (existingPlayerData.seasonStats) updateData.seasonStats = existingPlayerData.seasonStats;
      if (existingPlayerData.careerStats) updateData.careerStats = existingPlayerData.careerStats;
      if (existingPlayerData.role) updateData.role = existingPlayerData.role;
      if (existingPlayerData.currentTeam && !teamId) updateData.linkedTeam = existingPlayerData.currentTeam;
      
	  // ADD THESE LINES FOR PLAYER INFO:
  if (existingPlayerData.bats) updateData.bats = existingPlayerData.bats;
  if (existingPlayerData.batting) updateData.bats = existingPlayerData.batting; // fallback field name
  if (existingPlayerData.throws) updateData.throws = existingPlayerData.throws;
  if (existingPlayerData.throwing) updateData.throws = existingPlayerData.throwing; // fallback field name
  if (existingPlayerData.position) updateData.position = existingPlayerData.position;
  if (existingPlayerData.number) updateData.number = existingPlayerData.number;
  if (existingPlayerData.nickname) updateData.nickname = existingPlayerData.nickname;
  if (existingPlayerData.photo) updateData.photo = existingPlayerData.photo;
  if (existingPlayerData.photoURL) updateData.photoURL = existingPlayerData.photoURL;
	  
      updateData.mergedFromProfile = playerUserId;
      updateData.mergedAt = serverTimestamp();
      
    }
    
    await updateDoc(userRef, updateData);
    
    // Mark legacy profile as migrated
    if (existingPlayerData && playerUserId) {
      try {
        const oldPlayerRef = doc(db, 'users', playerUserId);
        await updateDoc(oldPlayerRef, {
          migrated: true,
          migratedTo: userId,
          migratedAt: serverTimestamp()
        });
      } catch (migrationError) {
        console.warn('Could not mark legacy profile as migrated:', migrationError);
      }
    }
    
    // Aggregate player stats for this newly linked player
    if (playerName) {
      const aggregateResult = await aggregatePlayerStats(userId, playerName, teamId);
      if (aggregateResult.success) {
      } else {
        console.warn('⚠️ Stats aggregation failed:', aggregateResult.error);
        // Don't fail the link - aggregation can be retried
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error linking player:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Aggregate player stats when a player links their account
 * Creates/updates aggregatedPlayerStats document with all season data
 * @param {string} userId - Auth user's ID (will be the document ID)
 * @param {string} playerName - The linked player's name
 * @param {string} teamId - Current team ID
 * @returns {Promise<Object>} Result with success status and season count
 */
export async function aggregatePlayerStats(userId, playerName, teamId) {
  try {
    // Convert player name to stats lookup ID (legacy format)
    // Remove periods (Jr. → Jr) before converting spaces to underscores
    const statsLookupId = playerName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');
    
    
    // ========================================
    // FETCH BATTING SEASONS
    // ========================================
    const seasonsRef = collection(db, 'playerStats', statsLookupId, 'seasons');
    const seasonsSnapshot = await getDocs(seasonsRef);
    
    const seasonStatsObject = {};
    const calculatedCareerStats = {
      games: 0,
      atBats: 0,
      hits: 0,
      runs: 0,
      walks: 0,
      doubles: 0,
      triples: 0,
      homeRuns: 0,
      rbi: 0,
      acesBPITotal: 0,
      acesBPICount: 0
    };
    
    seasonsSnapshot.forEach(seasonDoc => {
      const data = seasonDoc.data();
      const seasonId = seasonDoc.id;
      
      const games = data.games || 0;
      const atBats = data.atBats || 0;
      const hits = data.hits || 0;
      const runs = data.runs || 0;
      const walks = data.walks || 0;
      const doubles = data.doubles || data['2B'] || 0;
      const triples = data.triples || data['3B'] || 0;
      const homeRuns = data.homeRuns || data.HR || 0;
      const rbi = data.rbi || data.RBI || 0;
      const acesBPI = data.acesBPI || data.acesWar || 0;
      const sub = data.sub || data.Sub || "No";
      const team = data.team || "";
      
      // Add to career totals
      calculatedCareerStats.games += games;
      calculatedCareerStats.atBats += atBats;
      calculatedCareerStats.hits += hits;
      calculatedCareerStats.runs += runs;
      calculatedCareerStats.walks += walks;
      calculatedCareerStats.doubles += doubles;
      calculatedCareerStats.triples += triples;
      calculatedCareerStats.homeRuns += homeRuns;
      calculatedCareerStats.rbi += rbi;
      
      if (acesBPI !== 0 && sub.toLowerCase() !== "yes") {
        calculatedCareerStats.acesBPITotal += acesBPI;
        calculatedCareerStats.acesBPICount++;
      }
      
      // Store with seasonId as KEY
      seasonStatsObject[seasonId] = {
        team: team,
        games: games,
        atBats: atBats,
        hits: hits,
        runs: runs,
        walks: walks,
        doubles: doubles,
        triples: triples,
        homeRuns: homeRuns,
        rbi: rbi,
        battingAverage: atBats > 0 ? (hits / atBats) : 0,
        onBasePercentage: (atBats + walks) > 0 ? ((hits + walks) / (atBats + walks)) : 0,
        acesBPI: acesBPI,
        sub: sub
      };
    });
    
    // Calculate career batting stats
    const careerBattingAverage = calculatedCareerStats.atBats > 0
      ? (calculatedCareerStats.hits / calculatedCareerStats.atBats) : 0;
    const careerOnBasePercentage = (calculatedCareerStats.atBats + calculatedCareerStats.walks) > 0
      ? ((calculatedCareerStats.hits + calculatedCareerStats.walks) / (calculatedCareerStats.atBats + calculatedCareerStats.walks)) : 0;
    const careerAcesBPI = calculatedCareerStats.acesBPICount > 0
      ? (calculatedCareerStats.acesBPITotal / calculatedCareerStats.acesBPICount) : 0;
    
    // ========================================
    // FETCH PITCHING SEASONS
    // ========================================
    let pitchingSeasonsSnapshot;
    let hasPitchingData = false;
    
    try {
      const pitchingSeasonsRef = collection(db, 'pitchingStats', statsLookupId, 'seasons');
      pitchingSeasonsSnapshot = await getDocs(pitchingSeasonsRef);
      hasPitchingData = !pitchingSeasonsSnapshot.empty;
    } catch (error) {
      hasPitchingData = false;
    }
    
    const pitchingSeasonStatsObject = {};
    const calculatedPitchingCareer = {
      games: 0,
      inningsPitched: 0,
      earnedRuns: 0,
      strikeouts: 0,
      walks: 0,
      wins: 0,
      losses: 0,
      saves: 0
    };
    
    if (hasPitchingData) {
      pitchingSeasonsSnapshot.forEach(seasonDoc => {
        const data = seasonDoc.data();
        const seasonId = seasonDoc.id;
        
        const games = data.games || 0;
        const ip = data.inningsPitched || data.IP || data.ip || 0;
        const era = data.era || data.ERA || data.earnedRunAverage || 0;
        const runsAllowed = data.runsAllowed || 0;
        const strikeouts = data.strikeouts || data.K || data.k || data.SO || 0;
        const walks = data.walks || data.BB || data.bb || 0;
        const wins = data.wins || data.W || 0;
        const losses = data.losses || data.L || 0;
        const saves = data.saves || data.SV || 0;
        
        const earnedRuns = runsAllowed > 0 ? runsAllowed : (ip > 0 && era > 0 ? (era * ip) / 7 : 0);
        
        calculatedPitchingCareer.games += games;
        calculatedPitchingCareer.inningsPitched += ip;
        calculatedPitchingCareer.earnedRuns += earnedRuns;
        calculatedPitchingCareer.strikeouts += strikeouts;
        calculatedPitchingCareer.walks += walks;
        calculatedPitchingCareer.wins += wins;
        calculatedPitchingCareer.losses += losses;
        calculatedPitchingCareer.saves += saves;
        
        pitchingSeasonStatsObject[seasonId] = {
          team: data.team || '',
          games: games,
          inningsPitched: ip,
          earnedRunAverage: era,
          runsAllowed: runsAllowed,
          strikeouts: strikeouts,
          walks: walks,
          wins: wins,
          losses: losses,
          saves: saves
        };
      });
    }
    
    const careerEarnedRunAverage = calculatedPitchingCareer.inningsPitched > 0
      ? (calculatedPitchingCareer.earnedRuns * 7) / calculatedPitchingCareer.inningsPitched : 0;
    
    // ========================================
    // CREATE AGGREGATED DOCUMENT
    // ========================================
    const aggregatedData = {
      userId: userId,
      name: playerName,
      currentTeam: teamId || '',
      
      // Mark as auth user (not legacy)
      isAuthUser: true,
      linkedPlayer: playerName,
      migrated: false,
      
      // Career stats
      career: {
        games: calculatedCareerStats.games,
        atBats: calculatedCareerStats.atBats,
        hits: calculatedCareerStats.hits,
        runs: calculatedCareerStats.runs,
        walks: calculatedCareerStats.walks,
        doubles: calculatedCareerStats.doubles,
        triples: calculatedCareerStats.triples,
        homeRuns: calculatedCareerStats.homeRuns,
        rbi: calculatedCareerStats.rbi,
        battingAverage: careerBattingAverage,
        onBasePercentage: careerOnBasePercentage,
        acesBPI: careerAcesBPI,
        
        pitching: {
          games: calculatedPitchingCareer.games,
          inningsPitched: calculatedPitchingCareer.inningsPitched,
          earnedRunAverage: careerEarnedRunAverage,
          runsAllowed: calculatedPitchingCareer.earnedRuns,
          strikeouts: calculatedPitchingCareer.strikeouts,
          walks: calculatedPitchingCareer.walks,
          wins: calculatedPitchingCareer.wins,
          losses: calculatedPitchingCareer.losses,
          saves: calculatedPitchingCareer.saves
        }
      },
      
      // Store as OBJECT with seasonId keys
      seasons: seasonStatsObject,
      pitchingSeasons: pitchingSeasonStatsObject,
      
      // Metadata
      totalSeasons: Object.keys(seasonStatsObject).length,
      hasPitchingStats: Object.keys(pitchingSeasonStatsObject).length > 0,
      lastUpdated: serverTimestamp(),
      aggregatedAt: serverTimestamp()
    };
    
    // Write to aggregatedPlayerStats with auth user's ID
    const aggregatedRef = doc(db, 'aggregatedPlayerStats', userId);
    await setDoc(aggregatedRef, aggregatedData, { merge: true });
    
    
    // ========================================
    // MARK LEGACY AGGREGATED PROFILE AS MIGRATED
    // ========================================
    if (statsLookupId !== userId) {
      try {
        const legacyAggregatedRef = doc(db, 'aggregatedPlayerStats', statsLookupId);
        const legacyAggregatedDoc = await getDoc(legacyAggregatedRef);
        
        if (legacyAggregatedDoc.exists()) {
          await updateDoc(legacyAggregatedRef, {
            migrated: true,
            migratedTo: userId,
            migratedAt: serverTimestamp()
          });
        }
      } catch (migrationError) {
        // Silently continue if legacy aggregated profile doesn't exist
      }
    }
    
    return { 
      success: true, 
      seasons: Object.keys(seasonStatsObject).length,
      pitchingSeasons: Object.keys(pitchingSeasonStatsObject).length
    };
    
  } catch (error) {
    console.error('❌ Error aggregating player stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Request to link a player account (requires approval)
 * @param {string} userId - User's Firebase UID
 * @param {string} playerName - Player name to link
 * @param {string} teamId - Team ID
 * @param {string} reason - Optional reason for linking
 * @returns {Promise<Object>}
 */
/**
 * Request to link a player account (requires approval) - FIXED VERSION
 * @param {string} userId - User's Firebase UID
 * @param {string} playerName - Player name to link
 * @param {string} teamId - Team ID
 * @param {string} reason - Optional reason for linking
 * @returns {Promise<Object>}
 */
export async function requestPlayerLink(userId, playerName, teamId, reason = '') {
  try {
    
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('❌ User not found:', userId);
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    
    // SECURITY CHECK: Track linking attempts
    const accountFlags = userData.accountFlags || {};
    const linkingAttempts = accountFlags.linkingAttempts || 0;
    
    // Rate limiting: Max 3 requests per hour
    const linkingHistory = accountFlags.linkingAttemptsHistory || [];
    const recentAttempts = linkingHistory.filter(attempt => {
      const attemptTime = new Date(attempt.timestamp);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return attemptTime > oneHourAgo;
    });
    
    if (recentAttempts.length >= 3) {
      console.warn('⚠️ Rate limit exceeded for user:', userId);
      return { 
        success: false, 
        message: 'Too many link requests. Please wait an hour before trying again.' 
      };
    }
    
    // Check if already linked
    if (userData.linkedPlayer) {
      console.warn('⚠️ User already has linked player:', userData.linkedPlayer);
      return { 
        success: false, 
        message: 'You already have a linked player. Please unlink first.' 
      };
    }
    
    // Check if there's already a pending request
    const playerLinkRequests = userData.playerLinkRequests || [];
    const pendingRequest = playerLinkRequests.find(
      r => r.status === 'pending' && r.playerName === playerName
    );
    
    if (pendingRequest) {
      console.warn('⚠️ Pending request already exists for:', playerName);
      return { 
        success: false, 
        message: 'You already have a pending request for this player' 
      };
    }
    
    // Check if this player is already claimed by someone else
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let playerAlreadyClaimed = false;
    
    usersSnapshot.forEach(docSnap => {
      if (docSnap.id !== userId) {
        const otherUserData = docSnap.data();
        if (otherUserData.linkedPlayer === playerName) {
          playerAlreadyClaimed = true;
          console.warn('⚠️ Player already claimed by:', docSnap.id);
        }
      }
    });
    
    if (playerAlreadyClaimed) {
      return { 
        success: false, 
        message: 'This player is already linked to another account. Contact league staff if this is incorrect.' 
      };
    }
    
    
    // Calculate name similarity
    const similarity = calculateNameSimilarity(userData.displayName, playerName);
    
    // Determine approval level with stricter thresholds for email users
    const registrationMethod = userData.registrationMethod || 'google';
    let approvalLevel = 'league-staff'; // Default to strictest
    
    if (registrationMethod === 'google') {
      // Google users get normal thresholds
      if (similarity >= 0.9) {
        approvalLevel = 'auto';
      } else if (similarity >= 0.6) {
        approvalLevel = 'captain';
      }
    } else {
      // Email users need higher similarity for auto-approval
      if (similarity >= 0.95) {
        approvalLevel = 'auto';
      } else if (similarity >= 0.8) {
        approvalLevel = 'captain';
      }
      // Otherwise stays as 'league-staff'
    }
    
    
    // Flag suspicious requests
    let requiresManualReview = false;
    if (similarity < 0.3 || linkingAttempts > 5) {
      requiresManualReview = true;
      approvalLevel = 'league-staff'; // Force manual review
      console.warn('⚠️ Request flagged for manual review');
    }
    
    // Create link request
    const now = new Date();
    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const newRequest = {
      requestId: `${userId}-${Date.now()}`,
      playerName: playerName,
      teamId: teamId,
      reason: reason || 'Player linking their account',
      requestedAt: now.toISOString(),
      requestedBy: userId,
      status: 'pending',
      approvalLevel: approvalLevel,
      reviewedBy: null,
      reviewedAt: null,
      expiresAt: expiresDate.toISOString(),
      securityInfo: {
        registrationMethod: registrationMethod,
        nameSimilarity: similarity,
        requiresManualReview: requiresManualReview,
        userDisplayName: userData.displayName,
        linkingAttemptNumber: linkingAttempts + 1
      }
    };
    
    
    // Add to array
    playerLinkRequests.push(newRequest);
    
    // Update linking attempts tracking
    const updatedHistory = [
      ...linkingHistory,
      {
        timestamp: now.toISOString(),
        playerName: playerName,
        approvalLevel: approvalLevel,
        similarity: similarity
      }
    ].slice(-10); // Keep last 10 attempts
    
    // Update Firestore
    await updateDoc(userRef, {
      playerLinkRequests: playerLinkRequests,
      'accountFlags.linkingAttempts': linkingAttempts + 1,
      'accountFlags.linkingAttemptsHistory': updatedHistory,
      'accountFlags.requiresManualReview': requiresManualReview,
      updatedAt: serverTimestamp()
    });
    
    
    // Return appropriate message based on approval level
    let message = '';
    if (approvalLevel === 'auto') {
      message = 'Perfect name match! Your account will be linked automatically.';
    } else if (approvalLevel === 'captain') {
      message = 'Link request submitted. Your team captain will review and approve.';
    } else {
      message = 'Link request submitted for review by league staff. This may take 1-2 business days.';
    }
    
    if (requiresManualReview) {
      message += ' (Manual review required due to security check)';
    }
    
    return { 
      success: true, 
      message: message,
      requestId: newRequest.requestId,
      approvalLevel: approvalLevel,
      similarity: similarity,
      requiresManualReview: requiresManualReview
    };
    
  } catch (error) {
    console.error('❌ Error requesting player link:', error);
    return { 
      success: false, 
      error: error.code,
      message: error.message || 'An error occurred while submitting the request'
    };
  }
}

/**
 * Determine what level of approval is needed
 * @param {Object} userData - User's profile data
 * @param {string} playerName - Player name
 * @param {string} teamId - Team ID
 * @returns {string} - 'auto', 'captain', 'league-staff'
 */
function determineApprovalLevel(userData, playerName, teamId) {
  // Level 1: AUTO-APPROVE if name match is very close
  const userDisplayName = userData.displayName || '';
  const nameSimilarity = calculateNameSimilarity(userDisplayName, playerName);
  
  if (nameSimilarity > 0.9) {
    return 'auto'; // 90%+ match = auto-approve
  }
  
  // Level 2: CAPTAIN APPROVAL for reasonable matches
  if (nameSimilarity > 0.6) {
    return 'captain'; // 60-90% match = captain approval
  }
  
  // Level 3: LEAGUE STAFF for low matches or disputes
  return 'league-staff'; // <60% match = requires league staff
}

/**
 * Calculate name similarity (simple algorithm)
 * @param {string} name1
 * @param {string} name2
 * @returns {number} - Similarity score 0-1
 */
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const clean1 = name1.toLowerCase().trim();
  const clean2 = name2.toLowerCase().trim();
  
  // Exact match
  if (clean1 === clean2) return 1.0;
  
  // Split into parts
  const parts1 = clean1.split(/\s+/);
  const parts2 = clean2.split(/\s+/);
  
  // Check if all parts of shorter name are in longer name
  const shorter = parts1.length <= parts2.length ? parts1 : parts2;
  const longer = parts1.length > parts2.length ? parts1 : parts2;
  
  let matches = 0;
  shorter.forEach(part => {
    if (longer.some(p => p.includes(part) || part.includes(p))) {
      matches++;
    }
  });
  
  return matches / Math.max(parts1.length, parts2.length);
}

/**
 * Process player link request (auto-approve if eligible)
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>}
 */
export async function processPlayerLinkRequest(requestId) {
  try {
    // Find the request
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let userDoc = null;
    let request = null;
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.playerLinkRequests || [];
      const found = requests.find(r => r.requestId === requestId);
      if (found) {
        userDoc = docSnap;
        request = found;
      }
    });
    
    if (!request) {
      return { success: false, message: 'Request not found' };
    }
    
    // Check if expired
    if (request.expiresAt && new Date(request.expiresAt.seconds * 1000) < new Date()) {
      return { success: false, message: 'Request has expired' };
    }
    
    // Auto-approve if eligible
    if (request.approvalLevel === 'auto') {
      return await approvePlayerLink('system', requestId, 'Auto-approved based on name match');
    }
    
    // Otherwise, wait for manual approval
    return { 
      success: true, 
      message: `Awaiting ${request.approvalLevel} approval`,
      approvalLevel: request.approvalLevel
    };
    
  } catch (error) {
    console.error('❌ Error processing player link:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Approve player link request
 * @param {string} approverId - User ID of approver (or 'system')
 * @param {string} requestId - Request ID
 * @param {string} notes - Optional approval notes
 * @returns {Promise<Object>}
 */
export async function approvePlayerLink(approverId, requestId, notes = '') {
  try {
    // Find the request
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let userId = null;
    let request = null;
    let userRef = null;
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.playerLinkRequests || [];
      const found = requests.find(r => r.requestId === requestId);
      if (found) {
        userId = docSnap.id;
        userRef = doc(db, 'users', docSnap.id);
        request = found;
      }
    });
    
    if (!request) {
      return { success: false, message: 'Request not found' };
    }
    
    if (request.status !== 'pending') {
      return { success: false, message: 'Request already processed' };
    }
    
    // If not system, verify approver has permission
    if (approverId !== 'system') {
      const approverDoc = await getDoc(doc(db, 'users', approverId));
      if (!approverDoc.exists()) {
        return { success: false, message: 'Approver not found' };
      }
      
      const approverData = approverDoc.data();
      
      // Check if approver has permission
      const hasPermission = await verifyApproverPermission(
        approverData,
        request.approvalLevel,
        request.teamId
      );
      
      if (!hasPermission) {
        return { success: false, message: 'Insufficient permissions to approve this request' };
      }
    }
    
    // Get the user data
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    const playerLinkRequests = userData.playerLinkRequests || [];
    
    // Update request status
    const updatedRequests = playerLinkRequests.map(r => {
      if (r.requestId === requestId) {
        return {
          ...r,
          status: 'approved',
          reviewedBy: approverId,
          reviewedAt: new Date().toISOString(),
          notes
        };
      }
      return r;
    });
    
    // Actually link the player (call existing linkPlayerToUser function)
    const linkResult = await linkPlayerToUser(
      userId,
      request.playerName,
      request.teamId,
      false // Not captain by default
    );
    
    if (!linkResult.success) {
      return { success: false, message: 'Failed to link player' };
    }
    
    // Update requests
    await updateDoc(userRef, {
      playerLinkRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Player link approved successfully',
      playerName: request.playerName
    };
    
  } catch (error) {
    console.error('❌ Error approving player link:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Deny player link request
 * @param {string} denierId - User ID of denier
 * @param {string} requestId - Request ID
 * @param {string} reason - Reason for denial
 * @returns {Promise<Object>}
 */
export async function denyPlayerLink(denierId, requestId, reason = '') {
  try {
    // Find the request
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let userRef = null;
    let request = null;
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.playerLinkRequests || [];
      const found = requests.find(r => r.requestId === requestId);
      if (found) {
        userRef = doc(db, 'users', docSnap.id);
        request = found;
      }
    });
    
    if (!request) {
      return { success: false, message: 'Request not found' };
    }
    
    // Verify denier has permission
    const denierDoc = await getDoc(doc(db, 'users', denierId));
    if (!denierDoc.exists()) {
      return { success: false, message: 'Denier not found' };
    }
    
    const denierData = denierDoc.data();
    const hasPermission = await verifyApproverPermission(
      denierData,
      request.approvalLevel,
      request.teamId
    );
    
    if (!hasPermission) {
      return { success: false, message: 'Insufficient permissions to deny this request' };
    }
    
    // Get user data
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    const playerLinkRequests = userData.playerLinkRequests || [];
    
    // Update request status
    const updatedRequests = playerLinkRequests.map(r => {
      if (r.requestId === requestId) {
        return {
          ...r,
          status: 'denied',
          reviewedBy: denierId,
          reviewedAt: new Date().toISOString(),
          denialReason: reason
        };
      }
      return r;
    });
    
    await updateDoc(userRef, {
      playerLinkRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Player link request denied',
      reason
    };
    
  } catch (error) {
    console.error('❌ Error denying player link:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Verify approver has permission for approval level
 * @param {Object} approverData - Approver's user data
 * @param {string} approvalLevel - Required approval level
 * @param {string} teamId - Team ID
 * @returns {Promise<boolean>}
 */
async function verifyApproverPermission(approverData, approvalLevel, teamId) {
  // Admin can approve anything
  if (approverData.userRole === USER_ROLES.ADMIN) {
    return true;
  }
  
  // League staff can approve anything
  if (approverData.userRole === USER_ROLES.LEAGUE_STAFF) {
    return true;
  }
  
  // Captain can approve captain-level requests for their team
  if (approvalLevel === 'captain') {
    const teamRole = approverData.teamRoles?.[teamId];
    if (teamRole?.role === USER_ROLES.CAPTAIN && teamRole?.status === 'active') {
      return true;
    }
  }
  
  return false;
}

/**
 * Get all pending player link requests (for captains/staff)
 * @param {string} teamId - Optional: filter by team
 * @returns {Promise<Object>}
 */
export async function getPendingPlayerLinkRequests(teamId = null) {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const pendingRequests = [];
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.playerLinkRequests || [];
      
      requests.forEach(req => {
        if (req.status === 'pending') {
          // Filter by team if specified
          if (!teamId || req.teamId === teamId) {
            pendingRequests.push({
              userId: docSnap.id,
              userName: userData.displayName,
              userEmail: userData.email,
              photoURL: userData.photoURL || null,
              ...req
            });
          }
        }
      });
    });
    
    // Sort by request date (oldest first)
    pendingRequests.sort((a, b) => {
      const timeA = a.requestedAt?.seconds || 0;
      const timeB = b.requestedAt?.seconds || 0;
      return timeA - timeB;
    });
    
    return { success: true, requests: pendingRequests };
    
  } catch (error) {
    console.error('❌ Error fetching player link requests:', error);
    return { success: false, error: error.code, requests: [] };
  }
}

/**
 * Cancel a pending player link request (user can cancel their own)
 * @param {string} userId - User ID
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>}
 */
export async function cancelPlayerLinkRequest(userId, requestId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    const playerLinkRequests = userData.playerLinkRequests || [];
    
    // Find and update the request
    const updatedRequests = playerLinkRequests.map(r => {
      if (r.requestId === requestId && r.status === 'pending') {
        return {
          ...r,
          status: 'cancelled',
          cancelledAt: new Date().toISOString()
        };
      }
      return r;
    });
    
    await updateDoc(userRef, {
      playerLinkRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, message: 'Request cancelled successfully' };
    
  } catch (error) {
    console.error('❌ Error cancelling request:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Unlink player (requires approval if player has stats)
 * @param {string} userId - User ID
 * @param {string} reason - Reason for unlinking
 * @returns {Promise<Object>}
 */
export async function requestPlayerUnlink(userId, reason = '') {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    
    if (!userData.linkedPlayer) {
      return { success: false, message: 'No player linked to unlink' };
    }
    
    // Check if player has significant stats (games played)
    // If yes, require captain/staff approval
    // If no, allow immediate unlink
    
    const hasStats = userData.stats?.games > 0 || userData.career?.games > 0;
    
    if (!hasStats) {
      // Allow immediate unlink for new accounts
      await updateDoc(userRef, {
        linkedPlayer: null,
        linkedTeam: null,
        isCaptain: false,
        userRole: USER_ROLES.FAN,
        teamRoles: {},
        updatedAt: serverTimestamp()
      });
      
      return { success: true, message: 'Player unlinked successfully' };
    }
    
    // Create unlink request for accounts with stats
    const unlinkRequests = userData.unlinkRequests || [];
    unlinkRequests.push({
      requestId: `unlink-${userId}-${Date.now()}`,
      playerName: userData.linkedPlayer,
      teamId: userData.linkedTeam,
      reason,
      requestedAt: serverTimestamp(),
      status: 'pending'
    });
    
    await updateDoc(userRef, {
      unlinkRequests,
      updatedAt: serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Unlink request submitted. Awaiting captain or league staff approval.' 
    };
    
  } catch (error) {
    console.error('❌ Error requesting unlink:', error);
    return { success: false, error: error.code };
  }
}
