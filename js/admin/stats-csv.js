// js/admin/stats-csv.js
// The "CSV, many games" tab of admin/submit-stats.html: one team, many games
// in one file. The parsing, game ID building and the Firestore writes are the
// old page's, unchanged (playerStats/{legacyId}/games/{season}_{gameId} and
// pitchingStats/..., merge writes, bulkImport: true).

import { db, doc, setDoc, serverTimestamp } from '../core/firebase.js';
import { getSeasonPlayerStatsOptimized } from '../data/player-stats.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const HEADER = 'Player,GameDate,Opponent,IsHome,GameType,GameNum,AB,H,R,BB,HR,IP,RA';

let ctx = null;          // { user, teams, seasonId() }
let rows = [];
let checks = [];

function setStatus(type, text) {
  const el = $('csvStatus');
  if (!text) { el.hidden = true; el.innerHTML = ''; return; }
  const ic = type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warning' ? 'alert' : 'info';
  el.className = `aces-notice is-${type}`;
  el.innerHTML = `${icon(ic)}<div>${esc(text)}</div>`;
  el.hidden = false;
}

// Opponent text from a CSV to the team ID used in game doc IDs.
// "TEAL" -> "teal", "Aces Silver" -> "silver".
function normalizeOpponent(raw) {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();
  const teams = ctx.teams;
  const exactId = teams.find(t => t.id.toLowerCase() === lower);
  if (exactId) return exactId.id.toLowerCase();
  const exactName = teams.find(t => (t.name || '').toLowerCase() === lower);
  if (exactName) return exactName.id.toLowerCase();
  const fuzzy = teams.find(t => {
    const tid = t.id.toLowerCase();
    const tname = (t.name || '').toLowerCase();
    return lower.includes(tid) || tid.includes(lower) || (tname && (lower.includes(tname) || tname.includes(lower)));
  });
  if (fuzzy) return fuzzy.id.toLowerCase();
  return lower.replace(/\s+/g, '_');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function validate(row) {
  const errors = [], warnings = [];
  if (!row.player) errors.push('Missing player name');
  if (!row.gamedate) errors.push('Missing game date');
  if (!row.opponent) errors.push('Missing opponent');
  if (row.gamedate && isNaN(new Date(row.gamedate).getTime())) errors.push('Invalid date');
  ['ab', 'h', 'r', 'bb', 'hr', 'ip', 'ra'].forEach(f => {
    if (row[f] && isNaN(parseFloat(row[f]))) warnings.push(`Invalid ${f.toUpperCase()}`);
  });
  const ab = parseInt(row.ab || row.atbat) || 0, h = parseInt(row.h || row.hits) || 0;
  if (h > ab) warnings.push('More hits than at bats');
  return { valid: !errors.length, errors, warnings };
}

function parse(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) { setStatus('error', 'The file needs a header row and at least one player row.'); return; }
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const missing = ['player', 'gamedate', 'opponent'].filter(c => !header.includes(c));
  if (missing.length) { setStatus('error', `Missing columns: ${missing.join(', ')}.`); return; }
  rows = []; checks = [];
  for (const line of lines.slice(1)) {
    const vals = parseCsvLine(line);
    const row = {};
    header.forEach((c, i) => { row[c] = (vals[i] || '').trim(); });
    rows.push(row);
    checks.push(validate(row));
  }
  render();
}

const gameKey = (row) => `${row.gamedate}_${row.opponent}_${row.ishome?.toLowerCase()}`;

