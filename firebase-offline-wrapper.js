// firebase-offline-wrapper.js
// Wrapper functions that automatically handle offline queueing for Firebase operations

// Offline-aware RSVP update
async function updateRSVPOffline(gameId, userId, status) {
  // Check if online
  if (!navigator.onLine) {
    console.log('📝 Offline: Queueing RSVP update');
    
    // Add to offline queue
    await window.offlineQueue.addToQueue('RSVP', {
      gameId,
      userId,
      status
    });
    
    // Update local cache/UI immediately for optimistic update
    updateLocalRSVPCache(gameId, userId, status);
    
    return { queued: true };
  }

  // If online, call the actual Firebase function
  try {
    await updateRSVP(gameId, userId, status);
    return { success: true };
  } catch (error) {
    console.error('Failed to update RSVP:', error);
    
    // If Firebase call fails, queue it for later
    await window.offlineQueue.addToQueue('RSVP', {
      gameId,
      userId,
      status
    });
    
    throw error;
  }
}

// Offline-aware lineup save
async function saveLineupOffline(gameId, teamId, lineup) {
  if (!navigator.onLine) {
    console.log('📝 Offline: Queueing lineup update');
    
    await window.offlineQueue.addToQueue('LINEUP_UPDATE', {
      gameId,
      teamId,
      lineup
    });
    
    // Update local cache
    updateLocalLineupCache(gameId, teamId, lineup);
    
    return { queued: true };
  }

  try {
    await saveLineup(gameId, teamId, lineup);
    return { success: true };
  } catch (error) {
    console.error('Failed to save lineup:', error);
    
    await window.offlineQueue.addToQueue('LINEUP_UPDATE', {
      gameId,
      teamId,
      lineup
    });
    
    throw error;
  }
}

// Offline-aware profile update
async function updateProfileOffline(userId, updates) {
  if (!navigator.onLine) {
    console.log('📝 Offline: Queueing profile update');
    
    await window.offlineQueue.addToQueue('PROFILE_UPDATE', {
      userId,
      updates
    });
    
    // Update local cache
    updateLocalProfileCache(userId, updates);
    
    return { queued: true };
  }

  try {
    await updateUserProfile(userId, updates);
    return { success: true };
  } catch (error) {
    console.error('Failed to update profile:', error);
    
    await window.offlineQueue.addToQueue('PROFILE_UPDATE', {
      userId,
      updates
    });
    
    throw error;
  }
}

// Offline-aware favorite add
async function addFavoriteOffline(type, id) {
  if (!navigator.onLine) {
    console.log('📝 Offline: Queueing favorite add');
    
    await window.offlineQueue.addToQueue('FAVORITE_ADD', {
      type,
      id
    });
    
    // Update local cache
    updateLocalFavoriteCache('add', type, id);
    
    return { queued: true };
  }

  try {
    await addFavorite(type, id);
    return { success: true };
  } catch (error) {
    console.error('Failed to add favorite:', error);
    
    await window.offlineQueue.addToQueue('FAVORITE_ADD', {
      type,
      id
    });
    
    throw error;
  }
}

// Offline-aware favorite remove
async function removeFavoriteOffline(type, id) {
  if (!navigator.onLine) {
    console.log('📝 Offline: Queueing favorite remove');
    
    await window.offlineQueue.addToQueue('FAVORITE_REMOVE', {
      type,
      id
    });
    
    // Update local cache
    updateLocalFavoriteCache('remove', type, id);
    
    return { queued: true };
  }

  try {
    await removeFavorite(type, id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove favorite:', error);
    
    await window.offlineQueue.addToQueue('FAVORITE_REMOVE', {
      type,
      id
    });
    
    throw error;
  }
}

// Local cache update functions (optimistic updates)
function updateLocalRSVPCache(gameId, userId, status) {
  try {
    const cacheKey = `rsvp_${gameId}_${userId}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      gameId,
      userId,
      status,
      timestamp: Date.now(),
      pending: true
    }));
  } catch (error) {
    console.error('Failed to update local RSVP cache:', error);
  }
}

function updateLocalLineupCache(gameId, teamId, lineup) {
  try {
    const cacheKey = `lineup_${gameId}_${teamId}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      gameId,
      teamId,
      lineup,
      timestamp: Date.now(),
      pending: true
    }));
  } catch (error) {
    console.error('Failed to update local lineup cache:', error);
  }
}

function updateLocalProfileCache(userId, updates) {
  try {
    const cacheKey = `profile_${userId}`;
    const existing = localStorage.getItem(cacheKey);
    const profile = existing ? JSON.parse(existing) : {};
    
    localStorage.setItem(cacheKey, JSON.stringify({
      ...profile,
      ...updates,
      timestamp: Date.now(),
      pending: true
    }));
  } catch (error) {
    console.error('Failed to update local profile cache:', error);
  }
}

function updateLocalFavoriteCache(action, type, id) {
  try {
    const cacheKey = `favorites_${type}`;
    const existing = localStorage.getItem(cacheKey);
    let favorites = existing ? JSON.parse(existing) : [];
    
    if (action === 'add' && !favorites.includes(id)) {
      favorites.push(id);
    } else if (action === 'remove') {
      favorites = favorites.filter(favId => favId !== id);
    }
    
    localStorage.setItem(cacheKey, JSON.stringify(favorites));
  } catch (error) {
    console.error('Failed to update local favorites cache:', error);
  }
}

// Helper: Get local cached data (for optimistic UI updates)
function getLocalCache(type, ...keys) {
  try {
    const cacheKey = `${type}_${keys.join('_')}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      
      // Return cached data with pending indicator
      return {
        ...data,
        isCached: true,
        isPending: data.pending || false
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get local cache:', error);
    return null;
  }
}

// Helper: Clear local cache after successful sync
function clearLocalCache(type, ...keys) {
  try {
    const cacheKey = `${type}_${keys.join('_')}`;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Failed to clear local cache:', error);
  }
}

// Helper: Show pending sync indicator in UI
function showPendingSyncIndicator(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const indicator = document.createElement('span');
  indicator.className = 'pending-sync-indicator';
  indicator.innerHTML = '⏳ Pending sync';
  indicator.style.cssText = `
    display: inline-block;
    margin-left: 8px;
    font-size: 12px;
    color: #ffc107;
    font-weight: 600;
  `;
  
  element.appendChild(indicator);
}

// Helper: Remove pending sync indicator
function removePendingSyncIndicator(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const indicator = element.querySelector('.pending-sync-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Export functions
window.updateRSVPOffline = updateRSVPOffline;
window.saveLineupOffline = saveLineupOffline;
window.updateProfileOffline = updateProfileOffline;
window.addFavoriteOffline = addFavoriteOffline;
window.removeFavoriteOffline = removeFavoriteOffline;
window.getLocalCache = getLocalCache;
window.clearLocalCache = clearLocalCache;
window.showPendingSyncIndicator = showPendingSyncIndicator;
window.removePendingSyncIndicator = removePendingSyncIndicator;