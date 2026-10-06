// offline-queue.js - Offline Action Queue Manager
// Handles queuing and syncing of user actions when offline

class OfflineQueue {
  constructor() {
    this.dbName = 'AcesOfflineQueue';
    this.dbVersion = 1;
    this.storeName = 'queue';
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    
    this.init();
  }

  async init() {
    // Open IndexedDB
    await this.openDB();
    
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_COMPLETE') {
          console.log(`✅ Synced ${event.data.syncedCount} queued actions`);
          this.showSyncNotification(event.data.syncedCount);
        }
      });
    }
    
    // Try to sync on page load if online
    if (this.isOnline) {
      await this.syncQueue();
    }
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('📦 IndexedDB opened successfully');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true
          });
          
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('type', 'type', { unique: false });
          
          console.log('📦 Created IndexedDB object store');
        }
      };
    });
  }

  async addToQueue(type, data) {
    if (!this.db) {
      await this.openDB();
    }

    const action = {
      type,
      data,
      timestamp: Date.now(),
      retries: 0
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(action);
      
      request.onsuccess = () => {
        console.log(`📝 Queued ${type} action (offline):`, data);
        this.showQueuedNotification(type);
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Failed to add to queue:', request.error);
        reject(request.error);
      };
    });
  }

  async getQueue() {
    if (!this.db) {
      await this.openDB();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeFromQueue(id) {
    if (!this.db) {
      await this.openDB();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearQueue() {
    if (!this.db) {
      await this.openDB();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('🗑️ Queue cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async syncQueue() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Starting queue sync...');

    try {
      const queue = await this.getQueue();
      
      if (queue.length === 0) {
        console.log('✅ Queue is empty, nothing to sync');
        this.syncInProgress = false;
        return;
      }

      console.log(`🔄 Syncing ${queue.length} queued actions...`);

      for (const action of queue) {
        try {
          await this.processAction(action);
          await this.removeFromQueue(action.id);
          console.log(`✅ Synced ${action.type} action`);
        } catch (error) {
          console.error(`❌ Failed to sync ${action.type}:`, error);
          
          // Increment retry counter
          action.retries = (action.retries || 0) + 1;
          
          // Remove if too many retries (max 3)
          if (action.retries >= 3) {
            console.warn(`⚠️ Removing ${action.type} after 3 failed attempts`);
            await this.removeFromQueue(action.id);
          }
        }
      }

      this.showSyncNotification(queue.length);
      console.log('✅ Queue sync complete');
    } catch (error) {
      console.error('❌ Queue sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async processAction(action) {
    switch (action.type) {
      case 'RSVP':
        return await this.syncRSVP(action.data);
      
      case 'LINEUP_UPDATE':
        return await this.syncLineup(action.data);
		
	 case 'SCORE_UPDATE':  // ← ADD THIS NEW CASE
      return await this.syncScore(action.data);	
      
      case 'PROFILE_UPDATE':
        return await this.syncProfile(action.data);
      
      case 'FAVORITE_ADD':
        return await this.syncFavoriteAdd(action.data);
      
      case 'FAVORITE_REMOVE':
        return await this.syncFavoriteRemove(action.data);
      
      default:
        console.warn('Unknown action type:', action.type);
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // Sync RSVP to Firebase
 async syncRSVP(data) {
  const { gameId, playerId, status, playerName, teamId } = data;
  
  // Try window.FirebaseRoster first (most likely)
  if (window.FirebaseRoster && typeof window.FirebaseRoster.updateRSVP === 'function') {
    await window.FirebaseRoster.updateRSVP(gameId, playerId, status, playerName, teamId);
  } else if (typeof updateRSVP === 'function') {
    await updateRSVP(gameId, playerId, status, playerName, teamId);
  } else {
    console.error('updateRSVP function not available');
    throw new Error('updateRSVP function not available');
  }
}

  // Sync lineup update to Firebase
async syncLineup(data) {
  const { gameId, teamId, userId, type, inning, playerIds, positions } = data;
  
  if (!window.FirebaseRoster) {
    throw new Error('FirebaseRoster not available');
  }
  
  try {
    if (type === 'batting') {
      await window.FirebaseRoster.saveBattingOrder(gameId, teamId, playerIds, userId);
    } else if (type === 'fielding') {
      await window.FirebaseRoster.saveFieldingPositions(gameId, teamId, inning, positions, userId);
    } else if (type === 'bench') {
      await window.FirebaseRoster.saveBenchPlayers(gameId, teamId, inning, playerIds, userId);
    }
    console.log(`✅ Synced ${type} lineup for game ${gameId}`);
  } catch (error) {
    console.error(`Failed to sync ${type} lineup:`, error);
    throw error;
  }
}

// Sync score update to Firebase
async syncScore(data) {
  const { gameId, teamId, score, inning, outs, bases, playHistory, battingOrder, timestamp } = data;
  
  console.log(`Syncing game state for ${teamId} - Score: ${score?.yourTeam || 0}-${score?.opponent || 0}`);
  
  // Import Firebase functions
  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { db } = await import('./firebase-data.js');
  
  try {
    const stateRef = doc(db, 'gameStates', `${gameId}_${teamId}`);
    
    // Reconstruct the game state object
    const gameState = {
      score: score,
      inning: inning,
      outs: outs,
      bases: bases,
      playHistory: playHistory,
      gameActive: true
    };
    
    await setDoc(stateRef, {
      gameState,
      battingOrder: battingOrder,
      savedAt: serverTimestamp()
    });
    
    console.log('✅ Synced game state to Firebase');
  } catch (error) {
    console.error('Failed to sync game state:', error);
    throw error;
  }
}


  // Sync profile update to Firebase
  async syncProfile(data) {
    const { userId, updates } = data;
    
    if (typeof updateUserProfile === 'function') {
      await updateUserProfile(userId, updates);
    } else {
      throw new Error('updateUserProfile function not available');
    }
  }

  // Sync favorite addition
  async syncFavoriteAdd(data) {
    const { type, id } = data; // type: 'player' or 'team'
    
    if (typeof addFavorite === 'function') {
      await addFavorite(type, id);
    } else {
      throw new Error('addFavorite function not available');
    }
  }

  // Sync favorite removal
  async syncFavoriteRemove(data) {
    const { type, id } = data;
    
    if (typeof removeFavorite === 'function') {
      await removeFavorite(type, id);
    } else {
      throw new Error('removeFavorite function not available');
    }
  }

  handleOnline() {
    this.isOnline = true;
    console.log('🌐 Connection restored');
    this.showOnlineNotification();
    
    // Sync queue when back online
    this.syncQueue();
    
    // Register for background sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.sync.register('sync-queue');
      });
    }
  }

  handleOffline() {
    this.isOnline = false;
    console.log('📡 Connection lost');
    this.showOfflineNotification();
  }

  // UI Notifications
  showOfflineNotification() {
    this.showNotification('📡 You\'re offline', 'Your changes will be saved and synced when you\'re back online.', 'warning');
  }

  showOnlineNotification() {
    this.showNotification('🌐 Back online!', 'Syncing your changes...', 'success');
  }

  showQueuedNotification(actionType) {
    const messages = {
      'RSVP': 'RSVP saved',
      'LINEUP_UPDATE': 'Lineup saved',
	    'SCORE_UPDATE': 'Score saved',  // ← ADD THIS LINE
      'PROFILE_UPDATE': 'Profile changes saved',
      'FAVORITE_ADD': 'Favorite added',
      'FAVORITE_REMOVE': 'Favorite removed'
    };
    
    const message = messages[actionType] || 'Change saved';
    this.showNotification('📝 ' + message, 'Will sync when online', 'info');
  }

  showSyncNotification(count) {
    if (count > 0) {
      this.showNotification('✅ Sync complete!', `Synced ${count} change${count > 1 ? 's' : ''}`, 'success');
    }
  }

  showNotification(title, message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `offline-notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('offline-notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'offline-notification-styles';
      styles.textContent = `
        .offline-notification {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10000;
          max-width: 320px;
          animation: slideIn 0.3s ease-out;
        }

        .offline-notification.warning {
          border-left: 4px solid #ffc107;
        }

        .offline-notification.success {
          border-left: 4px solid #28a745;
        }

        .offline-notification.info {
          border-left: 4px solid #17a2b8;
        }

        .notification-content strong {
          display: block;
          margin-bottom: 4px;
          color: #1a1a1a;
        }

        .notification-content p {
          margin: 0;
          font-size: 14px;
          color: #666;
        }

        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // Get queue status
  async getQueueStatus() {
    const queue = await this.getQueue();
    return {
      count: queue.length,
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress
    };
  }
}

// Create global instance
window.offlineQueue = new OfflineQueue();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineQueue;
}