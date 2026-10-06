// team.js - CONVERTED to use object-keyed seasons
// Performance: ~50-100ms load time (was multiple seconds)

import { db, collection, getDocs } from './firebase-config.js';
import {
  getAllPlayerStatsOptimized,
  getAllPitchingStatsOptimized,
  seasonsObjectToArray,
  pitchingSeasonsObjectToArray
} from './firebase-data.js';

let teamData = [];
let teamPitchingData = [];
let allAwards = [];
let teamGames = [];
let allGames = [];
let currentSort = { column: null, dir: "asc" };
let currentTeam = null;
let currentView = 'batting';

// Initialize page
const params = new URLSearchParams(window.location.search);
currentTeam = params.get("team");

if (!currentTeam) {
  document.body.innerHTML = '<h1>Error: No team specified</h1><p><a href="index.html">Return to main page</a></p>';
} else {
  document.getElementById("team-name").textContent = currentTeam;
  // Set team logo
  const logoElement = document.getElementById("team-logo");
  if (logoElement) {
    logoElement.src = `logos/${currentTeam.toLowerCase()}.png`;
    logoElement.alt = `${currentTeam} Logo`;
    logoElement.classList.add('loaded');
  }
  loadTeamData();
}

async function loadTeamData() {
  try {
    console.log('Loading team data from optimized aggregated collections...');
    
    // Load player stats from optimized collection
    const allPlayers = await getAllPlayerStatsOptimized();
    teamData = [];
    
    allPlayers.forEach(playerData => {
      // CONVERTED: Use seasonsObjectToArray helper
      if (playerData.seasons && typeof playerData.seasons === 'object') {
        const seasonsArray = seasonsObjectToArray(playerData);
        
        seasonsArray.forEach(seasonStats => {
          // Only include seasons for this team
          if (seasonStats.team === currentTeam) {
            // Parse season ID: "2024-fall" or "2025-spring"
            const seasonId = seasonStats.seasonId || '';
            const parts = seasonId.split('-');
            
            if (parts.length >= 2) {
              const year = parts[0];
              const season = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
              
              teamData.push({
                id: playerData.id || playerData.userId || playerData.playerId,  // ← ADD THIS LINE
				name: playerData.name,
                team: seasonStats.team,
                year: year,
                season: season,
                games: seasonStats.games || 0,
                atBats: seasonStats.atBats || 0,
                hits: seasonStats.hits || 0,
                runs: seasonStats.runs || 0,
                walks: seasonStats.walks || 0,
                AcesWar: seasonStats.acesBPI || seasonStats.AcesBPI || seasonStats.AcesWar || seasonStats.acesWar || "N/A",
                Sub: (function (v) { v = String(v || ""); return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : ""; })(seasonStats.sub || seasonStats.Sub)
              });
            }
          }
        });
      }
    });
    
    console.log(`Loaded ${teamData.length} batting records for ${currentTeam}`);
    
    // Load pitching stats from optimized collection
    const allPitchers = await getAllPitchingStatsOptimized();
    teamPitchingData = [];
    
    allPitchers.forEach(playerData => {
      // CONVERTED: Use pitchingSeasonsObjectToArray helper
      if (playerData.pitchingSeasons && typeof playerData.pitchingSeasons === 'object') {
        const seasonsArray = pitchingSeasonsObjectToArray(playerData);
        
        seasonsArray.forEach(seasonStats => {
          // Only include seasons for this team
          if (seasonStats.team === currentTeam) {
            // Parse season ID: "2024-fall" or "2025-spring"
            const seasonId = seasonStats.seasonId || '';
            const parts = seasonId.split('-');
            
            if (parts.length >= 2) {
              const year = parts[0];
              const season = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
              
              teamPitchingData.push({
                id: playerData.id || playerData.userId || playerData.playerId,
				name: playerData.name,
                team: seasonStats.team,
                year: year,
                season: season,
                games: seasonStats.games || 0,
                IP: seasonStats.inningsPitched || seasonStats.IP || "0",
                runsAllowed: seasonStats.runsAllowed || 0,
                ERA: seasonStats.earnedRunAverage || seasonStats.ERA || "N/A"
              });
            }
          }
        });
      }
    });
    
    console.log(`Loaded ${teamPitchingData.length} pitching records for ${currentTeam}`);
    
    // Load awards from Firestore
    const awardsSnapshot = await getDocs(collection(db, 'awards'));
    allAwards = [];
    awardsSnapshot.forEach(doc => {
      allAwards.push(doc.data());
    });
    
    // Load games from all seasons
    const seasonsSnapshot = await getDocs(collection(db, 'seasons'));
    allGames = [];
    teamGames = [];
    
    for (const seasonDoc of seasonsSnapshot.docs) {
      const gamesSnapshot = await getDocs(collection(db, 'seasons', seasonDoc.id, 'games'));
      const parts = seasonDoc.id.split('-');
      const year = parts[0];
      const season = parts[1];
      
      if (!year || !season) {
        console.warn(`Invalid season ID format: ${seasonDoc.id}`);
        continue;
      }
      
      gamesSnapshot.forEach(gameDoc => {
        const game = gameDoc.data();
        
        // Convert team IDs to capitalized team names
        const homeTeamId = game.homeTeamId || '';
        const awayTeamId = game.awayTeamId || '';
        const homeTeamName = homeTeamId ? homeTeamId.charAt(0).toUpperCase() + homeTeamId.slice(1) : '';
        const awayTeamName = awayTeamId ? awayTeamId.charAt(0).toUpperCase() + awayTeamId.slice(1) : '';
        
        // Normalize game type
        const gameType = game.gameType || game.game_type || '';
        const normalizedGameType = gameType.toLowerCase() === 'playoff' ? 'Playoff' : 'Regular';
        
        // Normalize winner
        const winnerId = game.winner || '';
        const normalizedWinner = winnerId ? winnerId.charAt(0).toUpperCase() + winnerId.slice(1) : '';
        
        const gameData = {
          id: gameDoc.id,
          "home team": homeTeamName,
          "away team": awayTeamName,
          "home score": game.homeScore || game["home score"] || game.home_score || 0,
          "away score": game.awayScore || game["away score"] || game.away_score || 0,
          winner: normalizedWinner,
          year: year,
          season: season.charAt(0).toUpperCase() + season.slice(1),
          game_type: normalizedGameType
        };
        
        allGames.push(gameData);
        
        // Filter games for this team
        if (homeTeamName === currentTeam || awayTeamName === currentTeam) {
          teamGames.push(gameData);
        }
      });
    }
    
    console.log(`Loaded ${allGames.length} total games, ${teamGames.length} for ${currentTeam}`);
    
    if (teamData.length === 0 && teamPitchingData.length === 0) {
      document.body.innerHTML = `
        <h1>Team "${currentTeam}" not found</h1>
        <p><a href="teams.html">Return to teams page</a></p>
      `;
      return;
    }

    addGameResultsSection();
    addCareerStatsSection();
    addViewSwitcher();
    renderSummary();
    populateFilters();
    switchToView('batting');
    
  } catch (error) {
    console.error("Error loading team data:", error);
    document.body.innerHTML = `
      <h1>Error loading team data</h1>
      <p>Could not load statistics: ${error.message}</p>
      <p><a href="teams.html">Return to teams page</a></p>
    `;
  }
}

