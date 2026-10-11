// js/pages/playoffs.js
// playoffs.html: the season's playoff bracket.
//
//   Projected   before the bracket is locked, seeds come from the current
//               standings (js/domain/standings.js)
//   Official    once league staff lock it, seeds are frozen (lockedSeeds) and
//               every game has a doc in seasons/{id}/games
//               (playoff_{seriesId}_g{n}), so it shows on the schedule
//
// League staff (View As aware), current season only: set the format and
// dates (playoffs-format.js), publish placeholder games, lock the bracket,
// enter series scores, and pull in scores already entered on the game docs.
// Everyone: share the bracket as an image (playoffs-share.js).
//
// URL: playoffs.html[?seasonId=2026-summer]. Data: seasons/{id}/playoffs/bracket
// (shape described in playoffs-format.js) and seasons/{id}/games.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc, setDoc, updateDoc, collection, Timestamp } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmModal, alertModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { normalizeGames, computeStandings } from '../domain/standings.js';
import { formatGameDate, formatTime } from '../domain/dates.js';
import { seasonLabel, parseStatSeasonId } from '../domain/season-ids.js';
import {
  ROUND_KEYS, ROUND_TITLES, allSeries, generateBracket, recount, missingDates, editFormat
} from './playoffs-format.js';
import { drawBracket, openShare } from './playoffs-share.js';

const $ = (id) => document.getElementById(id);
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

const S = {
  sid: '', label: '', staff: false, current: false,
  data: null, saved: false,       // bracket doc, and whether it exists yet
  standings: [], gameDocs: new Map(),
  unsynced: 0, scoring: false
};

const bracketRef = () => doc(db, 'seasons', S.sid, 'playoffs', 'bracket');
const gamesCol = () => collection(db, 'seasons', S.sid, 'games');
const gameId = (s, g) => `playoff_${s.id}_g${g.gameNum}`;
const projected = () => S.data?.isProjected !== false;
const findSeries = (id) => allSeries(S.data).find((s) => s.id === id) || null;

// ---------------------------------------------------------------------------
// Teams in the bracket
// ---------------------------------------------------------------------------

function seedTeam(seed) {
  if (!projected() && Array.isArray(S.data.lockedSeeds)) {
    const t = S.data.lockedSeeds.find((x) => x.seed === seed);
    if (t) return { seed, name: t.teamName || t.teamId || `Seed ${seed}`, record: t.record || '', real: true };
  }
  const r = S.standings[seed - 1];
  return r ? { seed, name: r.team, record: r.games ? recordText(r) : '', real: true } : { seed, name: `Seed ${seed}`, record: '', real: false };
}

/** A slot ({ seed } or { from }) as { seed, name, record, real }. */
function team(slot) {
  if (!slot) return { seed: '', name: 'TBD', record: '', real: false };
  if (slot.seed) return seedTeam(slot.seed);
  const from = slot.from ? findSeries(slot.from) : null;
  if (from?.winner) return team(from.winner === 1 ? from.team1 : from.team2);
  if (from) return { seed: '', name: `Winner ${shortName(from.team1)}/${shortName(from.team2)}`, record: '', real: false };
  return { seed: '', name: 'TBD', record: '', real: false };
}

function shortName(slot) {
  if (!slot) return 'TBD';
  if (slot.seed) return projected() ? String(slot.seed) : seedTeam(slot.seed).name;
  const from = slot.from ? findSeries(slot.from) : null;
  if (from?.winner) return shortName(from.winner === 1 ? from.team1 : from.team2);
  return from ? from.id.toUpperCase() : 'TBD';
}

/** Name written on placeholder game docs before seeds are final. */
function placeholderName(slot) {
  if (slot?.seed) return `Seed ${slot.seed}`;
  const from = slot?.from ? findSeries(slot.from) : null;
  if (from?.team1?.seed && from?.team2?.seed) return `${from.team1.seed}v${from.team2.seed} Winner`;
  return 'TBD';
}

