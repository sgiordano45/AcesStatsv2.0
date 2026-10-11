// js/pages/stat-page.js
// batting.html and pitching.html: every player's stats with the shared
// Season / Team / Subs filters and the stat table (js/ui/table.js).
// <body data-kind="batting|pitching"> picks the page.
//
//   Totals    tiles for the current selection (players, games, AVG or ERA ...)
//   Records   best single seasons ever, from regular (non-sub) play; rate
//             records need a qualified season (2 PA or 2 IP per team game)
//   Table     the sortable, exportable stat table, filters in the URL

import { initPage, pageReady, showPageState, showPageError } from '../core/app.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { applyTeamGames } from '../data/team-games.js';
import { mountStatTable } from '../ui/table.js';
import { mountStatFilters, pickDefaultSeason } from '../ui/stat-filters.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, playerUrl } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { battingLine, era, isQualifiedBatter, isQualifiedPitcher, QUALIFIERS, qualifierLabel } from '../domain/stats.js';

const $ = (id) => document.getElementById(id);
const KIND = document.body.dataset.kind === 'pitching' ? 'pitching' : 'batting';
const n = (v) => Math.round(v).toLocaleString('en-US');
let allRows = [];
let teamGamesReady = false;

// ---------------------------------------------------------------------------
// Totals for the selection
// ---------------------------------------------------------------------------