function renderSummary() {
  const totalPlayers = new Set(teamData.map(p => p.name)).size;
  const totalHits = teamData.reduce((sum, p) => sum + p.hits, 0);
  const totalAtBats = teamData.reduce((sum, p) => sum + p.atBats, 0);
  const teamBA = totalAtBats > 0 ? (totalHits / totalAtBats).toFixed(3) : ".000";
  
  // Count unique seasons (Fall and Summer counted separately)
  const uniqueSeasons = new Set(teamData.map(p => `${p.year}-${p.season}`)).size;
  
  // Get years active range
  const years = [...new Set(teamData.map(p => p.year))].sort();
  const yearsActive = years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : years[0] || 'N/A';
  
  // Count total team games (regular + playoff)
  const totalTeamGames = teamGames.length;
  const regularSeasonGames = teamGames.filter(g => g.game_type === 'Regular').length;
  const playoffGames = teamGames.filter(g => g.game_type === 'Playoff').length;
  
  // Format games display
  let gamesDisplay = totalTeamGames.toString();
  if (regularSeasonGames > 0 && playoffGames > 0) {
    gamesDisplay = `${totalTeamGames} (${regularSeasonGames} Regular, ${playoffGames} Playoff)`;
  }
  
  // Format hits with comma if > 1000
  const hitsDisplay = totalHits > 999 ? totalHits.toLocaleString() : totalHits.toString();
  
  const summaryHTML = `
    <div class="summary-item">
      <div class="summary-number">${totalPlayers}</div>
      <div class="summary-label">Total Players</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${uniqueSeasons}</div>
      <div class="summary-label">Total Seasons</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${yearsActive}</div>
      <div class="summary-label">Years Active</div>
    </div>
    <div class="summary-item">
      <div class="summary-number" style="font-size: ${gamesDisplay.length > 8 ? '1.5rem' : '2rem'};">${gamesDisplay}</div>
      <div class="summary-label">Total Games</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${hitsDisplay}</div>
      <div class="summary-label">Team Hits</div>
    </div>
    <div class="summary-item">
      <div class="summary-number">${teamBA}</div>
      <div class="summary-label">Team Average</div>
    </div>
  `;
  
  document.getElementById("summary-grid").innerHTML = summaryHTML;
}

