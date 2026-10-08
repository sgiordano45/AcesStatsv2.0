// js/pages/me-games.js
// me.html#games: your daily games record (Grid, Connections, Wordle, Higher
// or Lower, Who Am I, Player Recall) and badges. Replaced the Games tab of
// profile.html. Reads the per-game stats docs ({collection}/{uid}), one read
// each, as before.

import { db, doc, getDoc } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

// Day 1 of the daily games (matches games.html).
const LAUNCH = new Date(2026, 0, 6);

const GAMES = [
  { key: 'grid', name: 'Aces Grid', href: 'immaculate-grid.html', col: 'acesGridGames', icon: 'grid-3x3',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.perfectGames, 'Perfect'], [s.currentStreak, 'Streak']] },
  { key: 'connections', name: 'Connections', href: 'aces-connections.html', col: 'acesConnectionsGames', icon: 'link',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.perfectGames, 'Perfect'], [s.currentStreak, 'Streak']] },
  { key: 'wordle', name: 'Wordle', href: 'aces-wordle.html', col: 'acesWordleGames', icon: 'puzzle',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.gamesPlayed ? `${Math.round((s.wins || 0) / s.gamesPlayed * 100)}%` : '0%', 'Won'], [s.currentStreak, 'Streak']] },
  { key: 'higherLower', name: 'Higher or Lower', href: 'higher-lower.html', col: 'acesHigherLowerGames', icon: 'trending-up',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.perfectGames, 'Perfect'], [s.gamesPlayed ? ((s.totalCorrect || 0) / s.gamesPlayed).toFixed(1) : '0', 'Avg']] },
  { key: 'whoAmI', name: 'Who Am I?', href: 'who-am-i.html', col: 'acesWhoAmIGames', icon: 'search',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.wins, 'Won'], [s.gamesPlayed ? ((s.totalScore || 0) / s.gamesPlayed).toFixed(1) : '0', 'Avg']] },
  { key: 'recall', name: 'Player Recall', href: 'roster-recall.html', col: 'acesRosterRecallGames', icon: 'zap',
    tiles: (s) => [[s.gamesPlayed, 'Played'], [s.perfectGames, 'Perfect'], [s.bestScore, 'Best']] }
];

const total = (s) => GAMES.reduce((n, g) => n + (s[g.key].gamesPlayed || 0), 0);
// The same badges as profile.html. Hidden ones show as ??? until earned.
const BADGES = [
  ['First Timer', 'Play your first game', 'general', s => total(s) >= 1],
  ['Dedicated', 'Play 25 games', 'general', s => total(s) >= 25],
  ['Enthusiast', 'Play 50 games', 'general', s => total(s) >= 50],
  ['Game Master', 'Play 100 games', 'general', s => total(s) >= 100],
  ['Grid Rookie', 'Complete your first grid', 'grid', s => s.grid.gamesPlayed >= 1],
  ['Perfectionist', 'Get your first 9/9', 'grid', s => s.grid.perfectGames >= 1],
  ['Grid Expert', '5 perfect grids', 'grid', s => s.grid.perfectGames >= 5],
  ['Grid Legend', '10 perfect grids', 'grid', s => s.grid.perfectGames >= 10],
  ['Grid Streak', '7-day grid streak', 'grid', s => s.grid.longestStreak >= 7],
  ['Connected', 'Complete your first Connections', 'connections', s => s.connections.gamesPlayed >= 1],
  ['Pattern Spotter', 'First perfect Connections', 'connections', s => s.connections.perfectGames >= 1],
  ['Mind Reader', '5 perfect Connections', 'connections', s => s.connections.perfectGames >= 5],
  ['Connection Master', '10 perfect Connections', 'connections', s => s.connections.perfectGames >= 10],
  ['Link Streak', '7-day Connections streak', 'connections', s => s.connections.longestStreak >= 7],
  ['Word Rookie', 'Win your first Wordle', 'wordle', s => s.wordle.wins >= 1],
  ['Wordsmith', '10 Wordle wins', 'wordle', s => s.wordle.wins >= 10],
  ['Word Master', '25 Wordle wins', 'wordle', s => s.wordle.wins >= 25],
  ['Word Streak', '7-day Wordle streak', 'wordle', s => s.wordle.maxStreak >= 7],
  ['Stat Watcher', 'Complete your first Higher or Lower', 'higherLower', s => s.higherLower.gamesPlayed >= 1],
  ['Perfect Read', 'Get 5/5 correct', 'higherLower', s => s.higherLower.perfectGames >= 1],
  ['Numbers Whiz', '5 perfect games', 'higherLower', s => s.higherLower.perfectGames >= 5],
  ['Stat Savant', '10 perfect games', 'higherLower', s => s.higherLower.perfectGames >= 10],
  ['Stat Streak', '7-day streak', 'higherLower', s => s.higherLower.longestStreak >= 7],
  ['Detective', 'Win your first Who Am I', 'whoAmI', s => s.whoAmI.wins >= 1],
  ['Quick Solver', '5 Who Am I wins', 'whoAmI', s => s.whoAmI.wins >= 5],
  ['Identity Expert', '10 Who Am I wins', 'whoAmI', s => s.whoAmI.wins >= 10],
  ['Mystery Streak', '7-day streak', 'whoAmI', s => s.whoAmI.maxStreak >= 7],
  ['Memory Start', 'Complete your first recall', 'recall', s => s.recall.gamesPlayed >= 1],
  ['Total Recall', 'First perfect recall', 'recall', s => s.recall.perfectGames >= 1],
  ['Recall Pro', '5 perfect recalls', 'recall', s => s.recall.perfectGames >= 5],
  ['Memory Master', '10 perfect recalls', 'recall', s => s.recall.perfectGames >= 10],
  ['Daily Sweep', 'Play all 6 games in one day', 'hidden', s => s.playedToday === 6, true],
  ['Speed Demon', 'Perfect recall in under half the time', 'hidden', s => s.recall.hasSpeedDemon === true, true],
  ['Lucky Guess', 'Win Who Am I with 2 clues or fewer', 'hidden', s => s.whoAmI.hasLuckyGuess === true, true]
];
const BADGE_ICON = { general: 'star', grid: 'grid-3x3', connections: 'link', wordle: 'puzzle', higherLower: 'trending-up', whoAmI: 'search', recall: 'zap', hidden: 'sparkles' };

