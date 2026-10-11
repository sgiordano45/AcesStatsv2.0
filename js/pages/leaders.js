// js/pages/leaders.js
// leaders.html: top 10 per stat for Career, Best single seasons (all time) or
// One season, batting or pitching, plus the career Milestones clubs. Rows come
// from js/ui/batting-stats.js and js/ui/pitching-stats.js; rate stats use the
// shared minimums (js/domain/stats.js).
//
// URL: leaders.html?view=batting|pitching|milestones&scope=career|best|season&season=2026-fall
// view=milestones replaced milestones.html; view=pitching replaced pitching_leaders.html.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { applyTeamGames } from '../data/team-games.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { battingLine, era, QUALIFIERS, isQualifiedBatter, isQualifiedPitcher, qualifierLabel } from '../domain/stats.js';
import { seasonLabel, sortSeasonIds, seasonHasHitTypes } from '../domain/season-ids.js';
import { combineRows } from '../ui/table-model.js';
import { pickDefaultSeason } from '../ui/stat-filters.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { MILESTONES } from '../domain/summary.js';

const $ = (id) => document.getElementById(id);
const TOP = 10;
const VIEWS = ['batting', 'pitching', 'milestones'];
const SCOPES = ['career', 'best', 'season'];

let bat = [];          // player-season batting rows
let pit = [];          // pitcher-season pitching rows
let me = new Set();    // the signed-in player's IDs (View As aware)
let state = { view: 'batting', scope: 'career', season: '' };
let defaultSeason = '';
let seasonIds = [];

// ---------------------------------------------------------------------------
// Rows per scope
// ---------------------------------------------------------------------------

const batMerge = battingTableConfig().combine.merge;
const pitMerge = pitchingTableConfig().combine.merge;

// One row per player per season: old seasons stored sub games as a separate
// record ('2024-fall-gold-sub'), so a player who also subbed is merged.
function seasonRows(rows, merge) {
  return combineRows(rows, {
    key: (r) => `${r.id || r.name}|${r.seasonId}`,
    merge: (group) => {
      if (group.length === 1) return group[0];
      const regular = group.filter((r) => !r.sub);
      const main = regular[0] || group[0];
      return {
        ...merge(group),
        seasonCount: 1, seasonId: main.seasonId, seasonLabel: main.seasonLabel, seasonKey: main.seasonKey,
        team: main.team, teamKey: main.teamKey,
        acesBPI: main.acesBPI ?? null,
        teamGames: Math.max(...(regular.length ? regular : group).map((r) => r.teamGames || 0))
      };
    }
  });
}

function careerRows(rows, merge) {
  return combineRows(rows, {
    key: (r) => r.id || r.name,
    merge: (group) => {
      const bpis = group.map((r) => r.acesBPI).filter((v) => typeof v === 'number');
      return { ...merge(group), avgBPI: bpis.length ? bpis.reduce((a, b) => a + b, 0) / bpis.length : null };
    }
  });
}

