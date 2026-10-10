// js/admin/tracker-review.js
// admin/game-tracker-review.html: check a live-tracked game (gameResults)
// and turn it into official stats.
//
//   - The list shows the season's tracked games, pending first.
//   - A game opens with its line score, checks against the schedule (score,
//     runs), and each batter matched to the roster by the ID the tracker
//     stored, then by name. Unmatched batters can be picked by hand.
//   - Convert writes playerStats/{legacyId}/games/{season}_{gameId} (merge),
//     marks the gameResults doc converted and marks the team's stats as in
//     on the schedule game. Date and game type come from the schedule game,
//     so playoff games convert as playoff games.
//   - Plays can be edited (batter, result, delete, reassign the opposing
//     pitcher); saving rebuilds the batting lines on the gameResults doc.
//   - Pitching and hit locations save separately, as before.
// ?season=&id=<gameResults id> opens a game directly.

import { initPage, pageReady } from '../core/app.js';
import { db, collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, serverTimestamp } from '../core/firebase.js';
import { getAllSeasons } from '../data/seasons.js';
import { getTeamRosterDoc } from '../../firebase-roster.js';
import { normalizeGame } from '../domain/standings.js';
import { formatGameDate, toDateKey } from '../domain/dates.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { mountAdminShell } from './shell.js';
import { PLAY_TYPES, PLAY_LABELS, playName, recalculateBattingStats, opposingPitcherStats, lineScore, hitLocations, BATTED } from './tracker-plays.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const toMillis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const nameKey = (s) => String(s || '').trim().toLowerCase();

let user = null;
let seasonId = '';
let results = [];          // gameResults for the season
let schedule = new Map();  // gameId -> raw schedule game
let status = 'pending';
let teamFilter = '';

let game = null;           // the open gameResults doc
let sched = null;          // its schedule game (raw) or null
let roster = [];           // tracked team: { legacyId, authId, name, number }
let oppRoster = [];
let picks = {};            // tracker batter name -> legacyId ('' = skip)
let plays = null;          // edited plays, or null when unchanged
let busy = false;

