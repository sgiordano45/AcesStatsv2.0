// js/data/lineups.js
// RSVPs, lineups and lineup templates for roster-management.html.
// Same Firestore shapes as firebase-roster.js (v1), so both versions can
// read what the other wrote:
//   rsvps/{gameId}/responses/{playerId}            { status, playerName, teamId, updatedAt, updatedBy }
//   lineups/{gameId}/batting/{team}                { order: [playerId|null], finalized, ... }
//   lineups/{gameId}/fielding/{team}/innings/{n}   { positions: { P: {id, name, jersey} }, finalized }
//   lineups/{gameId}/bench/{team}/innings/{n}      { players: [playerId] }
//   lineupTemplates/{team}/batting|fielding/{id}   { name, order | positions, createdAt, createdBy }
// playerId is the roster player's authId when linked, else the legacy snake_case ID.

import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection,
  query, orderBy, onSnapshot, serverTimestamp
} from '../core/firebase.js';

export const INNINGS = [1, 2, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------------------
// RSVPs
// ---------------------------------------------------------------------------

function rsvpMap(snapshot) {
  const out = {};
  snapshot.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

export async function getGameRsvps(gameId) {
  return rsvpMap(await getDocs(collection(db, 'rsvps', gameId, 'responses')));
}

/** Live RSVPs for one game. Returns the unsubscribe function. */
export function watchGameRsvps(gameId, callback) {
  return onSnapshot(
    collection(db, 'rsvps', gameId, 'responses'),
    (snap) => callback(rsvpMap(snap)),
    (err) => console.warn(`[lineups] RSVP listener for ${gameId} stopped`, err)
  );
}

/** Same fields as v1 updateRSVP. updatedBy stays the player ID, as before. */
export async function saveRsvp(gameId, playerId, status, playerName, teamId) {
  await setDoc(doc(db, 'rsvps', gameId, 'responses', playerId), {
    status,
    playerName: playerName || 'Unknown',
    teamId,
    updatedAt: serverTimestamp(),
    updatedBy: playerId
  }, { merge: true });
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

/**
 * Everything saved for one team in one game.
 * fielding values are left as stored (a player object or, from very old
 * saves, a bare ID); the page resolves them against the roster.
 */
export async function loadLineup(gameId, team) {
  const [batSnap, fieldSnap, benchSnap] = await Promise.all([
    getDoc(doc(db, 'lineups', gameId, 'batting', team)),
    getDocs(collection(db, 'lineups', gameId, 'fielding', team, 'innings')),
    getDocs(collection(db, 'lineups', gameId, 'bench', team, 'innings'))
  ]);
  const bat = batSnap.exists() ? batSnap.data() : null;
  const fielding = {};
  const fieldDocs = new Set();
  let fieldFinal = false;
  fieldSnap.forEach((d) => {
    const data = d.data();
    fielding[d.id] = data.positions || {};
    fieldDocs.add(Number(d.id));
    if (data.finalized === true) fieldFinal = true;
  });
  const bench = {};
  benchSnap.forEach((d) => { bench[d.id] = d.data().players || []; });
  return {
    exists: !!bat,
    order: bat?.order || [],
    batFinal: bat?.finalized === true,
    fielding,
    fieldDocs,
    fieldFinal,
    bench
  };
}

export async function saveBattingOrder(gameId, team, order, uid) {
  await setDoc(doc(db, 'lineups', gameId, 'batting', team), {
    order,
    updatedAt: serverTimestamp(),
    updatedBy: uid || ''
  });
}

export async function saveFieldingPositions(gameId, team, inning, positions, uid) {
  await setDoc(doc(db, 'lineups', gameId, 'fielding', team, 'innings', String(inning)), {
    positions: positions || {},
    updatedAt: serverTimestamp(),
    updatedBy: uid || ''
  });
}

export async function saveBenchPlayers(gameId, team, inning, playerIds, uid) {
  await setDoc(doc(db, 'lineups', gameId, 'bench', team, 'innings', String(inning)), {
    players: playerIds || [],
    updatedAt: serverTimestamp(),
    updatedBy: uid || ''
  });
}

/** Mark the batting order final (or open it again). The doc must exist. */
export async function setBattingFinal(gameId, team, final, uid) {
  const ref = doc(db, 'lineups', gameId, 'batting', team);
  await updateDoc(ref, final
    ? { finalized: true, finalizedAt: serverTimestamp(), finalizedBy: uid || '' }
    : { finalized: false, unfinalizedAt: serverTimestamp() });
}

/** Mark the given innings final (or open them again). */
export async function setFieldingFinal(gameId, team, innings, final, uid) {
  for (const inning of innings) {
    const ref = doc(db, 'lineups', gameId, 'fielding', team, 'innings', String(inning));
    await updateDoc(ref, final
      ? { finalized: true, finalizedAt: serverTimestamp(), finalizedBy: uid || '' }
      : { finalized: false, unfinalizedAt: serverTimestamp() });
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(team) {
  const read = async (kind) => {
    const snap = await getDocs(query(collection(db, 'lineupTemplates', team, kind), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };
  const [batting, fielding] = await Promise.all([read('batting'), read('fielding')]);
  return { batting, fielding };
}

export function templateId(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `t-${Date.now()}`;
}

/** kind 'batting' stores { order }, 'fielding' stores { positions: {inning: {pos: id}} }. */
export async function saveTemplate(team, kind, name, payload, uid) {
  const id = templateId(name);
  await setDoc(doc(db, 'lineupTemplates', team, kind, id), {
    name: String(name).trim(),
    ...payload,
    createdAt: serverTimestamp(),
    createdBy: uid || ''
  });
  return id;
}

export async function deleteTemplate(team, kind, id) {
  await deleteDoc(doc(db, 'lineupTemplates', team, kind, id));
}

// ---------------------------------------------------------------------------
// Season batting average (aggregatedPlayerStats), as v1 showed it
// ---------------------------------------------------------------------------

export async function seasonAverage(player, seasonId) {
  const ids = [player.id, player.legacyId].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db, 'aggregatedPlayerStats', id));
      if (!snap.exists()) continue;
      const data = snap.data();
      if (data.migrated) continue;
      const key = Object.keys(data.seasons || {}).find((k) => k.startsWith(seasonId) && !k.endsWith('-sub'));
      if (!key) return null;
      const s = data.seasons[key];
      const avg = s.battingAverage ?? (s.atBats > 0 ? s.hits / s.atBats : null);
      return typeof avg === 'number' ? avg : null;
    } catch (err) {
      console.warn(`[lineups] no season stats for ${id}`, err);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Offline queue bridge
// ---------------------------------------------------------------------------

/**
 * offline-queue.js replays queued RSVP and LINEUP_UPDATE actions through
 * window.FirebaseRoster. Point it at these functions before loading it.
 */
export function installOfflineBridge() {
  window.FirebaseRoster = Object.assign(window.FirebaseRoster || {}, {
    updateRSVP: saveRsvp,
    saveBattingOrder,
    saveFieldingPositions,
    saveBenchPlayers
  });
}
