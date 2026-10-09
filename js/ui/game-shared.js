// js/ui/game-shared.js
// Pieces shared by the game pages: game-preview.html, game-recap.html and
// weekend-preview.html (and current-season-team / schedule links).
//
//   import { gameHref, teamDot, teamLogo, moneyLine, previewParagraphs,
//            loadAllSeasonGames, seriesRecord, createWatchList } from '../ui/game-shared.js';

import { getSeasons } from '../core/config.js';
import { db, doc, getDoc } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { escapeHtml as esc } from './format.js';
import { TEAM_COLORS } from './stat-columns.js';
import { normalizeGames, isDecided } from '../domain/standings.js';
import { seasonSortKey } from '../domain/season-ids.js';

export const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const teamKey = (team) => String(team || '').toLowerCase().trim();

/** Colored dot for a team (TEAM_COLORS), or a plain dot. */
export function teamDot(team, { lg = false } = {}) {
  const k = teamKey(team);
  return `<span class="aces-team-dot${lg ? ' is-lg' : ''}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`;
}

/** Logo image (removed on error by the page's [data-logo] handler). */
export function teamLogo(team, { size = 64 } = {}) {
  const k = teamKey(team).replace(/\s+/g, '_');
  return k ? `<img class="gm-logo" src="logos/${esc(k)}.png" alt="" width="${size}" height="${size}" loading="lazy" data-logo>` : '';
}

/** This season's team page for a team. */
export const teamHref = (team) => `current-season-team.html?${new URLSearchParams({ team: cap(team) })}`;

/** Recap for a game with a result, else its preview. g is a normalized game. */
export function gameHref(g, seasonId = '') {
  const done = isDecided(g) && g.hasScores;
  if (done && g.id) {
    const q = new URLSearchParams({ gameId: g.id });
    if (seasonId) q.set('seasonId', seasonId);
    return `game-recap.html?${q}`;
  }
  if (g.id) {
    const q = new URLSearchParams({ gameId: g.id });
    if (seasonId) q.set('seasonId', seasonId);
    return `game-preview.html?${q}`;
  }
  const q = new URLSearchParams({ home: g.home, away: g.away });
  if (g.dateKey) q.set('date', g.dateKey);
  return `game-preview.html?${q}`;
}

/**
 * Money line pair -> { home, away, favorite: 'home'|'away'|'', homePct, awayPct }
 * with implied win chances normalized to 100. null when neither side has a line.
 */
export function moneyLine(homeOdds, awayOdds) {
  const h = parseInt(homeOdds, 10), a = parseInt(awayOdds, 10);
  if (!Number.isFinite(h) && !Number.isFinite(a)) return null;
  if (!h && !a) return null;
  const implied = (o) => (!Number.isFinite(o) || !o ? 0.5 : o < 0 ? -o / (-o + 100) : 100 / (o + 100));
  const ph = implied(h), pa = implied(a);
  const total = ph + pa || 1;
  const homePct = Math.round((ph / total) * 100);
  return {
    home: Number.isFinite(h) ? h : null,
    away: Number.isFinite(a) ? a : null,
    favorite: homePct > 50 ? 'home' : homePct < 50 ? 'away' : '',
    homePct, awayPct: 100 - homePct
  };
}
export const fmtLine = (o) => (o === null || o === undefined ? '-' : o > 0 ? `+${o}` : String(o));

// Common mis-encodings of curly quotes and dashes in older text.
const MOJIBAKE = [
  [/\u00e2\u20ac\u2122|\u00e2\u20ac\u02dc/g, '\u2019'],   // right / left single quote
  [/\u00e2\u20ac\u0153|\u00e2\u20ac\u009d/g, '"'],        // left / right double quote
  [/\u00e2\u20ac\u201c/g, '\u2013'],                        // en dash
  [/\u00e2\u20ac\u201d/g, '\u2014'],                        // em dash
  [/\u00e2\u20ac\u00a6/g, '\u2026'],                        // ellipsis
  [/\u00c2(?=\s)/g, '']                                     // stray non-breaking-space lead byte
];

/** Preview or recap text -> escaped <p> paragraphs (blank lines split them). */
export function previewParagraphs(text) {
  let s = String(text || '');
  MOJIBAKE.forEach(([re, to]) => { s = s.replace(re, to); });
  return s.split(/\n\s*\n|\r\n\s*\r\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Every season's games, normalized, each with its seasonId and raw doc. Newest season first. */
export async function loadAllSeasonGames() {
  const seasons = await getSeasons().catch(() => []);
  const lists = await Promise.all(seasons.map(s => getSeasonGames(s.id)
    .then(docs => normalizeGames(docs).map((g, i) => ({ ...g, seasonId: s.id, raw: docs[i] })))
    .catch((err) => { console.warn(`[games] ${s.id} unavailable`, err); return []; })));
  return { seasons: [...seasons].sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id)), games: lists.flat() };
}

/** Decided games between two teams (any order), newest first. */
export function meetings(games, a, b) {
  const A = teamKey(a), B = teamKey(b);
  return games.filter(g => isDecided(g) && g.result
    && ((teamKey(g.home) === A && teamKey(g.away) === B) || (teamKey(g.home) === B && teamKey(g.away) === A)))
    .sort((x, y) => (y.dateKey || '').localeCompare(x.dateKey || ''));
}

