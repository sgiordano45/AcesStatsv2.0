// js/pages/player-batting.js
// player.html Batting tab: season and career tables, the radial profile
// (held back from the Explore merge), career bests with hit streaks, and
// single-game highs from game-level stats (2025 on). The old page's Records
// tab is folded in here.

import { db, collection, getDocs, query, where } from '../core/firebase.js';
import { mountStatTable } from '../ui/table.js';
import { battingTableConfig } from '../ui/batting-stats.js';
import { applyTeamGames } from '../data/team-games.js';
import { seasonsObjectToArray } from '../data/player-stats.js';
import { radialChart } from '../ui/radial-chart.js';
import { QUALIFIERS, battingAverage, onBasePct } from '../domain/stats.js';
import { parseStatSeasonId, sortSeasonIds } from '../domain/season-ids.js';
import {
  esc, icon, fmtAvg, fmtRate, card, empty, emptyCard, seasonLabel, seasonSortKey,
  summaryConfig, gameDate, shortDate, slug, cap
} from './player-shared.js';

const isSubSeason = (s, key) => parseStatSeasonId(key).isSub || /^yes$/i.test(String(s.sub ?? '')) || s.sub === true;

export async function render(el, ctx) {
  if (ctx.placeholder) {
    el.innerHTML = emptyCard('No stats yet',
      'Stats show up here once you are on a roster and your first game is in. Your captain can help if something looks wrong.', 'softball');
    return;
  }

  const hasSubs = ctx.rows.some(r => r.sub);
  el.innerHTML = `
    ${ctx.name === 'Mike Streaman' ? chefCard() : ''}
    ${card('Seasons', '<div id="plBatTable"></div>', {
      iconName: 'table',
      extra: hasSubs ? `<div class="aces-segmented pl-subs" role="group" aria-label="Sub games">
        <button type="button" class="aces-segment" data-subs="all" aria-pressed="true">All</button>
        <button type="button" class="aces-segment" data-subs="regular" aria-pressed="false">No subs</button>
        <button type="button" class="aces-segment" data-subs="only" aria-pressed="false">Subs only</button></div>` : ''
    })}
    ${card('Career', '<div id="plCareerTable"></div>', { iconName: 'chart-bar' })}
    <div class="pl-two">
      <div id="plRadial">${card('Profile', '<span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span>', { iconName: 'target' })}</div>
      <div class="aces-stack">
        <div id="plBests"></div>
        <div id="plHighs"></div>
      </div>
    </div>`;

  // Seasons
  const name = ctx.name;
  const seasons = mountStatTable(el.querySelector('#plBatTable'),
    battingTableConfig({ id: 'bat', omit: ['name'], lead: ['season', 'team'], sort: '-season', hitTypes: 'some' }), {
      emptyMessage: 'No batting stats yet.',
      exportName: `aces-${slug(name)}-batting`,
      exportTitle: `${name} batting`
    });
  let subs = 'all';
  const apply = () => seasons.setRows(ctx.rows.filter(r => (subs === 'regular' ? !r.sub : subs === 'only' ? r.sub : true)));
  apply();
  applyTeamGames(ctx.rows).then(() => seasons.refresh()).catch(err => console.warn('[player] team games', err));
  el.querySelector('.pl-subs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-subs]');
    if (!b) return;
    subs = b.dataset.subs;
    el.querySelectorAll('[data-subs]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });

  // Career
  const config = battingTableConfig({ id: 'car', omit: ['name', 'team', 'sub'], lead: ['season'] });
  const merge = config.combine.merge;
  const regular = ctx.rows.filter(r => !r.sub);
  const bpis = regular.map(r => r.acesBPI).filter(v => typeof v === 'number');
  const stored = ctx.player?.career?.acesBPI;
  const avgBPI = typeof stored === 'number' && stored ? stored : (bpis.length ? bpis.reduce((a, b) => a + b, 0) / bpis.length : null);
  const label = (row, text, key) => ({ ...row, seasonLabel: text, seasonKey: key, seasonCount: 2, team: '', teamKey: '', acesBPI: avgBPI });
  const careerRows = [];
  if (regular.length && hasSubs) careerRows.push(label(merge(regular), 'Regular seasons', 2));
  if (ctx.rows.length) careerRows.push(label(merge(ctx.rows), 'Career total', 1));
  mountStatTable(el.querySelector('#plCareerTable'), summaryConfig(config), {
    useUrl: false, rows: careerRows, emptyMessage: 'No batting stats yet.',
    exportName: `aces-${slug(name)}-career`, exportTitle: `${name} career`
  });

  renderBests(el.querySelector('#plBests'), ctx);
  renderHighs(el.querySelector('#plHighs'), ctx);
  renderRadial(el.querySelector('#plRadial'), ctx);
}

// ---------------------------------------------------------------------------
// Radial profile
// ---------------------------------------------------------------------------

const AXES = [
  { key: 'avg', label: 'AVG', title: 'Batting average', format: v => fmtAvg(v), rate: true },
  { key: 'obp', label: 'OBP', title: 'On-base percentage', format: v => fmtAvg(v), rate: true },
  { key: 'runs', label: 'Runs', title: 'Runs', format: v => String(Math.round(v)) },
  { key: 'bpi', label: 'AcesBPI', title: 'AcesBPI (career: average)', format: v => fmtRate(v, { digits: 1 }) },
  { key: 'games', label: 'Games', title: 'Games', format: v => String(Math.round(v)) }
];

/** Regular-season lines per player: for one season, or added up over a career. */
function leagueLines(players, seasonId) {
  const out = [];
  for (const p of players) {
    const line = { id: p.id, games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, bpis: [], team: '' };
    for (const s of seasonsObjectToArray(p)) {
      if (isSubSeason(s, s.seasonId)) continue;
      if (seasonId && parseStatSeasonId(s.seasonId).id !== seasonId) continue;
      line.games += Number(s.games) || 0;
      line.atBats += Number(s.atBats) || 0;
      line.hits += Number(s.hits) || 0;
      line.runs += Number(s.runs) || 0;
      line.walks += Number(s.walks) || 0;
      if (typeof s.acesBPI === 'number') line.bpis.push(s.acesBPI);
      line.team = String(s.team || line.team).toLowerCase();
    }
    if (!line.games && !line.atBats) continue;
    line.pa = line.atBats + line.walks;
    line.avg = battingAverage(line.hits, line.atBats);
    line.obp = onBasePct(line.hits, line.walks, line.atBats);
    line.bpi = line.bpis.length ? line.bpis.reduce((a, b) => a + b, 0) / line.bpis.length : null;
    out.push(line);
  }
  return out;
}

function radialAxes(lines, me, seasonId) {
  // Rate maxima only count qualified hitters, so a 1-for-1 doesn't set the ring:
  // a season uses 2 PA per team game (the most games anyone on that team played),
  // a career 150 PA.
  const teamGames = {};
  for (const l of lines) teamGames[l.team] = Math.max(teamGames[l.team] || 0, l.games);
  const qualified = lines.filter(l => (seasonId ? l.pa >= QUALIFIERS.PA_PER_TEAM_GAME * (teamGames[l.team] || 0) : l.pa >= QUALIFIERS.CAREER_MIN_PA));
  const pool = qualified.length >= 3 ? qualified : lines;
  const sum = (k) => lines.reduce((t, l) => t + l[k], 0);
  const mean = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const avg = {
    avg: battingAverage(sum('hits'), sum('atBats')),
    obp: onBasePct(sum('hits'), sum('walks'), sum('atBats')),
    runs: mean(lines.map(l => l.runs)),
    bpi: mean(lines.map(l => l.bpi).filter(v => v !== null)),
    games: mean(lines.map(l => l.games))
  };
  const max = (k, rate) => Math.max(...(rate ? pool : lines).map(l => l[k]).filter(v => typeof v === 'number' && Number.isFinite(v)), me[k] ?? 0, 0.001);
  return AXES.map(a => ({ ...a, value: me[a.key], avg: avg[a.key], max: max(a.key, a.rate) }));
}

async function renderRadial(host, ctx) {
  const seasons = sortSeasonIds(ctx.rows.filter(r => !r.sub).map(r => r.seasonId));
  if (!seasons.length) {
    host.innerHTML = card('Profile', empty('No regular seasons yet', 'The profile compares regular-season play.', 'target'), { iconName: 'target' });
    return;
  }
  let players;
  try { players = await ctx.allPlayers(); } catch (err) {
    console.warn('[player] league stats unavailable', err);
    host.innerHTML = card('Profile', empty('The profile could not load', 'League stats are unavailable right now.', 'alert-circle'), { iconName: 'target' });
    return;
  }
  const cache = new Map();
  const linesFor = (sid) => { if (!cache.has(sid)) cache.set(sid, leagueLines(players, sid)); return cache.get(sid); };
  let scope = 'career';

  const draw = () => {
    const sid = scope === 'career' ? null : scope;
    const lines = linesFor(sid || '');
    const me = leagueLines([ctx.player], sid)[0];
    const controls = `<div class="pl-radial-controls">
      <span class="aces-select-wrap is-inline"><select class="aces-select is-sm" data-radial aria-label="Season or career">
        <option value="career"${scope === 'career' ? ' selected' : ''}>Career</option>
        ${seasons.map(s => `<option value="${esc(s)}"${scope === s ? ' selected' : ''}>${esc(seasonLabel(s))}</option>`).join('')}
      </select></span></div>`;
    const body = me
      ? radialChart({
          axes: radialAxes(lines, me, sid),
          name: ctx.name,
          compareLabel: 'League average',
          caption: sid
            ? `${seasonLabel(sid)}, regular games. The outer ring is the league best that season (AVG and OBP among hitters with 2 PA per team game).`
            : `Career, regular seasons. The outer ring is the league best (AVG and OBP among hitters with ${QUALIFIERS.CAREER_MIN_PA}+ PA).`
        })
      : empty('No regular games this season', '', 'target');
    host.innerHTML = card('Profile', body, { iconName: 'target', extra: controls });
    host.querySelector('[data-radial]').addEventListener('change', (e) => { scope = e.target.value; draw(); });
  };
  draw();
}

// ---------------------------------------------------------------------------
// Career bests and hit streaks
// ---------------------------------------------------------------------------

function bestTile(iconName, label, value, context) {
  return `<div class="pl-best">${icon(iconName)}<span class="pl-best-label">${esc(label)}</span>
    <span class="pl-best-value">${esc(value)}</span><span class="pl-best-ctx">${esc(context)}</span></div>`;
}

async function renderBests(host, ctx) {
  const regular = ctx.rows.filter(r => !r.sub);
  const tiles = [];
  const top = (list, fn) => list.reduce((best, r) => (fn(r) > fn(best) ? r : best), list[0]);
  const rated = regular.filter(r => r.atBats >= QUALIFIERS.ALL_TIME_MIN_AB);
  if (rated.length) {
    const ba = top(rated, r => r.hits / r.atBats);
    if (ba.hits) tiles.push(bestTile('target', 'Best AVG', fmtAvg(ba.hits / ba.atBats), ba.seasonLabel));
    const obpOf = (r) => (r.hits + r.walks) / (r.atBats + r.walks);
    const obp = top(rated, obpOf);
    if (obpOf(obp)) tiles.push(bestTile('eye', 'Best OBP', fmtAvg(obpOf(obp)), obp.seasonLabel));
  }
  if (regular.length) {
    for (const [k, label, ic] of [['hits', 'Most hits', 'bat'], ['runs', 'Most runs', 'home-plate'], ['walks', 'Most walks', 'arrow-right'], ['games', 'Most games', 'calendar']]) {
      const r = top(regular, x => x[k]);
      if (r[k] > 0) tiles.push(bestTile(ic, label, String(r[k]), r.seasonLabel));
    }
    const withBPI = regular.filter(r => typeof r.acesBPI === 'number');
    if (withBPI.length) { const r = top(withBPI, x => x.acesBPI); tiles.push(bestTile('star', 'Best AcesBPI', fmtRate(r.acesBPI, { digits: 1 }), r.seasonLabel)); }
  }

  const paint = (extra = '') => {
    host.innerHTML = card('Career bests',
      tiles.length || extra ? `<p class="pl-note">Single-season records from regular-season play.${rated.length < regular.length ? ` AVG and OBP need ${QUALIFIERS.ALL_TIME_MIN_AB}+ at-bats.` : ''}</p>
        <div class="pl-bests">${tiles.join('')}${extra}</div>`
        : empty('No records yet', 'Career bests appear after a regular season.', 'medal'),
      { iconName: 'medal' });
  };
  paint();

  // Hit streaks (hitStreaks, keyed by legacy ID; currentStreak is on the cross-season docs).
  try {
    const snap = await getDocs(query(collection(db, 'hitStreaks'), where('playerLegacyId', '==', ctx.legacyId)));
    let max = null, active = 0;
    snap.forEach(d => {
      const v = d.data();
      if ((v.streakLength || 0) > (max?.streakLength || 0)) max = v;
      if (typeof v.currentStreak === 'number' && v.currentStreak > active) active = v.currentStreak;
    });
    if (!max?.streakLength) return;
    const span = max.seasonsSpanned?.length ? max.seasonsSpanned.map(seasonLabel).join(' to ')
      : max.seasonId && max.seasonId !== 'crossSeason' ? seasonLabel(max.seasonId) : 'All seasons';
    let extra = bestTile('flame', 'Longest hit streak', `${max.streakLength} games`, span);
    if (active >= 2) extra += bestTile('zap', 'Active hit streak', `${active} games`, 'Ongoing');
    paint(extra);
  } catch (err) {
    console.warn('[player] hit streaks unavailable', err);
  }
}

// ---------------------------------------------------------------------------
// Single-game highs (game-level stats, 2025 on)
// ---------------------------------------------------------------------------

async function renderHighs(host, ctx) {
  let games = [];
  try { games = (await ctx.battingGames()).filter(g => seasonSortKey(g.seasonId) >= seasonSortKey('2025-summer')); } catch (err) {
    console.warn('[player] game stats unavailable', err);
  }
  if (!games.length) { host.innerHTML = ''; return; }
  const stats = [
    ['hits', 'Hits', 'bat'], ['runs', 'Runs', 'home-plate'], ['walks', 'Walks', 'arrow-right'],
    ['doubles', 'Doubles', 'zap'], ['homeRuns', 'Home runs', 'flame']
  ];
  const tiles = [];
  for (const [k, label, ic] of stats) {
    const vals = games.map(g => Number(g[k]) || 0);
    const max = Math.max(...vals);
    if (max <= 0) continue;
    const hits = games.filter(g => (Number(g[k]) || 0) === max);
    const g = hits[0];   // games are newest first
    const when = `${shortDate(gameDate(g))} vs ${cap(g.opponent || 'Unknown')}${hits.length > 1 ? ` (${hits.length} times)` : ''}`;
    tiles.push(bestTile(ic, label, String(max), when));
  }
  host.innerHTML = tiles.length ? card('Single-game highs',
    `<p class="pl-note">From ${games.length} tracked game${games.length === 1 ? '' : 's'} (2025 on). The most recent is shown when tied.</p><div class="pl-bests">${tiles.join('')}</div>`,
    { iconName: 'zap' }) : '';
}

// ---------------------------------------------------------------------------

function chefCard() {
  const item = (ic, title, text) => `<li>${icon(ic)}<strong>${esc(title)}</strong><span>${esc(text)}</span></li>`;
  return `<section class="aces-card pl-chef">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('flame')}Master Chef</h2><span class="aces-badge is-accent">League legend</span></div>
    <p class="pl-note">The heart and soul of every game-day feast.</p>
    <ul class="pl-chef-list">
      ${item('calendar', 'Every game chef', 'Cooks for every single game, rain or shine')}
      ${item('users', 'Team dad', 'Father of Andrew Streaman, supporting the next generation')}
      ${item('trophy', 'Culinary MVP', 'Keeping the team well fed and energized')}
      ${item('handshake', 'Team spirit', 'Bringing everyone together through food')}
    </ul>
  </section>`;
}

