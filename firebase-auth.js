// firebase-auth.js
// v2.0 shim. The code now lives in:
//   js/core/auth.js          session (onAuthChange, getCurrentUser) and role checks
//   js/core/account.js       register, sign in/out, passwords, persistence, verification
//   js/data/users.js         profile read/update, favorites, profile page
//   js/data/team-staff.js    team-staff requests
//   js/data/player-links.js  player link requests, linkPlayerToUser, aggregatePlayerStats
// This file re-exports all of them under the same names so pages that still
// import firebase-auth.js keep working. New code imports from js/ directly.
// Deleted in Phase 4.
//
// Two things stay here until their pages move:
//   - getPrimaryDisplayRole with emoji icons (core/auth.js returns sprite icon
//     names; schedule-rework and league-schedule-editor print the emoji)
//   - migrateUserToNewRoleSystem (moves with the admin pages in Phase 3)
//
// onAuthChange is core/auth.js's: callbacks now get (user, profile) instead of
// (user). Pages that take one argument are unaffected.

// firebase-data.js first: it loads firebase-config.js, which creates the
// Firebase app on legacy pages (same import order as before the split).
import './firebase-data.js';

import { db, doc, getDoc, updateDoc, serverTimestamp } from './js/core/firebase.js';
import { USER_ROLES, isAdmin, isLeagueStaff, isUserCaptain } from './js/core/auth.js';

// Re-export Firebase auth functions for other modules
export { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// core/auth.js also sets window.auth and fires 'firebase-auth-ready' for the nav.
export {
  auth,
  USER_ROLES,
  ROLE_PERMISSIONS,
  getCurrentUser,
  onAuthChange,
  hasPermission,
  canManageUser,
  hasSpecialRole,
  isUserCaptain,
  isTeamCaptain,
  isTeamStaff,
  hasLeagueRole,
  isAdmin,
  isLeagueStaff,
  canAccessCaptainFeatures,
  canManageTeam,
  canSubmitForTeam,
  getUserTeamIds,
  canSubmitForGame,
  getActiveTeamRoles,
  getCaptainTeams
} from './js/core/auth.js';

export {
  registerUser,
  loginUser,
  loginWithGoogle,
  logoutUser,
  resetPassword,
  setAuthPersistence,
  changeUserPassword,
  needsEmailVerification,
  resendVerificationEmail,
  refreshVerificationStatus,
  getVerificationInfo,
  syncEmailVerificationStatus
} from './js/core/account.js';

export {
  getUserProfile,
  updateUserProfile,
  getProfilePageForUser,
  ensureCorrectProfilePage,
  addFavoriteTeam,
  addFavoritePlayer
} from './js/data/users.js';

export {
  requestTeamStaffAccess,
  approveTeamStaff,
  removeTeamStaff,
  denyTeamStaffRequest,
  getTeamStaffRequests,
  getTeamStaffMembers
} from './js/data/team-staff.js';

export {
  linkPlayerToUser,
  aggregatePlayerStats,
  requestPlayerLink,
  processPlayerLinkRequest,
  approvePlayerLink,
  denyPlayerLink,
  getPendingPlayerLinkRequests,
  cancelPlayerLinkRequest,
  requestPlayerUnlink
} from './js/data/player-links.js';

/**
 * Get the user's primary display role for UI badges
 * Returns the highest-level role for display purposes
 * @param {Object} userProfile - User profile object
 * @returns {Object} { role: string, label: string, icon: string }
 */
export function getPrimaryDisplayRole(userProfile) {
  if (!userProfile) return { role: 'unknown', label: 'Unknown', icon: '👤' };
  
  // Priority order: Admin > League Staff > Captain > Team Staff > Player > Fan/Family
  if (isAdmin(userProfile)) {
    return { role: 'admin', label: 'Admin', icon: '👑' };
  }
  
  if (isLeagueStaff(userProfile)) {
    return { role: 'league-staff', label: 'League Staff', icon: '⚙️' };
  }
  
  if (isUserCaptain(userProfile)) {
    return { role: 'captain', label: 'Captain', icon: '🎯' };
  }
  
  // Check for team-staff in any team
  if (userProfile.teamRoles) {
    const hasTeamStaff = Object.values(userProfile.teamRoles).some(
      tr => tr.role === USER_ROLES.TEAM_STAFF && tr.status === 'active'
    );
    if (hasTeamStaff) {
      return { role: 'team-staff', label: 'Team Staff', icon: '📋' };
    }
  }
  
  if (userProfile.userRole === USER_ROLES.PLAYER || userProfile.linkedPlayer) {
    return { role: 'player', label: 'Player', icon: '🥎' };
  }
  
  if (userProfile.userRole === USER_ROLES.FAMILY) {
    return { role: 'family', label: 'Family', icon: '👨‍👩‍👧' };
  }
  
  return { role: 'fan', label: 'Fan', icon: '📣' };
}

// ========================================
// MIGRATION HELPER
// ========================================

/**
 * Migrate existing user to new role system
 * Run this once to migrate all existing users
 */
export async function migrateUserToNewRoleSystem(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    
    // Skip if already migrated
    if (userData.teamRoles && Object.keys(userData.teamRoles).length > 0) {
      console.log('ℹ️ User already migrated:', userId);
      return { success: true, message: 'Already migrated' };
    }
    
    const updates = {
      teamRoles: {},
      updatedAt: serverTimestamp()
    };
    
    // Determine role based on existing data
    if (userData.isCaptain && userData.linkedTeam) {
      updates.userRole = USER_ROLES.CAPTAIN;
      updates.teamRoles[userData.linkedTeam] = {
        role: USER_ROLES.CAPTAIN,
        approvedBy: 'system',
        approvedAt: serverTimestamp(),
        canBeRemovedBy: [],
        status: 'active'
      };
    } else if (userData.linkedPlayer && userData.linkedTeam) {
      updates.userRole = USER_ROLES.PLAYER;
    } else {
      updates.userRole = USER_ROLES.FAN;
    }
    
    // Initialize empty arrays if not present
    if (!userData.staffRequests) {
      updates.staffRequests = [];
    }
    
    if (!userData.preferences) {
      updates.preferences = {
        emailGameReminders: true,
        emailScoreUpdates: false,
        favoriteTeamNotifications: true,
        favoritePlayerAlerts: true,
        publicFavorites: false,
        defaultStatsView: 'season',
        defaultSeason: 'current'
      };
    }
    
    await updateDoc(doc(db, 'users', userId), updates);
    console.log('✅ User migrated to new role system:', userId);
    return { success: true, message: 'Migration successful' };
    
  } catch (error) {
    console.error('❌ Error migrating user:', error);
    return { success: false, error: error.code };
  }
}
