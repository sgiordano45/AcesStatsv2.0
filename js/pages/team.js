// js/pages/team.js
// team.html?team=Teal: one team across every season it has played.
//
//   Hero      all-time regular-season record, win %, run differential,
//             playoff record and every title and runner-up finish
//   Seasons   season by season: record, finish, runs, playoffs, result,
//             team AVG and players; then the record against each opponent
//   Stats     batting and pitching tables (js/ui/table.js) with the shared
//             Season / Subs filters, as before (?season=, ?subs=, ?view=pitching)
//   Leaders   the team's all-time leaders (regular rows; subs left out)
//   Photos    the team's folder in teamPhotos, with a viewer
//
// URL: team.html?team=Teal[&tab=stats|leaders|photos][&view=pitching]
// This season's roster and schedule are on current-season-team.html.

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getSeasons } from '../core/config.js';
import { db, collection, getDocs, query, where } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { applyTeamGames } from '../data/team-games.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { mountStatTable } from '../ui/table.js';
import { mountStatFilters, pickDefaultSeason } from '../ui/stat-filters.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, ordinal, playerUrl } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, buildRecords, computeStandings, isDecided, winPct } from '../domain/standings.js';
import { QUALIFIERS, era } from '../domain/stats.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const dot = (team) => {
  const k = String(team || '').toLowerCase();
  return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`;
};
const teamLink = (team) => `<a class="tp-team" href="team.html?${esc(new URLSearchParams({ team }).toString())}">${dot(team)}${esc(team)}</a>`;

const TABS = [
  { id: 'seasons', label: 'Seasons', icon: 'calendar-days' },
  { id: 'stats', label: 'Stats', icon: 'table' },
  { id: 'leaders', label: 'Leaders', icon: 'trophy' },
  { id: 'photos', label: 'Photos', icon: 'images' }
];

const S = {
  team: '', key: '', config: null, ctx: null,
  seasons: [],          // season rows, newest first
  bat: [], pit: [],     // stat rows for this team, every season
  games: new Map(),     // seasonId -> normalized games
  titles: {},           // seasonId -> { champion, runnerUp }
  current: '',          // season being played, if this team is in it
  photos: null, photoAt: 0
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadTitles() {
  const [champs, runners] = await Promise.all([
    getDocs(collection(db, 'champions')),
    getDocs(collection(db, 'runnerUps')).catch(() => ({ docs: [] }))
  ]);
  const out = {};
  champs.docs.forEach((d) => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] = { champion: String(v.team || '').toLowerCase(), runnerUp: String(v.runnerUp || '').toLowerCase() };
  });
  runners.docs.forEach((d) => {
    const v = d.data();
    const sid = v.seasonId || d.id;
    out[sid] ??= { champion: '', runnerUp: '' };
    if (!out[sid].runnerUp) out[sid].runnerUp = String(v.runnerUp || '').toLowerCase();
  });
  return out;
}

async function load() {
  const [players, seasons, titles] = await Promise.all([
    getAllPlayerStatsOptimized(),
    getSeasons(),
    loadTitles().catch((err) => { console.warn('[team] titles unavailable', err); return {}; })
  ]);
  S.titles = titles;
  const results = await Promise.all(seasons.map((s) => getSeasonGames(s.id)
    .then((docs) => [s.id, normalizeGames(docs)])
    .catch((err) => { console.warn(`[team] games for ${s.id} unavailable`, err); return [s.id, []]; })));
  S.games = new Map(results);

  // The team's spelling on the schedule (e.g. "Master Batters").
  for (const games of S.games.values()) {
    const name = games.flatMap((g) => [g.home, g.away]).find((t) => t && t.toLowerCase() === S.key);
    if (name) { S.team = name; break; }
  }
  S.bat = buildBattingRows(players || [], { team: S.team });
  S.pit = buildPitchingRows(players || [], { team: S.team });

  const live = S.config && S.config.phase !== 'offseason' ? S.config.currentSeasonId : '';
  if (live && (S.games.get(live) || []).some((g) => g.home === S.team || g.away === S.team)) S.current = live;

  S.seasons = buildSeasons();
}

/** One row per season the team played (games or stats). */
function buildSeasons() {
  const ids = new Set([...S.bat, ...S.pit].filter((r) => !r.sub).map((r) => r.seasonId));
  for (const [sid, games] of S.games) {
    if (games.some((g) => g.home === S.team || g.away === S.team)) ids.add(sid);
  }
  return [...ids].sort((a, b) => seasonSortKey(b) - seasonSortKey(a)).map((sid) => {
    const games = S.games.get(sid) || [];
    const standings = computeStandings(games, { extras: false }).filter((r) => r.team && r.team !== 'TBD');
    const row = standings.find((r) => r.team === S.team) || null;
    const playoff = buildRecords(games.filter((g) => g.type === 'playoff' && isDecided(g))).find((r) => r.team === S.team) || null;
    const bats = S.bat.filter((r) => r.seasonId === sid);
    const ab = bats.reduce((n, r) => n + r.atBats, 0);
    const h = bats.reduce((n, r) => n + r.hits, 0);
    const t = S.titles[sid] || {};
    const left = games.filter((g) => g.type === 'regular' && !isDecided(g) && (g.home === S.team || g.away === S.team)).length;
    return {
      sid,
      w: row?.wins || 0, l: row?.losses || 0, t: row?.ties || 0,
      gp: row?.games || 0,
      rank: row && row.games ? row.rank : null,
      of: standings.filter((r) => r.games).length,
      rf: row?.runsFor || 0, ra: row?.runsAgainst || 0,
      pw: playoff?.wins || 0, pl: playoff?.losses || 0, pt: playoff?.ties || 0,
      result: t.champion === S.key ? 'champion' : t.runnerUp === S.key ? 'runner-up' : '',
      avg: ab ? h / ab : null, ab, h,
      players: new Set(bats.filter((r) => !r.sub).map((r) => r.id || r.name)).size,
      inProgress: sid === S.current && left > 0
    };
  });
}

function totals() {
  const sum = (k) => S.seasons.reduce((n, s) => n + s[k], 0);
  const all = { wins: sum('w'), losses: sum('l'), ties: sum('t') };
  const titles = S.seasons.filter((s) => s.result === 'champion').map((s) => s.sid);
  const runners = S.seasons.filter((s) => s.result === 'runner-up').map((s) => s.sid);
  const regular = S.bat.filter((r) => !r.sub);
  const ab = S.bat.reduce((n, r) => n + r.atBats, 0);
  const h = S.bat.reduce((n, r) => n + r.hits, 0);
  const oldest = S.seasons[S.seasons.length - 1]?.sid || '';
  return {
    ...all,
    games: all.wins + all.losses + all.ties,
    pct: all.wins + all.losses + all.ties ? winPct(all) : null,
    diff: sum('rf') - sum('ra'),
    pw: sum('pw'), pl: sum('pl'), pt: sum('pt'),
    titles, runners,
    players: new Set(regular.map((r) => r.id || r.name)).size,
    seasons: S.seasons.length,
    since: oldest ? oldest.slice(0, 4) : '',
    avg: ab ? h / ab : null, ab, h,
    best: [...S.seasons].filter((s) => s.gp && !s.inProgress).sort((a, b) => winPct({ wins: b.w, losses: b.l, ties: b.t }) - winPct({ wins: a.w, losses: a.l, ties: a.t }))[0] || null
  };
}

// ---------------------------------------------------------------------------
// Header and hero
// ---------------------------------------------------------------------------

function renderHead(T) {
  $('tpKicker').textContent = T.since ? `Since ${T.since} \u00b7 ${T.seasons} season${T.seasons === 1 ? '' : 's'}` : 'All seasons';
  $('tpTitle').textContent = S.team;
  $('tpLogo').innerHTML = `<img src="logos/${esc(S.key.replace(/\s+/g, '_'))}.png" alt="" data-logo>`;
  const q = new URLSearchParams({ team: S.team }).toString();
  $('tpActions').innerHTML = `${S.current ? `<a class="aces-btn is-sm" href="current-season-team.html?${esc(q)}">${icon('users')}${esc(seasonLabel(S.current))}</a>` : ''}
    <a class="aces-btn is-sm is-ghost" href="teams.html">${icon('list')}All teams</a>`;
  document.title = `${S.team} - All seasons - Mountainside Aces`;
}

function renderHero(T) {
  const color = TEAM_COLORS.has(S.key) ? ` data-team-color="${esc(S.key)}"` : '';
  const fact = (label, value, cls = '') => `<div><dt>${esc(label)}</dt><dd class="${cls}">${value}</dd></div>`;
  const ribbons = [
    ...T.titles.map((sid) => `<span class="tp-ribbon is-gold">${icon('trophy')}${esc(seasonLabel(sid))}</span>`),
    ...T.runners.map((sid) => `<span class="tp-ribbon is-silver">${icon('medal')}${esc(seasonLabel(sid))}</span>`)
  ];
  const playoffs = T.pw + T.pl + T.pt ? recordText({ wins: T.pw, losses: T.pl, ties: T.pt }) : '-';
  $('tpHero').innerHTML = `<section class="aces-card tp-hero"${color}>
    <div class="tp-record">
      <strong>${T.games ? esc(recordText(T)) : '0-0'}</strong>
      <span>${T.games ? `${fmtAvg(T.pct)} all-time, regular season` : 'No games yet'}</span>
    </div>
    <dl class="tp-facts">
      ${fact('Run diff', T.games ? signed(T.diff) : '-', T.diff > 0 ? 'is-up' : T.diff < 0 ? 'is-down' : '')}
      ${fact('Playoffs', esc(playoffs))}
      ${fact('Titles', String(T.titles.length))}
      ${fact('Best season', T.best ? `${esc(recordText({ wins: T.best.w, losses: T.best.l, ties: T.best.t }))} <small>${esc(seasonLabel(T.best.sid))}</small>` : '-')}
    </dl>
    ${ribbons.length ? `<div class="tp-ribbons" aria-label="Titles and runner-up finishes">${ribbons.join('')}</div>` : ''}
  </section>`;

  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  $('tpStats').innerHTML = [
    tile(String(T.seasons), 'Seasons', T.since ? `since ${T.since}` : ''),
    tile(String(T.games), 'Games', 'regular season'),
    tile(String(T.players), 'Players', 'regular, not subs'),
    tile(T.avg !== null ? fmtAvg(T.avg) : '-', 'Team AVG', T.ab ? `${T.h.toLocaleString('en-US')} H` : ''),
    tile(String(T.runners.length), 'Runner-ups')
  ].join('');
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

function renderSeasons() {
  const rows = S.seasons.map((s) => {
    const rec = s.gp ? recordText({ wins: s.w, losses: s.l, ties: s.t }) : '-';
    const pct = s.gp ? fmtAvg(winPct({ wins: s.w, losses: s.l, ties: s.t })) : '-';
    const finish = s.rank ? `${ordinal(s.rank)}<small> of ${s.of}</small>` : '-';
    const diff = s.rf - s.ra;
    const po = s.pw + s.pl + s.pt ? recordText({ wins: s.pw, losses: s.pl, ties: s.pt }) : '';
    const result = s.result === 'champion' ? `<span class="tp-ribbon is-gold">${icon('trophy')}Champion</span>`
      : s.result === 'runner-up' ? `<span class="tp-ribbon is-silver">${icon('medal')}Runner-up</span>`
        : s.inProgress ? '<span class="aces-badge is-outline">In progress</span>' : '';
    const href = s.sid === S.current
      ? `current-season-team.html?${new URLSearchParams({ team: S.team })}`
      : `season.html?${new URLSearchParams({ season: s.sid })}`;
    return `<tr${s.result === 'champion' ? ' class="is-champ"' : ''}>
      <th scope="row"><a href="${esc(href)}">${esc(seasonLabel(s.sid))}</a></th>
      <td>${esc(rec)}</td><td>${pct}</td><td class="tp-finish">${finish}</td>
      <td class="is-opt">${s.gp ? s.rf : '-'}</td><td class="is-opt">${s.gp ? s.ra : '-'}</td>
      <td class="${diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : ''}">${s.gp ? signed(diff) : '-'}</td>
      <td>${esc(po || '-')}</td>
      <td class="is-opt">${s.avg !== null ? fmtAvg(s.avg) : '-'}</td>
      <td class="is-opt">${s.players || '-'}</td>
      <td class="tp-result">${result}</td>
    </tr>`;
  }).join('');

  $('tpSeasons').innerHTML = `<section class="aces-card tp-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('calendar-days')}Season by season</h2></div>
      <div class="aces-table-wrap"><table class="aces-table is-compact is-sticky-first tp-table">
        <thead><tr><th scope="col">Season</th><th scope="col">W-L-T</th><th scope="col">Pct</th><th scope="col">Finish</th>
          <th scope="col" class="is-opt">RF</th><th scope="col" class="is-opt">RA</th><th scope="col">Diff</th><th scope="col">Playoffs</th>
          <th scope="col" class="is-opt">AVG</th><th scope="col" class="is-opt">Players</th><th scope="col"><span class="u-sr-only">Result</span></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="11">No seasons yet.</td></tr>'}</tbody>
      </table></div>
      <p class="tp-note">Record, finish and runs are regular season. Finish is the final standings place (or the current place for a season in progress).</p>
    </section>
    ${rivalsHtml()}`;
}

/** All-time record against each opponent, regular season and playoffs. */
function rivalsHtml() {
  const reg = new Map();
  const po = new Map();
  const add = (map, rec) => {
    for (const [opp, r] of Object.entries(rec?.h2h || {})) {
      const cur = map.get(opp) || { wins: 0, losses: 0, ties: 0 };
      cur.wins += r.wins; cur.losses += r.losses; cur.ties += r.ties;
      map.set(opp, cur);
    }
  };
  for (const games of S.games.values()) {
    const mine = games.filter((g) => isDecided(g) && (g.home === S.team || g.away === S.team));
    add(reg, buildRecords(mine.filter((g) => g.type === 'regular')).find((r) => r.team === S.team));
    add(po, buildRecords(mine.filter((g) => g.type === 'playoff')).find((r) => r.team === S.team));
  }
  const opps = [...new Set([...reg.keys(), ...po.keys()])].filter((t) => t && t !== 'TBD');
  if (!opps.length) return '';
  const rows = opps.map((opp) => {
    const r = reg.get(opp) || { wins: 0, losses: 0, ties: 0 };
    const p = po.get(opp) || { wins: 0, losses: 0, ties: 0 };
    const gp = r.wins + r.losses + r.ties;
    return { opp, r, p, gp, pct: gp ? winPct(r) : -1 };
  }).sort((a, b) => b.gp - a.gp || b.pct - a.pct);
  return `<section class="aces-card tp-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('swords')}Against each team</h2></div>
    <div class="aces-table-wrap"><table class="aces-table is-compact tp-table">
      <thead><tr><th scope="col">Opponent</th><th scope="col">Games</th><th scope="col">W-L-T</th><th scope="col">Pct</th><th scope="col">Playoffs</th></tr></thead>
      <tbody>${rows.map(({ opp, r, p, gp }) => `<tr>
        <th scope="row">${teamLink(opp)}</th><td>${gp}</td><td>${gp ? esc(recordText(r)) : '-'}</td>
        <td class="${gp && winPct(r) > 0.5 ? 'is-up' : gp && winPct(r) < 0.5 ? 'is-down' : ''}">${gp ? fmtAvg(winPct(r)) : '-'}</td>
        <td>${p.wins + p.losses + p.ties ? esc(recordText(p)) : '-'}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Stats (both tables share one Season / Subs filter, as before)
// ---------------------------------------------------------------------------

let view = 'batting';
const tables = {};

function renderStats() {
  $('tpStatsPanel').innerHTML = `<section class="aces-card tp-card tp-stats">
    <div class="tp-filters">
      <label class="tp-filter"><span class="aces-label">Season</span>
        <span class="aces-select-wrap"><select class="aces-select is-sm" id="seasonFilter"><option value="all">All seasons</option></select></span></label>
      <label class="tp-filter"><span class="aces-label">Subs</span>
        <span class="aces-select-wrap"><select class="aces-select is-sm" id="subsFilter">
          <option value="include">Include sub games</option><option value="exclude">Exclude sub games</option><option value="only">Sub games only</option>
        </select></span></label>
      <div class="aces-segmented" role="group" aria-label="Batting or pitching">
        <button type="button" class="aces-segment" data-view="batting" aria-pressed="true">Batting</button>
        <button type="button" class="aces-segment" data-view="pitching" aria-pressed="false">Pitching</button>
      </div>
    </div>
    <div id="tpBatTable"></div>
    <div id="tpPitTable" hidden></div>
  </section>`;

  // The signed-in player's rows get the "you" highlight (View As aware).
  const me = new Set([S.ctx?.profile?.linkedPlayer, S.ctx?.profile?.playerId, S.ctx?.user?.uid].filter(Boolean));
  const rowClass = (r) => (me.size && r.ids.some((id) => me.has(id)) ? 'is-me' : '');
  tables.batting = mountStatTable($('tpBatTable'), battingTableConfig({ id: 'bat', omit: ['team'] }), {
    emptyMessage: 'No batting stats for this selection.',
    exportName: `aces-${S.key}-batting`, exportTitle: `${S.team} batting`, rowClass
  });
  tables.pitching = mountStatTable($('tpPitTable'), pitchingTableConfig({ id: 'pit', omit: ['team'] }), {
    emptyMessage: 'No pitching stats for this selection.',
    exportName: `aces-${S.key}-pitching`, exportTitle: `${S.team} pitching`, rowClass
  });
  const all = [...S.bat.map((r) => ({ ...r, kind: 'bat', ref: r })), ...S.pit.map((r) => ({ ...r, kind: 'pit', ref: r }))];
  const filters = mountStatFilters({
    season: $('seasonFilter'), team: null, subs: $('subsFilter'), rows: all,
    defaultSeason: pickDefaultSeason(all.map((r) => r.seasonId), S.config),
    onChange: (rows) => {
      tables.batting.setRows(rows.filter((r) => r.kind === 'bat').map((r) => r.ref));
      tables.pitching.setRows(rows.filter((r) => r.kind === 'pit').map((r) => r.ref));
    }
  });
  if (view === 'pitching' && !S.pit.length) view = 'batting';
  if (view === 'batting' && !S.bat.length && S.pit.length) view = 'pitching';
  setView(view, false);
  filters.apply();

  // Team games, for the Qualified filter.
  Promise.all([applyTeamGames(S.bat, { fallbackToPlayerGames: true }), applyTeamGames(S.pit)])
    .then(() => { tables.batting.refresh(); tables.pitching.refresh(); })
    .catch((err) => console.warn('[team] team games unavailable; Qualified shows no one', err));
}

function setView(v, push = true) {
  view = v;
  $('tpBatTable').hidden = v !== 'batting';
  $('tpPitTable').hidden = v !== 'pitching';
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (push) {
    const q = new URLSearchParams(location.search);
    if (v === 'pitching') q.set('view', 'pitching'); else q.delete('view');
    history.replaceState(history.state, '', `${location.pathname}?${q}${location.hash}`);
  }
}

// ---------------------------------------------------------------------------
// Leaders: regular (non-sub) rows added up per player
// ---------------------------------------------------------------------------

function renderLeaders() {
  const byPlayer = new Map();
  const get = (r) => {
    const k = r.id || r.name;
    if (!byPlayer.has(k)) byPlayer.set(k, { id: r.id, name: r.name, seasons: new Set(), g: 0, ab: 0, h: 0, r: 0, bb: 0, hr: 0, rbi: 0, pg: 0, ip: 0, ra: 0 });
    return byPlayer.get(k);
  };
  S.bat.filter((r) => !r.sub).forEach((r) => {
    const p = get(r);
    p.seasons.add(r.seasonId);
    p.g += r.games || 0; p.ab += r.atBats || 0; p.h += r.hits || 0; p.r += r.runs || 0; p.bb += r.walks || 0;
    p.hr += r.homeRuns || 0; p.rbi += r.rbi || 0;
  });
  S.pit.filter((r) => !r.sub).forEach((r) => {
    const p = get(r);
    p.seasons.add(r.seasonId);
    p.pg += r.games || 0; p.ip += r.ip || 0; p.ra += r.runsAllowed || 0;
  });
  const list = [...byPlayer.values()];
  const minPA = QUALIFIERS.CAREER_MIN_PA;
  const minIP = QUALIFIERS.CAREER_MIN_IP;
  const box = (title, rows, value, format, note = '') => {
    const top = rows.map((p) => ({ p, v: value(p) })).filter((x) => x.v !== null && x.v > 0)
      .sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name)).slice(0, 5);
    return `<div class="tp-leader"><h3>${esc(title)}${note ? `<small>${esc(note)}</small>` : ''}</h3>
      ${top.length ? `<ol>${top.map(({ p, v }, i) => `<li><span class="tp-lrank">${i + 1}</span>
        <span class="tp-lname"><a href="${esc(playerUrl(p))}">${esc(p.name)}</a></span>
        <span class="tp-lval">${format(v)}</span></li>`).join('')}</ol>` : '<p class="tp-dim">No one yet.</p>'}</div>`;
  };
  const ascBox = (title, rows, value, format, note) => {
    const top = rows.map((p) => ({ p, v: value(p) })).filter((x) => x.v !== null)
      .sort((a, b) => a.v - b.v || a.p.name.localeCompare(b.p.name)).slice(0, 5);
    return `<div class="tp-leader"><h3>${esc(title)}<small>${esc(note)}</small></h3>
      ${top.length ? `<ol>${top.map(({ p, v }, i) => `<li><span class="tp-lrank">${i + 1}</span>
        <span class="tp-lname"><a href="${esc(playerUrl(p))}">${esc(p.name)}</a></span>
        <span class="tp-lval">${format(v)}</span></li>`).join('')}</ol>` : '<p class="tp-dim">No one qualifies yet.</p>'}</div>`;
  };
  const n = (v) => String(Math.round(v));
  const qualified = list.filter((p) => p.ab + p.bb >= minPA);
  const pitchers = list.filter((p) => p.ip >= minIP);
  $('tpLeaders').innerHTML = `<section class="aces-card tp-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('trophy')}${esc(S.team)} all-time leaders</h2></div>
    <div class="tp-leaders">
      ${box('Seasons', list, (p) => p.seasons.size, n)}
      ${box('Games', list, (p) => p.g, n)}
      ${box('Hits', list, (p) => p.h, n)}
      ${box('Runs', list, (p) => p.r, n)}
      ${box('Walks', list, (p) => p.bb, n)}
      ${box('Batting average', qualified, (p) => (p.ab ? p.h / p.ab : null), (v) => fmtAvg(v), `min ${minPA} PA`)}
      ${box('Innings pitched', list, (p) => p.ip, (v) => formatIP(v))}
      ${ascBox('ERA', pitchers, (p) => era(p.ra, p.ip), (v) => fmtRate(v), `min ${minIP} IP`)}
    </div>
    <p class="tp-note">For ${esc(S.team)} only, regular games (sub appearances left out). Home runs and RBI are only kept from 2026 Fall, so they are not listed.</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function renderPhotos() {
  const el = $('tpPhotos');
  el.innerHTML = '<section class="aces-card tp-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span></section>';
  if (!S.photos) {
    try {
      const snap = await getDocs(query(collection(db, 'teamPhotos'), where('folder', '==', S.key.replace(/\s+/g, '_'))));
      S.photos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.url)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch (err) {
      console.error('[team] photos unavailable', err);
      el.innerHTML = `<section class="aces-card tp-card"><div class="aces-empty">${icon('image')}<p>Photos could not load. Try again in a minute.</p></div></section>`;
      return;
    }
  }
  if (!S.photos.length) {
    el.innerHTML = `<section class="aces-card tp-card"><div class="aces-empty">${icon('camera')}<p class="aces-empty-title">No photos yet</p>
      <p>Photos and videos uploaded to the ${esc(S.team)} folder show up here. <a href="media.html#upload">Upload some</a>.</p></div></section>`;
    return;
  }
  el.innerHTML = `<section class="aces-card tp-card">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon('images')}Photos and videos <small class="tp-dim">${S.photos.length}</small></h2>
      <a class="aces-section-link" href="media.html">All media</a></div>
    <ul class="tp-photos">${S.photos.map((p, i) => `<li><button type="button" class="tp-photo${p.type === 'video' ? ' is-video' : ''}" data-photo="${i}" aria-label="${esc(p.name || 'Team photo')}">
      ${p.type === 'video' ? `<video src="${esc(p.url)}" muted playsinline preload="metadata"></video><span class="tp-play">${icon('play')}</span>`
        : `<img src="${esc(p.url)}" alt="" loading="lazy">`}
      ${p.name ? `<span class="tp-photo-cap">${esc(p.name)}</span>` : ''}
    </button></li>`).join('')}</ul>
  </section>`;
}

function openViewer(i) {
  const list = S.photos || [];
  if (!list.length) return;
  S.photoAt = (i + list.length) % list.length;
  const p = list[S.photoAt];
  const v = $('tpViewer');
  v.querySelector('[data-stage]').innerHTML = p.type === 'video'
    ? `<video src="${esc(p.url)}" controls autoplay playsinline></video>`
    : `<img src="${esc(p.url)}" alt="${esc(p.name || '')}">`;
  const when = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  v.querySelector('[data-info]').innerHTML = `<strong>${esc(p.name || '')}</strong>
    <span>${p.uploadedByName ? `${esc(p.uploadedByName)} &middot; ` : ''}${when ? `${esc(when)} &middot; ` : ''}${S.photoAt + 1} of ${list.length}</span>`;
  if (!v.open) v.showModal();
}

function closeViewer() {
  const v = $('tpViewer');
  v.querySelector('[data-stage]').innerHTML = '';   // stops a playing video
  if (v.open) v.close();
}

// ---------------------------------------------------------------------------
// Tabs and events
// ---------------------------------------------------------------------------

const SECTION = { seasons: 'tpSeasons', stats: 'tpStatsPanel', leaders: 'tpLeaders', photos: 'tpPhotos' };
const RENDER = { seasons: renderSeasons, stats: renderStats, leaders: renderLeaders, photos: renderPhotos };
const rendered = new Set();

function tabQuery(id) {
  const q = new URLSearchParams(location.search);
  q.set('team', S.team);
  if (id === 'seasons') q.delete('tab'); else q.set('tab', id);
  return q.toString();
}

function show(id, { push = false } = {}) {
  if (!SECTION[id]) id = 'seasons';
  if (push) history.replaceState({}, '', `${location.pathname}?${tabQuery(id)}`);
  $('tpTabs').innerHTML = TABS.map((t) => `<a class="aces-tab" href="?${esc(tabQuery(t.id))}" data-goto="${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  Object.entries(SECTION).forEach(([tab, sec]) => { $(sec).hidden = tab !== id; });
  if (!rendered.has(id)) { rendered.add(id); RENDER[id](); }
}

function wire() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-goto]');
    if (tab && !e.metaKey && !e.ctrlKey) { e.preventDefault(); show(tab.dataset.goto, { push: true }); return; }
    const v = e.target.closest('[data-view]');
    if (v) { setView(v.dataset.view); return; }
    const ph = e.target.closest('[data-photo]');
    if (ph) { openViewer(Number(ph.dataset.photo)); return; }
    const nav = e.target.closest('[data-viewer]');
    if (nav) {
      const act = nav.dataset.viewer;
      if (act === 'close') closeViewer(); else openViewer(S.photoAt + (act === 'next' ? 1 : -1));
      return;
    }
    if (e.target === $('tpViewer')) closeViewer();
  });
  $('tpViewer').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') openViewer(S.photoAt + 1);
    if (e.key === 'ArrowLeft') openViewer(S.photoAt - 1);
  });
  $('tpViewer').addEventListener('close', () => { $('tpViewer').querySelector('[data-stage]').innerHTML = ''; });
  document.addEventListener('error', (e) => { if (e.target.matches?.('[data-logo]')) e.target.remove(); }, true);
}

// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: 'Team' });
  S.ctx = ctx;
  S.config = ctx?.config || null;
  const q = new URLSearchParams(location.search);
  const teamParam = (q.get('team') || '').trim();
  if (!teamParam) {
    pageReady();
    showPageState({ title: 'Pick a team', message: 'This page needs a team, like ?team=Teal.', actions: [{ label: 'All teams', href: siteUrl('teams.html'), primary: true }] });
    return;
  }
  S.team = cap(teamParam);
  S.key = S.team.toLowerCase();
  if (q.get('view') === 'pitching') view = 'pitching';
  await load();
  if (!S.seasons.length && !S.bat.length && !S.pit.length) {
    pageReady();
    showPageState({ title: 'Team not found', message: `We don't have games or stats for "${S.team}".`, actions: [{ label: 'All teams', href: siteUrl('teams.html'), primary: true }] });
    return;
  }
  const T = totals();
  renderHead(T);
  renderHero(T);
  wire();
  // Old links: team.html?team=X&view=pitching opened the pitching table.
  show(q.get('tab') || (q.get('view') || q.get('season') || q.get('subs') ? 'stats' : 'seasons'));
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
