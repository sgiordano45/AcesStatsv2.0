// js/admin/rosters-data.js
// Shared state for admin/rosters.html: the season's roster docs, the user
// profiles, a player directory for adding people, and saving.
//
// Roster docs: rosters/{seasonId}-{team lowercase}
//   { seasonId, teamName, players: [{ id, authId, name, number, position, bats, throws, captain, cardName }], createdAt, updatedAt }
//   id is the legacy snake_case player ID that stats are stored under; authId is the
//   Firebase UID of the linked account ('' when there isn't one).

import { db, collection, getDocs, doc, setDoc, updateDoc } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { normalizeGame } from '../domain/standings.js';

export const S = {
  seasonId: '',
  teams: new Map(),     // key (lowercase) -> { key, teamName, docId, exists, players, base }
  allRosters: [],       // every roster doc, all seasons: { id, data }
  users: null,          // [{ uid, ...data }]
  keepProfiles: true
};

export const teamKey = (name) => String(name || '').trim().toLowerCase();
export const toLegacyId = (name) => String(name || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');
export const isAuthUid = (s) => !!s && s.length > 20 && !s.includes('_');
const blank = (v) => v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-';
export const clean = (v) => (blank(v) ? null : String(v).trim());

/** One roster entry with every field present. */
export function shapePlayer(p = {}) {
  return {
    id: p.id || p.playerId || '',
    authId: p.authId || p.uid || '',
    name: String(p.name || '').trim(),
    number: blank(p.number) ? null : String(p.number).trim(),
    position: p.position || '-',
    bats: p.bats || '-',
    throws: p.throws || '-',
    captain: p.captain === true || p.captain === 'Yes',
    cardName: p.cardName ?? null
  };
}

const snapshotOf = (players) => JSON.stringify(players);

export async function loadUsers(force = false) {
  if (S.users && !force) return S.users;
  const snap = await getDocs(collection(db, 'users'));
  S.users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return S.users;
}

/** Loads every roster doc, then the season's teams (roster docs plus any team on the schedule). */
export async function loadSeason(seasonId) {
  S.seasonId = seasonId;
  const [snap, games] = await Promise.all([
    getDocs(collection(db, 'rosters')),
    getSeasonGames(seasonId).catch(() => [])
  ]);
  S.allRosters = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  S.teams = new Map();
  for (const r of S.allRosters) {
    if (!r.id.startsWith(`${seasonId}-`)) continue;
    const teamName = r.data.teamName || r.id.slice(seasonId.length + 1);
    const players = (r.data.players || []).map(shapePlayer);
    S.teams.set(teamKey(teamName), { key: teamKey(teamName), teamName, docId: r.id, exists: true, players, base: snapshotOf(players) });
  }
  for (const g of games.map(normalizeGame)) {
    for (const name of [g.home, g.away]) {
      if (!name || /^(tbd|bye)$/i.test(name) || S.teams.has(teamKey(name))) continue;
      S.teams.set(teamKey(name), { key: teamKey(name), teamName: name, docId: `${seasonId}-${teamKey(name)}`, exists: false, players: [], base: '[]' });
    }
  }
  return S.teams;
}

export const teamList = () => [...S.teams.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
export const isDirty = (t) => snapshotOf(t.players) !== t.base;
export const dirtyTeams = () => teamList().filter(isDirty);

/** Where a player is this season: { team, index } or null. Matches on id, then authId, then name. */
export function findInSeason({ id, authId, name }) {
  const n = String(name || '').trim().toLowerCase();
  for (const t of S.teams.values()) {
    const i = t.players.findIndex(p => (id && p.id === id) || (authId && p.authId === authId) || (!id && !authId && n && p.name.toLowerCase() === n));
    if (i >= 0) return { team: t, index: i };
  }
  return null;
}

/**
 * Everyone the league knows: players from any season's roster, plus linked accounts.
 * [{ name, id, authId, number, position, bats, throws }]
 */
export function directory() {
  const by = new Map();
  const put = (p) => {
    if (!p.name) return;
    const k = p.id || toLegacyId(p.name);
    const prev = by.get(k) || {};
    by.set(k, { ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== '-')), id: k });
  };
  [...S.allRosters].sort((a, b) => a.id.localeCompare(b.id)).forEach(r => (r.data.players || []).forEach(p => put(shapePlayer(p))));
  (S.users || []).forEach(u => {
    if (u.migrated === true || !u.linkedPlayer) return;
    put({ name: u.linkedPlayer, id: u.mergedFromProfile || toLegacyId(u.linkedPlayer), authId: u.uid });
  });
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A player entry for someone being added by name: known player if found, else a new ID. */
export function resolvePlayer(name) {
  const n = String(name || '').trim().toLowerCase();
  const known = directory().find(p => p.name.toLowerCase() === n);
  if (known) return shapePlayer(known);
  const user = (S.users || []).find(u => u.migrated !== true && String(u.linkedPlayer || '').toLowerCase() === n);
  return shapePlayer({ name: String(name).trim(), id: user?.mergedFromProfile || toLegacyId(name), authId: user?.uid || '' });
}

/** Removes a player from wherever they are this season and adds them to a team. */
export function placePlayer(player, team) {
  const at = findInSeason(player);
  let entry = shapePlayer(player);
  if (at) {
    entry = { ...at.team.players[at.index], ...Object.fromEntries(Object.entries(shapePlayer(player)).filter(([, v]) => v !== '' && v !== null && v !== '-' && v !== false)) };
    if (at.team === team) { at.team.players[at.index] = entry; return { moved: false, from: team }; }
    at.team.players.splice(at.index, 1);
  }
  team.players.push(entry);
  return { moved: !!at, from: at?.team || null };
}

/**
 * Writes every changed team doc. With keepProfiles, players who are on a
 * different team than before get their profile team updated:
 * users/{authId}.linkedTeam, or currentTeam on a matching legacy profile.
 */
export async function saveChanges({ who = '' } = {}) {
  const changed = dirtyTeams();
  if (!changed.length) return { teams: 0, profiles: 0 };
  // Who was on which team before this save
  const before = new Map();
  changed.forEach(t => JSON.parse(t.base).forEach(p => before.set(p.id || p.name, t.teamName)));
  const now = new Date().toISOString();
  await Promise.all(changed.map(t => setDoc(doc(db, 'rosters', t.docId), {
    seasonId: S.seasonId, teamName: t.teamName, players: t.players,
    updatedAt: now, ...(t.exists ? {} : { createdAt: now }), ...(who ? { updatedBy: who } : {})
  }, { merge: true })));

  let profiles = 0;
  if (S.keepProfiles) {
    const users = await loadUsers();
    const writes = [];
    for (const t of changed) {
      for (const p of t.players) {
        const prevTeam = before.get(p.id || p.name);
        if (prevTeam === t.teamName) continue;
        const u = p.authId ? users.find(x => x.uid === p.authId) : null;
        if (u && u.linkedTeam !== t.teamName) {
          writes.push(updateDoc(doc(db, 'users', u.uid), { linkedTeam: t.teamName, updatedAt: now }).then(() => { u.linkedTeam = t.teamName; profiles++; }));
          continue;
        }
        const legacy = !p.authId && users.find(x => x.migrated === true && String(x.linkedPlayer || x.displayName || '').toLowerCase() === p.name.toLowerCase());
        if (legacy && legacy.currentTeam !== t.teamName) {
          writes.push(updateDoc(doc(db, 'users', legacy.uid), { currentTeam: t.teamName, updatedAt: now }).then(() => { legacy.currentTeam = t.teamName; profiles++; }));
        }
      }
    }
    const results = await Promise.allSettled(writes);
    results.filter(r => r.status === 'rejected').forEach(r => console.warn('[rosters] profile update failed', r.reason));
  }

  changed.forEach(t => { t.base = snapshotOf(t.players); t.exists = true; });
  return { teams: changed.length, profiles };
}

/** Puts a team back the way it was when loaded or last saved. */
export function revert(t) { t.players = JSON.parse(t.base); }
