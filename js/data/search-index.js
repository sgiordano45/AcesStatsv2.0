// js/data/search-index.js
// The global-search index (js/domain/search-index.js): players, teams and
// seasons. Stored by the summary Cloud Function at siteConfig/searchIndex.
//
//   const index = await getSearchIndex();
//
// Order: this tab's copy (sessionStorage) -> the stored doc (one read) ->
// built here from aggregatedPlayerStats and the seasons list when the doc is
// missing, from an older version, or older than MAX_AGE_DAYS.

import { db, doc, getDoc, collection, getDocs } from '../core/firebase.js';
import { buildSearchIndex, SEARCH_INDEX_VERSION } from '../domain/search-index.js';

const KEY = 'aces.searchIndex.v' + SEARCH_INDEX_VERSION;
const MAX_AGE_DAYS = 7;
let pending = null;

const fresh = (ix) => ix && ix.version === SEARCH_INDEX_VERSION &&
  Date.now() - Date.parse(ix.builtAt || 0) < MAX_AGE_DAYS * 86400000;

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function writeSession(ix) {
  try { sessionStorage.setItem(KEY, JSON.stringify(ix)); } catch { /* storage full or blocked */ }
}

async function buildHere() {
  const [players, seasons] = await Promise.all([
    getDocs(collection(db, 'aggregatedPlayerStats')),
    getDocs(collection(db, 'seasons'))
  ]);
  return buildSearchIndex({
    players: players.docs.map(d => ({ id: d.id, ...d.data() })),
    seasonIds: seasons.docs.map(d => d.id)
  });
}

export function getSearchIndex() {
  const cached = readSession();
  if (fresh(cached)) return Promise.resolve(cached);
  pending ??= (async () => {
    try {
      const snap = await getDoc(doc(db, 'siteConfig', 'searchIndex'));
      const stored = snap.exists() ? snap.data() : null;
      if (fresh(stored)) { writeSession(stored); return stored; }
    } catch (err) {
      console.warn('[search] stored index unavailable; building here', err);
    }
    const built = await buildHere();
    writeSession(built);
    return built;
  })().finally(() => { pending = null; });
  return pending;
}
