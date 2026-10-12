// js/pages/games.js
// games.html: the Play hub. The daily puzzles (with a Done mark and today's
// progress when signed in), the weekly and season games (Pick'em, DFS, the
// boxes pool when it's switched on), what's coming, and each daily puzzle's
// top five.
//
// Data: each puzzle's stats docs ({collection}/{uid}: gamesPlayed, wins,
// perfectGames, currentStreak, displayName) and today's game
// ({collection}/{uid}/{dailyGames|puzzles}/{day}) for the Done marks.
// Visibility of the pool cards follows siteConfig (nav-config.js).

import { initPage, pageReady } from '../core/app.js';
import { db, collection, doc, getDoc, getDocs } from '../core/firebase.js';
import { loadPageVisibility, isPageVisible } from '../../nav-config.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);

// The daily puzzles share one day count from launch (the games use the same).
const LAUNCH = [2026, 0, 6];
function dayNumber(now = new Date()) {
  const start = new Date(...LAUNCH);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((today - start) / 86400000) + 1);
}

const DAILY = [
  { key: 'grid', href: 'immaculate-grid.html', title: 'Aces Grid', icon: 'grid-3x3', featured: true,
    text: 'Find players who fit both the row and the column. Rarer answers score better.',
    facts: ['New grid at midnight', 'Rarity scores and streaks'],
    col: 'acesGridGames', sub: 'puzzles', id: (d) => `puzzle_${d}`, done: (v) => v.gameOver === true,
    board: ['perfectGames', 'Perfect games'] },
  { key: 'connections', href: 'aces-connections.html', title: 'Connections', icon: 'link',
    text: 'Sort 16 players into four groups. Four mistakes allowed.',
    facts: ['4 hidden categories'],
    col: 'acesConnectionsGames', sub: 'dailyGames', id: String, done: (v) => v.isComplete === true || v.gameOver === true,
    board: ['wins', 'Wins'] },
  { key: 'wordle', href: 'aces-wordle.html', title: 'Aces Wordle', icon: 'hash',
    text: "Guess the player's last name in six tries. Hints after four.",
    facts: ['Keep your streak alive'],
    col: 'acesWordleGames', sub: 'dailyGames', id: String, done: (v) => v.gameOver === true,
    board: ['currentStreak', 'Current streak'] },
  { key: 'higherLower', href: 'higher-lower.html', title: 'Higher or Lower', icon: 'chevrons-up-down',
    text: 'Two players, one stat: who has more? Career and season numbers.',
    facts: ['How long can you go?'],
    col: 'acesHigherLowerGames', sub: 'puzzles', id: (d) => `puzzle_${d}`, done: (v) => v.gameOver === true,
    board: ['perfectGames', 'Perfect games'] },
  { key: 'whoAmI', href: 'who-am-i.html', title: 'Who Am I?', icon: 'user',
    text: 'Reveal clues one at a time and name the mystery player. Fewer clues, more points.',
    facts: ['7 clues, easier each time'],
    col: 'acesWhoAmIGames', sub: 'dailyGames', id: String, done: (v) => v.gameOver === true,
    board: ['wins', 'Wins'] },
  { key: 'recall', href: 'roster-recall.html', title: 'Player Recall', icon: 'timer',
    text: 'Name everyone in the category before the clock runs out.',
    facts: ['Bonus for 100%'],
    col: 'acesRosterRecallGames', sub: 'dailyGames', id: String, done: (v) => v.phase === 'finished',
    board: ['perfectGames', 'Perfect games'] }
];

// Weekly and season games. page: the nav-config page ID that switches it on or off.
const LEAGUE = [
  { page: 'pickem', href: 'pickem.html', title: "Pick'em", icon: 'check-circle', badge: 'Live', live: true, signIn: true,
    text: 'Pick the winner of every Aces game each week, then climb the season leaderboard.',
    facts: ['Picks lock before first pitch', 'Weekly and season standings'] },
  { page: 'aces-dfs', href: 'dfs.html', title: 'Aces DFS', icon: 'dice', badge: 'Weekly', signIn: true,
    text: 'Draft a 10-man roster under the cap each week. Salaries come from Aces BPI; points from real games.',
    facts: ['4 IF, 3 OF, C, P, UTIL', '$50,000 cap'] },
  { page: 'boxes-pool', href: 'boxes-pool.html', title: 'NFL Boxes Pool', icon: 'grid', badge: 'Pool',
    text: 'Football squares for Thanksgiving and the Super Bowl. Prizes for each quarter.',
    facts: ['Numbers drawn before kickoff'] },
  { page: 'aces-23-0', href: 'aces-23-0.html', title: 'Aces 23-0', icon: 'shuffle', badge: 'Challenge',
    text: 'Spin a season and team, draft four hitters and a pitcher, and try to go 23-0.',
    facts: ['Play any time'] }
];

const SOON = [
  { title: 'Aces Trivia', icon: 'book', text: 'Questions from league history and the record book.' }
];

const S = { user: null, done: new Map() };

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function dailyCard(g) {
  const done = S.done.get(g.key);
  return `<li><a class="aces-card gm-card${g.featured ? ' is-featured' : ''}${done ? ' is-done' : ''}" href="${esc(g.href)}" data-game="${esc(g.key)}">
    <span class="gm-card-top"><span class="gm-icon">${icon(g.icon)}</span>
      ${done ? `<span class="aces-badge is-win">${icon('check')}Done today</span>` : '<span class="aces-badge is-outline">Daily</span>'}</span>
    <h3>${esc(g.title)}</h3>
    <p>${esc(g.text)}</p>
    <span class="gm-facts">${g.facts.map((f) => `<span>${esc(f)}</span>`).join('')}</span>
    <span class="gm-go">${done ? 'See today\'s result' : 'Play'}${icon('arrow-right')}</span>
  </a></li>`;
}

