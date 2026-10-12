// js/pages/teams-stats.js
// The Team stats view of teams.html (it replaced team-stats.html): each team's
// batting and pitching totals for a season (or every season), with Totals /
// Per game from the table; how teams compare season to season; and, for one
// season, running averages game by game.
//
//   import { renderTeamStats } from './teams-stats.js';
//   renderTeamStats(el, { players, gamesBySeason, seasonIds, season });
//
// Totals come from the player season rows (subs left out), so they match the
// batting and pitching pages. Team games are the games with a score the team
// played that season (regular season and playoffs, as the player rows count
// both). Running averages read the season's game-by-game stats
// (playerStats/pitchingStats .../games, then gameResults for tracker games not
// yet converted) when that panel is opened.

import { db, collection, getDocs, query, where } from '../core/firebase.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { mountStatTable } from '../ui/table.js';
import { teamChipHtml } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { lineChart, wireLineChart } from '../ui/line-chart.js';
import { battingLine, era } from '../domain/stats.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const EXCLUDED = new Set(['kings']);   // the old guest team
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nameId = (name) => String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
const isUid = (id) => /^[A-Za-z0-9]{28}$/.test(String(id || ''));
const avg3 = (v) => (v === null || v === undefined ? '-' : fmtAvg(v));

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function teamGamesFor(games, team) {
  return (games || []).filter((g) => g.hasScores && (norm(g.home) === norm(team) || norm(g.away) === norm(team))).length;
}

/** One row per team-season: batting and pitching totals. */
function buildTeamRows(players, gamesBySeason) {
  const out = new Map();
  const get = (r) => {
    const k = `${r.seasonId}|${r.teamKey}`;
    if (!out.has(k)) {
      out.set(k, {
        key: k, seasonId: r.seasonId, seasonKey: r.seasonKey, team: r.team, teamKey: r.teamKey,
        players: 0, playerGames: 0, games: 0,
        atBats: 0, hits: 0, runs: 0, walks: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, hitTypes: true,
        ip: 0, runsAllowed: 0
      });
    }
    return out.get(k);
  };
  buildBattingRows(players).filter((r) => !r.sub && r.team && !EXCLUDED.has(r.teamKey)).forEach((r) => {
    const t = get(r);
    t.players += 1;
    t.playerGames = Math.max(t.playerGames, r.games);
    ['atBats', 'hits', 'runs', 'walks', 'doubles', 'triples', 'homeRuns', 'rbi'].forEach((f) => { t[f] += r[f] || 0; });
    if (!r.hasHitTypes) t.hitTypes = false;
  });
  buildPitchingRows(players).filter((r) => !r.sub && r.team && !EXCLUDED.has(r.teamKey)).forEach((r) => {
    const t = get(r);
    t.ip += r.ip || 0;
    t.runsAllowed += r.runsAllowed || 0;
  });
  out.forEach((t) => {
    t.games = teamGamesFor(gamesBySeason.get(t.seasonId), t.team) || t.playerGames;
    const l = battingLine(t);
    t.avg = t.atBats ? l.avg : null;
    t.obp = l.pa ? l.obp : null;
    t.slg = t.hitTypes && t.atBats ? l.slg : null;
    t.era = t.ip > 0 ? era(t.runsAllowed, t.ip) : null;
  });
  return [...out.values()];
}

