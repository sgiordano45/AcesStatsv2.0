// js/pages/season.js
// season.html?seasonId=2026-fall&tab=schedule: one Aces season.
//
//   Overview   champion, standings, leaders (top 3), awards
//   Standings  regular-season table (computeStandings) and the playoffs
//   Schedule   every game by date, team filter, links to recaps
//   Batting    the season's batting table (js/ui/table.js)
//   Pitching   the season's pitching table
//   Awards     the season's awards by category
//
// A season picker and previous/next arrows sit in the header. ?year=2025&season=Fall
// still works; no season at all opens the current (or latest) one.
// Data: seasons/{id}/games, aggregatedPlayerStats, awards (by seasonId),
// champions and runnerUps.

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getSeasons, getDisplaySeasonId } from '../core/config.js';
import { db, collection, getDocs, query, where } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { getSeasonAwards } from '../data/awards.js';
import { applyTeamGames } from '../data/team-games.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { mountStatTable } from '../ui/table.js';
import { teamChipHtml, TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, computeStandings, buildRecords, isDecided } from '../domain/standings.js';
import { formatGameDate, formatTime, todayKey } from '../domain/dates.js';
import { battingAverage, onBasePct, era, QUALIFIERS } from '../domain/stats.js';
import { parseStatSeasonId, seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const EXCLUDED_TEAMS = new Set(['kings']);

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'standings', label: 'Standings', icon: 'list' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  { id: 'batting', label: 'Batting', icon: 'bat' },
  { id: 'pitching', label: 'Pitching', icon: 'softball' },
  { id: 'awards', label: 'Awards', icon: 'award' }
];
const SECTION = { overview: 'snOverview', standings: 'snStandings', schedule: 'snSchedule', batting: 'snBatting', pitching: 'snPitching', awards: 'snAwards' };

const S = {
  id: '', seasons: [], games: [], bat: [], pit: [], awards: [], champion: '', runnerUp: '',
  standings: [], playoff: [], teamFilter: ''
};
const rendered = new Set();

const chip = (team, seasonId = S.id) => teamChipHtml({ team: cap(team), teamKey: String(team || '').toLowerCase(), seasonCount: 1, seasonId });
const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const playerLink = (r) => `<a href="player.html?${esc(r.id ? `id=${encodeURIComponent(r.id)}` : `name=${encodeURIComponent(r.name)}`)}">${esc(r.name)}</a>`;
const card = (title, body, { iconName = '', extra = '', cls = '' } = {}) => `<section class="aces-card sn-card ${cls}">
  <div class="aces-card-head"><h2 class="aces-card-title">${iconName ? icon(iconName) : ''}${esc(title)}</h2>${extra}</div>${body}</section>`;
