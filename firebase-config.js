// firebase-config.js
// Firebase connection configuration for Mountainside Aces

// Import Firebase SDK from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  query,
  where,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAEWkrTcprzJ2KPPJu-vFJPvYOVU4ky20",
  authDomain: "acessoftballreference-84791.firebaseapp.com",
  projectId: "acessoftballreference-84791",
  storageBucket: "acessoftballreference-84791.firebasestorage.app",
  messagingSenderId: "777699560175",
  appId: "1:777699560175:web:4092b422e7d7116352e91a",
  measurementId: "G-1F8JKZH6DZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics — safe to fail silently
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn('Analytics unavailable:', e.message);
}

// Detect Safari for cache strategy
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Initialize Firestore with appropriate cache based on browser.
// Safari desktop has unreliable IndexedDB under ITP — use memory cache there.
const db = initializeFirestore(app, {
  localCache: isSafari ? memoryLocalCache() : persistentLocalCache()
});

console.log(`✅ Firestore initialized with ${isSafari ? 'Memory' : 'IndexedDB'} cache`);

const storage = getStorage(app);

// Firebase Cloud Messaging requires Push API — not supported in Safari desktop.
// Wrap in try/catch so a missing Push API never breaks module initialization.
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn('Firebase Messaging not supported in this browser:', e.message);
}

// Initialize Firebase Cloud Functions
const functions = getFunctions(app);

// VAPID key from Firebase Console
const VAPID_KEY = "BK39jgi3AT0p9jdaUBIPHz3vBkBg4YRvY-yMNuGMIJEhGbXTomDyKo77ug0hPYa10YBjJBM_GRBErlYp09cDSRw";

// Export everything other files will need
export { 
  app,
  db,
  storage,
  messaging,
  functions,
  analytics,
  VAPID_KEY,
  collection, 
  doc, 
  getDocs,
  getDocsFromServer,
  getDoc,
  query,
  where,
  orderBy,
  limit
};