function dayNumber() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - LAUNCH) / 86400000) + 1);
}

/**
 * @param {HTMLElement} el
 * @param {{ uid: string }} o
 */
export async function mountGames(el, { uid }) {
  el.innerHTML = '<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span></section>';
  const docs = await Promise.all(GAMES.map(g => getDoc(doc(db, g.col, uid)).then(s => (s.exists() ? s.data() : {})).catch(() => ({}))));
  const stats = { playedToday: 0 };
  const today = dayNumber();
  let perfects = 0;
  let longest = 0;
  GAMES.forEach((g, i) => {
    const s = docs[i];
    stats[g.key] = s;
    if (s.lastPlayedPuzzle === today) stats.playedToday++;
    perfects += s.perfectGames || 0;
    longest = Math.max(longest, s.longestStreak || 0, s.maxStreak || 0);
  });
  const earned = BADGES.filter(b => b[3](stats)).length;
  const tile = (v, l) => `<div class="aces-stat"><span class="aces-stat-value">${esc(String(v ?? 0))}</span><span class="aces-stat-label">${esc(l)}</span></div>`;

  el.innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('gamepad')} Daily games</h2><a class="aces-section-link" href="games.html">Play today's games</a></div>
      <div class="aces-stats me-games-totals">
        ${tile(total(stats), 'Games played')}${tile(perfects, 'Perfect games')}${tile(longest, 'Longest streak')}${tile(`${stats.playedToday}/6`, 'Played today')}
      </div>
    </section>
    <ul class="me-gamegrid">${GAMES.map(g => `<li class="aces-card">
      <div class="aces-card-head"><h3 class="aces-card-title">${icon(g.icon)} ${esc(g.name)}</h3><a class="aces-section-link" href="${g.href}">Play</a></div>
      <div class="aces-stats">${g.tiles(stats[g.key]).map(([v, l]) => tile(v, l)).join('')}</div>
    </li>`).join('')}</ul>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('medal')} Badges <span class="fav-count">${earned}/${BADGES.length}</span></h2></div>
      <ul class="me-badgelist">${BADGES.map(([name, desc, cat, check, hidden]) => {
        const got = check(stats);
        const secret = hidden && !got;
        return `<li class="me-gbadge${got ? ' is-earned' : ''}${secret ? ' is-secret' : ''}" title="${esc(secret ? 'Secret badge: keep playing to find it' : desc)}">
          ${icon(secret ? 'help' : BADGE_ICON[cat])}<span>${esc(secret ? '???' : name)}</span>${got ? '' : secret ? '' : icon('lock')}</li>`;
      }).join('')}</ul>
    </section>`;
}
