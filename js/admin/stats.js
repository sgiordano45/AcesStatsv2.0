// js/admin/stats.js
// admin/stats.html: the stats pipeline for one season, step by step.
//   1. Scores and stats in: every finished game has a score and both teams' stats
//   2. Tracked games reviewed: Game Tracker results converted to official stats
//   3. Test aggregation: aggregatedPlayerStats_test rebuilt since the last change
//   4. Production aggregation: aggregatedPlayerStats rebuilt since the last change
//   5. Badges: playerBadges recalculated since the production run
// Each step says whether it is done and links to the tool that does it (the
// aggregator and badge calculator open with the season and test mode chosen).
// Below the steps, every finished game with what it is missing.
//
// "Last change" is the newest statsSubmittedAt on the season's games or
// convertedAt on its tracked games. Games entered before statsSubmittedAt
// existed have no time, so they never make a step look out of date.

import { initPage, pageReady, siteUrl } from '../core/app.js';
import { db, collection, getDocs, doc, getDoc, query, where } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { getAllSeasons } from '../data/seasons.js';
import { normalizeGame } from '../domain/standings.js';
import { parseGameDateTime, formatGameDate } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { mountAdminShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const GAME_LENGTH_MS = 2 * 60 * 60 * 1000;
const toMillis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);

let state = null;      // the loaded season
let showAll = false;   // games table: all finished games, or only ones needing work

