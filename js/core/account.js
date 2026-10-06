// js/core/account.js
// Account actions: register, sign in (email or Google), sign out, password
// reset and change, persistence, email verification, and creating the
// users/{uid} doc for a new account.
// Moved unchanged from firebase-auth.js (only the imports changed and the info
// console.log lines were dropped); firebase-auth.js re-exports these.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { auth, db, doc, setDoc, getDoc, updateDoc, serverTimestamp } from './firebase.js';
import { USER_ROLES } from './auth.js';

// firebase-messaging is imported lazily (dynamic import) so it doesn't block auth init
// It's only loaded when requestNotificationPermission is actually called
let _requestNotificationPermission = null;

async function requestNotificationPermission(...args) {
  if (!_requestNotificationPermission) {
    const mod = await import('../../firebase-messaging.js');
    _requestNotificationPermission = mod.requestNotificationPermission;
  }
  return _requestNotificationPermission(...args);
}

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

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
    
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await createUserProfile(user.uid, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        emailVerified: user.emailVerified
      });
	  await setupNotificationsForUser(user);
    } else {
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
    return { success: true };
  } catch (error) {
    console.error('❌ Sign out error:', error);
    return { success: false, error: error.code };
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, message: 'Password reset email sent!' };
  } catch (error) {
    console.error('❌ Password reset error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

export async function setAuthPersistence(rememberMe = true) {
  try {
    const persistenceMode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistenceMode);
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
    
    return { success: true, emailVerified: user.emailVerified };
    
  } catch (error) {
    console.error('❌ Error syncing email verification:', error);
    return { success: false, error: error.code };
  }
}

export async function createUserProfile(userId, data) {
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
}

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
