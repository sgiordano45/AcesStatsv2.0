// js/pages/scouting.js
// scouting-report.html: scouting in two tabs (signed-in members).
//
//   Team      one team's season on a page: a card per rostered player with
//             this season's and career AVG/OBP, BPI, games, and a small spray
//             chart, plus team totals. Prints on one sheet. Captains get a
//             "Scout next opponent" shortcut. (Replaced team-scouting-report.html.)
//   Matchup   one hitter against a team or a pitcher: totals and AVG/OBP next
//             to his career, home/away and regular/playoff splits, and the game
//             log. Full splits stay on player.html?tab=splits.
//
// URL: ?tab=team&season=2026-fall&team=Red
//      ?tab=matchup&player=joe_smith&vs=team:Red | vs=pitcher:mike_jones
//
// Data: aggregatedPlayerStats (season rows, vsOpponent, pitchers), rosters/
// {season}-{team} (numbers, captains), sprayChartData/{legacyId},
// aggregatedPlayerStats2025Splits/{nameId} (2025 vs-opponent totals),
// playerStats/{nameId}/games and pitchingStats/{legacyId}/games (game logs,
// matched on the game doc ID and teamId), the season's games (next opponent).

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getSeasons, getDisplaySeasonId } from '../core/config.js';
import { getCaptainTeams } from '../core/auth.js';
import { db, collection, doc, getDoc, getDocs } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { mountStatTable } from '../ui/table.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, isDecided } from '../domain/standings.js';
import { battingLine } from '../domain/stats.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';
import { todayKey, formatGameDate } from '../domain/dates.js';
import { ZERO_BAT, addBat, batSplitTable, gameLogRows, battingLogConfig, isPlayoffGame } from './player-shared.js';
import { sprayPlot } from './player-spray.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => { const t = String(s || '').replace(/_/g, ' ').trim(); return /[A-Z]/.test(t) ? t : t.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nameId = (name) => String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');
const isUid = (id) => /^[A-Za-z0-9]{28}$/.test(String(id || ''));
const legacyOf = (p) => (isUid(p.id) ? nameId(p.name || p.displayName) : p.id);
const blank = () => ({ ...ZERO_BAT });
const avgText = (v) => fmtAvg(v, { empty: '-' });

const S = {
  ctx: null,
  tab: 'team',
  players: [],          // aggregatedPlayerStats
  rows: [],             // batting rows (all seasons)
  seasons: [],          // seasons with batting rows, newest first
  team: { season: '', team: '' },
  match: { player: '', kind: 'team', vs: '' },
  next: null,           // { team, opp, dateKey } for the signed-in player's team
  spray: new Map(),     // legacyId -> plot | null
  log: null
};

function chip(team) {
  if (!team) return '';
  const name = cap(team);
  const k = name.toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: name }).toString())}"><span class="aces-team-dot"></span>${esc(name)}</a>`;
}

function syncUrl() {
  const u = new URL(location.href);
  ['tab', 'season', 'team', 'player', 'vs'].forEach((k) => u.searchParams.delete(k));
  u.searchParams.set('tab', S.tab);
  if (S.tab === 'team') {
    if (S.team.season) u.searchParams.set('season', S.team.season);
    if (S.team.team) u.searchParams.set('team', S.team.team);
  } else {
    if (S.match.player) u.searchParams.set('player', S.match.player);
    if (S.match.vs) u.searchParams.set('vs', `${S.match.kind}:${S.match.vs}`);
  }
  history.replaceState(null, '', u);
}

// ---------------------------------------------------------------------------
// Next opponent (signed-in player's team)
// ---------------------------------------------------------------------------

async function findNextOpponent() {
  const p = S.ctx?.profile;
  if (!p) return null;
  const mine = getCaptainTeams(p)[0] || p.linkedTeam || p.currentTeam || '';
  const sid = await getDisplaySeasonId().catch(() => null);
  if (!mine || !sid) return null;
  const games = normalizeGames(await getSeasonGames(sid).catch(() => []));
  const today = todayKey();
  const next = games.filter((g) => !isDecided(g) && g.dateKey && g.dateKey >= today && (norm(g.home) === norm(mine) || norm(g.away) === norm(mine)))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];
  if (!next) return null;
  return { team: cap(mine), opp: cap(norm(next.home) === norm(mine) ? next.away : next.home), dateKey: next.dateKey, season: sid };
}