// Custom sorting function for seasons: Fall -> Summer within each year
function sortByYearSeason(a, b) {
  const yearA = parseInt(a.year);
  const yearB = parseInt(b.year);
  
  // Sort by year descending first (most recent year first)
  if (yearB !== yearA) return yearB - yearA;
  
  // Within the same year, Fall comes before Summer
  const seasonOrder = { 'Fall': 1, 'Summer': 2 };
  const orderA = seasonOrder[a.season] || 999;
  const orderB = seasonOrder[b.season] || 999;
  
  return orderA - orderB;
}

// Function to count actual team games from the games data
function countTeamGames(data) {
  if (!teamGames || teamGames.length === 0) {
    // Fallback: if no games data, use the old method
    const uniqueSeasons = new Set();
    data.forEach(p => {
      uniqueSeasons.add(`${p.year}-${p.season}`);
    });
    // Rough estimate: assume 12 games per season on average
    return uniqueSeasons.size * 12;
  }
  
  // Get current filter values
  const yearFilter = document.getElementById("yearFilter");
  const seasonFilter = document.getElementById("seasonFilter");
  
  const yearVal = yearFilter ? yearFilter.value : "All";
  const seasonVal = seasonFilter ? seasonFilter.value : "All";
  
  // Filter team games based on current filters
  let filteredGames = teamGames.filter(game =>
    (yearVal === "All" || String(game.year) === yearVal) &&
    (seasonVal === "All" || game.season === seasonVal)
  );
  
  return filteredGames.length;
}

function populateFilters() {
  const primaryData = teamData.length > 0 ? teamData : teamPitchingData;
  if (primaryData.length === 0) return;
  
  const years = [...new Set(primaryData.map(p => p.year))].sort((a, b) => b - a);
  const seasons = [...new Set(primaryData.map(p => p.season))].sort();

  const yearFilter = document.getElementById("yearFilter");
  const seasonFilter = document.getElementById("seasonFilter");
  
  if (!yearFilter || !seasonFilter) return;

  yearFilter.innerHTML = '<option value="All">All</option>';
  seasonFilter.innerHTML = '<option value="All">All</option>';

  years.forEach(y => {
    let opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearFilter.appendChild(opt);
  });

  seasons.forEach(s => {
    let opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    seasonFilter.appendChild(opt);
  });

  yearFilter.addEventListener("change", applyFilters);
  seasonFilter.addEventListener("change", applyFilters);
}

function applyFilters() {
  const yearFilter = document.getElementById("yearFilter");
  const seasonFilter = document.getElementById("seasonFilter");
  
  if (!yearFilter || !seasonFilter) return;
  
  const yearVal = yearFilter.value;
  const seasonVal = seasonFilter.value;

  const sourceData = currentView === 'batting' ? teamData : teamPitchingData;
  let filtered = sourceData.filter(
    p =>
      (yearVal === "All" || p.year === yearVal) &&
      (seasonVal === "All" || p.season === seasonVal)
  );

  if (currentView === 'batting') {
    renderBattingTable(filtered);
  } else {
    renderPitchingTable(filtered);
  }
  
  const gameResultsDiv = document.getElementById('teamGameResults');
  if (gameResultsDiv && teamGames) {
    gameResultsDiv.innerHTML = renderTeamGameResults();
  }
}

