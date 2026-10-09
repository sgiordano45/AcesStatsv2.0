// js/pages/game-preview.js
// game-preview.html: one upcoming game.
//
//   Matchup         both teams with record and place, date, time, countdown,
//                   Peter's money line with implied win chances
//   Peter's Preview the write-up on the game doc (preview, homeOdds, awayOdds)
//   Tale of the tape this season side by side: record, runs for and against,
//                   team AVG / OBP / ERA, last five
//   Head to head    all-time series, this season, playoffs, last meeting, and
//                   every previous meeting
//   Players to watch three per team: best OBP against this opponent (2+ games),
//                   else this season's AcesBPI (2 AB per team game), else
//                   career AcesBPI (20+ AB)
//
// URL: game-preview.html?gameId=abc123[&seasonId=2026-fall]
//      game-preview.html?home=Teal&away=Army&date=2026-10-11  (also 10/11/2026)
// A game that already has a result points to its recap.

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { escapeHtml as esc, fmtAvg, fmtRate, ordinal } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import {
  cap, teamDot, teamLogo, teamHref, gameHref, moneyLine, fmtLine, previewParagraphs,
  loadAllSeasonGames, meetings, seriesRecord, recordText
} from '../ui/game-shared.js';
import { computeStandings, isDecided } from '../domain/standings.js';
import { formatGameDate, formatTime, todayKey, toDateKey, daysBetween } from '../domain/dates.js';
import { era } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const lower = (s) => String(s || '').toLowerCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const SPLITS_2025 = 'aggregatedPlayerStats2025Splits';
const HISTORY_SHOWN = 8;

const G = { game: null, seasonId: '', home: '', away: '', dateKey: '', all: [], season: [], standings: [], players: [], bat: [], pit: [] };

// ---------------------------------------------------------------------------
// Find the game
// ---------------------------------------------------------------------------

function findGame(q, displayId) {
  const gameId = q.get('gameId');
  const want = parseStatSeasonId(q.get('seasonId') || '').id || displayId;
  const bySeason = (list) => [...list].sort((a, b) => (a.seasonId === want ? -1 : b.seasonId === want ? 1 : seasonSortKey(b.seasonId) - seasonSortKey(a.seasonId)));
  if (gameId) return bySeason(G.all.filter(g => g.id === gameId))[0] || null;
  const home = lower(q.get('home')), away = lower(q.get('away')), dk = toDateKey(q.get('date') || '');
  if (!home || !away) return null;
  const list = G.all.filter(g => lower(g.home) === home && lower(g.away) === away);
  return bySeason(list.filter(g => !dk || g.dateKey === dk))[0] || null;
}

// ---------------------------------------------------------------------------
// Players to watch
// ---------------------------------------------------------------------------

async function loadRoster(team) {
  try {
    const snap = await getDoc(doc(db, 'rosters', `${G.seasonId}-${lower(team)}`));
    return snap.exists() ? (snap.data().players || []).filter(p => p && p.name) : [];
  } catch { return []; }
}

const playerDoc = (rp) => G.players.find(p => [p.id, p.userId, p.playerId].some(id => id && (id === rp.authId || id === rp.id)))
  || G.players.find(p => norm(p.name) === norm(rp.name)) || null;

/** Batting against an opponent across seasons: 2025 splits doc plus 2026-on season splits. */
async function vsOpponent(rp, pdoc, opponent) {
  const total = { games: 0, atBats: 0, hits: 0, walks: 0, runs: 0 };
  const add = (s) => { if (!s) return; ['games', 'atBats', 'hits', 'walks', 'runs'].forEach(k => { total[k] += Number(s[k]) || 0; }); };
  const pick = (vs) => Object.entries(vs || {}).find(([k]) => lower(k) === lower(opponent))?.[1];
  const covered = new Set();
  if (rp.id) {
    try {
      const snap = await getDoc(doc(db, SPLITS_2025, rp.id));
      Object.entries(snap.exists() ? snap.data().seasons || {} : {}).forEach(([key, s]) => {
        covered.add(String(key).split('-').slice(0, 2).join('-'));
        add(pick(s?.vsOpponent));
      });
    } catch { /* optional */ }
  }
  Object.entries(pdoc?.seasons || {}).forEach(([key, s]) => {
    if (covered.has(String(key).split('-').slice(0, 2).join('-'))) return;
    add(pick(s?.vsOpponent));
  });
  return total.games ? total : null;
}

