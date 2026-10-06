// ROLE CONSTANTS AND PERMISSIONS
// AUTHENTICATION FUNCTIONS
// USER PROFILE FUNCTIONS
// TEAM STAFF MANAGEMENT FUNCTIONS
// PLAYER LINK APPROVAL SYSTEM HERE
// FAVORITES FUNCTIONS
// PERMISSION HELPER FUNCTIONS
// MIGRATION HELPER
// UTILITY FUNCTIONS

// firebase-auth.js - Enhanced with Team-Staff Role System
import { getAuth,
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         signInWithPopup,
         GoogleAuthProvider,
         signOut,
         onAuthStateChanged,
         sendPasswordResetEmail,
         sendEmailVerification,
         updateProfile,
         setPersistence,
         browserSessionPersistence,
         browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { app, db } from './firebase-data.js';

// firebase-messaging is imported lazily (dynamic import) so it doesn't block auth init
// It's only loaded when requestNotificationPermission is actually called
let _requestNotificationPermission = null;
async function requestNotificationPermission(...args) {
  if (!_requestNotificationPermission) {
    const mod = await import('./firebase-messaging.js');
    _requestNotificationPermission = mod.requestNotificationPermission;
  }
  return _requestNotificationPermission(...args);
}

// Re-export Firebase auth functions for other modules
export { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, updateProfile };

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ========================================
// ROLE CONSTANTS AND PERMISSIONS
// ========================================

export const USER_ROLES = {
  PLAYER: 'player',
  CAPTAIN: 'captain',
  TEAM_STAFF: 'team-staff',
  LEAGUE_STAFF: 'league-staff',
  FAN: 'fan',
  FAMILY: 'family',
  ADMIN: 'admin'
};

export const ROLE_PERMISSIONS = {
  player: {
    canViewOwnStats: true,
    canRSVPForSelf: true,
    canEditOwnProfile: true,
    canViewTeamRoster: true,
    canViewSchedule: true,
    canFavoriteTeams: true,
    canFavoritePlayers: true,
    canEditRoster: false,
    canEditLineup: false,
    canSubmitStats: false,
    canManageGames: false,
    canManageStaff: false,
    canRemoveCaptain: false
  },
  
  'team-staff': {
    canViewOwnStats: true,
    canRSVPForSelf: true,
    canEditOwnProfile: true,
    canViewTeamRoster: true,
    canViewSchedule: true,
    canEditRoster: true,
    canEditLineup: true,
    canManageRSVPs: true,
    canViewAllTeamStats: true,
    canCreateGames: true,
    canEditGameDetails: true,
    canAssignPositions: true,
    canSubmitStats: true,
    canFavoriteTeams: true,
    canFavoritePlayers: true,
    // Cannot do these (captain-only):
    canManageStaff: false,
    canRemoveCaptain: false,
    canPromoteToStaff: false,
    canTransferCaptaincy: false
  },
  
  captain: {
    canViewOwnStats: true,
    canRSVPForSelf: true,
    canEditOwnProfile: true,
    canViewTeamRoster: true,
    canViewSchedule: true,
    canEditRoster: true,
    canEditLineup: true,
    canManageRSVPs: true,
    canViewAllTeamStats: true,
    canCreateGames: true,
    canEditGameDetails: true,
    canAssignPositions: true,
    canSubmitStats: true,
    canFavoriteTeams: true,
    canFavoritePlayers: true,
    // Captain-exclusive:
    canManageStaff: true,
    canRemoveCaptain: false,
    canPromoteToStaff: true,
    canTransferCaptaincy: true
  },
  
  'league-staff': {
    canViewAllGames: true,
    canEditAnyGame: true,
    canSubmitStatsAnyTeam: true,
    canManageSeasons: true,
    canViewReports: true,
    canManageAwards: true,
    canApproveCaptains: true,
    canRemoveCaptain: true,
    canOverrideTeamStaff: true
  },
  
  fan: {
    canViewPublicStats: true,
    canViewPublicSchedule: true,
    canFavoriteTeams: true,
    canFavoritePlayers: true,
    canReceiveNotifications: true
  },
  
  family: {
    canViewPublicStats: true,
    canViewPublicSchedule: true,
    canFavoriteTeams: true,
    canFavoritePlayers: true,
    canReceiveNotifications: true,
    canViewFamilyMemberStats: true,
    canReceiveFamilyMemberUpdates: true
  },
  
  admin: {
    allPermissions: true
  }
};

// ========================================
// AUTHENTICATION FUNCTIONS
// ========================================

/**
 * Enhanced registration with name validation and audit trail
 */
export async function registerUser(email, password, displayName) {
  try {
    // Validate display name format
    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.valid) {
      return { 
        success: false, 
        error: 'invalid-display-name',
        message: nameValidation.message 
      };
    }
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName });
    await sendEmailVerification(user);
    
    // Create user profile with additional security fields
    await createUserProfile(user.uid, {
      email: user.email,
      displayName: displayName,
      displayNameOriginal: displayName, // Store original for audit
      registrationMethod: 'email', // Track how they signed up
      registrationIP: null, // Could add IP tracking if needed
      createdAt: serverTimestamp(),
      emailVerified: false,
      accountFlags: {
        requiresManualReview: false,
        suspiciousActivity: false,
        linkingAttempts: 0,
        linkingAttemptsHistory: []
      }
    });
    
    console.log('✅ User registered:', displayName);
	await setupNotificationsForUser(user);
    return { 
      success: true, 
      user, 
      message: 'Account created! Please check your email to verify.',
      nameValidation: nameValidation.confidence
    };
  } catch (error) {
    console.error('❌ Registration error:', error.code, error);
    return { 
      success: false, 
      error: error.code, 
      message: getErrorMessage(error.code) 
    };
  }
}

/**
 * Validate display name to prevent abuse
 */
