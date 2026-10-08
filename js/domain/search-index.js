// js/domain/search-index.js
// Global search: the index of players, teams and seasons, and the matching.
// Pure: no Firebase, no DOM. The index is built by the summary Cloud Function
// (functions/summary.js) into siteConfig/searchIndex, or in the browser when
// that doc is missing (js/data/search-index.js); pages come from nav-config.
//
//   const index = buildSearchIndex({ players, seasonIds });
//   const groups = searchAll(index, pages, 'jo cle');   // [{ kind, items }]

import { parseStatSeasonId, seasonSortKey, seasonLabel } from './season-ids.js';

export const SEARCH_INDEX_VERSION = 1;

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');

/**
 * @param {object} o
 * @param {object[]} o.players    aggregatedPlayerStats docs ({ id, name, currentTeam, seasons })
 * @param {string[]} [o.seasonIds] season doc IDs ('2026-fall', ...)
 */
export function buildSearchIndex({ players = [], seasonIds = [] } = {}) {
  const teams = new Map();   // name -> { name, last, seasons:Set }
  const list = [];
  for (const p of players) {
    if (p.migrated) continue;
    const name = p.name || p.displayName || p.playerName || p.userId || '';
    if (!name) continue;
    let last = '';
    let lastTeam = '';
    let lastSub = true;
    const seen = new Set();
    for (const [rawId, s] of Object.entries(p.seasons || {})) {
      const sid = parseStatSeasonId(rawId);
      if (!sid.id) continue;
      seen.add(sid.id);
      const team = cap(s.team || '');
      if (team) {
        const t = teams.get(team) || { name: team, last: '', seasons: new Set() };
        t.seasons.add(sid.id);
        if (!t.last || seasonSortKey(sid.id) > seasonSortKey(t.last)) t.last = sid.id;
        teams.set(team, t);
      }
      // The player's team: from their newest season, preferring a regular
      // record over a sub one within that season.
      const sub = sid.isSub || /^yes$/i.test(String(s.sub || ''));
      const newer = !last || seasonSortKey(sid.id) > seasonSortKey(last);
      if (newer || (sid.id === last && lastSub && !sub)) {
        last = sid.id;
        lastTeam = team || lastTeam;
        lastSub = sub;
      }
    }
    list.push({ id: p.id || p.userId || '', name, team: lastTeam || cap(p.currentTeam), last, n: seen.size });
  }
  const seasons = [...new Set(seasonIds.map(id => parseStatSeasonId(id).id).filter(Boolean))]
    .sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  return {
    version: SEARCH_INDEX_VERSION,
    builtAt: new Date().toISOString(),
    players: list.sort((a, b) => seasonSortKey(b.last) - seasonSortKey(a.last) || a.name.localeCompare(b.name)),
    teams: [...teams.values()]
      .map(t => ({ name: t.name, last: t.last, n: t.seasons.size }))
      .sort((a, b) => seasonSortKey(b.last) - seasonSortKey(a.last) || a.name.localeCompare(b.name)),
    seasons
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Lower case, accents and punctuation removed: "O'Grady" -> "ogrady", "José" -> "jose". */
export function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Score one label against the query tokens; 0 = no match. Every token must
 * match the start of some word ("jo cle" finds "Joe Clemente"); a match at
 * the start of the whole label and whole-word matches score higher.
 */
export function scoreText(label, tokens, extra = '') {
  const text = normalize(label);
  if (!tokens.length || !text) return 0;
  const words = (text + (extra ? ` ${normalize(extra)}` : '')).split(' ');
  let score = 0;
  for (const t of tokens) {
    const i = words.findIndex(w => w.startsWith(t));
    if (i < 0) {
      if (t.length >= 3 && text.replace(/ /g, '').includes(t)) { score += 1; continue; }
      return 0;
    }
    score += words[i] === t ? 4 : 3;
    if (i === 0) score += 2;
  }
  if (text.startsWith(tokens.join(' '))) score += 5;
  return score;
}

// "2025 fall", "fall 2025", "f25", "25 fall" all find 2025-fall.
function seasonText(id) {
  const { year, name } = parseStatSeasonId(id);
  return `${seasonLabel(id)} ${name} ${year} ${year.slice(2)} ${name.charAt(0)}${year.slice(2)}`;
}

const LIMITS = { player: 6, team: 4, season: 4, page: 5 };

/**
 * @param {object} index  buildSearchIndex() output
 * @param {object[]} pages [{ id, label, href, icon, hub }] from the nav
 * @param {string} query
 * @returns {{ kind: 'player'|'team'|'season'|'page', items: object[] }[]}
 */
export function searchAll(index, pages, query) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const rank = (items, label, extra = () => '', boost = () => 0, limit = 5) => items
    .map(x => ({ x, s: scoreText(label(x), tokens, extra(x)) }))
    .filter(r => r.s > 0)
    .map(r => ({ ...r, s: r.s + boost(r.x) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(r => r.x);

  const newest = index?.seasons?.[0] || '';
  const recent = (sid) => (sid && newest ? Math.max(0, 3 - (seasonSortKey(newest) - seasonSortKey(sid)) / 10) : 0);

  const groups = [
    { kind: 'player', items: rank(index?.players || [], p => p.name, () => '', p => recent(p.last), LIMITS.player) },
    { kind: 'team', items: rank(index?.teams || [], t => t.name, () => '', t => recent(t.last), LIMITS.team) },
    { kind: 'season', items: rank((index?.seasons || []).map(id => ({ id })), s => seasonLabel(s.id), s => seasonText(s.id), () => 0, LIMITS.season) },
    { kind: 'page', items: rank(pages || [], p => p.label, p => `${p.hub || ''} ${p.keywords || ''}`, () => 0, LIMITS.page) }
  ];
  return groups.filter(g => g.items.length);
}
