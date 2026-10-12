// js/pages/champions.js
// champions.html: every Aces champion, one season at a time. The season view
// shows the champion (regular-season record and finish, playoff record,
// runner-up, team photo), the final, the whole playoff run round by round
// (this replaced playoff-history.html), the champion's top hitters, pitching
// staff and roster, badges earned, and their regular season game by game.
// The all-time list and title counts sit underneath.
//
// URL: champions.html?seasonId=2025-fall (?season= also works).
// Data: champions and runnerUps (titles), seasons/{id}/games, the season's
// playoffs/bracket doc (link to playoffs.html when there is one),
// aggregatedPlayerStats, teamPhotos (champs == true), playerBadges ({season}_*).

import { initPage, pageReady, showPageState, showPageError } from '../core/app.js';
import { getSeasons } from '../core/config.js';
import { db, collection, doc, getDoc, getDocs, query, where, documentId } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, ordinal, playerUrl } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, computeStandings } from '../domain/standings.js';
import { battingLine, era, minPAForTeamGames } from '../domain/stats.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';
import { formatGameDate } from '../domain/dates.js';

const $ = (id) => document.getElementById(id);
// Keep a stored name's own capitals ("Sofa Kings"); title-case all-lowercase ones.
const cap = (s) => { const t = String(s || '').trim(); return /[A-Z]/.test(t) ? t : t.replace(/(^|[\s_])[a-z]/g, (c) => c.toUpperCase()).replace(/_/g, ' '); };
// Team names are matched loosely ("Master Batters", "master_batters", "masterbatters").
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const STAR_MIN_AB = 24;   // the old page's floor when a season has no team games to go by

const S = {
  titles: {},        // seasonId -> { champion, runnerUp, mvp }
  seasons: [],       // champion seasons, newest first
  sid: '',
  players: null,     // aggregatedPlayerStats (loaded once)
  cache: new Map()   // seasonId -> season data
};

