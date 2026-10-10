// js/pages/roster-core.js
// Shared state and edits for roster-management.html: players, RSVPs, the
// lineup for each game, and the autosave queue. Rendering lives in
// roster-management.js (header, games, RSVPs) and roster-lineup.js
// (batting order, defense).

import { showToast } from '../ui/toast.js';
import {
  saveRsvp, saveBattingOrder, saveFieldingPositions, saveBenchPlayers, loadLineup, INNINGS
} from '../data/lineups.js';

export { INNINGS };

export const SEASON_RULES = {
  fall: {
    name: 'Fall', minPlayers: 7, catcherMinPlayers: 9, battingOrderSize: 14,
    positions: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
  },
  summer: {
    name: 'Summer', minPlayers: 8, catcherMinPlayers: 10, battingOrderSize: 17,
    positions: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'RCF', 'RF']
  }
};

export const RSVP = {
  yes: { label: 'In', long: 'Yes', icon: 'check', cls: 'is-yes' },
  maybe: { label: 'Maybe', long: 'Maybe', icon: 'help', cls: 'is-maybe' },
  no: { label: 'Out', long: 'No', icon: 'close', cls: 'is-no' },
  none: { label: 'No reply', long: 'No reply', icon: 'minus', cls: 'is-none' }
};
export const RSVP_CYCLE = ['yes', 'no', 'maybe', 'none'];

export const S = {
  user: null,
  profile: null,
  season: null,
  rules: SEASON_RULES.fall,
  teamChoices: [],
  team: '',
  canManage: false,
  staffOnly: false,
  players: [],
  byId: new Map(),
  me: null,
  games: [],
  past: [],
  gameId: '',
  rsvps: {},        // gameId -> { playerId: { status, updatedAt } }
  lineups: {},      // gameId -> lineup (see emptyLineup)
  tab: 'rsvp',
  inning: 1,
  includeMaybe: false,
  templates: null,
  render: () => {}
};

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const lastName = (name) => String(name || '').trim().split(/\s+/).pop() || name;

/** A stored ID (authId or legacy) as the roster player's current ID. */
export function resolveId(raw) {
  if (!raw) return null;
  const id = typeof raw === 'object' ? raw.id : raw;
  if (!id) return null;
  if (S.byId.has(id)) return id;
  const p = S.players.find((x) => x.legacyId === id || x.authId === id);
  return p ? p.id : id;
}

/** Roster player for an ID, or a stand-in for someone no longer on the roster. */
export function playerOf(id, lineup = currentLineup()) {
  if (!id) return null;
  return S.byId.get(id) || { id, name: lineup?.names?.[id] || 'Not on roster', jersey: '', unknown: true };
}

export function avgText(p) {
  if (!p || typeof p.avg !== 'number') return '';
  return p.avg.toFixed(3).replace(/^0/, '');
}

// ---------------------------------------------------------------------------
// RSVPs
// ---------------------------------------------------------------------------

export function rsvpEntry(p, gameId = S.gameId) {
  const map = S.rsvps[gameId] || {};
  return map[p.id] || (p.legacyId && map[p.legacyId]) || (p.authId && map[p.authId]) || null;
}

export const rsvpStatus = (p, gameId = S.gameId) => rsvpEntry(p, gameId)?.status || 'none';

export function rsvpCounts(gameId = S.gameId) {
  const c = { yes: 0, maybe: 0, no: 0, none: 0 };
  S.players.forEach((p) => { c[RSVP[rsvpStatus(p, gameId)] ? rsvpStatus(p, gameId) : 'none'] += 1; });
  return c;
}

export function lastRsvpUpdate(gameId = S.gameId) {
  let latest = null;
  Object.values(S.rsvps[gameId] || {}).forEach((r) => {
    const t = r.updatedAt?.toDate ? r.updatedAt.toDate() : r.updatedAt ? new Date(r.updatedAt) : null;
    if (t && !Number.isNaN(t.getTime()) && (!latest || t > latest)) latest = t;
  });
  return latest;
}