// ---------------------------------------------------------------------------
// Team tab
// ---------------------------------------------------------------------------

function teamsIn(sid) {
  return [...new Set(S.rows.filter((r) => r.seasonId === sid).map((r) => r.team).filter(Boolean))].sort();
}

function teamControls() {
  const teams = teamsIn(S.team.season);
  return `<div class="sc-controls">
    <label class="sc-field"><span class="aces-label">Season</span><span class="aces-select-wrap"><select class="aces-select" data-t="season">
      ${S.seasons.map((id) => `<option value="${esc(id)}"${id === S.team.season ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('')}
    </select></span></label>
    <label class="sc-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" data-t="team">
      <option value="">Pick a team</option>${teams.map((t) => `<option value="${esc(t)}"${norm(t) === norm(S.team.team) ? ' selected' : ''}>${esc(t)}</option>`).join('')}
    </select></span></label>
    ${S.next ? `<button type="button" class="aces-btn is-sm sc-next" data-next>${icon('binoculars')}Scout next opponent: ${esc(S.next.opp)} <small>${esc(formatGameDate(S.next.dateKey, 'short'))}</small></button>` : ''}
    <button type="button" class="aces-btn is-sm is-ghost" data-print${S.team.team ? '' : ' disabled'}>${icon('print')}Print</button>
  </div>`;
}

async function rosterFor(sid, team) {
  try {
    const snap = await getDoc(doc(db, 'rosters', `${sid}-${team.toLowerCase()}`));
    return snap.exists() ? (snap.data().players || []) : [];
  } catch { return []; }
}

function careerLine(ids) {
  const set = new Set(ids);
  const tot = blank();
  S.rows.filter((r) => r.ids.some((i) => set.has(i))).forEach((r) => addBat(tot, r));
  return battingLine(tot);
}

async function renderTeamReport() {
  const out = $('scTeamReport');
  const { season: sid, team } = S.team;
  if (!sid || !team) {
    out.innerHTML = `<div class="aces-empty sc-empty">${icon('binoculars')}<p>Pick a season and a team.</p></div>`;
    return;
  }
  out.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  const roster = await rosterFor(sid, team);
  if (S.team.season !== sid || S.team.team !== team) return;

  const seasonRows = S.rows.filter((r) => r.seasonId === sid && norm(r.team) === norm(team));
  const used = new Set();
  const find = (rp) => {
    const ids = [rp.id, rp.authId].filter(Boolean);
    const hit = seasonRows.find((r) => !used.has(r) && (r.ids.some((i) => ids.includes(i)) || norm(r.name) === norm(rp.name)));
    if (hit) used.add(hit);
    return hit;
  };
  let cards = roster.map((rp) => {
    const r = find(rp);
    const ids = [rp.id, rp.authId, ...(r?.ids || [])].filter(Boolean);
    const p = S.players.find((x) => ids.includes(x.id) || ids.includes(x.userId)) || null;
    return { name: rp.name || r?.name || '', num: rp.number ?? null, captain: !!rp.captain, row: r || null, ids, legacy: rp.id || (p ? legacyOf(p) : nameId(rp.name)) };
  });
  // Players with stats for this team but not on the roster doc (or no roster doc).
  seasonRows.filter((r) => !used.has(r)).forEach((r) => {
    const p = S.players.find((x) => r.ids.includes(x.id)) || null;
    cards.push({ name: r.name, num: null, captain: false, row: r, ids: r.ids, legacy: p ? legacyOf(p) : nameId(r.name), sub: r.sub });
  });
  cards = cards.filter((c) => c.name);
  cards.forEach((c) => { c.season = c.row ? battingLine(c.row) : null; c.career = careerLine(c.ids); });
  cards.sort((a, b) => (a.num != null && b.num != null ? a.num - b.num : a.num != null ? -1 : b.num != null ? 1 : 0)
    || (b.season?.pa || 0) - (a.season?.pa || 0) || a.name.localeCompare(b.name));

  const tot = blank();
  seasonRows.filter((r) => !r.sub).forEach((r) => addBat(tot, r));
  const tl = battingLine(tot);
  const k = team.toLowerCase();
  const stat = (label, v, cls = '') => `<span class="sc-stat ${cls}"><small>${esc(label)}</small><b>${esc(v)}</b></span>`;

  out.innerHTML = `<section class="aces-card sc-report"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>
    <header class="sc-report-head">
      <img class="sc-logo" src="logos/${esc(k)}.png" alt="" data-hide-on-error>
      <div><h2>${esc(team)}</h2><p>${esc(seasonLabel(sid))} scouting report</p></div>
      <div class="sc-report-meta"><b>${cards.length} players</b><span>${esc(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</span></div>
    </header>
    ${cards.length ? `<ul class="sc-cards">${cards.map((c, i) => `<li class="sc-card${c.captain ? ' is-captain' : ''}${c.sub ? ' is-sub' : ''}">
      <div class="sc-card-head">
        <a class="sc-name" href="player.html?${esc(new URLSearchParams(c.ids[0] ? { id: c.ids[0] } : { name: c.name }).toString())}">${esc(c.name)}</a>
        ${c.captain ? '<span class="aces-badge is-accent" title="Captain">C</span>' : ''}${c.sub ? '<span class="aces-badge is-outline">Sub</span>' : ''}
        ${c.num != null ? `<span class="sc-num">#${esc(c.num)}</span>` : ''}
      </div>
      <div class="sc-row"><span class="sc-row-label">Season</span>
        ${c.season && c.season.pa ? `${stat('AVG', avgText(c.season.avg))}${stat('OBP', avgText(c.season.obp))}${stat('G', c.row.games, 'is-sm')}${stat('BPI', c.row.acesBPI == null ? '-' : fmtRate(c.row.acesBPI), 'is-sm')}` : '<span class="sc-none">No at-bats yet</span>'}
      </div>
      <div class="sc-row is-career"><span class="sc-row-label">Career</span>
        ${c.career.pa ? `${stat('AVG', avgText(c.career.avg))}${stat('OBP', avgText(c.career.obp))}${stat('H', c.career.hits, 'is-sm')}${stat('G', c.career.games, 'is-sm')}` : '<span class="sc-none">First season</span>'}
      </div>
      <div class="sc-spray" data-spray="${i}" data-legacy="${esc(c.legacy)}" hidden></div>
    </li>`).join('')}</ul>` : '<p class="aces-empty">No players found for this team and season.</p>'}
    <footer class="sc-totals">Team: <b>${esc(avgText(tl.avg))}</b> AVG &middot; <b>${esc(avgText(tl.obp))}</b> OBP &middot; ${tot.hits} H in ${tot.atBats} AB &middot; ${tot.runs} R &middot; ${tot.walks} BB</footer>
  </section>`;
  loadSprays(out);
}

async function loadSprays(box) {
  const slots = [...box.querySelectorAll('[data-spray]')];
  await Promise.all(slots.map(async (el) => {
    const id = el.dataset.legacy;
    if (!id) return;
    if (!S.spray.has(id)) {
      try {
        const snap = await getDoc(doc(db, 'sprayChartData', id));
        S.spray.set(id, snap.exists() ? sprayPlot(snap.data()) : null);
      } catch { S.spray.set(id, null); }
    }
    const plot = S.spray.get(id);
    if (!plot || !el.isConnected) return;
    el.innerHTML = `<svg viewBox="0 0 300 270" role="img" aria-label="Spray chart: ${plot.total} batted balls, ${plot.hits} hits">${plot.svg}</svg><small>${plot.hits} H / ${plot.total} balls in play</small>`;
    el.hidden = false;
  }));
}

function renderTeamTab() {
  $('scTeam').innerHTML = `${teamControls()}<div id="scTeamReport"></div>`;
  renderTeamReport();
}

// ---------------------------------------------------------------------------
// Matchup tab
// ---------------------------------------------------------------------------

const batters = () => S.players.filter((p) => p.seasons && Object.keys(p.seasons).length && (p.name || p.displayName));
const pitchers = () => S.players.filter((p) => p.pitchingSeasons && Object.keys(p.pitchingSeasons).length && (p.name || p.displayName));
const nameOf = (p) => p.name || p.displayName || p.id;
const byId = (id) => S.players.find((p) => p.id === id || legacyOf(p) === id) || null;

function matchControls() {
  const list = batters().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const pl = byId(S.match.player);
  const teams = [...new Set(S.rows.map((r) => r.team).filter(Boolean))].sort();
  const pits = pitchers().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return `<div class="sc-controls">
    <label class="sc-field is-grow"><span class="aces-label">Hitter</span>
      <input class="aces-input" list="scHitters" data-m="player" value="${esc(pl ? nameOf(pl) : '')}" placeholder="Type a name" autocomplete="off">
      <datalist id="scHitters">${list.map((p) => `<option value="${esc(nameOf(p))}"></option>`).join('')}</datalist></label>
    <div class="sc-field"><span class="aces-label">Against</span><div class="aces-segmented" role="group" aria-label="Against">
      <button type="button" class="aces-segment" data-kind="team" aria-pressed="${S.match.kind === 'team'}">A team</button>
      <button type="button" class="aces-segment" data-kind="pitcher" aria-pressed="${S.match.kind === 'pitcher'}">A pitcher</button>
    </div></div>
    <label class="sc-field"><span class="aces-label">${S.match.kind === 'team' ? 'Team' : 'Pitcher'}</span><span class="aces-select-wrap"><select class="aces-select" data-m="vs">
      <option value="">${S.match.kind === 'team' ? 'Pick a team' : 'Pick a pitcher'}</option>
      ${S.match.kind === 'team'
        ? teams.map((t) => `<option value="${esc(t)}"${norm(t) === norm(S.match.vs) ? ' selected' : ''}>${esc(t)}</option>`).join('')
        : pits.map((p) => `<option value="${esc(legacyOf(p))}"${legacyOf(p) === S.match.vs ? ' selected' : ''}>${esc(nameOf(p))}</option>`).join('')}
    </select></span></label>
  </div>`;
}

async function hitterGames(p) {
  try {
    const snap = await getDocs(collection(db, 'playerStats', nameId(nameOf(p)), 'games'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function pitcherGames(id) {
  try {
    const snap = await getDocs(collection(db, 'pitchingStats', id, 'games'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

/** Career totals vs one team from the season vsOpponent maps (2025 from its splits doc). */
async function vsTeamTotals(p, team) {
  const tot = blank();
  let s25 = null;
  try { const snap = await getDoc(doc(db, 'aggregatedPlayerStats2025Splits', nameId(nameOf(p)))); s25 = snap.exists() ? snap.data() : null; } catch { /* none */ }
  const from25 = new Set();
  Object.entries(s25?.seasons || {}).forEach(([key, s]) => {
    from25.add(parseStatSeasonId(key).id);
    Object.entries(s?.vsOpponent || {}).forEach(([opp, v]) => { if (norm(opp) === norm(team)) addBat(tot, v); });
  });
  Object.entries(p.seasons || {}).forEach(([key, s]) => {
    if (from25.has(parseStatSeasonId(key).id)) return;
    Object.entries(s?.vsOpponent || {}).forEach(([opp, v]) => { if (norm(opp) === norm(team)) addBat(tot, v); });
  });
  return tot;
}

function splitsOf(games) {
  const sp = { home: blank(), away: blank(), regular: blank(), playoff: blank() };
  games.forEach((g) => {
    const one = { games: 1, atBats: g.atBats, hits: g.hits, runs: g.runs, walks: g.walks };
    addBat(g.isHome ? sp.home : sp.away, one);
    addBat(isPlayoffGame(g) ? sp.playoff : sp.regular, one);
  });
  return sp;
}

function compareTile(label, vs, career) {
  const d = vs != null && career != null ? vs - career : null;
  const tone = d == null || Math.abs(d) < 0.005 ? '' : d > 0 ? ' is-up' : ' is-down';
  return `<div class="aces-stat sc-cmp${tone}">
    <span class="aces-stat-value">${esc(avgText(vs))}</span>
    <span class="aces-stat-label">${esc(label)}</span>
    <span class="aces-stat-meta">${career != null ? `Career ${esc(avgText(career))}${d != null && Math.abs(d) >= 0.005 ? ` (${d > 0 ? '+' : '-'}${esc(fmtAvg(Math.abs(d)))})` : ''}` : ''}</span>
  </div>`;
}

async function renderMatchup() {
  const out = $('scMatchReport');
  const p = byId(S.match.player);
  if (!p) { out.innerHTML = `<div class="aces-empty sc-empty">${icon('arrow-left-right')}<p>Pick a hitter, then a team or a pitcher.</p></div>`; return; }
  if (!S.match.vs) { out.innerHTML = `<div class="aces-empty sc-empty">${icon('arrow-left-right')}<p>Now pick ${S.match.kind === 'team' ? 'a team' : 'a pitcher'} for ${esc(nameOf(p))}.</p></div>`; return; }
  out.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  const key = `${S.match.player}|${S.match.kind}|${S.match.vs}`;

  const careerTot = blank();
  S.rows.filter((r) => r.ids.includes(p.id) || r.ids.includes(p.userId)).forEach((r) => addBat(careerTot, r));
  const career = battingLine(careerTot);
  const hg = await hitterGames(p);

  let games = [];
  let totals;
  let title;
  let note;
  if (S.match.kind === 'team') {
    const team = S.match.vs;
    games = hg.filter((g) => norm(g.opponent) === norm(team));
    const fromSeasons = await vsTeamTotals(p, team);
    const fromGames = blank();
    games.forEach((g) => addBat(fromGames, { games: 1, atBats: g.atBats, hits: g.hits, runs: g.runs, walks: g.walks }));
    totals = fromSeasons.games >= fromGames.games ? fromSeasons : fromGames;
    title = `vs ${cap(team)}`;
    note = 'Totals come from game-by-game stats, kept since 2025 (2025 is partial). Older seasons aren\'t split by opponent.';
  } else {
    const pit = byId(S.match.vs);
    const pg = await pitcherGames(S.match.vs);
    const pitched = new Map(pg.map((g) => [g.gameDocId || g.id, g]));
    games = hg.filter((g) => {
      const pgame = pitched.get(g.gameDocId || g.id);
      if (!pgame) return false;
      // Same game, other side: skip games where they were teammates.
      return !(g.teamId && pgame.teamId && norm(g.teamId) === norm(pgame.teamId));
    });
    totals = blank();
    games.forEach((g) => addBat(totals, { games: 1, atBats: g.atBats, hits: g.hits, runs: g.runs, walks: g.walks }));
    title = `vs ${pit ? nameOf(pit) : cap(S.match.vs)}`;
    note = 'Games where this pitcher pitched for the other team. Stats are the hitter\'s whole game, so some at-bats may have come against a reliever.';
  }
  if (`${S.match.player}|${S.match.kind}|${S.match.vs}` !== key) return;

  const line = battingLine(totals);
  const sp = splitsOf(games);
  out.innerHTML = `<section class="aces-card sc-match">
    <header class="sc-match-head">
      <div><span class="sc-kicker">${esc(nameOf(p))}</span><h2>${esc(title)}</h2></div>
      <a class="aces-btn is-sm is-ghost" href="player.html?${esc(new URLSearchParams({ id: p.id, tab: 'splits' }).toString())}">${icon('columns')}All splits</a>
    </header>
    ${totals.games || totals.atBats ? `
      <div class="aces-stats sc-tiles">
        <div class="aces-stat"><span class="aces-stat-value">${totals.games}</span><span class="aces-stat-label">Games</span></div>
        <div class="aces-stat"><span class="aces-stat-value">${totals.hits}-${totals.atBats}</span><span class="aces-stat-label">H-AB</span><span class="aces-stat-meta">${totals.runs} R, ${totals.walks} BB</span></div>
        ${compareTile('AVG', line.atBats ? line.avg : null, career.atBats ? career.avg : null)}
        ${compareTile('OBP', line.pa ? line.obp : null, career.pa ? career.obp : null)}
      </div>
      ${games.length ? `<div class="sc-split-grid">
        <div><h3 class="sc-sub">Home and away</h3>${batSplitTable([{ label: 'Home', s: sp.home }, { label: 'Away', s: sp.away }], { firstLabel: 'Where' })}</div>
        <div><h3 class="sc-sub">Regular season and playoffs</h3>${batSplitTable([{ label: 'Regular', s: sp.regular }, { label: 'Playoffs', s: sp.playoff }], { firstLabel: 'Games' })}</div>
      </div>
      <h3 class="sc-sub">Game log</h3><div id="scLog"></div>` : ''}
      <p class="sc-note">${esc(note)}</p>`
    : `<p class="aces-empty">No games on record ${esc(title)}.</p><p class="sc-note">${esc(note)}</p>`}
  </section>`;
  if (games.length) {
    S.log = mountStatTable($('scLog'), battingLogConfig('mlog'), { useUrl: false, emptyMessage: 'No games.' });
    S.log.setRows(gameLogRows(games));
  }
}

function renderMatchTab() {
  $('scMatch').innerHTML = `${matchControls()}<div id="scMatchReport"></div>`;
  renderMatchup();
}

// ---------------------------------------------------------------------------
// Tabs and wiring
// ---------------------------------------------------------------------------

const TABS = [{ id: 'team', label: 'Team report', icon: 'users' }, { id: 'matchup', label: 'Matchup', icon: 'arrow-left-right' }];
const rendered = new Set();

function show(id) {
  S.tab = TABS.some((t) => t.id === id) ? id : 'team';
  $('scTabs').innerHTML = TABS.map((t) => `<a class="aces-tab" href="?tab=${t.id}" data-goto="${t.id}"${t.id === S.tab ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  $('scTeam').hidden = S.tab !== 'team';
  $('scMatch').hidden = S.tab !== 'matchup';
  if (!rendered.has(S.tab)) { rendered.add(S.tab); (S.tab === 'team' ? renderTeamTab : renderMatchTab)(); }
  syncUrl();
}

function wire() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-goto]');
    if (tab && !e.metaKey && !e.ctrlKey) { e.preventDefault(); show(tab.dataset.goto); return; }
    if (e.target.closest('[data-print]')) { window.print(); return; }
    if (e.target.closest('[data-next]') && S.next) {
      S.team = { season: S.next.season, team: S.next.opp };
      renderTeamTab(); syncUrl(); return;
    }
    const k = e.target.closest('[data-kind]');
    if (k && k.dataset.kind !== S.match.kind) {
      S.match.kind = k.dataset.kind; S.match.vs = '';
      renderMatchTab(); syncUrl();
    }
  });
  $('scTeam').addEventListener('change', (e) => {
    const f = e.target.dataset.t;
    if (f === 'season') { S.team.season = e.target.value; if (!teamsIn(S.team.season).some((t) => norm(t) === norm(S.team.team))) S.team.team = ''; renderTeamTab(); }
    if (f === 'team') { S.team.team = e.target.value; $('scTeam').querySelector('[data-print]').disabled = !S.team.team; renderTeamReport(); }
    syncUrl();
  });
  const pickPlayer = (value) => {
    const p = batters().find((x) => norm(nameOf(x)) === norm(value));
    if (!p || legacyOf(p) === S.match.player) return;
    S.match.player = legacyOf(p);
    renderMatchup(); syncUrl();
  };
  $('scMatch').addEventListener('change', (e) => {
    if (e.target.dataset.m === 'player') pickPlayer(e.target.value);
    if (e.target.dataset.m === 'vs') { S.match.vs = e.target.value; renderMatchup(); syncUrl(); }
  });
  $('scMatch').addEventListener('input', (e) => { if (e.target.dataset.m === 'player') pickPlayer(e.target.value); });
  document.addEventListener('error', (e) => { if (e.target.matches?.('[data-hide-on-error]')) e.target.remove(); }, true);
}

