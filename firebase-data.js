// firebase-data.js
// v2.0 shim. The data reads now live in js/data/ (seasons, games, teams,
// players, player-stats, awards). This file re-exports all of them under the
// same names so pages that still import firebase-data.js keep working.
// New code imports from js/data/ directly. Deleted in Phase 4.

// firebase-config.js first: it creates the Firebase app on legacy pages.
import { app, db, doc, getDoc } from './firebase-config.js';

// Re-exported for firebase-auth.js, firebase-storage.js and other legacy files.
export { app, db, doc, getDoc };

export * from './js/data/index.js';
