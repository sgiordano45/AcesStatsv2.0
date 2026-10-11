// js/pages/seasons.js
// seasons.html: every Aces season, newest first, grouped by year. Each card
// shows the season's status, champion and runner-up, the regular-season
// first-place team, and its size (teams, games played, players, league AVG),
// and opens season.html?seasonId=.
//
// Data: seasons docs (js/core/config.js), each season's games, champions and
// runnerUps, aggregatedPlayerStats (players and league AVG), awards (count).

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getSeasons } from '../core/config.js';
import { db, collection, getDocs } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { getAllAwards } from '../data/awards.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, computeStandings, isDecided } from '../domain/standings.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';
import { todayKey } from '../domain/dates.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const n = (v) => Number(v || 0).toLocaleString('en-US');

function chip(team) {
  if (!team) return '';
  const k = String(team).toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: cap(team) }).toString())}"><span class="aces-team-dot"></span>${esc(cap(team))}</a>`;
}

async function loadTitles() {
  const [champs, runners] = await Promise.all([
    getDocs(collection(db, 'champions')),
    getDocs(collection(db, 'runnerUps')).catch(() => ({ docs: [] }))
  ]);
  const out = {};
  champs.docs.forEach((d) => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] = { champion: v.team || '', runnerUp: v.runnerUp || '' };
  });
  runners.docs.forEach((d) => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] ??= { champion: '', runnerUp: '' };
    if (!out[sid].runnerUp) out[sid].runnerUp = v.runnerUp || '';
  });
  return out;
}

function awardSeason(a) {
  if (a.seasonId) return parseStatSeasonId(a.seasonId).id;
  if (a.Year && a.Season) return `${a.Year}-${String(a.Season).toLowerCase()}`;
  return '';
}

// ---------------------------------------------------------------------------

function buildSeasons({ seasons, players, titles, awards, gamesBy, config }) {
  const rows = buildBattingRows(players || []);
  const ids = new Set([...seasons.map((s) => s.id), ...rows.map((r) => r.seasonId)]);
  const today = todayKey();
  const live = config && config.phase !== 'offseason' ? config.currentSeasonId : '';
  const awardCount = new Map();
  awards.forEach((a) => { const sid = awardSeason(a); if (sid) awardCount.set(sid, (awardCount.get(sid) || 0) + 1); });

  return [...ids].filter(Boolean).sort((a, b) => seasonSortKey(b) - seasonSortKey(a)).map((sid) => {
    const games = gamesBy.get(sid) || [];
    const regular = games.filter((g) => g.type === 'regular');
    const played = regular.filter(isDecided).length;
    const left = regular.filter((g) => !isDecided(g)).length;
    const standings = computeStandings(games, { extras: false }).filter((r) => r.team && r.team !== 'TBD' && r.games);
    const teams = new Set(games.flatMap((g) => [g.home, g.away]).filter((t) => t && t !== 'TBD'));
    const bat = rows.filter((r) => r.seasonId === sid);
    if (!teams.size) bat.filter((r) => !r.sub && r.teamKey !== 'kings').forEach((r) => teams.add(r.team));
    const ab = bat.reduce((s, r) => s + r.atBats, 0);
    const h = bat.reduce((s, r) => s + r.hits, 0);
    const first = games.map((g) => g.dateKey).filter(Boolean).sort()[0] || '';
    const t = titles[sid] || {};
    let status = 'final';
    if (sid === live) status = played ? 'live' : 'upcoming';
    else if (!played && first && first > today) status = 'upcoming';
    return {
      sid, status, played, left,
      teams: teams.size,
      players: new Set(bat.filter((r) => !r.sub).map((r) => r.id || r.name)).size,
      avg: ab ? h / ab : null,
      leader: standings[0] || null,
      champion: t.champion || '',
      runnerUp: t.runnerUp || '',
      awards: awardCount.get(sid) || 0
    };
  });
}

