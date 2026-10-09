// js/admin/home.js
// /admin/: the admin shell's home. A sidebar of every tool by job
// (js/admin/shell.js) and a to-do list of what needs doing now:
//   games past their start with no score, games missing a team's stats,
//   pending player-link and team-staff requests, rule proposals, new feature
//   requests, plus the season settings and when stats were last aggregated.
// League staff and admins only; admin-only tools are hidden from league staff.

import { initPage, pageReady, siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { db, collection, getDocs, doc, getDoc, query, orderBy, limit, where } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { normalizeGame } from '../domain/standings.js';
import { parseGameDateTime, formatGameDate } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { mountAdminShell } from './shell.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
const href = (p) => siteUrl(p);
const GAME_LENGTH_MS = 2 * 60 * 60 * 1000;
const toMillis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v || '') || 0);

function ago(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

async function gameTodos(seasonId) {
  const raw = await getSeasonGames(seasonId);
  const now = Date.now();
  const noScore = [];
  const noStats = [];
  for (const r of raw) {
    const g = normalizeGame(r);
    const start = parseGameDateTime(r.date, r.time);
    if (!start || start.getTime() + GAME_LENGTH_MS > now) continue;
    const decided = !!g.winner || !!g.unmatchedWinner;
    if (!decided && !g.hasScores) { noScore.push({ g, r }); continue; }
    if (r.statsSubmitted === true) continue;
    const sides = [];
    if (r.statsSubmittedHome !== true) sides.push(g.home);
    if (r.statsSubmittedAway !== true) sides.push(g.away);
    if (sides.length) noStats.push({ g, r, sides });
  }
  const byDate = (a, b) => (a.g.dateKey < b.g.dateKey ? 1 : -1);
  return { noScore: noScore.sort(byDate), noStats: noStats.sort(byDate) };
}

async function requestTodos() {
  const snap = await getDocs(collection(db, 'users'));
  let links = 0;
  let staff = 0;
  snap.forEach(d => {
    const u = d.data();
    links += (u.playerLinkRequests || []).filter(r => r.status === 'pending').length;
    staff += (u.staffRequests || []).filter(r => r.status === 'pending').length;
  });
  return { links, staff };
}

async function countWhere(col, field, values) {
  try {
    const snap = await getDocs(query(collection(db, col), where(field, 'in', values)));
    return snap.size;
  } catch (err) {
    console.warn(`[admin] ${col} count unavailable`, err);
    return null;
  }
}

const gameLine = ({ g, r, sides }) => `<li>
  <span class="adm-when">${esc(formatGameDate(r.date))}</span>
  <span>${esc(g.away)} at ${esc(g.home)}${g.hasScores ? ` <span class="adm-score">${g.awayScore}-${g.homeScore}</span>` : ''}</span>
  ${sides ? `<span class="adm-missing">${sides.map(esc).join(' and ')}</span>` : ''}</li>`;

function todoCard({ icon: ic, title, count, text, href: to, action, list = '', tone = '' }) {
  return `<section class="aces-card adm-todo${count ? ` ${tone || 'is-due'}` : ' is-clear'}">
    <div class="adm-todo-head">
      <span class="adm-todo-icon">${icon(ic)}</span>
      <div><h3>${esc(title)}</h3><p>${count === null ? 'Could not check' : count ? esc(text) : 'All clear'}</p></div>
      <span class="adm-todo-count">${count ?? '?'}</span>
    </div>
    ${list}
    ${count && to ? `<a class="aces-btn is-sm" href="${esc(href(to))}">${esc(action)}</a>` : ''}
  </section>`;
}

async function renderTodos(ctx) {
  const p = ctx.profile;
  const admin = hasRole(p, 'admin');
  const seasonId = ctx.config?.currentSeasonId;
  const phase = ctx.config?.phase || 'regular';

  const [games, reqs, rules, features, latest, summary] = await Promise.all([
    seasonId ? gameTodos(seasonId).catch(err => { console.warn('[admin] games unavailable', err); return null; }) : null,
    requestTodos().catch(err => { console.warn('[admin] users unavailable', err); return null; }),
    countWhere('rule_proposals', 'status', ['pending', 'under-review', 'under_review']),
    admin ? countWhere('featureSubmissions', 'status', ['new']) : Promise.resolve(undefined),
    getDocs(query(collection(db, 'aggregatedPlayerStats'), orderBy('lastUpdated', 'desc'), limit(1))).then(s => toMillis(s.docs[0]?.data()?.lastUpdated)).catch(() => 0),
    seasonId ? getDoc(doc(db, 'siteConfig', 'summaries', 'seasons', seasonId)).then(s => (s.exists() ? toMillis(s.data().storedAt) || Date.parse(s.data().builtAt || '') : 0)).catch(() => 0) : 0
  ]);

  const top = (arr) => (arr.length ? `<ul class="adm-list">${arr.slice(0, 6).map(gameLine).join('')}</ul>${arr.length > 6 ? `<p class="adm-more">and ${arr.length - 6} more</p>` : ''}` : '');
  const cards = [];
  if (games) {
    cards.push(todoCard({ icon: 'hash', title: 'Missing scores', count: games.noScore.length, text: `${games.noScore.length} game${games.noScore.length === 1 ? ' has' : 's have'} started with no final score`,
      href: 'submit-score.html', action: 'Submit scores', list: top(games.noScore), tone: 'is-urgent' }));
    cards.push(todoCard({ icon: 'calculator', title: 'Missing stats', count: games.noStats.length, text: `${games.noStats.length} finished game${games.noStats.length === 1 ? ' is' : 's are'} missing a team's stats`,
      href: admin ? 'admin/stats.html' : 'submit-stats.html', action: admin ? 'Open stats pipeline' : 'Enter stats', list: top(games.noStats) }));
  }
  cards.push(todoCard({ icon: 'user-check', title: 'Player link requests', count: reqs ? reqs.links : null, text: `${reqs?.links} waiting for approval`, href: 'approve-links.html', action: 'Review requests' }));
  cards.push(todoCard({ icon: 'shield', title: 'Team staff requests', count: reqs ? reqs.staff : null, text: `${reqs?.staff} waiting for a captain`, href: 'manage-team.html', action: 'Open team staff' }));
  cards.push(todoCard({ icon: 'scale', title: 'Rule proposals', count: rules, text: `${rules} pending or under review`, href: 'rule-review.html', action: 'Review proposals' }));
  if (features !== undefined) cards.push(todoCard({ icon: 'message', title: 'New feature requests', count: features, text: `${features} not looked at yet`, href: 'admin/features.html', action: 'Open requests' }));
  $('adminTodos').innerHTML = cards.join('');

  $('adminStatus').innerHTML = `
    <dl class="adm-status">
      <div><dt>Season</dt><dd>${seasonId ? esc(seasonLabel(seasonId)) : 'None set'}</dd></div>
      <div><dt>Phase</dt><dd>${esc(phase.charAt(0).toUpperCase() + phase.slice(1))}</dd></div>
      <div><dt>Opening day</dt><dd>${esc(ctx.config?.openingDay || 'Not set')}</dd></div>
      <div><dt>Stats last aggregated</dt><dd>${esc(ago(latest))}</dd></div>
      <div><dt>Home page summary</dt><dd>${esc(ago(summary))}</dd></div>
    </dl>
    <p class="adm-hint">Season, phase and opening day are set in <code>siteConfig/current</code>.</p>`;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: 'Admin', role: 'league-staff', deniedMessage: 'The admin area is for league staff and admins.' });
  mountAdminShell(ctx.profile, 'admin/index.html');
  pageReady();
  await renderTodos(ctx);
}

main();
