// js/pages/teams.js
// teams.html: every Aces team.
//
//   This season  a card per team in standings order: seed, record, games
//                back, run differential, last five, games left, captains
//                (rosters/{seasonId}-{team}) and the all-time record. In the
//                offseason it shows the latest season's final standings.
//   All-time     one sortable table (js/ui/table.js): seasons, years, W-L-T,
//                win %, run differential, playoff record, titles, runner-ups
//                and players, former teams included.
//
// Teams are the ones in aggregatedPlayerStats (Aces teams; outside teams on
// early schedules are left out, as is the old Kings guest team). Records are
// from game docs: regular-season games with a winner count toward W-L-T,
// playoff games separately. Titles come from champions (team, runnerUp) and
// runnerUps.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getSeasons, getDisplaySeasonId } from '../core/config.js';
import { db, collection, getDocs } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { mountStatTable } from '../ui/table.js';
import { teamChipHtml, TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, buildRecords, computeStandings, isDecided, winPct } from '../domain/standings.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const EXCLUDED_TEAMS = new Set(['kings']);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const pct = (r) => (r.wins + r.losses + r.ties ? fmtAvg(winPct(r)) : '-');

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadTitles() {
  const [champs, runners] = await Promise.all([
    getDocs(collection(db, 'champions')),
    getDocs(collection(db, 'runnerUps')).catch(() => ({ docs: [] }))
  ]);
  const out = {};   // seasonId -> { champion, runnerUp } (team keys)
  champs.docs.forEach(d => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] = { champion: String(v.team || '').toLowerCase(), runnerUp: String(v.runnerUp || '').toLowerCase() };
  });
  runners.docs.forEach(d => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] ??= { champion: '', runnerUp: '' };
    if (!out[sid].runnerUp) out[sid].runnerUp = String(v.runnerUp || '').toLowerCase();
  });
  return out;
}

async function loadCaptains(seasonId) {
  const snap = await getDocs(collection(db, 'rosters'));
  const out = {};   // teamKey -> ['Name', ...]
  snap.docs.forEach(d => {
    const v = d.data();
    if ((v.seasonId || d.id.split('-').slice(0, 2).join('-')) !== seasonId) return;
    const key = String(v.teamName || d.id.split('-').slice(2).join('-')).toLowerCase();
    out[key] = (v.players || []).filter(p => p.captain).map(p => p.name).filter(Boolean);
  });
  return out;
}

const blank = (key) => ({
  key, team: cap(key), seasons: new Set(), wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0,
  pw: 0, pl: 0, pt: 0, titles: [], runnerUps: [], players: new Set()
});