async function playersToWatch(team, opponent) {
  const roster = await loadRoster(team);
  const teamGames = G.season.filter(g => isDecided(g) && (lower(g.home) === lower(team) || lower(g.away) === lower(team))).length;
  const list = await Promise.all(roster.map(async (rp) => {
    const pdoc = playerDoc(rp);
    const season = G.bat.find(r => !r.sub && lower(r.team) === lower(team) && (r.ids.includes(rp.authId) || r.ids.includes(rp.id) || norm(r.name) === norm(rp.name))) || null;
    const career = pdoc?.career && typeof pdoc.career.acesBPI === 'number' ? { bpi: pdoc.career.acesBPI, atBats: Number(pdoc.career.atBats) || 0 } : null;
    return { name: rp.name, number: rp.number || '', href: rp.authId ? `player.html?id=${encodeURIComponent(rp.authId)}` : pdoc ? `player.html?id=${encodeURIComponent(pdoc.id)}` : `player.html?name=${encodeURIComponent(rp.name)}`,
      season, career, vs: await vsOpponent(rp, pdoc, opponent) };
  }));
  const obp = (s) => (s.atBats + s.walks ? (s.hits + s.walks) / (s.atBats + s.walks) : 0);
  const vs = list.filter(p => p.vs && p.vs.games >= 2).sort((a, b) => obp(b.vs) - obp(a.vs)).slice(0, 3);
  if (vs.length) return { why: `Best on-base against ${cap(opponent)}`, players: vs };
  const minAB = teamGames * 2;
  const season = list.filter(p => p.season && typeof p.season.acesBPI === 'number' && p.season.atBats >= minAB && p.season.atBats > 0)
    .sort((a, b) => b.season.acesBPI - a.season.acesBPI).slice(0, 3);
  if (season.length) return { why: 'Top AcesBPI this season', players: season };
  const career = list.filter(p => p.career && p.career.atBats >= 20).sort((a, b) => b.career.bpi - a.career.bpi).slice(0, 3);
  return { why: career.length ? 'Top career AcesBPI' : '', players: career };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const teamRow = (team) => G.standings.find(r => lower(r.team) === lower(team)) || null;

function renderHead() {
  $('gpTitle').innerHTML = `${esc(cap(G.away))} <span>at</span> ${esc(cap(G.home))}`;
  const g = G.game;
  const bits = [
    G.dateKey ? formatGameDate(G.dateKey, 'long') : 'Date to be set',
    g?.time ? formatTime(g.time) : '',
    g?.type === 'playoff' ? (g.round ? `Playoffs, ${cap(g.round)}` : 'Playoffs') : 'Regular season'
  ].filter(Boolean);
  $('gpMeta').textContent = bits.join(' · ');
  document.title = `${cap(G.away)} at ${cap(G.home)} - Game Preview - Mountainside Aces`;
}

function sideHtml(team, which, line) {
  const r = teamRow(team);
  const rec = r && r.games ? `${recordText(r)} · ${ordinal(r.rank)}` : 'No games yet';
  const odds = line ? `<span class="gp-line${line.favorite === which ? ' is-fav' : ''}">${esc(fmtLine(line[which]))}</span>` : '';
  return `<a class="gp-side is-${which}" href="${esc(teamHref(team))}">
    ${teamLogo(team) || teamDot(team, { lg: true })}
    <span class="gp-team">${esc(cap(team))}</span>
    <span class="gp-rec">${esc(rec)}</span>
    <span class="gp-ha">${which === 'home' ? 'Home' : 'Away'}</span>${odds}
  </a>`;
}

function countdown() {
  const g = G.game;
  if (g && isDecided(g)) {
    return `<a class="gp-final" href="${esc(gameHref(g, G.seasonId))}"><span>Final</span><strong>${g.hasScores ? `${g.awayScore}-${g.homeScore}` : esc(g.winner || '')}</strong><em>Recap${icon('chevron-right')}</em></a>`;
  }
  if (!G.dateKey) return '<div class="gp-when"><strong>TBD</strong></div>';
  const days = daysBetween(todayKey(), G.dateKey);
  const big = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 ? `${days} days` : 'Awaiting result';
  return `<div class="gp-when${days === 0 ? ' is-today' : ''}"><strong>${esc(big)}</strong>${g?.time ? `<span>${esc(formatTime(g.time))}</span>` : ''}</div>`;
}

function renderMatchup() {
  const raw = G.game?.raw || {};
  const line = moneyLine(raw.homeOdds, raw.awayOdds);
  const bar = line ? `<div class="gp-odds" aria-label="Implied win chance: ${esc(cap(G.away))} ${line.awayPct}%, ${esc(cap(G.home))} ${line.homePct}%">
      <div class="gp-odds-bar"><span class="is-away" style="--w:${line.awayPct}%"${teamColor(G.away)}></span><span class="is-home" style="--w:${line.homePct}%"${teamColor(G.home)}></span></div>
      <div class="gp-odds-labels"><span>${line.awayPct}%</span><small>Peter's line, implied win chance</small><span>${line.homePct}%</span></div>
    </div>` : '';
  $('gpMatchup').innerHTML = `<section class="aces-card gp-matchup">
    <div class="gp-sides">${sideHtml(G.away, 'away', line)}<div class="gp-mid"><span class="gp-at">@</span>${countdown()}</div>${sideHtml(G.home, 'home', line)}</div>
    ${bar}
  </section>`;
}

function teamColor(team) { const k = lower(team); return ` data-team-color="${esc(k)}"`; }

function renderPeter() {
  const text = G.game?.raw?.preview;
  if (!text || !String(text).trim()) { $('gpPeter').hidden = true; return; }
  $('gpPeter').innerHTML = `<section class="aces-card gp-peter">
    <div class="gp-peter-head"><img src="logos/peterpreview.png" alt="" data-peter><div><h2>Peter's Preview</h2><span>${esc(cap(G.away))} at ${esc(cap(G.home))}</span></div></div>
    <div class="gp-peter-text">${previewParagraphs(text)}</div>
  </section>`;
}

function teamTotals(team) {
  const bat = G.bat.filter(r => lower(r.team) === lower(team));
  const pit = G.pit.filter(r => lower(r.team) === lower(team));
  const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const ab = sum(bat, 'atBats'), h = sum(bat, 'hits'), bb = sum(bat, 'walks');
  const ip = sum(pit, 'ip'), ra = sum(pit, 'runsAllowed');
  const r = teamRow(team);
  return {
    r, avg: ab ? h / ab : null, obp: ab + bb ? (h + bb) / (ab + bb) : null, era: ip ? era(ra, ip) : null, ip,
    rpg: r && r.games ? r.runsFor / r.games : null, rapg: r && r.games ? r.runsAgainst / r.games : null,
    pct: r && r.games ? r.winPct : null, diff: r && r.games ? r.runDiff : null
  };
}

function formDots(r) {
  const recent = [...(r?.history || [])].sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0)).slice(0, 5).reverse();
  if (!recent.length) return '<span class="gp-dim">-</span>';
  return `<span class="gp-form">${recent.map(x => `<i class="is-${x.result.toLowerCase()}">${x.result}</i>`).join('')}</span>`;
}

