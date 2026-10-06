let allData = [];
let currentSort = { column: null, dir: "asc" };

fetch("data.json")
  .then(res => res.json())
  .then(data => {
    allData = cleanData(data);
    populateFilters(allData);
    renderTable(allData);
  })
  .catch(error => {
    console.error("Error loading data:", error);
    document.body.innerHTML = "<h1>Error loading statistics data. Please check that data.json is available.</h1>";
  });

// Trim whitespace and normalize data
function cleanData(data) {
  return data.map(p => ({
    ...p,
    name: p.name ? p.name.trim() : "",
    team: p.team ? p.team.trim() : "",
    season: p.season ? p.season.trim() : "",
    year: p.year ? String(p.year).trim() : "",
    games: Number(p.games) || 0,
    atBats: Number(p.atBats) || 0,
    hits: Number(p.hits) || 0,
    runs: Number(p.runs) || 0,
    walks: Number(p.walks) || 0,
    AcesWar: p.AcesWar === "N/A" || !p.AcesWar ? "N/A" : Number(p.AcesWar),
    Sub: p.Sub || p.sub || "" // Handle both "Sub" and "sub" cases
  }));
}

// Alias for compatibility if needed
const cleanBattingData = cleanData;

// ==================== CALCULATION UTILITIES ====================

function calculateBattingAverage(hits, atBats) {
  return atBats > 0 ? (hits / atBats).toFixed(3) : ".000";
}

function calculateOBP(hits, walks, atBats) {
  const plateAppearances = atBats + walks;
  const onBaseEvents = hits + walks;
  return plateAppearances > 0 ? (onBaseEvents / plateAppearances).toFixed(3) : ".000";
}

// ==================== LINK GENERATION UTILITIES ====================

function createPlayerLink(playerName) {
  return `<a href="player.html?name=${encodeURIComponent(playerName)}">${playerName}</a>`;
}

function createTeamLink(teamName) {
  return `<a href="team.html?team=${encodeURIComponent(teamName)}">${teamName}</a>`;
}

// ==================== TEXT UTILITIES ====================

