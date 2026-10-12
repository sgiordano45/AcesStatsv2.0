// js/pages/recap.js
// recap.html: one year in review. The year's totals, then each season (Fall
// first): the champion, final standings, batting and pitching leaders, awards,
// the top rookies, career milestones reached, and the eulogies for the teams
// that went out in the playoffs.
//
// URL: recap.html?year=2025. With no year: siteConfig/navigation/pages/recap
// .year, else this year if it has a season, else the latest year.
// Data: seasons docs, each season's games, champions, aggregatedPlayerStats,
// awards (by season), eulogies (by season, eliminationOrder).

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getSeasons } from '../core/config.js';
import { db, collection, doc, getDoc, getDocs, query, where, orderBy } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { getSeasonAwards } from '../data/awards.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { buildPitchingRows } from '../ui/pitching-stats.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, playerUrl } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames, computeStandings } from '../domain/standings.js';
import { battingLine, era, QUALIFIERS } from '../domain/stats.js';
import { MILESTONES } from '../domain/summary.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => { const t = String(s || '').replace(/_/g, ' ').trim(); return /[A-Z]/.test(t) ? t : t.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const n = (v) => Number(v || 0).toLocaleString('en-US');
const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

// Years whose data is too thin for a recap (the old page left these out too).
const SKIP_YEARS = new Set([2019, 2021]);
// Champions from before the champions collection was complete.
const OLD_CHAMPIONS = { '2023-summer': 'Sofa Kings', '2022-summer': 'Master Batters' };
const GAMES_STEP = 50;   // games-played milestones every 50, as in the Tuesday email
const AWARD_ART = {
  'Team MVP': 'team_mvp.png', 'All Aces': 'all_aces.png', 'Gold Glove': 'gold_glove.png',
  'Team of the Year': 'team_of_the_year.png', 'Rookie of the Year': 'rookie_of_the_year.png',
  'Most Improved Ace': 'most_improved_ace.png', 'Comeback Player of the Year': 'comeback_player.png',
  'Slugger of the Year': 'slugger_of_the_year.png', 'Pitcher of the Year': 'pitcher_of_the_year.png',
  'Captain of the Year': 'captain_of_the_year.png', 'Al Pineda Good Guy Award': 'al_pineda_good_guy_award.png',
  'Iron Man Award': 'iron_man_award.png', 'Sub of the Year': 'sub_of_the_year.png',
  'Andrew Streaman Boner Award': 'andrew_streaman_boner_award.png',
  'Erik Lund Perservenance Award': 'erik_lund_perservenance_award.png',
  'Mr. Streaman Award for Excellence': 'mr_streaman_award_for_excellence.png'
};
const AWARD_ORDER = Object.keys(AWARD_ART);

const S = { seasons: [], years: [], year: 0, champions: {}, bat: [], pit: [], cache: new Map() };

function chip(team) {
  if (!team) return '';
  const name = cap(team);
  const k = name.toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: name }).toString())}"><span class="aces-team-dot"></span>${esc(name)}</a>`;
}

const link = (r) => `<a href="${esc(playerUrl(r))}">${esc(r.name)}</a>`;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadChampions() {
  const snap = await getDocs(collection(db, 'champions')).catch(() => ({ docs: [] }));
  const out = { ...OLD_CHAMPIONS };
  snap.docs.forEach((d) => { const v = d.data(); const sid = parseStatSeasonId(v.seasonId || d.id).id || d.id; if (v.team) out[sid] = v.team; });
  return out;
}