function when(ms) {
  if (!ms) return 'Never';
  const d = new Date(ms);
  const m = Math.round((Date.now() - ms) / 60000);
  const rel = m < 60 ? `${Math.max(m, 0)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${rel})`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** Newest lastUpdated among players aggregated for this season in a collection. */
async function lastAggregation(col, seasonId) {
  try {
    const snap = await getDocs(query(collection(db, col), where('lastGameAggregation', '==', seasonId)));
    let max = 0;
    snap.forEach(d => { max = Math.max(max, toMillis(d.data().lastUpdated)); });
    return { at: max, players: snap.size };
  } catch (err) {
    console.warn(`[stats] ${col} unavailable`, err);
    return { at: 0, players: 0, error: true };
  }
}

async function badgeRun(col, seasonId) {
  try {
    const s = await getDoc(doc(db, col, `season_${seasonId}`));
    return s.exists() ? toMillis(s.data().calculatedAt) : 0;
  } catch (err) {
    console.warn(`[stats] ${col} unavailable`, err);
    return 0;
  }
}

async function load(seasonId) {
  const [raw, trackedSnap, prod, test, badges, badgesTest] = await Promise.all([
    getSeasonGames(seasonId),
    getDocs(query(collection(db, 'gameResults'), where('seasonId', '==', seasonId))).catch(err => { console.warn('[stats] gameResults unavailable', err); return null; }),
    lastAggregation('aggregatedPlayerStats', seasonId),
    lastAggregation('aggregatedPlayerStats_test', seasonId),
    badgeRun('playerBadges', seasonId),
    badgeRun('playerBadges_test', seasonId)
  ]);

  const tracked = [];
  trackedSnap?.forEach(d => tracked.push({ id: d.id, ...d.data() }));
  const trackedByGame = new Map();
  tracked.forEach(t => { if (t.gameId) (trackedByGame.get(String(t.gameId)) || trackedByGame.set(String(t.gameId), []).get(String(t.gameId))).push(t); });

  const now = Date.now();
  const games = [];
  for (const r of raw) {
    const g = normalizeGame(r);
    const start = parseGameDateTime(r.date, r.time);
    const decided = !!g.winner || !!g.unmatchedWinner;
    if (!decided && (!start || start.getTime() + GAME_LENGTH_MS > now)) continue;   // not played yet
    const all = r.statsSubmitted === true;
    const t = trackedByGame.get(String(r.id)) || [];
    const changedAt = Math.max(toMillis(r.statsSubmittedAt), ...t.map(x => toMillis(x.convertedAt)), 0);
    games.push({
      id: r.id, r, g, start: start?.getTime() || 0,
      scored: decided || g.hasScores,
      awayIn: all || r.statsSubmittedAway === true,
      homeIn: all || r.statsSubmittedHome === true,
      noStatsNote: r.statsSubmittedNote || '',
      tracked: t,
      trackedPending: t.filter(x => !x.convertedToOfficial).length,
      changedAt
    });
  }
  games.sort((a, b) => b.start - a.start);

  const lastChange = Math.max(0, ...games.map(x => x.changedAt));
  return {
    seasonId, games, tracked, prod, test, badges, badgesTest, lastChange,
    missingScore: games.filter(x => !x.scored).length,
    missingSides: games.reduce((n, x) => n + (x.scored ? (!x.awayIn) + (!x.homeIn) : 0), 0),
    trackedPending: tracked.filter(x => !x.convertedToOfficial).length
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function stepCard(n, { title, status, detail, note = '', actions = [] }) {
  const ic = status === 'done' ? 'check' : status === 'warn' ? 'alert' : 'clock';
  const label = status === 'done' ? 'Done' : status === 'warn' ? 'Needs attention' : 'To do';
  return `<li class="aces-card stp-step is-${status}">
    <div class="stp-step-head">
      <span class="stp-num" aria-hidden="true">${n}</span>
      <div class="stp-step-text"><h3>${esc(title)}</h3><p>${detail}</p></div>
      <span class="stp-state">${icon(ic)}<span>${label}</span></span>
    </div>
    ${note ? `<p class="stp-note">${note}</p>` : ''}
    ${actions.length ? `<div class="stp-actions">${actions.map(([href, text, primary]) =>
      `<a class="aces-btn is-sm${primary ? ' is-primary' : ''}" href="${esc(siteUrl(href))}">${esc(text)}</a>`).join('')}</div>` : ''}
  </li>`;
}

function renderSteps(s) {
  const sid = encodeURIComponent(s.seasonId);
  const stale = (at) => !at || at < s.lastChange;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const gapsLeft = s.missingScore + s.missingSides + s.trackedPending;
  const gapNote = gapsLeft ? `${icon('alert')} Steps 1 and 2 are not finished, so this run would leave out ${plural(gapsLeft, 'missing item')}. That is fine mid-season; run again once they are in.` : '';

  const steps = [];

  steps.push(stepCard(1, {
    title: 'Scores and stats in',
    status: s.missingScore || s.missingSides ? 'todo' : 'done',
    detail: s.missingScore || s.missingSides
      ? `${s.missingScore ? `${plural(s.missingScore, 'game')} with no score. ` : ''}${s.missingSides ? `${plural(s.missingSides, 'team stat sheet')} missing.` : ''}`
      : `All ${plural(s.games.length, 'finished game')} have a score and both teams' stats.`,
    actions: s.missingScore || s.missingSides ? [
      ...(s.missingScore ? [['submit-score.html', 'Submit scores', true]] : []),
      ['admin/submit-stats.html', 'Enter stats', !s.missingScore]
    ] : []
  }));

  steps.push(stepCard(2, {
    title: 'Tracked games reviewed',
    status: s.trackedPending ? 'todo' : 'done',
    detail: !s.tracked.length ? 'No games were tracked live this season.'
      : s.trackedPending ? `${plural(s.trackedPending, 'tracked game')} not yet converted to official stats.`
        : `All ${plural(s.tracked.length, 'tracked game')} converted.`,
    actions: s.trackedPending ? [['admin/game-tracker-review.html', 'Review tracked games', true]] : []
  }));

  const testStale = stale(s.test.at);
  steps.push(stepCard(3, {
    title: 'Test aggregation',
    status: testStale ? 'todo' : 'done',
    detail: `Last test run: ${esc(when(s.test.at))}${s.test.at ? `, ${plural(s.test.players, 'player')}` : ''}.${testStale && s.test.at ? ' Stats have changed since.' : ''}`,
    note: testStale ? gapNote : '',
    actions: [[`admin/aggregate-stats.html?season=${sid}&test=1`, 'Open test run', testStale]]
  }));

  const prodStale = stale(s.prod.at);
  const prodBeforeTest = s.prod.at && s.test.at && s.test.at > s.prod.at;
  steps.push(stepCard(4, {
    title: 'Production aggregation',
    status: !prodStale ? 'done' : testStale ? 'warn' : 'todo',
    detail: `Last production run: ${esc(when(s.prod.at))}${s.prod.at ? `, ${plural(s.prod.players, 'player')}` : ''}.${prodStale && s.prod.at ? ' Stats have changed since.' : ''}`,
    note: prodStale && testStale ? `${icon('alert')} Run the test aggregation first and check it looks right.`
      : prodStale && prodBeforeTest ? 'The test run is newer. If it looked right, run production.' : '',
    actions: [[`admin/aggregate-stats.html?season=${sid}`, 'Open production run', prodStale && !testStale]]
  }));

  const badgesStale = !s.badges || s.badges < s.prod.at;
  steps.push(stepCard(5, {
    title: 'Badges',
    status: !badgesStale ? 'done' : prodStale ? 'warn' : 'todo',
    detail: `Last calculated: ${esc(when(s.badges))}.${s.badgesTest ? ` Last test run: ${esc(when(s.badgesTest))}.` : ''}${badgesStale && s.badges ? ' Production stats have been rebuilt since.' : ''}`,
    note: badgesStale && prodStale ? 'Badges read production stats, so run the production aggregation first.' : '',
    actions: [
      [`admin/badges.html?season=${sid}&test=1`, 'Test badges'],
      [`admin/badges.html?season=${sid}`, 'Calculate badges', badgesStale && !prodStale]
    ]
  }));

  $('stpSteps').innerHTML = steps.join('');
  $('stpChange').textContent = s.lastChange ? `Last stats change: ${when(s.lastChange)}` : '';
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const yes = (text = 'In') => `<span class="aces-badge is-win">${esc(text)}</span>`;
const no = (text = 'Missing') => `<span class="aces-badge is-alert">${esc(text)}</span>`;
const none = '<span class="stp-dim">-</span>';
// A missing side links straight to Enter stats for that game and team.
const enter = (x, side) => `<a class="aces-badge is-alert stp-enter" href="${esc(siteUrl(`admin/submit-stats.html?season=${encodeURIComponent(state.seasonId)}&game=${encodeURIComponent(x.id)}&side=${side}`))}" title="Enter these stats">Missing</a>`;

function needsWork(x, s) {
  return !x.scored || !x.awayIn || !x.homeIn || x.trackedPending > 0 || (x.changedAt && x.changedAt > s.prod.at);
}

function renderGames(s) {
  const rows = showAll ? s.games : s.games.filter(x => needsWork(x, s));
  $('stpGamesCount').textContent = `${rows.length} of ${s.games.length}`;
  if (!rows.length) {
    $('stpGames').innerHTML = `<p class="stp-empty">${s.games.length ? 'Every finished game is in and aggregated.' : 'No games have been played yet this season.'}</p>`;
    return;
  }
  $('stpGames').innerHTML = `<div class="aces-table-wrap"><table class="aces-table stp-table">
    <thead><tr><th>Date</th><th>Game</th><th>Score</th><th>Away stats</th><th>Home stats</th><th>Tracker</th><th>Aggregated</th></tr></thead>
    <tbody>${rows.map(x => {
      const { g, r } = x;
      const marked = r.statsSubmitted === true && x.noStatsNote;
      const tracker = !x.tracked.length ? none : x.trackedPending ? no('Review') : yes('Converted');
      const agg = !x.scored ? none : x.changedAt && x.changedAt > s.prod.at ? no('Not yet') : x.changedAt ? yes('Yes') : '<span class="stp-dim" title="Entered before submission times were recorded">Likely</span>';
      return `<tr>
        <td class="stp-date">${esc(formatGameDate(r.date))}</td>
        <td>${esc(g.away)} at ${esc(g.home)}</td>
        <td class="stp-num-cell">${x.scored ? (g.hasScores ? `${g.awayScore}-${g.homeScore}` : 'Final') : no('No score')}</td>
        <td>${!x.scored ? none : marked ? `<span class="aces-badge is-outline" title="${esc(x.noStatsNote)}">Marked</span>` : x.awayIn ? yes() : enter(x, 'away')}</td>
        <td>${!x.scored ? none : marked ? `<span class="aces-badge is-outline" title="${esc(x.noStatsNote)}">Marked</span>` : x.homeIn ? yes() : enter(x, 'home')}</td>
        <td>${tracker}</td>
        <td>${agg}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function show(seasonId) {
  $('stpSteps').innerHTML = '<li class="aces-card stp-loading">Checking the season...</li>';
  $('stpGames').innerHTML = '';
  try {
    state = await load(seasonId);
    renderSteps(state);
    renderGames(state);
  } catch (err) {
    console.error('[stats] load failed', err);
    $('stpSteps').innerHTML = `<li class="aces-card stp-loading">Could not load ${esc(seasonLabel(seasonId))}: ${esc(err.message || err)}</li>`;
  }
}

async function main() {
  const ctx = await initPage({ title: 'Stats pipeline', role: 'admin', deniedMessage: 'The stats pipeline is for admins.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/stats.html');
  const seasons = (await getAllSeasons()).sort((a, b) => b.id.localeCompare(a.id));
  const fromUrl = new URLSearchParams(location.search).get('season');
  const start = [fromUrl, ctx.config?.currentSeasonId, ctx.config?.previousSeasonId, seasons[0]?.id]
    .find(id => id && seasons.some(s => s.id === id));

  const sel = $('stpSeason');
  sel.innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}</option>`).join('');
  if (start) sel.value = start;
  sel.addEventListener('change', () => {
    history.replaceState(null, '', `?season=${encodeURIComponent(sel.value)}`);
    show(sel.value);
  });

  document.querySelectorAll('[data-games]').forEach(b => b.addEventListener('click', () => {
    showAll = b.dataset.games === 'all';
    document.querySelectorAll('[data-games]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (state) renderGames(state);
  }));
  $('stpRefresh').addEventListener('click', () => show(sel.value));

  pageReady();
  if (start) await show(start);
}

main();