function renderTape() {
  const a = teamTotals(G.away), h = teamTotals(G.home);
  if (!a.r?.games && !h.r?.games && a.avg === null && h.avg === null) {
    $('gpTape').innerHTML = `<section class="aces-card"><div class="aces-card-head"><h2 class="aces-card-title">${icon('scale')}Tale of the tape</h2></div>
      <div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games yet this season</p><p>Season numbers show up after the first week.</p></div></section>`;
    return;
  }
  // [label, away, home, formatter, lowerIsBetter]
  const rows = [
    ['Win %', a.pct, h.pct, v => fmtAvg(v), false],
    ['Runs per game', a.rpg, h.rpg, v => fmtRate(v, { digits: 1 }), false],
    ['Allowed per game', a.rapg, h.rapg, v => fmtRate(v, { digits: 1 }), true],
    ['Run diff', a.diff, h.diff, v => `${v > 0 ? '+' : ''}${v}`, false],
    ['Team AVG', a.avg, h.avg, v => fmtAvg(v), false],
    ['Team OBP', a.obp, h.obp, v => fmtAvg(v), false],
    ['Team ERA', a.era, h.era, v => fmtRate(v), true]
  ];
  const cell = (v, other, fmt, low, side) => {
    const has = v !== null && v !== undefined && Number.isFinite(v);
    const best = has && other !== null && other !== undefined && Number.isFinite(other) && (low ? v < other : v > other);
    return `<td class="is-${side}${best ? ' is-best' : ''}">${has ? esc(fmt(v)) : '-'}</td>`;
  };
  const body = rows.map(([label, av, hv, fmt, low]) => `<tr>${cell(av, hv, fmt, low, 'away')}<th scope="row">${esc(label)}</th>${cell(hv, av, fmt, low, 'home')}</tr>`).join('');
  $('gpTape').innerHTML = `<section class="aces-card gp-tape">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('scale')}Tale of the tape</h2><span class="aces-badge is-outline">${esc(seasonLabel(G.seasonId))}</span></div>
    <table class="gp-tape-table">
      <thead><tr><th scope="col" class="is-away">${teamDot(G.away)}${esc(cap(G.away))}</th><th></th><th scope="col" class="is-home">${esc(cap(G.home))}${teamDot(G.home)}</th></tr></thead>
      <tbody>${body}<tr><td class="is-away">${formDots(a.r)}</td><th scope="row">Last 5</th><td class="is-home">${formDots(h.r)}</td></tr></tbody>
    </table>
    <p class="gp-note">The better side of each row is bold. ERA is runs allowed per 7 innings.</p>
  </section>`;
}