function tile(value, label, meta = '') {
  return `<div class="aces-stat"><span class="aces-stat-value">${esc(value)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
}

function renderTotals(rows) {
  const sum = (f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const people = new Set(rows.map((r) => r.id || r.name)).size;
  if (!rows.length) {
    $('spTotals').innerHTML = tile('0', KIND === 'batting' ? 'Players' : 'Pitchers', 'nothing in this selection');
    return;
  }
  if (KIND === 'batting') {
    const ab = sum('atBats'), h = sum('hits'), bb = sum('walks');
    $('spTotals').innerHTML = [
      tile(n(people), 'Players'),
      tile(n(ab + bb), 'Plate app.'),
      tile(n(h), 'Hits'),
      tile(n(sum('runs')), 'Runs'),
      tile(n(bb), 'Walks'),
      tile(ab ? fmtAvg(h / ab) : '-', 'League AVG'),
      tile(ab + bb ? fmtAvg((h + bb) / (ab + bb)) : '-', 'League OBP')
    ].join('');
  } else {
    const ip = sum('ip'), ra = sum('runsAllowed');
    $('spTotals').innerHTML = [
      tile(n(people), 'Pitchers'),
      tile(n(sum('games')), 'Games'),
      tile(formatIP(ip), 'Innings'),
      tile(n(ra), 'Runs allowed'),
      tile(ip ? fmtRate(era(ra, ip)) : '-', 'League ERA')
    ].join('');
  }
}

// ---------------------------------------------------------------------------
// Single-season records (every season; regular play only)
// ---------------------------------------------------------------------------

function best(rows, value, { low = false } = {}) {
  let top = null;
  let topV = null;
  for (const r of rows) {
    const v = value(r);
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if (top === null || (low ? v < topV : v > topV)) { top = r; topV = v; }
  }
  return top ? { r: top, v: topV } : null;
}

function recordCard(label, hit, format, note = '') {
  if (!hit) return '';
  const { r, v } = hit;
  return `<li class="sp-record">
    <span class="sp-record-label">${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</span>
    <strong class="sp-record-value">${esc(format(v))}</strong>
    <span class="sp-record-who"><a href="${esc(playerUrl(r))}">${esc(r.name)}</a> <small>${esc(r.team)} \u00b7 ${esc(r.seasonLabel)}</small></span>
  </li>`;
}

function renderRecords() {
  const regular = allRows.filter((r) => !r.sub);
  let items;
  if (KIND === 'batting') {
    const rated = teamGamesReady
      ? regular.filter((r) => r.teamGames > 0 && isQualifiedBatter(r, r.teamGames))
      : regular.filter((r) => r.atBats >= QUALIFIERS.ALL_TIME_MIN_AB);
    const note = teamGamesReady ? 'qualified' : `${QUALIFIERS.ALL_TIME_MIN_AB}+ AB`;
    const bpi = regular.filter((r) => typeof r.acesBPI === 'number');
    items = [
      recordCard('Hits', best(regular, (r) => r.hits), n),
      recordCard('Runs', best(regular, (r) => r.runs), n),
      recordCard('Walks', best(regular, (r) => r.walks), n),
      recordCard('Games', best(regular, (r) => r.games), n),
      recordCard('Batting average', best(rated, (r) => (r.atBats ? r.hits / r.atBats : null)), fmtAvg, note),
      recordCard('On-base %', best(rated, (r) => battingLine(r).obp), fmtAvg, note),
      recordCard('AcesBPI', best(bpi, (r) => r.acesBPI), (v) => fmtRate(v))
    ];
  } else {
    const rated = teamGamesReady
      ? regular.filter((r) => r.teamGames > 0 && isQualifiedPitcher({ inningsPitched: r.ip }, r.teamGames))
      : regular.filter((r) => r.ip >= 15);
    const note = teamGamesReady ? 'qualified' : '15+ IP';
    items = [
      recordCard('Innings', best(regular, (r) => r.ip), formatIP),
      recordCard('Games', best(regular, (r) => r.games), n),
      recordCard('Best ERA', best(rated, (r) => era(r.runsAllowed, r.ip), { low: true }), (v) => fmtRate(v), note),
      recordCard('Fewest runs', best(rated, (r) => r.runsAllowed, { low: true }), n, note)
    ];
  }
  const qual = teamGamesReady
    ? `Rate records need a qualified season (${qualifierLabel(KIND).replace(/^Min/, 'min')}).`
    : 'Checking which seasons qualify\u2026';
  $('spRecords').innerHTML = `<section class="aces-card sp-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('trophy')}Best single seasons</h2>
      <a class="aces-section-link" href="leaders.html">Leaders</a></div>
    <ul class="sp-records">${items.join('')}</ul>
    <p class="sp-note">Every season, regular play (sub games left out). ${esc(qual)}</p>
  </section>`;
}

// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: KIND === 'batting' ? 'Batting' : 'Pitching' });
  // The signed-in player's rows get the "you" highlight (View As aware).
  const me = new Set([ctx?.profile?.linkedPlayer, ctx?.profile?.playerId, ctx?.user?.uid].filter(Boolean));
  const config = KIND === 'batting' ? battingTableConfig() : pitchingTableConfig();
  const table = mountStatTable($('spTable'), config, {
    emptyMessage: `No ${KIND} stats for this selection.`,
    exportName: `aces-${KIND}`,
    exportTitle: `Aces ${KIND}`,
    rowClass: (r) => (me.size && r.ids.some((id) => me.has(id)) ? 'is-me' : '')
  });

  const players = await getAllPlayerStatsOptimized();
  allRows = KIND === 'batting' ? buildBattingRows(players) : buildPitchingRows(players);
  if (!allRows.length) {
    pageReady();
    showPageState({ title: `No ${KIND} stats yet`, message: 'Stats show up here once games have been entered.', container: '#spBody' });
    return;
  }

  const filters = mountStatFilters({
    season: $('seasonFilter'), team: $('teamFilter'), subs: $('subsFilter'),
    rows: allRows,
    defaultSeason: pickDefaultSeason(allRows.map((r) => r.seasonId), ctx?.config),
    onChange: (rows) => { table.setRows(rows); renderTotals(rows); }
  });
  filters.apply();
  renderRecords();
  pageReady();

  // Team games (for Qualified and the rate records) load after the table is up.
  try {
    await applyTeamGames(allRows, KIND === 'batting' ? { fallbackToPlayerGames: true } : {});
    teamGamesReady = true;
    table.refresh();
  } catch (err) {
    console.warn(`[${KIND}] team games unavailable; Qualified shows no one`, err);
  }
  renderRecords();
}

// Batting <-> Pitching keeps the season, team and subs filters.
document.querySelectorAll('.sp-tabs a').forEach((a) => a.addEventListener('click', () => {
  const cur = new URLSearchParams(location.search);
  const q = new URLSearchParams();
  ['season', 'team', 'subs'].forEach((k) => { if (cur.get(k)) q.set(k, cur.get(k)); });
  const base = a.getAttribute('href').split('?')[0];
  a.setAttribute('href', q.toString() ? `${base}?${q}` : base);
}));

main().catch((err) => { pageReady(); showPageError(err, { container: '#spBody' }); });
