// functions/summary.js
// Season summary for the v2.0 home page: standings, recent results, the next
// games, leaders and milestone watch in one doc at
// siteConfig/summaries/seasons/{seasonId} (siteConfig is public-read).
//
// The summary is built by js/domain/summary.js, the same file the browser
// uses. `npm run sync-domain` (run by firebase.json's predeploy) copies
// js/domain/*.js into functions/domain/, which is an ES-module folder loaded
// here with import().
//
// Functions (deploy only these: see the bottom of this file):
//   summaryOnGameWrite      a current-season game is added, removed, finished,
//                           rescored after finishing, or rescheduled
//   summaryRefresh          every 30 minutes: rebuild when player stats changed
//                           since the last build (picks up the aggregator)
//   rebuildSeasonSummary    callable, admin / league-staff: rebuild now

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const path = require('path');
const { pathToFileURL } = require('url');

const db = () => admin.firestore();
let domain = null;
const loadDomain = () => (domain ??= import(pathToFileURL(path.join(__dirname, 'domain', 'summary.js')).href));

const summaryDoc = (seasonId) => db().doc(`siteConfig/summaries/seasons/${seasonId}`);

async function currentSeasonId() {
  const cfg = await db().doc('siteConfig/current').get();
  const data = cfg.exists ? cfg.data() : null;
  if (data && data.currentSeasonId && data.phase !== 'offseason') return data.currentSeasonId;
  const active = await db().collection('seasons').where('isActive', '==', true).limit(1).get();
  return active.empty ? null : active.docs[0].id;
}

async function buildAndStore(seasonId, builtBy) {
  const [gamesSnap, playersSnap] = await Promise.all([
    db().collection('seasons').doc(seasonId).collection('games').get(),
    db().collection('aggregatedPlayerStats').get()
  ]);
  const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const players = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data(), playerId: d.id }))
    .filter(p => p.migrated !== true);
  const { buildSeasonSummary } = await loadDomain();
  // JSON round trip: Firestore rejects undefined, and NaN becomes null.
  const summary = JSON.parse(JSON.stringify(buildSeasonSummary({ seasonId, games, players })));
  await summaryDoc(seasonId).set({ ...summary, builtBy, storedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`[summary] ${seasonId} rebuilt (${builtBy}): ${games.length} games, ${players.length} players`);
  return summary;
}

// Fields whose change can move the summary. Live score updates during a game
// (no winner yet) don't: the summary only lists finished and upcoming games.
const SCHEDULE_FIELDS = ['date', 'time', 'homeTeamId', 'awayTeamId', 'homeTeamName', 'awayTeamName', 'field', 'location', 'gameType', 'game_type', 'round'];
const SCORE_FIELDS = ['homeScore', 'awayScore', 'home score', 'away score'];

function summaryChanged(before, after) {
  if (!before || !after) return true;                       // created or deleted
  const differs = (k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null);
  if (differs('winner')) return true;
  if (after.winner && SCORE_FIELDS.some(differs)) return true;
  return SCHEDULE_FIELDS.some(differs);
}

exports.summaryOnGameWrite = functions.firestore
  .document('seasons/{seasonId}/games/{gameId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!summaryChanged(before, after)) return null;
    const { seasonId } = context.params;
    if (seasonId !== await currentSeasonId()) return null;
    await buildAndStore(seasonId, 'game');
    return null;
  });

const toMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);

exports.summaryRefresh = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('America/New_York')
  .onRun(async () => {
    const seasonId = await currentSeasonId();
    if (!seasonId) return null;
    const [stored, latest] = await Promise.all([
      summaryDoc(seasonId).get(),
      db().collection('aggregatedPlayerStats').orderBy('lastUpdated', 'desc').limit(1).get()
    ]);
    const storedAt = stored.exists ? toMillis(stored.data().storedAt) : 0;
    const statsAt = latest.empty ? 0 : toMillis(latest.docs[0].data().lastUpdated);
    // Also rebuild once a day so "next games" and the day's date stay current.
    const stale = Date.now() - storedAt > 20 * 3600 * 1000;
    if (stored.exists && statsAt <= storedAt && !stale) return null;
    await buildAndStore(seasonId, 'schedule');
    return null;
  });

exports.rebuildSeasonSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const user = await db().collection('users').doc(context.auth.uid).get();
  const role = user.data()?.role || user.data()?.userRole || 'fan';
  if (!['admin', 'league-staff'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or league staff only.');
  }
  const seasonId = (data && data.seasonId) || await currentSeasonId();
  if (!seasonId) throw new functions.https.HttpsError('failed-precondition', 'No current season.');
  const summary = await buildAndStore(seasonId, 'manual');
  return { seasonId, builtAt: summary.builtAt, gamesPlayed: summary.counts.gamesPlayed };
});

// Deploy (from a folder whose firebase.json has the predeploy sync):
//   firebase deploy --only functions:summaryOnGameWrite,functions:summaryRefresh,functions:rebuildSeasonSummary
