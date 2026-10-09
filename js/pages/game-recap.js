// js/pages/game-recap.js
// game-recap.html: one finished game.
//
//   Scoreboard    final score, winner, line score when one was submitted
//   Standouts     the best lines of the game (hits, runs, RBI, walks; pitchers by runs allowed)
//   Peter's line  how Peter's money line called it, when the game had one
//   Box score     batting and pitching for each team (subs marked)
//   After this    each team's record after the game, the season series and
//                 what's next for both teams
//
// Box scores come from gameBoxScores/{seasonId}_{gameId} (built on
// aggregate-stats.html), else each player's playerStats/pitchingStats game doc.
//
// URL: game-recap.html?gameId=abc123&seasonId=2026-fall (seasonId optional)

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc, collection, getDocs } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { cap, teamDot, teamLogo, teamHref, gameHref, moneyLine, fmtLine, loadAllSeasonGames, seriesRecord, recordText } from '../ui/game-shared.js';
import { normalizeGames, isDecided, buildRecords } from '../domain/standings.js';
import { formatGameDate, formatTime, timeSortValue } from '../domain/dates.js';
import { era } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, inningsValue } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const lower = (s) => String(s || '').toLowerCase().trim();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);

const R = { seasonId: '', game: null, raw: null, season: [], bat: [], pit: [], legacyToAuth: {} };

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function findGame(gameId, seasonParam) {
  const tryId = async (sid) => {
    if (!sid) return null;
    const docs = await getSeasonGames(sid).catch(() => []);
    const i = docs.findIndex(d => d.id === gameId);
    return i < 0 ? null : { seasonId: sid, docs, raw: docs[i] };
  };
  const first = await tryId(seasonParam) || await tryId(await getDisplaySeasonId().catch(() => ''));
  if (first) return first;
  const { games } = await loadAllSeasonGames();
  const g = games.find(x => x.id === gameId);
  return g ? tryId(g.seasonId) : null;
}