const statsConfig = (allSeasons) => ({
  id: 'ts',
  cardSub: allSeasons ? 'season' : 'G',
  columns: [
    { key: 'team', label: 'Team', type: 'text', value: (r) => r.team, html: (r) => teamChipHtml({ team: r.team, teamKey: r.teamKey, seasonCount: 2 }) },
    { key: 'season', label: 'Season', type: 'text', value: (r) => r.seasonKey, defaultDir: 'desc', format: (v, r) => seasonLabel(r.seasonId), when: () => allSeasons },
    { key: 'P', label: 'Players', type: 'count', shade: false, perGame: false, value: (r) => r.players },
    { key: 'G', label: 'G', title: 'Games with a score (regular season and playoffs)', type: 'count', shade: false, perGame: false, value: (r) => r.games },
    { key: 'AB', label: 'AB', type: 'count', value: (r) => r.atBats },
    { key: 'H', label: 'H', type: 'count', value: (r) => r.hits },
    { key: 'R', label: 'R', type: 'count', value: (r) => r.runs },
    { key: 'BB', label: 'BB', type: 'count', value: (r) => r.walks },
    { key: '2B', label: '2B', type: 'count', value: (r) => (r.hitTypes ? r.doubles : null), when: (rows) => rows.some((r) => r.hitTypes) },
    { key: '3B', label: '3B', type: 'count', value: (r) => (r.hitTypes ? r.triples : null), when: (rows) => rows.some((r) => r.hitTypes) },
    { key: 'HR', label: 'HR', type: 'count', value: (r) => (r.hitTypes ? r.homeRuns : null), when: (rows) => rows.some((r) => r.hitTypes) },
    { key: 'RBI', label: 'RBI', type: 'count', value: (r) => (r.hitTypes ? r.rbi : null), when: (rows) => rows.some((r) => r.hitTypes) },
    { key: 'AVG', label: 'AVG', type: 'rate', qualifiedOnly: false, value: (r) => r.avg, format: avg3 },
    { key: 'OBP', label: 'OBP', type: 'rate', qualifiedOnly: false, value: (r) => r.obp, format: avg3 },
    { key: 'SLG', label: 'SLG', type: 'rate', qualifiedOnly: false, value: (r) => r.slg, format: avg3, when: (rows) => rows.some((r) => r.slg !== null) },
    { key: 'IP', label: 'IP', type: 'count', value: (r) => r.ip, format: (v, r, ctx) => (ctx?.perGame ? fmtRate(v) : formatIP(v)) },
    { key: 'RA', label: 'RA', title: 'Runs allowed', type: 'count', lowerIsBetter: true, value: (r) => r.runsAllowed },
    { key: 'ERA', label: 'ERA', title: 'Runs allowed per 7 innings', type: 'rate', lowerIsBetter: true, qualifiedOnly: false, value: (r) => r.era, format: (v) => (v === null ? '-' : fmtRate(v)) },
    { key: 'RD', label: 'Diff', title: 'Runs scored minus runs allowed', type: 'count', value: (r) => r.runs - r.runsAllowed,
      format: (v, r, ctx) => { const n = ctx?.perGame ? Number(v.toFixed(2)) : v; return `${n > 0 ? '+' : ''}${ctx?.perGame ? n.toFixed(2) : n}`; } }
  ],
  presets: [
    { key: 'all', label: 'Everything', sort: '-AVG', card: ['AVG', 'R', 'RA', 'ERA'],
      columns: ['team', 'season', 'G', 'AB', 'H', 'R', 'BB', '2B', '3B', 'HR', 'RBI', 'AVG', 'OBP', 'SLG', 'IP', 'RA', 'ERA', 'RD'] },
    { key: 'bat', label: 'Batting', sort: '-AVG', card: ['AVG', 'OBP', 'H', 'R'],
      columns: ['team', 'season', 'P', 'G', 'AB', 'H', 'R', 'BB', '2B', '3B', 'HR', 'RBI', 'AVG', 'OBP', 'SLG'] },
    { key: 'pit', label: 'Pitching', sort: 'ERA', card: ['ERA', 'RA', 'IP', 'RD'],
      columns: ['team', 'season', 'G', 'IP', 'RA', 'ERA', 'R', 'RD'] }
  ],
  games: (r) => r.games,
  qualifier: null
});

// ---------------------------------------------------------------------------
// Season-to-season chart
// ---------------------------------------------------------------------------

