// js/core/firebase.js
// The one Firebase setup for v2.0 pages.
//
// - SDK pinned to one version (SDK_VERSION). Pages import Firestore functions
//   from here instead of the gstatic CDN, so there is only one version in play.
// - Shares the app with the legacy firebase-config.js during migration: same
//   SDK version means same module instance, so getApps() sees one app.
// - Preview guardrails (see env.js). Always on the preview: no Analytics and
//   no Messaging. Only when ROUTE_PREVIEW_WRITES is on (SANDBOX_ACTIVE):
//     * every Firestore write goes to `<topLevelCollection>_test`
//     * SANDBOXED collections also READ from _test, so flows like a mock game
//       can read back what they wrote
//   Skipping Messaging means the preview never adds FCM tokens to live user
//   docs. On the live domain all of this is a pass-through.
//
// Not covered here (call sites must handle): Cloud Functions callables
// (server-side writes), Storage uploads, and collectionGroup() queries.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  persistentLocalCache,
  collection as fsCollection,
  doc as fsDoc,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  getDoc as fsGetDoc,
  deleteDoc as fsDeleteDoc,
  addDoc as fsAddDoc,
  writeBatch as fsWriteBatch,
  runTransaction as fsRunTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { IS_PREVIEW, IS_LIVE, SANDBOX_ACTIVE, TEST_SUFFIX } from './env.js';

export { IS_PREVIEW, IS_LIVE, SANDBOX_ACTIVE, TEST_SUFFIX };
export const SDK_VERSION = '10.7.1'; // keep in step with the import URLs above

// Everything else from Firestore passes straight through (query, where, getDocs,
// onSnapshot, serverTimestamp, increment, arrayUnion, ...). The explicit exports
// below take precedence over these for the guarded functions.
export * from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: 'AIzaSyCAEWkrTcprzJ2KPPJu-vFJPvYOVU4ky20',
  authDomain: 'acessoftballreference-84791.firebaseapp.com',
  projectId: 'acessoftballreference-84791',
  storageBucket: 'acessoftballreference-84791.firebasestorage.app',
  messagingSenderId: '777699560175',
  appId: '1:777699560175:web:4092b422e7d7116352e91a',
  measurementId: 'G-1F8JKZH6DZ'
};

export const VAPID_KEY = 'BK39jgi3AT0p9jdaUBIPHz3vBkBg4YRvY-yMNuGMIJEhGbXTomDyKo77ug0hPYa10YBjJBM_GRBErlYp09cDSRw';

// Reuse the app if legacy firebase-config.js already created it on this page.
const appAlreadyExisted = getApps().length > 0;
export const app = appAlreadyExisted ? getApp() : initializeApp(firebaseConfig);

// Same cache choice as firebase-config.js: Safari desktop's IndexedDB is
// unreliable under ITP, so it gets the memory cache.
const isSafari = /^((?!chrome|android).)*safari/i.test(globalThis.navigator?.userAgent || '');

function createDb() {
  if (appAlreadyExisted) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: isSafari ? memoryLocalCache() : persistentLocalCache()
    });
  } catch (err) {
    // Already initialized elsewhere on this page: use that instance.
    return getFirestore(app);
  }
}

export const db = createDb();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Analytics and Messaging are live-only. Load them on demand so a page that
// never uses them doesn't pay for them, and the preview never touches them.
let analyticsPromise = null;
export function getAnalyticsInstance() {
  if (!IS_LIVE) return Promise.resolve(null);
  analyticsPromise ??= import('https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js')
    .then(({ getAnalytics }) => getAnalytics(app))
    .catch(() => null);
  return analyticsPromise;
}

let messagingPromise = null;
export function getMessagingInstance() {
  if (!IS_LIVE) return Promise.resolve(null);
  messagingPromise ??= import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js')
    .then(async ({ getMessaging, isSupported }) => ((await isSupported()) ? getMessaging(app) : null))
    .catch(() => null);
  return messagingPromise;
}

// ---------------------------------------------------------------------------
// Preview routing
// ---------------------------------------------------------------------------

// Read AND write from _test on the preview. Game-day state that a test session
// needs to read back. Everything else reads live data and only writes to _test.
export const SANDBOXED_COLLECTIONS = new Set([
  'gameStates',
  'lineups',
  'battingOrders',
  'fieldingPositions',
  'benchPlayers',
  'rsvps',
  'gameRSVPs'
]);

/** Name a top-level collection resolves to for writes on this host. */
export function testCollectionName(name) {
  if (!SANDBOX_ACTIVE || name.endsWith(TEST_SUFFIX)) return name;
  return name + TEST_SUFFIX;
}

const announced = new Set();
function announce(from, to, kind) {
  if (announced.has(from)) return;
  announced.add(from);
  console.info(`[preview] ${kind} ${from} -> ${to}`);
}

