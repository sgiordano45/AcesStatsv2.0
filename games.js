// Enhanced season.html JavaScript additions
// Add this to the existing season.html script section

let allGames = [];

async function loadSeasonData() {
  try {
    // Load all data including games
    const [battingResponse, pitchingResponse, awardsResponse, gamesResponse] = await Promise.all([
      fetch("data.json"),
      fetch("pitching.json"),
      fetch("awards.json"),
      fetch("games.json")
    ]);
    
    if (!battingResponse.ok) throw new Error('Failed to load data.json');
    
    allBattingData = cleanBattingData(await battingResponse.json());
    allPitchingData = pitchingResponse.ok ? cleanPitchingData(await pitchingResponse.json()) : [];
    allAwards = awardsResponse.ok ? await awardsResponse.json() : [];
    allGames = gamesResponse.ok ? await gamesResponse.json() : [];
    
    // Filter for this season
    seasonBattingData = allBattingData.filter(p => p.year === currentYear && p.season === currentSeason);
    seasonPitchingData = allPitchingData.filter(p => p.year === currentYear && p.season === currentSeason);
    seasonAwards = allAwards.filter(a => a.Year === currentYear && a.Season === currentSeason);
    
    if (seasonBattingData.length === 0 && seasonPitchingData.length === 0) {
      document.body.innerHTML = `
        <h1>Season "${currentYear} ${currentSeason}" not found</h1>
        <p><a href="seasons.html">Return to all seasons</a></p>
      `;
      return;
    }
    
    initializePage();
    
  } catch (error) {
    console.error("Error loading season data:", error);
    document.body.innerHTML = `
      <h1>Error loading season data</h1>
      <p>Could not load statistics. Please check that data files are available.</p>
      <p><a href="seasons.html">Return to all seasons</a></p>
    `;
  }
}

function initializePage() {
  document.getElementById("seasonTitle").textContent = `${currentYear} ${currentSeason} Season`;
  
  renderSeasonSummary();
  renderAwards();
  renderGameResults();
  renderStandings();
  switchView('batting');
}

function renderGameResults() {
  // Filter games for this season
  const seasonGames = allGames.filter(g => g.year === currentYear && g.season === currentSeason);
  
  if (seasonGames.length === 0) return;
  
  // Add game results section after awards
  const awardsContainer = document.querySelector('.leaders-awards-container');
  
  const gameResultsHTML = `
    <div class="game-results-section" style="margin-top: 30px;">
      <h3 style="background-color: #333; color: white; margin: 0; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">Game Results</h3>
      <div id="gameResults" style="background-color: #f9f9f9; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; padding: 15px;">
        ${renderGameResultsTable(seasonGames)}
      </div>
    </div>
  `;
  
  awardsContainer.insertAdjacentHTML('afterend', gameResultsHTML);
}