function validateDisplayName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, message: 'Name is required', confidence: 'low' };
  }
  
  const trimmedName = name.trim();
  
  // Check minimum length
  if (trimmedName.length < 2) {
    return { 
      valid: false, 
      message: 'Name must be at least 2 characters', 
      confidence: 'low' 
    };
  }
  
  // Check maximum length
  if (trimmedName.length > 50) {
    return { 
      valid: false, 
      message: 'Name must be less than 50 characters', 
      confidence: 'low' 
    };
  }
  
  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  const nameRegex = /^[a-zA-Z\s'-]+$/;
  if (!nameRegex.test(trimmedName)) {
    return { 
      valid: false, 
      message: 'Name can only contain letters, spaces, hyphens, and apostrophes', 
      confidence: 'low' 
    };
  }
  
  // Check for minimum word count (at least first name)
  const words = trimmedName.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 1) {
    return { 
      valid: false, 
      message: 'Please enter at least your first name', 
      confidence: 'low' 
    };
  }
  
  // Warn if only one name provided (but allow it)
  if (words.length === 1) {
    return { 
      valid: true, 
      warning: 'Including your last name helps with player matching', 
      confidence: 'medium' 
    };
  }
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /^test/i,
    /^admin/i,
    /^fake/i,
    /^asdf/i,
    /^\d+$/,
    /^[a-z]{20,}$/i, // Very long single word
    /(.)\1{4,}/ // Same character repeated 5+ times
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmedName)) {
      return { 
        valid: false, 
        message: 'Please enter a valid name', 
        confidence: 'suspicious' 
      };
    }
  }
  
  return { valid: true, confidence: 'high' };
}

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
	console.log('✅ User logged in:', user.displayName);
	await setupNotificationsForUser(userCredential.user);
	if (user.emailVerified) {
      await updateDoc(doc(db, 'users', user.uid), {
        emailVerified: true,
        emailVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
	}
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('❌ Login error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    console.log('✅ Google sign-in successful:', user.displayName);
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await createUserProfile(user.uid, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        emailVerified: user.emailVerified
      });
      console.log('✅ User profile created in Firestore');
	  await setupNotificationsForUser(user);
    } else {
      console.log('ℹ️ Existing user profile found');
	  await setupNotificationsForUser(user);
    }
    
    return { success: true, user };
  } catch (error) {
    console.error('❌ Google sign-in error:', error.code, error.message);
    return { success: false, error: error.code, message: error.message || getErrorMessage(error.code) };
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    console.log('✅ User signed out');
    return { success: true };
  } catch (error) {
    console.error('❌ Sign out error:', error);
    return { success: false, error: error.code };
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    console.log('✅ Password reset email sent to:', email);
    return { success: true, message: 'Password reset email sent!' };
  } catch (error) {
    console.error('❌ Password reset error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function onAuthChange(callback) {
  let settled = false;

  // Safety net: if Firebase auth hasn't responded in 10 seconds (hanging SDK,
  // bad PWA cache, network stall), treat as signed-out so the page can redirect
  // to signin instead of showing a spinner forever.
  const authTimeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      console.warn('⚠️ Auth timeout after 10s — treating as signed out');
      callback(null);
    }
  }, 10000);

  return onAuthStateChanged(auth, async (user) => {
    // Clear the safety timeout — auth resolved normally
    if (!settled) {
      settled = true;
      clearTimeout(authTimeoutId);
    }

    // Force-refresh the ID token on every page load so stale tokens don't
    // cause silent Firestore write failures (the RSVP flicker problem).
    if (user) {
      try {
        await user.getIdToken(true);
      } catch (err) {
        console.warn('⚠️ Token refresh failed:', err.message || err);
      }
    }

    // Call the original callback first (don't block on FCM refresh)
    callback(user);
    
    // Then silently try to refresh FCM token if needed (non-blocking)
    if (user) {
      // Track user visit (throttled - won't write every time)
      trackUserVisit(user);
      
      refreshFCMTokenIfNeeded(user.uid).catch(err => {
        // Silent fail - don't disrupt user experience
        console.warn('⚠️ FCM token refresh skipped:', err.message || err);
      });
      
      // Check if user should see dashboard today (once per calendar day)
      checkDailyDashboardVisit();
      
      // Check for weekly profile setup redirect (if no notifications)
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          checkProfileSetupRedirect(user, userDoc.data());
        }
      } catch (err) {
        // Silent fail - don't disrupt user experience
        console.warn('⚠️ Setup redirect check skipped:', err.message || err);
      }
    }
  });
}

/**
 * Redirect authenticated users to dashboard once per calendar day
 * Preserves their intended destination with a "Continue" button on dashboard
 */
function checkDailyDashboardVisit() {
  try {
    const today = new Date().toLocaleDateString('en-CA'); // Local date YYYY-MM-DD
    const lastVisit = localStorage.getItem('lastDashboardVisit');
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    
    // Skip if already visited dashboard today
    if (lastVisit === today) {
      return;
    }
    
    // Skip if already on dashboard (dashboard will set the flag)
    if (currentPath.includes('my-dashboard.html')) {
      return;
    }
    
    // Skip auth-related pages
    const skipPages = [
      'signin.html', 
      'signup.html', 
      'reset-password.html', 
      'verify-email.html',
      'link-player.html'
    ];
    if (skipPages.some(page => currentPath.includes(page))) {
      return;
    }
    
    // Skip if coming from a notification click
    if (currentSearch.includes('from=notification') || currentSearch.includes('from=push')) {
      // Mark as visited so we don't redirect later in their session
      localStorage.setItem('lastDashboardVisit', today);
      return;
    }
    
    // Build the continue URL (preserve their intended destination)
    const continueUrl = encodeURIComponent(currentPath + currentSearch);
    
    // Redirect to dashboard with continue parameter
    console.log('📋 Daily dashboard check - redirecting');
    window.location.href = `/my-dashboard.html?continue=${continueUrl}`;
    
  } catch (err) {
    // Silent fail - don't block user if localStorage isn't available
    console.warn('Daily dashboard check skipped:', err);
  }
}

// ========================================
// VISIT TRACKING
// ========================================

const VISIT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes between updates

/**
 * Track user's last visit to the site with throttling
 * Only updates Firestore if last tracked visit was > 5 minutes ago
 * @param {Object} user - Firebase auth user
 */