function teamHtml(t) {
  const k = String(t.name || '').toLowerCase();
  const dot = t.real ? `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>` : '';
  const name = t.real && !/^Seed \d+$/.test(t.name)
    ? `<a href="team.html?${esc(new URLSearchParams({ team: t.name }).toString())}">${esc(t.name)}</a>`
    : `<span class="po-tbd">${esc(t.name)}</span>`;
  return `${dot}${name}`;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function load() {
  const [docs, snap] = await Promise.all([
    getSeasonGames(S.sid).catch((err) => { console.warn('[playoffs] games unavailable', err); return []; }),
    getDoc(bracketRef()).catch((err) => { console.warn('[playoffs] bracket unavailable', err); return null; })
  ]);
  S.gameDocs = new Map(docs.map((d) => [d.id, d]));
  const games = normalizeGames(docs);
  S.standings = computeStandings(games, { extras: false, includeScheduled: true }).filter((r) => r.team && r.team !== 'TBD' && !/^Seed \d+$/.test(r.team) && !/Winner/.test(r.team));

  if (snap && snap.exists()) {
    S.data = snap.data();
    S.saved = true;
  } else {
    S.data = generateBracket({ teams: Math.max(2, S.standings.length || 8) });
    S.saved = false;
  }
  mergeGameScores();
  recount(S.data);
}

/** Scores entered on the game docs (Submit score) that the bracket doc lacks. */
function mergeGameScores() {
  S.unsynced = 0;
  for (const s of allSeries(S.data)) {
    for (const g of s.games || []) {
      if (g.team1Score !== null && g.team1Score !== undefined) continue;
      const d = S.gameDocs.get(gameId(s, g));
      const hs = Number(d?.homeScore);
      const as = Number(d?.awayScore);
      if (!d || d.homeScore === null || d.awayScore === null || d.homeScore === undefined || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
      g.team1Score = g.homeTeam === 1 ? hs : as;
      g.team2Score = g.homeTeam === 1 ? as : hs;
      S.unsynced += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function seriesStatus(s) {
  const t1 = team(s.team1);
  const t2 = team(s.team2);
  const w1 = s.seriesWins1 || 0;
  const w2 = s.seriesWins2 || 0;
  const n = (s.games || []).length;
  if (s.winner) return `${s.winner === 1 ? t1.name : t2.name} won ${Math.max(w1, w2)}-${Math.min(w1, w2)}`;
  if (w1 + w2 === 0) return n === 1 ? 'One game' : `Best of ${n}`;
  if (w1 === w2) return `Tied ${w1}-${w2}`;
  return `${w1 > w2 ? t1.name : t2.name} leads ${Math.max(w1, w2)}-${Math.min(w1, w2)}`;
}

function gameChip(s, g) {
  const played = g.team1Score !== null && g.team1Score !== undefined && g.team2Score !== null && g.team2Score !== undefined;
  let text;
  if (played) text = `${g.team1Score}-${g.team2Score}`;
  else if (s.winner && g.ifNecessary) text = 'Not needed';
  else if (g.date) text = `${formatGameDate(g.date)}${g.time ? ` \u00b7 ${formatTime(g.time)}` : ''}`;
  else text = 'Date TBD';
  const cls = played ? 'is-played' : g.ifNecessary ? 'is-maybe' : '';
  return `<li class="${cls}"><b>G${g.gameNum}</b><span>${esc(text)}</span>${g.ifNecessary && !played && !s.winner ? '<small>if nec.</small>' : ''}</li>`;
}

function seriesCard(s, key) {
  const t1 = team(s.team1);
  const t2 = team(s.team2);
  const row = (t, wins, side) => `<div class="po-team${s.winner === side ? ' is-win' : s.winner ? ' is-out' : ''}">
      <span class="po-seed">${esc(t.seed || '')}</span>
      <span class="po-name">${teamHtml(t)}${projected() && t.record ? `<small>${esc(t.record)}</small>` : ''}</span>
      <span class="po-wins">${wins || 0}</span>
    </div>`;
  const editable = S.scoring && !projected();
  return `<article class="po-series${key === 'finals' ? ' is-final' : ''}${s.winner ? ' is-done' : ''}${editable ? ' is-edit' : ''}"${editable ? ` data-score="${esc(s.id)}" tabindex="0" role="button" aria-label="Enter scores for ${esc(t1.name)} vs ${esc(t2.name)}"` : ''}>
    <header><span class="po-sid">${esc(s.id.toUpperCase())}</span><span class="po-sstate">${esc(seriesStatus(s))}</span></header>
    ${row(t1, s.seriesWins1, 1)}
    ${row(t2, s.seriesWins2, 2)}
    <ul class="po-games">${(s.games || []).map((g) => gameChip(s, g)).join('')}</ul>
  </article>`;
}

function renderBracket() {
  const rounds = ROUND_KEYS.filter((k) => (S.data[k] || []).length);
  $('poBracket').innerHTML = rounds.length
    ? `<div class="po-bracket" style="--po-cols:${rounds.length}">${rounds.map((k) => `<section class="po-round">
        <h2 class="po-round-title">${k === 'finals' ? icon('trophy') : ''}${esc(ROUND_TITLES[k])}</h2>
        <div class="po-round-list">${S.data[k].map((s) => seriesCard(s, k)).join('')}</div>
      </section>`).join('')}</div>`
    : `<div class="aces-card"><div class="aces-empty">${icon('trophy')}<p>No bracket yet.</p></div></div>`;
}

function renderChampion() {
  const f = (S.data.finals || [])[0];
  if (!f?.winner) { $('poChampion').innerHTML = ''; return; }
  const champ = team(f.winner === 1 ? f.team1 : f.team2);
  const runner = team(f.winner === 1 ? f.team2 : f.team1);
  const k = champ.name.toLowerCase();
  $('poChampion').innerHTML = `<section class="aces-card po-champ"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>
    <span class="po-champ-icon">${icon('trophy')}</span>
    <div><span class="aces-page-kicker">${esc(S.label)} champion</span>
      <h2 class="po-champ-name">${teamHtml(champ)}</h2>
      <p>Beat ${esc(runner.name)} ${esc(`${Math.max(f.seriesWins1, f.seriesWins2)}-${Math.min(f.seriesWins1, f.seriesWins2)}`)} in the finals.</p></div>
  </section>`;
}

function renderStatus() {
  const locked = !projected();
  const when = S.data.lockedAt ? new Date(S.data.lockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  $('poStatus').innerHTML = locked
    ? `<div class="aces-notice is-success">${icon('lock')}<div><strong>Official bracket.</strong> Seeds were locked${when ? ` on ${esc(when)}` : ''}.</div></div>`
    : `<div class="aces-notice">${icon('info')}<div><strong>Projected bracket.</strong> Seeds follow the current standings until league staff lock the bracket.</div></div>`;

  if (!S.staff) { $('poStaff').innerHTML = ''; return; }
  const btn = (act, label, ic, extra = '') => `<button type="button" class="aces-btn is-sm${extra}" data-act="${act}">${icon(ic)}${label}</button>`;
  const missing = missingDates(S.data).length;
  $('poStaff').innerHTML = `<section class="aces-card po-staff">
    <div class="po-staff-head"><strong>${icon('shield')}League staff</strong>
      <span class="aces-hint">${locked ? 'Enter scores series by series; game docs and later rounds update too.' : `${S.saved ? 'Format saved.' : 'Format not saved yet.'}${missing ? ` ${missing} game${missing === 1 ? '' : 's'} still need a date.` : ' Every game has a date.'}`}</span></div>
    <div class="po-staff-btns">
      ${locked ? '' : btn('format', 'Format and dates', 'settings', ' is-primary')}
      ${locked ? '' : btn('publish', 'Publish placeholder games', 'calendar')}
      ${locked ? '' : btn('lock', 'Lock bracket', 'lock')}
      ${locked ? btn('scores', S.scoring ? 'Done entering scores' : 'Enter scores', 'edit', S.scoring ? ' is-primary' : '') : ''}
      ${S.unsynced ? btn('sync', `Save ${S.unsynced} score${S.unsynced === 1 ? '' : 's'} from game results`, 'refresh', ' is-accent') : ''}
    </div>
    ${S.scoring ? '<p class="aces-hint">Tap a series to enter its game scores.</p>' : ''}
  </section>`;
}

function renderSeeds() {
  const n = S.data.format?.teams || (projected() ? S.standings.length : (S.data.lockedSeeds || []).length);
  const firstRound = new Map();
  ROUND_KEYS.forEach((k) => (S.data[k] || []).forEach((s) => [s.team1, s.team2].forEach((t) => { if (t?.seed && !firstRound.has(t.seed)) firstRound.set(t.seed, k); })));
  const rows = Array.from({ length: n }, (_, i) => seedTeam(i + 1)).filter((t) => t.real || !projected());
  if (!rows.length) { $('poSeeds').innerHTML = ''; return; }
  $('poSeeds').innerHTML = `<section class="aces-card po-seeds">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('list')}Seeds</h2>
      ${projected() ? '<a class="aces-section-link" href="projections.html">Seed odds</a>' : ''}</div>
    <div class="aces-table-wrap"><table class="aces-table is-compact">
      <thead><tr><th scope="col">Seed</th><th scope="col">Team</th><th scope="col">Record</th><th scope="col">Starts in</th></tr></thead>
      <tbody>${rows.map((t) => `<tr><td>${t.seed}</td><th scope="row">${teamHtml(t)}</th><td>${esc(t.record || '-')}</td>
        <td>${esc(ROUND_TITLES[firstRound.get(t.seed)] || '-')}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function render() {
  renderStatus();
  renderChampion();
  renderBracket();
  renderSeeds();
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

const clean = (v) => JSON.parse(JSON.stringify(v));   // Firestore rejects undefined

async function saveBracket() {
  await setDoc(bracketRef(), clean(S.data));
  S.saved = true;
}

function gameTimestamp(g) {
  const [y, m, d] = g.date.split('-').map(Number);
  const [hh, mm] = g.time.split(':').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d, hh, mm));
}

async function needDates() {
  const missing = missingDates(S.data);
  if (!missing.length) return false;
  await alertModal(`These games still need a date and time: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? `, and ${missing.length - 12} more` : ''}.\n\nSet them in Format and dates first.`, { title: 'Dates missing' });
  return true;
}

async function actFormat() {
  const label = (slot) => {
    if (slot?.seed) { const t = seedTeam(slot.seed); return t.real ? `${slot.seed} ${t.name}` : `Seed ${slot.seed}`; }
    return slot?.from ? `Winner ${slot.from.toUpperCase()}` : 'TBD';
  };
  const next = await editFormat(S.data, { teamCount: S.standings.length, label });
  if (!next) return;
  S.data = recount(next);
  try {
    await saveBracket();
    showToast('Playoff format saved.', 'success');
  } catch (err) {
    console.error('[playoffs] save format', err);
    showToast("Couldn't save the format.", 'error');
  }
  render();
}

async function actPublish() {
  if (await needDates()) return;
  const count = allSeries(S.data).reduce((n, s) => n + s.games.length, 0);
  if (!(await confirmModal(`Add ${count} placeholder playoff games to the schedule so players can see the dates? Teams show as seeds or "TBD" until the bracket is locked.`, { title: 'Publish placeholder games', confirmLabel: 'Publish' }))) return;
  try {
    await saveBracket();
    for (const s of allSeries(S.data)) {
      const n1 = placeholderName(s.team1);
      const n2 = placeholderName(s.team2);
      for (const g of s.games) {
        await setDoc(doc(gamesCol(), gameId(s, g)), {
          gameType: 'playoff', round: s.round, seriesId: s.id, gameNum: g.gameNum,
          date: gameTimestamp(g), time: formatTime(g.time),
          homeTeamName: g.homeTeam === 1 ? n1 : n2,
          awayTeamName: g.homeTeam === 1 ? n2 : n1,
          ifNecessary: !!g.ifNecessary, isPlaceholder: true,
          homeScore: null, awayScore: null, winner: null
        }, { merge: true });
      }
    }
    showToast(`Published ${count} placeholder games.`, 'success');
  } catch (err) {
    console.error('[playoffs] publish', err);
    showToast("Publishing stopped partway. Try again; games already added are kept.", 'error');
  }
}

async function actLock() {
  if (await needDates()) return;
  const n = S.data.format?.teams || S.standings.length;
  const seeds = S.standings.slice(0, n);
  if (seeds.length < n) { await alertModal(`The bracket needs ${n} teams but the standings have ${seeds.length}.`, { title: "Can't lock yet" }); return; }
  const list = seeds.map((r, i) => `${i + 1}. ${r.team} (${recordText(r)})`).join('\n\n');
  if (!(await confirmModal(`Lock the bracket with these seeds?\n\n${list}\n\nThis creates every playoff game on the schedule and can't be undone here.`, { title: 'Lock bracket', confirmLabel: 'Lock bracket', danger: true }))) return;
  S.data.isProjected = false;
  S.data.lockedAt = new Date().toISOString();
  S.data.lockedSeeds = seeds.map((r, i) => ({ seed: i + 1, teamName: r.team, teamId: r.team, record: recordText(r) }));
  try {
    await saveBracket();
    for (const s of allSeries(S.data)) {
      const t1 = team(s.team1).name;
      const t2 = team(s.team2).name;
      for (const g of s.games) {
        await setDoc(doc(gamesCol(), gameId(s, g)), {
          gameType: 'playoff', round: s.round, seriesId: s.id, gameNum: g.gameNum,
          date: gameTimestamp(g), time: formatTime(g.time),
          homeTeamName: g.homeTeam === 1 ? t1 : t2,
          awayTeamName: g.homeTeam === 1 ? t2 : t1,
          ifNecessary: !!g.ifNecessary,
          homeScore: null, awayScore: null, winner: null
        });
      }
    }
    showToast('Bracket locked. Playoff games are on the schedule.', 'success');
  } catch (err) {
    console.error('[playoffs] lock', err);
    showToast("Locking stopped partway. Reload and check the schedule before trying again.", 'error');
  }
  render();
}

/** Later-round game docs pick up the team that just won a series. */
async function updateDependents(seriesId) {
  for (const s of allSeries(S.data)) {
    if (s.team1?.from !== seriesId && s.team2?.from !== seriesId) continue;
    const t1 = team(s.team1).name;
    const t2 = team(s.team2).name;
    for (const g of s.games || []) {
      try {
        await updateDoc(doc(gamesCol(), gameId(s, g)), { homeTeamName: g.homeTeam === 1 ? t1 : t2, awayTeamName: g.homeTeam === 1 ? t2 : t1 });
      } catch (err) { console.warn(`[playoffs] couldn't update ${gameId(s, g)}`, err); }
    }
  }
}

async function writeSeriesGames(s) {
  const t1 = team(s.team1).name;
  const t2 = team(s.team2).name;
  for (const g of s.games) {
    if (g.team1Score === null && g.team2Score === null) continue;
    const homeScore = g.homeTeam === 1 ? g.team1Score : g.team2Score;
    const awayScore = g.homeTeam === 1 ? g.team2Score : g.team1Score;
    const home = g.homeTeam === 1 ? t1 : t2;
    const away = g.homeTeam === 1 ? t2 : t1;
    const updates = { homeScore, awayScore };
    if (homeScore !== null && awayScore !== null && homeScore !== awayScore) updates.winner = homeScore > awayScore ? home : away;
    try { await updateDoc(doc(gamesCol(), gameId(s, g)), updates); }
    catch (err) { console.warn(`[playoffs] couldn't update ${gameId(s, g)}`, err); }
  }
}

async function actScore(seriesId) {
  const s = findSeries(seriesId);
  if (!s) return;
  const t1 = team(s.team1).name;
  const t2 = team(s.team2).name;
  const body = document.createElement('div');
  body.className = 'po-score-form';
  body.innerHTML = s.games.map((g) => `<fieldset class="po-score-game">
    <legend>Game ${g.gameNum}${g.ifNecessary ? ' (if necessary)' : ''} <small>${g.date ? esc(formatGameDate(g.date)) : 'Date TBD'}${g.time ? ` \u00b7 ${esc(formatTime(g.time))}` : ''}</small></legend>
    <label><span>${esc(t1)}</span><input class="aces-input" type="number" min="0" inputmode="numeric" data-g="${g.gameNum}" data-t="1" value="${g.team1Score ?? ''}"></label>
    <label><span>${esc(t2)}</span><input class="aces-input" type="number" min="0" inputmode="numeric" data-g="${g.gameNum}" data-t="2" value="${g.team2Score ?? ''}"></label>
  </fieldset>`).join('');
  const ok = await openModal({
    title: `${t1} vs ${t2}`, body,
    actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, variant: 'primary' }]
  });
  if (!ok) return;
  const before = s.winner;
  s.games.forEach((g) => {
    const v = (t) => { const x = body.querySelector(`[data-g="${g.gameNum}"][data-t="${t}"]`).value; return x === '' ? null : Math.max(0, parseInt(x, 10) || 0); };
    g.team1Score = v(1);
    g.team2Score = v(2);
  });
  recount(S.data);
  try {
    await saveBracket();
    await writeSeriesGames(s);
    if (s.winner && s.winner !== before) await updateDependents(s.id);
    showToast('Series saved.', 'success');
  } catch (err) {
    console.error('[playoffs] save series', err);
    showToast("Couldn't save the series.", 'error');
  }
  render();
}

async function actSync() {
  try {
    await saveBracket();
    for (const s of allSeries(S.data)) if (s.winner) await updateDependents(s.id);
    S.unsynced = 0;
    showToast('Bracket updated from game results.', 'success');
  } catch (err) {
    console.error('[playoffs] sync', err);
    showToast("Couldn't update the bracket.", 'error');
  }
  render();
}

async function actShare() {
  const canvas = drawBracket(S.data, {
    team: (slot) => team(slot),
    title: `${S.label} Playoffs`,
    subtitle: projected() ? 'Projected bracket' : 'Official bracket'
  });
  await openShare(canvas, `aces-${S.sid}-playoffs.png`);
}

// ---------------------------------------------------------------------------

function wire() {
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'share') return actShare();
      if (!S.staff) return;
      if (act === 'format') return actFormat();
      if (act === 'publish') return actPublish();
      if (act === 'lock') return actLock();
      if (act === 'sync') return actSync();
      if (act === 'scores') { S.scoring = !S.scoring; render(); return; }
    }
    const card = e.target.closest('[data-score]');
    if (card && S.staff && S.scoring && !e.target.closest('a')) actScore(card.dataset.score);
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('[data-score]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); actScore(card.dataset.score); }
  });
  document.addEventListener('error', (e) => { if (e.target.matches?.('[data-logo]')) e.target.remove(); }, true);
}

async function main() {
  const ctx = await initPage({ title: 'Playoffs' });
  const config = ctx?.config || {};
  const q = new URLSearchParams(location.search);
  const live = config.phase !== 'offseason' ? config.currentSeasonId : '';
  S.sid = parseStatSeasonId(q.get('seasonId') || q.get('season') || '').id || live || await getDisplaySeasonId().catch(() => '') || '';
  S.label = seasonLabel(S.sid);
  S.current = !!live && S.sid === live;
  S.staff = S.current && hasRole(ctx?.profile, 'league-staff');

  $('poKicker').textContent = S.label;
  $('poLogo').innerHTML = `<img src="photos/${esc(S.label)} Playoff logo.png" alt="" data-logo>`;
  document.title = `${S.label} Playoffs - Mountainside Aces`;
  wire();
  await load();
  render();
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err, { container: '#poBracket' }); });