export function canEditRsvp(p) {
  if (S.canManage) return true;
  if (p.authId && S.user && p.authId === S.user.uid) return true;
  return !!(S.profile?.linkedPlayer && S.profile.linkedPlayer === p.name);
}

/** Players free to play this game: Yes RSVPs, plus Maybes when that box is ticked. */
export function availablePlayers(gameId = S.gameId) {
  return S.players.filter((p) => {
    const s = rsvpStatus(p, gameId);
    return s === 'yes' || (S.includeMaybe && s === 'maybe');
  });
}

export async function setRsvp(playerId, gameId, status) {
  const p = S.byId.get(playerId);
  if (!p || !canEditRsvp(p) || !RSVP[status]) return;
  const map = (S.rsvps[gameId] ||= {});
  const before = map[p.id];
  map[p.id] = { ...(before || {}), status, updatedAt: new Date() };
  S.render();

  try {
    if (!navigator.onLine && window.offlineQueue) {
      await window.offlineQueue.addToQueue('RSVP', {
        gameId, playerId: p.id, status, playerName: p.name, teamId: S.team
      });
      return;
    }
    await saveRsvp(gameId, p.id, status, p.name, S.team);
  } catch (err) {
    console.error('[roster] RSVP save failed', err);
    if (before) map[p.id] = before; else delete map[p.id];
    S.render();
    showToast(`Couldn't save ${p.name}'s RSVP. Try again.`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

export function emptyLineup() {
  return {
    loaded: false,
    exists: false,
    batting: Array(S.rules.battingOrderSize).fill(null),
    fielding: {},
    bench: {},
    batFinal: false,
    fieldFinal: false,
    fieldDocs: new Set(),
    names: {}
  };
}

export const currentLineup = () => (S.gameId ? S.lineups[S.gameId] : null);
export const currentGame = () => S.games.find((g) => g.id === S.gameId) || null;

/** Read a game's lineup into S.lineups (once per game). */
export async function ensureLineup(gameId) {
  if (!gameId) return null;
  if (S.lineups[gameId]?.loaded) return S.lineups[gameId];
  const L = emptyLineup();
  try {
    const raw = await loadLineup(gameId, S.team);
    L.exists = raw.exists;
    raw.order.forEach((v, i) => {
      if (i < L.batting.length) L.batting[i] = resolveId(v);
      else if (v) L.batting.push(resolveId(v));
    });
    Object.entries(raw.fielding).forEach(([inning, positions]) => {
      const row = {};
      Object.entries(positions || {}).forEach(([pos, val]) => {
        const id = resolveId(val);
        if (!id) return;
        row[pos] = id;
        if (val && typeof val === 'object' && val.name) L.names[id] = val.name;
      });
      L.fielding[inning] = row;
    });
    Object.entries(raw.bench).forEach(([inning, ids]) => {
      L.bench[inning] = [...new Set((ids || []).map(resolveId).filter(Boolean))];
    });
    L.batFinal = raw.batFinal;
    L.fieldFinal = raw.fieldFinal;
    L.fieldDocs = raw.fieldDocs;
  } catch (err) {
    // Don't let an unread lineup look empty: saving it would wipe the real one.
    console.warn(`[roster] couldn't read the lineup for ${gameId}`, err);
    L.failed = true;
  }
  L.loaded = true;
  S.lineups[gameId] = L;
  return L;
}

// Where a player is in an inning: a position, 'bench' or null.
export function spotOf(L, inning, pid) {
  const row = L.fielding[inning] || {};
  const pos = Object.keys(row).find((k) => row[k] === pid);
  if (pos) return pos;
  return (L.bench[inning] || []).includes(pid) ? 'bench' : null;
}

export const benchSize = () => Math.max(0, S.rules.battingOrderSize - S.rules.positions.length);

export function catcherLocked(gameId = S.gameId) {
  return rsvpCounts(gameId).yes < S.rules.catcherMinPlayers;
}

// -- batting edits ----------------------------------------------------------

export function batPlace(pid, idx) {
  const L = currentLineup();
  if (!L || idx < 0) return;
  while (L.batting.length <= idx) L.batting.push(null);
  const from = L.batting.indexOf(pid);
  if (from === idx) return;
  if (from !== -1) L.batting[from] = L.batting[idx];
  L.batting[idx] = pid;
  dirty('bat');
}

export function batAppend(pid) {
  const L = currentLineup();
  if (!L || L.batting.includes(pid)) return false;
  let idx = L.batting.indexOf(null);
  if (idx === -1) {
    if (L.batting.length >= S.rules.battingOrderSize) return false;
    idx = L.batting.length;
  }
  batPlace(pid, idx);
  return true;
}

export function batRemove(idx) {
  const L = currentLineup();
  if (!L || !L.batting[idx]) return;
  L.batting[idx] = null;
  dirty('bat');
}

export function batMove(idx, step) {
  const L = currentLineup();
  const to = idx + step;
  if (!L || to < 0 || to >= L.batting.length) return;
  [L.batting[idx], L.batting[to]] = [L.batting[to], L.batting[idx]];
  dirty('bat');
}

/** Close the gaps so the order runs 1, 2, 3 with no empty spots between. */
export function batCompact() {
  const L = currentLineup();
  if (!L) return;
  const ids = L.batting.filter(Boolean);
  L.batting = [...ids, ...Array(Math.max(0, S.rules.battingOrderSize - ids.length)).fill(null)];
  dirty('bat');
}

export function batSet(ids) {
  const L = currentLineup();
  if (!L) return;
  const list = ids.slice(0, Math.max(S.rules.battingOrderSize, ids.length));
  L.batting = [...list, ...Array(Math.max(0, S.rules.battingOrderSize - list.length)).fill(null)];
  dirty('bat');
}

// -- defense edits ----------------------------------------------------------

function pull(L, inning, pid) {
  const row = L.fielding[inning] || {};
  Object.keys(row).forEach((pos) => {
    if (row[pos] === pid) { delete row[pos]; dirty('pos', inning); }
  });
  const bench = L.bench[inning] || [];
  if (bench.includes(pid)) {
    L.bench[inning] = bench.filter((x) => x !== pid);
    dirty('bench', inning);
  }
}

export function posAssign(inning, pos, pid) {
  const L = currentLineup();
  if (!L) return;
  pull(L, inning, pid);
  (L.fielding[inning] ||= {})[pos] = pid;
  dirty('pos', inning);
}

export function posClear(inning, pos) {
  const L = currentLineup();
  if (!L?.fielding[inning]?.[pos]) return;
  delete L.fielding[inning][pos];
  dirty('pos', inning);
}

/** Returns false when the bench is full. */
export function benchAdd(inning, pid) {
  const L = currentLineup();
  if (!L) return false;
  const bench = L.bench[inning] || [];
  if (bench.includes(pid)) return true;
  if (bench.length >= benchSize()) return false;
  pull(L, inning, pid);
  L.bench[inning] = [...(L.bench[inning] || []), pid];
  dirty('bench', inning);
  return true;
}

export function benchRemove(inning, pid) {
  const L = currentLineup();
  if (!L) return;
  L.bench[inning] = (L.bench[inning] || []).filter((x) => x !== pid);
  dirty('bench', inning);
}

export function copyInning(from, to) {
  const L = currentLineup();
  if (!L) return;
  L.fielding[to] = { ...(L.fielding[from] || {}) };
  L.bench[to] = [...(L.bench[from] || [])];
  dirty('pos', to);
  dirty('bench', to);
}

export function clearDefense() {
  const L = currentLineup();
  if (!L) return;
  INNINGS.forEach((n) => {
    L.fielding[n] = {};
    L.bench[n] = [];
    dirty('pos', n);
    dirty('bench', n);
  });
}

// ---------------------------------------------------------------------------
// Autosave: edits are written about half a second after the last change
// ---------------------------------------------------------------------------

const pending = new Map();
let timer = null;
let saving = null;
let saveState = 'idle';

function setSaveState(state) {
  saveState = state;
  const el = document.getElementById('rmSave');
  if (!el) return;
  const text = {
    idle: '',
    pending: 'Saving\u2026',
    saving: 'Saving\u2026',
    saved: 'All changes saved',
    queued: 'Offline: changes will save when you reconnect',
    error: 'Some changes did not save'
  }[state] || '';
  el.textContent = text;
  el.dataset.state = state;
}

export function dirty(kind, inning = 0) {
  if (!S.gameId) return;
  pending.set(`${S.gameId}|${kind}|${inning}`, { gameId: S.gameId, team: S.team, kind, inning: Number(inning) });
  setSaveState('pending');
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}

function slimPositions(L, inning) {
  const out = {};
  Object.entries(L.fielding[inning] || {}).forEach(([pos, id]) => {
    if (!id) return;
    const p = playerOf(id, L);
    out[pos] = { id, name: p.name, jersey: p.jersey || '' };
  });
  return out;
}

function trimmedOrder(L) {
  const order = L.batting.slice();
  while (order.length && !order[order.length - 1]) order.pop();
  return order;
}

async function writeOne(job, uid) {
  const L = S.lineups[job.gameId];
  if (!L) return;
  if (!navigator.onLine && window.offlineQueue) {
    const data = { gameId: job.gameId, teamId: job.team, userId: uid, type: '', inning: job.inning || null };
    if (job.kind === 'bat') Object.assign(data, { type: 'batting', playerIds: trimmedOrder(L) });
    else if (job.kind === 'pos') Object.assign(data, { type: 'fielding', positions: slimPositions(L, job.inning) });
    else Object.assign(data, { type: 'bench', playerIds: L.bench[job.inning] || [] });
    await window.offlineQueue.addToQueue('LINEUP_UPDATE', data);
    return 'queued';
  }
  if (job.kind === 'bat') {
    await saveBattingOrder(job.gameId, job.team, trimmedOrder(L), uid);
    L.exists = true;
  } else if (job.kind === 'pos') {
    await saveFieldingPositions(job.gameId, job.team, job.inning, slimPositions(L, job.inning), uid);
    L.fieldDocs.add(job.inning);
  } else {
    await saveBenchPlayers(job.gameId, job.team, job.inning, L.bench[job.inning] || [], uid);
  }
  return 'saved';
}

/** Write everything waiting. Resolves when done (also used before finalizing). */
export async function flush() {
  clearTimeout(timer);
  if (saving) await saving;
  if (!pending.size) return true;
  const jobs = [...pending.values()];
  pending.clear();
  setSaveState('saving');
  const uid = S.user?.uid || '';
  saving = (async () => {
    let ok = true;
    let queued = false;
    for (const job of jobs) {
      try {
        if ((await writeOne(job, uid)) === 'queued') queued = true;
      } catch (err) {
        ok = false;
        console.error('[roster] save failed', job, err);
      }
    }
    setSaveState(!ok ? 'error' : queued ? 'queued' : 'saved');
    if (!ok) showToast("Some lineup changes didn't save. Check your connection and try again.", 'error');
    return ok;
  })();
  const ok = await saving;
  saving = null;
  return ok;
}

export const hasPending = () => pending.size > 0 || !!saving;

window.addEventListener('pagehide', () => { if (pending.size) flush(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && pending.size) flush();
});
window.addEventListener('beforeunload', (e) => {
  if (pending.size || saving) { e.preventDefault(); e.returnValue = ''; }
});

export { setSaveState };
