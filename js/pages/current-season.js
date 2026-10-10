// js/pages/current-season.js
// current-season.html: the season being played, at a glance.
//
//   Head        season, status line (games left / playoffs / champion), share,
//               calendar and a link to the full season page
//   Numbers     games played and left, next game day, runs per game
//   Standings   computeStandings with games back, last five, clinched seeds,
//               games left; run differential, SOS and Pythagorean on wide screens
//   Next/Latest the next two game days and the last two, with preview and recap links
//   Playoffs    this season's playoff games by round, once there are any
//   Leaders     top five (ties kept) in batting and pitching, active hit streaks
//   Badges      the season's badge counts and top earners (playerBadges)
//
// The season is the current one, or the latest during the offseason. Every
// past season, and the full stat tables, are on season.html.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc, collection, getDocs, query, where } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { applyTeamGames } from '../data/team-games.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { gameHref, teamHref } from '../ui/game-shared.js';
import { getCalendarUrl } from '../../calendar-subscription.js';
import { normalizeGames, computeStandings, isDecided } from '../domain/standings.js';
import { formatGameDate, todayKey, timeSortValue } from '../domain/dates.js';
import { battingAverage, onBasePct, sluggingPct, era, QUALIFIERS } from '../domain/stats.js';
import { seasonLabel } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const EXCLUDED_TEAMS = new Set(['kings']);

const S = { id: '', games: [], standings: [], bat: [], pit: [], streaks: [], oop: {}, badges: null, champion: '', runnerUp: '' };