async function eulogies(sid) {
  try {
    const snap = await getDocs(query(collection(db, 'eulogies'), where('seasonId', '==', sid), orderBy('eliminationOrder', 'asc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function defaultYear() {
  try {
    const snap = await getDoc(doc(db, 'siteConfig', 'navigation', 'pages', 'recap'));
    const y = Number(snap.exists() ? snap.data().year : 0);
    if (S.years.includes(y)) return y;
  } catch { /* fall through */ }
  const now = new Date().getFullYear();
  return S.years.includes(now) ? now : S.years[0];
}

async function loadSeason(sid) {
  if (S.cache.has(sid)) return S.cache.get(sid);
  const [raw, awards, eul] = await Promise.all([
    getSeasonGames(sid).catch(() => []),
    getSeasonAwards(sid).catch(() => []),
    eulogies(sid)
  ]);
  const data = { sid, games: normalizeGames(raw), awards, eulogies: eul };
  S.cache.set(sid, data);
  return data;
}

// ---------------------------------------------------------------------------
// Season pieces
// ---------------------------------------------------------------------------

function standingsHtml(rows, champ) {
  if (!rows.length) return '<p class="aces-empty">No standings for this season.</p>';
  return `<div class="aces-table-wrap"><table class="aces-table is-compact rc-table">
    <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">W</th><th scope="col">L</th><th scope="col">T</th><th scope="col">PCT</th><th scope="col">RF</th><th scope="col">RA</th><th scope="col">Diff</th></tr></thead>
    <tbody>${rows.map((r) => `<tr${champ && norm(r.team) === norm(champ) ? ' class="is-champ"' : ''}>
      <td>${r.rank}</td><th scope="row">${chip(r.team)}${champ && norm(r.team) === norm(champ) ? ` <span class="rc-mini-champ" title="Champion">${icon('trophy')}</span>` : ''}</th>
      <td>${r.wins}</td><td>${r.losses}</td><td>${r.ties}</td><td>${esc(fmtAvg(r.winPct))}</td>
      <td>${r.runsFor}</td><td>${r.runsAgainst}</td><td class="${r.runDiff > 0 ? 'is-up' : r.runDiff < 0 ? 'is-down' : ''}">${r.runDiff > 0 ? '+' : ''}${r.runDiff}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function leadersHtml(sid, standings) {
  const teamGames = new Map(standings.map((r) => [norm(r.team), r.games]));
  const bat = S.bat.filter((r) => r.seasonId === sid && !r.sub).map((r) => ({ ...r, line: battingLine(r), tg: teamGames.get(norm(r.team)) || 0 }));
  const pit = S.pit.filter((r) => r.seasonId === sid && !r.sub && r.ip > 0).map((r) => ({ ...r, era: era(r.runsAllowed, r.ip), tg: teamGames.get(norm(r.team)) || 0 }));
  const qualBat = bat.filter((r) => r.line.pa >= r.tg * QUALIFIERS.PA_PER_TEAM_GAME && r.line.pa > 0);
  const qualPit = pit.filter((r) => r.ip >= r.tg * QUALIFIERS.IP_PER_TEAM_GAME);
  const top = (list, val, asc = false) => list.filter((r) => val(r) !== null && val(r) !== undefined)
    .sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)) || a.name.localeCompare(b.name))[0];
  const cards = [
    ['AVG', top(qualBat, (r) => r.line.avg), (r) => fmtAvg(r.line.avg)],
    ['OBP', top(qualBat, (r) => r.line.obp), (r) => fmtAvg(r.line.obp)],
    ['Aces BPI', top(qualBat, (r) => r.acesBPI), (r) => fmtRate(r.acesBPI)],
    ['Hits', top(bat, (r) => r.hits), (r) => r.hits],
    ['Runs', top(bat, (r) => r.runs), (r) => r.runs],
    ['Walks', top(bat, (r) => r.walks), (r) => r.walks],
    ['ERA', top(qualPit, (r) => r.era, true), (r) => fmtRate(r.era)],
    ['Innings', top(pit, (r) => r.ip), (r) => formatIP(r.ip)]
  ].filter(([, r]) => r);
  if (!cards.length) return '';
  return `<div class="rc-block"><h3 class="rc-sub">${icon('star')}Leaders</h3>
    <ul class="rc-leaders">${cards.map(([label, r, fmt]) => `<li>
      <span class="rc-l-label">${esc(label)}</span>
      <span class="rc-l-value">${esc(fmt(r))}</span>
      <span class="rc-l-who">${link(r)}${chip(r.team)}</span>
    </li>`).join('')}</ul>
    <p class="rc-note">AVG, OBP and BPI need ${QUALIFIERS.PA_PER_TEAM_GAME} plate appearances per team game; ERA needs ${QUALIFIERS.IP_PER_TEAM_GAME} innings per team game.</p>
  </div>`;
}

function rookiesHtml(sid) {
  const key = seasonSortKey(sid);
  const first = new Map();   // player id -> earliest season key
  S.bat.forEach((r) => { if (!first.has(r.id) || r.seasonKey < first.get(r.id)) first.set(r.id, r.seasonKey); });
  const rookies = S.bat.filter((r) => r.seasonId === sid && !r.sub && first.get(r.id) === key)
    .sort((a, b) => (b.acesBPI ?? -99) - (a.acesBPI ?? -99) || b.hits - a.hits).slice(0, 5);
  if (!rookies.length) return '';
  return `<div class="rc-block"><h3 class="rc-sub">${icon('sparkles')}Top rookies</h3>
    <ol class="rc-rookies">${rookies.map((r) => { const l = battingLine(r); return `<li>
      <span class="rc-who">${link(r)}${chip(r.team)}</span>
      <span class="rc-line">${r.games} G &middot; ${r.hits} H &middot; ${r.runs} R &middot; ${esc(fmtAvg(l.avg))}</span>
      <b>${r.acesBPI === null ? '-' : esc(fmtRate(r.acesBPI))}<small> BPI</small></b>
    </li>`; }).join('')}</ol>
  </div>`;
}

function milestonesHtml(sid) {
  const key = seasonSortKey(sid);
  const byPlayer = new Map();
  S.bat.forEach((r) => {
    if (r.seasonKey > key) return;
    if (!byPlayer.has(r.id)) byPlayer.set(r.id, { r: null, before: { hits: 0, runs: 0, games: 0 }, now: { hits: 0, runs: 0, games: 0 } });
    const p = byPlayer.get(r.id);
    ['hits', 'runs', 'games'].forEach((k) => { p.now[k] += r[k]; if (r.seasonKey < key) p.before[k] += r[k]; });
    if (r.seasonKey === key && (!p.r || !r.sub)) p.r = r;
  });
  const steps = (k, total) => (k === 'games'
    ? Array.from({ length: Math.floor(total / GAMES_STEP) }, (_, i) => (i + 1) * GAMES_STEP)
    : MILESTONES[k] || []);
  const out = [];
  byPlayer.forEach((p) => {
    if (!p.r) return;
    ['hits', 'runs', 'games'].forEach((k) => {
      steps(k, p.now[k]).filter((m) => p.before[k] < m && p.now[k] >= m)
        .forEach((m) => out.push({ r: p.r, k, m, total: p.now[k] }));
    });
  });
  if (!out.length) return '';
  const label = { hits: 'hits', runs: 'runs', games: 'games played' };
  out.sort((a, b) => b.m - a.m || a.k.localeCompare(b.k) || a.r.name.localeCompare(b.r.name));
  return `<div class="rc-block"><h3 class="rc-sub">${icon('flag')}Career milestones</h3>
    <ul class="rc-miles">${out.map((x) => `<li${x.m >= (x.k === 'runs' ? 150 : 200) ? ' class="is-major"' : ''}>
      <b>${x.m}</b><span>career ${label[x.k]}</span>
      <span class="rc-who">${link(x.r)}</span>
      <small>${n(x.total)} after the season</small>
    </li>`).join('')}</ul>
  </div>`;
}

function awardsHtml(awards) {
  if (!awards.length) return '';
  const rank = (a) => { const i = AWARD_ORDER.indexOf(a); return i === -1 ? 999 : i; };
  const list = awards.map((a) => ({ cat: a.category || a.Award || 'Award', name: a.playerName || a.Player || '', team: a.teamName || a.team || a.Team || '', value: a.value || '' }))
    .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  return `<div class="rc-block"><h3 class="rc-sub">${icon('award')}Awards</h3>
    <ul class="rc-awards">${list.map((a) => `<li>
      ${AWARD_ART[a.cat] ? `<img class="rc-art" src="awards/${esc(AWARD_ART[a.cat])}" alt="" loading="lazy" data-award-img>` : `<span class="rc-art">${icon('award')}</span>`}
      <span class="rc-aw-body"><span class="rc-aw-cat">${esc(a.cat)}</span>
        <span class="rc-who">${a.name ? `<a href="player.html?name=${esc(encodeURIComponent(a.name))}">${esc(a.name)}</a>` : ''}${chip(a.team)}</span>
        ${a.value ? `<small>${esc(a.value)}</small>` : ''}</span>
    </li>`).join('')}</ul>
  </div>`;
}

function eulogyText(text) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`);
  return paras.join('');
}

function eulogiesHtml(list) {
  if (!list.length) return '';
  return `<div class="rc-block rc-eulogies">
    <div class="rc-eu-head">
      <img src="logos/peterseulogy.png" alt="" loading="lazy" data-hide-on-error>
      <div><h3 class="rc-sub">${icon('scroll')}Fallen teams</h3><p class="rc-note">In loving memory of those who didn't make it.</p></div>
    </div>
    ${list.map((e) => `<details class="rc-eulogy${e.isChampion ? ' is-champ' : ''}">
      <summary>${e.isChampion ? icon('trophy') : icon('flag')}<span class="rc-eu-team">${esc(cap(e.teamName))}</span>${e.eliminatedInRound ? `<small>${esc(e.eliminatedInRound)}</small>` : ''}${icon('chevron-down')}</summary>
      <div class="rc-eu-text">${eulogyText(e.text)}</div>
    </details>`).join('')}
  </div>`;
}

function seasonHtml(d) {
  const sid = d.sid;
  const standings = computeStandings(d.games, { extras: false });
  const champ = S.champions[sid] || '';
  const playoff = d.games.filter((g) => g.type === 'playoff' && g.hasScores);
  const games = d.games.filter((g) => g.hasScores);
  const runs = games.reduce((t, g) => t + g.homeScore + g.awayScore, 0);
  const name = parseStatSeasonId(sid).name || '';
  const k = cap(champ).toLowerCase();
  return `<section class="aces-card rc-season" id="s-${esc(sid)}">
    <header class="rc-season-head">
      <h2><a href="season.html?seasonId=${esc(encodeURIComponent(sid))}">${esc(seasonLabel(sid))}</a></h2>
      <span class="rc-season-facts">${plural(standings.length, 'team')} &middot; ${plural(games.length, 'game')} &middot; ${n(runs)} runs${playoff.length ? ` &middot; ${plural(playoff.length, 'playoff game')}` : ''}</span>
    </header>
    ${champ ? `<a class="rc-champ" href="champions.html?seasonId=${esc(encodeURIComponent(sid))}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}>
      ${icon('trophy')}<span><small>${esc(name ? `${cap(name)} champion` : 'Champion')}</small><b>${esc(cap(champ))}</b></span>
      ${(() => { const r = standings.find((x) => norm(x.team) === norm(champ)); return r ? `<span class="rc-champ-rec">${esc(recordText(r))} regular season</span>` : ''; })()}
    </a>` : ''}
    <div class="rc-grid">
      <div class="rc-block"><h3 class="rc-sub">${icon('list')}Final standings</h3>${standingsHtml(standings, champ)}</div>
      ${leadersHtml(sid, standings)}
    </div>
    <div class="rc-grid">
      ${awardsHtml(d.awards)}
      ${rookiesHtml(sid)}
      ${milestonesHtml(sid)}
    </div>
    ${eulogiesHtml(d.eulogies)}
  </section>`;
}

// ---------------------------------------------------------------------------
// Year
// ---------------------------------------------------------------------------

function yearTiles(datas) {
  const games = datas.reduce((t, d) => t + d.games.filter((g) => g.hasScores).length, 0);
  const runs = datas.reduce((t, d) => t + d.games.filter((g) => g.hasScores).reduce((x, g) => x + g.homeScore + g.awayScore, 0), 0);
  const sids = new Set(datas.map((d) => d.sid));
  const players = new Set(S.bat.filter((r) => sids.has(r.seasonId)).map((r) => r.id));
  const keys = datas.map((d) => seasonSortKey(d.sid));
  const minKey = Math.min(...keys);
  const first = new Map();
  S.bat.forEach((r) => { if (!first.has(r.id) || r.seasonKey < first.get(r.id)) first.set(r.id, r.seasonKey); });
  const rookies = [...players].filter((id) => first.get(id) >= minKey).length;
  const hits = S.bat.filter((r) => sids.has(r.seasonId)).reduce((t, r) => t + r.hits, 0);
  return [
    [datas.length, datas.length === 1 ? 'Season' : 'Seasons'],
    [n(games), 'Games'], [n(runs), 'Runs'], [n(hits), 'Hits'], [n(players.size), 'Players'], [n(rookies), 'First-year players']
  ].map(([v, l]) => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(l)}</span></div>`).join('');
}