function card(s) {
  const href = `season.html?seasonId=${encodeURIComponent(s.sid)}`;
  const status = s.status === 'live'
    ? '<span class="aces-badge is-win">In progress</span>'
    : s.status === 'upcoming' ? '<span class="aces-badge is-outline">Upcoming</span>' : '';
  const facts = [
    [s.teams, 'teams'], [s.played, 'games'], [s.players, 'players']
  ].filter(([v]) => v).map(([v, l]) => `<span><b>${n(v)}</b> ${l}</span>`);
  if (s.avg !== null) facts.push(`<span><b>${fmtAvg(s.avg)}</b> league AVG</span>`);
  return `<li><article class="aces-card ss-card${s.champion ? ' has-champ' : ''}${s.status === 'live' ? ' is-live' : ''}">
    <header class="ss-card-head">
      <h3><a href="${esc(href)}">${esc(seasonLabel(s.sid))}</a></h3>
      ${status}
    </header>
    <dl class="ss-results">
      ${s.champion ? `<div class="is-gold"><dt>${icon('trophy')}Champion</dt><dd>${chip(s.champion)}</dd></div>` : ''}
      ${s.runnerUp ? `<div class="is-silver"><dt>${icon('medal')}Runner-up</dt><dd>${chip(s.runnerUp)}</dd></div>` : ''}
      ${s.leader ? `<div><dt>${icon('list')}${s.status === 'final' ? 'First place' : 'Leading'}</dt><dd>${chip(s.leader.team)} <small>${esc(recordText(s.leader))}</small></dd></div>` : ''}
      ${!s.champion && !s.leader ? `<div><dt>${icon('calendar')}Status</dt><dd>${s.status === 'upcoming' ? 'Not started' : 'No results recorded'}</dd></div>` : ''}
    </dl>
    <p class="ss-facts">${facts.join('')}${s.awards ? `<span><b>${s.awards}</b> award${s.awards === 1 ? '' : 's'}</span>` : ''}</p>
    <a class="ss-open" href="${esc(href)}">Open season ${icon('chevron-right')}</a>
  </article></li>`;
}

function render(list, allPlayers) {
  const years = new Map();
  list.forEach((s) => {
    const y = s.sid.slice(0, 4);
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(s);
  });
  const games = list.reduce((a, s) => a + s.played, 0);
  const titles = list.filter((s) => s.champion).length;
  const oldest = list[list.length - 1]?.sid.slice(0, 4) || '';
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  $('ssStats').innerHTML = [
    tile(String(list.length), 'Seasons', oldest ? `since ${oldest}` : ''),
    tile(n(games), 'Games played', 'regular season'),
    tile(n(allPlayers), 'Players', 'all-time'),
    tile(String(titles), 'Champions crowned')
  ].join('');
  $('ssList').innerHTML = [...years].map(([y, items]) => `<section class="ss-year">
    <h2 class="aces-section-title ss-year-head">${esc(y)}</h2>
    <ul class="ss-grid">${items.map(card).join('')}</ul>
  </section>`).join('') || '<div class="aces-card"><div class="aces-empty"><p>No seasons yet.</p></div></div>';
}

// ---------------------------------------------------------------------------

async function main() {
  const { config } = await initPage({ title: 'Seasons' });
  const [seasons, players, titles, awards] = await Promise.all([
    getSeasons(),
    getAllPlayerStatsOptimized(),
    loadTitles().catch((err) => { console.warn('[seasons] titles unavailable', err); return {}; }),
    getAllAwards().catch(() => [])
  ]);
  const results = await Promise.all(seasons.map((s) => getSeasonGames(s.id)
    .then((docs) => [s.id, normalizeGames(docs)])
    .catch((err) => { console.warn(`[seasons] games for ${s.id} unavailable`, err); return [s.id, []]; })));
  const gamesBy = new Map(results);
  const list = buildSeasons({ seasons, players, titles, awards, gamesBy, config });
  const allPlayers = new Set(buildBattingRows(players || []).filter((r) => !r.sub).map((r) => r.id || r.name)).size;
  render(list, allPlayers);
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err, { container: '#ssList' }); });