const workingPlays = () => plays || game?.playByPlay || [];

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function loadSeason(id) {
  seasonId = id;
  $('trList').innerHTML = '<p class="sse-dim">Loading tracked games...</p>';
  const [snap, games] = await Promise.all([
    getDocs(query(collection(db, 'gameResults'), where('seasonId', '==', id))),
    getDocs(collection(db, 'seasons', id, 'games'))
  ]);
  results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  schedule = new Map(games.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
  results.sort((a, b) => (!!a.convertedToOfficial - !!b.convertedToOfficial) || (toMillis(b.completedAt) - toMillis(a.completedAt)));
  const teams = [...new Set(results.map(r => r.teamId).filter(Boolean))].sort();
  $('trTeam').innerHTML = '<option value="">All teams</option>' + teams.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('trTeam').value = teams.includes(teamFilter) ? teamFilter : '';
  renderList();
}

function gameWhen(r) {
  const s = schedule.get(r.gameId);
  if (s?.date) return formatGameDate(s.date);
  const ms = toMillis(r.completedAt);
  return ms ? new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date';
}

function renderList() {
  const pending = results.filter(r => !r.convertedToOfficial).length;
  let list = results;
  if (status === 'pending') list = list.filter(r => !r.convertedToOfficial);
  if (status === 'converted') list = list.filter(r => r.convertedToOfficial);
  if (teamFilter) list = list.filter(r => r.teamId === teamFilter);
  $('trCount').textContent = `${pending} pending of ${results.length}`;
  if (!list.length) {
    $('trList').innerHTML = `<p class="sse-empty">${status === 'pending' && results.length
      ? 'Every tracked game this season is converted. Switch to All to look at one again.'
      : 'No tracked games match.'}</p>`;
    return;
  }
  $('trList').innerHTML = `<ul class="sse-games">${list.map(r => {
    const on = game && game.id === r.id;
    const vs = r.isHome ? 'vs' : 'at';
    const score = r.finalScore ? `${r.finalScore.yourTeam ?? 0}-${r.finalScore.opponent ?? 0}` : '';
    const badge = r.convertedToOfficial ? '<span class="aces-badge is-win">Converted</span>' : '<span class="aces-badge is-alert">Pending</span>';
    return `<li class="sse-game${on ? ' is-on' : ''}">
      <div class="sse-game-info">
        <span class="sse-game-date">${esc(gameWhen(r))}</span>
        <span><strong>${esc(r.teamId || '?')}</strong> ${vs} ${esc(r.opponentName || '?')}</span>
        <span class="sse-game-score">${esc(score)}</span>
      </div>
      <div class="sse-sides">
        <span class="sse-dim">${plural((r.battingStats || []).length, 'batter')}, ${plural((r.playByPlay || []).length, 'play')}</span>
        ${badge}
        <button class="aces-btn is-sm${on ? ' is-primary' : ''}" type="button" data-open="${esc(r.id)}">${on ? 'Open' : 'Review'}</button>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// Open a game
// ---------------------------------------------------------------------------

function matchRoster(b) {
  const pid = b.playerId || '';
  if (pid) {
    const byId = roster.find(p => p.legacyId === pid || (p.authId && p.authId === pid));
    if (byId) return byId;
  }
  const n = nameKey(b.playerName || b.name);
  if (!n) return null;
  const exact = roster.find(p => nameKey(p.name) === n);
  if (exact) return exact;
  const parts = n.split(/\s+/);
  if (parts.length >= 2) {
    return roster.find(p => nameKey(p.name).includes(parts[0]) && nameKey(p.name).includes(parts[parts.length - 1])) || null;
  }
  return null;
}

const byLegacy = (id) => roster.find(p => p.legacyId === id);
const rosterIdForName = (name) => {
  const p = matchRoster({ playerName: name });
  return p?.legacyId || '';
};

async function openGame(id, { scroll = true } = {}) {
  const r = results.find(x => x.id === id);
  if (!r) return;
  game = r;
  sched = schedule.get(r.gameId) || null;
  plays = null;
  history.replaceState(null, '', `?season=${encodeURIComponent(seasonId)}&id=${encodeURIComponent(r.id)}`);
  renderList();
  $('trReview').hidden = false;
  $('trTitle').textContent = `${r.teamId} ${r.isHome ? 'vs' : 'at'} ${r.opponentName || '?'}`;
  $('trMeta').textContent = 'Loading rosters...';
  $('trBat').innerHTML = '';
  if (scroll) $('trReview').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const [mine, theirs] = await Promise.all([
    getTeamRosterDoc(String(r.teamId || ''), r.seasonId).catch(() => []),
    getTeamRosterDoc(String(r.opponentName || ''), r.seasonId).catch(() => [])
  ]);
  const shape = (p) => ({ legacyId: p.legacyId, authId: p.authId || '', name: p.name, number: p.number });
  roster = mine.filter(p => p.legacyId).map(shape).sort((a, b) => a.name.localeCompare(b.name));
  oppRoster = theirs.filter(p => p.legacyId).map(shape).sort((a, b) => a.name.localeCompare(b.name));
  picks = {};
  (r.battingStats || []).forEach(b => { picks[b.playerName || b.name] = matchRoster(b)?.legacyId || ''; });
  renderReview();
}

function renderReview() {
  const r = game;
  const done = !!r.convertedToOfficial;
  const sg = sched ? normalizeGame(sched) : null;
  const when = sched?.date ? formatGameDate(sched.date, 'long') : gameWhen(r);
  $('trMeta').textContent = `${when}${sg?.type === 'playoff' ? ', playoff' : ''}, ${r.innings || '?'} innings, ${seasonLabel(r.seasonId)}`;
  $('trState').innerHTML = done
    ? `<span class="aces-badge is-win">Converted</span> <span class="sse-dim">${toMillis(r.convertedAt) ? new Date(toMillis(r.convertedAt)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}${r.convertedByName ? ` by ${esc(r.convertedByName)}` : ''}</span>`
    : '<span class="aces-badge is-alert">Pending</span>';
  $('trConvert').textContent = done ? 'Convert again' : 'Convert to official stats';
  $('trConvert').classList.toggle('is-primary', !done);
  renderLine();
  renderChecks();
  renderBatting();
  renderPlays();
  renderPitching();
  renderHits();
}

function renderLine() {
  const r = game;
  const ls = lineScore(workingPlays(), r.innings);
  const ourTotal = r.finalScore?.yourTeam ?? Object.values(ls.ours).reduce((a, b) => a + b, 0);
  const oppTotal = r.finalScore?.opponent ?? Object.values(ls.theirs).reduce((a, b) => a + b, 0);
  const row = (name, runs, total, mine) => `<tr${mine ? ' class="is-mine"' : ''}><th scope="row">${esc(name)}</th>${Array.from({ length: ls.innings }, (_, i) => `<td class="is-num">${runs[i + 1] ?? '-'}</td>`).join('')}<td class="is-num tr-r">${esc(total)}</td></tr>`;
  const away = r.isHome ? row(r.opponentName || 'Opponent', ls.theirs, oppTotal, false) : row(r.teamId, ls.ours, ourTotal, true);
  const home = r.isHome ? row(r.teamId, ls.ours, ourTotal, true) : row(r.opponentName || 'Opponent', ls.theirs, oppTotal, false);
  $('trLine').innerHTML = workingPlays().length ? `<div class="aces-table-wrap"><table class="aces-table tr-line">
    <thead><tr><th scope="col"></th>${Array.from({ length: ls.innings }, (_, i) => `<th class="is-num" scope="col">${i + 1}</th>`).join('')}<th class="is-num" scope="col">R</th></tr></thead>
    <tbody>${away}${home}</tbody></table></div>` : '<p class="sse-dim">No plays recorded, so there is no line score.</p>';
}

function renderChecks() {
  const r = game;
  const out = [];
  const bat = r.battingStats || [];
  const ours = Number(r.finalScore?.yourTeam ?? 0), theirs = Number(r.finalScore?.opponent ?? 0);
  if (!sched) {
    out.push(['warn', `No schedule game ${esc(r.gameId || '(none)')} in ${esc(seasonLabel(r.seasonId))}. Stats will still be written, dated from when tracking finished.`]);
  } else {
    const g = normalizeGame(sched);
    if (g.hasScores) {
      const sOurs = r.isHome ? g.homeScore : g.awayScore;
      const sTheirs = r.isHome ? g.awayScore : g.homeScore;
      if (Number(sOurs) === ours && Number(sTheirs) === theirs) out.push(['ok', `Score matches the schedule (${ours}-${theirs}).`]);
      else out.push(['warn', `Tracked score ${ours}-${theirs}, but the schedule has ${esc(sOurs)}-${esc(sTheirs)} for ${esc(r.teamId)}.`]);
    } else {
      out.push(['warn', 'The schedule game has no score yet.']);
    }
    const side = r.isHome ? 'statsSubmittedHome' : 'statsSubmittedAway';
    if (sched.statsSubmitted === true || sched[side] === true) out.push(['ok', `${esc(r.teamId)}'s stats are marked as in on the schedule.`]);
  }
  const runs = bat.reduce((s, b) => s + (Number(b.runs) || 0), 0);
  if (bat.length) out.push(runs === ours ? ['ok', `Batters' runs add up to ${ours}.`] : ['warn', `Batters' runs add up to ${runs}, not ${ours}. The tracker sometimes misses who scored; fix the plays or correct it in Enter stats after converting.`]);
  const unmatched = bat.filter(b => !picks[b.playerName || b.name]).length;
  out.push(unmatched ? ['warn', `${plural(unmatched, 'batter')} not matched to the roster. Pick them below or they are skipped.`] : ['ok', `All ${plural(bat.length, 'batter')} matched to the roster.`]);
  if (plays) out.push(['warn', 'You have unsaved play edits. Save them before converting so the batting lines match.']);
  $('trChecks').innerHTML = out.map(([k, t]) => `<li class="tr-check is-${k}">${icon(k === 'ok' ? 'check' : 'alert')}<span>${t}</span></li>`).join('');
}

function renderBatting() {
  const bat = game.battingStats || [];
  if (!bat.length) { $('trBat').innerHTML = '<p class="sse-empty">No batting lines on this tracked game.</p>'; return; }
  const opts = (sel) => `<option value="">Skip</option>${roster.map(p => `<option value="${esc(p.legacyId)}"${p.legacyId === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  const cols = [['atBats', 'AB'], ['hits', 'H'], ['doubles', '2B'], ['triples', '3B'], ['homeRuns', 'HR'], ['runs', 'R'], ['rbi', 'RBI'], ['walks', 'BB'], ['strikeouts', 'K']];
  const tot = (f) => bat.reduce((s, b) => s + (Number(b[f]) || 0), 0);
  $('trBat').innerHTML = `<div class="aces-table-wrap"><table class="aces-table tr-bat">
    <thead><tr><th scope="col">Tracked as</th><th scope="col">Roster player</th>${cols.map(([, l]) => `<th class="is-num" scope="col">${l}</th>`).join('')}</tr></thead>
    <tbody>${bat.map((b, i) => {
      const nm = b.playerName || b.name || 'Unknown';
      const pick = picks[nm] || '';
      return `<tr class="${pick ? '' : 'is-skip'}"><th scope="row">${esc(nm)}</th>
        <td><span class="aces-select-wrap"><select class="aces-select" data-pick="${i}" aria-label="Roster player for ${esc(nm)}">${opts(pick)}</select></span></td>
        ${cols.map(([f]) => `<td class="is-num">${Number(b[f]) || 0}</td>`).join('')}</tr>`;
    }).join('')}</tbody>
    <tfoot><tr><th scope="row">Team</th><td></td>${cols.map(([f]) => `<td class="is-num">${tot(f)}</td>`).join('')}</tr></tfoot>
  </table></div>`;
}

// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------

function gameContext() {
  const r = game, s = sched;
  const isPlayoff = s ? (s.game_type === 'Playoff' || s.gameType === 'playoff' || s.gameType === 'Playoff') : false;
  return {
    gameId: r.gameId, gameDocId: `${r.seasonId}_${r.gameId}`, seasonId: r.seasonId,
    gameDate: s?.date || r.completedAt || null,
    gameDateFormatted: toDateKey(s?.date) || toDateKey(r.completedAt) || '',
    gameType: s ? (s.game_type || s.gameType || 'Regular') : 'Regular',
    isPlayoff
  };
}

async function convert() {
  if (!game || busy) return;
  const bat = game.battingStats || [];
  if (!bat.length) { showToast('No batting lines to convert', 'error'); return; }
  if (!game.gameId) { showToast('This tracked game has no schedule game ID', 'error'); return; }
  if (plays && !(await confirmModal('You have unsaved play edits. Convert the saved batting lines anyway?', { confirmLabel: 'Convert anyway' }))) return;
  const skip = bat.filter(b => !picks[b.playerName || b.name]).map(b => b.playerName || b.name);
  const chosen = bat.map(b => picks[b.playerName || b.name]).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) { showToast('Two tracked batters point at the same roster player', 'error'); return; }
  const again = !!game.convertedToOfficial;
  const msg = [
    again ? 'This game was already converted. Converting again overwrites these players\' stats for the game with the tracked lines, including anything fixed in Enter stats since.' : '',
    skip.length ? `Not matched, so skipped: ${skip.join(', ')}.` : ''
  ].filter(Boolean).join(' ');
  if (msg && !(await confirmModal(msg, { danger: again, confirmLabel: again ? 'Convert again' : 'Convert' }))) return;

  busy = true;
  const btn = $('trConvert');
  btn.disabled = true;
  btn.textContent = 'Converting...';
  const ctx = gameContext();
  let ok = 0, failed = 0;
  await Promise.all(bat.map(async (b) => {
    const legacyId = picks[b.playerName || b.name];
    if (!legacyId) return;
    const p = byLegacy(legacyId);
    try {
      await setDoc(doc(db, 'playerStats', legacyId, 'games', ctx.gameDocId), {
        gameId: ctx.gameId, gameDocId: ctx.gameDocId, playerId: legacyId, playerName: p?.name || b.playerName,
        seasonId: ctx.seasonId, teamId: game.teamId,
        gameDate: ctx.gameDate, gameDateFormatted: ctx.gameDateFormatted,
        opponent: game.opponentName || 'Unknown', isHome: game.isHome || false,
        gameType: ctx.gameType, isPlayoff: ctx.isPlayoff,
        atBats: b.atBats || 0, hits: b.hits || 0, runs: b.runs || 0, walks: b.walks || 0,
        doubles: b.doubles || 0, triples: b.triples || 0, homeRuns: b.homeRuns || 0, rbi: b.rbi || 0,
        strikeouts: b.strikeouts || 0, stolenBases: 0, caughtStealing: 0,
        submittedBy: user.uid, submittedByName: user.displayName || user.email,
        submittedAt: serverTimestamp(), lastModified: serverTimestamp(), dataVersion: 1,
        sourceType: 'gameTracker', sourceDocId: game.id
      }, { merge: true });
      ok++;
    } catch (err) {
      console.error(`[tracker-review] ${b.playerName} failed`, err);
      failed++;
    }
  }));

  try {
    const stats = { playersConverted: ok, playersSkipped: skip.length, errors: failed };
    await updateDoc(doc(db, 'gameResults', game.id), {
      convertedToOfficial: true, convertedAt: serverTimestamp(),
      convertedBy: user.uid, convertedByName: user.displayName || user.email,
      conversionStats: stats
    });
    Object.assign(game, { convertedToOfficial: true, convertedAt: { seconds: Date.now() / 1000 }, convertedByName: user.displayName || user.email, conversionStats: stats });
    if (sched && !failed) {
      const side = game.isHome ? 'statsSubmittedHome' : 'statsSubmittedAway';
      await updateDoc(doc(db, 'seasons', game.seasonId, 'games', game.gameId), {
        [side]: true, statsSubmittedBy: user.uid, statsSubmittedByName: user.displayName || user.email,
        statsSubmittedAt: serverTimestamp(), statsSubmittedForTeam: game.teamId
      }).then(() => { sched[side] = true; }).catch(err => console.warn('[tracker-review] could not mark the schedule game', err));
    }
  } catch (err) {
    console.error('[tracker-review] could not mark converted', err);
    failed++;
  }

  busy = false;
  btn.disabled = false;
  if (failed) showToast(`Converted ${ok}, ${failed} failed. See the console.`, 'error');
  else showToast(`Converted ${plural(ok, 'player')}`, 'success');
  renderReview();
  renderList();
}

// ---------------------------------------------------------------------------
// Plays
// ---------------------------------------------------------------------------

function renderPlays() {
  const list = workingPlays();
  $('trPlayCount').textContent = `${plural(list.length, 'play')}${plays ? ', unsaved edits' : ''}`;
  $('trPlaysSave').hidden = !plays;
  $('trPlaysUndo').hidden = !plays;
  if (!list.length) { $('trPlays').innerHTML = '<p class="sse-dim">No plays recorded.</p>'; return; }
  const byInning = new Map();
  list.forEach((p, i) => {
    const key = `${p.inning || 1}${p.isYourTeam === false ? 'b' : 'a'}`;
    if (!byInning.has(key)) byInning.set(key, { inning: p.inning || 1, ours: p.isYourTeam !== false, rows: [] });
    byInning.get(key).rows.push([p, i]);
  });
  $('trPlays').innerHTML = [...byInning.values()].map(grp => `<section class="tr-inning">
    <h4>Inning ${grp.inning}, ${esc(grp.ours ? game.teamId : (game.opponentName || 'Opponent'))}</h4>
    <ol class="tr-plays">${grp.rows.map(([p, i]) => p.type === 'manual-run-adjustment' ? `<li data-play="${i}">
      <span class="tr-n">${i + 1}</span>
      <span class="tr-play">Runs entered by hand: <strong>${esc((p.adjustment > 0 ? '+' : '') + (p.adjustment ?? 0))}</strong></span>
      <span class="tr-play-btns"><button class="aces-btn is-sm is-ghost" type="button" data-act="del" aria-label="Delete play ${i + 1}">${icon('trash')}</button></span>
    </li>` : `<li data-play="${i}">
      <span class="tr-n">${i + 1}</span>
      <span class="tr-play"><strong>${esc(p.batter || 'Unknown')}</strong> ${esc(playName(p.playType))}${p.runsScored ? ` <span class="tr-runs">${plural(p.runsScored, 'run')}</span>` : ''}${p.opposingPitcher?.name ? ` <span class="sse-dim">vs ${esc(p.opposingPitcher.name)}</span>` : ''}${p.location ? ` <span class="aces-badge is-outline">${esc(p.location)}</span>` : ''}</span>
      <span class="tr-play-btns"><button class="aces-btn is-sm is-ghost" type="button" data-act="edit">Edit</button><button class="aces-btn is-sm is-ghost" type="button" data-act="del" aria-label="Delete play ${i + 1}">${icon('trash')}</button></span>
    </li>`).join('')}</ol></section>`).join('');
}

function editPlayRow(li, i) {
  const p = workingPlays()[i];
  const ours = p.isYourTeam !== false;
  const names = ours ? roster.map(x => x.name) : oppRoster.map(x => x.name);
  if (p.batter && !names.includes(p.batter)) names.unshift(p.batter);
  li.querySelector('.tr-play').innerHTML = `<span class="tr-edit">
    <span class="aces-select-wrap"><select class="aces-select" data-f="batter" aria-label="Batter">${names.map(n => `<option${n === p.batter ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></span>
    <span class="aces-select-wrap"><select class="aces-select" data-f="type" aria-label="Result">${PLAY_TYPES.map(([v, l]) => `<option value="${v}"${v === p.playType ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span>
  </span>`;
  li.querySelector('.tr-play-btns').innerHTML = '<button class="aces-btn is-sm is-primary" type="button" data-act="ok">Done</button><button class="aces-btn is-sm is-ghost" type="button" data-act="cancel">Cancel</button>';
}

async function onPlayClick(e) {
  const b = e.target.closest('[data-act]');
  const li = e.target.closest('[data-play]');
  if (!b || !li) return;
  const i = Number(li.dataset.play);
  const act = b.dataset.act;
  if (act === 'edit') return editPlayRow(li, i);
  if (act === 'cancel') return renderPlays();
  const list = [...workingPlays()];
  if (act === 'ok') {
    const type = li.querySelector('[data-f="type"]').value;
    const batter = li.querySelector('[data-f="batter"]').value;
    list[i] = { ...list[i], playType: type, playLabel: PLAY_LABELS[type] || type, ...(batter ? { batter } : {}) };
  } else if (act === 'del') {
    const p = list[i];
    const what = p.type === 'manual-run-adjustment' ? `runs entered by hand (${p.adjustment ?? 0})` : `${p.batter || 'Unknown'}, ${playName(p.playType)}${p.runsScored ? ` (removes ${plural(p.runsScored, 'run')})` : ''}`;
    if (!(await confirmModal(`Delete play ${i + 1}: ${what}?`, { danger: true, confirmLabel: 'Delete play' }))) return;
    list.splice(i, 1);
  } else return;
  plays = list;
  afterPlayChange();
}

function afterPlayChange() {
  renderPlays();
  renderLine();
  renderChecks();
  renderPitching();
  renderHits();
}

function reassignPitcher() {
  const from = parseInt($('trFrom').value, 10) - 1;
  const pick = oppRoster.find(p => p.legacyId === $('trNewPitcher').value);
  const list = [...workingPlays()];
  if (!pick || isNaN(from) || from < 0 || from >= list.length) { showToast('Pick a play number and a pitcher', 'error'); return; }
  let n = 0;
  for (let i = from; i < list.length; i++) {
    if (list[i].isYourTeam === false) continue;   // only our at-bats face their pitcher
    list[i] = { ...list[i], opposingPitcher: { id: pick.legacyId, name: pick.name } };
    n++;
  }
  plays = list;
  $('trReassign').open = false;
  afterPlayChange();
  showToast(`${plural(n, 'play')} now face ${pick.name}`, 'success');
}

async function savePlays() {
  if (!plays || busy) return;
  busy = true;
  $('trPlaysSave').disabled = true;
  try {
    const bat = recalculateBattingStats(plays.filter(p => p.isYourTeam !== false), rosterIdForName);
    await updateDoc(doc(db, 'gameResults', game.id), {
      playByPlay: plays, battingStats: bat,
      lastEditedAt: serverTimestamp(), lastEditedBy: user.uid, lastEditedByName: user.displayName || user.email
    });
    game.playByPlay = plays;
    game.battingStats = bat;
    plays = null;
    picks = {};
    bat.forEach(b => { picks[b.playerName] = matchRoster(b)?.legacyId || ''; });
    showToast('Plays saved and batting lines rebuilt', 'success');
    renderReview();
    if (game.convertedToOfficial) showToast('Convert again to update the official stats', 'info');
  } catch (err) {
    console.error('[tracker-review] save plays failed', err);
    showToast(`Could not save: ${err.message}`, 'error');
  } finally {
    busy = false;
    $('trPlaysSave').disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Pitching
// ---------------------------------------------------------------------------

function pitcherRow(i, ip = 0, ra = 0) {
  return `<div class="tr-prow" data-prow>
    <div class="aces-field"><label class="aces-label" for="trP${i}">Pitcher</label>
      <span class="aces-select-wrap"><select class="aces-select" id="trP${i}" data-p="who"><option value="">Pick a pitcher</option>${roster.map(p => `<option value="${esc(p.legacyId)}">${esc(p.name)}${p.number ? ` #${esc(p.number)}` : ''}</option>`).join('')}</select></span></div>
    <div class="aces-field"><label class="aces-label" for="trIp${i}">IP</label><input class="sse-in" id="trIp${i}" data-p="ip" type="number" min="0" step="0.1" value="${ip}"></div>
    <div class="aces-field"><label class="aces-label" for="trRa${i}">R</label><input class="sse-in" id="trRa${i}" data-p="ra" type="number" min="0" value="${ra}"></div>
    <div class="aces-field"><label class="aces-label" for="trK${i}">K</label><input class="sse-in" id="trK${i}" data-p="k" type="number" min="0" value="0"></div>
    ${i ? '<button class="aces-btn is-sm is-ghost" type="button" data-premove>Remove</button>' : ''}
  </div>`;
}

function renderPitching() {
  const opp = opposingPitcherStats(workingPlays());
  $('trOppName').textContent = `${game.opponentName || 'Opponent'} pitchers`;
  $('trOurName').textContent = `${game.teamId} pitchers`;
  $('trOpp').innerHTML = opp.length ? `<div class="aces-table-wrap"><table class="aces-table tr-pit">
    <thead><tr><th scope="col">Pitcher</th><th class="is-num">IP</th><th class="is-num">H</th><th class="is-num">R</th><th class="is-num">BB</th><th class="is-num">K</th><th class="is-num">HR</th></tr></thead>
    <tbody>${opp.map(p => `<tr><th scope="row">${esc(p.name)}</th><td class="is-num">${p.ip}</td><td class="is-num">${p.hits}</td><td class="is-num">${p.runs}</td><td class="is-num">${p.walks}</td><td class="is-num">${p.strikeouts}</td><td class="is-num">${p.homeRuns}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="sse-dim">The tracker recorded no opposing pitcher for these plays.</p>';
  if (!$('trOurs').dataset.game || $('trOurs').dataset.game !== game.id) {
    $('trOurs').dataset.game = game.id;
    $('trOurs').innerHTML = pitcherRow(0, game.innings || 0, game.finalScore?.opponent || 0);
  }
  $('trNewPitcher').innerHTML = '<option value="">Pick a pitcher</option>' + oppRoster.map(p => `<option value="${esc(p.legacyId)}">${esc(p.name)}${p.number ? ` #${esc(p.number)}` : ''}</option>`).join('');
}

async function pitcherLegacyId(id, name) {
  const fromRoster = [...oppRoster, ...roster].find(p => p.legacyId === id || (p.authId && p.authId === id));
  if (fromRoster) return fromRoster.legacyId;
  if (/^[a-z][a-z_]+$/.test(id)) return id;
  try {
    const u = await getDoc(doc(db, 'users', id));
    if (u.exists()) {
      const d = u.data();
      if (d.mergedFromProfile) return d.mergedFromProfile;
      if (d.migrated && d.migratedTo) {
        const real = await getDoc(doc(db, 'users', d.migratedTo));
        if (real.exists() && real.data().mergedFromProfile) return real.data().mergedFromProfile;
      }
    }
  } catch (err) { console.warn('[tracker-review] pitcher lookup failed', err); }
  return String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
}

async function savePitching() {
  if (busy) return;
  busy = true;
  const ctx = gameContext();
  const base = {
    gameId: ctx.gameId, gameDocId: ctx.gameDocId, seasonId: ctx.seasonId,
    gameDate: ctx.gameDate, gameDateFormatted: ctx.gameDateFormatted, gameType: ctx.gameType, isPlayoff: ctx.isPlayoff,
    earnedRuns: 0, wins: 0, losses: 0, saves: 0,
    submittedBy: user.uid, submittedByName: user.displayName || user.email,
    submittedAt: serverTimestamp(), lastModified: serverTimestamp(), dataVersion: 1, sourceType: 'gameTrackerReview'
  };
  let saved = 0;
  const errors = [];
  for (const p of opposingPitcherStats(workingPlays())) {
    try {
      const id = await pitcherLegacyId(p.id, p.name);
      await setDoc(doc(db, 'pitchingStats', id, 'games', ctx.gameDocId), {
        ...base, playerId: id, playerName: p.name, teamId: game.opponentName || '', opponent: game.teamId, isHome: !game.isHome,
        inningsPitched: p.ipNum, runsAllowed: p.runs, strikeouts: p.strikeouts, walks: p.walks, hits: p.hits, homeRuns: p.homeRuns
      }, { merge: true });
      saved++;
    } catch (err) { console.error(err); errors.push(p.name); }
  }
  for (const row of document.querySelectorAll('[data-prow]')) {
    const id = row.querySelector('[data-p="who"]').value;
    if (!id) continue;
    const p = byLegacy(id);
    try {
      await setDoc(doc(db, 'pitchingStats', id, 'games', ctx.gameDocId), {
        ...base, playerId: id, playerName: p?.name || id, teamId: game.teamId, opponent: game.opponentName || 'Unknown', isHome: game.isHome || false,
        inningsPitched: parseFloat(row.querySelector('[data-p="ip"]').value) || 0,
        runsAllowed: parseInt(row.querySelector('[data-p="ra"]').value, 10) || 0,
        strikeouts: parseInt(row.querySelector('[data-p="k"]').value, 10) || 0,
        walks: 0, hits: 0
      }, { merge: true });
      saved++;
    } catch (err) { console.error(err); errors.push(p?.name || id); }
  }
  busy = false;
  $('trPitStatus').textContent = errors.length ? `Saved ${saved}, failed: ${errors.join(', ')}` : `Saved ${plural(saved, 'pitcher')}.`;
  showToast(errors.length ? 'Some pitching saves failed' : `Saved ${plural(saved, 'pitcher')}`, errors.length ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// Hit locations
// ---------------------------------------------------------------------------

function renderHits() {
  const list = workingPlays();
  const by = hitLocations(list);
  const tagged = list.filter(p => p.location && BATTED.has(p.playType)).length;
  const batted = list.filter(p => BATTED.has(p.playType)).length;
  $('trHitCount').textContent = tagged ? `${tagged} of ${batted} batted balls tagged` : 'none tagged';
  $('trHitsWrite').disabled = !tagged;
  if (!tagged) { $('trHits').innerHTML = '<p class="sse-dim">No hit zones were tagged in this game.</p>'; return; }
  $('trHits').innerHTML = `<div class="aces-table-wrap"><table class="aces-table tr-hits">
    <thead><tr><th scope="col">Batter</th><th scope="col">Roster</th><th class="is-num" scope="col">Tagged</th><th scope="col">Zones</th></tr></thead>
    <tbody>${Object.entries(by).map(([name, locs]) => {
      const m = matchRoster({ playerName: name });
      return `<tr><th scope="row">${esc(name)}</th><td>${m ? `<span class="sse-dim">${esc(m.legacyId)}</span>` : '<span class="aces-badge is-alert">No match</span>'}</td>
        <td class="is-num">${locs.length}</td><td>${locs.map(l => `<span class="aces-badge is-outline">${esc(l.location)}</span>`).join(' ')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

async function writeHits() {
  if (busy) return;
  const by = hitLocations(workingPlays());
  const ctx = gameContext();
  busy = true;
  let written = 0, skipped = 0, errors = 0;
  for (const [name, locs] of Object.entries(by)) {
    const m = matchRoster({ playerName: name });
    if (!m) { skipped++; continue; }
    try {
      await setDoc(doc(db, 'playerStats', m.legacyId, 'games', ctx.gameDocId), {
        hitLocations: locs, hitLocationUpdatedAt: serverTimestamp()
      }, { merge: true });
      // Spray charts on scouting and player pages read sprayChartData by auth UID, else legacy ID.
      await setDoc(doc(db, 'sprayChartData', m.authId || m.legacyId), {
        gamePlays: { [ctx.gameDocId]: locs.map(l => ({
          result: ['single', 'double', 'triple', 'homerun'].includes(l.playType) ? 'Hit' : 'Out',
          zone: l.location, playType: l.playType, inning: l.inning || null, source: 'game-tracker'
        })) },
        gameTrackerUpdatedAt: serverTimestamp()
      }, { merge: true });
      written++;
    } catch (err) { console.error(err); errors++; }
  }
  busy = false;
  showToast(`Hit locations written for ${plural(written, 'player')}${skipped ? `, ${skipped} unmatched skipped` : ''}${errors ? `, ${errors} failed` : ''}`, errors ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function bind() {
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
    status = b.dataset.status;
    document.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));
  $('trTeam').addEventListener('change', (e) => { teamFilter = e.target.value; renderList(); });
  $('trRefresh').addEventListener('click', () => loadSeason(seasonId));
  $('trList').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openGame(b.dataset.open); });
  $('trClose').addEventListener('click', () => {
    game = null;
    $('trReview').hidden = true;
    history.replaceState(null, '', `?season=${encodeURIComponent(seasonId)}`);
    renderList();
  });
  $('trBat').addEventListener('change', (e) => {
    const s = e.target.closest('[data-pick]');
    if (!s) return;
    const b = game.battingStats[Number(s.dataset.pick)];
    picks[b.playerName || b.name] = s.value;
    s.closest('tr').classList.toggle('is-skip', !s.value);
    renderChecks();
  });
  $('trConvert').addEventListener('click', convert);
  $('trPlays').addEventListener('click', onPlayClick);
  $('trPlaysSave').addEventListener('click', savePlays);
  $('trPlaysUndo').addEventListener('click', () => { plays = null; afterPlayChange(); });
  $('trReassignGo').addEventListener('click', reassignPitcher);
  $('trAddPitcher').addEventListener('click', () => {
    const n = document.querySelectorAll('[data-prow]').length;
    $('trOurs').insertAdjacentHTML('beforeend', pitcherRow(n));
  });
  $('trOurs').addEventListener('click', (e) => { if (e.target.closest('[data-premove]')) e.target.closest('[data-prow]').remove(); });
  $('trPitSave').addEventListener('click', savePitching);
  $('trHitsWrite').addEventListener('click', writeHits);
  window.addEventListener('beforeunload', (e) => { if (busy || plays) { e.preventDefault(); e.returnValue = ''; } });
}

async function main() {
  const ctx = await initPage({ title: 'Review tracked games', role: 'admin', deniedMessage: 'Reviewing tracked games is for admins.' });
  if (!ctx?.user) return;
  user = ctx.user;
  mountAdminShell(ctx.profile, 'admin/game-tracker-review.html');

  const seasons = (await getAllSeasons()).sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, ctx.config?.previousSeasonId, seasons[0]?.id]
    .find(id => id && seasons.some(s => s.id === id));
  const sel = $('trSeason');
  sel.innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}</option>`).join('');
  if (start) sel.value = start;
  sel.addEventListener('change', async () => {
    game = null;
    $('trReview').hidden = true;
    history.replaceState(null, '', `?season=${encodeURIComponent(sel.value)}`);
    await loadSeason(sel.value);
  });

  bind();
  pageReady();
  if (!start) return;
  await loadSeason(start);
  const id = params.get('id');
  if (id && results.some(r => r.id === id)) {
    if (results.find(r => r.id === id).convertedToOfficial && status === 'pending') {
      status = 'all';
      document.querySelectorAll('[data-status]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.status === 'all')));
    }
    await openGame(id);
  }
}

main().catch(err => {
  console.error('[tracker-review] start failed', err);
  pageReady();
  $('trList').innerHTML = `<p class="sse-empty">Could not load: ${esc(err.message || err)}</p>`;
});