function renderH2H() {
  const all = meetings(G.all.filter(g => !(G.game && g.id === G.game.id && g.seasonId === G.game.seasonId)), G.away, G.home);
  const head = `<div class="aces-card-head"><h2 class="aces-card-title">${icon('swords')}Head to head</h2>${all.length ? `<span class="aces-badge is-outline">${plural(all.length, 'meeting')}</span>` : ''}</div>`;
  if (!all.length) {
    $('gpH2H').innerHTML = `<section class="aces-card">${head}<div class="aces-empty">${icon('swords')}<p class="aces-empty-title">First meeting</p><p>These teams haven't played each other before.</p></div></section>`;
    return;
  }
  const series = (list) => {
    const r = seriesRecord(list, G.away);
    if (!list.length) return '-';
    if (r.wins === r.losses) return `Tied ${recordText(r)}`;
    return `${cap(r.wins > r.losses ? G.away : G.home)} ${r.wins > r.losses ? recordText(r) : recordText({ wins: r.losses, losses: r.wins, ties: r.ties })}`;
  };
  const thisSeason = all.filter(g => g.seasonId === G.seasonId);
  const po = all.filter(g => g.type === 'playoff');
  const last = all[0];
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${meta}</span>` : ''}</div>`;
  const lastLine = last ? `${esc(cap(last.result === 'tie' ? 'Tie' : last.result === 'home' ? last.home : last.away))}${last.result === 'tie' ? '' : ' won'}${last.hasScores ? ` ${Math.max(last.homeScore, last.awayScore)}-${Math.min(last.homeScore, last.awayScore)}` : ''}` : '';
  const row = (g) => {
    const side = (team, score, which) => `<span class="gp-h-side gp-h-${which}${g.result === which ? ' is-win' : g.result && g.result !== 'tie' ? ' is-loss' : ''}">${teamDot(team)}${esc(cap(team))}${g.hasScores ? `<b>${score}</b>` : ''}</span>`;
    return `<li><a class="gp-h-row" href="${esc(gameHref(g, g.seasonId))}">
      <span class="gp-h-date"><b>${esc(g.dateKey ? formatGameDate(g.dateKey, 'monthDay') : '-')}</b><small>${esc(seasonLabel(g.seasonId))}</small></span>
      ${side(g.away, g.awayScore, 'away')}<span class="gp-h-at">@</span>${side(g.home, g.homeScore, 'home')}
      ${g.type === 'playoff' ? `<span class="aces-badge is-accent">${esc(g.round ? cap(g.round) : 'Playoff')}</span>` : '<span></span>'}${icon('chevron-right')}</a></li>`;
  };
  $('gpH2H').innerHTML = `<section class="aces-card gp-h2h">${head}
    <div class="aces-stats gp-h2h-stats">
      ${tile(series(all), 'All-time series')}
      ${tile(thisSeason.length ? series(thisSeason) : '-', 'This season', thisSeason.length ? '' : 'no meetings yet')}
      ${tile(po.length ? series(po) : '-', 'Playoffs', po.length ? plural(po.length, 'game') : 'never met')}
      ${tile(last.dateKey ? formatGameDate(last.dateKey, 'monthDay') : '-', 'Last meeting', `${lastLine}${last.seasonId ? ` &middot; ${esc(seasonLabel(last.seasonId))}` : ''}`)}
    </div>
    <ul class="gp-h-list">${all.map((g, i) => row(g).replace('<li>', i >= HISTORY_SHOWN ? '<li hidden data-more>' : '<li>')).join('')}</ul>
    ${all.length > HISTORY_SHOWN ? `<button type="button" class="aces-btn is-sm is-ghost gp-more" data-show-all>Show all ${all.length} meetings</button>` : ''}
  </section>`;
}