async function showYear(year, { push = false } = {}) {
  S.year = year;
  document.title = `${year} Year in Review - Mountainside Aces`;
  $('rcTitle').textContent = `${year} Year in Review`;
  $('rcYears').querySelectorAll('[data-year]').forEach((b) => {
    const on = Number(b.dataset.year) === year;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('year', String(year));
    history.replaceState(null, '', u);
  }
  const body = $('rcBody');
  body.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  const sids = S.seasons.filter((id) => parseStatSeasonId(id).year === String(year))
    .sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  let datas;
  try {
    datas = await Promise.all(sids.map(loadSeason));
  } catch (err) {
    console.error('[recap] year', err);
    body.innerHTML = '<p class="aces-empty">This year couldn\'t be loaded. Try again in a moment.</p>';
    return;
  }
  if (S.year !== year) return;
  if (!datas.length) { body.innerHTML = `<p class="aces-empty">No seasons in ${year}.</p>`; return; }
  body.innerHTML = `
    <div class="aces-stats rc-tiles">${yearTiles(datas)}</div>
    ${datas.length > 1 ? `<nav class="rc-jump" aria-label="Seasons">${datas.map((d) => `<a class="aces-chip" href="#s-${esc(d.sid)}">${esc(seasonLabel(d.sid))}</a>`).join('')}</nav>` : ''}
    ${datas.map(seasonHtml).join('')}`;
}

async function main() {
  await initPage({ title: 'Year in Review' });
  try {
    const [seasons, players, champions] = await Promise.all([getSeasons(), getAllPlayerStatsOptimized(), loadChampions()]);
    S.seasons = seasons.map((s) => s.id);
    S.years = [...new Set(S.seasons.map((id) => Number(parseStatSeasonId(id).year)).filter((y) => y && !SKIP_YEARS.has(y)))].sort((a, b) => b - a);
    S.champions = champions;
    S.bat = buildBattingRows(players || []);
    S.pit = buildPitchingRows(players || []);
  } catch (err) {
    showPageError(err);
    return;
  }
  if (!S.years.length) { pageReady(); $('rcBody').innerHTML = '<p class="aces-empty">No seasons yet.</p>'; return; }

  $('rcYears').innerHTML = S.years.map((y) => `<a class="aces-segment" href="?year=${y}" data-year="${y}">${y}</a>`).join('');
  $('rcYears').addEventListener('click', (e) => {
    const a = e.target.closest('[data-year]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    showYear(Number(a.dataset.year), { push: true });
  });
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t.matches?.('[data-hide-on-error]')) t.remove();
    else if (t.matches?.('[data-award-img]')) { const s = document.createElement('span'); s.className = 'rc-art'; s.innerHTML = icon('award'); t.replaceWith(s); }
  }, true);

  const asked = Number(new URLSearchParams(location.search).get('year'));
  const year = S.years.includes(asked) ? asked : await defaultYear();
  pageReady();
  await showYear(year);
}

main().catch((err) => { pageReady(); showPageError(err); });