// Rebuild a Document/CollectionReference with its top-level collection renamed.
function reroute(ref, kind) {
  if (!SANDBOX_ACTIVE || !ref || typeof ref.path !== 'string') return ref;
  const segments = ref.path.split('/');
  const top = segments[0];
  if (top.endsWith(TEST_SUFFIX)) return ref;
  segments[0] = top + TEST_SUFFIX;
  announce(top, segments[0], kind);
  const rebuilt = ref.type === 'document'
    ? fsDoc(ref.firestore, segments.join('/'))
    : fsCollection(ref.firestore, segments.join('/'));
  return ref.converter ? rebuilt.withConverter(ref.converter) : rebuilt;
}

function routeIfSandboxed(ref) {
  if (!SANDBOX_ACTIVE || !ref || typeof ref.path !== 'string') return ref;
  return SANDBOXED_COLLECTIONS.has(ref.path.split('/')[0]) ? reroute(ref, 'sandbox') : ref;
}

const routeWrite = (ref) => reroute(ref, 'writes');

// Copy-on-write for updates: updateDoc fails on a missing doc, and on the
// preview `users_test/{uid}` won't exist until something creates it. The first
// update to a _test doc copies the live doc across, then applies the change.
const seeded = new Set();
async function seedFromLive(liveRef, testRef) {
  if (testRef === liveRef || seeded.has(testRef.path)) return;
  seeded.add(testRef.path);
  try {
    const testPlain = testRef.withConverter(null);
    if ((await fsGetDoc(testPlain)).exists()) return;
    const live = await fsGetDoc(liveRef.withConverter(null));
    if (live.exists()) await fsSetDoc(testPlain, live.data());
  } catch (err) {
    seeded.delete(testRef.path);
    console.warn('[preview] could not seed', testRef.path, err);
  }
}

// ---------------------------------------------------------------------------
// Guarded Firestore functions (same signatures as the SDK)
// ---------------------------------------------------------------------------

export function collection(...args) {
  return routeIfSandboxed(fsCollection(...args));
}

export function doc(...args) {
  return routeIfSandboxed(fsDoc(...args));
}

export function setDoc(ref, ...rest) {
  return fsSetDoc(routeWrite(ref), ...rest);
}

export async function updateDoc(ref, ...rest) {
  const target = routeWrite(ref);
  await seedFromLive(ref, target);
  return fsUpdateDoc(target, ...rest);
}

export function deleteDoc(ref) {
  return fsDeleteDoc(routeWrite(ref));
}

export function addDoc(ref, data) {
  return fsAddDoc(routeWrite(ref), data);
}

export function writeBatch(firestore) {
  const batch = fsWriteBatch(firestore);
  if (!SANDBOX_ACTIVE) return batch;
  const { set, update, commit } = batch;
  const del = batch.delete;
  const toSeed = [];
  batch.set = (ref, ...rest) => { set.call(batch, routeWrite(ref), ...rest); return batch; };
  batch.update = (ref, ...rest) => {
    const target = routeWrite(ref);
    toSeed.push([ref, target]);
    update.call(batch, target, ...rest);
    return batch;
  };
  batch.delete = (ref) => { del.call(batch, routeWrite(ref)); return batch; };
  batch.commit = async () => {
    await Promise.all(toSeed.map(([live, target]) => seedFromLive(live, target)));
    return commit.call(batch);
  };
  return batch;
}

// Transaction reads stay where the ref points (live, unless sandboxed);
// transaction writes go to _test. No copy-on-write here (a transaction can't
// read after it writes), so transaction.update() on a _test doc that doesn't
// exist yet fails on the preview. Use set(..., { merge: true }) if that bites.
export function runTransaction(firestore, updateFunction, options) {
  if (!SANDBOX_ACTIVE) return fsRunTransaction(firestore, updateFunction, options);
  return fsRunTransaction(firestore, (transaction) => {
    const { set, update } = transaction;
    const del = transaction.delete;
    transaction.set = (ref, ...rest) => { set.call(transaction, routeWrite(ref), ...rest); return transaction; };
    transaction.update = (ref, ...rest) => { update.call(transaction, routeWrite(ref), ...rest); return transaction; };
    transaction.delete = (ref) => { del.call(transaction, routeWrite(ref)); return transaction; };
    return updateFunction(transaction);
  }, options);
}

// ---------------------------------------------------------------------------
// Tell preview-guard.js this page's writes are guarded
// ---------------------------------------------------------------------------

if (SANDBOX_ACTIVE) {
  globalThis.__acesWriteGuard = true;
  globalThis.dispatchEvent?.(new Event('aces:write-guard'));
  console.info('[preview] core/firebase.js: writes route to *_test collections');
}