async function trackUserVisit(user) {
  if (!user) return;
  
  // Check session storage for recent tracking
  const lastTracked = sessionStorage.getItem('lastVisitTracked');
  const now = Date.now();
  
  if (lastTracked && (now - parseInt(lastTracked)) < VISIT_THROTTLE_MS) {
    return; // Throttled - skip update
  }
  
  try {
    const userRef = doc(db, 'users', user.uid);
    
    await updateDoc(userRef, {
      lastVisit: serverTimestamp(),
      lastVisitPage: window.location.pathname,
      visitCount: increment(1)
    });
    
    // Mark as tracked in session
    sessionStorage.setItem('lastVisitTracked', now.toString());
    
    console.log('📍 Visit tracked for:', user.displayName || user.email);
  } catch (error) {
    if (error.code !== 'not-found') {
      console.warn('⚠️ Could not track visit:', error.message);
    }
  }
}

// ========================================
// WEEKLY PROFILE SETUP REDIRECT
// ========================================

const SETUP_REDIRECT_INTERVAL_DAYS = 7;
const SETUP_GUIDE_PATH = '/profile.html';

/**
 * Check if user should be redirected to profile setup
 * Redirects once per week until notifications are enabled
 * @param {Object} user - Firebase auth user
 * @param {Object} userProfile - Firestore user profile data
 */
async function checkProfileSetupRedirect(user, userProfile) {
  if (!user || !userProfile) return;
  
  const currentPath = window.location.pathname;
  
  // Skip if already on profile/setup/auth pages
  const skipPages = [
    'profile.html',
    'signin.html', 
    'signup.html', 
    'reset-password.html', 
    'verify-email.html',
    'link-player.html',
    'my-dashboard.html' // Don't interrupt dashboard flow
  ];
  if (skipPages.some(page => currentPath.includes(page))) {
    return;
  }
  
  // Skip if user has FCM tokens (notifications already set up)
  if (userProfile.fcmTokens && userProfile.fcmTokens.length > 0) {
    return;
  }
  
  // Skip if user explicitly dismissed notifications (respect their choice)
  const progress = userProfile.profileSetupProgress || {};
  if (progress.notificationsDismissed) {
    return;
  }
  
  // Use localStorage for redirect tracking (no extra Firestore write)
  const storageKey = `setupRedirect_${user.uid}`;
  const lastRedirect = parseInt(localStorage.getItem(storageKey) || '0');
  const now = Date.now();
  const daysSinceRedirect = (now - lastRedirect) / (1000 * 86400);
  
  // Only redirect if it's been 7+ days (or never redirected)
  if (daysSinceRedirect >= SETUP_REDIRECT_INTERVAL_DAYS) {
    console.log('🔔 Redirecting to profile setup (weekly reminder)');
    
    // Update localStorage
    localStorage.setItem(storageKey, now.toString());
    
    // Store return URL so we can send them back after setup
    sessionStorage.setItem('setupReturnUrl', window.location.href);
    
    // Redirect with flag so profile page knows to show setup guide
    window.location.href = `${SETUP_GUIDE_PATH}?showSetup=true`;
  }
}

/**
 * Silently refresh FCM token if it's older than 7 days
 * This keeps push notification tokens fresh for active users
 * @param {string} userId - User's UID
 */
async function refreshFCMTokenIfNeeded(userId) {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      return;
    }
    
    // Only proceed if browser permission is already granted
    if (Notification.permission !== 'granted') {
      return;
    }
    
    // Get user profile to check notification status
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return;
    }
    
    const userData = userDoc.data();
    
    // Only refresh if user has notifications enabled
    if (!userData.notificationsEnabled) {
      return;
    }
    
    // Check how old the token is
    const lastUpdate = userData.lastTokenUpdate ? new Date(userData.lastTokenUpdate) : null;
    const daysSinceUpdate = lastUpdate 
      ? (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24) 
      : Infinity;
    
    // Only refresh if token is older than 7 days
    if (daysSinceUpdate <= 7) {
      return;
    }
    
    console.log(`🔄 Refreshing FCM token (last update: ${daysSinceUpdate.toFixed(1)} days ago)`);
    
    // Refresh the token silently
    await requestNotificationPermission(userId);
    
    console.log('✅ FCM token refreshed successfully');
    
  } catch (error) {
    // Re-throw to be caught by the caller's .catch()
    throw error;
  }
}

