// service-worker.js - Unified Service Worker
// Handles both offline functionality AND Firebase Cloud Messaging
// Version 2.1.02 - Force cache refresh to fix PWA stale load

const CACHE_VERSION = 'aces-v2.1.02';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Base path for GitHub Pages subdirectory deployment
const BASE_PATH = '';

// Only CSS files use cache-first (small, stable, helps visual consistency)
// JS files now use network-first so updates roll out immediately!
const STATIC_ASSETS = [
  `${BASE_PATH}/style.css`,
  `${BASE_PATH}/shared-styles.css`,
  `${BASE_PATH}/mobile-enhancements.css`,
  `${BASE_PATH}/nav-styles.css`
];

// HTML pages to pre-cache for offline (but served network-first when online)
const HTML_PAGES = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/current-season.html`,
  `${BASE_PATH}/weekend-preview.html`,
  `${BASE_PATH}/batting.html`,
  `${BASE_PATH}/pitching.html`,
  `${BASE_PATH}/signin.html`,
  `${BASE_PATH}/signup.html`,
  `${BASE_PATH}/submit-score.html`,
  `${BASE_PATH}/submit-stats.html`,
  `${BASE_PATH}/league-history.html`,
  `${BASE_PATH}/profile.html`,
  `${BASE_PATH}/profile-fan.html`,
  `${BASE_PATH}/awards.html`,
  `${BASE_PATH}/league-rules.html`,
  `${BASE_PATH}/verify-email.html`,
  `${BASE_PATH}/reset-password.html`,
  `${BASE_PATH}/link-player.html`,
  `${BASE_PATH}/teams.html`,
  `${BASE_PATH}/players.html`,
  `${BASE_PATH}/offline.html`,
  `${BASE_PATH}/offseason.html`,
  `${BASE_PATH}/offseason-roster.html`,
  `${BASE_PATH}/schedule-generator.html`,
  `${BASE_PATH}/game-tracker.html`,
  `${BASE_PATH}/roster-management.html`,
  `${BASE_PATH}/favorites.html`,
  `${BASE_PATH}/game-preview.html`,
  `${BASE_PATH}/player.html`,
  `${BASE_PATH}/season.html`,
  `${BASE_PATH}/seasons.html`,
  `${BASE_PATH}/playoffs.html`,
  `${BASE_PATH}/leaders.html`,
  `${BASE_PATH}/milestones.html`,
  `${BASE_PATH}/pictures.html`,
  `${BASE_PATH}/photo-upload.html`,
  `${BASE_PATH}/compare.html`,
  `${BASE_PATH}/team_compare.html`,
  `${BASE_PATH}/h2h_grid.html`,
  `${BASE_PATH}/charts.html`,
  `${BASE_PATH}/recap.html`,
  `${BASE_PATH}/champions.html`,
  `${BASE_PATH}/query-stats.html`,
  `${BASE_PATH}/aggregate-stats.html`,
  `${BASE_PATH}/manage-team.html`,
  `${BASE_PATH}/approve-links.html`,
  `${BASE_PATH}/current-season-team.html`,
  `${BASE_PATH}/offseason-schedule.html`,
  `${BASE_PATH}/offseason.html`,
  `${BASE_PATH}/bracket.html`,
  `${BASE_PATH}/pitcher.html`
];

// Firebase and external resources
const EXTERNAL_RESOURCES = [
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js'
];

// ==============================================
// FIREBASE MESSAGING SETUP
// ==============================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in service worker
firebase.initializeApp({
  apiKey: "AIzaSyCAEWkrTcprzJ2KPPJu-vFJPvYOVU4ky20",
  authDomain: "acessoftballreference-84791.firebaseapp.com",
  projectId: "acessoftballreference-84791",
  storageBucket: "acessoftballreference-84791.firebasestorage.app",
  messagingSenderId: "777699560175",
  appId: "1:777699560175:web:4092b422e7d7116352e91a"
});

const messaging = firebase.messaging();

// Handle background messages (when app is not open)
// NOTE: FCM automatically displays notifications when 'notification' payload exists
// This handler is for setting badges and processing data-only messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  
  // Set app badge for iOS PWA and supported browsers
  if (navigator.setAppBadge) {
    navigator.setAppBadge(1).then(() => {
      console.log('[SW] ✅ App badge set');
    }).catch(err => {
      console.log('[SW] ⚠️ Could not set app badge:', err);
    });
  }
  
  // Only show notification manually if there's NO notification payload
  // (i.e., data-only messages). FCM auto-displays when notification payload exists.
  if (!payload.notification) {
    console.log('[SW] Data-only message, showing notification manually');
    const notificationTitle = payload.data?.title || 'Mountainside Aces';
    const notificationBody = payload.data?.body || 'New notification';
    
    const notificationOptions = {
      body: notificationBody,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      // Make tag unique to prevent silent replacement (iOS PWA fix)
      tag: `${payload.data?.type || 'default'}_${payload.data?.gameId || ''}_${Date.now()}`,
      data: payload.data || {},
      requireInteraction: false,
      vibrate: [200, 100, 200],
      renotify: true // Ensure alert shows even if replacing existing notification
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
  }
  
  console.log('[SW] ✅ FCM will auto-display notification');
});

// ==============================================
// SERVICE WORKER LIFECYCLE EVENTS
// ==============================================

// Install event - cache static assets
// CRITICAL: Do NOT call skipWaiting() here - mobile-enhancements.js handles activation
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v' + CACHE_VERSION + '...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        console.log('[SW] Caching static assets (CSS only - JS uses network-first)...');
        
        // Cache CSS, JS, and external resources
        const allAssets = [...STATIC_ASSETS, ...EXTERNAL_RESOURCES];
        const cachePromises = allAssets.map(async (asset) => {
          try {
            await cache.add(asset);
            console.log(`[SW] ✅ Cached: ${asset}`);
          } catch (error) {
            console.error(`[SW] ❌ Failed to cache: ${asset}`, error);
          }
        });
        
        await Promise.allSettled(cachePromises);
        console.log('[SW] Static assets cached');
        
        // Pre-cache HTML pages for offline use (they'll use network-first when online)
        console.log('[SW] Pre-caching HTML pages for offline...');
        const htmlPromises = HTML_PAGES.map(async (page) => {
          try {
            await cache.add(page);
            console.log(`[SW] ✅ Cached HTML: ${page}`);
          } catch (error) {
            console.error(`[SW] ❌ Failed to cache HTML: ${page}`, error);
          }
        });
        
        await Promise.allSettled(htmlPromises);
        console.log('[SW] HTML pages pre-cached for offline');
      })
      .then(() => {
        console.log('[SW] Installation complete - waiting for activation');
        // DO NOT call skipWaiting() here - mobile-enhancements.js handles this after page loads
      })
      .catch((error) => {
        console.error('[SW] Critical error during installation:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v' + CACHE_VERSION + '...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete caches that don't match current version
              return cacheName.startsWith('aces-') && 
                     !cacheName.startsWith(CACHE_VERSION);
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated v' + CACHE_VERSION);
        return self.clients.claim(); // Take control of all pages
      })
  );
});

// ==============================================
// MESSAGE HANDLING
// ==============================================

// Listen for messages from the app
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  // Handle skip waiting message - just call skipWaiting and let activate event handle the rest
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING requested');
    self.skipWaiting();
    // Note: clients.claim() is called in the activate event handler
    // controllerchange event will fire on the page when this SW takes control
  }

  // Handle cache URLs message
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urlsToCache = event.data.urls;
    caches.open(DYNAMIC_CACHE).then((cache) => {
      cache.addAll(urlsToCache);
    });
  }
  
  // Handle badge clear request (when app is opened)
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().then(() => {
        console.log('[SW] App badge cleared via message');
      }).catch(err => {
        console.log('[SW] Could not clear app badge:', err);
      });
    }
  }
});

// ==============================================
// FETCH STRATEGIES
// ==============================================

// Fetch event - serve from cache or network with strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

    // Skip Chrome extension requests
      if (url.protocol === 'chrome-extension:') {
        return;
      }

      // Skip Firebase Storage requests - let browser handle directly (CORS configured)
      if (url.hostname.includes('firebasestorage.googleapis.com')) {
        return;
      }


  // Only handle requests for our app (not other origins)
  if (!url.pathname.startsWith(BASE_PATH) && !isExternalResource(url)) {
    return;
  }

  // Strategy 1: Cache-first for CSS only
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy 2: Network-first for JS files (always get latest!)
  if (isJavaScriptFile(url)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Strategy 3: Cache-first for images
  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Strategy 4: Network-first for Firebase API calls
  if (isFirebaseRequest(url)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Strategy 5: Network-first with offline fallback for HTML pages
  if (request.headers.get('Accept') && request.headers.get('Accept').includes('text/html')) {
    event.respondWith(networkFirstWithOfflinePage(request));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// Cache-first strategy: Try cache, fallback to network
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const fallbackCache = await caches.match(request);
    if (fallbackCache) {
      return fallbackCache;
    }
    
    console.error('[SW] Cache-first failed (no cache and no network):', request.url);
    throw error;
  }
}

// Network-first strategy: Try network, fallback to cache
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Network-first with offline fallback page
async function networkFirstWithOfflinePage(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, checking cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const offlinePage = await caches.match(`${BASE_PATH}/offline.html`);
    if (offlinePage) {
      return offlinePage;
    }

    throw error;
  }
}

// ==============================================
// HELPER FUNCTIONS
// ==============================================

function isStaticAsset(url) {
  return STATIC_ASSETS.some(asset => url.pathname === asset);
}

function isJavaScriptFile(url) {
  return url.pathname.endsWith('.js');
}

function isExternalResource(url) {
  return EXTERNAL_RESOURCES.some(resource => url.href.startsWith(resource));
}

function isImageRequest(url) {
  return url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i);
}

function isFirebaseRequest(url) {
  return url.hostname.includes('firebaseio.com') ||
         url.hostname.includes('googleapis.com') ||
         url.hostname.includes('firestore.googleapis.com');
}

// ==============================================
// NOTIFICATION CLICK HANDLING
// ==============================================

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  // Clear app badge when notification is clicked
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().then(() => {
      console.log('[SW] ✅ App badge cleared');
    }).catch(err => {
      console.log('[SW] ⚠️ Could not clear app badge:', err);
    });
  }

  const clickAction = event.notification.data?.clickAction || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: clickAction
            });
            return client.focus();
          }
        }
        // Otherwise, open new window
        if (clients.openWindow) {
          return clients.openWindow(clickAction);
        }
      })
  );
});

// ==============================================
// BACKGROUND SYNC
// ==============================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueuedActions());
  }
});

async function syncQueuedActions() {
  try {
    const db = await openDatabase();
    const queue = await getQueuedActions(db);

    console.log(`[SW] Syncing ${queue.length} queued actions`);

    for (const action of queue) {
      try {
        await processQueuedAction(action);
        await removeFromQueue(db, action.id);
        console.log('[SW] Synced action:', action.type);
      } catch (error) {
        console.error('[SW] Failed to sync action:', action.type, error);
      }
    }

    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        syncedCount: queue.length
      });
    });
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// ==============================================
// INDEXEDDB QUEUE HELPERS
// ==============================================

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AcesOfflineQueue', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getQueuedActions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['queue'], 'readonly');
    const store = transaction.objectStore('queue');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromQueue(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['queue'], 'readwrite');
    const store = transaction.objectStore('queue');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function processQueuedAction(action) {
  switch (action.type) {
    case 'RSVP':
      // Call Firebase RSVP function
      break;
    case 'LINEUP_UPDATE':
      // Call Firebase lineup function
      break;
    default:
      console.warn('[SW] Unknown action type:', action.type);
  }
}