function cleanText(text) {
  if (!text) return text;
  
  return text
    .replace(/['']/g, "'")  // Replace smart apostrophes
    .replace(/[""]/g, '"')  // Replace smart quotes
    .replace(/â€™/g, "'")   // Common apostrophe encoding issue
    .replace(/â€"/g, "—")   // Em dash
    .replace(/â€"/g, "–");  // En dash
}

// Dropdown filters
function populateFilters(data) {
  const years = [...new Set(data.map(p => p.year))].sort((a, b) => b - a); // Sort descending
  const seasons = [...new Set(data.map(p => p.season))].sort();

  const yearFilter = document.getElementById("yearFilter");
  const seasonFilter = document.getElementById("seasonFilter");

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

// Apply filters
function applyFilters() {
  const yearVal = document.getElementById("yearFilter").value;
  const seasonVal = document.getElementById("seasonFilter").value;

  let filtered = allData.filter(
    p =>
      (yearVal === "All" || p.year === yearVal) &&
      (seasonVal === "All" || p.season === seasonVal)
  );

  renderTable(filtered);
}

// Render table
function renderTable(data) {
  const tbody = document.querySelector("#statsTable tbody");
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13">No data matches the current filters.</td></tr>';
    document.getElementById("totalsText").textContent = "No data to display.";
    document.getElementById("leadersText").textContent = "";
    return;
  }

  // Calculate totals
  let totals = {
    games: 0,
    atBats: 0,
    hits: 0,
    runs: 0,
    walks: 0,
  };

  data.forEach(p => {
    totals.games += p.games;
    totals.atBats += p.atBats;
    totals.hits += p.hits;
    totals.runs += p.runs;
    totals.walks += p.walks;
  });

  // Find leaders - only consider players with meaningful at-bats for average stats
  const qualifyingPlayers = data.filter(p => p.atBats >= 10);
  let leaders = {};
  
  // Counting stats leaders
  ["games", "atBats", "hits", "runs", "walks"].forEach(stat => {
    let maxPlayer = data.reduce((prev, curr) =>
      curr[stat] > prev[stat] ? curr : prev,
      { [stat]: -1 }
    );
    leaders[stat] = maxPlayer.name ? `${maxPlayer.name} (${maxPlayer[stat]})` : "N/A";
  });

  // Batting Average leader (minimum 10 at-bats)
  let bestBA = qualifyingPlayers.reduce((prev, curr) => {
    let currBA = curr.atBats > 0 ? curr.hits / curr.atBats : 0;
    let prevBA = prev.atBats > 0 ? prev.hits / prev.atBats : 0;
    return currBA > prevBA ? curr : prev;
  }, { atBats: 0, hits: 0 });
  leaders.BA = bestBA.name ? 
    `${bestBA.name} (${(bestBA.hits / bestBA.atBats).toFixed(3)})` : "N/A";

  // On-Base Percentage leader (minimum 10 plate appearances)
  let bestOBP = qualifyingPlayers.reduce((prev, curr) => {
    let currOBP = (curr.atBats + curr.walks) > 0 
      ? (curr.hits + curr.walks) / (curr.atBats + curr.walks) 
      : 0;
    let prevOBP = (prev.atBats + prev.walks) > 0 
      ? (prev.hits + prev.walks) / (prev.atBats + prev.walks) 
      : 0;
    return currOBP > prevOBP ? curr : prev;
  }, { atBats: 0, hits: 0, walks: 0 });
  leaders.OBP = bestOBP.name ? 
    `${bestOBP.name} (${((bestOBP.hits + bestOBP.walks) / (bestOBP.atBats + bestOBP.walks)).toFixed(3)})` : "N/A";

  // AcesBPI leader
  let bestWAR = data.reduce((prev, curr) => {
    let currWAR = (curr.AcesWar !== "N/A" && !isNaN(curr.AcesWar)) ? Number(curr.AcesWar) : -Infinity;
    let prevWAR = (prev.AcesWar !== "N/A" && !isNaN(prev.AcesWar)) ? Number(prev.AcesWar) : -Infinity;
    return currWAR > prevWAR ? curr : prev;
  }, { AcesWar: -Infinity });
  leaders.AcesWar = bestWAR.name ? 
    `${bestWAR.name} (${Number(bestWAR.AcesWar).toFixed(2)})` : "N/A";

  // Update summary text with proper em-dashes
  document.getElementById("totalsText").textContent =
    `Totals — Games: ${totals.games}, At Bats: ${totals.atBats}, Hits: ${totals.hits}, Runs: ${totals.runs}, Walks: ${totals.walks}`;

  document.getElementById("leadersText").innerHTML = `
    Season Leaders — Games: ${leaders.games}, At Bats: ${leaders.atBats}, Hits: ${leaders.hits}, Runs: ${leaders.runs}, Walks: ${leaders.walks}, BA: ${leaders.BA}, OBP: ${leaders.OBP}, AcesBPI: ${leaders.AcesWar}<br>
    <a href="leaders.html" style="color: #0066cc; text-decoration: none; font-weight: normal;">Career Leaders →</a>
  `;

  // Generate table rows
  data.forEach(p => {
    const row = document.createElement("tr");
    
    // Use the new utility functions
    const BA = calculateBattingAverage(p.hits, p.atBats);
    const OBP = calculateOBP(p.hits, p.walks, p.atBats);
    
    const AcesWar = p.AcesWar !== "N/A" && !isNaN(p.AcesWar)
      ? Number(p.AcesWar).toFixed(2)
      : "N/A";

    row.innerHTML = `
      <td><a href="player.html?name=${encodeURIComponent(p.name)}">${p.name}</a></td>
      <td><a href="team.html?team=${encodeURIComponent(p.team)}">${p.team}</a></td>
      <td>${p.year}</td>
      <td>${p.season}</td>
      <td>${p.games}</td>
      <td>${p.atBats}</td>
      <td>${p.hits}</td>
      <td>${p.runs}</td>
      <td>${p.walks}</td>
      <td>${AcesWar}</td>
      <td>${BA}</td>
      <td>${OBP}</td>
      <td>${p.Sub || ""}</td>
    `;
    tbody.appendChild(row);
  });

  attachSorting();
}
// Clean up the summary text with cleanText() utility:
document.getElementById("totalsText").textContent = cleanText(
  `Totals — Games: ${totals.games}, At Bats: ${totals.atBats}, Hits: ${totals.hits}, Runs: ${totals.runs}, Walks: ${totals.walks}`
);
// Sorting functionality
function attachSorting() {
  const headers = document.querySelectorAll("#statsTable th");
  headers.forEach((th, idx) => {
    th.onclick = () => sortTable(idx, th.getAttribute("data-field"));
  });
}

function sortTable(columnIndex, field) {
  const table = document.getElementById("statsTable");
  const rows = Array.from(table.rows).slice(1); // Skip header

  let dir = currentSort.column === field && currentSort.dir === "asc" ? "desc" : "asc";
  currentSort = { column: field, dir };

  rows.sort((a, b) => {
    let x = a.cells[columnIndex].innerText.trim();
    let y = b.cells[columnIndex].innerText.trim();

    // Handle special cases
    if (field === "AceBPI" || field === "BA" || field === "OBP") {
      // Move N/A values to the end
      if (x === "N/A" && y !== "N/A") return 1;
      if (y === "N/A" && x !== "N/A") return -1;
      if (x === "N/A" && y === "N/A") return 0;
    }

    // Try parsing as numbers first
    let xNum = parseFloat(x.replace(/,/g, ""));
    let yNum = parseFloat(y.replace(/,/g, ""));

    if (!isNaN(xNum) && !isNaN(yNum)) {
      return dir === "asc" ? xNum - yNum : yNum - xNum;
    }

    // Fall back to string comparison
    return dir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
  });

  // Re-append sorted rows
  rows.forEach(row => table.tBodies[0].appendChild(row));

  // Update sort indicators
  document.querySelectorAll("#statsTable th").forEach(th => th.classList.remove("asc", "desc"));
  table.rows[0].cells[columnIndex].classList.add(dir);
}