const TREND = {
  avg: { label: 'AVG', value: (r) => r.avg, fmt: (v) => fmtAvg(v) },
  obp: { label: 'OBP', value: (r) => r.obp, fmt: (v) => fmtAvg(v) },
  runs: { label: 'Runs per game', value: (r) => (r.games ? r.runs / r.games : null), fmt: (v) => v.toFixed(1) },
  hits: { label: 'Hits per game', value: (r) => (r.games ? r.hits / r.games : null), fmt: (v) => v.toFixed(1) },
  walks: { label: 'Walks per game', value: (r) => (r.games ? r.walks / r.games : null), fmt: (v) => v.toFixed(1) },
  ra: { label: 'Runs allowed per game', value: (r) => (r.games && r.ip ? r.runsAllowed / r.games : null), fmt: (v) => v.toFixed(1) },
  era: { label: 'ERA', value: (r) => r.era, fmt: (v) => v.toFixed(2) },
  diff: { label: 'Run differential per game', value: (r) => (r.games && r.ip ? (r.runs - r.runsAllowed) / r.games : null), fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, zero: true }
};

function trendChart(rows, stat) {
  const def = TREND[stat] || TREND.avg;
  const seasons = [...new Set(rows.map((r) => r.seasonId))].sort((a, b) => seasonSortKey(a) - seasonSortKey(b));
  const teams = [...new Set(rows.map((r) => r.teamKey))].sort();
  const series = teams.map((k) => {
    const label = rows.find((r) => r.teamKey === k)?.team || k;
    return { key: k, label, values: seasons.map((sid) => { const r = rows.find((x) => x.seasonId === sid && x.teamKey === k); const v = r ? def.value(r) : null; return v === null || v === undefined || !Number.isFinite(v) ? null : v; }) };
  }).filter((s) => s.values.some((v) => v !== null));
  return lineChart({ labels: seasons.map(seasonLabel), series, format: def.fmt, zeroLine: !!def.zero, ariaLabel: `${def.label} by season and team` });
}

// ---------------------------------------------------------------------------
// Running averages (one season, game by game)
// ---------------------------------------------------------------------------

