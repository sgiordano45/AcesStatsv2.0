// js/pages/projections.js
// projections.html: Monte Carlo projections of the rest of the regular season.
//
// Every team makes the playoffs, so the page shows where each team is likely
// to be seeded: the chance of each seed, the chance of a first-round bye, the
// projected record and average seed, and the most likely bracket.
//
// Current standings use the league rules (js/domain/standings.js). Simulated
// games have no ties; simulated seeding sorts by win %, then head to head for
// two tied teams, then run differential per game (scores aren't simulated).
//
// Win chance per game, by method:
//   Win %        each team's win % (ties count half), shrunk toward .500 early on
//   Pythagorean  runs scored and allowed (exponent 1.83)
//   Strength     win % plus run differential per game
// plus home field for the home team, capped at 10% and 90%.
//
// Bracket (single elimination): with N teams and 8 quarterfinal spots, seeds
// 1 to (16 - N) get a bye; the rest play in, highest vs lowest. 11 teams:
// 6v11, 7v10, 8v9; then 4v5, 1 vs 8/9, 2 vs 7/10, 3 vs 6/11.

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { getSeasonGames } from '../data/games.js';
import { escapeHtml as esc, fmtAvg, ordinal } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { normalizeGames, computeStandings, isDecided } from '../domain/standings.js';
import { seasonLabel } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const PYTH = 1.83;
const PRIOR_GAMES = 4;   // early-season shrink toward .500 (as if each team started 2-2)
const CHUNK = 500;       // simulations per timer tick (keeps the page responsive)

const P = { seasonId: '', games: [], standings: [], left: [], teams: [], method: 'winPct', sims: 10000, home: 0.06, result: null };

const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const pct = (v) => (v >= 99.95 ? '100' : v > 0 && v < 0.05 ? '<0.1' : v.toFixed(v >= 10 ? 0 : 1));

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function teamModel(row) {
  const g = row.wins + row.losses + row.ties;
  const wp = (row.wins + row.ties * 0.5 + PRIOR_GAMES / 2) / (g + PRIOR_GAMES);
  const rf = row.runsFor, ra = row.runsAgainst;
  const pyth = rf + ra > 0 ? (rf ** PYTH) / (rf ** PYTH + ra ** PYTH) : 0.5;
  const pythShrunk = (pyth * g + 0.5 * PRIOR_GAMES) / (g + PRIOR_GAMES);
  const strength = Math.max(0.1, Math.min(0.9, wp + (g ? (row.runDiff / g) * 0.01 : 0)));
  return { team: row.team, wins: row.wins, losses: row.losses, ties: row.ties, rdpg: g ? row.runDiff / g : 0, wp, pyth: pythShrunk, strength };
}

function homeWinChance(h, a) {
  const r = P.method === 'pythagorean' ? [h.pyth, a.pyth] : P.method === 'strength' ? [h.strength, a.strength] : [h.wp, a.wp];
  const base = r[0] + r[1] > 0 ? r[0] / (r[0] + r[1]) : 0.5;
  return Math.max(0.1, Math.min(0.9, base + P.home));
}

/** One simulated finish: team names in seed order. */
function simulateOnce(models, games, h2hBase) {
  const n = models.length;
  const w = models.map(m => m.wins), l = models.map(m => m.losses);
  const h2h = h2hBase.map(row => row.slice());
  for (const g of games) {
    const homeWins = Math.random() < g.p;
    const win = homeWins ? g.h : g.a, lose = homeWins ? g.a : g.h;
    w[win]++; l[lose]++; h2h[win][lose]++;
  }
  const pctOf = (i) => { const t = w[i] + l[i] + models[i].ties; return t ? (w[i] + models[i].ties * 0.5) / t : 0; };
  const order = [...Array(n).keys()].map(i => ({ i, p: pctOf(i) }));
  order.sort((x, y) => {
    if (Math.abs(x.p - y.p) > 1e-9) return y.p - x.p;
    const tied = order.filter(o => Math.abs(o.p - x.p) <= 1e-9).length;
    if (tied === 2 && h2h[x.i][y.i] !== h2h[y.i][x.i]) return h2h[y.i][x.i] - h2h[x.i][y.i];
    return models[y.i].rdpg - models[x.i].rdpg;
  });
  return { order: order.map(o => o.i), w, l };
}