async function main() {
  S.ctx = await initPage({ title: 'Scouting Report', requiresAuth: true });
  try {
    const [players, seasonDocs, next] = await Promise.all([getAllPlayerStatsOptimized(), getSeasons().catch(() => []), findNextOpponent().catch(() => null)]);
    S.players = (players || []).filter((p) => !p.migrated);
    S.rows = buildBattingRows(S.players);
    const known = new Set(seasonDocs.map((s) => s.id));
    S.seasons = [...new Set(S.rows.map((r) => r.seasonId))].filter((id) => !known.size || known.has(id))
      .sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
    S.next = next;
  } catch (err) {
    showPageError(err);
    return;
  }
  const q = new URLSearchParams(location.search);
  const display = await getDisplaySeasonId().catch(() => null);
  const wantSeason = parseStatSeasonId(q.get('season') || '').id;
  S.team.season = S.seasons.includes(wantSeason) ? wantSeason : S.seasons.includes(display) ? display : S.seasons[0] || '';
  S.team.team = teamsIn(S.team.season).find((t) => norm(t) === norm(q.get('team'))) || '';
  S.match.player = q.get('player') || '';
  const vs = q.get('vs') || '';
  if (vs.includes(':')) { const [kind, val] = vs.split(':'); S.match.kind = kind === 'pitcher' ? 'pitcher' : 'team'; S.match.vs = val; }
  wire();
  pageReady();
  show(q.get('tab') === 'matchup' || (q.get('player') && !q.get('team')) ? 'matchup' : 'team');
}

main().catch((err) => { pageReady(); showPageError(err); });
