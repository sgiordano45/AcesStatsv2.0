// js/admin/schedule-shared.js
// Helpers for the schedule editor and rework tools in /admin/.
//
// A game doc (seasons/{seasonId}/games/{gameId}) carries its kickoff three
// ways and its teams three ways, and the site reads all of them:
//   date: Timestamp at the local kickoff time    time: '8:45 PM'
//   homeTeam / homeTeamId / homeTeamName: 'Army' (same for away)
// gameFields() writes every one so they never drift apart. The doc ID
// (M_D_YYYY_home_vs_away) is never changed: stats are filed under it.

import { db, collection, getDocs, Timestamp, serverTimestamp } from '../core/firebase.js';
import { normalizeGame } from '../domain/standings.js';
import { toDateKey, parseTimeMinutes } from '../domain/dates.js';

export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');
export const dateOfKey = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };

/** '8:45 PM' -> '20:45' for <input type="time">. */
export function to24(t) {
  const m = parseTimeMinutes(t);
  return m === null ? '' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
/** '20:45' -> '8:45 PM'. */
export function from24(v) {
  if (!v) return '';
  const [h, min] = v.split(':').map(Number);
  return `${h % 12 || 12}:${pad(min)} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const minutes = (t) => { const m = parseTimeMinutes(t); return m === null ? 9999 : m; };

export function niceDate(key, style = 'short') {
  if (!key) return 'TBD';
  const d = dateOfKey(key);
  return style === 'long'
    ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

/** The season's games with their kickoff and teams read the same way everywhere. */
export async function loadGames(seasonId) {
  const snap = await getDocs(collection(db, 'seasons', seasonId, 'games'));
  return snap.docs.map(d => {
    const raw = { id: d.id, ...d.data() };
    const g = normalizeGame(raw);
    const dateKey = toDateKey(raw.date);
    let time = raw.time || '';
    if (!time && raw.date?.seconds) {
      const dt = new Date(raw.date.seconds * 1000);
      if (dt.getHours() || dt.getMinutes()) time = from24(`${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
    }
    return {
      id: d.id, raw, home: g.home, away: g.away, dateKey, time,
      location: raw.location || '', status: raw.status || 'scheduled',
      played: !!(g.winner || g.unmatchedWinner || g.hasScores || raw.status === 'completed'),
      hasStats: raw.statsSubmitted === true || raw.statsSubmittedHome === true || raw.statsSubmittedAway === true,
      type: g.type, round: raw.round || ''
    };
  }).sort((a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || minutes(a.time) - minutes(b.time));
}

export const teamsOf = (games) => [...new Set(games.flatMap(g => [g.home, g.away]).filter(t => t && !/^(tbd|bye)$/i.test(t)))].sort();
export const locationsOf = (games) => [...new Set(games.map(g => g.location).filter(Boolean))].sort();

/** Fields to write for a game's new date, time, teams, place and status. */
export function gameFields({ dateKey, time, home, away, location, status }, who) {
  const m = minutes(time);
  const d = dateOfKey(dateKey);
  if (m !== 9999) d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  const out = {
    date: Timestamp.fromDate(d), time: time || '',
    lastUpdate: serverTimestamp(), lastUpdatedBy: who || 'League staff'
  };
  if (home) Object.assign(out, { homeTeam: home, homeTeamId: home, homeTeamName: home });
  if (away) Object.assign(out, { awayTeam: away, awayTeamId: away, awayTeamName: away });
  if (location !== undefined) out.location = location;
  if (status) out.status = status;
  return out;
}

/**
 * Clashes for a game at its (new) date and time against everyone else's.
 * games: [{ id, home, away, dateKey, time, status }] already showing any moves.
 */
export function clashes(game, games) {
  const out = [];
  if (!game.dateKey || game.status === 'cancelled') return out;
  for (const o of games) {
    if (o.id === game.id || o.dateKey !== game.dateKey || o.status === 'cancelled' || o.status === 'postponed') continue;
    const gap = Math.abs(minutes(game.time) - minutes(o.time));
    for (const t of [game.home, game.away]) {
      if (t !== o.home && t !== o.away) continue;
      if (gap === 0) out.push(`${t} also plays ${o.away} at ${o.home} at the same time`);
      else if (gap < 60) out.push(`${t} has only ${gap} min around ${o.away} at ${o.home}`);
    }
    if (game.location && o.location === game.location && gap === 0) out.push(`${o.away} at ${o.home} is on ${game.location} at the same time`);
  }
  return [...new Set(out)];
}

/** Plain-text update for the league chat. lines: [{ away, home, from, to, reason, status }] */
export function updateMessage(lines) {
  const body = lines.map(l => {
    const head = `*${l.away} at ${l.home}*`;
    if (l.status === 'postponed') return `${head}\nPostponed${l.reason ? ` (${l.reason})` : ''}. New date to come.`;
    if (l.status === 'cancelled') return `${head}\nCancelled${l.reason ? ` (${l.reason})` : ''}.`;
    return `${head}\n${l.to}${l.from && l.from !== l.to ? ` (was ${l.from})` : ''}${l.reason ? `\n${l.reason}` : ''}`;
  }).join('\n\n');
  return `*Schedule update*\n\n${body}\n\n- Mountainside Aces`;
}

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