function renderGameResultsTable(games) {
  if (games.length === 0) return '<p>No games found for this season.</p>';
  
  // Separate regular season and playoff games
  const regularSeasonGames = games.filter(g => g.game_type === 'Regular');
  const playoffGames = games.filter(g => g.game_type === 'Playoff');
  
  let html = '';
  
  // Regular Season Games
  if (regularSeasonGames.length > 0) {
    html += `
      <h4>Regular Season (${regularSeasonGames.length} games)</h4>
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 0.9em;">
          <thead style="position: sticky; top: 0; background-color: #f0f0f0;">
            <tr>
              <th style="padding: 5px;">Date</th>
              <th style="padding: 5px;">Home Team</th>
              <th style="padding: 5px;">Score</th>
              <th style="padding: 5px;">Away Team</th>
              <th style="padding: 5px;">Winner</th>
            </tr>
          </thead>
          <tbody>
            ${regularSeasonGames.map(game => renderGameRow(game)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  // Playoff Games
  if (playoffGames.length > 0) {
    html += `
      <h4>Playoffs (${playoffGames.length} games)</h4>
      <div style="max-height: 300px; overflow-y: auto;">
        <table style="width: 100%; font-size: 0.9em;">
          <thead style="position: sticky; top: 0; background-color: #f0f0f0;">
            <tr>
              <th style="padding: 5px;">Date</th>
              <th style="padding: 5px;">Home Team</th>
              <th style="padding: 5px;">Score</th>
              <th style="padding: 5px;">Away Team</th>
              <th style="padding: 5px;">Winner</th>
            </tr>
          </thead>
          <tbody>
            ${playoffGames.map(game => renderGameRow(game)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  return html;
}

function renderGameRow(game) {
  const homeScore = game["home score"];
  const awayScore = game["away score"];
  const forfeit = game.forfeit === "Yes" ? " (Forfeit)" : "";
  
  // Handle W/L scores
  let scoreDisplay;
  if (homeScore === "W" && awayScore === "L") {
    scoreDisplay = "W - L";
  } else if (homeScore === "L" && awayScore === "W") {
    scoreDisplay = "L - W";
  } else if (game.winner === "Tie") {
    scoreDisplay = `${homeScore} - ${awayScore} (Tie)`;
  } else {
    scoreDisplay = `${homeScore} - ${awayScore}`;
  }
  
  return `
    <tr>
      <td style="padding: 5px;">${game.date}</td>
      <td style="padding: 5px;">${game["home team"]}</td>
      <td style="padding: 5px; text-align: center; font-weight: bold;">${scoreDisplay}${forfeit}</td>
      <td style="padding: 5px;">${game["away team"]}</td>
      <td style="padding: 5px; font-weight: bold;">${game.winner}</td>
    </tr>
  `;
}

function renderStandings() {
  const seasonGames = allGames.filter(g => g.year === currentYear && g.season === currentSeason);
  
  if (seasonGames.length === 0) return;
  
  // Add standings section
  const gameResultsSection = document.querySelector('.game-results-section');
  
  const standingsHTML = `
    <div class="standings-section" style="margin-top: 30px;">
      <h3 style="background-color: #333; color: white; margin: 0; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">Standings</h3>
      <div id="standings" style="background-color: #f9f9f9; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; padding: 15px;">
        ${renderStandingsTable(seasonGames)}
      </div>
    </div>
  `;
  
  if (gameResultsSection) {
    gameResultsSection.insertAdjacentHTML('afterend', standingsHTML);
  }
}

function renderStandingsTable(games) {
  const regularSeasonGames = games.filter(g => g.game_type === 'Regular');
  const playoffGames = games.filter(g => g.game_type === 'Playoff');
  
  let html = '';
  
  // Regular Season Standings
  if (regularSeasonGames.length > 0) {
    const regularStandings = calculateStandings(regularSeasonGames);
    html += `
      <h4>Regular Season Standings</h4>
      <table style="width: 100%; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 8px; text-align: left;">Team</th>
            <th style="padding: 8px;">Wins</th>
            <th style="padding: 8px;">Losses</th>
            <th style="padding: 8px;">Ties</th>
            <th style="padding: 8px;">Win%</th>
            <th style="padding: 8px;">Games</th>
          </tr>
        </thead>
        <tbody>
          ${regularStandings.map((team, index) => `
            <tr style="${index % 2 === 0 ? 'background-color: #fafafa;' : ''}">
              <td style="padding: 8px; font-weight: bold;">${team.name}</td>
              <td style="padding: 8px; text-align: center;">${team.wins}</td>
              <td style="padding: 8px; text-align: center;">${team.losses}</td>
              <td style="padding: 8px; text-align: center;">${team.ties}</td>
              <td style="padding: 8px; text-align: center;">${team.winPct}</td>
              <td style="padding: 8px; text-align: center;">${team.games}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  // Playoff Results Summary
  if (playoffGames.length > 0) {
    const playoffStandings = calculateStandings(playoffGames);
    html += `
      <h4>Playoff Performance</h4>
      <table style="width: 100%;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 8px; text-align: left;">Team</th>
            <th style="padding: 8px;">Wins</th>
            <th style="padding: 8px;">Losses</th>
            <th style="padding: 8px;">Ties</th>
            <th style="padding: 8px;">Win%</th>
            <th style="padding: 8px;">Games</th>
          </tr>
        </thead>
        <tbody>
          ${playoffStandings.map((team, index) => `
            <tr style="${index % 2 === 0 ? 'background-color: #fafafa;' : ''}">
              <td style="padding: 8px; font-weight: bold;">${team.name}</td>
              <td style="padding: 8px; text-align: center;">${team.wins}</td>
              <td style="padding: 8px; text-align: center;">${team.losses}</td>
              <td style="padding: 8px; text-align: center;">${team.ties}</td>
              <td style="padding: 8px; text-align: center;">${team.winPct}</td>
              <td style="padding: 8px; text-align: center;">${team.games}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  return html;
}

function calculateStandings(games) {
  const teamStats = {};
  
  games.forEach(game => {
    const homeTeam = game["home team"];
    const awayTeam = game["away team"];
    const winner = game.winner;
    
    // Initialize teams if not exists
    if (!teamStats[homeTeam]) {
      teamStats[homeTeam] = { name: homeTeam, wins: 0, losses: 0, ties: 0, games: 0 };
    }
    if (!teamStats[awayTeam]) {
      teamStats[awayTeam] = { name: awayTeam, wins: 0, losses: 0, ties: 0, games: 0 };
    }
    
    // Count games
    teamStats[homeTeam].games++;
    teamStats[awayTeam].games++;
    
    // Count results
    if (winner === "Tie") {
      teamStats[homeTeam].ties++;
      teamStats[awayTeam].ties++;
    } else if (winner === homeTeam) {
      teamStats[homeTeam].wins++;
      teamStats[awayTeam].losses++;
    } else if (winner === awayTeam) {
      teamStats[awayTeam].wins++;
      teamStats[homeTeam].losses++;
    } else if (winner.includes("Forfeit")) {
      // Handle forfeit cases - extract actual winner
      const actualWinner = winner.replace("Forfeit - ", "").replace("Tie", "");
      if (actualWinner && actualWinner !== "Tie") {
        if (actualWinner === homeTeam) {
          teamStats[homeTeam].wins++;
          teamStats[awayTeam].losses++;
        } else if (actualWinner === awayTeam) {
          teamStats[awayTeam].wins++;
          teamStats[homeTeam].losses++;
        }
      } else {
        teamStats[homeTeam].ties++;
        teamStats[awayTeam].ties++;
      }
    }
  });
  
  // Calculate win percentage and sort
  const standings = Object.values(teamStats).map(team => {
    const totalDecidedGames = team.wins + team.losses;
    team.winPct = totalDecidedGames > 0 ? (team.wins / totalDecidedGames).toFixed(3) : '.000';
    return team;
  });
  
  // Sort by win percentage (descending), then by wins (descending)
  standings.sort((a, b) => {
    if (parseFloat(b.winPct) !== parseFloat(a.winPct)) {
      return parseFloat(b.winPct) - parseFloat(a.winPct);
    }
    return b.wins - a.wins;
  });
  
  return standings;
}

// Enhanced team.js additions
// Add these functions to the existing team.js file

async function loadTeamData() {
  try {
    // Load all data including games
    const [battingResponse, pitchingResponse, awardsResponse, gamesResponse] = await Promise.all([
      fetch("data.json"),
      fetch("pitching.json"),
      fetch("awards.json"),
      fetch("games.json")
    ]);
    
    if (!battingResponse.ok) throw new Error('Failed to load data.json');
    if (!pitchingResponse.ok) {
      console.warn('Failed to load pitching.json - pitching stats will not be available');
    }
    if (!awardsResponse.ok) throw new Error('Failed to load awards.json');
    
    const battingData = await battingResponse.json();
    const pitchingData = pitchingResponse.ok ? await pitchingResponse.json() : [];
    allAwards = await awardsResponse.json();
    const gamesData = gamesResponse.ok ? await gamesResponse.json() : [];
    
    teamData = cleanBattingData(battingData).filter(p => p.team === currentTeam);
    teamPitchingData = cleanPitchingData(pitchingData).filter(p => p.team === currentTeam);
    
    // Filter games for this team
    teamGames = gamesData.filter(g => 
      g["home team"] === currentTeam || g["away team"] === currentTeam
    );
    
    if (teamData.length === 0 && teamPitchingData.length === 0) {
      document.body.innerHTML = `
        <h1>Team "${currentTeam}" not found</h1>
        <p><a href="index.html">Return to main page</a></p>
      `;
      return;
    }

    // Add view switching buttons and game results
    addViewSwitcher();
    addGameResultsSection();
    
    populateFilters();
    switchToView('batting');
  } catch (error) {
    console.error("Error loading team data:", error);
    document.body.innerHTML = `
      <h1>Error loading team data</h1>
      <p>Could not load statistics or awards. Please check that data files are available.</p>
      <p><a href="index.html">Return to main page</a></p>
    `;
  }
}

function addGameResultsSection() {
  if (!teamGames || teamGames.length === 0) return;
  
  // Add game results section after the table
  const table = document.getElementById('team-stats-table');
  
  const gameResultsHTML = `
    <div class="team-game-results" style="margin-top: 30px;">
      <h3>Game Results & Team Record</h3>
      <div id="teamGameResults">
        ${renderTeamGameResults()}
      </div>
    </div>
  `;
  
  table.insertAdjacentHTML('afterend', gameResultsHTML);
}

function renderTeamGameResults() {
  const yearVal = document.getElementById("yearFilter").value;
  const seasonVal = document.getElementById("seasonFilter").value;
  
  // Filter games based on current filters
  let filteredGames = teamGames.filter(game => 
    (yearVal === "All" || game.year === yearVal) &&
    (seasonVal === "All" || game.season === seasonVal)
  );
  
  if (filteredGames.length === 0) {
    return '<p>No games found for the selected filters.</p>';
  }
  
  // Calculate team record
  const record = calculateTeamRecord(filteredGames);
  
  // Separate regular season and playoff games
  const regularGames = filteredGames.filter(g => g.game_type === 'Regular');
  const playoffGames = filteredGames.filter(g => g.game_type === 'Playoff');
  
  let html = `
    <div class="team-record" style="background-color: #f0f0f0; padding: 15px; margin-bottom: 20px; border-radius: 5px; text-align: center;">
      <h4>Team Record: ${record.wins}-${record.losses}-${record.ties} (${record.winPct} Win%)</h4>
      <p>Regular Season: ${record.regular.wins}-${record.regular.losses}-${record.regular.ties} | 
         Playoffs: ${record.playoff.wins}-${record.playoff.losses}-${record.playoff.ties}</p>
    </div>
  `;
  
  // Regular season games
  if (regularGames.length > 0) {
    html += `
      <h4>Regular Season Games (${regularGames.length})</h4>
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 0.9em; border-collapse: collapse;">
          <thead style="position: sticky; top: 0; background-color: #f0f0f0;">
            <tr>
              <th style="padding: 6px; border: 1px solid #ccc;">Date</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Year</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Season</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Opponent</th>
              <th style="padding: 6px; border: 1px solid #ccc;">H/A</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Score</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${regularGames.map(game => renderTeamGameRow(game)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  // Playoff games
  if (playoffGames.length > 0) {
    html += `
      <h4>Playoff Games (${playoffGames.length})</h4>
      <div style="max-height: 300px; overflow-y: auto;">
        <table style="width: 100%; font-size: 0.9em; border-collapse: collapse;">
          <thead style="position: sticky; top: 0; background-color: #f0f0f0;">
            <tr>
              <th style="padding: 6px; border: 1px solid #ccc;">Date</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Year</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Season</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Opponent</th>
              <th style="padding: 6px; border: 1px solid #ccc;">H/A</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Score</th>
              <th style="padding: 6px; border: 1px solid #ccc;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${playoffGames.map(game => renderTeamGameRow(game)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  return html;
}

function renderTeamGameRow(game) {
  const isHome = game["home team"] === currentTeam;
  const opponent = isHome ? game["away team"] : game["home team"];
  const homeAwayText = isHome ? "vs" : "@";
  
  const homeScore = game["home score"];
  const awayScore = game["away score"];
  const forfeit = game.forfeit === "Yes" ? " (Forfeit)" : "";
  
  // Determine result
  let result = "T";
  let resultStyle = "color: #666;";
  
  if (game.winner === currentTeam) {
    result = "W";
    resultStyle = "color: green; font-weight: bold;";
  } else if (game.winner !== "Tie" && !game.winner.includes("Forfeit - Tie")) {
    result = "L";
    resultStyle = "color: red; font-weight: bold;";
  }
  
  // Format score
  let scoreDisplay;
  if (homeScore === "W" || homeScore === "L") {
    scoreDisplay = isHome ? 
      (homeScore === "W" ? "W" : "L") : 
      (awayScore === "W" ? "W" : "L");
  } else {
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    scoreDisplay = `${teamScore}-${oppScore}`;
  }
  
  return `
    <tr>
      <td style="padding: 6px; border: 1px solid #ccc;">${game.date}</td>
      <td style="padding: 6px; border: 1px solid #ccc;">${game.year}</td>
      <td style="padding: 6px; border: 1px solid #ccc;">${game.season}</td>
      <td style="padding: 6px; border: 1px solid #ccc;">${opponent}</td>
      <td style="padding: 6px; border: 1px solid #ccc; text-align: center;">${homeAwayText}</td>
      <td style="padding: 6px; border: 1px solid #ccc; text-align: center;">${scoreDisplay}${forfeit}</td>
      <td style="padding: 6px; border: 1px solid #ccc; text-align: center; ${resultStyle}">${result}</td>
    </tr>
  `;
}

function calculateTeamRecord(games) {
  let wins = 0, losses = 0, ties = 0;
  let regularWins = 0, regularLosses = 0, regularTies = 0;
  let playoffWins = 0, playoffLosses = 0, playoffTies = 0;
  
  games.forEach(game => {
    const isRegular = game.game_type === 'Regular';
    
    if (game.winner === currentTeam) {
      wins++;
      if (isRegular) regularWins++;
      else playoffWins++;
    } else if (game.winner === "Tie" || game.winner.includes("Forfeit - Tie")) {
      ties++;
      if (isRegular) regularTies++;
      else playoffTies++;
    } else {
      losses++;
      if (isRegular) regularLosses++;
      else playoffLosses++;
    }
  });
  
  const totalDecided = wins + losses;
  const winPct = totalDecided > 0 ? (wins / totalDecided).toFixed(3) : '.000';
  
  return {
    wins,
    losses,
    ties,
    winPct,
    regular: { wins: regularWins, losses: regularLosses, ties: regularTies },
    playoff: { wins: playoffWins, losses: playoffLosses, ties: playoffTies }
  };
}

// Update the applyFilters function to refresh game results
function applyFilters() {
  const yearVal = document.getElementById("yearFilter").value;
  const seasonVal = document.getElementById("seasonFilter").value;

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
  
  // Update game results if they exist
  const gameResultsDiv = document.getElementById('teamGameResults');
  if (gameResultsDiv && teamGames) {
    gameResultsDiv.innerHTML = renderTeamGameResults();
  }
}