const empty = (title, message = '', iconName = 'info') => `<div class="aces-empty">${icon(iconName)}<p class="aces-empty-title">${esc(title)}</p>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
const record = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

// ---------------------------------------------------------------------------
// Season ID from the URL
// ---------------------------------------------------------------------------

function seasonFromUrl() {
  const q = new URLSearchParams(location.search);
  let id = q.get('seasonId') || q.get('season_id') || '';
  if (!id && q.get('year') && q.get('season')) id = `${q.get('year')}-${q.get('season').toLowerCase()}`;
  return parseStatSeasonId(id).id;
}

function writeUrl(tab) {
  const q = new URLSearchParams(location.search);
  q.delete('year'); q.delete('season');
  q.set('seasonId', S.id);
  if (tab && tab !== 'overview') q.set('tab', tab); else q.delete('tab');
  history.replaceState({}, '', `${location.pathname}?${q}`);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadTitles(seasonId) {
  const out = { champion: '', runnerUp: '' };
  try {
    const [c, r] = await Promise.all([
      getDocs(query(collection(db, 'champions'), where('seasonId', '==', seasonId))),
      getDocs(query(collection(db, 'runnerUps'), where('seasonId', '==', seasonId))).catch(() => ({ docs: [] }))
    ]);
    const cd = c.docs[0]?.data();
    if (cd) { out.champion = cap(cd.team); out.runnerUp = cap(cd.runnerUp); }
    const rd = r.docs[0]?.data();
    if (!out.runnerUp && rd) out.runnerUp = cap(rd.runnerUp);
  } catch (err) { console.warn('[season] titles unavailable', err); }
  return out;
}

async function load(seasonId) {
  const [players, games, awards, titles] = await Promise.all([
    getAllPlayerStatsOptimized(),
    getSeasonGames(seasonId).catch((err) => { console.warn('[season] games unavailable', err); return []; }),
    getSeasonAwards(seasonId).catch(() => []),
    loadTitles(seasonId)
  ]);
  S.games = normalizeGames(games);
  S.bat = buildBattingRows(players || []).filter(r => r.seasonId === seasonId && !EXCLUDED_TEAMS.has(r.teamKey));
  S.pit = buildPitchingRows(players || []).filter(r => r.seasonId === seasonId && !EXCLUDED_TEAMS.has(r.teamKey));
  S.awards = awards;
  Object.assign(S, titles);
  S.standings = computeStandings(S.games, { includeScheduled: true }).filter(r => r.team && r.team !== 'TBD');
  S.playoff = buildRecords(S.games.filter(g => g.type === 'playoff' && isDecided(g)))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  await Promise.all([applyTeamGames(S.bat, { fallbackToPlayerGames: true }), applyTeamGames(S.pit)]).catch(() => {});
}

// ---------------------------------------------------------------------------
// Header: season picker and summary
// ---------------------------------------------------------------------------

function renderHead() {
  const ids = S.seasons.map(s => s.id);
  const i = ids.indexOf(S.id);
  const newer = i > 0 ? ids[i - 1] : null;
  const older = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  const href = (id) => `season.html?seasonId=${encodeURIComponent(id)}`;
  $('snTitle').textContent = seasonLabel(S.id);
  $('snHead').insertAdjacentHTML('beforeend', `
    <div class="sn-picker">
      ${older ? `<a class="aces-btn is-icon is-ghost" href="${esc(href(older))}" aria-label="${esc(seasonLabel(older))}">${icon('chevron-left')}</a>` : '<span class="sn-pick-gap"></span>'}
      <span class="aces-select-wrap is-inline"><select class="aces-select" id="snPick" aria-label="Season">
        ${ids.map(id => `<option value="${esc(id)}"${id === S.id ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('')}
      </select></span>
      ${newer ? `<a class="aces-btn is-icon is-ghost" href="${esc(href(newer))}" aria-label="${esc(seasonLabel(newer))}">${icon('chevron-right')}</a>` : '<span class="sn-pick-gap"></span>'}
    </div>`);
  $('snPick').addEventListener('change', (e) => { location.href = href(e.target.value); });
  document.title = `${seasonLabel(S.id)} - Mountainside Aces`;
}

function renderBanner() {
  const reg = S.games.filter(g => g.type === 'regular');
  const left = reg.filter(g => !isDecided(g)).length;
  const keys = S.games.map(g => g.dateKey).filter(Boolean).sort();
  const span = keys.length ? `${formatGameDate(keys[0], 'monthDay')} to ${formatGameDate(keys[keys.length - 1], 'monthDay')}` : '';
  let status = '';
  if (S.champion) status = `<span class="sn-champ">${icon('trophy')}<strong>${esc(S.champion)}</strong> won the title${S.runnerUp ? `, over ${esc(S.runnerUp)}` : ''}</span>`;
  else if (reg.length && !left && S.games.some(g => g.type === 'playoff')) status = `<span>${icon('flag')}Playoffs</span>`;
  else if (left) status = `<span>${icon('calendar')}${left} regular-season game${left === 1 ? '' : 's'} left</span>`;
  $('snBanner').innerHTML = status || span ? `<p class="sn-banner">${status}${span ? `<span class="sn-span">${icon('calendar-days')}${esc(span)}</span>` : ''}</p>` : '';
}

