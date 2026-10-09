// js/admin/rosters-import.js
// Two tabs of admin/rosters.html that place many players at once. Both only
// stage changes; the save bar writes them (and profile teams).
//
//   Import CSV      playerName,team rows (also name / player and teamName).
//   From offseason  offseasonRosters/current.teams copied into the season.
//                   Players who stay keep their number, position, captain flag
//                   and linked account; the old Roster Sync overwrote them.

import { db, doc, getDoc } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { showToast } from '../ui/toast.js';
import { S, teamKey, resolvePlayer, findInSeason, placePlayer, shapePlayer, loadUsers } from './rosters-data.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let hooks = null;
let csvRows = [];
let board = null;          // offseasonRosters/current
let boardPlan = [];        // [{ team, teamName, adds, removes, keeps, exists }]

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('The file needs a header row and at least one player.');
  const head = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const ni = head.findIndex(h => ['playername', 'name', 'player'].includes(h));
  const ti = head.findIndex(h => ['team', 'teamname', 'team name'].includes(h));
  if (ni < 0) throw new Error('Missing a playerName column (or name / player).');
  if (ti < 0) throw new Error('Missing a team column (or teamName).');
  return lines.slice(1).map(l => {
    const c = l.split(',').map(x => x.trim().replace(/^["']|["']$/g, ''));
    return { name: c[ni] || '', team: c[ti] || '' };
  }).filter(r => r.name);
}

function planCsv() {
  return csvRows.map(r => {
    const team = S.teams.get(teamKey(r.team));
    const player = resolvePlayer(r.name);
    const at = findInSeason(player);
    let status;
    if (!team) status = 'unknown-team';
    else if (at && at.team === team) status = 'same';
    else if (at) status = 'move';
    else status = 'add';
    return { ...r, teamText: r.team, team, player, from: at?.team || null, status };
  });
}

export function refreshImport() {
  if (csvRows.length) renderCsv();
  if (board) renderBoard();
}

function renderCsv() {
  const plan = planCsv();
  const n = (s) => plan.filter(r => r.status === s).length;
  const label = { add: ['Add', 'is-win'], move: ['Move', 'is-alert'], same: ['No change', 'is-outline'], 'unknown-team': ['Unknown team', 'is-loss'] };
  $('csvSummary').innerHTML = [['Add', n('add')], ['Move', n('move')], ['No change', n('same')], ['Unknown team', n('unknown-team')]]
    .map(([l, v]) => `<div class="aces-stat"><span class="aces-stat-value">${v}</span><span class="aces-stat-label">${l}</span></div>`).join('');
  $('csvPreview').innerHTML = `<div class="aces-table-wrap"><table class="aces-table ros-plan">
    <thead><tr><th scope="col">Player</th><th scope="col">Team in file</th><th scope="col">Now on</th><th scope="col">Result</th><th scope="col">Player ID</th></tr></thead>
    <tbody>${plan.map(r => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(r.team?.teamName || r.teamText)}</td>
      <td>${esc(r.from?.teamName || '-')}</td>
      <td><span class="aces-badge ${label[r.status][1]}">${label[r.status][0]}</span></td>
      <td class="ros-id">${esc(r.player.id)}${r.player.authId ? ' <span class="aces-badge is-win">Account</span>' : ''}</td></tr>`).join('')}</tbody>
  </table></div>`;
  $('csvReview').hidden = false;
  $('csvApply').disabled = !(n('add') + n('move'));
  const unknown = [...new Set(plan.filter(r => r.status === 'unknown-team').map(r => r.teamText))];
  $('csvNote').textContent = unknown.length
    ? `Teams not in ${S.seasonId}: ${unknown.join(', ')}. Those rows are skipped. Teams come from this season's rosters and schedule.`
    : 'Player IDs come from earlier rosters or linked accounts; anyone new gets an ID made from their name.';
}

function applyCsv() {
  const plan = planCsv().filter(r => r.status === 'add' || r.status === 'move');
  plan.forEach(r => placePlayer(r.player, r.team));
  hooks.changed();
  renderCsv();
  showToast(`${plural(plan.length, 'player')} placed. Review the teams, then save.`, 'success');
}

function readCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      csvRows = parseCsv(String(reader.result || ''));
      renderCsv();
    } catch (err) {
      csvRows = [];
      $('csvReview').hidden = true;
      showToast(err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Offseason board
// ---------------------------------------------------------------------------

function boardTeams() {
  const out = [];
  Object.entries(board?.teams || {}).forEach(([teamName, team]) => {
    const players = Array.isArray(team?.players) ? team.players : Array.isArray(team) ? team : Array.isArray(team?.roster) ? team.roster : [];
    out.push({ teamName, players: players.filter(p => p && p.name) });
  });
  return out.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

function planBoard() {
  const users = S.users || [];
  boardPlan = boardTeams().map(({ teamName, players }) => {
    const t = S.teams.get(teamKey(teamName));
    const current = t ? t.players : [];
    const same = (a, b) => (a.id && b.id && a.id === b.id) || a.name.toLowerCase() === b.name.toLowerCase();
    const incoming = players.map(p => {
      const s = shapePlayer(p);
      if (!s.authId) {
        const u = users.find(x => x.migrated !== true && String(x.linkedPlayer || '').toLowerCase() === s.name.toLowerCase());
        if (u) s.authId = u.uid;
      }
      if (!s.id) s.id = resolvePlayer(s.name).id;
      return s;
    });
    return {
      teamName, team: t, incoming,
      adds: incoming.filter(p => !current.some(c => same(c, p))),
      removes: current.filter(c => !incoming.some(p => same(c, p))),
      keeps: incoming.filter(p => current.some(c => same(c, p)))
    };
  });
}

function renderBoard() {
  planBoard();
  const when = board?.lastModified?.seconds ? new Date(board.lastModified.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  $('offMeta').textContent = `${plural(boardPlan.length, 'team')} on the board${when ? `, last changed ${when}${board.lastModifiedByName ? ` by ${board.lastModifiedByName}` : ''}` : ''}.`;
  const names = (list) => list.length ? list.map(p => esc(p.name)).join(', ') : '<span class="sse-dim">none</span>';
  $('offPlan').innerHTML = boardPlan.length ? `<div class="aces-table-wrap"><table class="aces-table ros-plan">
    <thead><tr><th scope="col">Team</th><th scope="col" class="is-num">Board</th><th scope="col">Adds</th><th scope="col">Comes off</th></tr></thead>
    <tbody>${boardPlan.map(r => `<tr><th scope="row">${esc(r.teamName)}${r.team ? '' : ' <span class="aces-badge is-brand">New team</span>'}</th>
      <td class="is-num">${r.incoming.length}</td><td>${names(r.adds)}</td><td>${names(r.removes)}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="sse-empty">The offseason board has no teams.</p>';
  const changes = boardPlan.reduce((n, r) => n + r.adds.length + r.removes.length, 0);
  $('offApply').disabled = !boardPlan.length;
  $('offApply').textContent = changes ? `Copy into ${S.seasonId} (${plural(changes, 'change')})` : `Copy into ${S.seasonId}`;
}

function applyBoard() {
  for (const r of boardPlan) {
    let t = r.team;
    if (!t) {
      t = { key: teamKey(r.teamName), teamName: r.teamName, docId: `${S.seasonId}-${teamKey(r.teamName)}`, exists: false, players: [], base: '[]' };
      S.teams.set(t.key, t);
    }
    const keepFields = (p) => {
      const old = t.players.find(c => (c.id && c.id === p.id) || c.name.toLowerCase() === p.name.toLowerCase());
      if (!old) return p;
      // Season details already set on the roster win over the board's blanks.
      return { ...p, ...Object.fromEntries(Object.entries(old).filter(([k, v]) => v !== null && v !== '' && v !== '-' && !(k === 'captain' && v === false))), name: p.name };
    };
    const next = r.incoming.map(keepFields);
    // Anyone on the board who is on another team this season moves here.
    next.forEach(p => {
      const at = findInSeason(p);
      if (at && at.team !== t) at.team.players.splice(at.index, 1);
    });
    t.players = $('offReplace').checked ? next : [...t.players.filter(c => !next.some(p => p.id === c.id)), ...next];
  }
  hooks.changed();
  renderBoard();
  showToast('Board copied in. Check the teams, then save.', 'success');
}

async function loadBoard() {
  $('offPlan').innerHTML = '<p class="sse-dim">Loading the offseason board...</p>';
  try {
    await loadUsers();
    const snap = await getDoc(doc(db, 'offseasonRosters', 'current'));
    board = snap.exists() ? snap.data() : { teams: {} };
    renderBoard();
  } catch (err) {
    console.error('[rosters] board failed', err);
    $('offPlan').innerHTML = `<p class="sse-empty">Could not load the offseason board: ${esc(err.message)}</p>`;
  }
}

export function mountImport(h) {
  hooks = h;
  $('csvFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) readCsv(f); });
  const drop = $('csvDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    const f = e.dataTransfer.files[0];
    if (f) readCsv(f);
  });
  $('csvApply').addEventListener('click', applyCsv);
  $('csvClear').addEventListener('click', () => { csvRows = []; $('csvFile').value = ''; $('csvReview').hidden = true; });
  $('offLoad').addEventListener('click', loadBoard);
  $('offApply').addEventListener('click', applyBoard);
  $('offReplace').addEventListener('change', () => board && renderBoard());
  document.querySelector('[data-tab="offseason"]').addEventListener('click', () => { if (!board) loadBoard(); });
}

