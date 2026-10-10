// js/admin/badges.js
// admin/badges.html: calculate a season's player badges (badge-calculator.js)
// and save them to playerBadges (test mode: playerBadges_test).
//
// Order matters: results are saved first, so each badge keeps the earnedAt
// it already had, and only then are leftover docs removed for players who no
// longer earn any badge ("Remove players with no badges now"). The old page
// deleted everything first, which reset every earnedAt.
// ?season=&test=1 come from the stats pipeline.

import { initPage, pageReady } from '../core/app.js';
import { db, collection, doc, getDocs, getDoc, setDoc, deleteDoc, serverTimestamp } from '../core/firebase.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { mountAdminShell } from './shell.js';
import { BadgeCalculator } from '../../badge-calculator.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const toMillis = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);

let seasons = [];
let running = false;

const colName = () => ($('bdgTest').checked ? 'playerBadges_test' : 'playerBadges');

function log(message, type = 'info') {
  const out = $('output');
  const line = document.createElement('div');
  line.className = `agg-line is-${type}`;
  const t = document.createElement('span');
  t.className = 'agg-time';
  t.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  line.append(t, document.createTextNode(message));
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function progress(pct, text) {
  $('bdgProgress').hidden = false;
  $('bdgBar').style.width = `${pct}%`;
  $('bdgStep').textContent = text;
}

async function showLastRun() {
  const sid = $('bdgSeason').value;
  const el = $('bdgLast');
  el.textContent = '';
  if (!sid) return;
  const read = async (c) => {
    try { const s = await getDoc(doc(db, c, `season_${sid}`)); return s.exists() ? s.data() : null; } catch { return null; }
  };
  const [prod, test] = await Promise.all([read('playerBadges'), read('playerBadges_test')]);
  const when = (d) => d && toMillis(d.calculatedAt)
    ? new Date(toMillis(d.calculatedAt)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';
  el.innerHTML = `Last run for ${esc(seasonLabel(sid))}: <strong>${esc(when(prod))}</strong>${prod?.summary ? ` (${plural(prod.summary.total || 0, 'badge')})` : ''}. Test: ${esc(when(test))}.`;
}

function onSeasonChange() {
  const sid = $('bdgSeason').value;
  const s = seasons.find(x => x.id === sid);
  $('bdgPartial').hidden = !sid.startsWith('2025');
  // A season that is no longer active is over, so The Streak Lives can be awarded.
  $('bdgComplete').checked = !!s && !s.isActive;
  const p = new URLSearchParams(location.search);
  p.set('season', sid);
  history.replaceState(null, '', `?${p}`);
  showLastRun();
}

function onTestChange() {
  const on = $('bdgTest').checked;
  document.body.classList.toggle('agg-test', on);
  $('bdgRun').textContent = on ? 'Calculate test badges' : 'Calculate badges';
}

/** Player docs from an earlier run for players who earn nothing now. */
async function removeLeftovers(col, seasonId, keepIds) {
  const snap = await getDocs(collection(db, col));
  const stale = snap.docs.filter(d => d.id.startsWith(`${seasonId}_`) && !keepIds.has(d.id));
  await Promise.all(stale.map(d => deleteDoc(doc(db, col, d.id))));
  return stale.length;
}

function showResults(results, col) {
  const s = results.badgeSummary;
  $('bdgResults').hidden = false;
  $('bdgTotals').innerHTML = [
    ['Badges', s.total], ['Gold', s.gold], ['Silver', s.silver], ['Bronze', s.bronze], ['Hidden', s.hidden], ['Players', results.leaderboard.length]
  ].map(([l, v]) => `<div class="aces-stat"><span class="aces-stat-value">${v ?? 0}</span><span class="aces-stat-label">${l}</span></div>`).join('');
  $('bdgSaved').textContent = `Saved to ${col}.`;

  const top = results.leaderboard.slice(0, 10);
  const tier = (n, cls, label) => (n ? `<span class="bdg-tier ${cls}" title="${label}">${icon('medal')}${n}</span>` : '');
  $('bdgTop').innerHTML = top.length ? `<ol class="bdg-top">${top.map(p => `<li>
      <span class="bdg-name">${esc(p.playerName)}</span>
      <span class="bdg-tiers">${tier(p.gold, 'is-gold', 'Gold')}${tier(p.silver, 'is-silver', 'Silver')}${tier(p.bronze, 'is-bronze', 'Bronze')}</span>
    </li>`).join('')}</ol>` : '<p class="sse-dim">No badges earned yet.</p>';

  const counts = {};
  Object.values(results.playerBadges).forEach(p => Object.values(p.earned || {}).forEach(b => {
    const k = b.name || b.badgeId;
    counts[k] = (counts[k] || 0) + 1;
  }));
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('bdgBreakdown').innerHTML = rows.length ? `<div class="aces-table-wrap"><table class="aces-table bdg-table">
    <thead><tr><th scope="col">Badge</th><th scope="col" class="is-num">Players</th></tr></thead>
    <tbody>${rows.map(([n, c]) => `<tr><th scope="row">${esc(n)}</th><td class="is-num">${c}</td></tr>`).join('')}</tbody>
  </table></div>` : '';
}

async function run() {
  if (running) return;
  const seasonId = $('bdgSeason').value;
  if (!seasonId) { showToast('Pick a season', 'error'); return; }
  const testMode = $('bdgTest').checked;
  const prune = $('bdgPrune').checked;
  const seasonComplete = $('bdgComplete').checked;
  const col = colName();
  if (!testMode && !(await confirmModal(`Calculate ${seasonLabel(seasonId)} badges and save them to production (playerBadges)? Players see these on their pages and the trophy case.`, { confirmLabel: 'Calculate and save' }))) return;

  running = true;
  $('bdgRun').disabled = true;
  $('bdgResults').hidden = true;
  log(`${seasonLabel(seasonId)}: ${testMode ? 'test run (playerBadges_test)' : 'production (playerBadges)'}; season complete ${seasonComplete ? 'yes, The Streak Lives can be awarded' : 'no, The Streak Lives skipped'}.`, 'header');
  progress(10, 'Loading batting stats...');

  try {
    const calc = new BadgeCalculator(db, { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, testMode, seasonComplete });
    const loadBat = calc.loadBattingData.bind(calc);
    calc.loadBattingData = async (sid) => {
      const data = await loadBat(sid);
      log(`Batting: ${plural(Object.keys(data).length, 'player')}.`);
      progress(35, 'Loading pitching stats...');
      return data;
    };
    const loadPit = calc.loadPitchingData.bind(calc);
    calc.loadPitchingData = async (sid) => {
      const data = await loadPit(sid);
      log(`Pitching: ${plural(Object.keys(data).length, 'player')}.`);
      progress(55, 'Working out badges...');
      return data;
    };

    const results = await calc.calculateAllBadges(seasonId);
    log(`${plural(results.badgeSummary.total, 'badge')} for ${plural(results.leaderboard.length, 'player')}.`, 'success');

    progress(75, 'Saving...');
    await calc.saveBadgeResults(results);
    log(`Saved to ${col}. Badges players already had keep their earned date.`, 'success');

    if (prune) {
      progress(90, 'Removing players with no badges now...');
      const keep = new Set(Object.keys(results.playerBadges).map(id => `${seasonId}_${id}`));
      const n = await removeLeftovers(col, seasonId, keep);
      log(n ? `Removed ${plural(n, 'player')} who no longer earn a badge.` : 'No leftover players to remove.');
    }

    progress(100, 'Done');
    showResults(results, col);
    showToast(`${plural(results.badgeSummary.total, 'badge')} saved`, 'success');
    showLastRun();
  } catch (err) {
    console.error('[badges] failed', err);
    log(`Error: ${err.message}`, 'error');
    progress(0, 'Stopped with an error. See the log.');
    showToast('Badge calculation failed', 'error');
  } finally {
    running = false;
    $('bdgRun').disabled = false;
  }
}

async function main() {
  const ctx = await initPage({ title: 'Badge calculator', role: 'league-staff', deniedMessage: 'The badge calculator is for admins and league staff.' });
  if (!ctx?.user) return;
  mountAdminShell(ctx.profile, 'admin/badges.html');

  seasons = (await getAllSeasons()).sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  const params = new URLSearchParams(location.search);
  const start = [params.get('season'), ctx.config?.currentSeasonId, seasons.find(s => s.isActive)?.id, seasons[0]?.id]
    .find(id => id && seasons.some(s => s.id === id));
  $('bdgSeason').innerHTML = seasons.map(s => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}${s.id.startsWith('2025') ? ' (partial data)' : ''}${s.isActive ? ' (current)' : ''}</option>`).join('');
  if (start) $('bdgSeason').value = start;
  if (params.get('test') === '1') $('bdgTest').checked = true;

  $('bdgSeason').addEventListener('change', onSeasonChange);
  $('bdgTest').addEventListener('change', onTestChange);
  $('bdgRun').addEventListener('click', run);
  $('bdgClear').addEventListener('click', () => { $('output').textContent = ''; });
  window.addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });

  onSeasonChange();
  onTestChange();
  pageReady();
}

main().catch(err => {
  console.error('[badges] start failed', err);
  pageReady();
  showToast(`Could not start: ${err.message || err}`, 'error');
});
