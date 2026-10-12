// js/pages/roster-tracker.js
// roster-tracker.html: how rosters changed between seasons.
//
//   Changes   two seasons side by side: each team's roster in the later one,
//             marked Stayed / Moved (from another team) / Returned (back after
//             time away) / New, plus who left. Totals on top.
//   Timeline  every player's team, season by season (one row per player).
//
// URL: ?view=timeline&from=2025-fall&to=2026-summer&q=smith&team=red
// Rosters are the season rows in aggregatedPlayerStats (subs left out): a
// player is on a team in a season when he has a season line for it.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, playerUrl } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const EXCLUDED = new Set(['kings']);
const STATUS = {
  stayed: { label: 'Stayed', icon: 'check' },
  moved: { label: 'Moved', icon: 'arrow-right' },
  returned: { label: 'Returned', icon: 'undo' },
  new: { label: 'New', icon: 'user-plus' },
  left: { label: 'Left', icon: 'log-out' }
};
const ORDER = { stayed: 0, moved: 1, returned: 2, new: 3 };

const S = {
  seasons: [],        // season IDs with rosters, oldest first
  rosters: new Map(), // seasonId -> Map(playerKey -> { id, name, team, teamKey })
  people: new Map(),  // playerKey -> { id, name }
  view: 'changes', from: '', to: '', q: '', team: ''
};

function teamTag(team, { cls = '' } = {}) {
  const k = String(team || '').toLowerCase();
  return `<span class="rt-team ${cls}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>${esc(team)}</span>`;
}