function render() {
  const bad = checks.filter(c => !c.valid).length;
  const warn = checks.filter(c => c.valid && c.warnings.length).length;
  const games = new Set(rows.map(gameKey)).size;
  $('csvSummary').innerHTML = [
    ['Rows', rows.length], ['Games', games], ['Warnings', warn], ['Errors', bad]
  ].map(([l, v]) => `<div class="aces-stat"><span class="aces-stat-value">${v}</span><span class="aces-stat-label">${l}</span></div>`).join('');
  const cell = (v) => esc(v || '0');
  $('csvPreview').innerHTML = `<div class="aces-table-wrap"><table class="aces-table sse-csv-table">
    <thead><tr><th></th><th>Player</th><th>Date</th><th>Opponent</th><th>Home</th><th>Type</th>
      <th class="is-num">AB</th><th class="is-num">H</th><th class="is-num">R</th><th class="is-num">BB</th><th class="is-num">HR</th><th class="is-num">IP</th><th class="is-num">RA</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const c = checks[i];
      const msg = [...c.errors, ...c.warnings].join(', ');
      const st = !c.valid ? `<span class="aces-badge is-loss" title="${esc(msg)}">Error</span>`
        : c.warnings.length ? `<span class="aces-badge is-alert" title="${esc(msg)}">Check</span>`
        : `<span class="aces-badge is-win">OK</span>`;
      return `<tr><td>${st}</td><th scope="row">${esc(r.player || '-')}</th><td>${esc(r.gamedate || '-')}</td><td>${esc(r.opponent || '-')}</td>
        <td>${esc(r.ishome || '-')}</td><td>${esc(r.gametype || 'Regular')}</td>
        <td class="is-num">${cell(r.ab || r.atbat)}</td><td class="is-num">${cell(r.h || r.hits)}</td><td class="is-num">${cell(r.r || r.runs)}</td>
        <td class="is-num">${cell(r.bb)}</td><td class="is-num">${cell(r.hr)}</td><td class="is-num">${cell(r.ip)}</td><td class="is-num">${cell(r.ra)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  $('csvReview').hidden = false;
  setStatus(bad ? 'error' : 'info', bad
    ? `${bad} row${bad === 1 ? ' has' : 's have'} errors. Fix the file and upload it again.`
    : `Ready to save ${rows.length} player rows across ${games} game${games === 1 ? '' : 's'}. Hover a Check badge to see why.`);
  $('csvSave').disabled = !!bad;
}

function clear() {
  rows = []; checks = [];
  $('csvFile').value = '';
  $('csvReview').hidden = true;
  setStatus('', '');
}

async function save() {
  const sel = $('csvTeam');
  const teamId = sel.value;
  const teamName = sel.selectedOptions[0]?.text || teamId;
  const seasonId = ctx.seasonId();
  if (!teamId) { setStatus('error', 'Pick the team this file is for.'); return; }
  if (!rows.length || checks.some(c => !c.valid)) return;

  const btn = $('csvSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const user = ctx.user;
  let ok = 0, failed = 0;

  // Group by date + opponent + home so a doubleheader splits into two games
  const groups = {};
  rows.forEach(row => {
    const k = gameKey(row);
    if (!groups[k]) groups[k] = {
      date: row.gamedate, opponent: row.opponent,
      isHome: row.ishome?.toLowerCase() === 'true',
      isPlayoff: row.gametype?.toLowerCase() === 'playoff',
      rows: []
    };
    groups[k].rows.push(row);
  });

  for (const game of Object.values(groups)) {
    // Game ID convention: M_D_YYYY_home_vs_away (no zero padding). Date parts are
    // read directly so evening games don't roll over in UTC.
    let y, m, d;
    if (game.date.includes('/')) [m, d, y] = game.date.split('/');
    else [y, m, d] = game.date.split('-');
    const dateStr = `${parseInt(m)}_${parseInt(d)}_${y}`;
    const opp = normalizeOpponent(game.opponent);
    const oppTeam = ctx.teams.find(t => t.id.toLowerCase() === opp);
    const oppDisplay = oppTeam?.name || oppTeam?.id || game.opponent;
    const home = game.isHome ? teamId.toLowerCase() : opp;
    const away = game.isHome ? opp : teamId.toLowerCase();
    const gameId = `${dateStr}_${home}_vs_${away}`.replace(/\s+/g, '_');
    const gameDocId = `${seasonId}_${gameId}`;

    for (const row of game.rows) {
      try {
        const legacyId = row.player.toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');
        const ab = parseInt(row.ab) || parseInt(row.atbat) || 0;
        const h = parseInt(row.h) || parseInt(row.hits) || 0;
        const r = parseInt(row.r) || parseInt(row.runs) || 0;
        const bb = parseInt(row.bb) || 0;
        const common = {
          gameId, gameDocId, playerId: legacyId, playerName: row.player, seasonId, teamId: teamName,
          gameDate: new Date(game.date), gameDateFormatted: game.date, opponent: oppDisplay,
          isHome: game.isHome, gameType: game.isPlayoff ? 'Playoff' : 'Regular', isPlayoff: game.isPlayoff,
          submittedBy: user.uid, submittedByName: user.displayName || user.email,
          submittedAt: serverTimestamp(), lastModified: serverTimestamp(), dataVersion: 1, bulkImport: true
        };
        if (ab > 0 || h > 0 || r > 0 || bb > 0) {
          await setDoc(doc(db, 'playerStats', legacyId, 'games', gameDocId), {
            ...common, atBats: ab, hits: h, runs: r, walks: bb, doubles: 0, triples: 0,
            homeRuns: parseInt(row.hr) || 0, rbi: 0, strikeouts: 0, stolenBases: 0, caughtStealing: 0
          }, { merge: true });
        }
        const ip = parseFloat(row.ip) || 0;
        const ra = parseInt(row.ra) || 0;
        if (ip > 0 || ra > 0) {
          await setDoc(doc(db, 'pitchingStats', legacyId, 'games', gameDocId), {
            ...common, inningsPitched: ip, runsAllowed: ra, earnedRuns: 0, strikeouts: 0,
            walks: 0, hits: 0, wins: 0, losses: 0, saves: 0
          }, { merge: true });
        }
        ok++;
      } catch (err) {
        console.error(`[csv] ${row.player} failed`, err);
        failed++;
      }
    }
  }

  btn.textContent = 'Save all rows';
  btn.disabled = false;
  const nGames = Object.keys(groups).length;
  if (!failed) {
    showToast(`Saved ${ok} player rows across ${nGames} games`, 'success');
    clear();
    setStatus('success', `Saved ${ok} player rows across ${nGames} game${nGames === 1 ? '' : 's'}. Mark the games' stats as in from the pipeline when you're done.`);
  } else {
    setStatus('warning', `Saved ${ok} rows, but ${failed} failed. Check the browser console for details.`);
  }
}

async function template() {
  const teamId = $('csvTeam').value;
  const seasonId = ctx.seasonId();
  const download = (text, name) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  if (!teamId) {
    download(`${HEADER}\nJohn Smith,2026-09-15,Blue,true,Regular,1,0,0,0,0,0,0,0\n`, 'stats_template.csv');
    return;
  }
  try {
    const players = (await getSeasonPlayerStatsOptimized(seasonId))
      .filter(p => (p.team || '').toLowerCase() === teamId.toLowerCase() && !p.migrated);
    const date = new Date().toISOString().slice(0, 10);
    const lines = players.map(p => `${p.name || p.playerName},${date},OPPONENT,true,Regular,1,0,0,0,0,0,0,0`);
    download(`${HEADER}\n${lines.join('\n')}\n`, `stats_template_${teamId}.csv`);
    showToast(`Template has ${players.length} players`, 'success');
  } catch (err) {
    console.error('[csv] template failed', err);
    setStatus('error', 'Could not build the template. Try again.');
  }
}

/**
 * @param {object} options
 * @param {object} options.user       signed-in Firebase user
 * @param {Array}  options.teams      teams collection docs {id, name}
 * @param {Function} options.seasonId returns the season picked at the top of the page
 */
export function mountCsv(options) {
  ctx = options;
  $('csvTeam').innerHTML = '<option value="">Pick a team</option>' +
    ctx.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name || t.id)}</option>`).join('');
  $('csvFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ''));
    reader.readAsText(f);
  });
  const drop = $('csvDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    const f = e.dataTransfer.files[0];
    if (!f || !f.name.toLowerCase().endsWith('.csv')) { setStatus('error', 'Drop a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ''));
    reader.readAsText(f);
  });
  $('csvSave').addEventListener('click', save);
  $('csvClear').addEventListener('click', clear);
  $('csvTemplate').addEventListener('click', template);
}
