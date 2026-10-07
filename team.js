// team.js - one team's page: summary cards, then its batting and pitching
// tables (js/ui/table.js) for a season, a year, or all seasons.
//
// URL: team.html?team=Green[&season=2026-fall][&view=pitching][&subs=exclude]
// plus each table's own keys, prefixed bat. and pit. (bat.preset=advanced).

import { db, collection, getDocs } from './firebase-config.js';
import { getAllPlayerStatsOptimized } from './firebase-data.js';
import { initPage, pageReady, showPageState, showPageError, siteUrl } from './js/core/app.js';
import { capitalize } from './js/ui/format.js';
import { battingAverage } from './js/domain/stats.js';
import { applyTeamGames } from './js/data/team-games.js';
import { mountStatTable } from './js/ui/table.js';
import { mountStatFilters, pickDefaultSeason } from './js/ui/stat-filters.js';
import { buildBattingRows, battingTableConfig } from './js/ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from './js/ui/pitching-stats.js';

let battingRows = [];
let pitchingRows = [];
let teamGames = [];
let currentTeam = null;
let currentView = 'batting';
let tables = {};

// Initialize page
const params = new URLSearchParams(window.location.search);
currentTeam = params.get('team') ? capitalize(params.get('team').toLowerCase()) : null;
currentView = params.get('view') === 'pitching' ? 'pitching' : 'batting';

if (currentTeam) {
  document.getElementById('team-name').textContent = currentTeam;
  const logoElement = document.getElementById('team-logo');
  if (logoElement) {
    logoElement.src = `logos/${currentTeam.toLowerCase()}.png`;
    logoElement.alt = `${currentTeam} Logo`;
    logoElement.classList.add('loaded');
  }
}

async function main() {
  const ctx = await initPage({ title: currentTeam ? `${currentTeam} Team Stats` : 'Team Stats' });
  if (!currentTeam) {
    showPageState({
      title: 'No team picked',
      message: 'Choose a team from the teams page.',
      actions: [{ label: 'Go to teams', href: siteUrl('teams.html'), primary: true }]
    });
    return;
  }
  await loadTeamData(ctx);
}

main().catch((err) => showPageError(err));

async function loadTeamData(ctx) {
  const players = await getAllPlayerStatsOptimized();
  battingRows = buildBattingRows(players, { team: currentTeam });
  pitchingRows = buildPitchingRows(players, { team: currentTeam });

  if (battingRows.length === 0 && pitchingRows.length === 0) {
    showPageState({
      title: 'Team not found',
      message: `We don't have stats for "${currentTeam}".`,
      actions: [{ label: 'Go to teams', href: siteUrl('teams.html'), primary: true }]
    });
    return;
  }

  // The signed-in player's rows get the gold "you" highlight (View As aware).
  const me = new Set([ctx?.profile?.linkedPlayer, ctx?.profile?.playerId, ctx?.user?.uid].filter(Boolean));
  const rowClass = r => (me.size && r.ids.some(id => me.has(id)) ? 'is-me' : '');
  const slug = currentTeam.toLowerCase();

  tables.batting = mountStatTable(document.getElementById('teamBatting'), battingTableConfig({ id: 'bat', omit: ['team'] }), {
    emptyMessage: 'No batting stats for this selection.',
    exportName: `aces-${slug}-batting`,
    exportTitle: `${currentTeam} batting`,
    rowClass
  });
  tables.pitching = mountStatTable(document.getElementById('teamPitching'), pitchingTableConfig({ id: 'pit', omit: ['team'] }), {
    emptyMessage: 'No pitching stats for this selection.',
    exportName: `aces-${slug}-pitching`,
    exportTitle: `${currentTeam} pitching`,
    rowClass
  });

  // One set of filters drives both tables.
  const all = [...battingRows.map(r => ({ ...r, kind: 'bat', ref: r })), ...pitchingRows.map(r => ({ ...r, kind: 'pit', ref: r }))];
  const filters = mountStatFilters({
    season: document.getElementById('seasonFilter'),
    team: null,
    subs: document.getElementById('subsFilter'),
    rows: all,
    defaultSeason: pickDefaultSeason(all.map(r => r.seasonId), ctx?.config),
    onChange: (rows) => {
      tables.batting.setRows(rows.filter(r => r.kind === 'bat').map(r => r.ref));
      tables.pitching.setRows(rows.filter(r => r.kind === 'pit').map(r => r.ref));
    }
  });

  setupViewSwitcher();
  filters.apply();
  renderSummary();
  pageReady();

  // Team games: for the summary card and for Qualified.
  loadTeamGames().then(renderSummary).catch(err => console.warn('[team] games unavailable', err));
  try {
    await Promise.all([applyTeamGames(battingRows, { fallbackToPlayerGames: true }), applyTeamGames(pitchingRows)]);
    tables.batting.refresh();
    tables.pitching.refresh();
  } catch (err) {
    console.warn('[team] team games unavailable; Qualified shows no one', err);
  }
}