const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const teamLink = (team) => `<a class="cs-team" href="${esc(teamHref(team))}">${dot(team)}${esc(cap(team))}</a>`;
const playerLink = (r) => `<a href="player.html?${esc(r.id ? `id=${encodeURIComponent(r.id)}` : `name=${encodeURIComponent(r.name)}`)}">${esc(r.name)}</a>`;
const record = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const empty = (title, message = '', iconName = 'info') => `<div class="aces-empty">${icon(iconName)}<p class="aces-empty-title">${esc(title)}</p>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
const card = (title, body, { iconName = '', extra = '', cls = '' } = {}) => `<section class="aces-card cs-card ${cls}">
  <div class="aces-card-head"><h2 class="aces-card-title">${iconName ? icon(iconName) : ''}${esc(title)}</h2>${extra}</div>${body}</section>`;
const byKickoff = (a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || timeSortValue(a.time) - timeSortValue(b.time);

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadExtras(seasonId) {
  const [streakSnap, oopSnap, badgeSnap, champSnap] = await Promise.all([
    getDocs(query(collection(db, 'hitStreaks'), where('currentStreak', '>=', 1))).catch(() => null),
    getDocs(query(collection(db, 'outOfParkHRs'), where('seasonId', '==', seasonId))).catch(() => null),
    getDoc(doc(db, 'playerBadges', `season_${seasonId}`)).catch(() => null),
    getDocs(query(collection(db, 'champions'), where('seasonId', '==', seasonId))).catch(() => null)
  ]);
  // Streaks: one per player, the longest (the calculator can leave an older doc behind)
  const best = new Map();
  streakSnap?.forEach(d => {
    const s = d.data();
    const id = s.playerId || s.playerLegacyId || s.playerName;
    if (!s.playerName || !(s.currentStreak >= 1)) return;
    if (!best.has(id) || s.currentStreak > best.get(id).streak) best.set(id, { id, name: s.playerName, streak: s.currentStreak });
  });
  S.streaks = [...best.values()].sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name)).slice(0, 8);
  S.oop = {};
  oopSnap?.forEach(d => {
    const s = d.data();
    const k = String(s.playerName || '').trim().toLowerCase();
    if (k) S.oop[k] = (S.oop[k] || 0) + (s.count || 1);
  });
  S.badges = badgeSnap?.exists() ? badgeSnap.data() : null;
  const c = champSnap?.docs?.[0]?.data();
  if (c) { S.champion = cap(c.team); S.runnerUp = cap(c.runnerUp); }
}

async function load() {
  S.id = await getDisplaySeasonId();
  const [players, games] = await Promise.all([
    getAllPlayerStatsOptimized().catch(err => { console.warn('[current-season] stats unavailable', err); return []; }),
    getSeasonGames(S.id),
    loadExtras(S.id)
  ]);
  S.games = normalizeGames(games);
  S.standings = computeStandings(S.games, { includeScheduled: true }).filter(r => r.team && r.team !== 'TBD' && !EXCLUDED_TEAMS.has(r.team.toLowerCase()));
  S.bat = buildBattingRows(players || []).filter(r => r.seasonId === S.id && !EXCLUDED_TEAMS.has(r.teamKey));
  S.pit = buildPitchingRows(players || []).filter(r => r.seasonId === S.id && !EXCLUDED_TEAMS.has(r.teamKey));
  await Promise.all([applyTeamGames(S.bat, { fallbackToPlayerGames: true }), applyTeamGames(S.pit)]).catch(() => {});
}

// ---------------------------------------------------------------------------
// Head and numbers
// ---------------------------------------------------------------------------

function renderHead() {
  const label = seasonLabel(S.id);
  $('csTitle').textContent = label;
  document.title = `${label} - Mountainside Aces`;
  const reg = S.games.filter(g => g.type === 'regular');
  const left = reg.filter(g => !isDecided(g)).length;
  const po = S.games.filter(g => g.type === 'playoff');
  let status;
  if (S.champion) status = `${icon('trophy')}<span><strong>${esc(S.champion)}</strong> won the title${S.runnerUp ? `, over ${esc(S.runnerUp)}` : ''}</span>`;
  else if (po.length && !left) status = `${icon('flag')}<span>Playoffs: ${plural(po.filter(isDecided).length, 'game')} played, ${po.filter(g => !isDecided(g)).length} to go</span>`;
  else if (reg.length && left) status = `${icon('calendar')}<span>${plural(left, 'regular-season game')} left</span>`;
  else status = `${icon('calendar')}<span>Schedule coming soon</span>`;
  $('csKicker').textContent = S.champion ? 'Final' : 'This season';
  $('csStatus').innerHTML = status;
  $('csSeasonLink').href = `season.html?seasonId=${encodeURIComponent(S.id)}`;
}

function renderNumbers() {
  const reg = S.games.filter(g => g.type === 'regular');
  const played = reg.filter(isDecided);
  const scored = played.filter(g => g.hasScores);
  const runs = scored.reduce((n, g) => n + g.homeScore + g.awayScore, 0);
  const today = todayKey();
  const next = S.games.filter(g => !isDecided(g) && g.dateKey && g.dateKey >= today).sort(byKickoff)[0];
  const nextDay = next ? S.games.filter(g => g.dateKey === next.dateKey && !isDecided(g)).length : 0;
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  $('csNumbers').innerHTML = [
    tile(`${played.length}`, 'Games played', reg.length ? `of ${reg.length} regular season` : ''),
    tile(`${reg.length - played.length}`, 'Games left', 'regular season'),
    tile(next ? formatGameDate(next.dateKey, 'monthDay') : '-', 'Next game day', next ? `${plural(nextDay, 'game')}${next.dateKey === today ? ', today' : ''}` : 'none scheduled'),
    tile(scored.length ? fmtRate(runs / scored.length / 2, { digits: 1 }) : '-', 'Runs per team', 'per game')
  ].join('');
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

function form(r) {
  const last = [...(r.history || [])].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)).slice(0, 5).reverse();
  if (!last.length) return '<span class="cs-dim">-</span>';
  return `<span class="cs-form" title="Last ${last.length}: ${esc(r.last5 || '')}">${last.map(h => `<i class="is-${h.result.toLowerCase()}"></i>`).join('')}</span>`;
}

function sos(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '<span class="cs-dim">-</span>';
  const cls = v < 0.45 ? 'is-easy' : v > 0.55 ? 'is-hard' : '';
  return `<span class="cs-sos ${cls}">${(v * 100).toFixed(0)}%</span>`;
}

function pyth(r) {
  const gp = r.wins + r.losses + r.ties;
  if (!gp || (!r.runsFor && !r.runsAgainst)) return '-';
  const rf2 = r.runsFor ** 2, ra2 = r.runsAgainst ** 2;
  const w = Math.round(gp * rf2 / (rf2 + ra2));
  return `${w}-${gp - w}`;
}

function renderStandings() {
  const rows = S.standings;
  const started = rows.some(r => r.games);
  if (!rows.length) { $('csStandings').innerHTML = card('Standings', empty('No teams yet', 'Standings appear once the schedule is published.', 'list'), { iconName: 'list' }); return; }
  const body = rows.map(r => `<tr>
    <td class="is-num cs-rank">${started && r.games ? r.rank : '-'}${r.clinched ? `<span class="cs-lock" title="Seed clinched">${icon('lock')}</span>` : ''}</td>
    <th scope="row">${teamLink(r.team)}</th>
    <td class="is-num">${r.wins}</td><td class="is-num">${r.losses}</td><td class="is-num">${r.ties}</td>
    <td class="is-num"><strong>${r.games ? fmtAvg(r.winPct) : '-'}</strong></td>
    <td class="is-num">${r.games && r.gamesBack ? r.gamesBack : '-'}</td>
    <td class="cs-form-cell">${form(r)}</td>
    <td class="is-num ${r.runDiff > 0 ? 'is-up' : r.runDiff < 0 ? 'is-down' : ''}">${r.games ? `${r.runDiff > 0 ? '+' : ''}${r.runDiff}` : '-'}</td>
    <td class="is-num is-opt">${r.runsFor}</td><td class="is-num is-opt">${r.runsAgainst}</td>
    <td class="is-num is-opt">${started ? sos(r.scheduleStrength) : '-'}</td><td class="is-num is-opt">${sos(r.remainingScheduleStrength)}</td>
    <td class="is-num is-opt">${pyth(r)}</td>
    <td class="is-num">${r.remainingCount ?? '-'}</td>
  </tr>`).join('');
  const table = `<div class="aces-table-wrap"><table class="aces-table is-compact cs-standings">
    <thead><tr><th scope="col" class="is-num">#</th><th scope="col">Team</th><th scope="col" class="is-num">W</th><th scope="col" class="is-num">L</th><th scope="col" class="is-num">T</th>
    <th scope="col" class="is-num">PCT</th><th scope="col" class="is-num">GB</th><th scope="col">Last 5</th><th scope="col" class="is-num">Diff</th>
    <th scope="col" class="is-num is-opt">RS</th><th scope="col" class="is-num is-opt">RA</th><th scope="col" class="is-num is-opt" title="Strength of schedule so far">SOS</th>
    <th scope="col" class="is-num is-opt" title="Strength of the games left">Rem SOS</th><th scope="col" class="is-num is-opt" title="Record expected from runs scored and allowed">Pyth</th>
    <th scope="col" class="is-num" title="Regular-season games left">Left</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="cs-note">${icon('lock')} seed clinched. SOS is the win percentage of the teams played (green easier, red harder); Pyth is the record runs scored and allowed point to.</p>`;
  $('csStandings').innerHTML = card('Standings', table, {
    iconName: 'list',
    extra: `<div class="cs-head-actions"><a class="aces-btn is-sm is-ghost" href="projections.html">${icon('trending-up')}Seed odds</a><button class="aces-btn is-sm" type="button" data-share>${icon('share')}Share</button></div>`
  });
}

// ---------------------------------------------------------------------------
// Next, latest, playoffs
// ---------------------------------------------------------------------------

function gameRow(g, { result = false } = {}) {
  const href = gameHref(g, S.id);
  if (result) {
    const homeWon = g.result === 'home', awayWon = g.result === 'away';
    const score = g.hasScores ? `${g.awayScore}-${g.homeScore}` : 'Final';
    return `<li class="cs-game">
      <span class="cs-match"><span class="${awayWon ? 'is-win' : ''}">${teamLink(g.away)}</span><span class="cs-at">at</span><span class="${homeWon ? 'is-win' : ''}">${teamLink(g.home)}</span></span>
      <span class="cs-score">${esc(score)}${g.forfeit ? ' <small>F</small>' : ''}</span>
      <a class="cs-go" href="${esc(href)}">Recap</a>
    </li>`;
  }
  return `<li class="cs-game">
    <span class="cs-time">${esc(g.time || 'TBD')}</span>
    <span class="cs-match">${teamLink(g.away)}<span class="cs-at">at</span>${teamLink(g.home)}</span>
    <a class="cs-go" href="${esc(href)}">Preview</a>
  </li>`;
}

function dayBlocks(list, opts) {
  const days = new Map();
  list.forEach(g => { const k = g.dateKey || 'tbd'; (days.get(k) || days.set(k, []).get(k)).push(g); });
  return [...days.entries()].map(([k, gs]) => `<div class="cs-day">
    <h3>${esc(k === 'tbd' ? 'Date to be set' : formatGameDate(k, 'long'))}${k === todayKey() ? ' <span class="aces-badge is-accent">Today</span>' : ''}</h3>
    <ul>${gs.map(g => gameRow(g, opts)).join('')}</ul></div>`).join('');
}

function renderGames() {
  const today = todayKey();
  const upcoming = S.games.filter(g => !isDecided(g) && (!g.dateKey || g.dateKey >= today)).sort(byKickoff);
  const nextDays = [...new Set(upcoming.map(g => g.dateKey))].slice(0, 2);
  const next = upcoming.filter(g => nextDays.includes(g.dateKey));
  const done = S.games.filter(isDecided).sort((a, b) => byKickoff(b, a));
  const lastDays = [...new Set(done.map(g => g.dateKey))].slice(0, 2);
  const latest = done.filter(g => lastDays.includes(g.dateKey));
  $('csNext').innerHTML = card('Up next', next.length ? dayBlocks(next) : empty('No games scheduled', '', 'calendar'), {
    iconName: 'calendar', extra: `<a class="aces-btn is-sm is-ghost" href="schedule.html">Full schedule</a>`
  });
  $('csLatest').innerHTML = card('Latest results', latest.length ? dayBlocks(latest, { result: true }) : empty('No results yet', '', 'clipboard-check'), {
    iconName: 'clipboard-check', extra: `<a class="aces-btn is-sm is-ghost" href="season.html?seasonId=${esc(encodeURIComponent(S.id))}&tab=schedule">All results</a>`
  });

  const po = S.games.filter(g => g.type === 'playoff').sort(byKickoff);
  if (!po.length) { $('csPlayoffs').innerHTML = ''; return; }
  const rounds = new Map();
  po.forEach(g => { const k = g.round || 'Playoffs'; (rounds.get(k) || rounds.set(k, []).get(k)).push(g); });
  $('csPlayoffs').innerHTML = card('Playoffs', `<div class="cs-rounds">${[...rounds.entries()].map(([round, gs]) => `<div class="cs-round">
    <h3>${esc(round)}</h3>
    <ul>${gs.map(g => isDecided(g) ? gameRow(g, { result: true }) : `<li class="cs-game">
      <span class="cs-time">${esc(g.dateKey ? formatGameDate(g.dateKey, 'monthDay') : 'TBD')} ${esc(g.time || '')}</span>
      <span class="cs-match">${teamLink(g.away)}<span class="cs-at">at</span>${teamLink(g.home)}</span>
      <a class="cs-go" href="${esc(gameHref(g, S.id))}">Preview</a></li>`).join('')}</ul></div>`).join('')}</div>`, { iconName: 'trophy', cls: 'cs-wide' });
}

// ---------------------------------------------------------------------------
// Leaders and badges
// ---------------------------------------------------------------------------

/** Top n by value, keeping anyone tied with the last place (at most n + 3). */
function topWithTies(rows, value, { n = 5, lower = false } = {}) {
  const list = rows.map(r => ({ r, v: value(r) })).filter(x => x.v !== null && x.v !== undefined && Number.isFinite(x.v) && (lower || x.v > 0))
    .sort((a, b) => (lower ? a.v - b.v : b.v - a.v) || a.r.name.localeCompare(b.r.name));
  const out = [];
  list.forEach((x, i) => {
    const rank = i && x.v === list[i - 1].v ? out[out.length - 1]?.rank : i + 1;
    if (rank <= n && out.length < n + 3) out.push({ ...x, rank });
  });
  return out;
}

function leaderBox(title, rows, value, fmt, { lower = false, note = '', extra = () => '' } = {}) {
  const list = topWithTies(rows, value, { lower });
  return `<div class="cs-leader"><h3>${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</h3>${list.length ? `<ol>${list.map(x => `<li>
    <span class="cs-lrank">${x.rank}</span><span class="cs-lname">${dot(x.r.team)}${playerLink(x.r)}</span><span class="cs-lval">${esc(fmt(x.v))}${extra(x.r)}</span></li>`).join('')}</ol>` : '<p class="cs-dim">No one yet</p>'}</div>`;
}

function renderLeaders() {
  const bat = S.bat.filter(r => !r.sub);
  if (!bat.length && !S.pit.length) {
    $('csLeaders').innerHTML = card('Leaders', empty('No stats yet', 'Leaders appear once stats are in for the season.', 'chart-bar'), { iconName: 'star', cls: 'cs-wide' });
    return;
  }
  const qb = bat.filter(r => r.teamGames > 0 && r.atBats + r.walks >= QUALIFIERS.PA_PER_TEAM_GAME * r.teamGames);
  const qp = S.pit.filter(r => r.teamGames > 0 && r.ip >= QUALIFIERS.IP_PER_TEAM_GAME * r.teamGames);
  // Slugging: total bases (1B + 2x2B + 3x3B + 4xHR) per at bat
  const slg = (r) => (r.atBats ? sluggingPct(r) : null);
  const oop = (r) => { const n = S.oop[String(r.name || '').trim().toLowerCase()] || 0; return n ? ` <span class="cs-oop" title="${n} out of the park">${icon('zap')}${n > 1 ? n : ''}</span>` : ''; };
  const team = new Map(bat.map(r => [r.name.toLowerCase(), r.team]));
  const streaks = S.streaks.length ? `<div class="cs-leader"><h3>Hit streaks<small>active</small></h3><ol>${S.streaks.map((s, i) => `<li>
    <span class="cs-lrank">${i + 1}</span><span class="cs-lname">${dot(team.get(s.name.toLowerCase()))}<a href="player.html?${esc(`id=${encodeURIComponent(s.id)}`)}">${esc(s.name)}</a></span><span class="cs-lval">${s.streak} G</span></li>`).join('')}</ol></div>` : '';
  const html = `<div class="cs-leaders">
    ${leaderBox('Batting average', qb, r => (r.atBats ? battingAverage(r.hits, r.atBats) : null), fmtAvg, { note: 'qualified' })}
    ${leaderBox('On-base %', qb, r => (r.atBats + r.walks ? onBasePct(r.hits, r.walks, r.atBats) : null), fmtAvg, { note: 'qualified' })}
    ${leaderBox('Slugging %', qb, slg, fmtAvg, { note: 'qualified' })}
    ${leaderBox('OPS', qb, r => { const s = slg(r); return s === null ? null : onBasePct(r.hits, r.walks, r.atBats) + s; }, fmtAvg, { note: 'qualified' })}
    ${leaderBox('Hits', bat, r => r.hits, String)}
    ${leaderBox('Runs', bat, r => r.runs, String)}
    ${leaderBox('Home runs', bat, r => r.homeRuns, String, { extra: oop })}
    ${leaderBox('Walks', bat, r => r.walks, String)}
    ${leaderBox('bWAR', bat, r => r.bwar, v => fmtRate(v, { digits: 2 }))}
    ${leaderBox('Innings', S.pit, r => r.ip, formatIP)}
    ${leaderBox('ERA', qp, r => era(r.runsAllowed, r.ip), v => fmtRate(v), { lower: true, note: 'qualified' })}
    ${streaks}
  </div>
  <p class="cs-note">Qualified: at least ${QUALIFIERS.PA_PER_TEAM_GAME} plate appearances (or innings) per team game. OPS is on-base plus slugging. ${icon('zap')} marks home runs hit out of the park.</p>`;
  $('csLeaders').innerHTML = card('Leaders', html, {
    iconName: 'star', cls: 'cs-wide',
    extra: `<a class="aces-btn is-sm is-ghost" href="season.html?seasonId=${esc(encodeURIComponent(S.id))}&tab=batting">All stats</a>`
  });
}

function renderBadges() {
  const b = S.badges;
  const sum = b?.summary || {};
  const top = (b?.leaderboard || []).slice(0, 5);
  const tier = (n, cls) => (n ? `<span class="cs-tier ${cls}">${icon('medal')}${n}</span>` : '');
  const body = b ? `<div class="aces-stats cs-badge-tiles">
      <div class="aces-stat"><span class="aces-stat-value">${sum.total ?? 0}</span><span class="aces-stat-label">Badges</span></div>
      <div class="aces-stat"><span class="aces-stat-value cs-gold">${sum.gold ?? 0}</span><span class="aces-stat-label">Gold</span></div>
      <div class="aces-stat"><span class="aces-stat-value cs-silver">${sum.silver ?? 0}</span><span class="aces-stat-label">Silver</span></div>
      <div class="aces-stat"><span class="aces-stat-value cs-bronze">${sum.bronze ?? 0}</span><span class="aces-stat-label">Bronze</span></div>
    </div>
    ${top.length ? `<ol class="cs-badge-top">${top.map((p, i) => `<li><span class="cs-lrank">${i + 1}</span>
      <span class="cs-lname"><a href="player.html?name=${esc(encodeURIComponent(p.playerName))}">${esc(p.playerName)}</a></span>
      <span class="cs-tiers">${tier(p.gold, 'cs-gold')}${tier(p.silver, 'cs-silver')}${tier(p.bronze, 'cs-bronze')}</span></li>`).join('')}</ol>` : ''}`
    : empty('No badges yet', 'Badges are worked out once stats are in.', 'medal');
  $('csBadges').innerHTML = card('Trophy case', body, { iconName: 'medal', extra: '<a class="aces-btn is-sm is-ghost" href="trophy-case.html">Trophy case</a>' });
}

// ---------------------------------------------------------------------------
// Share and calendar
// ---------------------------------------------------------------------------

function standingsText() {
  const lines = [`${seasonLabel(S.id)} standings`, ''];
  lines.push(`${'#'.padEnd(3)}${'Team'.padEnd(11)}${'W-L-T'.padEnd(9)}${'PCT'.padEnd(6)}${'GB'.padEnd(5)}Diff`);
  S.standings.forEach(r => lines.push(`${String(r.games ? r.rank : '-').padEnd(3)}${cap(r.team).slice(0, 10).padEnd(11)}${`${r.wins}-${r.losses}-${r.ties}`.padEnd(9)}${(r.games ? fmtAvg(r.winPct) : '-').padEnd(6)}${String(r.gamesBack || '-').padEnd(5)}${r.runDiff > 0 ? '+' : ''}${r.runDiff}`));
  lines.push('', 'acessoftballreference.com');
  return lines.join('\n');
}

function standingsImage() {
  const rows = S.standings;
  const W = 760, rowH = 40, top = 120, H = top + rows.length * rowH + 56;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d');
  x.scale(2, 2);
  const css = getComputedStyle(document.documentElement);
  const brand = css.getPropertyValue('--color-brand').trim() || '#2d5016';
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = brand; x.fillRect(0, 0, W, 72);
  x.fillStyle = '#ffffff';
  x.font = '700 26px Inter, system-ui, sans-serif';
  x.fillText(`${seasonLabel(S.id)} standings`, 24, 46);
  x.font = '600 13px Inter, system-ui, sans-serif';
  x.textAlign = 'right'; x.fillText('acessoftballreference.com', W - 24, 44); x.textAlign = 'left';
  const cols = [['#', 24, 'left'], ['Team', 64, 'left'], ['W', 300, 'right'], ['L', 350, 'right'], ['T', 400, 'right'], ['PCT', 480, 'right'], ['GB', 550, 'right'], ['Diff', 630, 'right'], ['Last 5', W - 24, 'right']];
  x.fillStyle = '#5b6573'; x.font = '700 13px Inter, system-ui, sans-serif';
  cols.forEach(([t, cx, al]) => { x.textAlign = al; x.fillText(t.toUpperCase(), cx, 104); });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2) { x.fillStyle = '#f4f6f2'; x.fillRect(12, y - 4, W - 24, rowH); }
    const vals = [r.games ? String(r.rank) : '-', cap(r.team), String(r.wins), String(r.losses), String(r.ties), r.games ? fmtAvg(r.winPct) : '-', r.gamesBack ? String(r.gamesBack) : '-', `${r.runDiff > 0 ? '+' : ''}${r.runDiff}`, r.last5 || '-'];
    cols.forEach(([, cx, al], j) => {
      x.textAlign = al;
      x.fillStyle = j === 1 ? brand : '#1f2933';
      x.font = `${j === 1 || j === 5 ? 700 : 500} 17px Inter, system-ui, sans-serif`;
      x.fillText(vals[j], cx, y + 22);
    });
  });
  x.textAlign = 'right'; x.fillStyle = '#7b8794'; x.font = '500 12px Inter, system-ui, sans-serif';
  x.fillText(`Through ${formatGameDate(todayKey(), 'monthDay')}`, W - 24, H - 20);
  return c;
}

function openShare() {
  if (!S.standings.length) { showToast('Standings are not ready yet', 'info'); return; }
  return openModal({
    title: 'Share standings',
    html: `<div class="cs-share">
      <button type="button" class="aces-btn is-primary" data-img>${icon('image')}Save as image</button>
      <button type="button" class="aces-btn" data-text>${icon('copy')}Copy as text</button>
    </div>`,
    actions: [{ label: 'Done', value: true, variant: 'secondary' }],
    onOpen: (dialog) => {
      dialog.querySelector('[data-img]').addEventListener('click', async () => {
        const canvas = standingsImage();
        const name = `aces-standings-${todayKey()}.png`;
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = blob && new File([blob], name, { type: 'image/png' });
        if (file && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: `${seasonLabel(S.id)} standings` }); return; } catch (err) { if (err.name === 'AbortError') return; }
        }
        const a = Object.assign(document.createElement('a'), { download: name, href: canvas.toDataURL('image/png') });
        a.click();
        showToast('Image saved', 'success');
      });
      dialog.querySelector('[data-text]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(standingsText()); showToast('Standings copied', 'success'); }
        catch { showToast('Could not copy', 'error'); }
      });
    }
  });
}

function openCalendar() {
  const url = getCalendarUrl();
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  return openModal({
    title: 'Add the league schedule',
    html: `<p>Every league game in your calendar. A subscription updates itself when games move. For one team's games, use the calendar button on that team's page.</p>
      <div class="cs-share">
        <a class="aces-btn is-primary" href="${esc(webcal)}">${icon('calendar')}Subscribe (iPhone, Mac, Outlook)</a>
        <a class="aces-btn" href="${esc(google)}" target="_blank" rel="noopener">${icon('external-link')}Google Calendar</a>
        <a class="aces-btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('download')}Download .ics</a>
        <button type="button" class="aces-btn is-ghost" data-copy>${icon('copy')}Copy link</button>
      </div>`,
    actions: [{ label: 'Done', value: true, variant: 'secondary' }],
    onOpen: (dialog) => dialog.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); showToast('Calendar link copied', 'success'); }
      catch { showToast('Could not copy. Use Download instead.', 'info'); }
    })
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Standings' });
  try {
    await load();
    renderHead();
    renderNumbers();
    renderStandings();
    renderGames();
    renderLeaders();
    renderBadges();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-share]')) openShare();
      if (e.target.closest('[data-calendar]')) openCalendar();
    });
    pageReady();
  } catch (err) {
    showPageError(err, { message: 'Could not load the season. Try again in a moment.' });
  }
}

main();