async function loadBox(gameDocId) {
  try {
    const box = await getDoc(doc(db, 'gameBoxScores', gameDocId));
    if (box.exists()) {
      const v = box.data();
      return { bat: v.batting || [], pit: v.pitching || [], legacyToAuth: v.legacyToAuth || {} };
    }
  } catch (err) { console.warn('[recap] box score doc unavailable', err); }
  // Fallback: every player's game doc (legacy ids from aggregatedPlayerStats and users.mergedFromProfile).
  try {
    const [agg, users] = await Promise.all([getDocs(collection(db, 'aggregatedPlayerStats')), getDocs(collection(db, 'users'))]);
    const ids = new Set();
    const legacyToAuth = {};
    agg.docs.filter(d => !d.data().migrated).forEach(d => ids.add(d.id));
    users.docs.forEach(d => { const mp = d.data().mergedFromProfile; if (mp) { ids.add(mp); legacyToAuth[mp] = d.id; } });
    const list = [...ids];
    const read = (coll) => Promise.all(list.map(id => getDoc(doc(db, coll, id, 'games', gameDocId)).catch(() => null)));
    const [b, p] = await Promise.all([read('playerStats'), read('pitchingStats')]);
    const rows = (snaps) => snaps.filter(s => s && s.exists()).map(s => ({ id: s.id, _legacyId: s.ref.parent.parent.id, ...s.data() }));
    return { bat: rows(b), pit: rows(p), legacyToAuth };
  } catch (err) {
    console.warn('[recap] game stats unavailable', err);
    return { bat: [], pit: [], legacyToAuth: {} };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const onTeam = (row, team) => lower(row.teamId || row.team || row.teamName) === lower(team);
function nameLink(p) {
  const legacy = p._legacyId || p.playerId || '';
  const id = (legacy && R.legacyToAuth[legacy]) || p.authId || legacy;
  const name = p.playerName || p.name || p.playerId || '?';
  return id ? `<a href="player.html?id=${esc(encodeURIComponent(id))}">${esc(name)}</a>` : esc(name);
}
const subTag = (p) => (p.isSub === true ? ` <span class="aces-badge is-outline gr-sub" title="${esc(p.homeTeam ? `Sub (regular team: ${p.homeTeam})` : 'Sub')}">Sub</span>` : '');
const avg = (h, ab) => (ab ? fmtAvg(h / ab) : '-');

function batLine(p) {
  const bits = [`${p.hits || 0}-for-${p.atBats || 0}`];
  if (p.homeRuns) bits.push(p.homeRuns > 1 ? `${p.homeRuns} HR` : 'HR');
  if (p.triples) bits.push(p.triples > 1 ? `${p.triples} 3B` : '3B');
  if (p.doubles) bits.push(p.doubles > 1 ? `${p.doubles} 2B` : '2B');
  if (p.runs) bits.push(`${p.runs} R`);
  if (p.rbi) bits.push(`${p.rbi} RBI`);
  if (p.walks) bits.push(`${p.walks} BB`);
  return bits.join(', ');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderHead() {
  const g = R.game;
  const title = g.hasScores
    ? `${cap(g.away)} ${g.awayScore}, ${cap(g.home)} ${g.homeScore}`
    : `${cap(g.away)} at ${cap(g.home)}`;
  $('grTitle').textContent = title;
  $('grKicker').textContent = g.type === 'playoff' ? `Final \u00b7 Playoffs${g.round ? `, ${cap(g.round)}` : ''}` : 'Final';
  $('grMeta').textContent = [g.dateKey ? formatGameDate(g.dateKey, 'long') : '', g.time ? formatTime(g.time) : '', seasonLabel(R.seasonId)].filter(Boolean).join(' \u00b7 ');
  document.title = `${title} - Game Recap - Mountainside Aces`;
}

function renderScoreboard() {
  const g = R.game;
  const side = (team, score, which) => {
    const won = g.result === which, lost = g.result && g.result !== 'tie' && !won;
    return `<a class="gr-side is-${which}${won ? ' is-win' : ''}${lost ? ' is-loss' : ''}" href="${esc(teamHref(team))}">
      ${teamLogo(team) || '<span class="gp-logo-gap"></span>'}
      <span class="gr-team">${esc(cap(team))}</span>
      <span class="gr-score">${g.hasScores ? score : esc(won ? 'W' : lost ? 'L' : '-')}</span>
      ${won ? '<span class="aces-badge is-win">Win</span>' : g.result === 'tie' ? '<span class="aces-badge is-outline">Tie</span>' : '<span class="gr-ha">' + (which === 'home' ? 'Home' : 'Away') + '</span>'}
    </a>`;
  };
  const ls = R.raw?.lineScore;
  let line = '';
  if (ls && Array.isArray(ls.home) && ls.home.length) {
    const n = Math.max(ls.home.length, (ls.away || []).length);
    const cols = Array.from({ length: n }, (_, i) => i);
    const tot = (arr) => (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
    const row = (team, arr, which) => `<tr class="${g.result === which ? 'is-win' : ''}"><th scope="row"><span class="gr-line-team">${teamDot(team)}${esc(cap(team))}</span></th>${cols.map(i => `<td class="is-num">${arr?.[i] ?? 0}</td>`).join('')}<td class="is-num gr-r">${tot(arr)}</td></tr>`;
    line = `<div class="aces-table-wrap gr-line"><table class="aces-table is-compact"><thead><tr><th scope="col">Team</th>${cols.map(i => `<th scope="col" class="is-num">${i + 1}</th>`).join('')}<th scope="col" class="is-num gr-r">R</th></tr></thead>
      <tbody>${row(g.away, ls.away, 'away')}${row(g.home, ls.home, 'home')}</tbody></table></div>`;
  }
  $('grBoard').innerHTML = `<section class="aces-card gr-board">
    <div class="gr-sides">${side(g.away, g.awayScore, 'away')}<span class="gr-final">Final</span>${side(g.home, g.homeScore, 'home')}</div>
    ${line}
  </section>`;
}

function renderStandouts() {
  const score = (p) => (p.hits || 0) * 2 + (p.runs || 0) * 1.5 + (p.rbi || 0) * 1.5 + (p.walks || 0) + (p.homeRuns || 0) * 3 + (p.doubles || 0) + (p.triples || 0) * 2;
  const hitters = [...R.bat].filter(p => (p.atBats || 0) + (p.walks || 0) > 0).sort((a, b) => score(b) - score(a) || (b.hits || 0) - (a.hits || 0)).slice(0, 4);
  const winTeam = R.game.result === 'home' ? R.game.home : R.game.result === 'away' ? R.game.away : '';
  const pitchers = R.pit.filter(p => inningsValue(p.inningsPitched) > 0)
    .sort((a, b) => (onTeam(b, winTeam) - onTeam(a, winTeam)) || inningsValue(b.inningsPitched) - inningsValue(a.inningsPitched)).slice(0, 1);
  if (!hitters.length && !pitchers.length) { $('grStandouts').innerHTML = ''; return; }
  const team = (p) => p.teamId || p.team || '';
  $('grStandouts').innerHTML = `<section class="aces-card gr-standouts">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('star')}Standouts</h2></div>
    <ul class="gr-stars">
      ${hitters.map(p => `<li>${teamDot(team(p))}<span class="gr-star-name">${nameLink(p)}${subTag(p)}</span><span class="gr-star-line">${esc(batLine(p))}</span></li>`).join('')}
      ${pitchers.map(p => `<li>${teamDot(team(p))}<span class="gr-star-name">${nameLink(p)}</span><span class="gr-star-line">${icon('softball')}${esc(formatIP(p.inningsPitched))} IP, ${p.runsAllowed || 0} R${winTeam && onTeam(p, winTeam) ? ', the win' : ''}</span></li>`).join('')}
    </ul>
  </section>`;
}

function renderPeter() {
  const line = moneyLine(R.raw?.homeOdds, R.raw?.awayOdds);
  const g = R.game;
  if (!line || !line.favorite || !g.result || g.result === 'tie') { $('grPeter').innerHTML = ''; return; }
  const fav = line.favorite === 'home' ? g.home : g.away;
  const favWon = g.result === line.favorite;
  const pct = line.favorite === 'home' ? line.homePct : line.awayPct;
  $('grPeter').innerHTML = `<section class="aces-card gr-peter${favWon ? '' : ' is-upset'}">
    <img src="logos/peterpreview.png" alt="" data-peter>
    <div><h2>${favWon ? 'Peter called it' : 'Upset'}</h2>
      <p>Peter had ${esc(cap(fav))} at ${esc(fmtLine(line[line.favorite]))} (about ${pct}% to win).${favWon ? '' : ` ${esc(cap(line.favorite === 'home' ? g.away : g.home))} won anyway.`}</p>
      <a href="game-preview.html?${esc(new URLSearchParams({ gameId: g.id, seasonId: R.seasonId }).toString())}">Read the preview${icon('chevron-right')}</a></div>
  </section>`;
}

function battingTable(rows) {
  const sorted = [...rows].sort((a, b) => ((b.atBats || 0) + (b.walks || 0)) - ((a.atBats || 0) + (a.walks || 0)));
  const hasXbh = rows.some(p => p.doubles || p.triples || p.homeRuns || p.rbi);
  const head = ['AB', 'H', 'R', ...(hasXbh ? ['RBI'] : []), 'BB', ...(hasXbh ? ['2B', '3B', 'HR'] : []), 'AVG'];
  const cells = (p) => [p.atBats || 0, p.hits || 0, p.runs || 0, ...(hasXbh ? [p.rbi || 0] : []), p.walks || 0, ...(hasXbh ? [p.doubles || 0, p.triples || 0, p.homeRuns || 0] : []), avg(p.hits || 0, p.atBats || 0)];
  const tot = { atBats: sum(rows, 'atBats'), hits: sum(rows, 'hits'), runs: sum(rows, 'runs'), rbi: sum(rows, 'rbi'), walks: sum(rows, 'walks'), doubles: sum(rows, 'doubles'), triples: sum(rows, 'triples'), homeRuns: sum(rows, 'homeRuns') };
  return `<div class="aces-table-wrap"><table class="aces-table is-compact gr-box">
    <thead><tr><th scope="col">Batting</th>${head.map(h => `<th scope="col" class="is-num">${h}</th>`).join('')}</tr></thead>
    <tbody>${sorted.map(p => `<tr><td>${nameLink(p)}${subTag(p)}</td>${cells(p).map(c => `<td class="is-num">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Totals</th>${cells(tot).map(c => `<td class="is-num">${c}</td>`).join('')}</tr></tfoot>
  </table></div>`;
}

function pitchingTable(rows, team) {
  const sorted = [...rows].sort((a, b) => inningsValue(b.inningsPitched) - inningsValue(a.inningsPitched));
  const opp = lower(team) === lower(R.game.home) ? R.game.away : R.game.home;
  const oppBat = R.bat.filter(p => onTeam(p, opp));
  const single = rows.length === 1 && oppBat.length > 0;
  const whip = (p, ip) => {
    if (!ip) return { v: '-', est: false };
    if (p.hitsAllowed != null && p.walksAllowed != null) return { v: fmtRate((p.hitsAllowed + p.walksAllowed) / ip), est: false };
    if (single) return { v: fmtRate((sum(oppBat, 'hits') + sum(oppBat, 'walks')) / ip), est: true };
    return { v: '-', est: false };
  };
  let estimated = false;
  const line = (p) => {
    const ip = inningsValue(p.inningsPitched);
    const w = whip(p, ip);
    if (w.est) estimated = true;
    return `<td class="is-num">${esc(formatIP(p.inningsPitched))}</td><td class="is-num">${p.runsAllowed || 0}</td><td class="is-num">${ip ? fmtRate(era(p.runsAllowed || 0, ip)) : '-'}</td><td class="is-num">${w.v}${w.est ? '*' : ''}</td>`;
  };
  const body = sorted.map(p => `<tr><td>${nameLink(p)}${subTag(p)}</td>${line(p)}</tr>`).join('');
  return `<div class="aces-table-wrap"><table class="aces-table is-compact gr-box">
    <thead><tr><th scope="col">Pitching</th><th scope="col" class="is-num">IP</th><th scope="col" class="is-num">R</th><th scope="col" class="is-num">ERA</th><th scope="col" class="is-num">WHIP</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    ${estimated ? '<p class="gr-note">* WHIP estimated from the other team\'s batting (one pitcher, no tracker data).</p>' : ''}`;
}

function renderBox() {
  const g = R.game;
  const teamCard = (team, which) => {
    const bat = R.bat.filter(p => onTeam(p, team)), pit = R.pit.filter(p => onTeam(p, team));
    const won = g.result === which;
    const color = ` data-team-color="${esc(lower(team))}"`;
    return `<section class="aces-card gr-team-card"${color}>
      <div class="aces-card-head"><h2 class="aces-card-title">${teamDot(team)}${esc(cap(team))}</h2>${won ? '<span class="aces-badge is-win">Win</span>' : `<span class="aces-badge is-outline">${which === 'home' ? 'Home' : 'Away'}</span>`}</div>
      ${bat.length ? battingTable(bat) : '<p class="gp-dim">No batting stats submitted.</p>'}
      ${pit.length ? pitchingTable(pit, team) : ''}
    </section>`;
  };
  if (!R.bat.length && !R.pit.length) {
    $('grBox').innerHTML = `<section class="aces-card"><div class="aces-card-head"><h2 class="aces-card-title">${icon('table')}Box score</h2></div>
      <div class="aces-empty">${icon('clipboard')}<p class="aces-empty-title">No box score yet</p><p>Stats show up here once a captain submits them.</p></div></section>`;
    return;
  }
  $('grBox').innerHTML = `<div class="gr-boxes">${teamCard(g.away, 'away')}${teamCard(g.home, 'home')}</div>`;
}

function renderAfter() {
  const g = R.game;
  if (!R.season.length) { $('grAfter').innerHTML = ''; return; }
  const upTo = R.season.filter(x => x.type === g.type && isDecided(x) && x.result && ((x.dateKey || '') < (g.dateKey || '') || ((x.dateKey || '') === (g.dateKey || '') && timeSortValue(x.time) <= timeSortValue(g.time))));
  const recs = buildRecords(upTo);
  const rec = (team) => recs.find(r => lower(r.team) === lower(team));
  const seriesGames = R.season.filter(x => isDecided(x) && x.result && ((lower(x.home) === lower(g.home) && lower(x.away) === lower(g.away)) || (lower(x.home) === lower(g.away) && lower(x.away) === lower(g.home))));
  const sr = seriesRecord(seriesGames, g.away);
  const seriesText = !seriesGames.length ? '-' : sr.wins === sr.losses ? `Tied ${recordText(sr)}`
    : `${cap(sr.wins > sr.losses ? g.away : g.home)} ${sr.wins > sr.losses ? recordText(sr) : recordText({ wins: sr.losses, losses: sr.wins, ties: sr.ties })}`;
  const next = (team) => R.season.filter(x => !isDecided(x) && (lower(x.home) === lower(team) || lower(x.away) === lower(team)) && (x.dateKey || '9') >= (g.dateKey || ''))
    .sort((a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || timeSortValue(a.time) - timeSortValue(b.time))[0];
  const nextLine = (team) => {
    const n = next(team);
    if (!n) return '<span class="gp-dim">No games left</span>';
    const opp = lower(n.home) === lower(team) ? n.away : n.home;
    return `<a href="${esc(gameHref(n, R.seasonId))}">${esc(n.dateKey ? formatGameDate(n.dateKey, 'short') : 'TBD')} ${lower(n.home) === lower(team) ? 'vs' : 'at'} ${teamDot(opp)}${esc(cap(opp))}</a>`;
  };
  const row = (team) => {
    const r = rec(team);
    return `<li><a class="gr-after-team" href="${esc(teamHref(team))}">${teamDot(team)}<strong>${esc(cap(team))}</strong></a>
      <span class="gr-after-rec">${r ? esc(recordText(r)) : '-'}<small>${g.type === 'playoff' ? 'playoff record' : 'after this game'}</small></span>
      <span class="gr-after-next"><small>Next</small>${nextLine(team)}</span></li>`;
  };
  $('grAfter').innerHTML = `<section class="aces-card gr-after">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('trending-up')}After this game</h2><span class="aces-badge is-outline">Season series: ${esc(seriesText)}</span></div>
    <ul>${row(g.away)}${row(g.home)}</ul>
    <a class="aces-section-link" href="schedule.html?${esc(new URLSearchParams({ season: R.seasonId, view: 'list' }).toString())}">Full schedule</a>
  </section>`;
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Game Recap' });
  const q = new URLSearchParams(location.search);
  const gameId = q.get('gameId');
  if (!gameId) {
    pageReady();
    showPageState({ title: 'Pick a game', message: 'Open a recap from the schedule.', actions: [{ label: 'Schedule', href: siteUrl('schedule.html'), primary: true }] });
    return;
  }
  const found = await findGame(gameId, parseStatSeasonId(q.get('seasonId') || '').id);
  if (!found) {
    pageReady();
    showPageState({ title: 'Game not found', message: "That game isn't on any schedule.", actions: [{ label: 'Schedule', href: siteUrl('schedule.html'), primary: true }] });
    return;
  }
  R.seasonId = found.seasonId;
  R.raw = found.raw;
  R.season = normalizeGames(found.docs);
  R.game = R.season.find(g => g.id === gameId);
  if (!isDecided(R.game)) {
    location.replace(`game-preview.html?${new URLSearchParams({ gameId, seasonId: R.seasonId })}`);
    return;
  }
  const box = await loadBox(`${R.seasonId}_${gameId}`);
  R.bat = box.bat; R.pit = box.pit; R.legacyToAuth = box.legacyToAuth;

  renderHead();
  renderScoreboard();
  renderPeter();
  renderStandouts();
  renderBox();
  renderAfter();
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-logo]')) e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'gp-logo-gap' }));
    if (e.target.matches?.('[data-peter]')) e.target.remove();
  }, true);
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