function rowsFor(kind) {
  const base = kind === 'batting' ? bat : pit;
  const merge = kind === 'batting' ? batMerge : pitMerge;
  if (state.scope === 'career') return careerRows(base, merge);
  const seasons = seasonRows(base, merge);
  return state.scope === 'season' ? seasons.filter((r) => r.seasonId === state.season) : seasons;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const avg = (v) => fmtAvg(v);
const pa = (r) => r.atBats + r.walks;

function battingCategories() {
  const career = state.scope === 'career';
  const qualified = career
    ? { test: (r) => pa(r) >= QUALIFIERS.CAREER_MIN_PA, note: `min ${QUALIFIERS.CAREER_MIN_PA} PA` }
    : { test: (r) => r.teamGames > 0 && isQualifiedBatter(r, r.teamGames), note: qualifierLabel('batting').replace(/^Min/, 'min') };
  const cats = [
    { title: 'Games', icon: 'calendar-days', value: (r) => r.games },
    { title: 'At-bats', icon: 'bat', value: (r) => r.atBats },
    { title: 'Hits', icon: 'target', value: (r) => r.hits },
    { title: 'Runs', icon: 'activity', value: (r) => r.runs },
    { title: 'Walks', icon: 'user-check', value: (r) => r.walks },
    { title: 'Batting average', icon: 'percent', value: (r) => (r.atBats ? battingLine(r).avg : null), format: avg, ...qualified },
    { title: 'On-base %', icon: 'chart-bar', value: (r) => (pa(r) ? battingLine(r).obp : null), format: avg, ...qualified },
    career
      ? { title: 'AcesBPI (average)', icon: 'star', value: (r) => r.avgBPI, format: (v) => fmtRate(v), ...qualified }
      : { title: 'AcesBPI', icon: 'star', value: (r) => r.acesBPI, format: (v) => fmtRate(v), ...qualified }
  ];
  // Extra-base hits and RBI: one season, players on teams that tracked them
  // for every game (all teams from 2026 Fall; some in 2026 Summer).
  if (state.scope === 'season' && seasonHasHitTypes(state.season)) {
    const tracked = (fn) => (r) => (r.hasHitTypes ? fn(r) : null);
    const allTeams = bat.filter((r) => r.seasonId === state.season).every((r) => r.hasHitTypes);
    const note = allTeams ? '' : 'teams that tracked them every game';
    const withNote = (c) => ({ ...c, note: [c.note, note].filter(Boolean).join(' \u00b7 ') || undefined });
    cats.push(
      withNote({ title: 'Doubles', icon: 'hash', value: tracked((r) => r.doubles) }),
      withNote({ title: 'Home runs', icon: 'flame', value: tracked((r) => r.homeRuns) }),
      withNote({ title: 'RBI', icon: 'handshake', value: tracked((r) => r.rbi) }),
      withNote({ title: 'Slugging', icon: 'trending-up', value: tracked((r) => (r.atBats ? battingLine(r).slg : null)), format: avg, ...qualified }),
      withNote({ title: 'OPS', icon: 'zap', value: tracked((r) => (r.atBats ? battingLine(r).ops : null)), format: avg, ...qualified })
    );
  }
  return cats;
}

function pitchingCategories() {
  const qualified = state.scope === 'career'
    ? { test: (r) => r.ip >= QUALIFIERS.CAREER_MIN_IP, note: `min ${QUALIFIERS.CAREER_MIN_IP} IP` }
    : { test: (r) => r.teamGames > 0 && isQualifiedPitcher({ inningsPitched: r.ip }, r.teamGames), note: qualifierLabel('pitching').replace(/^Min/, 'min') };
  const ipExtra = { label: 'IP', value: (r) => formatIP(r.ip) };
  return [
    { title: 'Games pitched', icon: 'calendar-days', value: (r) => r.games },
    { title: 'Innings pitched', icon: 'timer', value: (r) => r.ip, format: (v) => formatIP(v) },
    { title: state.scope === 'career' ? 'Career ERA' : 'ERA', icon: 'trending-down', value: (r) => era(r.runsAllowed, r.ip), format: (v) => fmtRate(v), ascending: true, extra: ipExtra, ...qualified },
    { title: 'Fewest runs allowed', icon: 'shield', value: (r) => r.runsAllowed, ascending: true, extra: ipExtra, ...qualified }
  ];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const isMe = (r) => me.size > 0 && (r.ids || []).some((id) => me.has(id));
const dot = (r) => {
  const k = String(r.teamKey || '').toLowerCase();
  return r.team && k !== 'multiple' ? `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} title="${esc(r.team)}"></span>` : '';
};
const href = (r, kind) => `player.html?${r.id ? `id=${encodeURIComponent(r.id)}` : `name=${encodeURIComponent(r.name)}`}${kind === 'pitching' ? '&tab=pitching' : ''}`;

function board(rows, cat, kind) {
  const fmt = cat.format || ((v) => String(v));
  const list = rows
    .filter((r) => (cat.test ? cat.test(r) : true))
    .map((r) => ({ r, v: cat.value(r) }))
    .filter((x) => typeof x.v === 'number' && Number.isFinite(x.v))
    .sort((a, b) => (cat.ascending ? a.v - b.v : b.v - a.v) || a.r.name.localeCompare(b.r.name));
  if (!list.length) return '';

  // Ties share a rank.
  let rank = 0;
  list.forEach((x, i) => { if (i === 0 || x.v !== list[i - 1].v) rank = i + 1; x.rank = rank; });

  const sub = (r) => {
    const parts = [];
    if (state.scope === 'best') parts.push(r.seasonLabel);
    if (cat.extra) parts.push(`${cat.extra.value(r)} ${cat.extra.label}`);
    return parts.length ? `<small>${esc(parts.join(' \u00b7 '))}</small>` : '';
  };
  const row = (x, extra = '') => `<li class="ld-row${x.rank <= 3 ? ` is-top is-${x.rank}` : ''}${isMe(x.r) ? ' is-me' : ''}${extra}">
      <span class="ld-rank">${x.rank}</span>
      <span class="ld-name">${state.scope !== 'career' ? dot(x.r) : ''}<a href="${esc(href(x.r, kind))}">${esc(x.r.name)}</a>${sub(x.r)}</span>
      <span class="ld-val">${esc(fmt(x.v))}</span>
    </li>`;

  const top = list.slice(0, TOP);
  // "You are here": the signed-in player's row when it's outside the top 10.
  const mine = list.findIndex((x) => isMe(x.r));
  const you = mine >= TOP ? row(list[mine], ' is-extra') : '';

  return `<section class="aces-card ld-board">
    <h2 class="ld-title">${icon(cat.icon)}<span>${esc(cat.title)}</span>${cat.note ? `<small>${esc(cat.note)}</small>` : ''}</h2>
    <ol class="ld-list">${top.map((x) => row(x)).join('')}${you}</ol>
  </section>`;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

// Hits and runs use the same steps as the home page's milestone watch.
const CLUBS = [
  { key: 'hits', label: 'Hits', icon: 'target', steps: MILESTONES.hits },
  { key: 'runs', label: 'Runs', icon: 'activity', steps: MILESTONES.runs },
  { key: 'walks', label: 'Walks', icon: 'user-check', steps: [10, 20, 30, 40, 50] }
];
const CLOSE = 0.9;   // "Closing in": at least 90% of the way to the next club

function milestonesHtml() {
  const rows = careerRows(bat, batMerge);
  let html = '';
  for (const club of CLUBS) {
    const top = Math.max(0, ...rows.map((r) => r[club.key] || 0));
    // Steps carry on past the list while anyone is above the last one.
    const steps = [...club.steps];
    const inc = steps[steps.length - 1] - steps[steps.length - 2];
    while (steps[steps.length - 1] <= top) steps.push(steps[steps.length - 1] + inc);
    // Clubs up to and including the first one nobody has reached.
    const shown = steps.slice(0, steps.findIndex((t) => t > top) + 1);

    const closing = rows
      .map((r) => ({ r, v: r[club.key] || 0 }))
      .map((x) => ({ ...x, next: steps.find((t) => t > x.v) }))
      .filter((x) => x.next && x.v > 0 && x.v >= x.next * CLOSE)
      .sort((a, b) => (a.next - a.v) - (b.next - b.v) || b.v - a.v);

    const clubs = [...shown].reverse().map((t) => {
      const members = rows.filter((r) => (r[club.key] || 0) >= t).sort((a, b) => b[club.key] - a[club.key] || a.name.localeCompare(b.name));
      let rank = 0;
      const items = members.map((r, i) => {
        if (i === 0 || r[club.key] !== members[i - 1][club.key]) rank = i + 1;
        return `<li class="ld-row${rank <= 3 ? ` is-top is-${rank}` : ''}${isMe(r) ? ' is-me' : ''}">
          <span class="ld-rank">${rank}</span><span class="ld-name"><a href="${esc(href(r, 'batting'))}">${esc(r.name)}</a></span>
          <span class="ld-val">${r[club.key]}</span></li>`;
      }).join('');
      return `<section class="aces-card ld-board">
        <h2 class="ld-title">${icon('award')}<span>${t}+ ${esc(club.label)}</span><small>${members.length} player${members.length === 1 ? '' : 's'}</small></h2>
        ${members.length ? `<ol class="ld-list">${items}</ol>` : '<p class="ld-empty">No one has reached this yet.</p>'}
      </section>`;
    }).join('');

    html += `<div class="ld-club">
      <h2 class="aces-section-title ld-club-head">${icon(club.icon)}Career ${esc(club.label.toLowerCase())}</h2>
      <div class="ld-grid">
        ${closing.length ? `<section class="aces-card ld-board is-closing">
          <h2 class="ld-title">${icon('target')}<span>Closing in</span><small>within 10% of the next club</small></h2>
          <ol class="ld-list">${closing.map((x) => `<li class="ld-row${isMe(x.r) ? ' is-me' : ''}">
            <span class="ld-name"><a href="${esc(href(x.r, 'batting'))}">${esc(x.r.name)}</a><small>${x.v} now</small></span>
            <span class="ld-val ld-gap">${x.next - x.v} to ${x.next}</span></li>`).join('')}</ol>
        </section>` : ''}
        ${clubs}
      </div>
    </div>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const SCOPE_TEXT = {
  career: 'All-time career totals and averages.',
  best: 'The best single seasons ever.',
  season: 'Leaders for one season.'
};

function renderControls() {
  const ms = state.view === 'milestones';
  $('ldTabs').innerHTML = [['batting', 'Batting', 'bat'], ['pitching', 'Pitching', 'softball'], ['milestones', 'Milestones', 'award']]
    .map(([v, label, ic]) => `<a class="aces-tab" href="?view=${v}" data-view="${v}"${state.view === v ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  $('ldScope').hidden = ms;
  if (!ms) {
    $('ldScopeBtns').innerHTML = [['career', 'Career'], ['best', 'Best seasons'], ['season', 'One season']]
      .map(([s, label]) => `<button type="button" class="aces-segment" data-scope="${s}" aria-pressed="${state.scope === s}">${label}</button>`).join('');
    $('ldSeasonWrap').hidden = state.scope !== 'season';
    $('ldSeason').value = state.season;
  }
  const kind = state.view === 'batting' ? 'Batting' : 'Pitching';
  const scope = state.scope === 'career' ? 'career' : state.scope === 'best' ? 'best seasons' : seasonLabel(state.season);
  $('ldTitle').textContent = ms ? 'Career milestones' : `${kind} leaders`;
  $('ldDesc').textContent = ms
    ? 'Every player in each career club, and who is closing in on the next one.'
    : `${state.scope === 'season' ? `Leaders for ${scope}.` : SCOPE_TEXT[state.scope]} Top ${TOP}; ties share a rank.`;
}

function render() {
  if (state.view === 'milestones') {
    $('ldBody').innerHTML = milestonesHtml() || '<div class="aces-card"><div class="aces-empty"><p>No career stats yet.</p></div></div>';
    return;
  }
  const kind = state.view;
  const rows = rowsFor(kind);
  const cats = kind === 'batting' ? battingCategories() : pitchingCategories();
  const boards = cats.map((c) => board(rows, c, kind)).join('');
  $('ldBody').innerHTML = boards
    ? `<div class="ld-grid">${boards}</div>`
    : `<div class="aces-card"><div class="aces-empty">${icon('chart-bar')}<p>No ${esc(kind)} stats for ${state.scope === 'season' ? esc(seasonLabel(state.season)) : 'this view'} yet.</p></div></div>`;
}

function writeUrl() {
  const p = new URLSearchParams(location.search);
  const set = (k, v, dflt) => (v && v !== dflt ? p.set(k, v) : p.delete(k));
  set('view', state.view, 'batting');
  set('scope', state.view === 'milestones' ? '' : state.scope, 'career');
  set('season', state.view !== 'milestones' && state.scope === 'season' ? state.season : '', defaultSeason);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

function update(patch) {
  Object.assign(state, patch);
  renderControls();
  render();
  writeUrl();
}

function wire() {
  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v && !e.metaKey && !e.ctrlKey) { e.preventDefault(); update({ view: v.dataset.view }); return; }
    const s = e.target.closest('[data-scope]');
    if (s) update({ scope: s.dataset.scope });
  });
  $('ldSeason').addEventListener('change', (e) => update({ season: e.target.value }));
}

// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: 'Leaders' });
  me = new Set([ctx?.profile?.linkedPlayer, ctx?.profile?.playerId, ctx?.profile?.id, ctx?.profile?.mergedFromProfile,
    String(ctx?.profile?.linkedPlayer || '').trim().toLowerCase().replace(/\s+/g, '_'), ctx?.user?.uid].filter(Boolean));

  const players = await getAllPlayerStatsOptimized();
  bat = buildBattingRows(players);
  pit = buildPitchingRows(players);

  seasonIds = sortSeasonIds(bat.map((r) => r.seasonId).concat(pit.map((r) => r.seasonId)));
  defaultSeason = pickDefaultSeason(seasonIds, ctx?.config);
  $('ldSeason').innerHTML = seasonIds.map((id) => `<option value="${esc(id)}">${esc(seasonLabel(id))}</option>`).join('');

  const p = new URLSearchParams(location.search);
  state = {
    view: VIEWS.includes(p.get('view')) ? p.get('view') : 'batting',
    scope: SCOPES.includes(p.get('scope')) ? p.get('scope') : 'career',
    season: seasonIds.includes(p.get('season')) ? p.get('season') : defaultSeason
  };

  // Team games are needed for the single-season minimums.
  await Promise.all([applyTeamGames(bat, { fallbackToPlayerGames: true }), applyTeamGames(pit)]).catch((err) =>
    console.warn('[leaders] team games unavailable; single-season rate leaders will be empty', err));

  wire();
  renderControls();
  render();
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err, { container: '#ldBody' }); });
