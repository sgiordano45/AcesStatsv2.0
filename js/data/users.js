// js/data/users.js
// The signed-in user's users/{uid} doc: read, update, favorites, and which
// profile page fits their role.
// Moved unchanged from firebase-auth.js (only the imports changed and the info
// console.log lines were dropped); firebase-auth.js re-exports these.

import { db, doc, getDoc, updateDoc, serverTimestamp } from '../core/firebase.js';
import { USER_ROLES } from '../core/auth.js';

export async function getUserProfile(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return { success: true, data: userDoc.data() };
    }
    return { success: false, message: 'User profile not found' };
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return { success: false, error: error.code };
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...updates,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Get the correct profile page URL for a user's role
 * @param {Object} userProfile - User profile data
 * @returns {string} - URL to correct profile page
 */
export function getProfilePageForUser(userProfile) {
  if (!userProfile) return 'profile-fan.html'; // Default to fan
  
  const role = userProfile.userRole;
  
  // Fans and family use fan profile
  if (role === USER_ROLES.FAN || role === USER_ROLES.FAMILY) {
    return 'profile-fan.html';
  }
  
  // Players, captains, team-staff, league-staff, admin use full profile
  return 'profile.html';
}

/**
 * Redirect user to correct profile page if on wrong one
 * @param {Object} userProfile - User profile data
 * @param {string} currentPage - Current page filename (e.g., 'profile.html')
 */
export function ensureCorrectProfilePage(userProfile, currentPage) {
  const correctPage = getProfilePageForUser(userProfile);
  
  if (currentPage !== correctPage) {
    window.location.href = correctPage;
  }
}

export async function addFavoriteTeam(userId, teamId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const currentFavorites = userDoc.data()?.favoriteTeams || [];
    
    if (!currentFavorites.includes(teamId)) {
      currentFavorites.push(teamId);
      await updateDoc(userRef, {
        favoriteTeams: currentFavorites,
        updatedAt: serverTimestamp()
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding favorite team:', error);
    return { success: false, error: error.code };
  }
}

export async function addFavoritePlayer(userId, playerName) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const currentFavorites = userDoc.data()?.favoritePlayers || [];
    
    if (!currentFavorites.includes(playerName)) {
      currentFavorites.push(playerName);
      await updateDoc(userRef, {
        favoritePlayers: currentFavorites,
        updatedAt: serverTimestamp()
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding favorite player:', error);
    return { success: false, error: error.code };
  }
}
