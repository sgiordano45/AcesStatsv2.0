// js/data/team-games.js
// Games each team has played in a season, counted from the game docs
// (seasons/{seasonId}/games): every decided game, playoffs included, because
// player season stats include playoff games. Used by the Qualified rules
// (2.0 PA or IP per team game).
//
//   const games = await getTeamGames(['2026-fall', '2026-summer']);
//   games.get('2026-fall', 'Teal')   -> 4
//   await applyTeamGames(rows, { fallbackToPlayerGames: true })   // sets row.teamGames
//
// Each season's games load once per page; a season that fails to load is
// left out (get() returns 0) and logged.

import { getSeasonGames } from './games.js';
import { normalizeGames, isDecided } from '../domain/standings.js';

const cache = new Map();   // seasonId -> Promise<Map(teamLower -> games)>

function loadSeason(seasonId) {
  if (!cache.has(seasonId)) {
    cache.set(seasonId, getSeasonGames(seasonId).then((docs) => {
      const counts = new Map();
      for (const g of normalizeGames(docs)) {
        if (!isDecided(g)) continue;
        for (const t of [g.home, g.away]) {
          const k = String(t || '').toLowerCase();
          if (k) counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
      return counts;
    }).catch((err) => {
      console.warn('[team-games] could not load games for', seasonId, err);
      return new Map();
    }));
  }
  return cache.get(seasonId);
}

export async function getTeamGames(seasonIds) {
  const ids = [...new Set(seasonIds)].filter(Boolean);
  const maps = await Promise.all(ids.map(loadSeason));
  const bySeason = new Map(ids.map((id, i) => [id, maps[i]]));
  return {
    get(seasonId, team) {
      return bySeason.get(seasonId)?.get(String(team || '').toLowerCase()) || 0;
    }
  };
}

/**
 * Sets row.teamGames on stat rows ({ seasonId, team, games }). With
 * fallbackToPlayerGames, a team with no game docs uses the most games any of
 * its rows logged (batting: someone usually played every game).
 */
export async function applyTeamGames(rows, { fallbackToPlayerGames = false } = {}) {
  const games = await getTeamGames(rows.map(r => r.seasonId));
  const maxPlayer = new Map();
  if (fallbackToPlayerGames) {
    for (const r of rows) {
      const k = `${r.seasonId}|${String(r.team || '').toLowerCase()}`;
      maxPlayer.set(k, Math.max(maxPlayer.get(k) || 0, Number(r.games) || 0));
    }
  }
  for (const r of rows) {
    r.teamGames = games.get(r.seasonId, r.team) || maxPlayer.get(`${r.seasonId}|${String(r.team || '').toLowerCase()}`) || 0;
  }
  return rows;
}