function build(players) {
  buildBattingRows(players).forEach((r) => {
    if (r.sub || !r.team || EXCLUDED.has(r.teamKey)) return;
    const key = r.id || r.name;
    if (!S.rosters.has(r.seasonId)) S.rosters.set(r.seasonId, new Map());
    const m = S.rosters.get(r.seasonId);
    // A player on two teams in one season keeps the one with more games.
    const prev = m.get(key);
    if (!prev || r.games > prev.games) m.set(key, { id: r.id, name: r.name, team: r.team, teamKey: r.teamKey, games: r.games });
    if (!S.people.has(key)) S.people.set(key, { id: r.id, name: r.name });
  });
  S.seasons = [...S.rosters.keys()].sort((a, b) => seasonSortKey(a) - seasonSortKey(b));
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

function compare(from, to) {
  const A = S.rosters.get(from) || new Map();
  const B = S.rosters.get(to) || new Map();
  const before = new Set();
  S.seasons.filter((s) => seasonSortKey(s) < seasonSortKey(from)).forEach((s) => S.rosters.get(s).forEach((_, k) => before.add(k)));
  const teams = new Map();
  const get = (team, teamKey) => {
    if (!teams.has(teamKey)) teams.set(teamKey, { team, teamKey, now: [], left: [] });
    return teams.get(teamKey);
  };
  B.forEach((p, k) => {
    const was = A.get(k);
    const status = was ? (was.teamKey === p.teamKey ? 'stayed' : 'moved') : before.has(k) ? 'returned' : 'new';
    get(p.team, p.teamKey).now.push({ ...p, key: k, status, from: was && was.teamKey !== p.teamKey ? was.team : '' });
  });
  A.forEach((p, k) => {
    if (!B.has(k)) get(p.team, p.teamKey).left.push({ ...p, key: k, status: 'left' });
    // Players who moved also show, faded, on the team they left.
    else if (B.get(k).teamKey !== p.teamKey) get(p.team, p.teamKey).left.push({ ...p, key: k, status: 'moved', to: B.get(k).team });
  });
  teams.forEach((t) => {
    t.now.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
    t.left.sort((a, b) => a.name.localeCompare(b.name));
  });
  return [...teams.values()].sort((a, b) => a.team.localeCompare(b.team));
}

function playerLine(p) {
  const st = STATUS[p.status];
  const note = p.from ? `from ${teamTag(p.from, { cls: 'is-sm' })}` : p.to ? `to ${teamTag(p.to, { cls: 'is-sm' })}` : '';
  return `<li class="rt-p is-${p.status}${p.to || p.status === 'left' ? ' is-gone' : ''}">
    <a href="${esc(playerUrl({ id: p.id, name: p.name }))}">${esc(p.name)}</a>
    ${note ? `<span class="rt-note">${note}</span>` : ''}
    ${p.status !== 'stayed' ? `<span class="rt-badge is-${p.status}">${icon(st.icon)}${esc(p.to ? 'Moved' : st.label)}</span>` : ''}
  </li>`;
}

function renderChanges() {
  const teams = compare(S.from, S.to);
  const all = teams.flatMap((t) => t.now);
  const left = teams.flatMap((t) => t.left.filter((p) => p.status === 'left'));
  const count = (s) => all.filter((p) => p.status === s).length;
  $('rtStats').innerHTML = [
    [all.length, 'Players', seasonLabel(S.to)],
    [count('stayed'), 'Stayed', 'same team'],
    [count('moved'), 'Moved', 'new team'],
    [count('returned'), 'Returned', 'back after time away'],
    [count('new'), 'New', 'first season'],
    [left.length, 'Left', `played ${seasonLabel(S.from)}`]
  ].map(([v, l, m], i) => `<div class="aces-stat${i ? ` rt-stat is-${['', 'stayed', 'moved', 'returned', 'new', 'left'][i]}` : ''}"><span class="aces-stat-value">${v}</span><span class="aces-stat-label">${esc(l)}</span><span class="aces-stat-meta">${esc(m)}</span></div>`).join('');

  const q = S.q.trim().toLowerCase();
  const match = (p) => !q || p.name.toLowerCase().includes(q);
  const cards = teams.filter((t) => !S.team || t.teamKey === S.team).map((t) => {
    const now = t.now.filter(match);
    const gone = t.left.filter(match);
    if (q && !now.length && !gone.length) return '';
    const k = t.teamKey;
    return `<section class="aces-card rt-card"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>
      <header class="rt-card-head"><h2><a href="team.html?${esc(new URLSearchParams({ team: t.team }).toString())}">${esc(t.team)}</a></h2>
        <span>${t.now.length ? `${t.now.length} player${t.now.length === 1 ? '' : 's'}` : 'Not in ' + esc(seasonLabel(S.to))}</span></header>
      ${now.length ? `<ul class="rt-list">${now.map(playerLine).join('')}</ul>` : ''}
      ${gone.length ? `<h3 class="rt-sub">Gone since ${esc(seasonLabel(S.from))}</h3><ul class="rt-list">${gone.map(playerLine).join('')}</ul>` : ''}
    </section>`;
  }).join('');
  $('rtChanges').innerHTML = cards || '<p class="aces-empty">No players match.</p>';
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function renderTimeline() {
  const q = S.q.trim().toLowerCase();
  const seasons = S.seasons;
  let people = [...S.people.entries()].map(([k, p]) => ({ k, ...p, by: seasons.map((s) => S.rosters.get(s).get(k) || null) }));
  if (q) people = people.filter((p) => p.name.toLowerCase().includes(q));
  if (S.team) people = people.filter((p) => p.by.some((x) => x && x.teamKey === S.team));
  // Most recent season played first, then name.
  const last = (p) => { for (let i = p.by.length - 1; i >= 0; i--) if (p.by[i]) return i; return -1; };
  people.sort((a, b) => last(b) - last(a) || a.name.localeCompare(b.name));
  const shown = people.slice(0, 400);
  $('rtTimeline').innerHTML = `<div class="aces-card is-flush"><div class="aces-table-wrap rt-tl-wrap"><table class="aces-table is-compact rt-tl">
    <thead><tr><th scope="col">Player</th><th scope="col" class="is-num">Seasons</th>${seasons.map((s) => `<th scope="col" class="rt-tl-s">${esc(seasonLabel(s).replace(' ', '\n'))}</th>`).join('')}</tr></thead>
    <tbody>${shown.map((p) => `<tr>
      <th scope="row"><a href="${esc(playerUrl({ id: p.id, name: p.name }))}">${esc(p.name)}</a></th>
      <td class="is-num">${p.by.filter(Boolean).length}</td>
      ${p.by.map((x, i) => {
        if (!x) return '<td class="rt-tl-c is-off"></td>';
        const prev = p.by[i - 1];
        const moved = prev && prev.teamKey !== x.teamKey;
        return `<td class="rt-tl-c"${TEAM_COLORS.has(x.teamKey) ? ` data-team-color="${esc(x.teamKey)}"` : ''} title="${esc(`${x.team}, ${seasonLabel(seasons[i])}`)}"><span>${esc(x.team)}</span>${moved ? '<i class="rt-move" aria-label="moved"></i>' : ''}</td>`;
      }).join('')}
    </tr>`).join('')}</tbody></table></div></div>
    <p class="rt-note-line">${people.length > shown.length ? `Showing ${shown.length} of ${people.length} players; search or pick a team to narrow it. ` : ''}Newest seasons on the right; a dot marks a move to a new team.</p>`;
  const wrap = $('rtTimeline').querySelector('.rt-tl-wrap');
  if (wrap) wrap.scrollLeft = wrap.scrollWidth;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function controls() {
  const opts = (sel) => [...S.seasons].reverse().map((s) => `<option value="${esc(s)}"${s === sel ? ' selected' : ''}>${esc(seasonLabel(s))}</option>`).join('');
  const teams = [...new Set(S.seasons.flatMap((s) => [...S.rosters.get(s).values()].map((p) => `${p.teamKey}|${p.team}`)))]
    .map((x) => x.split('|')).sort((a, b) => a[1].localeCompare(b[1]));
  $('rtControls').innerHTML = `
    <div class="aces-segmented" role="group" aria-label="View">
      <button type="button" class="aces-segment" data-view="changes" aria-pressed="${S.view === 'changes'}">${icon('arrow-left-right')}Changes</button>
      <button type="button" class="aces-segment" data-view="timeline" aria-pressed="${S.view === 'timeline'}">${icon('calendar')}Timeline</button>
    </div>
    <div class="rt-pair" ${S.view === 'changes' ? '' : 'hidden'}>
      <label class="rt-field"><span class="aces-label">From</span><span class="aces-select-wrap"><select class="aces-select" data-f="from">${opts(S.from)}</select></span></label>
      ${icon('arrow-right')}
      <label class="rt-field"><span class="aces-label">To</span><span class="aces-select-wrap"><select class="aces-select" data-f="to">${opts(S.to)}</select></span></label>
    </div>
    <label class="rt-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" data-f="team">
      <option value="">All teams</option>${teams.map(([k, t]) => `<option value="${esc(k)}"${k === S.team ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span></label>
    <label class="rt-field is-grow"><span class="aces-label">Player</span><input class="aces-input" type="search" data-f="q" value="${esc(S.q)}" placeholder="Find a player" autocomplete="off"></label>`;
}

function render() {
  $('rtChangesView').hidden = S.view !== 'changes';
  $('rtTimeline').hidden = S.view !== 'timeline';
  $('rtControls').querySelector('.rt-pair').hidden = S.view !== 'changes';
  if (S.view === 'changes') renderChanges(); else renderTimeline();
  const u = new URL(location.href);
  ['view', 'from', 'to', 'q', 'team'].forEach((k) => u.searchParams.delete(k));
  if (S.view !== 'changes') u.searchParams.set('view', S.view);
  if (S.view === 'changes') { u.searchParams.set('from', S.from); u.searchParams.set('to', S.to); }
  if (S.team) u.searchParams.set('team', S.team);
  if (S.q.trim()) u.searchParams.set('q', S.q.trim());
  history.replaceState(null, '', u);
}

function wire() {
  $('rtControls').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (!v) return;
    S.view = v.dataset.view;
    $('rtControls').querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
    render();
  });
  $('rtControls').addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (f === 'from' || f === 'to' || f === 'team') { S[f] = e.target.value; render(); }
  });
  let t = null;
  $('rtControls').addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'q') return;
    S.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(render, 150);
  });
}

async function main() {
  await initPage({ title: 'Roster Tracker' });
  try {
    build(((await getAllPlayerStatsOptimized()) || []).filter((p) => !p.migrated));
  } catch (err) {
    showPageError(err);
    return;
  }
  if (S.seasons.length < 2) { pageReady(); $('rtChanges').innerHTML = '<p class="aces-empty">Not enough seasons to compare yet.</p>'; return; }
  const q = new URLSearchParams(location.search);
  const ok = (id) => (S.seasons.includes(id) ? id : '');
  S.to = ok(parseStatSeasonId(q.get('to') || '').id) || S.seasons[S.seasons.length - 1];
  S.from = ok(parseStatSeasonId(q.get('from') || '').id) || S.seasons[Math.max(0, S.seasons.indexOf(S.to) - 1)];
  S.view = q.get('view') === 'timeline' ? 'timeline' : 'changes';
  S.q = q.get('q') || '';
  S.team = (q.get('team') || '').toLowerCase();
  controls();
  wire();
  pageReady();
  render();
}

main().catch((err) => { pageReady(); showPageError(err); });