function playerCard(p, opponent) {
  const s = p.season, c = p.career, v = p.vs;
  const line = (label, cells) => `<div class="gp-p-line"><span class="gp-p-label">${esc(label)}</span>${cells.map(([k, val]) => `<span><b>${esc(val)}</b><small>${k}</small></span>`).join('')}</div>`;
  const parts = [];
  if (v && v.games >= 2) parts.push(line(`vs ${cap(opponent)}`, [['G', v.games], ['AVG', fmtAvg(v.atBats ? v.hits / v.atBats : null)], ['OBP', fmtAvg(v.atBats + v.walks ? (v.hits + v.walks) / (v.atBats + v.walks) : null)]]));
  if (s && s.atBats > 0) parts.push(line('Season', [['AVG', fmtAvg(s.hits / s.atBats)], ['H', s.hits], ['R', s.runs], ['BPI', s.acesBPI === null ? '-' : fmtRate(s.acesBPI, { digits: 1 })]]));
  if (c && c.atBats >= 20) parts.push(line('Career', [['BPI', fmtRate(c.bpi, { digits: 1 })], ['AB', c.atBats]]));
  return `<li class="gp-player"><a href="${esc(p.href)}"><strong>${esc(p.name)}</strong>${p.number ? `<span>#${esc(p.number)}</span>` : ''}</a>
    ${parts.join('') || '<p class="gp-dim">No stats yet</p>'}</li>`;
}

async function renderPlayers() {
  const [away, home] = await Promise.all([playersToWatch(G.away, G.home), playersToWatch(G.home, G.away)]);
  const col = (team, opp, res) => `<div class="gp-pcol">
    <h3>${teamDot(team)}${esc(cap(team))}</h3>${res.why ? `<p class="gp-why">${esc(res.why)}</p>` : ''}
    ${res.players.length ? `<ul>${res.players.map(p => playerCard(p, opp)).join('')}</ul>` : '<p class="gp-dim">No roster or stats yet.</p>'}
  </div>`;
  $('gpPlayers').innerHTML = `<section class="aces-card gp-players">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('star')}Players to watch</h2></div>
    <div class="gp-pcols">${col(G.away, G.home, away)}${col(G.home, G.away, home)}</div>
  </section>`;
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Game Preview' });
  const q = new URLSearchParams(location.search);
  if (!q.get('gameId') && !(q.get('home') && q.get('away'))) {
    pageReady();
    showPageState({ title: 'Pick a game', message: 'Open a preview from the schedule.', actions: [{ label: 'Schedule', href: siteUrl('schedule.html'), primary: true }] });
    return;
  }
  const [displayId, { games }, players] = await Promise.all([
    getDisplaySeasonId().catch(() => ''),
    loadAllSeasonGames(),
    getAllPlayerStatsOptimized().catch(() => [])
  ]);
  G.all = games;
  G.players = players || [];
  G.game = findGame(q, displayId);
  if (!G.game && q.get('gameId')) {
    pageReady();
    showPageState({ title: 'Game not found', message: "That game isn't on any schedule.", actions: [{ label: 'Schedule', href: siteUrl('schedule.html'), primary: true }] });
    return;
  }
  G.seasonId = G.game?.seasonId || parseStatSeasonId(q.get('seasonId') || '').id || displayId;
  G.home = G.game?.home || cap(q.get('home'));
  G.away = G.game?.away || cap(q.get('away'));
  G.dateKey = G.game?.dateKey || toDateKey(q.get('date') || '');
  G.season = G.all.filter(g => g.seasonId === G.seasonId);
  G.standings = computeStandings(G.season, { includeScheduled: true });
  G.bat = buildBattingRows(G.players).filter(r => r.seasonId === G.seasonId);
  G.pit = buildPitchingRows(G.players).filter(r => r.seasonId === G.seasonId);

  renderHead();
  renderMatchup();
  renderPeter();
  renderTape();
  renderH2H();
  $('gpPlayers').innerHTML = `<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></section>`;
  document.addEventListener('click', (e) => {
    const more = e.target.closest('[data-show-all]');
    if (!more) return;
    document.querySelectorAll('[data-more]').forEach(li => { li.hidden = false; });
    more.remove();
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-logo]')) e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'gp-logo-gap' }));
    if (e.target.matches?.('[data-peter]')) e.target.remove();
  }, true);
  pageReady();
  renderPlayers().catch((err) => {
    console.warn('[preview] players to watch unavailable', err);
    $('gpPlayers').innerHTML = '';
  });
}

main().catch((err) => { pageReady(); showPageError(err); });