const RUN = {
  avg: { label: 'AVG', fn: (c) => (c.ab ? c.h / c.ab : null), fmt: (v) => fmtAvg(v) },
  obp: { label: 'OBP', fn: (c) => (c.ab + c.bb ? (c.h + c.bb) / (c.ab + c.bb) : null), fmt: (v) => fmtAvg(v) },
  runs: { label: 'Runs per game', fn: (c, n) => c.r / n, fmt: (v) => v.toFixed(2) },
  hits: { label: 'Hits per game', fn: (c, n) => c.h / n, fmt: (v) => v.toFixed(2) },
  walks: { label: 'Walks per game', fn: (c, n) => c.bb / n, fmt: (v) => v.toFixed(2) },
  ra: { label: 'Runs allowed per game', fn: (c, n) => c.ra / n, fmt: (v) => v.toFixed(2) },
  diff: { label: 'Run differential per game', fn: (c, n) => (c.r - c.ra) / n, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`, zero: true }
};

const runCache = new Map();

async function loadRunning(players, sid) {
  if (runCache.has(sid)) return runCache.get(sid);
  const inSeason = players.filter((p) => Object.keys(p.seasons || {}).some((k) => k === sid || k.startsWith(`${sid}-`)));
  const docId = (p) => (isUid(p.id) ? nameId(p.linkedPlayer || p.name || p.displayName) : p.id);
  const byTeam = new Map();
  const game = (team, gid, when) => {
    const t = norm(team) || 'unknown';
    if (!byTeam.has(t)) byTeam.set(t, new Map());
    const m = byTeam.get(t);
    if (!m.has(gid)) m.set(gid, { when: when || 0, ab: 0, h: 0, r: 0, bb: 0, ra: 0, fromStats: false });
    return m.get(gid);
  };
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v ? Date.parse(v) || 0 : 0);
  const [bat, pit] = await Promise.all(['playerStats', 'pitchingStats'].map((col) => Promise.all(inSeason.map((p) =>
    getDocs(query(collection(db, col, docId(p), 'games'), where('seasonId', '==', sid))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => [])))));
  bat.flat().forEach((d) => {
    const g = game(d.teamId, d.gameDocId || d.id, ms(d.gameDate));
    g.fromStats = true;
    g.ab += Number(d.atBats) || 0; g.h += Number(d.hits) || 0; g.r += Number(d.runs) || 0; g.bb += Number(d.walks) || 0;
  });
  pit.flat().forEach((d) => { game(d.teamId, d.gameDocId || d.id, ms(d.gameDate)).ra += Number(d.runsAllowed) || 0; });
  // Tracker games not yet converted into the per-player docs.
  try {
    const snap = await getDocs(query(collection(db, 'gameResults'), where('seasonId', '==', sid)));
    snap.docs.forEach((s) => {
      const d = s.data();
      const gid = d.gameId ? `${sid}_${d.gameId}` : s.id;
      const t = norm(d.teamId) || 'unknown';
      if (byTeam.get(t)?.get(gid)?.fromStats) return;
      const tot = { ab: 0, h: 0, r: 0, bb: 0 };
      (d.battingStats || []).forEach((p) => { tot.ab += Number(p.atBats) || 0; tot.h += Number(p.hits) || 0; tot.r += Number(p.runs) || 0; tot.bb += Number(p.walks) || 0; });
      if (!tot.ab) return;
      Object.assign(game(d.teamId, gid, ms(d.completedAt)), tot, { ra: Number(d.finalScore?.opponent) || 0 });
    });
  } catch { /* none */ }
  const out = new Map();
  byTeam.forEach((m, t) => {
    if (EXCLUDED.has(t) || t === 'unknown') return;
    const list = [...m.values()].filter((g) => g.ab > 0).sort((a, b) => a.when - b.when);
    if (list.length) out.set(t, list);
  });
  runCache.set(sid, out);
  return out;
}

function runningChart(byTeam, stat, names) {
  const def = RUN[stat] || RUN.avg;
  const max = Math.max(0, ...[...byTeam.values()].map((l) => l.length));
  const series = [...byTeam].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => {
    const c = { ab: 0, h: 0, r: 0, bb: 0, ra: 0 };
    const values = Array.from({ length: max }, (_, i) => {
      if (i >= list.length) return null;
      const g = list[i];
      c.ab += g.ab; c.h += g.h; c.r += g.r; c.bb += g.bb; c.ra += g.ra;
      const v = def.fn(c, i + 1);
      return v === null || !Number.isFinite(v) ? null : v;
    });
    return { key: k, label: names.get(k) || k, values };
  });
  return lineChart({ labels: Array.from({ length: max }, (_, i) => `G${i + 1}`), series, format: def.fmt, zeroLine: !!def.zero, ariaLabel: `${def.label} game by game` });
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function renderTeamStats(el, { players, gamesBySeason, seasonIds, season }) {
  const all = buildTeamRows(players, gamesBySeason);
  const seasons = seasonIds.filter((id) => all.some((r) => r.seasonId === id));
  let sid = seasons.includes(season) || season === 'all' ? season : seasons[0] || 'all';
  const names = new Map(all.map((r) => [r.teamKey, r.team]));
  let table = null;

  el.innerHTML = `
    <div class="ts-controls">
      <label class="ts-field"><span class="aces-label">Season</span><span class="aces-select-wrap"><select class="aces-select" data-ts="season">
        ${seasons.map((id) => `<option value="${esc(id)}"${id === sid ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('')}
        <option value="all"${sid === 'all' ? ' selected' : ''}>Every season</option>
      </select></span></label>
    </div>
    <div class="aces-stats ts-tiles" data-ts-tiles></div>
    <div class="aces-card is-flush ts-table" id="tsTable"><div data-ts-table></div></div>
    <p class="ts-note">Totals are the players' season lines (subs left out); games are every game with a score, playoffs included. 2B, 3B, HR, RBI and SLG show only for seasons that kept them. ERA is runs allowed per 7 innings.</p>
    <section class="aces-card ts-chart">
      <div class="ts-chart-head"><h2 class="ts-h">${icon('chart-line')}Season to season</h2>
        <span class="aces-select-wrap"><select class="aces-select is-sm" data-ts="trend" aria-label="Stat">${Object.entries(TREND).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('')}</select></span></div>
      <div data-ts-trend></div>
      <p class="ts-note">Tap a team in the key to pick it out.</p>
    </section>
    <details class="aces-card ts-chart" data-ts-running>
      <summary><h2 class="ts-h">${icon('activity')}Game by game<small data-ts-running-season></small></h2>${icon('chevron-down')}</summary>
      <div class="ts-chart-head"><span></span>
        <span class="aces-select-wrap"><select class="aces-select is-sm" data-ts="run" aria-label="Stat">${Object.entries(RUN).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('')}</select></span></div>
      <div data-ts-run></div>
      <p class="ts-note">Running averages through each team's games, from game-by-game stats (kept since 2025; 2025 is partial).</p>
    </details>`;

  const rowsNow = () => (sid === 'all' ? all : all.filter((r) => r.seasonId === sid));
  const runSeason = () => (sid === 'all' ? seasons[0] : sid);

  const tiles = () => {
    const rows = rowsNow();
    const t = rows.reduce((a, r) => ({ ab: a.ab + r.atBats, h: a.h + r.hits, bb: a.bb + r.walks, r: a.r + r.runs, ip: a.ip + r.ip, ra: a.ra + r.runsAllowed, g: a.g + r.games }), { ab: 0, h: 0, bb: 0, r: 0, ip: 0, ra: 0, g: 0 });
    const tile = (v, l, m = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(l)}</span>${m ? `<span class="aces-stat-meta">${esc(m)}</span>` : ''}</div>`;
    el.querySelector('[data-ts-tiles]').innerHTML = [
      tile(sid === 'all' ? new Set(rows.map((r) => r.teamKey)).size : rows.length, 'Teams', sid === 'all' ? `${seasons.length} seasons` : seasonLabel(sid)),
      tile(t.ab ? fmtAvg(t.h / t.ab) : '-', 'League AVG'),
      tile(t.g ? (t.r / t.g).toFixed(1) : '-', 'Runs per team game'),
      tile(t.ip ? fmtRate(era(t.ra, t.ip)) : '-', 'League ERA')
    ].join('');
  };

  const drawTable = () => {
    const box = el.querySelector('[data-ts-table]');
    box.innerHTML = '';
    table = mountStatTable(box, statsConfig(sid === 'all'), {
      rows: rowsNow(), emptyMessage: 'No team stats for this season.',
      exportName: `aces-team-stats-${sid}`, exportTitle: `Team stats, ${sid === 'all' ? 'every season' : seasonLabel(sid)}`
    });
  };

  const drawTrend = () => {
    el.querySelector('[data-ts-trend]').innerHTML = trendChart(all, el.querySelector('[data-ts="trend"]').value);
  };

  const drawRunning = async () => {
    const det = el.querySelector('[data-ts-running]');
    if (!det.open) return;
    const rs = runSeason();
    el.querySelector('[data-ts-running-season]').textContent = rs ? ` ${seasonLabel(rs)}` : '';
    const box = el.querySelector('[data-ts-run]');
    if (!runCache.has(rs)) box.innerHTML = '<span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span>';
    const data = await loadRunning(players, rs).catch(() => new Map());
    if (runSeason() !== rs) return;
    box.innerHTML = data.size ? runningChart(data, el.querySelector('[data-ts="run"]').value, names) : '<p class="aces-empty">No game-by-game stats for this season.</p>';
  };

  el.addEventListener('change', (e) => {
    const k = e.target.dataset.ts;
    if (k === 'season') {
      sid = e.target.value;
      const u = new URL(location.href);
      u.searchParams.set('season', sid);
      history.replaceState(null, '', u);
      tiles(); drawTable(); drawRunning();
    }
    if (k === 'trend') drawTrend();
    if (k === 'run') drawRunning();
  });
  el.querySelector('[data-ts-running]').addEventListener('toggle', drawRunning);
  wireLineChart(el);

  tiles();
  drawTable();
  drawTrend();
  el.querySelector('[data-ts-running-season]').textContent = runSeason() ? ` ${seasonLabel(runSeason())}` : '';
  return { table };
}