// Every game this team has in any season (for the Total Games card).
async function loadTeamGames() {
  const seasonsSnapshot = await getDocs(collection(db, 'seasons'));
  const ids = seasonsSnapshot.docs.map(d => d.id).filter(id => id.split('-').length >= 2);
  const lists = await Promise.all(ids.map(id => getDocs(collection(db, 'seasons', id, 'games')).catch(() => null)));
  teamGames = [];
  lists.forEach((snap, i) => {
    if (!snap) return;
    snap.forEach(gameDoc => {
      const game = gameDoc.data();
      const home = capitalize(String(game.homeTeamId || game.homeTeamName || game['home team'] || '').toLowerCase());
      const away = capitalize(String(game.awayTeamId || game.awayTeamName || game['away team'] || '').toLowerCase());
      if (home !== currentTeam && away !== currentTeam) return;
      const type = String(game.gameType || game.game_type || '').toLowerCase() === 'playoff' ? 'Playoff' : 'Regular';
      teamGames.push({ seasonId: ids[i], game_type: type });
    });
  });
}

function renderSummary() {
  const rows = battingRows;
  const totalPlayers = new Set(rows.map(p => p.id || p.name)).size;
  const totalHits = rows.reduce((sum, p) => sum + p.hits, 0);
  const totalAtBats = rows.reduce((sum, p) => sum + p.atBats, 0);
  const teamBA = totalAtBats > 0 ? battingAverage(totalHits, totalAtBats).toFixed(3).replace(/^0/, '') : '.000';
  const uniqueSeasons = new Set(rows.map(p => p.seasonId)).size;
  const years = [...new Set(rows.map(p => p.seasonId.split('-')[0]))].sort();
  const yearsActive = years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : years[0] || 'N/A';

  const regular = teamGames.filter(g => g.game_type === 'Regular').length;
  const playoff = teamGames.filter(g => g.game_type === 'Playoff').length;
  let gamesDisplay = teamGames.length ? String(teamGames.length) : '…';
  if (regular > 0 && playoff > 0) gamesDisplay = `${teamGames.length} (${regular} Regular, ${playoff} Playoff)`;
  const hitsDisplay = totalHits.toLocaleString('en-US');

  document.getElementById('summary-grid').innerHTML = `
    <div class="summary-item"><div class="summary-number">${totalPlayers}</div><div class="summary-label">Total Players</div></div>
    <div class="summary-item"><div class="summary-number">${uniqueSeasons}</div><div class="summary-label">Total Seasons</div></div>
    <div class="summary-item"><div class="summary-number">${yearsActive}</div><div class="summary-label">Years Active</div></div>
    <div class="summary-item"><div class="summary-number" style="font-size: ${gamesDisplay.length > 8 ? '1.5rem' : '2rem'};">${gamesDisplay}</div><div class="summary-label">Total Games</div></div>
    <div class="summary-item"><div class="summary-number">${hitsDisplay}</div><div class="summary-label">Team Hits</div></div>
    <div class="summary-item"><div class="summary-number">${teamBA}</div><div class="summary-label">Team Average</div></div>
  `;
}

// Batting | Pitching, kept in the URL as ?view=pitching.
function setupViewSwitcher() {
  const buttons = document.querySelectorAll('[data-team-view]');
  const show = (view) => {
    currentView = view;
    document.getElementById('teamBatting').hidden = view !== 'batting';
    document.getElementById('teamPitching').hidden = view !== 'pitching';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.teamView === view)));
  };
  buttons.forEach(b => b.addEventListener('click', () => {
    show(b.dataset.teamView);
    const p = new URLSearchParams(location.search);
    if (currentView === 'pitching') p.set('view', 'pitching'); else p.delete('view');
    history.replaceState(history.state, '', `${location.pathname}?${p}${location.hash}`);
  }));
  // A team with no pitching stats (or no batting) opens on what it has.
  if (currentView === 'pitching' && !pitchingRows.length) currentView = 'batting';
  if (currentView === 'batting' && !battingRows.length) currentView = 'pitching';
  show(currentView);
}

// Kept for any old inline handler.
window.switchToView = (view) => document.querySelector(`[data-team-view="${view}"]`)?.click();