function renderBattingTable(data) {
  const tbody = document.querySelector("#team-stats-table tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12">No batting data matches the current filters.</td></tr>';
    return;
  }

  // Sort data by year and season
  const sortedData = [...data].sort(sortByYearSeason);

  sortedData.forEach(p => {
    const acesWarDisplay = (p.AcesWar === "N/A" || isNaN(p.AcesWar))
      ? "N/A"
      : Number(p.AcesWar).toFixed(2);
    const BA = p.atBats > 0 ? (p.hits / p.atBats).toFixed(3) : ".000";
    const OBP = (p.atBats + p.walks) > 0
      ? ((p.hits + p.walks) / (p.atBats + p.walks)).toFixed(3)
      : ".000";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.year}</td>
      <td>${p.season}</td>
      <td><a href="player.html?id=${encodeURIComponent(p.id || p.playerId)}">${p.name}</a></td>
      <td>${p.games}</td>
      <td>${p.atBats}</td>
      <td>${p.hits}</td>
      <td>${p.runs}</td>
      <td>${p.walks}</td>
      <td>${acesWarDisplay}</td>
      <td>${BA}</td>
      <td>${OBP}</td>
      <td>${p.Sub || ""}</td>
    `;
    tbody.appendChild(row);
  });

  attachSorting();
}

function renderPitchingTable(data) {
  const tbody = document.querySelector("#team-stats-table tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No pitching data matches the current filters.</td></tr>';
    return;
  }

  // Sort data by year and season
  const sortedData = [...data].sort(sortByYearSeason);

  sortedData.forEach(p => {
    const row = document.createElement("tr");
    const ERA = p.ERA === "N/A" || isNaN(p.ERA)
      ? "N/A"
      : Number(p.ERA).toFixed(2);

    row.innerHTML = `
      <td>${p.year}</td>
      <td>${p.season}</td>
      <td><a href="pitcher.html?name=${encodeURIComponent(p.name)}">${p.name}</a></td>
      <td>${p.games}</td>
      <td>${p.IP}</td>
      <td>${p.runsAllowed}</td>
      <td>${ERA}</td>
    `;
    tbody.appendChild(row);
  });

  attachSorting();
}

function switchToView(view) {
  currentView = view;
  
  // Update button styles
  const battingBtn = document.getElementById('battingViewBtn');
  const pitchingBtn = document.getElementById('pitchingViewBtn');
  
  if (battingBtn && pitchingBtn) {
    if (view === 'batting') {
      battingBtn.style.backgroundColor = '#0066cc';
      battingBtn.style.color = 'white';
      pitchingBtn.style.backgroundColor = '#f0f0f0';
      pitchingBtn.style.color = '#333';
    } else {
      pitchingBtn.style.backgroundColor = '#0066cc';
      pitchingBtn.style.color = 'white';
      battingBtn.style.backgroundColor = '#f0f0f0';
      battingBtn.style.color = '#333';
    }
  }
  
  // Update table headers based on view
  updateTableHeaders(view);
  
  // Apply current filters to show appropriate data
  applyFilters();
}

function updateTableHeaders(view) {
  const tableHeader = document.querySelector("#team-stats-table thead tr");
  if (!tableHeader) return;
  
  if (view === 'batting') {
    tableHeader.innerHTML = `
      <th>Year</th>
      <th>Season</th>
      <th>Name</th>
      <th>G</th>
      <th>AB</th>
      <th>H</th>
      <th>R</th>
      <th>BB</th>
      <th>AcesBPI</th>
      <th>BA</th>
      <th>OBP</th>
      <th>Sub</th>
    `;
  } else {
    tableHeader.innerHTML = `
      <th>Year</th>
      <th>Season</th>
      <th>Name</th>
      <th>Games</th>
      <th>IP</th>
      <th>Runs Allowed</th>
      <th>ERA</th>
    `;
  }
}

function attachSorting() {
  const headers = document.querySelectorAll("#team-stats-table th");
  headers.forEach((th, idx) => {
    th.onclick = () => sortTable(idx);
  });
}

function sortTable(columnIndex) {
  const table = document.getElementById("team-stats-table");
  if (!table) return;
  
  const rows = Array.from(table.rows).slice(1);

  let dir = currentSort.column === columnIndex && currentSort.dir === "asc" ? "desc" : "asc";
  currentSort = { column: columnIndex, dir: dir };

  rows.sort((rowA, rowB) => {
    const cellA = rowA.cells[columnIndex].textContent.trim();
    const cellB = rowB.cells[columnIndex].textContent.trim();

    let valA = isNaN(cellA) ? cellA.toLowerCase() : parseFloat(cellA);
    let valB = isNaN(cellB) ? cellB.toLowerCase() : parseFloat(cellB);

    if (valA < valB) return dir === "asc" ? -1 : 1;
    if (valA > valB) return dir === "asc" ? 1 : -1;
    return 0;
  });

  const tbody = table.querySelector("tbody");
  rows.forEach(row => tbody.appendChild(row));

  // Update header indicators
  document.querySelectorAll("#team-stats-table th").forEach((th, idx) => {
    th.classList.remove("asc", "desc");
    if (idx === columnIndex) {
      th.classList.add(dir);
    }
  });
}

// Additional helper functions for game results and career stats
function addViewSwitcher() {
  const summarySection = document.querySelector('.summary');
  if (!summarySection) return;
  
  const viewSwitcher = document.createElement('div');
  viewSwitcher.style.cssText = 'margin-top: 1.5rem; text-align: center;';
  viewSwitcher.innerHTML = `
    <button id="battingViewBtn" style="padding: 10px 20px; margin: 0 5px; background-color: #0066cc; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">Batting Stats</button>
    <button id="pitchingViewBtn" style="padding: 10px 20px; margin: 0 5px; background-color: #f0f0f0; color: #333; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">Pitching Stats</button>
  `;
  
  summarySection.appendChild(viewSwitcher);
  
  document.getElementById('battingViewBtn').addEventListener('click', () => switchToView('batting'));
  document.getElementById('pitchingViewBtn').addEventListener('click', () => switchToView('pitching'));
}

function addGameResultsSection() {
  // This function can be expanded to show game results
  // For now, it's a placeholder
}

function addCareerStatsSection() {
  // This function can be expanded to show career stats
  // For now, it's a placeholder
}

function renderTeamGameResults() {
  const yearFilter = document.getElementById("yearFilter");
  const seasonFilter = document.getElementById("seasonFilter");
  
  if (!yearFilter || !seasonFilter) return '<p>Loading...</p>';
  
  const yearVal = yearFilter.value;
  const seasonVal = seasonFilter.value;
  
  let filteredGames = teamGames.filter(game =>
    (yearVal === "All" || String(game.year) === yearVal) &&
    (seasonVal === "All" || game.season === seasonVal)
  );
  
  if (filteredGames.length === 0) {
    return '<p>No games found for the selected filters.</p>';
  }
  
  const record = calculateTeamRecord(filteredGames);
  
  return `
    <div style="margin-bottom: 20px;">
      <strong>Overall Record:</strong> ${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ''} (${record.winPct})
    </div>
  `;
}

function calculateTeamRecord(games) {
  let wins = 0, losses = 0, ties = 0;
  
  games.forEach(game => {
    const winner = game.winner;
    const isHome = game["home team"] === currentTeam;
    const isAway = game["away team"] === currentTeam;
    
    if (winner === "Tie") {
      ties++;
    } else if ((isHome && winner === currentTeam) || (isAway && winner === currentTeam)) {
      wins++;
    } else if (isHome || isAway) {
      losses++;
    }
  });
  
  const totalDecidedGames = wins + losses;
  const winPct = totalDecidedGames > 0 ? (wins / totalDecidedGames).toFixed(3) : '.000';
  
  return { wins, losses, ties, winPct };
}

// Make functions available globally
window.switchToView = switchToView;
