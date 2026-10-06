// firebase-messaging.js
// Functions for managing push notifications
// Updated to work with unified service-worker.js

import { messaging, VAPID_KEY } from './firebase-config.js';
import { db } from './firebase-config.js';
import { getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';
import { doc, updateDoc, setDoc, getDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Get the existing service worker registration
 * NOTE: We no longer register a separate firebase-messaging-sw.js
 * Instead, we use the unified service-worker.js that handles both offline and messaging
 */
async function getServiceWorkerRegistration() {
  try {
    if ('serviceWorker' in navigator) {
      // Wait for the existing service worker to be ready
      const registration = await navigator.serviceWorker.ready;
      console.log('âœ… Using existing service worker for FCM');
      return registration;
    }
    return null;
  } catch (error) {
    console.error('âŒ Error getting service worker registration:', error);
    throw error;
  }
}

/**
 * Get the current device's FCM token (without saving)
 * Used to identify which token belongs to this device when disabling
 * @returns {Promise<string|null>} FCM token or null if not available
 */
export async function getCurrentDeviceToken() {
  try {
    // Check if notifications are supported and permitted
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.log('Notifications not enabled on this device');
      return null;
    }

    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      console.log('Service worker not available');
      return null;
    }

    const currentToken = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    return currentToken || null;
  } catch (error) {
    console.error('Error getting current device token:', error);
    return null;
  }
}

/**
 * Request notification permission and get FCM token
 * @param {string} userId - Current user's ID
 * @returns {Promise<string|null>} FCM token or null if denied
 */
export async function requestNotificationPermission(userId) {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return null;
    }

    // Wait for service worker to be ready
    console.log('ðŸ”„ Waiting for service worker to be ready...');
    const registration = await getServiceWorkerRegistration();
    
    if (!registration) {
      throw new Error('Service worker not available');
    }

    console.log('âœ… Service worker is ready for FCM');

    // Check if already granted
    if (Notification.permission === 'granted') {
      return await getAndSaveToken(userId);
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('âœ… Notification permission granted');
      return await getAndSaveToken(userId);
    } else {
      console.log('âŒ Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('âŒ Error requesting notification permission:', error);
    throw error;
  }
}

/**
 * Get FCM token and save to user profile
 * @param {string} userId - Current user's ID
 * @returns {Promise<string>} FCM token
 */
async function getAndSaveToken(userId) {
  try {
    console.log('ðŸ”‘ Getting FCM token for user:', userId);
    
    // CRITICAL: Wait for service worker and pass registration to getToken
    // This tells Firebase to use our unified service-worker.js instead of
    // trying to register its own firebase-messaging-sw.js
    const registration = await navigator.serviceWorker.ready;
    console.log('ðŸ“¦ Using service worker registration:', registration);
    
    // Get FCM token - pass the serviceWorkerRegistration option
    const currentToken = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration  // â† This is the critical part!
    });
    
    if (currentToken) {
      console.log('âœ… FCM Token obtained:', currentToken.substring(0, 20) + '...');
      
      // Save token to user profile
      await saveFCMToken(userId, currentToken);
      
      console.log('âœ… Token saved successfully');
      return currentToken;
    } else {
      console.warn('âš ï¸ No FCM token available - check service worker and VAPID key');
      return null;
    }
  } catch (error) {
    console.error('âŒ Error getting FCM token:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Save FCM token to user's Firestore profile
 * @param {string} userId - Current user's ID
 * @param {string} token - FCM token
 */
export async function saveFCMToken(userId, token) {
  try {
    const userRef = doc(db, 'users', userId);
    
    await setDoc(userRef, {
      fcmTokens: arrayUnion(token),
      lastTokenUpdate: new Date().toISOString(),
      notificationsEnabled: true
    }, { merge: true });
    
    console.log('âœ… FCM token saved to user profile');
  } catch (error) {
    console.error('âŒ Error saving FCM token:', error);
    throw error;
  }
}

/**
 * Remove FCM token from user profile (when disabling notifications)
 * @param {string} userId - Current user's ID
 * @param {string} token - FCM token to remove
 */
export async function removeFCMToken(userId, token) {
  try {
    const userRef = doc(db, 'users', userId);
    
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.warn('User document does not exist, nothing to remove');
      return;
    }
    
    const userData = userDoc.data();
    const currentTokens = userData.fcmTokens || [];
    
    const updatedTokens = currentTokens.filter(t => t !== token);
    
    await setDoc(userRef, {
      fcmTokens: updatedTokens,
      notificationsEnabled: updatedTokens.length > 0,
      lastTokenUpdate: new Date().toISOString()
    }, { merge: true });
    
    console.log('âœ… FCM token removed from user profile');
  } catch (error) {
    console.error('âŒ Error removing FCM token:', error);
    throw error;
  }
}

/**
 * Disable all notifications and remove ALL FCM tokens
 * @param {string} userId - Current user's ID
 */
export async function disableAllNotifications(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    
    console.log('ðŸ”• Disabling all notifications for user:', userId);
    
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.warn('âš ï¸ User document does not exist, nothing to disable');
      return { success: true, message: 'No notifications to disable' };
    }
    
    const currentTokens = userDoc.data()?.fcmTokens || [];
    console.log(`ðŸ—‘ï¸ Removing ${currentTokens.length} token(s)`);
    
    await setDoc(userRef, {
      fcmTokens: [],
      notificationsEnabled: false,
      lastTokenUpdate: new Date().toISOString()
    }, { merge: true });
    
    console.log('âœ… All notifications disabled and tokens removed');
    return { success: true, message: 'Notifications disabled successfully' };
  } catch (error) {
    console.error('âŒ Error disabling all notifications:', error);
    throw error;
  }
}

/**
 * Listen for foreground messages (when app is open)
 */
export function onForegroundMessage(callback) {
  if (!messaging) {
    console.warn('⚠️ Firebase Messaging not available in this browser — skipping foreground handler');
    return () => {};
  }
  return onMessage(messaging, (payload) => {
    console.log('📨 Foreground message received:', payload);
    
    // Show notification even when app is open
    if (Notification.permission === 'granted') {
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/icon-192.png',
        tag: payload.data?.type || 'default',
        data: payload.data
      });
    }
    
    // Call custom callback for app-specific handling
    if (callback) {
      callback(payload);
    }
  });
}

/**
 * Update notification preferences in Firestore
 * @param {string} userId - Current user's ID
 * @param {object} preferences - Notification preference settings
 */
export async function updateNotificationPreferences(userId, preferences) {
  try {
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      notificationPreferences: preferences
    });
    
    console.log('âœ… Notification preferences updated');
  } catch (error) {
    console.error('âŒ Error updating notification preferences:', error);
    throw error;
  }
}