export async function setAuthPersistence(rememberMe = true) {
  try {
    const persistenceMode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistenceMode);
    console.log(`✅ Auth persistence set to: ${rememberMe ? 'LOCAL' : 'SESSION'}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error setting persistence:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Change user password (for email/password accounts)
 * @param {string} currentPassword - Current password for verification
 * @param {string} newPassword - New password
 * @returns {Promise<Object>}
 */
export async function changeUserPassword(currentPassword, newPassword) {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return { success: false, message: 'No user signed in' };
    }
    
    // Check if user is using email/password authentication
    const isEmailProvider = user.providerData.some(
      provider => provider.providerId === 'password'
    );
    
    if (!isEmailProvider) {
      return { 
        success: false, 
        message: 'Password change is only available for email/password accounts' 
      };
    }
    
    // Validate new password
    if (newPassword.length < 6) {
      return { 
        success: false, 
        message: 'New password must be at least 6 characters' 
      };
    }
    
    if (currentPassword === newPassword) {
      return { 
        success: false, 
        message: 'New password must be different from current password' 
      };
    }
    
    // Re-authenticate user with current password
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
    );
    
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    
    try {
      await reauthenticateWithCredential(user, credential);
    } catch (error) {
      if (error.code === 'auth/wrong-password') {
        return { 
          success: false, 
          message: 'Current password is incorrect' 
        };
      }
      throw error;
    }
    
    // Update password
    await updatePassword(user, newPassword);
    
    console.log('✅ Password changed successfully');
    return { 
      success: true, 
      message: 'Password changed successfully!' 
    };
    
  } catch (error) {
    console.error('❌ Error changing password:', error);
    return { 
      success: false, 
      error: error.code,
      message: getErrorMessage(error.code) || 'Failed to change password. Please try again.'
    };
  }
}

// ========================================
// EMAIL VERIFICATION FUNCTIONS
// ========================================

/**
 * Check if user needs email verification
 * Google users are always considered verified
 * @param {Object} user - Firebase user object
 * @returns {boolean}
 */
export function needsEmailVerification(user) {
  if (!user) return false;
  
  // Check if this is a Google user (always verified)
  const isGoogleUser = user.providerData.some(
    provider => provider.providerId === 'google.com'
  );
  
  if (isGoogleUser) {
    return false; // Google users don't need verification
  }
  
  // Email/password users need verification
  return !user.emailVerified;
}

/**
 * Resend verification email with rate limiting
 * @returns {Promise<Object>}
 */
export async function resendVerificationEmail() {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return { success: false, message: 'No user signed in' };
    }
    
    // Check if already verified
    if (user.emailVerified) {
      return { success: false, message: 'Email already verified' };
    }
    
    // Check if this is a Google user
    const isGoogleUser = user.providerData.some(
      provider => provider.providerId === 'google.com'
    );
    
    if (isGoogleUser) {
      return { success: false, message: 'Google users do not need email verification' };
    }
    
    // Send verification email
    await sendEmailVerification(user);
    
    console.log('✅ Verification email resent to:', user.email);
    return { 
      success: true, 
      message: 'Verification email sent! Please check your inbox.' 
    };
    
  } catch (error) {
    console.error('❌ Error resending verification email:', error);
    
    let message = 'Failed to send verification email. Please try again.';
    
    if (error.code === 'auth/too-many-requests') {
      message = 'Too many requests. Please wait a few minutes before trying again.';
    }
    
    return { 
      success: false, 
      error: error.code,
      message 
    };
  }
}

/**
 * Refresh user's email verification status
 * Call this after user claims to have verified their email
 * @returns {Promise<Object>}
 */
export async function refreshVerificationStatus() {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return { success: false, message: 'No user signed in' };
    }
    
    // Reload user to get fresh token with updated emailVerified status
    await user.reload();
    
    // Get the refreshed user
    const refreshedUser = auth.currentUser;
    
    console.log('✅ Verification status refreshed:', refreshedUser.emailVerified);
    
    return { 
      success: true, 
      emailVerified: refreshedUser.emailVerified,
      user: refreshedUser
    };
    
  } catch (error) {
    console.error('❌ Error refreshing verification status:', error);
    return { 
      success: false, 
      error: error.code,
      message: 'Failed to check verification status. Please try again.'
    };
  }
}

/**
 * Get user's verification status and provider info
 * Useful for determining what verification UI to show
 * @returns {Object}
 */
export function getVerificationInfo() {
  const user = auth.currentUser;
  
  if (!user) {
    return {
      signedIn: false,
      emailVerified: false,
      isGoogleUser: false,
      needsVerification: false
    };
  }
  
  const isGoogleUser = user.providerData.some(
    provider => provider.providerId === 'google.com'
  );
  
  return {
    signedIn: true,
    emailVerified: user.emailVerified,
    isGoogleUser: isGoogleUser,
    needsVerification: !isGoogleUser && !user.emailVerified,
    email: user.email
  };
}

/**
 * Sync email verification status from Auth to Firestore
 * Call this after user verifies their email
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
export async function syncEmailVerificationStatus(userId) {
  try {
    const user = auth.currentUser;
    
    if (!user || user.uid !== userId) {
      return { success: false, message: 'User mismatch' };
    }
    
    // Reload to get fresh emailVerified status
    await user.reload();
    
    // Update Firestore
    await updateDoc(doc(db, 'users', userId), {
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerified ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Email verification status synced to Firestore');
    return { success: true, emailVerified: user.emailVerified };
    
  } catch (error) {
    console.error('❌ Error syncing email verification:', error);
    return { success: false, error: error.code };
  }
}



// ========================================
// USER PROFILE FUNCTIONS
// ========================================

async function createUserProfile(userId, data) {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...data,
    // Enhanced role system
    userRole: USER_ROLES.FAN, // Default role
    teamRoles: {}, // Multi-team role tracking
    
    // Legacy fields (keep for backward compatibility)
    linkedPlayer: null,
    linkedTeam: null,
    isCaptain: false,
    
	// Staff management
    staffRequests: [],
    playerLinkRequests: [], // needed for link-player.html
    
    // Preferences
    favoriteTeams: [],
    favoritePlayers: [],
    notificationsEnabled: false, // Only becomes true when FCM token is registered
    fcmTokens: [], // Will be populated when user enables notifications
    preferences: {
      emailGameReminders: true,
      emailScoreUpdates: false,
      favoriteTeamNotifications: true,
      favoritePlayerAlerts: true,
      publicFavorites: false,
      defaultStatsView: 'season',
      defaultSeason: 'current'
    },
    
    // Profile completion
    profileComplete: false,
    
    // Visit tracking
    lastVisit: serverTimestamp(),
    lastVisitPage: window.location.pathname,
    visitCount: 1,
    
    theme: 'light',
    updatedAt: serverTimestamp()
  });
  console.log('✅ User profile created in Firestore for:', userId);
}

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
    console.log('✅ User profile updated:', userId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    return { success: false, error: error.code };
  }
}

export async function linkPlayerToUser(userId, playerName, teamId, isCaptain = false) {
  try {
    const user = auth.currentUser;
    
    // Update auth user's display name to match player profile
      if (playerName && user && user.uid === userId) {
      try {
        await updateProfile(user, { displayName: playerName });
        console.log('✅ Updated auth displayName to:', playerName);
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
          console.log('✅ Found existing player profile:', playerUserId);
          existingPlayerData = oldPlayerDoc.data();
        } else {
          console.log('ℹ️ No existing player profile found for:', playerUserId);
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
        
        console.log('✅ Setting isCaptain = true from legacy profile');
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
      
      console.log('✅ Merging data from old profile');
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
        console.log('✅ Marked legacy profile as migrated:', playerUserId);
      } catch (migrationError) {
        console.warn('Could not mark legacy profile as migrated:', migrationError);
      }
    }
    
    // Aggregate player stats for this newly linked player
    if (playerName) {
      console.log('📊 Aggregating player stats...');
      const aggregateResult = await aggregatePlayerStats(userId, playerName, teamId);
      if (aggregateResult.success) {
        console.log(`✅ Aggregated ${aggregateResult.seasons} seasons for ${playerName}`);
      } else {
        console.warn('⚠️ Stats aggregation failed:', aggregateResult.error);
        // Don't fail the link - aggregation can be retried
      }
    }
    
    console.log('✅ Player linked to user:', playerName, 'Team:', teamId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error linking player:', error);
    return { success: false, error: error.code };
  }
}


// ========================================
// PLAYER STATS AGGREGATION
// ========================================

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
    
    console.log(`📊 Aggregating stats for ${playerName} (lookup: ${statsLookupId})`);
    
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
    
    console.log(`✅ Created aggregatedPlayerStats/${userId}`);
    
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
          console.log(`✅ Marked legacy aggregated profile ${statsLookupId} as migrated`);
        }
      } catch (migrationError) {
        // Silently continue if legacy aggregated profile doesn't exist
        console.log(`ℹ️ No legacy aggregated profile to migrate for ${statsLookupId}`);
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
    console.log(`🔀 Redirecting from ${currentPage} to ${correctPage}`);
    window.location.href = correctPage;
  }
}


// ========================================
// TEAM STAFF MANAGEMENT FUNCTIONS
// ========================================

/**
 * Request team-staff access for a team
 */
export async function requestTeamStaffAccess(userId, teamId, teamName) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const currentRequests = userDoc.data().staffRequests || [];
    
    // Check if already requested
    const existingRequest = currentRequests.find(
      r => r.teamId === teamId && r.status === 'pending'
    );
    
    if (existingRequest) {
      return { success: false, message: 'Request already pending' };
    }
    
    // Check if already staff for this team
    const teamRoles = userDoc.data().teamRoles || {};
    if (teamRoles[teamId] && teamRoles[teamId].status === 'active') {
      return { success: false, message: 'Already staff member of this team' };
    }
    
    // Add new request
    currentRequests.push({
      teamId,
      teamName,
      requestedAt: serverTimestamp(),
      status: 'pending',
      requestedBy: userId
    });
    
    await updateDoc(userRef, {
      staffRequests: currentRequests,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Staff access requested for:', teamName);
    return { success: true, message: 'Request submitted to team captain' };
    
  } catch (error) {
    console.error('❌ Error requesting staff access:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Approve team-staff request (captain only)
 */
export async function approveTeamStaff(captainId, requestUserId, teamId) {
  try {
    // Verify captain has permission
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    if (!captainDoc.exists()) {
      return { success: false, message: 'Captain not found' };
    }
    
    const captainData = captainDoc.data();
    const captainTeamRole = captainData.teamRoles?.[teamId];
    
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can approve staff' };
    }
    
    // Update the requesting user's profile
    const userRef = doc(db, 'users', requestUserId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    const staffRequests = userData.staffRequests || [];
    
    // Update request status
    const updatedRequests = staffRequests.map(req => {
      if (req.teamId === teamId && req.status === 'pending') {
        return {
          ...req,
          status: 'approved',
          reviewedBy: captainId,
          reviewedAt: new Date().toISOString()
        };
      }
      return req;
    });
    
    // Add team-staff role
    const teamRoles = userData.teamRoles || {};
    teamRoles[teamId] = {
      role: USER_ROLES.TEAM_STAFF,
      approvedBy: captainId,
      approvedAt: serverTimestamp(),
      canBeRemovedBy: [captainId],
      status: 'active'
    };
    
    await updateDoc(userRef, {
      userRole: USER_ROLES.TEAM_STAFF,
      linkedTeam: teamId,
      teamRoles,
      staffRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Team staff approved:', requestUserId);
    return { success: true, message: 'Staff member approved' };
    
  } catch (error) {
    console.error('❌ Error approving staff:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Remove team-staff member (captain only, cannot remove captain)
 */
export async function removeTeamStaff(captainId, staffUserId, teamId) {
  try {
    // Verify captain has permission
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    const staffDoc = await getDoc(doc(db, 'users', staffUserId));
    
    if (!captainDoc.exists() || !staffDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const captainData = captainDoc.data();
    const staffData = staffDoc.data();
    
    // Check captain permission
    const captainTeamRole = captainData.teamRoles?.[teamId];
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can remove staff' };
    }
    
    // Check if trying to remove captain (not allowed)
    const staffTeamRole = staffData.teamRoles?.[teamId];
    if (staffTeamRole?.role === USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Cannot remove team captain. Only league staff/admin can remove captains.' };
    }
    
    // Remove team-staff role
    const teamRoles = staffData.teamRoles || {};
    if (teamRoles[teamId]) {
      teamRoles[teamId].status = 'removed';
      teamRoles[teamId].removedBy = captainId;
      teamRoles[teamId].removedAt = serverTimestamp();
    }
    
    // Determine new user role
    const activeRoles = Object.values(teamRoles).filter(r => r.status === 'active');
    let newUserRole = USER_ROLES.PLAYER;
    
    if (activeRoles.length > 0) {
      // User has other active team roles
      newUserRole = activeRoles[0].role;
    }
    
    await updateDoc(doc(db, 'users', staffUserId), {
      userRole: newUserRole,
      linkedTeam: activeRoles.length > 0 ? Object.keys(teamRoles).find(tid => teamRoles[tid].status === 'active') : null,
      teamRoles,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Team staff removed:', staffUserId);
    return { success: true, message: 'Staff member removed' };
    
  } catch (error) {
    console.error('❌ Error removing staff:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Deny team-staff request (captain only)
 */
export async function denyTeamStaffRequest(captainId, requestUserId, teamId) {
  try {
    const captainDoc = await getDoc(doc(db, 'users', captainId));
    if (!captainDoc.exists()) {
      return { success: false, message: 'Captain not found' };
    }
    
    const captainData = captainDoc.data();
    const captainTeamRole = captainData.teamRoles?.[teamId];
    
    if (!captainTeamRole || captainTeamRole.role !== USER_ROLES.CAPTAIN) {
      return { success: false, message: 'Only team captain can deny requests' };
    }
    
    const userRef = doc(db, 'users', requestUserId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    const staffRequests = userData.staffRequests || [];
    
    const updatedRequests = staffRequests.map(req => {
      if (req.teamId === teamId && req.status === 'pending') {
        return {
          ...req,
          status: 'denied',
          reviewedBy: captainId,
          reviewedAt: new Date().toISOString()
        };
      }
      return req;
    });
    
    await updateDoc(userRef, {
      staffRequests: updatedRequests,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Staff request denied:', requestUserId);
    return { success: true, message: 'Request denied' };
    
  } catch (error) {
    console.error('❌ Error denying request:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Get all pending staff requests for a team (captain view)
 */
export async function getTeamStaffRequests(teamId) {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const pendingRequests = [];
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const requests = userData.staffRequests || [];
      
      requests.forEach(req => {
        if (req.teamId === teamId && req.status === 'pending') {
          pendingRequests.push({
            userId: docSnap.id,
            userName: userData.displayName,
            userEmail: userData.email,
            photoURL: userData.photoURL || null,
            ...req
          });
        }
      });
    });
    
    return { success: true, requests: pendingRequests };
    
  } catch (error) {
    console.error('❌ Error fetching staff requests:', error);
    return { success: false, error: error.code, requests: [] };
  }
}

/**
 * Get all team-staff members for a team
 */
export async function getTeamStaffMembers(teamId) {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const staffMembers = [];
    
    usersSnapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const teamRole = userData.teamRoles?.[teamId];
      
      if (teamRole && 
          (teamRole.role === USER_ROLES.TEAM_STAFF || teamRole.role === USER_ROLES.CAPTAIN) &&
          teamRole.status === 'active') {
        staffMembers.push({
          userId: docSnap.id,
          userName: userData.displayName,
          userEmail: userData.email,
          photoURL: userData.photoURL || null,
          role: teamRole.role,
          approvedBy: teamRole.approvedBy,
          approvedAt: teamRole.approvedAt
        });
      }
    });
    
    // Sort: captains first, then team-staff
    staffMembers.sort((a, b) => {
      if (a.role === USER_ROLES.CAPTAIN && b.role !== USER_ROLES.CAPTAIN) return -1;
      if (a.role !== USER_ROLES.CAPTAIN && b.role === USER_ROLES.CAPTAIN) return 1;
      return a.userName.localeCompare(b.userName);
    });
    
    return { success: true, staff: staffMembers };
    
  } catch (error) {
    console.error('❌ Error fetching staff members:', error);
    return { success: false, error: error.code, staff: [] };
  }
}
// ========================================
// PLAYER LINK APPROVAL SYSTEM
// Add these functions to firebase-auth.js
// ========================================

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
    console.log('🔗 Starting player link request for:', playerName);
    
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('❌ User not found:', userId);
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data();
    console.log('✓ User data loaded:', userData.displayName);
    
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
    console.log('🔍 Checking if player is already claimed...');
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
    
    console.log('✓ Player is available for linking');
    
    // Calculate name similarity
    const similarity = calculateNameSimilarity(userData.displayName, playerName);
    console.log('✓ Name similarity score:', similarity);
    
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
    
    console.log('✓ Approval level determined:', approvalLevel);
    console.log('✓ Registration method:', registrationMethod);
    
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
    
    console.log('✓ Created request object:', newRequest.requestId);
    
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
    console.log('💾 Updating Firestore...');
    await updateDoc(userRef, {
      playerLinkRequests: playerLinkRequests,
      'accountFlags.linkingAttempts': linkingAttempts + 1,
      'accountFlags.linkingAttemptsHistory': updatedHistory,
      'accountFlags.requiresManualReview': requiresManualReview,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Player link request submitted successfully');
    
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
    
    console.log('✅ Player link approved:', request.playerName);
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
    
    console.log('✅ Player link denied:', request.playerName);
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
    
    console.log('✅ Player link request cancelled');
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
      
      console.log('✅ Player unlinked immediately (no stats)');
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
    
    console.log('✅ Unlink request submitted');
    return { 
      success: true, 
      message: 'Unlink request submitted. Awaiting captain or league staff approval.' 
    };
    
  } catch (error) {
    console.error('❌ Error requesting unlink:', error);
    return { success: false, error: error.code };
  }
}
// ========================================
// FAVORITES FUNCTIONS
// ========================================

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
      console.log('✅ Favorite team added:', teamId);
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
      console.log('✅ Favorite player added:', playerName);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding favorite player:', error);
    return { success: false, error: error.code };
  }
}

// ========================================
// PERMISSION HELPER FUNCTIONS
// ========================================

/**
 * Check if user has permission for an action
 * @param {Object} user - User profile object
 * @param {string} permission - Permission to check
 * @param {Object} context - Additional context (e.g., teamId)
 * @returns {boolean}
 */
export function hasPermission(user, permission, context = {}) {
  if (!user) return false;
  
  // Admin override
  if (user.userRole === USER_ROLES.ADMIN) return true;
  
  // Check custom permissions first
  if (user.customPermissions?.[permission]) {
    return true;
  }
  
  // Special case: team-specific permissions
  if (context.teamId) {
    const teamRole = user.teamRoles?.[context.teamId];
    
    // Check if user has active role for this team
    if (!teamRole || teamRole.status !== 'active') {
      return false;
    }
    
    // Get permissions for this role
    const rolePerms = ROLE_PERMISSIONS[teamRole.role] || {};
    
    // Special check: cannot remove captain
    if (permission === 'canRemoveCaptain') {
      return user.userRole === USER_ROLES.LEAGUE_STAFF || user.userRole === USER_ROLES.ADMIN;
    }
    
    // Special check: only captain can manage staff
    if (permission === 'canManageStaff') {
      return teamRole.role === USER_ROLES.CAPTAIN;
    }
    
    return rolePerms[permission] || false;
  }
  
  // Default role-based check
  const rolePerms = ROLE_PERMISSIONS[user.userRole] || {};
  return rolePerms[permission] || false;
}

/**
 * Check if user can manage another user's role
 * @param {Object} currentUser - Current user profile
 * @param {Object} targetUser - Target user profile
 * @param {string} teamId - Team ID context
 * @returns {boolean}
 */
export function canManageUser(currentUser, targetUser, teamId) {
  // Admin can manage anyone
  if (currentUser.userRole === USER_ROLES.ADMIN) return true;
  
  // League staff can manage captains
  if (currentUser.userRole === USER_ROLES.LEAGUE_STAFF) return true;
  
  // Captain can manage team-staff for their team
  const currentUserTeamRole = currentUser.teamRoles?.[teamId];
  const targetUserTeamRole = targetUser.teamRoles?.[teamId];
  
  if (currentUserTeamRole?.role === USER_ROLES.CAPTAIN && 
      currentUserTeamRole?.status === 'active') {
    
    // Cannot remove another captain
    if (targetUserTeamRole?.role === USER_ROLES.CAPTAIN) {
      return false;
    }
    
    // Can manage team-staff
    return true;
  }
  
  return false;
}

/**
 * Check if user has a special role (oddsmaker, photographer, historian, etc.)
 * Special roles grant access to specific pages without changing base role
 * @param {Object} user - User profile object
 * @param {string} role - Special role to check
 * @returns {boolean}
 */
export function hasSpecialRole(user, role) {
  if (!user) return false;
  if (user.userRole === USER_ROLES.ADMIN) return true;
  // Check object property (specialRoles is an object like { photographer: true })
  return user.specialRoles?.[role] === true;
}

// ========================================
// DUAL-ROLE HELPER FUNCTIONS
// These functions support the separation of league-level roles (admin, league-staff)
// from team-level roles (captain, team-staff) allowing users to have both.
// ========================================

/**
 * Case-insensitive lookup for team role
 * Handles mismatch between stored keys (capitalized: "Green") and game data (lowercase: "green")
 * @param {Object} teamRoles - The teamRoles object from user profile
 * @param {string} teamId - Team ID to find (any case)
 * @returns {Object|null} The team role object if found, null otherwise
 */
function findTeamRole(teamRoles, teamId) {
  if (!teamRoles || !teamId) return null;
  
  const normalizedId = teamId.toLowerCase();
  
  // First try exact match
  if (teamRoles[teamId]) return teamRoles[teamId];
  
  // Then try case-insensitive search
  for (const [key, value] of Object.entries(teamRoles)) {
    if (key.toLowerCase() === normalizedId) {
      return value;
    }
  }
  
  return null;
}

/**
 * Case-insensitive comparison of team IDs
 * @param {string} teamId1 - First team ID
 * @param {string} teamId2 - Second team ID
 * @returns {boolean} True if team IDs match (case-insensitive)
 */
function teamIdsMatch(teamId1, teamId2) {
  if (!teamId1 || !teamId2) return false;
  return teamId1.toLowerCase() === teamId2.toLowerCase();
}

/**
 * Check if user is captain of ANY team
 * Checks all possible captain indicators for backward compatibility
 * @param {Object} userProfile - User profile object
 * @returns {boolean}
 */
export function isUserCaptain(userProfile) {
  if (!userProfile) return false;
  
  // Legacy flag (always check first for backward compatibility)
  if (userProfile.isCaptain === true) return true;
  
  // Legacy userRole field
  if (userProfile.userRole === USER_ROLES.CAPTAIN) return true;
  
  // Modern teamRoles - check if captain of any team
  if (userProfile.teamRoles) {
    return Object.values(userProfile.teamRoles).some(
      tr => tr.role === USER_ROLES.CAPTAIN && tr.status === 'active'
    );
  }
  
  return false;
}

/**
 * Check if user is captain of a SPECIFIC team
 * Uses case-insensitive matching for team IDs
 * @param {Object} userProfile - User profile object
 * @param {string} teamId - Team ID to check (any case)
 * @returns {boolean}
 */
export function isTeamCaptain(userProfile, teamId) {
  if (!userProfile || !teamId) return false;
  
  // Case-insensitive lookup in teamRoles
  const teamRole = findTeamRole(userProfile.teamRoles, teamId);
  if (teamRole?.role === USER_ROLES.CAPTAIN && teamRole?.status === 'active') {
    return true;
  }
  
  // Legacy fallback: if isCaptain and linkedTeam matches (case-insensitive)
  if (userProfile.isCaptain === true && teamIdsMatch(userProfile.linkedTeam, teamId)) {
    return true;
  }
  
  return false;
}

/**
 * Check if user is team-staff of a SPECIFIC team
 * Uses case-insensitive matching for team IDs
 * @param {Object} userProfile - User profile object
 * @param {string} teamId - Team ID to check (any case)
 * @returns {boolean}
 */
export function isTeamStaff(userProfile, teamId) {
  if (!userProfile || !teamId) return false;
  
  // Case-insensitive lookup in teamRoles
  const teamRole = findTeamRole(userProfile.teamRoles, teamId);
  return teamRole?.role === USER_ROLES.TEAM_STAFF && teamRole?.status === 'active';
}

/**
 * Check if user has a league-wide elevated role (admin or league-staff)
 * These roles have permissions across all teams
 * @param {Object} userProfile - User profile object
 * @returns {boolean}
 */
export function hasLeagueRole(userProfile) {
  if (!userProfile) return false;
  
  // Check isAdmin flag
  if (userProfile.isAdmin === true) return true;
  
  // Check userRole for admin or league-staff
  const role = userProfile.userRole;
  return role === USER_ROLES.ADMIN || role === USER_ROLES.LEAGUE_STAFF;
}

/**
 * Check if user is specifically an admin
 * @param {Object} userProfile - User profile object
 * @returns {boolean}
 */
export function isAdmin(userProfile) {
  if (!userProfile) return false;
  return userProfile.isAdmin === true || userProfile.userRole === USER_ROLES.ADMIN;
}

/**
 * Check if user is specifically league staff (not admin)
 * @param {Object} userProfile - User profile object
 * @returns {boolean}
 */
export function isLeagueStaff(userProfile) {
  if (!userProfile) return false;
  return userProfile.userRole === USER_ROLES.LEAGUE_STAFF;
}

/**
 * Check if user can access captain-level features
 * This includes: admins, league-staff, and captains of any team
 * Use this for features like "Approve Links", "Captain Tools" sections
 * @param {Object} userProfile - User profile object
 * @returns {boolean}
 */
export function canAccessCaptainFeatures(userProfile) {
  if (!userProfile) return false;
  
  // League-wide roles have captain-level access everywhere
  if (hasLeagueRole(userProfile)) return true;
  
  // Check if captain of any team
  return isUserCaptain(userProfile);
}

/**
 * Check if user can manage a SPECIFIC team (roster, lineup, etc.)
 * @param {Object} userProfile - User profile object
 * @param {string} teamId - Team ID to check
 * @returns {boolean}
 */
export function canManageTeam(userProfile, teamId) {
  if (!userProfile) return false;
  
  // Admins and league-staff can manage any team
  if (hasLeagueRole(userProfile)) return true;
  
  // Check if captain or team-staff of this specific team
  if (isTeamCaptain(userProfile, teamId)) return true;
  if (isTeamStaff(userProfile, teamId)) return true;
  
  return false;
}

/**
 * Check if user can submit scores/stats for a team
 * @param {Object} userProfile - User profile object
 * @param {string} teamId - Optional team ID for team-specific check
 * @returns {boolean}
 */
export function canSubmitForTeam(userProfile, teamId = null) {
  if (!userProfile) return false;
  
  // Admins and league-staff can submit for any team
  if (hasLeagueRole(userProfile)) return true;
  
  // If teamId provided, check specific team permissions
  if (teamId) {
    return canManageTeam(userProfile, teamId);
  }
  
  // Without teamId, check if user is captain of any team
  return isUserCaptain(userProfile);
}

/**
 * Get all team IDs the user can manage (as captain or team-staff)
 * Returns normalized lowercase IDs for consistent comparison with game data
 * @param {Object} userProfile - User profile object
 * @returns {string[]} Array of lowercase team IDs
 */
export function getUserTeamIds(userProfile) {
  if (!userProfile) return [];
  
  const teamIds = new Set();
  
  // Check teamId field
  if (userProfile.teamId) {
    teamIds.add(userProfile.teamId.toLowerCase());
  }
  
  // Check linkedTeam field
  if (userProfile.linkedTeam) {
    teamIds.add(userProfile.linkedTeam.toLowerCase());
  }
  
  // Check teamRoles for active captain/team-staff roles
  if (userProfile.teamRoles && typeof userProfile.teamRoles === 'object') {
    Object.entries(userProfile.teamRoles).forEach(([teamId, roleData]) => {
      if (roleData && roleData.status === 'active') {
        const role = roleData.role;
        if (role === USER_ROLES.CAPTAIN || role === USER_ROLES.TEAM_STAFF) {
          teamIds.add(teamId.toLowerCase());
        }
      }
    });
  }
  
  return Array.from(teamIds);
}

/**
 * Check if user can submit score/stats for a specific game
 * League roles can submit for any game; team roles can only submit for their teams
 * @param {Object} userProfile - User profile object
 * @param {Object} game - Game object with homeTeamId and awayTeamId
 * @returns {boolean}
 */
export function canSubmitForGame(userProfile, game) {
  if (!userProfile || !game) return false;
  
  // Admins and league-staff can submit for any game
  if (hasLeagueRole(userProfile)) return true;
  
  // Get user's team IDs (normalized to lowercase)
  const userTeams = getUserTeamIds(userProfile);
  if (userTeams.length === 0) return false;
  
  // Check if game involves any of user's teams
  const homeTeamId = (game.homeTeamId || '').toLowerCase();
  const awayTeamId = (game.awayTeamId || '').toLowerCase();
  
  return userTeams.includes(homeTeamId) || userTeams.includes(awayTeamId);
}

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

/**
 * Get all active team roles for a user
 * @param {Object} userProfile - User profile object
 * @returns {Array} Array of { teamId, role, status }
 */
export function getActiveTeamRoles(userProfile) {
  if (!userProfile?.teamRoles) return [];
  
  return Object.entries(userProfile.teamRoles)
    .filter(([_, tr]) => tr.status === 'active')
    .map(([teamId, tr]) => ({
      teamId,
      role: tr.role,
      status: tr.status,
      approvedBy: tr.approvedBy,
      approvedAt: tr.approvedAt
    }));
}

/**
 * Get teams where user is captain
 * @param {Object} userProfile - User profile object
 * @returns {Array} Array of team IDs
 */
export function getCaptainTeams(userProfile) {
  if (!userProfile) return [];
  
  const teams = [];
  
  // Check teamRoles
  if (userProfile.teamRoles) {
    Object.entries(userProfile.teamRoles).forEach(([teamId, tr]) => {
      if (tr.role === USER_ROLES.CAPTAIN && tr.status === 'active') {
        teams.push(teamId);
      }
    });
  }
  
  // Legacy fallback
  if (teams.length === 0 && userProfile.isCaptain && userProfile.linkedTeam) {
    teams.push(userProfile.linkedTeam);
  }
  
  return teams;
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

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getErrorMessage(errorCode) {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/operation-not-allowed': 'Operation not allowed.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/popup-blocked': 'Sign-in popup was blocked by your browser. Please allow popups for this site.'
  };
  return errorMessages[errorCode] || 'An error occurred. Please try again.';
}


// ========================================
// NOTIFICATION SETUP
// ========================================

async function setupNotificationsForUser(user) {
  try {
    // Register service worker
    // await registerMessagingServiceWorker();
    
    // Check if user has already granted permission
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    
    // Don't prompt again if they've denied or already set up
    if (userData?.notificationsEnabled === false || userData?.fcmTokens?.length > 0) {
      return;
    }
    
    // Show a friendly prompt first (optional but recommended)
    showNotificationPrompt(user.uid);
    
  } catch (error) {
    console.error('Error setting up notifications:', error);
  }
}

function showNotificationPrompt(userId) {
  const promptHTML = `
    <div id="notification-prompt" class="modal-overlay">
      <div class="modal-content">
        <h3>🔔 Enable Notifications?</h3>
        <p>Get notified about:</p>
        <ul>
          <li>Game reminders (24 hours & 2 hours before)</li>
          <li>RSVP deadlines</li>
          <li>Schedule changes</li>
          <li>Lineup updates</li>
        </ul>
        <div class="button-group">
          <button id="enable-notifications" class="btn-primary">Enable Notifications</button>
          <button id="skip-notifications" class="btn-secondary">Not Now</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', promptHTML);
  
  // Handle user choice
  document.getElementById('enable-notifications').addEventListener('click', async () => {
    document.getElementById('notification-prompt').remove();
    await requestNotificationPermission(userId);
  });
  
  document.getElementById('skip-notifications').addEventListener('click', () => {
    document.getElementById('notification-prompt').remove();
  });
}

export { auth };

// Make auth available globally for navigation component
if (typeof window !== 'undefined') {
  window.auth = auth;
  // Signal nav-component (and any other listeners) that auth is ready
  window.dispatchEvent(new CustomEvent('firebase-auth-ready'));
}