function setup() {
  const models = P.standings.map(teamModel);
  const idx = new Map(models.map((m, i) => [m.team, i]));
  const n = models.length;
  const h2hBase = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const g of P.games) {
    if (g.type !== 'regular' || !isDecided(g) || !g.result || g.result === 'tie') continue;
    const hi = idx.get(g.home), ai = idx.get(g.away);
    if (hi === undefined || ai === undefined) continue;
    if (g.result === 'home') h2hBase[hi][ai]++; else h2hBase[ai][hi]++;
  }
  const games = P.left.map(g => ({ h: idx.get(g.home), a: idx.get(g.away) }))
    .filter(g => g.h !== undefined && g.a !== undefined)
    .map(g => ({ ...g, p: homeWinChance(models[g.h], models[g.a]) }));
  return { models, games, h2hBase, n };
}

function run() {
  const { models, games, h2hBase, n } = setup();
  const seedCounts = Array.from({ length: n }, () => new Array(n).fill(0));
  const winSum = new Array(n).fill(0), lossSum = new Array(n).fill(0);
  let done = 0;
  const btn = $('pjRun');
  btn.disabled = true;
  return new Promise((resolve) => {
    const step = () => {
      const end = Math.min(P.sims, done + CHUNK);
      for (; done < end; done++) {
        const r = simulateOnce(models, games, h2hBase);
        r.order.forEach((ti, seed) => { seedCounts[ti][seed]++; });
        for (let i = 0; i < n; i++) { winSum[i] += r.w[i]; lossSum[i] += r.l[i]; }
      }
      btn.textContent = `Running ${Math.round((done / P.sims) * 100)}%`;
      if (done < P.sims) { setTimeout(step, 0); return; }
      btn.disabled = false;
      btn.innerHTML = `${icon('refresh')}Run again`;
      const rows = models.map((m, i) => {
        const odds = seedCounts[i].map(c => (c / P.sims) * 100);
        const avgSeed = seedCounts[i].reduce((s, c, k) => s + c * (k + 1), 0) / P.sims;
        return { team: m.team, cur: { w: m.wins, l: m.losses, t: m.ties }, projW: winSum[i] / P.sims, projL: lossSum[i] / P.sims, odds, avgSeed };
      }).sort((a, b) => a.avgSeed - b.avgSeed);
      resolve({ rows, n, gamesLeft: games.length });
    };
    setTimeout(step, 0);
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const byes = (n) => (n > 8 ? Math.max(0, 16 - n) : n);

function renderSummary(res) {
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  const played = P.games.filter(g => g.type === 'regular' && isDecided(g)).length;
  const fav = res.rows[0];
  const b = byes(res.n);
  $('pjStats').innerHTML = [
    tile(String(res.gamesLeft), 'Games left', `${played} played`),
    tile(String(res.n), 'Teams', 'everyone makes the playoffs'),
    tile(fav ? cap(fav.team) : '-', 'Likeliest 1 seed', fav ? `${pct(fav.odds[0])}% of simulations` : ''),
    tile(b && b < res.n ? `Top ${b}` : '-', 'Get a bye', b && b < res.n ? 'straight to the quarterfinals' : '')
  ].join('');
}

function renderTable(res) {
  const b = byes(res.n);
  const max = Math.max(...res.rows.flatMap(r => r.odds));
  const head = Array.from({ length: res.n }, (_, k) => `<th scope="col" class="is-num pj-seed-h${k + 1 === b ? ' is-bye-edge' : ''}">${k + 1}</th>`).join('');
  const body = res.rows.map((r, i) => {
    const bye = r.odds.slice(0, b).reduce((s, v) => s + v, 0);
    const cells = r.odds.map((v, k) => {
      const a = v > 0 ? 0.08 + 0.72 * (v / max) : 0;
      return `<td class="is-num pj-cell${k + 1 === b ? ' is-bye-edge' : ''}${a > 0.45 ? ' is-hot' : ''}" style="${a ? `background:color-mix(in srgb, var(--color-brand) ${Math.round(a * 100)}%, var(--color-surface))` : ''}"${v ? ` title="${esc(`${cap(r.team)}: ${pct(v)}% to finish ${ordinal(k + 1)}`)}"` : ''}>${v >= 0.5 ? Math.round(v) : v > 0 ? '&middot;' : ''}</td>`;
    }).join('');
    const cur = `${r.cur.w}-${r.cur.l}${r.cur.t ? `-${r.cur.t}` : ''}`;
    return `<tr>
      <td class="is-num pj-rank">${i + 1}</td>
      <th scope="row"><a class="pj-team" href="current-season-team.html?team=${esc(encodeURIComponent(cap(r.team)))}">${dot(r.team)}${esc(cap(r.team))}</a></th>
      <td class="is-num">${esc(cur)}</td>
      <td class="is-num"><strong>${Math.round(r.projW)}-${Math.round(r.projL)}</strong></td>
      <td class="is-num">${r.avgSeed.toFixed(1)}</td>
      ${b && b < res.n ? `<td class="is-num pj-bye"><strong>${pct(bye)}%</strong></td>` : ''}
      ${cells}
    </tr>`;
  }).join('');
  $('pjTable').innerHTML = `<div class="aces-table-wrap"><table class="aces-table is-compact pj-table">
    <thead>
      <tr><th scope="col" class="is-num">#</th><th scope="col">Team</th><th scope="col" class="is-num">Now</th><th scope="col" class="is-num" title="Average wins and losses at the end of the regular season">Proj.</th><th scope="col" class="is-num" title="Average seed">Avg seed</th>${b && b < res.n ? '<th scope="col" class="is-num" title="Chance of a top seed with a first-round bye">Bye</th>' : ''}${head}</tr>
    </thead>
    <tbody>${body}</tbody></table></div>
    <p class="pj-note">Seed columns are the percent of ${P.sims.toLocaleString()} simulations each team finished there (a dot is under 0.5%). ${b && b < res.n ? `The line after seed ${b} marks the byes.` : ''}</p>`;
}

function renderBracket(res) {
  const n = res.n;
  const seeds = res.rows.map(r => r.team);   // most likely order (by average seed)
  const t = (s) => (seeds[s - 1] ? `<span class="pj-bt">${dot(seeds[s - 1])}<b>${s}</b> ${esc(cap(seeds[s - 1]))}</span>` : `<span class="pj-bt"><b>${s}</b> TBD</span>`);
  const box = (title, a, b2) => `<div class="pj-match"><span class="pj-match-title">${esc(title)}</span>${a}${b2}</div>`;
  if (n < 2) { $('pjBracket').innerHTML = ''; return; }
  let html = '';
  if (n > 8) {
    const b = 16 - n;
    const playIn = [];
    for (let hi = b + 1, lo = n; hi < lo; hi++, lo--) playIn.push([hi, lo]);
    // Quarterfinal slots: 1 v 8, 4 v 5, 3 v 6, 2 v 7 (8-team bracket), play-in winners fill seeds above b.
    const slot = (s) => {
      if (s <= b) return t(s);
      const p = playIn.find(([hi]) => hi === s) || playIn.find(([, lo]) => lo === s);
      return p ? `<span class="pj-bt is-tbd">Winner ${p[0]}/${p[1]}</span>` : t(s);
    };
    html = `<div class="pj-round"><h3>Round 1</h3>${playIn.map(([hi, lo]) => box(`${hi} vs ${lo}`, t(hi), t(lo))).join('')}</div>
      <div class="pj-round"><h3>Quarterfinals</h3>${[[1, 8], [4, 5], [3, 6], [2, 7]].map(([a, b2]) => box(`${a} vs ${b2}`, slot(a), slot(b2))).join('')}</div>`;
  } else {
    const pairs = [];
    for (let hi = 1, lo = n; hi < lo; hi++, lo--) pairs.push([hi, lo]);
    html = `<div class="pj-round"><h3>First round</h3>${pairs.map(([a, b2]) => box(`${a} vs ${b2}`, t(a), t(b2))).join('')}</div>`;
  }
  $('pjBracket').innerHTML = `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('trophy')}Most likely bracket</h2><span class="aces-badge is-outline">by average seed</span></div>
    <div class="pj-bracket">${html}</div>
    <p class="pj-note">Single elimination, best of three. The real bracket is set from the final standings on the Playoffs page.</p>
  </section>`;
}

function renderRaces(res) {
  const b = byes(res.n);
  const notes = [];
  const top = res.rows.filter(r => r.odds[0] >= 10).sort((a, c) => c.odds[0] - a.odds[0]);
  if (top.length) notes.push(`<li>${icon('crown')}<span><strong>Race for the 1 seed:</strong> ${top.map(r => `${esc(cap(r.team))} ${pct(r.odds[0])}%`).join(', ')}.</span></li>`);
  if (b && b < res.n) {
    const byeOdds = (r) => r.odds.slice(0, b).reduce((s, v) => s + v, 0);
    const locks = res.rows.filter(r => byeOdds(r) >= 95);
    const race = res.rows.filter(r => byeOdds(r) >= 10 && byeOdds(r) < 95);
    if (locks.length) notes.push(`<li>${icon('shield-check')}<span><strong>Near-certain byes:</strong> ${locks.map(r => esc(cap(r.team))).join(', ')}.</span></li>`);
    if (race.length) notes.push(`<li>${icon('swords')}<span><strong>Fighting for a bye:</strong> ${race.map(r => `${esc(cap(r.team))} ${pct(byeOdds(r))}%`).join(', ')}.</span></li>`);
  }
  const locked = res.rows.map((r, i) => ({ r, k: r.odds.findIndex(v => v >= 99.95) })).filter(x => x.k >= 0);
  if (locked.length) notes.push(`<li>${icon('lock')}<span><strong>Locked in:</strong> ${locked.map(x => `${esc(cap(x.r.team))} (${ordinal(x.k + 1)})`).join(', ')}.</span></li>`);
  $('pjRaces').innerHTML = notes.length ? `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('activity')}Seeding races</h2></div>
    <ul class="pj-races">${notes.join('')}</ul></section>` : '';
}

function renderControls() {
  const seg = (v, label) => `<button type="button" class="aces-segment" data-method="${v}" aria-pressed="${P.method === v}">${esc(label)}</button>`;
  $('pjControls').innerHTML = `<section class="aces-card pj-controls">
    <div class="pj-control"><span class="aces-label">Method</span><div class="aces-segmented" role="group" aria-label="Method">${seg('winPct', 'Win %')}${seg('pythagorean', 'Pythagorean')}${seg('strength', 'Strength')}</div></div>
    <label class="pj-control"><span class="aces-label">Simulations</span><span class="aces-select-wrap"><select class="aces-select" id="pjSims">
      ${[1000, 5000, 10000, 25000].map(v => `<option value="${v}"${v === P.sims ? ' selected' : ''}>${v.toLocaleString()}</option>`).join('')}</select></span></label>
    <label class="pj-control"><span class="aces-label">Home field <output id="pjHomeOut">${Math.round(P.home * 100)}%</output></span><input type="range" id="pjHome" min="0" max="0.2" step="0.01" value="${P.home}"></label>
    <button type="button" class="aces-btn is-primary" id="pjRun">${icon('refresh')}Run</button>
  </section>`;
}

async function runAndRender() {
  const res = await run();
  P.result = res;
  renderSummary(res);
  renderTable(res);
  renderBracket(res);
  renderRaces(res);
}

function wire() {
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-method]');
    if (m) {
      P.method = m.dataset.method;
      document.querySelectorAll('[data-method]').forEach(b => b.setAttribute('aria-pressed', String(b === m)));
      return;
    }
    if (e.target.closest('#pjRun')) runAndRender();
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'pjSims') P.sims = Number(e.target.value); });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'pjHome') { P.home = Number(e.target.value); $('pjHomeOut').textContent = `${Math.round(P.home * 100)}%`; }
  });
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Projections' });
  P.seasonId = await getDisplaySeasonId().catch(() => '') || '';
  const docs = P.seasonId ? await getSeasonGames(P.seasonId).catch(() => []) : [];
  P.games = normalizeGames(docs);
  P.standings = computeStandings(P.games, { includeScheduled: true }).filter(r => r.team && r.team !== 'TBD');
  P.left = P.games.filter(g => g.type === 'regular' && !isDecided(g) && g.home && g.away && g.home !== 'TBD' && g.away !== 'TBD');
  $('pjTitle').textContent = `${seasonLabel(P.seasonId)} Projections`;
  document.title = `${seasonLabel(P.seasonId)} Projections - Mountainside Aces`;
  if (!P.standings.length) {
    pageReady();
    showPageState({ title: 'No schedule yet', message: 'Projections start once the season schedule is published.', actions: [{ label: 'Schedule', href: siteUrl('schedule.html'), primary: true }] });
    return;
  }
  renderControls();
  wire();
  pageReady();
  if (!P.left.length) {
    $('pjTable').innerHTML = `<section class="aces-card"><div class="aces-empty">${icon('flag')}<p class="aces-empty-title">The regular season is over</p><p>The seeds are set; see the bracket on the Playoffs page.</p><a class="aces-btn is-primary" href="playoffs.html">Playoffs</a></div></section>`;
    $('pjControls').innerHTML = '';
    return;
  }
  await runAndRender();
}

main().catch((err) => { pageReady(); showPageError(err); });