function buildAllTime(rows, gamesBySeason, titles) {
  const teams = new Map();
  for (const r of rows) {
    if (!r.teamKey || EXCLUDED_TEAMS.has(r.teamKey)) continue;
    if (!teams.has(r.teamKey)) teams.set(r.teamKey, blank(r.teamKey));
    const t = teams.get(r.teamKey);
    t.team = r.team;
    if (!r.sub) { t.seasons.add(r.seasonId); t.players.add(r.id || r.name); }
  }
  for (const [sid, games] of gamesBySeason) {
    const decided = games.filter(isDecided);
    const add = (list, prefix) => {
      for (const rec of buildRecords(list)) {
        const t = teams.get(String(rec.team).toLowerCase());
        if (!t) continue;
        t.seasons.add(sid);
        if (prefix) { t.pw += rec.wins; t.pl += rec.losses; t.pt += rec.ties; continue; }
        t.wins += rec.wins; t.losses += rec.losses; t.ties += rec.ties;
        t.runsFor += rec.runsFor; t.runsAgainst += rec.runsAgainst;
      }
    };
    add(decided.filter(g => g.type === 'regular'), false);
    add(decided.filter(g => g.type === 'playoff'), true);
  }
  for (const [sid, v] of Object.entries(titles)) {
    teams.get(v.champion)?.titles.push(sid);
    teams.get(v.runnerUp)?.runnerUps.push(sid);
  }
  return [...teams.values()].map(t => {
    const ids = [...t.seasons].sort((a, b) => seasonSortKey(a) - seasonSortKey(b));
    t.titles.sort((a, b) => seasonSortKey(a) - seasonSortKey(b));
    t.runnerUps.sort((a, b) => seasonSortKey(a) - seasonSortKey(b));
    return {
      ...t, id: t.key, name: t.team, teamKey: t.key, seasonCount: ids.length, seasonIds: ids,
      first: ids[0] || '', last: ids[ids.length - 1] || '',
      firstKey: seasonSortKey(ids[0] || ''), lastKey: seasonSortKey(ids[ids.length - 1] || ''),
      games: t.wins + t.losses + t.ties, winPct: t.wins + t.losses + t.ties ? winPct(t) : null,
      runDiff: t.runsFor - t.runsAgainst, playerCount: t.players.size
    };
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderStats(allTime, standings, gamesBySeason, titles, seasonId) {
  const played = [...gamesBySeason.values()].reduce((n, gs) => n + gs.filter(g => g.type === 'regular' && isDecided(g)).length, 0);
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  const firstSeason = allTime.map(t => t.first).filter(Boolean).sort((a, b) => seasonSortKey(a) - seasonSortKey(b))[0];
  const champ = titles[seasonId]?.champion;
  $('tmStats').innerHTML = [
    tile(String(standings.length), 'Teams', seasonLabel(seasonId)),
    tile(String(allTime.length), 'Teams all-time', firstSeason ? `since ${firstSeason.slice(0, 4)}` : ''),
    tile(String(played), 'Games played', 'regular season, all-time'),
    champ ? tile(cap(champ), 'Champion', seasonLabel(seasonId))
      : tile(String(Object.values(titles).filter(v => v.champion).length), 'Titles awarded', 'all-time')
  ].join('');
}

function last5Dots(history) {
  const recent = [...history].sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0)).slice(0, 5).reverse();
  if (!recent.length) return '';
  return `<span class="tm-form" aria-label="Last ${recent.length}: ${recent.map(r => r.result).join(' ')}">${recent.map(r => `<i class="is-${r.result.toLowerCase()}">${r.result}</i>`).join('')}</span>`;
}

function teamCard(row, allTime, captains, titles, seasonId) {
  const key = row.team.toLowerCase();
  const all = allTime.find(t => t.teamKey === key);
  const color = TEAM_COLORS.has(key) ? ` data-team-color="${esc(key)}"` : '';
  const href = `team.html?${new URLSearchParams({ team: row.team, season: seasonId })}`;
  const t = titles[seasonId] || {};
  const ribbon = t.champion === key ? `<span class="tm-ribbon is-gold">${icon('trophy')}Champion</span>`
    : t.runnerUp === key ? `<span class="tm-ribbon is-silver">${icon('medal')}Runner-up</span>` : '';
  const caps = captains[key] || [];
  return `<a class="aces-card is-link tm-card"${color} href="${esc(href)}">
    <div class="tm-card-head">
      <span class="tm-seed" title="Standings place">${row.games ? row.rank : '-'}</span>
      <img class="tm-logo" src="logos/${esc(key)}.png" alt="" loading="lazy" data-logo>
      <div class="tm-card-name"><h3>${esc(row.team)}</h3>${ribbon}</div>
      <div class="tm-record"><strong>${esc(recordText(row))}</strong><span>${row.games ? fmtAvg(row.winPct) : 'No games yet'}</span></div>
    </div>
    <dl class="tm-facts">
      <div><dt>GB</dt><dd>${row.games ? (row.gamesBack ? esc(String(row.gamesBack)) : '-') : '-'}</dd></div>
      <div><dt>Run diff</dt><dd class="${row.runDiff > 0 ? 'is-up' : row.runDiff < 0 ? 'is-down' : ''}">${row.games ? esc(signed(row.runDiff)) : '-'}</dd></div>
      <div><dt>Last 5</dt><dd>${last5Dots(row.history || []) || '-'}</dd></div>
      <div><dt>Left</dt><dd>${row.remainingCount ?? '-'}</dd></div>
    </dl>
    <p class="tm-foot">
      ${caps.length ? `<span>${icon('shield')}${esc(caps.join(', '))}</span>` : ''}
      ${all ? `<span>${icon('scroll')}${esc(recordText(all))} all-time${all.titles.length ? ` · ${all.titles.length} title${all.titles.length === 1 ? '' : 's'}` : ''}</span>` : ''}
    </p>
  </a>`;
}

function renderCurrent(standings, allTime, captains, titles, seasonId, offseason) {
  $('tmCurrent').innerHTML = `
    <div class="aces-section-head tm-section-head">
      <h2 class="aces-section-title">${esc(seasonLabel(seasonId))}${offseason ? ' <span class="aces-badge is-outline">Final</span>' : ''}</h2>
      <a class="aces-section-link" href="current-season.html">Standings</a>
    </div>
    ${standings.length ? `<div class="tm-grid">${standings.map(r => teamCard(r, allTime, captains, titles, seasonId)).join('')}</div>`
      : `<div class="aces-card"><div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games on the schedule yet</p></div></div>`}`;
}

const allTimeConfig = {
  id: '',
  cardSub: 'years',
  columns: [
    { key: 'team', label: 'Team', type: 'text', value: r => r.team, html: r => teamChipHtml({ team: r.team, teamKey: r.teamKey, seasonCount: 2 }) },
    { key: 'years', label: 'Years', type: 'text', value: r => r.firstKey, format: (v, r) => (r.first ? (r.first.slice(0, 4) === r.last.slice(0, 4) ? r.first.slice(0, 4) : `${r.first.slice(0, 4)}-${r.last.slice(0, 4)}`) : '-') },
    { key: 'S', label: 'Seasons', type: 'count', shade: false, perGame: false, value: r => r.seasonCount },
    { key: 'G', label: 'G', title: 'Regular-season games with a result', type: 'count', perGame: false, value: r => r.games },
    { key: 'W', label: 'W', type: 'count', value: r => r.wins },
    { key: 'L', label: 'L', type: 'count', lowerIsBetter: true, value: r => r.losses },
    { key: 'T', label: 'T', type: 'count', shade: false, value: r => r.ties },
    { key: 'PCT', label: 'Win %', type: 'rate', qualifiedOnly: false, value: r => r.winPct, format: v => (v === null ? '-' : fmtAvg(v)) },
    { key: 'RD', label: 'Run diff', title: 'Runs scored minus runs allowed, regular season', type: 'count', value: r => r.runDiff,
      format: (v, r, ctx) => (ctx?.perGame ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : signed(v)) },
    { key: 'PO', label: 'Playoffs', title: 'Playoff record', type: 'text', value: r => r.pw + r.pl + r.pt ? r.pw / (r.pw + r.pl + r.pt) : -1,
      format: (v, r) => (r.pw + r.pl + r.pt ? `${r.pw}-${r.pl}${r.pt ? `-${r.pt}` : ''}` : '-') },
    { key: 'TI', label: 'Titles', type: 'count', shade: false, value: r => r.titles.length, csv: r => r.titles.map(seasonLabel).join('; ') || '0',
      html: r => (r.titles.length ? `<span class="tm-titles" title="${esc(r.titles.map(seasonLabel).join(', '))}">${icon('trophy')}${r.titles.length}</span>` : '0') },
    { key: 'RU', label: 'Runner-up', type: 'count', shade: false, value: r => r.runnerUps.length,
      html: r => (r.runnerUps.length ? `<span title="${esc(r.runnerUps.map(seasonLabel).join(', '))}">${r.runnerUps.length}</span>` : '0') },
    { key: 'P', label: 'Players', title: 'Players with a regular season on the team', type: 'count', shade: false, perGame: false, value: r => r.playerCount }
  ],
  presets: [{ key: 'all', label: 'All-time', sort: '-TI', card: ['PCT', 'TI', 'S', 'P'],
    columns: ['team', 'years', 'S', 'G', 'W', 'L', 'T', 'PCT', 'RD', 'PO', 'TI', 'RU', 'P'] }],
  games: r => r.games,
  qualifier: null
};

function renderAllTime(allTime, currentKeys) {
  $('tmAllTime').innerHTML = `
    <div class="aces-section-head tm-section-head"><h2 class="aces-section-title">All-time</h2>
      <a class="aces-section-link" href="champions.html">Champions</a></div>
    <div class="aces-card is-flush tm-table"><div id="tmTable"></div></div>
    <p class="tm-note">Regular-season games with a result count toward the record; playoffs are shown separately. Teams not playing this season are in grey.</p>`;
  mountStatTable($('tmTable'), allTimeConfig, {
    rows: allTime, emptyMessage: 'No teams yet.',
    exportName: 'aces-teams-all-time', exportTitle: 'Mountainside Aces teams, all-time',
    rowClass: r => (currentKeys.has(r.teamKey) ? '' : 'is-former')
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const { config } = await initPage({ title: 'Teams' });
  const [players, seasons, displayId, titles] = await Promise.all([
    getAllPlayerStatsOptimized(),
    getSeasons(),
    getDisplaySeasonId().catch(() => null),
    loadTitles().catch((err) => { console.warn('[teams] titles unavailable', err); return {}; })
  ]);
  const seasonId = displayId || seasons[0]?.id || '';
  const results = await Promise.all(seasons.map(s => getSeasonGames(s.id)
    .then(docs => [s.id, normalizeGames(docs)])
    .catch(err => { console.warn(`[teams] games for ${s.id} unavailable`, err); return [s.id, []]; })));
  const gamesBySeason = new Map(results);
  const rows = buildBattingRows(players || []);
  const allTime = buildAllTime(rows, gamesBySeason, titles);
  const keys = new Set(allTime.map(t => t.teamKey));

  // This season: standings over the season's teams (scheduled ones with no games yet included).
  const seasonGames = gamesBySeason.get(seasonId) || [];
  const standings = computeStandings(seasonGames, { includeScheduled: true }).filter(r => keys.has(String(r.team).toLowerCase()));
  const captains = await loadCaptains(seasonId).catch(() => ({}));
  // Offseason: the latest season's final standings.
  const offseason = !config?.currentSeasonId || config?.phase === 'offseason';

  renderStats(allTime, standings, gamesBySeason, titles, seasonId);
  renderCurrent(standings, allTime, captains, titles, seasonId, offseason);
  renderAllTime(allTime, new Set(standings.map(r => String(r.team).toLowerCase())));
  document.addEventListener('error', (e) => { if (e.target.matches?.('[data-logo]')) e.target.remove(); }, true);
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