/** Series record for team a against b over a list of meetings: { wins, losses, ties }. */
export function seriesRecord(list, a) {
  const A = teamKey(a);
  const out = { wins: 0, losses: 0, ties: 0 };
  for (const g of list) {
    if (g.result === 'tie') out.ties++;
    else if (teamKey(g.result === 'home' ? g.home : g.away) === A) out.wins++;
    else out.losses++;
  }
  return out;
}

export const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

// ---------------------------------------------------------------------------
// Players to watch (game-preview, weekend-preview)
// ---------------------------------------------------------------------------

const SPLITS_2025 = 'aggregatedPlayerStats2025Splits';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const baseId = (key) => String(key || '').split('-').slice(0, 2).join('-');

/**
 * Picks three players per team for a matchup:
 *   1. best OBP against this opponent (2+ games; 2025 splits doc plus 2026-on season splits)
 *   2. else this season's AcesBPI (at least 2 AB per team game played)
 *   3. else career AcesBPI (20+ AB)
 * ctx: { seasonId, players (aggregatedPlayerStats docs), bat (buildBattingRows rows for the
 * season), games (normalized season games) }. Rosters and splits docs are read once per page.
 *   const watch = createWatchList(ctx);
 *   const { why, players } = await watch('Teal', 'Army');
 *   players: [{ name, number, href, season, career: { bpi, atBats }, vs: { games, atBats, hits, walks, runs } }]
 */
export function createWatchList({ seasonId, players = [], bat = [], games = [] }) {
  const rosters = new Map(), splits = new Map();
  const roster = (team) => {
    const k = teamKey(team);
    if (!rosters.has(k)) {
      rosters.set(k, getDoc(doc(db, 'rosters', `${seasonId}-${k}`))
        .then(s => (s.exists() ? (s.data().players || []).filter(p => p && p.name) : []))
        .catch(() => []));
    }
    return rosters.get(k);
  };
  const splitsDoc = (id) => {
    if (!id) return Promise.resolve(null);
    if (!splits.has(id)) splits.set(id, getDoc(doc(db, SPLITS_2025, id)).then(s => (s.exists() ? s.data() : null)).catch(() => null));
    return splits.get(id);
  };
  const playerDoc = (rp) => players.find(p => [p.id, p.userId, p.playerId].some(id => id && (id === rp.authId || id === rp.id)))
    || players.find(p => norm(p.name) === norm(rp.name)) || null;

  async function vsOpponent(rp, pdoc, opponent) {
    const total = { games: 0, atBats: 0, hits: 0, walks: 0, runs: 0 };
    const add = (s) => { if (s) ['games', 'atBats', 'hits', 'walks', 'runs'].forEach(k => { total[k] += Number(s[k]) || 0; }); };
    const pick = (vs) => Object.entries(vs || {}).find(([k]) => teamKey(k) === teamKey(opponent))?.[1];
    const covered = new Set();
    const s25 = await splitsDoc(rp.id);
    Object.entries(s25?.seasons || {}).forEach(([key, s]) => { covered.add(baseId(key)); add(pick(s?.vsOpponent)); });
    Object.entries(pdoc?.seasons || {}).forEach(([key, s]) => { if (!covered.has(baseId(key))) add(pick(s?.vsOpponent)); });
    return total.games ? total : null;
  }

  return async function watch(team, opponent) {
    const list = await roster(team);
    const teamGames = games.filter(g => isDecided(g) && (teamKey(g.home) === teamKey(team) || teamKey(g.away) === teamKey(team))).length;
    const rows = await Promise.all(list.map(async (rp) => {
      const pdoc = playerDoc(rp);
      const season = bat.find(r => !r.sub && teamKey(r.team) === teamKey(team)
        && (r.ids.includes(rp.authId) || r.ids.includes(rp.id) || norm(r.name) === norm(rp.name))) || null;
      const career = pdoc?.career && typeof pdoc.career.acesBPI === 'number' ? { bpi: pdoc.career.acesBPI, atBats: Number(pdoc.career.atBats) || 0 } : null;
      const href = rp.authId ? `player.html?id=${encodeURIComponent(rp.authId)}`
        : pdoc ? `player.html?id=${encodeURIComponent(pdoc.id)}` : `player.html?name=${encodeURIComponent(rp.name)}`;
      return { name: rp.name, number: rp.number || '', href, season, career, vs: await vsOpponent(rp, pdoc, opponent) };
    }));
    const obp = (s) => (s.atBats + s.walks ? (s.hits + s.walks) / (s.atBats + s.walks) : 0);
    const vs = rows.filter(p => p.vs && p.vs.games >= 2).sort((a, b) => obp(b.vs) - obp(a.vs)).slice(0, 3);
    if (vs.length) return { why: `Best on-base against ${cap(opponent)}`, players: vs };
    const minAB = teamGames * 2;
    const season = rows.filter(p => p.season && typeof p.season.acesBPI === 'number' && p.season.atBats > 0 && p.season.atBats >= minAB)
      .sort((a, b) => b.season.acesBPI - a.season.acesBPI).slice(0, 3);
    if (season.length) return { why: 'Top AcesBPI this season', players: season };
    const career = rows.filter(p => p.career && p.career.atBats >= 20).sort((a, b) => b.career.bpi - a.career.bpi).slice(0, 3);
    return { why: career.length ? 'Top career AcesBPI' : '', players: career };
  };
}
