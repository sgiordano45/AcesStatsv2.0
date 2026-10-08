// js/pages/compare.js
// compare.html: Players, Teams and Head-to-head in one page. It replaced
// compare.html (players), team_compare.html and h2h_grid.html; the last two
// are now stubs that forward here.
//
// URL: compare.html?mode=players|teams|grid&a=<id or team>&b=<id or team>&scope=career|<seasonId>
//   Players: a and b are player IDs; scope 'career' or a season.
//   Teams and grid: a and b are team names; scope 'all' (since 2022) or a season.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getAllSeasons } from '../data/seasons.js';
import { getSeasonGames } from '../data/games.js';
import { getAllAwards } from '../data/awards.js';
import { normalizeGames } from '../domain/standings.js';
import { battingLine, era } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey, sortSeasonIds, hasCompleteHitTypes } from '../domain/season-ids.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, formatPlayerName } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
const TEAMS_FROM = 2022;   // team records and the grid count games from 2022 on, as the old pages did
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const OFFICIAL = [...TEAM_COLORS].map(cap).sort();

const state = { mode: 'players', a: '', b: '', scope: '' };
const data = {
  bat: [], pit: [], awards: [], players: [], me: new Set(),
  seasons: [],          // season IDs from TEAMS_FROM, newest first
  games: null           // Promise<Map(seasonId -> normalized games)>
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const dot = (team) => {
  const k = String(team || '').toLowerCase();
  return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`;
};
const chip = (team) => (team ? `<span class="aces-team-chip">${dot(team)}${esc(team)}</span>` : '');

/** One "tale of the tape" row: A | label | B, with the better side marked. */
function tapeRow({ label, a, b, fmt = (v) => String(v), better = 'high', note = '' }) {
  const has = (v) => typeof v === 'number' && Number.isFinite(v);
  let win = '';
  if (better && has(a) && has(b) && a !== b) win = (better === 'high' ? a > b : a < b) ? 'a' : 'b';
  const max = has(a) && has(b) ? Math.max(Math.abs(a), Math.abs(b)) : 0;
  const bar = (v, side) => (better && max > 0 && has(v) && v >= 0
    ? `<span class="cmp-bar is-${side}${win === side ? ' is-win' : ''}" style="--w:${Math.round((v / max) * 100)}%"></span>` : '');
  const cell = (v, side) => `<td class="cmp-val is-${side}${win === side ? ' is-win' : ''}">
      <span class="cmp-num">${has(v) ? esc(fmt(v)) : (v === null || v === undefined || v === '' ? '&ndash;' : esc(String(v)))}</span>${bar(v, side)}</td>`;
  return `<tr>${cell(a, 'a')}<th scope="row" class="cmp-label">${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</th>${cell(b, 'b')}</tr>`;
}

const tape = (rows) => `<table class="cmp-tape"><tbody>${rows.join('')}</tbody></table>`;

function section(title, body, cls = '') {
  return `<section class="aces-card cmp-section ${cls}"><h2 class="cmp-section-title">${title}</h2>${body}</section>`;
}

function emptyCard(title, message) {
  return `<div class="aces-card"><div class="aces-empty">${icon('arrow-left-right')}<p class="aces-empty-title">${esc(title)}</p><p>${esc(message)}</p></div></div>`;
}

function selectHtml(id, label, options, value, placeholder) {
  return `<label class="aces-field cmp-pick"><span class="aces-label">${esc(label)}</span>
    <span class="aces-select-wrap"><select class="aces-select" id="${id}">
      ${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${options(value)}
    </select></span></label>`;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function playerList() {
  const byId = new Map();
  for (const r of data.bat.concat(data.pit)) {
    if (!r.id) continue;
    const p = byId.get(r.id) || { id: r.id, ids: r.ids, name: r.name, last: '', team: '', sub: true };
    // Team from the newest season, preferring the regular record to a sub one.
    if (!p.last || r.seasonKey > seasonSortKey(p.last)) Object.assign(p, { last: r.seasonId, team: r.team, sub: r.sub });
    else if (r.seasonId === p.last && p.sub && !r.sub) Object.assign(p, { team: r.team, sub: false });
    byId.set(r.id, p);
  }
  return [...byId.values()].sort((x, y) => x.name.localeCompare(y.name));
}

function playerOptions(value) {
  const newest = data.players.reduce((m, p) => Math.max(m, seasonSortKey(p.last)), 0);
  const current = data.players.filter(p => seasonSortKey(p.last) === newest);
  const rest = data.players.filter(p => seasonSortKey(p.last) !== newest);
  const opt = (p) => `<option value="${esc(p.id)}"${p.id === value ? ' selected' : ''}>${esc(p.name)}${p.team ? ` (${esc(p.team)})` : ''}</option>`;
  return `<optgroup label="Played ${esc(seasonLabel(current[0]?.last || ''))}">${current.map(opt).join('')}</optgroup>
    <optgroup label="Everyone else">${rest.map(opt).join('')}</optgroup>`;
}

/** A player's rows in scope, plus totals. */
function playerScope(id, scope) {
  const inScope = (r) => r.id === id && (scope === 'career' || r.seasonId === scope);
  const bat = data.bat.filter(inScope);
  const pit = data.pit.filter(inScope);
  const sum = (rows, fields) => Object.fromEntries(fields.map(f => [f, rows.reduce((s, r) => s + (r[f] || 0), 0)]));
  const b = sum(bat, ['games', 'atBats', 'hits', 'runs', 'walks', 'doubles', 'triples', 'homeRuns', 'rbi']);
  const p = sum(pit, ['games', 'ip', 'runsAllowed']);
  const regular = bat.filter(r => !r.sub);
  const bpis = regular.map(r => r.acesBPI).filter(v => typeof v === 'number');
  const teams = [...new Set((regular.length ? regular : bat).map(r => r.team).filter(Boolean))];
  return {
    bat, pit, b, p,
    line: battingLine(b),
    hitTypes: bat.length > 0 && bat.every(r => r.hasHitTypes),
    bpi: bpis.length ? bpis.reduce((s, v) => s + v, 0) / bpis.length : null,
    seasons: new Set(bat.concat(pit).map(r => r.seasonId)).size,
    teams
  };
}

function awardsFor(name, scope) {
  const list = data.awards.filter(a => a.player === name && (scope === 'career' || a.seasonId === scope));
  const counts = new Map();
  for (const a of list) counts.set(a.award, (counts.get(a.award) || 0) + 1);
  return [...counts].sort((x, y) => x[0].localeCompare(y[0])).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
}

function playerSeasons(a, b) {
  const ids = (id) => new Set(data.bat.concat(data.pit).filter(r => r.id === id).map(r => r.seasonId));
  const A = ids(a);
  const B = ids(b);
  return sortSeasonIds([...new Set([...A, ...B])]).map(id => ({ id, both: A.has(id) && B.has(id) }));
}

function renderPlayerControls() {
  const seasons = state.a && state.b ? playerSeasons(state.a, state.b) : [];
  $('cmpControls').innerHTML = `
    <div class="cmp-picks">
      ${selectHtml('pickA', 'Player 1', playerOptions, state.a, 'Choose a player')}
      <button type="button" class="aces-btn is-ghost cmp-swap" data-swap aria-label="Swap players">${icon('arrow-left-right')}</button>
      ${selectHtml('pickB', 'Player 2', playerOptions, state.b, 'Choose a player')}
    </div>
    ${selectHtml('pickScope', 'Compare', (v) => `<option value="career"${v === 'career' ? ' selected' : ''}>Career</option>
      ${seasons.map(s => `<option value="${esc(s.id)}"${s.id === v ? ' selected' : ''}>${esc(seasonLabel(s.id))}${s.both ? ' (both played)' : ''}</option>`).join('')}`, state.scope)}`;
}

function renderPlayers() {
  const A = data.players.find(p => p.id === state.a);
  const B = data.players.find(p => p.id === state.b);
  if (!A || !B) return emptyCard('Pick two players', 'Choose a player on each side to see them head to head.');
  if (A.id === B.id) return emptyCard('Same player twice', 'Choose two different players.');

  const scope = state.scope || 'career';
  const career = scope === 'career';
  const sa = playerScope(A.id, scope);
  const sb = playerScope(B.id, scope);

  const head = (p, s) => `<div class="cmp-who">
      <a class="cmp-name" href="player.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>
      <div class="cmp-teams">${(s.teams.length ? s.teams : [p.team]).map(chip).join(' ')}</div>
    </div>`;

  const notPlayed = (s) => !s.bat.length && !s.pit.length;
  const scopeName = career ? 'Career' : seasonLabel(scope);
  let html = `<div class="aces-card cmp-head">
      ${head(A, sa)}<span class="cmp-vs">vs</span>${head(B, sb)}
      <p class="cmp-scope">${esc(scopeName)}${career ? '' : notPlayed(sa) ? ` &middot; ${esc(A.name)} didn&rsquo;t play` : notPlayed(sb) ? ` &middot; ${esc(B.name)} didn&rsquo;t play` : ''}</p>
    </div>`;

  // Teammates: same season and team, both on the regular roster.
  const reg = (id) => new Set(data.bat.filter(r => r.id === id && !r.sub && (career || r.seasonId === scope)).map(r => `${r.seasonId}|${r.team}`));
  const ra = reg(A.id);
  const together = [...reg(B.id)].filter(k => ra.has(k)).map(k => k.split('|'));
  if (together.length) {
    html += `<p class="cmp-together">${icon('users')} Teammates ${career
      ? `in ${together.length} season${together.length === 1 ? '' : 's'}: ${together.sort((x, y) => seasonSortKey(y[0]) - seasonSortKey(x[0])).map(([sid, t]) => `${esc(seasonLabel(sid))} (${esc(t)})`).join(', ')}`
      : `on ${esc(together[0][1])}`}</p>`;
  }

  const avg = (v) => fmtAvg(v);
  if (sa.bat.length || sb.bat.length) {
    const val = (s, v) => (s.bat.length ? v : null);
    const hit = sa.hitTypes && sb.hitTypes;
    const rows = [
      career && tapeRow({ label: 'Seasons', a: sa.seasons, b: sb.seasons }),
      tapeRow({ label: 'Games', a: val(sa, sa.b.games), b: val(sb, sb.b.games) }),
      tapeRow({ label: 'Plate appearances', a: val(sa, sa.line.pa), b: val(sb, sb.line.pa) }),
      tapeRow({ label: 'Hits', a: val(sa, sa.b.hits), b: val(sb, sb.b.hits) }),
      tapeRow({ label: 'Runs', a: val(sa, sa.b.runs), b: val(sb, sb.b.runs) }),
      tapeRow({ label: 'Walks', a: val(sa, sa.b.walks), b: val(sb, sb.b.walks) }),
      hit && tapeRow({ label: 'Doubles', a: sa.b.doubles, b: sb.b.doubles }),
      hit && tapeRow({ label: 'Triples', a: sa.b.triples, b: sb.b.triples }),
      hit && tapeRow({ label: 'Home runs', a: sa.b.homeRuns, b: sb.b.homeRuns }),
      hit && tapeRow({ label: 'RBI', a: sa.b.rbi, b: sb.b.rbi }),
      tapeRow({ label: 'Batting average', a: val(sa, sa.b.atBats ? sa.line.avg : null), b: val(sb, sb.b.atBats ? sb.line.avg : null), fmt: avg }),
      tapeRow({ label: 'On-base %', a: val(sa, sa.line.pa ? sa.line.obp : null), b: val(sb, sb.line.pa ? sb.line.obp : null), fmt: avg }),
      hit && tapeRow({ label: 'Slugging', a: sa.b.atBats ? sa.line.slg : null, b: sb.b.atBats ? sb.line.slg : null, fmt: avg }),
      hit && tapeRow({ label: 'OPS', a: sa.b.atBats ? sa.line.ops : null, b: sb.b.atBats ? sb.line.ops : null, fmt: avg }),
      tapeRow({ label: career ? 'AcesBPI (season avg)' : 'AcesBPI', a: sa.bpi, b: sb.bpi, fmt: (v) => fmtRate(v) })
    ].filter(Boolean);
    html += section(`${icon('bat')} Batting`, tape(rows) +
      (!hit && (sa.bat.length && sb.bat.length) ? '<p class="cmp-note">2B, 3B, HR, RBI and slugging show when both players have them tracked for every season compared.</p>' : ''));
  }

  if (sa.p.ip > 0 || sb.p.ip > 0) {
    const pv = (s, v) => (s.p.ip > 0 ? v : null);
    html += section(`${icon('softball')} Pitching`, tape([
      tapeRow({ label: 'Games pitched', a: pv(sa, sa.p.games), b: pv(sb, sb.p.games) }),
      tapeRow({ label: 'Innings', a: pv(sa, sa.p.ip), b: pv(sb, sb.p.ip), fmt: (v) => formatIP(v) }),
      tapeRow({ label: 'Runs allowed', a: pv(sa, sa.p.runsAllowed), b: pv(sb, sb.p.runsAllowed), better: null }),
      tapeRow({ label: 'ERA', a: pv(sa, era(sa.p.runsAllowed, sa.p.ip)), b: pv(sb, era(sb.p.runsAllowed, sb.p.ip)), fmt: (v) => fmtRate(v), better: 'low' })
    ]));
  }

  const wa = awardsFor(A.name, scope);
  const wb = awardsFor(B.name, scope);
  if (wa.length || wb.length) {
    const list = (w) => (w.length ? `<ul class="cmp-awards">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="cmp-note">None</p>');
    html += section(`${icon('award')} Awards`, `<div class="cmp-two">${list(wa)}${list(wb)}</div>`);
  }
  return html;
}

// ---------------------------------------------------------------------------
// Teams and the grid (game docs from TEAMS_FROM on)
// ---------------------------------------------------------------------------

function loadGames() {
  data.games ??= Promise.all(data.seasons.map(id => getSeasonGames(id)
    .then(docs => [id, normalizeGames(docs)])
    .catch(err => { console.warn('[compare] games unavailable for', id, err); return [id, []]; })))
    .then(entries => new Map(entries));
  return data.games;
}

/** 'home' | 'away' | 'tie' | null, counting "Forfeit - Teal" winners too. */
function resultOf(g) {
  if (g.result) return g.result;
  const m = /forfeit\W*(\w+)/i.exec(g.unmatchedWinner || '');
  if (!m) return null;
  const w = m[1].toLowerCase();
  return w === g.home.toLowerCase() ? 'home' : w === g.away.toLowerCase() ? 'away' : null;
}

async function gamesInScope(scope) {
  const bySeason = await loadGames();
  const ids = scope === 'all' ? data.seasons : [scope];
  return ids.flatMap(id => (bySeason.get(id) || []).map(g => ({ ...g, seasonId: id }))).filter(g => resultOf(g));
}

function teamsIn(games) {
  const seen = new Set(games.flatMap(g => [g.home, g.away]).map(t => t.toLowerCase()));
  return OFFICIAL.filter(t => seen.has(t.toLowerCase()));
}

function recordOf(team, games) {
  const t = team.toLowerCase();
  const r = { w: 0, l: 0, t: 0, rf: 0, ra: 0, scored: 0 };
  for (const g of games) {
    const side = g.home.toLowerCase() === t ? 'home' : g.away.toLowerCase() === t ? 'away' : null;
    if (!side) continue;
    const res = resultOf(g);
    if (res === 'tie') r.t++; else if (res === side) r.w++; else r.l++;
    if (g.hasScores) {
      r.scored++;
      r.rf += side === 'home' ? g.homeScore : g.awayScore;
      r.ra += side === 'home' ? g.awayScore : g.homeScore;
    }
  }
  r.g = r.w + r.l + r.t;
  r.pct = r.w + r.l > 0 ? (r.w + r.t / 2) / r.g : null;
  return r;
}

function headToHead(a, b, games) {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  const meetings = games.filter(g => {
    const h = g.home.toLowerCase();
    const w = g.away.toLowerCase();
    return (h === A && w === B) || (h === B && w === A);
  }).sort((x, y) => (x.dateKey < y.dateKey ? 1 : x.dateKey > y.dateKey ? -1 : 0));
  const out = { a: 0, b: 0, t: 0, regular: 0, playoff: 0, aHome: 0, aAway: 0, bHome: 0, bAway: 0, meetings };
  for (const g of meetings) {
    if (g.type === 'playoff') out.playoff++; else out.regular++;
    const res = resultOf(g);
    if (res === 'tie') { out.t++; continue; }
    const winner = (res === 'home' ? g.home : g.away).toLowerCase();
    const atHome = res === 'home';
    if (winner === A) { out.a++; atHome ? out.aHome++ : out.aAway++; } else { out.b++; atHome ? out.bHome++ : out.bAway++; }
  }
  return out;
}

function teamBatting(team, scope) {
  const rows = data.bat.filter(r => r.team.toLowerCase() === team.toLowerCase() &&
    (scope === 'all' ? parseInt(r.seasonId, 10) >= TEAMS_FROM : r.seasonId === scope));
  const t = rows.reduce((s, r) => ({ atBats: s.atBats + r.atBats, hits: s.hits + r.hits, walks: s.walks + r.walks, runs: s.runs + r.runs }),
    { atBats: 0, hits: 0, walks: 0, runs: 0 });
  return { line: battingLine(t), players: new Set(rows.map(r => r.id || r.name)).size, seasons: new Set(rows.map(r => r.seasonId)).size, has: rows.length > 0 };
}

const scopeOptions = (v) => `<option value="all"${v === 'all' ? ' selected' : ''}>All seasons since ${TEAMS_FROM}</option>
  ${data.seasons.map(id => `<option value="${esc(id)}"${id === v ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('')}`;

function renderTeamControls(teams) {
  const opts = (v) => teams.map(t => `<option value="${esc(t)}"${t === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
  $('cmpControls').innerHTML = state.mode === 'grid'
    ? selectHtml('pickScope', 'Seasons', scopeOptions, state.scope)
    : `<div class="cmp-picks">
        ${selectHtml('pickA', 'Team 1', opts, state.a, 'Choose a team')}
        <button type="button" class="aces-btn is-ghost cmp-swap" data-swap aria-label="Swap teams">${icon('arrow-left-right')}</button>
        ${selectHtml('pickB', 'Team 2', opts, state.b, 'Choose a team')}
      </div>
      ${selectHtml('pickScope', 'Compare', scopeOptions, state.scope)}`;
}

function renderTeams(games) {
  const A = state.a;
  const B = state.b;
  if (!A || !B) return emptyCard('Pick two teams', 'Choose a team on each side to see their records and head-to-head.');
  if (A === B) return emptyCard('Same team twice', 'Choose two different teams.');
  const scope = state.scope;
  const scopeName = scope === 'all' ? `Since ${TEAMS_FROM}` : seasonLabel(scope);
  const ra = recordOf(A, games);
  const rb = recordOf(B, games);
  const ba = teamBatting(A, scope);
  const bb = teamBatting(B, scope);
  const h = headToHead(A, B, games);

  let html = `<div class="aces-card cmp-head">
      <div class="cmp-who"><a class="cmp-name" href="team.html?team=${encodeURIComponent(A)}">${chip(A)}</a></div>
      <span class="cmp-vs">vs</span>
      <div class="cmp-who"><a class="cmp-name" href="team.html?team=${encodeURIComponent(B)}">${chip(B)}</a></div>
      <p class="cmp-scope">${esc(scopeName)}</p>
    </div>`;

  // Head-to-head first: it's what people come for.
  if (h.meetings.length) {
    const lead = h.a > h.b ? `${A} leads` : h.b > h.a ? `${B} leads` : 'Series even';
    const last = h.meetings.slice(0, 5).map(g => {
      const res = resultOf(g);
      const w = res === 'tie' ? 'Tie' : res === 'home' ? g.home : g.away;
      const score = g.hasScores ? `${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}` : `${g.away} at ${g.home}`;
      return `<li><span class="cmp-meet-when">${esc(seasonLabel(g.seasonId))}${g.type === 'playoff' ? ' &middot; Playoff' : ''}</span>
        <span>${esc(score)}</span><span class="cmp-meet-win">${res === 'tie' ? 'Tie' : `${dot(w)}${esc(w)}`}</span></li>`;
    }).join('');
    html += section(`${icon('swords')} Head-to-head`, `
      <p class="cmp-h2h"><span>${esc(A)}</span><strong>${h.a}&ndash;${h.b}${h.t ? `&ndash;${h.t}` : ''}</strong><span>${esc(B)}</span></p>
      <p class="cmp-scope">${h.meetings.length} game${h.meetings.length === 1 ? '' : 's'} &middot; ${esc(lead)}${h.playoff ? ` &middot; ${h.playoff} in the playoffs` : ''}</p>
      ${tape([
        tapeRow({ label: 'Wins at home', a: h.aHome, b: h.bHome }),
        tapeRow({ label: 'Wins away', a: h.aAway, b: h.bAway })
      ])}
      <h3 class="cmp-sub">Last ${Math.min(5, h.meetings.length)} meetings</h3>
      <ul class="cmp-meetings">${last}</ul>`);
  } else {
    html += section(`${icon('swords')} Head-to-head`, `<p class="cmp-note">${esc(A)} and ${esc(B)} haven&rsquo;t played ${scope === 'all' ? `since ${TEAMS_FROM}` : `in ${esc(scopeName)}`}.</p>`);
  }

  const rec = (r) => (r.g ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : null);
  const perGame = (n, r) => (r.scored ? n / r.scored : null);
  html += section(`${icon('trophy')} Record`, tape([
    tapeRow({ label: 'Record', a: rec(ra), b: rec(rb), better: null }),
    tapeRow({ label: 'Win %', a: ra.pct, b: rb.pct, fmt: (v) => fmtAvg(v) }),
    tapeRow({ label: 'Runs scored per game', a: perGame(ra.rf, ra), b: perGame(rb.rf, rb), fmt: (v) => fmtRate(v, { digits: 1 }) }),
    tapeRow({ label: 'Runs allowed per game', a: perGame(ra.ra, ra), b: perGame(rb.ra, rb), fmt: (v) => fmtRate(v, { digits: 1 }), better: 'low' }),
    tapeRow({ label: 'Run differential', a: ra.scored ? ra.rf - ra.ra : null, b: rb.scored ? rb.rf - rb.ra : null, fmt: (v) => (v > 0 ? `+${v}` : String(v)) })
  ]));

  if (ba.has || bb.has) {
    const avg = (v) => fmtAvg(v);
    html += section(`${icon('bat')} Team batting`, tape([
      tapeRow({ label: 'Batting average', a: ba.has ? ba.line.avg : null, b: bb.has ? bb.line.avg : null, fmt: avg }),
      tapeRow({ label: 'On-base %', a: ba.has ? ba.line.obp : null, b: bb.has ? bb.line.obp : null, fmt: avg }),
      tapeRow({ label: 'Players used', a: ba.has ? ba.players : null, b: bb.has ? bb.players : null, better: null }),
      scope === 'all' && tapeRow({ label: 'Seasons', a: ba.seasons, b: bb.seasons, better: null })
    ].filter(Boolean)));
  }
  return html;
}

function renderGrid(games) {
  const teams = teamsIn(games);
  if (teams.length < 2) return emptyCard('No games yet', 'There are no finished games in these seasons.');
  const cell = (row, col) => {
    if (row === col) return '<td class="h2h-self" aria-label="Same team">&mdash;</td>';
    const h = headToHead(row, col, games);
    if (!h.meetings.length) return '<td class="h2h-none">&ndash;</td>';
    const cls = h.a > h.b ? 'is-ahead' : h.a < h.b ? 'is-behind' : 'is-even';
    const q = `mode=teams&a=${encodeURIComponent(row)}&b=${encodeURIComponent(col)}${state.scope !== 'all' ? `&scope=${encodeURIComponent(state.scope)}` : ''}`;
    return `<td class="h2h-cell ${cls}"><a href="compare.html?${esc(q)}" title="${esc(`${row} vs ${col}`)}">${h.a}-${h.b}${h.t ? `-${h.t}` : ''}</a></td>`;
  };
  const table = `<div class="aces-table-wrap"><table class="aces-table h2h-grid">
      <thead><tr><th scope="col" class="h2h-corner">Row vs column</th>${teams.map(t => `<th scope="col">${dot(t)}<span>${esc(t)}</span></th>`).join('')}</tr></thead>
      <tbody>${teams.map(r => `<tr><th scope="row">${dot(r)}${esc(r)}</th>${teams.map(c => cell(r, c)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;

  // Summary: games, the most-played pairing and the most one-sided one.
  let total = 0;
  let most = null;
  let lopsided = null;
  teams.forEach((a, i) => teams.slice(i + 1).forEach(b => {
    const h = headToHead(a, b, games);
    const n = h.meetings.length;
    if (!n) return;
    total += n;
    if (!most || n > most.n) most = { n, text: `${a} vs ${b}` };
    const gap = Math.abs(h.a - h.b);
    if (gap && (!lopsided || gap > lopsided.gap)) lopsided = { gap, text: h.a > h.b ? `${a} ${h.a}-${h.b} vs ${b}` : `${b} ${h.b}-${h.a} vs ${a}` };
  }));
  const stat = (v, l) => `<div class="aces-stat"><span class="aces-stat-value">${esc(String(v))}</span><span class="aces-stat-label">${esc(l)}</span></div>`;
  return `<div class="aces-card"><div class="aces-stats">
      ${stat(teams.length, 'Teams')}${stat(total, 'Games')}
      ${most ? stat(most.n, `Most played: ${most.text}`) : ''}
      ${lopsided ? stat(`+${lopsided.gap}`, `Most one-sided: ${lopsided.text}`) : ''}
    </div></div>
    <section class="aces-card is-flush cmp-grid-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('swords')} Every matchup</h2>
        <span class="cmp-legend"><span class="is-ahead">Row leads</span><span class="is-even">Even</span><span class="is-behind">Row trails</span></span></div>
      ${table}
    </section>
    <p class="cmp-note">Each cell is the row team&rsquo;s record against the column team. Tap one for the full matchup.</p>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  const out = $('cmpResults');

  if (state.mode === 'players') {
    if (!['career', ...data.bat.concat(data.pit).map(r => r.seasonId)].includes(state.scope)) state.scope = 'career';
    renderPlayerControls();
    out.innerHTML = renderPlayers();
  } else {
    if (state.scope !== 'all' && !data.seasons.includes(state.scope)) state.scope = 'all';
    out.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
    const games = await gamesInScope(state.scope);
    if (seq !== renderSeq) return;
    const teams = teamsIn(state.scope === 'all' ? games : await gamesInScope('all'));
    if (seq !== renderSeq) return;
    renderTeamControls(teams);
    out.innerHTML = state.mode === 'grid' ? renderGrid(games) : renderTeams(games);
  }
  writeUrl();
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.mode !== 'players') p.set('mode', state.mode);
  if (state.mode !== 'grid') { if (state.a) p.set('a', state.a); if (state.b) p.set('b', state.b); }
  if (state.scope && state.scope !== 'career' && state.scope !== 'all') p.set('scope', state.scope);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

function setMode(mode) {
  if (mode === state.mode) return;
  const wasPlayers = state.mode === 'players';
  state.mode = mode;
  if (wasPlayers || mode === 'players') {
    state.a = mode === 'players' ? defaultPlayer() : '';
    state.b = '';
    state.scope = mode === 'players' ? 'career' : 'all';
  }
  render();
}

function defaultPlayer() {
  const mine = data.players.find(p => (p.ids || [p.id]).some(id => data.me.has(id)));
  return mine ? mine.id : '';
}

function wire() {
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('cmpControls').addEventListener('change', (e) => {
    if (e.target.id === 'pickA') state.a = e.target.value;
    else if (e.target.id === 'pickB') state.b = e.target.value;
    else if (e.target.id === 'pickScope') state.scope = e.target.value;
    else return;
    render();
  });
  $('cmpControls').addEventListener('click', (e) => {
    if (!e.target.closest('[data-swap]')) return;
    [state.a, state.b] = [state.b, state.a];
    render();
  });
}

async function main() {
  const ctx = await initPage({ title: 'Compare' });
  const prof = ctx?.profile;
  data.me = new Set([prof?.id, prof?.playerId, prof?.mergedFromProfile,
    String(prof?.linkedPlayer || '').trim().toLowerCase().replace(/\s+/g, '_')].filter(Boolean));

  const [players, seasons, awards] = await Promise.all([
    getAllPlayerStatsOptimized(),
    getAllSeasons().catch(() => []),
    getAllAwards().catch(() => [])
  ]);
  data.bat = buildBattingRows(players);
  data.pit = buildPitchingRows(players);
  data.players = playerList();
  data.seasons = sortSeasonIds(seasons.map(s => parseStatSeasonId(s.id).id).filter(id => id && parseInt(id, 10) >= TEAMS_FROM));
  data.awards = awards.map(a => {
    const sid = a.seasonId ? parseStatSeasonId(a.seasonId).id : (a.year && a.season ? `${a.year}-${String(a.season).toLowerCase()}` : '');
    return { player: formatPlayerName(a.playerName || a.Player || ''), award: String(a.category || a.Award || '').trim(), seasonId: sid };
  }).filter(a => a.player && a.award);

  const p = new URLSearchParams(location.search);
  const mode = ['players', 'teams', 'grid'].includes(p.get('mode')) ? p.get('mode') : 'players';
  state.mode = mode;
  if (mode === 'players') {
    state.a = data.players.some(x => x.id === p.get('a')) ? p.get('a') : defaultPlayer();
    state.b = data.players.some(x => x.id === p.get('b')) ? p.get('b') : '';
    state.scope = p.get('scope') || 'career';
  } else {
    const team = (v) => OFFICIAL.find(t => t.toLowerCase() === String(v || '').toLowerCase()) || '';
    state.a = team(p.get('a'));
    state.b = team(p.get('b'));
    state.scope = p.get('scope') || 'all';
  }

  wire();
  await render();
  pageReady();
}

main().catch((err) => showPageError(err, { container: '#cmpResults' }));