function leagueCard(g) {
  const needsSignIn = g.signIn && !S.user;
  return `<li><a class="aces-card gm-card${g.live ? ' is-live' : ''}" href="${esc(g.href)}">
    <span class="gm-card-top"><span class="gm-icon">${icon(g.icon)}</span>
      <span class="aces-badge ${g.live ? 'is-win gm-live' : 'is-outline'}">${g.live ? '<span class="gm-pulse" aria-hidden="true"></span>' : ''}${esc(g.badge)}</span></span>
    <h3>${esc(g.title)}</h3>
    <p>${esc(g.text)}</p>
    <span class="gm-facts">${g.facts.map((f) => `<span>${esc(f)}</span>`).join('')}</span>
    <span class="gm-go">${needsSignIn ? 'Sign in to play' : 'Open'}${icon('arrow-right')}</span>
  </a></li>`;
}

function soonCard(g) {
  return `<li><div class="aces-card gm-card is-soon">
    <span class="gm-card-top"><span class="gm-icon">${icon(g.icon)}</span><span class="aces-badge is-outline">Coming soon</span></span>
    <h3>${esc(g.title)}</h3>
    <p>${esc(g.text)}</p>
  </div></li>`;
}

function renderCards() {
  $('gmDaily').innerHTML = DAILY.map(dailyCard).join('');
  const league = LEAGUE.filter((g) => isPageVisible(g.page) !== false);
  $('gmLeague').innerHTML = league.map(leagueCard).join('');
  $('gmSoon').innerHTML = SOON.map(soonCard).join('');
  renderProgress();
}

function renderProgress() {
  const box = $('gmToday');
  if (!S.user) {
    box.innerHTML = `<p class="gm-today-text">${icon('info')}<span><a href="signin.html">Sign in</a> to save your streaks, show up on the leaderboards and play Pick'em.</span></p>`;
    return;
  }
  const done = DAILY.filter((g) => S.done.get(g.key)).length;
  const next = DAILY.find((g) => !S.done.get(g.key));
  box.innerHTML = `<div class="gm-today-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${DAILY.length}" aria-valuenow="${done}" aria-label="Daily puzzles done today">
      ${DAILY.map((g) => `<span class="${S.done.get(g.key) ? 'is-on' : ''}" title="${esc(g.title)}"></span>`).join('')}
    </div>
    <p class="gm-today-text"><b>${done} of ${DAILY.length}</b>&nbsp;daily puzzles done today.${next ? ` Next up: <a href="${esc(next.href)}">${esc(next.title)}</a>.` : ' That\'s all of them. Come back tomorrow.'}</p>`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadDone(uid) {
  const day = dayNumber();
  await Promise.all(DAILY.map(async (g) => {
    try {
      const snap = await getDoc(doc(db, g.col, uid, g.sub, g.id(day)));
      if (snap.exists() && g.done(snap.data())) { S.done.set(g.key, true); return; }
      const stats = await getDoc(doc(db, g.col, uid));
      const v = stats.exists() ? stats.data() : {};
      if (v.lastPlayedPuzzle === day || v.lastPuzzle === day) S.done.set(g.key, true);
    } catch { /* leave it unmarked */ }
  }));
}

async function board(g) {
  const [field] = g.board;
  try {
    const snap = await getDocs(collection(db, g.col));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .filter((v) => v.gamesPlayed > 0 && Number(v[field]) > 0 && v.displayName)
      .map((v) => ({ uid: v.uid, name: v.displayName, score: Number(v[field]) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 5);
  } catch (err) {
    console.warn(`[games] ${g.col} leaderboard`, err);
    return null;
  }
}

async function renderBoards() {
  const box = $('gmBoards');
  box.innerHTML = DAILY.map((g) => `<li class="aces-card gm-board" data-board="${esc(g.key)}">
    <h3><span class="gm-icon is-sm">${icon(g.icon)}</span><span>${esc(g.title)}<small>${esc(g.board[1])}</small></span></h3>
    <ol><li><span class="aces-skeleton is-row"></span></li><li><span class="aces-skeleton is-row"></span></li></ol>
  </li>`).join('');
  await Promise.all(DAILY.map(async (g) => {
    const rows = await board(g);
    const ol = box.querySelector(`[data-board="${g.key}"] ol`);
    if (!ol) return;
    if (rows === null) { ol.innerHTML = '<li class="gm-board-empty">Couldn\'t load.</li>'; return; }
    if (!rows.length) { ol.innerHTML = '<li class="gm-board-empty">Nobody yet. Be the first.</li>'; return; }
    ol.innerHTML = rows.map((r, i) => `<li${S.user && r.uid === S.user.uid ? ' class="is-me"' : ''}>
      <span class="gm-rank${i < 3 ? ` is-${i + 1}` : ''}">${i + 1}</span>
      <span class="gm-name">${esc(r.name)}</span>
      <b>${r.score}${g.key === 'wordle' ? icon('flame') : ''}</b>
    </li>`).join('');
  }));
}

async function main() {
  const ctx = await initPage({ title: 'Games' });
  S.user = ctx?.user || null;
  await loadPageVisibility().catch(() => {});
  renderCards();
  pageReady();
  if (S.user) {
    await loadDone(S.user.uid);
    renderCards();
  }
  await renderBoards();
}

main().catch((err) => { console.error('[games]', err); pageReady(); });