function renderStats() {
  const reg = S.games.filter(g => g.type === 'regular' && isDecided(g));
  const po = S.games.filter(g => g.type === 'playoff' && isDecided(g));
  const ab = S.bat.reduce((n, r) => n + r.atBats, 0), h = S.bat.reduce((n, r) => n + r.hits, 0);
  const runs = reg.reduce((n, g) => n + g.homeScore + g.awayScore, 0);
  const players = new Set(S.bat.filter(r => !r.sub).map(r => r.id || r.name));
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  $('snStats').innerHTML = [
    tile(String(S.standings.length), 'Teams'),
    tile(String(players.size), 'Players', 'regular, not subs'),
    tile(String(reg.length + po.length), 'Games played', po.length ? `${reg.length} regular, ${po.length} playoff` : 'regular season'),
    tile(fmtAvg(ab ? h / ab : null), 'League AVG'),
    tile(reg.length ? fmtRate(runs / reg.length / 2, { digits: 1 }) : '-', 'Runs per team', 'per regular game')
  ].join('');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function standingsTable(rows, { compact = false } = {}) {
  if (!rows.length) return empty('No standings yet', 'Standings appear once games have results.', 'list');
  const head = compact
    ? '<th scope="col">#</th><th scope="col">Team</th><th scope="col" class="is-num">W-L-T</th><th scope="col" class="is-num">PCT</th><th scope="col" class="is-num">GB</th>'
    : '<th scope="col">#</th><th scope="col">Team</th><th scope="col" class="is-num">W</th><th scope="col" class="is-num">L</th><th scope="col" class="is-num">T</th><th scope="col" class="is-num">PCT</th><th scope="col" class="is-num">GB</th><th scope="col" class="is-num">RS</th><th scope="col" class="is-num">RA</th><th scope="col" class="is-num">Diff</th><th scope="col" class="is-num">Last 5</th>';
  const body = rows.map(r => {
    const champ = S.champion && S.champion.toLowerCase() === String(r.team).toLowerCase();
    const team = `${chip(r.team)}${champ ? ` <span class="sn-mini-champ" title="Champion">${icon('trophy')}</span>` : ''}`;
    const pct = r.games ? fmtAvg(r.winPct) : '-';
    const gb = r.games ? (r.gamesBack ? String(r.gamesBack) : '-') : '-';
    return compact
      ? `<tr><td>${r.games ? r.rank : '-'}</td><td>${team}</td><td class="is-num">${record(r)}</td><td class="is-num">${pct}</td><td class="is-num">${gb}</td></tr>`
      : `<tr><td>${r.games ? r.rank : '-'}</td><td>${team}</td><td class="is-num">${r.wins}</td><td class="is-num">${r.losses}</td><td class="is-num">${r.ties}</td>
          <td class="is-num"><strong>${pct}</strong></td><td class="is-num">${gb}</td><td class="is-num">${r.runsFor}</td><td class="is-num">${r.runsAgainst}</td>
          <td class="is-num ${r.runDiff > 0 ? 'is-up' : r.runDiff < 0 ? 'is-down' : ''}">${r.runDiff > 0 ? '+' : ''}${r.runDiff}</td><td class="is-num">${esc(r.last5 || '-')}</td></tr>`;
  }).join('');
  return `<div class="aces-table-wrap"><table class="aces-table is-compact sn-standings"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function leaderList(title, rows, value, fmt, { lower = false, note = '' } = {}) {
  const list = rows.filter(r => value(r) !== null && value(r) !== undefined && Number.isFinite(value(r)))
    .sort((a, b) => (lower ? value(a) - value(b) : value(b) - value(a)) || a.name.localeCompare(b.name)).slice(0, 3);
  if (!list.length) return '';
  return `<div class="sn-leader"><h3>${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</h3><ol>${list.map(r => `<li>
    <span class="sn-leader-name">${dot(r.team)}${playerLink(r)}</span><span class="sn-leader-value">${esc(fmt(value(r)))}</span></li>`).join('')}</ol></div>`;
}

const qualifiedBat = (r) => r.teamGames > 0 && r.atBats + r.walks >= QUALIFIERS.PA_PER_TEAM_GAME * r.teamGames;
const qualifiedPit = (r) => r.teamGames > 0 && r.ip >= QUALIFIERS.IP_PER_TEAM_GAME * r.teamGames;

function leadersHtml() {
  const bat = S.bat.filter(r => !r.sub);
  const qb = bat.filter(qualifiedBat);
  const qp = S.pit.filter(qualifiedPit);
  const parts = [
    leaderList('Hits', bat, r => r.hits, String),
    leaderList('Runs', bat, r => r.runs, String),
    leaderList('Walks', bat, r => r.walks, String),
    leaderList('Batting average', qb, r => (r.atBats ? battingAverage(r.hits, r.atBats) : null), v => fmtAvg(v), { note: 'qualified' }),
    leaderList('On-base %', qb, r => (r.atBats + r.walks ? onBasePct(r.hits, r.walks, r.atBats) : null), v => fmtAvg(v), { note: 'qualified' }),
    leaderList('AcesBPI', bat, r => r.acesBPI, v => fmtRate(v, { digits: 1 })),
    leaderList('Innings', S.pit, r => r.ip, v => formatIP(v)),
    leaderList('ERA', qp, r => era(r.runsAllowed, r.ip), v => fmtRate(v), { lower: true, note: 'qualified' })
  ].filter(Boolean);
  return parts.length ? `<div class="sn-leaders">${parts.join('')}</div>` : empty('No stats yet', 'Leaders appear once stats are submitted.', 'chart-bar');
}

function awardsHtml({ compact = false } = {}) {
  if (!S.awards.length) return empty('No awards yet', 'Season awards are added after the season.', 'award');
  const groups = new Map();
  for (const a of S.awards) {
    const k = a.category || a.Award || 'Award';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const order = ['Team MVP', 'All Aces', 'Gold Glove'];
  const sorted = [...groups].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]));
  return `<div class="sn-awards${compact ? ' is-compact' : ''}">${sorted.map(([cat, list]) => `<div class="sn-award">
    <h3>${icon('award')}${esc(cat)}${list.length > 1 ? ` <span>${list.length}</span>` : ''}</h3>
    <ul>${list.map(a => {
      const team = a.teamName || a.team || a.Team || '';
      const name = a.playerName || a.Player || '';
      return `<li>${name ? `<a href="player.html?name=${esc(encodeURIComponent(name))}">${esc(name)}</a>` : ''}${team ? ` ${chip(team)}` : ''}${a.position ? ` <small>${esc(a.position)}</small>` : ''}</li>`;
    }).join('')}</ul></div>`).join('')}</div>`;
}

function renderOverview() {
  $('snOverview').innerHTML = `
    <div class="sn-two">
      ${card('Standings', standingsTable(S.standings, { compact: true }), { iconName: 'list', extra: `<a class="aces-section-link" href="?${esc(tabQuery('standings'))}" data-goto="standings">Full standings</a>` })}
      ${card('Leaders', leadersHtml(), { iconName: 'star', extra: `<a class="aces-section-link" href="?${esc(tabQuery('batting'))}" data-goto="batting">All batting</a>` })}
    </div>
    ${card('Awards', awardsHtml({ compact: true }), { iconName: 'award' })}`;
}

function renderStandings() {
  const po = S.games.filter(g => g.type === 'playoff');
  $('snStandings').innerHTML = `
    ${card('Regular season', standingsTable(S.standings), { iconName: 'list' })}
    ${po.length ? card('Playoffs', `${S.playoff.length ? `<div class="aces-table-wrap"><table class="aces-table is-compact"><thead><tr><th scope="col">Team</th><th scope="col" class="is-num">W</th><th scope="col" class="is-num">L</th><th scope="col" class="is-num">Runs</th></tr></thead>
      <tbody>${S.playoff.map(r => `<tr><td>${chip(r.team)}${S.champion.toLowerCase() === String(r.team).toLowerCase() ? ` <span class="sn-mini-champ">${icon('trophy')}</span>` : ''}</td><td class="is-num">${r.wins}</td><td class="is-num">${r.losses}</td><td class="is-num">${r.runsFor}-${r.runsAgainst}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${gameList(po)}`, { iconName: 'trophy' }) : ''}
    <p class="sn-note">Standings count regular-season games with a result; forfeits count. Ties are broken by head-to-head, then runs allowed.</p>`;
}

function gameRow(g) {
  const done = isDecided(g) && g.hasScores;
  const homeWin = g.result === 'home', awayWin = g.result === 'away';
  const recap = done && g.id ? `game-recap.html?${new URLSearchParams({ gameId: g.id, seasonId: S.id })}` : '';
  const when = g.time ? formatTime(g.time) : '';
  const side = (team, score, win, which) => `<span class="sn-side is-${which}${win ? ' is-win' : ''}">${dot(team)}<span class="sn-team">${esc(cap(team) || 'TBD')}</span>${done ? `<span class="sn-score">${score}</span>` : ''}</span>`;
  const tag = g.type === 'playoff' ? `<span class="aces-badge is-accent">${esc(g.round ? cap(g.round) : 'Playoff')}</span>` : '';
  const status = !done && g.winner ? `<span class="aces-badge is-outline">${esc(g.winner === 'Tie' ? 'Tie' : `${g.winner} won`)}</span>`
    : !done && g.unmatchedWinner ? `<span class="aces-badge is-outline">${esc(g.unmatchedWinner)}</span>` : '';
  const inner = `<span class="sn-when">${esc(when)}</span>${side(g.away, g.awayScore, awayWin, 'away')}<span class="sn-at">@</span>${side(g.home, g.homeScore, homeWin, 'home')}${tag}${status}`;
  return recap ? `<li><a class="sn-game is-done" href="${esc(recap)}">${inner}${icon('chevron-right')}</a></li>` : `<li><div class="sn-game">${inner}</div></li>`;
}

function gameList(games) {
  if (!games.length) return empty('No games', '', 'calendar');
  const byDay = new Map();
  [...games].sort((a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || String(a.time).localeCompare(String(b.time)))
    .forEach(g => { const k = g.dateKey || ''; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(g); });
  const today = todayKey();
  return `<div class="sn-days">${[...byDay].map(([k, list]) => `<div class="sn-day${k === today ? ' is-today' : ''}"${k === today ? ' id="snToday"' : ''}>
    <h3>${esc(k ? formatGameDate(k, 'short') : 'Date to be set')}${k === today ? ' <span class="aces-badge is-brand">Today</span>' : ''}</h3>
    <ul>${list.map(gameRow).join('')}</ul></div>`).join('')}</div>`;
}

function renderSchedule() {
  const teams = [...new Set(S.games.flatMap(g => [g.home, g.away]).filter(t => t && t !== 'TBD'))].sort();
  const draw = () => {
    const t = S.teamFilter;
    const list = t ? S.games.filter(g => g.home === t || g.away === t) : S.games;
    const reg = list.filter(g => g.type !== 'playoff'), po = list.filter(g => g.type === 'playoff');
    const rec = t ? S.standings.find(r => r.team === t) : null;
    $('snSchedBody').innerHTML = `
      ${rec ? `<p class="sn-note">${chip(t)} ${esc(record(rec))} in the regular season${rec.remainingCount ? `, ${rec.remainingCount} left` : ''}.</p>` : ''}
      ${card(`Regular season`, gameList(reg), { iconName: 'calendar', extra: `<span class="aces-badge is-outline">${reg.length} games</span>` })}
      ${po.length ? card('Playoffs', gameList(po), { iconName: 'trophy' }) : ''}`;
  };
  $('snSchedule').innerHTML = `
    <div class="sn-toolbar">
      <span class="aces-select-wrap is-inline"><select class="aces-select" id="snTeam" aria-label="Team">
        <option value="">All teams</option>${teams.map(t => `<option value="${esc(t)}"${t === S.teamFilter ? ' selected' : ''}>${esc(cap(t))}</option>`).join('')}
      </select></span>
      ${S.games.some(g => g.dateKey === todayKey()) ? `<a class="aces-btn is-sm is-ghost" href="#snToday">${icon('calendar')}Today</a>` : ''}
    </div>
    <div id="snSchedBody"></div>`;
  $('snTeam').addEventListener('change', (e) => { S.teamFilter = e.target.value; draw(); });
  draw();
}

function renderBatting() {
  $('snBatting').innerHTML = card('Batting', '<div id="snBatTable"></div>', { iconName: 'bat' });
  mountStatTable($('snBatTable'), battingTableConfig({ id: 'bat', omit: ['season'] }), {
    rows: S.bat, emptyMessage: 'No batting stats for this season yet.',
    exportName: `aces-batting-${S.id}`, exportTitle: `Batting · ${seasonLabel(S.id)}`
  });
}

function renderPitching() {
  $('snPitching').innerHTML = card('Pitching', '<div id="snPitTable"></div>', { iconName: 'softball' });
  mountStatTable($('snPitTable'), pitchingTableConfig({ id: 'pit', omit: ['season'] }), {
    rows: S.pit, emptyMessage: 'No pitching stats for this season.',
    exportName: `aces-pitching-${S.id}`, exportTitle: `Pitching · ${seasonLabel(S.id)}`
  });
}

function renderAwards() {
  $('snAwards').innerHTML = card('Awards', awardsHtml(), { iconName: 'award', extra: '<a class="aces-section-link" href="awards.html">All seasons</a>' });
}

const RENDER = { overview: renderOverview, standings: renderStandings, schedule: renderSchedule, batting: renderBatting, pitching: renderPitching, awards: renderAwards };

function tabQuery(id) {
  const q = new URLSearchParams(location.search);
  q.set('seasonId', S.id);
  if (id === 'overview') q.delete('tab'); else q.set('tab', id);
  return q.toString();
}

function show(id, { push = false } = {}) {
  if (!SECTION[id]) id = 'overview';
  if (push) writeUrl(id);
  $('snTabs').innerHTML = TABS.map(t => `<a class="aces-tab" href="?${esc(tabQuery(t.id))}" data-goto="${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  Object.entries(SECTION).forEach(([tab, sec]) => { $(sec).hidden = tab !== id; });
  if (!rendered.has(id)) { rendered.add(id); RENDER[id](); }
}

function wire() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-goto]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    show(a.dataset.goto, { push: true });
    if (!a.closest('#snTabs')) $('snTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Season' });
  const [seasons, displayId] = await Promise.all([getSeasons(), getDisplaySeasonId().catch(() => null)]);
  S.seasons = seasons.filter(s => seasonSortKey(s.id) > 0);
  S.id = seasonFromUrl() || displayId || S.seasons[0]?.id || '';
  const known = S.seasons.some(s => s.id === S.id);
  if (!S.id) {
    pageReady();
    showPageState({ title: 'No seasons yet', actions: [{ label: 'All seasons', href: siteUrl('seasons.html'), primary: true }] });
    return;
  }
  await load(S.id);
  if (!known && !S.games.length && !S.bat.length && !S.awards.length) {
    pageReady();
    showPageState({ title: 'Season not found', message: `There's no season "${seasonLabel(S.id)}".`, actions: [{ label: 'All seasons', href: siteUrl('seasons.html'), primary: true }] });
    return;
  }
  if (!known) S.seasons = [{ id: S.id }, ...S.seasons].sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  renderHead();
  renderBanner();
  renderStats();
  wire();
  const q = new URLSearchParams(location.search);
  writeUrl(q.get('tab'));
  show(q.get('tab') || 'overview');
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