function chip(team, { lg = false } = {}) {
  if (!team) return '<span class="ch-dim">-</span>';
  const name = cap(team);
  const k = name.toLowerCase();
  return `<a class="aces-team-chip${lg ? ' is-lg' : ''}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: name }).toString())}"><span class="aces-team-dot"></span>${esc(name)}</a>`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadTitles() {
  const [champs, runners] = await Promise.all([
    getDocs(collection(db, 'champions')),
    getDocs(collection(db, 'runnerUps')).catch(() => ({ docs: [] }))
  ]);
  const out = {};
  champs.docs.forEach((d) => {
    const v = d.data();
    const sid = parseStatSeasonId(v.seasonId || d.id).id || d.id;
    out[sid] = { champion: v.team || '', runnerUp: v.runnerUp || '', mvp: v.mvp || '' };
  });
  runners.docs.forEach((d) => {
    const v = d.data();
    const sid = parseStatSeasonId(v.seasonId || d.id).id || d.id;
    if (out[sid] && !out[sid].runnerUp) out[sid].runnerUp = v.runnerUp || '';
  });
  return out;
}

async function teamPhoto(sid) {
  try {
    const snap = await getDocs(query(collection(db, 'teamPhotos'), where('champs', '==', true), where('seasonId', '==', sid)));
    const p = snap.docs[0]?.data();
    return p?.url ? { url: p.url, name: p.name || '' } : null;
  } catch { return null; }
}

async function seasonBadges(sid) {
  try {
    const snap = await getDocs(query(collection(db, 'playerBadges'),
      where(documentId(), '>=', `${sid}_`), where(documentId(), '<', `${sid}_\uf8ff`)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function hasBracket(sid) {
  try { return (await getDoc(doc(db, 'seasons', sid, 'playoffs', 'bracket'))).exists(); } catch { return false; }
}

async function loadSeason(sid) {
  if (S.cache.has(sid)) return S.cache.get(sid);
  S.players ??= getAllPlayerStatsOptimized().catch(() => []);
  const [raw, players, photo, badges, bracket] = await Promise.all([
    getSeasonGames(sid).catch(() => []), S.players, teamPhoto(sid), seasonBadges(sid), hasBracket(sid)
  ]);
  const data = { games: normalizeGames(raw), players: players || [], photo, badges, bracket };
  S.cache.set(sid, data);
  return data;
}

// ---------------------------------------------------------------------------
// Season pieces
// ---------------------------------------------------------------------------

const isFinalRound = (round) => /champ|final/i.test(round) && !/semi|winners|losers|wb|lb/i.test(round);
const sideOf = (g, team) => (norm(g.home) === norm(team) ? 'home' : norm(g.away) === norm(team) ? 'away' : '');

function playoffRounds(games) {
  const playoff = games.filter((g) => g.type === 'playoff');
  const byRound = new Map();
  for (const g of playoff) {
    const r = g.round || 'Playoffs';
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(g);
  }
  const first = (list) => list.reduce((m, g) => (g.dateKey && (!m || g.dateKey < m) ? g.dateKey : m), '');
  return [...byRound].map(([round, list]) => ({
    round,
    final: isFinalRound(round),
    start: first(list),
    games: list.sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || '') || String(a.id).localeCompare(String(b.id)))
  })).sort((a, b) => (a.final - b.final) || (a.start || '9').localeCompare(b.start || '9') || a.round.localeCompare(b.round));
}

function playoffRecord(games, team) {
  let w = 0; let l = 0;
  for (const g of games) {
    if (g.type !== 'playoff' || !g.hasScores) continue;
    const side = sideOf(g, team);
    if (!side) continue;
    const mine = side === 'home' ? g.homeScore : g.awayScore;
    const theirs = side === 'home' ? g.awayScore : g.homeScore;
    if (mine > theirs) w += 1; else if (theirs > mine) l += 1;
  }
  return { w, l };
}

function gameLine(g, champ) {
  const done = g.hasScores;
  const homeWon = done && g.homeScore > g.awayScore;
  const awayWon = done && g.awayScore > g.homeScore;
  const mine = sideOf(g, champ);
  const team = (name, score, won) => `<span class="ch-g-team${won ? ' is-won' : ''}"><span class="ch-g-name">${esc(cap(name) || 'TBD')}</span><b>${done ? esc(score) : ''}</b></span>`;
  return `<li class="ch-g${mine ? ' is-champ' : ''}">
    <span class="ch-g-date">${g.dateKey ? esc(formatGameDate(g.dateKey, 'short')) : ''}</span>
    ${team(g.away, g.awayScore, awayWon)}
    ${team(g.home, g.homeScore, homeWon)}
  </li>`;
}

function heroHtml(sid, title, data) {
  const champ = title.champion;
  const k = cap(champ).toLowerCase();
  const standings = computeStandings(data.games, { extras: false });
  const row = standings.find((r) => norm(r.team) === norm(champ));
  const po = playoffRecord(data.games, champ);
  const rounds = playoffRounds(data.games);
  const finals = rounds.filter((r) => r.final).flatMap((r) => r.games).filter((g) => g.hasScores);
  const runnerUp = title.runnerUp || (() => {
    const last = finals[finals.length - 1];
    if (!last) return '';
    return sideOf(last, champ) === 'home' ? last.away : sideOf(last, champ) === 'away' ? last.home : '';
  })();
  const facts = [
    row ? `<div><dt>${icon('list')}Regular season</dt><dd><b>${esc(recordText(row))}</b> <small>${esc(ordinal(row.rank))} of ${standings.length}</small></dd></div>` : '',
    po.w + po.l ? `<div><dt>${icon('trophy')}Playoffs</dt><dd><b>${po.w}-${po.l}</b></dd></div>` : '',
    runnerUp ? `<div><dt>${icon('medal')}Runner-up</dt><dd>${chip(runnerUp)}</dd></div>` : ''
  ].join('');
  return `<section class="aces-card ch-hero"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>
    <div class="ch-hero-main">
      <span class="ch-hero-kicker">${icon('crown')}${esc(seasonLabel(sid))} champions</span>
      <h2 class="ch-hero-team"><a href="team.html?${esc(new URLSearchParams({ team: cap(champ), season: sid }).toString())}">${esc(cap(champ))}</a></h2>
      <dl class="ch-facts">${facts}</dl>
    </div>
    ${data.photo ? `<figure class="ch-photo"><img src="${esc(data.photo.url)}" alt="${esc(data.photo.name || `${cap(champ)}, ${seasonLabel(sid)} champions`)}" loading="lazy">${data.photo.name ? `<figcaption>${esc(data.photo.name)}</figcaption>` : ''}</figure>` : ''}
  </section>`;
}

function finalHtml(sid, title, data) {
  const finals = playoffRounds(data.games).filter((r) => r.final);
  const games = finals.flatMap((r) => r.games).filter((g) => g.hasScores);
  if (!games.length) return '';
  return `<section class="aces-card ch-final">
    <h2 class="ch-h">${icon('flag')}The final</h2>
    <ol class="ch-final-list">${games.map((g, i) => {
      const hw = g.homeScore > g.awayScore;
      const side = (name, score, won) => `<div class="ch-f-side${won ? ' is-won' : ''}">
        <span class="ch-f-name">${esc(cap(name))}</span><span class="ch-f-score">${esc(score)}</span>
        ${won && i === games.length - 1 ? `<span class="aces-badge is-accent">${icon('trophy')}Champion</span>` : ''}</div>`;
      return `<li>
        ${games.length > 1 ? `<span class="ch-f-label">Game ${i + 1}${g.dateKey ? ` &middot; ${esc(formatGameDate(g.dateKey, 'short'))}` : ''}</span>` : g.dateKey ? `<span class="ch-f-label">${esc(formatGameDate(g.dateKey, 'long'))}</span>` : ''}
        <div class="ch-f-match">${side(g.away, g.awayScore, !hw && g.awayScore !== g.homeScore)}<span class="ch-f-vs">vs</span>${side(g.home, g.homeScore, hw)}</div>
      </li>`;
    }).join('')}</ol>
  </section>`;
}

function runHtml(sid, title, data) {
  const rounds = playoffRounds(data.games);
  if (!rounds.length) return '';
  return `<section class="aces-card ch-run">
    <div class="ch-h-row">
      <h2 class="ch-h">${icon('trophy')}Playoffs</h2>
      ${data.bracket ? `<a class="aces-btn is-sm is-ghost" href="playoffs.html?seasonId=${esc(encodeURIComponent(sid))}">${icon('grid')}Bracket</a>` : ''}
    </div>
    <p class="ch-note">Every playoff game, round by round. ${esc(cap(title.champion))} games are highlighted.</p>
    <div class="ch-rounds">${rounds.map((r) => `<div class="ch-round${r.final ? ' is-final' : ''}">
      <h3>${esc(r.round)} <small>${r.games.length} game${r.games.length === 1 ? '' : 's'}</small></h3>
      <ul class="ch-games">${r.games.map((g) => gameLine(g, title.champion)).join('')}</ul>
    </div>`).join('')}</div>
  </section>`;
}

function teamRows(sid, champ, data) {
  const key = norm(champ);
  const bat = buildBattingRows(data.players).filter((r) => r.seasonId === sid && !r.sub && norm(r.team) === key);
  const pit = buildPitchingRows(data.players).filter((r) => r.seasonId === sid && !r.sub && norm(r.team) === key);
  return { bat, pit };
}

function teamGames(data, champ) {
  return data.games.filter((g) => g.type === 'regular' && g.hasScores && sideOf(g, champ)).length;
}

function starsHtml(sid, title, data, { bat, pit }) {
  if (!bat.length && !pit.length) return '';
  const tg = teamGames(data, title.champion);
  const minPA = tg ? minPAForTeamGames(tg) : 0;
  const lineOf = (r) => battingLine(r);
  const eligible = bat.filter((r) => (minPA ? lineOf(r).pa >= minPA : r.atBats >= STAR_MIN_AB));
  let stars = [...eligible].sort((a, b) => (b.acesBPI ?? -99) - (a.acesBPI ?? -99) || b.hits - a.hits).slice(0, 3);
  const mvp = title.mvp ? bat.find((r) => r.ids.includes(title.mvp) || norm(r.name) === norm(title.mvp)) : null;
  if (mvp) stars = [mvp, ...stars.filter((r) => r !== mvp)].slice(0, 3);

  const card = (r, i) => {
    const l = lineOf(r);
    return `<li class="ch-star">
      <span class="ch-star-rank">${i + 1}</span>
      <div class="ch-star-body">
        <a class="ch-star-name" href="${esc(playerUrl(r))}">${esc(r.name)}</a>${r === mvp ? ' <span class="aces-badge is-accent">MVP</span>' : ''}
        <span class="ch-star-line"><b>${esc(fmtAvg(l.avg))}</b> AVG &middot; <b>${r.hits}</b> H &middot; <b>${r.runs}</b> R${r.acesBPI !== null ? ` &middot; <b>${esc(fmtRate(r.acesBPI))}</b> BPI` : ''}</span>
      </div>
    </li>`;
  };
  const pitchers = [...pit].filter((r) => r.ip > 0).sort((a, b) => b.ip - a.ip);
  return `<div class="ch-two">
    ${stars.length ? `<section class="aces-card">
      <h2 class="ch-h">${icon('star')}Top hitters</h2>
      <ol class="ch-stars">${stars.map(card).join('')}</ol>
      <p class="ch-note">By Aces BPI${minPA ? `, ${minPA}+ plate appearances` : ''}.${title.mvp ? ' MVP first.' : ''}</p>
    </section>` : ''}
    ${pitchers.length ? `<section class="aces-card">
      <h2 class="ch-h">${icon('target')}Pitching</h2>
      <ul class="ch-pitchers">${pitchers.map((r) => `<li>
        <a href="${esc(playerUrl(r))}">${esc(r.name)}</a>
        <span><b>${esc(formatIP(r.ip))}</b> IP &middot; <b>${esc(fmtRate(era(r.runsAllowed, r.ip)))}</b> ERA &middot; ${r.games} G</span>
      </li>`).join('')}</ul>
    </section>` : ''}
  </div>`;
}

function rosterHtml(sid, title, { bat }) {
  if (!bat.length) return '';
  const rows = [...bat].sort((a, b) => (b.acesBPI ?? -99) - (a.acesBPI ?? -99) || b.hits - a.hits || a.name.localeCompare(b.name));
  return `<section class="aces-card ch-roster">
    <div class="ch-h-row">
      <h2 class="ch-h">${icon('users')}Roster</h2>
      <a class="aces-btn is-sm is-ghost" href="team.html?${esc(new URLSearchParams({ team: cap(title.champion), season: sid }).toString())}">${icon('table')}Full stats</a>
    </div>
    <div class="aces-table-wrap"><table class="aces-table is-compact ch-table">
      <thead><tr><th scope="col">Player</th><th scope="col">G</th><th scope="col">AB</th><th scope="col">H</th><th scope="col">R</th><th scope="col">BB</th><th scope="col">AVG</th><th scope="col">OBP</th><th scope="col">BPI</th></tr></thead>
      <tbody>${rows.map((r) => { const l = battingLine(r); return `<tr>
        <th scope="row"><a href="${esc(playerUrl(r))}">${esc(r.name)}</a></th>
        <td>${r.games}</td><td>${r.atBats}</td><td>${r.hits}</td><td>${r.runs}</td><td>${r.walks}</td>
        <td>${esc(fmtAvg(l.avg))}</td><td>${esc(fmtAvg(l.obp))}</td><td>${r.acesBPI === null ? '-' : esc(fmtRate(r.acesBPI))}</td>
      </tr>`; }).join('')}</tbody>
    </table></div>
  </section>`;
}

const TIERS = ['platinum', 'gold', 'silver', 'bronze'];

function badgesHtml(sid, title, data) {
  const key = norm(title.champion);
  const players = data.badges
    .filter((p) => norm(p.teamId || p.team) === key)
    .map((p) => ({
      name: p.playerName || p.name || '',
      id: p.playerId || p.legacyId || '',
      badges: Object.entries(p.earned || {}).filter(([, b]) => b && !b.hidden)
        .map(([id, b]) => ({ id, name: b.name || id, tier: TIERS.includes(b.tier) ? b.tier : '', description: b.description || '' }))
        .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
    }))
    .filter((p) => p.badges.length)
    .sort((a, b) => b.badges.length - a.badges.length || a.name.localeCompare(b.name));
  if (!players.length) return '';
  const counts = {};
  players.forEach((p) => p.badges.forEach((b) => { counts[b.tier] = (counts[b.tier] || 0) + 1; }));
  const total = players.reduce((n, p) => n + p.badges.length, 0);
  return `<section class="aces-card ch-badges">
    <h2 class="ch-h">${icon('medal')}Badges earned</h2>
    <div class="ch-tiers"><span class="aces-chip">${total} badge${total === 1 ? '' : 's'}</span>${TIERS.filter((t) => counts[t]).map((t) => `<span class="aces-chip ch-tier" data-tier="${t}"><span class="ch-tier-dot"></span>${counts[t]} ${t}</span>`).join('')}</div>
    <ul class="ch-badge-players">${players.map((p) => `<li>
      <span class="ch-bp-name">${p.id ? `<a href="${esc(playerUrl({ id: p.id, name: p.name }))}">${esc(p.name)}</a>` : esc(p.name)}</span>
      <span class="ch-bp-list">${p.badges.map((b) => `<span class="ch-badge" data-tier="${esc(b.tier)}"${b.description ? ` title="${esc(b.description)}"` : ''}><span class="ch-tier-dot"></span>${esc(b.name)}</span>`).join('')}</span>
    </li>`).join('')}</ul>
  </section>`;
}

function journeyHtml(sid, title, data) {
  const champ = title.champion;
  const games = data.games.filter((g) => g.type === 'regular' && g.hasScores && sideOf(g, champ))
    .sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || ''));
  if (!games.length) return '';
  const cells = games.map((g) => {
    const side = sideOf(g, champ);
    const mine = side === 'home' ? g.homeScore : g.awayScore;
    const theirs = side === 'home' ? g.awayScore : g.homeScore;
    const opp = side === 'home' ? g.away : g.home;
    const res = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
    const label = `${res} ${mine}-${theirs} ${side === 'home' ? 'vs' : 'at'} ${cap(opp)}${g.dateKey ? `, ${formatGameDate(g.dateKey, 'short')}` : ''}`;
    return `<li class="ch-j is-${res.toLowerCase()}" title="${esc(label)}"><span class="ch-j-res">${res}</span><span class="ch-j-score">${mine}-${theirs}</span><span class="ch-j-opp">${esc(cap(opp))}</span></li>`;
  }).join('');
  return `<section class="aces-card ch-journey">
    <h2 class="ch-h">${icon('calendar')}Regular season</h2>
    <ol class="ch-js">${cells}</ol>
  </section>`;
}

function allTimeHtml() {
  const tally = new Map();
  S.seasons.forEach((s) => {
    const t = cap(S.titles[s.id].champion);
    if (!tally.has(t)) tally.set(t, []);
    tally.get(t).push(s.id);
  });
  const counts = [...tally].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return `<section class="aces-card ch-alltime">
    <h2 class="ch-h">${icon('crown')}All champions</h2>
    <ul class="ch-tally">${counts.map(([team, ids]) => `<li>${chip(team)}<b>${ids.length}</b><small>title${ids.length === 1 ? '' : 's'}</small></li>`).join('')}</ul>
    <ol class="ch-list">${S.seasons.map((s) => {
      const t = S.titles[s.id];
      return `<li class="${s.id === S.sid ? 'is-current' : ''}">
        <a class="ch-list-season" href="?seasonId=${esc(encodeURIComponent(s.id))}" data-season="${esc(s.id)}">${esc(seasonLabel(s.id))}</a>
        <span class="ch-list-champ">${chip(t.champion)}</span>
        <span class="ch-list-ru">${t.runnerUp ? `<span class="ch-dim">over</span> ${esc(cap(t.runnerUp))}` : ''}</span>
      </li>`;
    }).join('')}</ol>
  </section>`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function show(sid, { push = false } = {}) {
  S.sid = sid;
  $('chSeason').value = sid;
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('seasonId', sid);
    u.searchParams.delete('season');
    history.replaceState(null, '', u);
  }
  const body = $('chBody');
  body.setAttribute('aria-busy', 'true');
  body.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  let data;
  try {
    data = await loadSeason(sid);
  } catch (err) {
    console.error('[champions] season', err);
    body.innerHTML = '<p class="aces-empty">This season couldn\'t be loaded. Try again in a moment.</p>';
    return;
  }
  if (S.sid !== sid) return;   // a newer pick won
  const title = S.titles[sid];
  const rows = teamRows(sid, title.champion, data);
  body.innerHTML = [
    heroHtml(sid, title, data),
    finalHtml(sid, title, data),
    starsHtml(sid, title, data, rows),
    runHtml(sid, title, data),
    rosterHtml(sid, title, rows),
    badgesHtml(sid, title, data),
    journeyHtml(sid, title, data)
  ].join('');
  body.removeAttribute('aria-busy');
  $('chAllTime').innerHTML = allTimeHtml();
}

async function main() {
  await initPage({ title: 'Champions' });
  try {
    const [titles, seasonDocs] = await Promise.all([loadTitles(), getSeasons().catch(() => [])]);
    S.titles = titles;
    const known = new Map(seasonDocs.map((s) => [s.id, s]));
    S.seasons = Object.keys(titles).filter((id) => titles[id].champion)
      .map((id) => known.get(id) || { id })
      .sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  } catch (err) {
    showPageError(err);
    return;
  }
  if (!S.seasons.length) {
    showPageState({ title: 'No champions yet', message: 'Champions show here once a season\'s final is played.', container: $('chBody') });
    pageReady();
    return;
  }

  $('chSeason').innerHTML = S.seasons.map((s) => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))} &middot; ${esc(cap(S.titles[s.id].champion))}</option>`).join('');
  $('chSeason').addEventListener('change', (e) => show(e.target.value, { push: true }));
  $('chAllTime').addEventListener('click', (e) => {
    const a = e.target.closest('[data-season]');
    if (!a) return;
    e.preventDefault();
    show(a.dataset.season, { push: true });
    $('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const q = new URLSearchParams(location.search);
  const want = parseStatSeasonId(q.get('seasonId') || q.get('season') || '').id;
  const first = S.seasons.find((s) => s.id === want)?.id || S.seasons[0].id;
  pageReady();
  await show(first);
}

main();
