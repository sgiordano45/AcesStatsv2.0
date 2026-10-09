// js/pages/weekend-preview.js
// weekend-preview.html: the next seven days of games.
//
//   Weather    the Weather Bear (forecast.json can force "rain" or "sunny"),
//              current conditions and the forecast for each game day
//              (OpenWeatherMap, cached 30 minutes in this browser)
//   Games      by day: both teams with record and place, Peter's line,
//              players to watch, a link to the full preview, and Share
//   Share      one matchup, tonight's games or the week, as an image or text
//              (weekend-share.js)
//
// URL: weekend-preview.html (always the current season, today through 7 days out)

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { getSeasonGames } from '../data/games.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { escapeHtml as esc, ordinal } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { cap, teamDot, teamLogo, teamHref, gameHref, moneyLine, fmtLine, recordText, createWatchList } from '../ui/game-shared.js';
import { normalizeGames, computeStandings, isDecided } from '../domain/standings.js';
import { formatGameDate, formatTime, todayKey, addDays, timeSortValue, parseTimeMinutes, dateFromKey } from '../domain/dates.js';
import { seasonLabel } from '../domain/season-ids.js';
import { shareGames, gamesText, tierOf } from './weekend-share.js';

const $ = (id) => document.getElementById(id);
const lower = (s) => String(s || '').toLowerCase().trim();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const DAYS_AHEAD = 7;
const WEATHER_ZIP = '07092';
const WEATHER_API_KEY = 'c26153644bca587d9db1fc0256a01cf0';
const WEATHER_CACHE = 'weatherCache';
const WEATHER_MAX_AGE = 30 * 60 * 1000;

const W = { seasonId: '', games: [], upcoming: [], standings: [], watch: null, picks: new Map(), weather: null };

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const teamRow = (team) => W.standings.find(r => lower(r.team) === lower(team)) || null;
const recOf = (team) => { const r = teamRow(team); return r && r.games ? recordText(r) : '0-0'; };
const placeOf = (team) => { const r = teamRow(team); return r && r.games ? `${ordinal(r.rank)} place` : ''; };

function upcomingGames() {
  const from = todayKey(), to = addDays(from, DAYS_AHEAD);
  return W.games.filter(g => !isDecided(g) && g.dateKey && g.dateKey >= from && g.dateKey <= to && g.home && g.away && g.home !== 'TBD' && g.away !== 'TBD')
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || timeSortValue(a.time) - timeSortValue(b.time));
}

async function pickPlayers(g) {
  const key = `${g.id || `${g.away}@${g.home}@${g.dateKey}`}`;
  if (!W.picks.has(key)) {
    W.picks.set(key, Promise.all([W.watch(g.away, g.home), W.watch(g.home, g.away)])
      .then(([away, home]) => ({ away, home }))
      .catch(() => ({ away: { players: [] }, home: { players: [] } })));
  }
  return W.picks.get(key);
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

function readCache({ stale = false } = {}) {
  try {
    const v = JSON.parse(localStorage.getItem(WEATHER_CACHE) || 'null');
    if (!v || !v.current || !v.forecast) return null;
    return stale || Date.now() - v.timestamp < WEATHER_MAX_AGE ? v : null;
  } catch { return null; }
}

async function loadWeather() {
  let override = '';
  try {
    const f = await fetch('forecast.json', { cache: 'no-store' });
    if (f.ok) override = String((await f.json())?.[0]?.forecast || '').toLowerCase();
  } catch { /* optional */ }
  const cached = readCache();
  if (cached) return { ...cached, override, stale: false };
  try {
    const base = `https://api.openweathermap.org/data/2.5`;
    const q = `zip=${WEATHER_ZIP},US&appid=${WEATHER_API_KEY}&units=imperial`;
    const [c, f] = await Promise.all([fetch(`${base}/weather?${q}`), fetch(`${base}/forecast?${q}`)]);
    if (!c.ok || !f.ok) throw new Error('weather request failed');
    const v = { current: await c.json(), forecast: await f.json(), timestamp: Date.now() };
    try { localStorage.setItem(WEATHER_CACHE, JSON.stringify(v)); } catch { /* ignore */ }
    return { ...v, override, stale: false };
  } catch (err) {
    console.warn('[weekend] weather unavailable', err);
    const old = readCache({ stale: true });
    return old ? { ...old, override, stale: true } : { override, current: null, forecast: null, stale: false };
  }
}

/** The forecast slot nearest a game day's first game time (3-hour slots, about 5 days out). */
function forecastFor(dateKey, time) {
  const list = W.weather?.forecast?.list || [];
  const day = dateFromKey(dateKey);
  if (!day || !list.length) return null;
  const mins = parseTimeMinutes(time);
  const target = new Date(day);
  target.setHours(Number.isFinite(mins) && mins < 24 * 60 ? Math.floor(mins / 60) : 18, 0, 0, 0);
  let best = null;
  for (const item of list) {
    const d = Math.abs(item.dt * 1000 - target.getTime());
    if (d < 3 * 3600 * 1000 && (!best || d < best.d)) best = { d, item };
  }
  return best?.item || null;
}

const isWet = (s) => /rain|drizzle|thunder|storm/i.test(String(s || ''));

function renderWeather() {
  const w = W.weather;
  const first = W.upcoming[0];
  const firstSlot = first ? forecastFor(first.dateKey, first.time) : null;
  const condition = firstSlot?.weather?.[0]?.main || w?.current?.weather?.[0]?.main || '';
  const rainy = w?.override === 'rain' ? true : w?.override === 'sunny' ? false : isWet(condition);
  const bear = rainy ? 'rainyweather.jpg' : 'sunnyweather.png';
  const cur = w?.current;
  const days = [...new Set(W.upcoming.map(g => g.dateKey))].map(k => {
    const firstGame = W.upcoming.find(g => g.dateKey === k);
    const slot = forecastFor(k, firstGame?.time);
    return slot ? `<li><strong>${esc(formatGameDate(k, 'short'))}</strong><span class="wp-temp">${Math.round(slot.main.temp)}&deg;</span><span>${esc(slot.weather?.[0]?.description || '')}</span>${isWet(slot.weather?.[0]?.main) ? '<span class="aces-badge is-alert">Rain risk</span>' : ''}</li>` : '';
  }).join('');
  $('wpWeather').innerHTML = `<section class="aces-card wp-weather${rainy ? ' is-rain' : ''}">
    <img class="wp-bear" src="${bear}" alt="${rainy ? 'Weather Bear: rain gear' : 'Weather Bear: sunny'}" data-bear>
    <div class="wp-weather-body">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('sun')}Gameday weather</h2><span class="aces-badge is-outline">Mountainside, NJ</span></div>
      ${w?.stale ? '<p class="wp-note">Showing the last forecast we had; conditions may have changed.</p>' : ''}
      ${cur ? `<p class="wp-now"><span class="wp-now-temp">${Math.round(cur.main.temp)}&deg;F</span><span>${esc(cur.weather?.[0]?.description || '')}<br><small>Feels like ${Math.round(cur.main.feels_like)}&deg; &middot; wind ${Math.round(cur.wind?.speed || 0)} mph &middot; humidity ${cur.main.humidity}%</small></span></p>` : '<p class="wp-note">Weather is unavailable right now.</p>'}
      ${days ? `<ul class="wp-days">${days}</ul>` : ''}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

function gameCard(g, i) {
  const line = moneyLine(g.raw?.homeOdds, g.raw?.awayOdds);
  const tier = tierOf(g.type, g.round);
  const side = (team, which) => `<a class="wp-side" href="${esc(teamHref(team))}">
    ${teamLogo(team, { size: 48 }) || teamDot(team, { lg: true })}
    <span class="wp-team">${esc(cap(team))}</span>
    <span class="wp-rec">${esc(recOf(team))}${placeOf(team) ? ` &middot; ${esc(placeOf(team))}` : ''}</span>
    ${line ? `<span class="wp-line${line.favorite === which ? ' is-fav' : ''}">${esc(fmtLine(line[which]))}</span>` : ''}
  </a>`;
  const tag = tier === 'finals' ? `<span class="aces-badge is-accent">${icon('trophy')}${esc(g.round ? cap(g.round) : 'Championship')}</span>`
    : tier === 'playoff' ? `<span class="aces-badge is-accent">${esc(g.round ? cap(g.round) : 'Playoffs')}</span>` : '';
  const k = lower(g.home);
  return `<article class="aces-card wp-game is-${tier}"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} data-game="${i}">
    <div class="wp-game-top"><span class="wp-time">${esc(g.time ? formatTime(g.time) : 'Time TBD')}</span>${tag}${g.raw?.location ? `<span class="wp-where">${icon('map-pin')}${esc(g.raw.location)}</span>` : ''}</div>
    <div class="wp-sides">${side(g.away, 'away')}<span class="wp-at">@</span>${side(g.home, 'home')}</div>
    ${line ? `<div class="wp-odds"><span style="--w:${line.awayPct}%"></span><small>Peter's line: ${esc(cap(line.favorite === 'home' ? g.home : g.away))} about ${Math.max(line.homePct, line.awayPct)}% to win</small></div>` : ''}
    <div class="wp-watch" data-watch="${i}"><span class="aces-skeleton is-row"></span></div>
    <div class="wp-game-foot">
      <a class="aces-btn is-sm is-primary" href="${esc(gameHref(g, W.seasonId))}">Full preview${icon('chevron-right')}</a>
      <button type="button" class="aces-btn is-sm is-ghost" data-share="${i}">${icon('share')}Share</button>
    </div>
  </article>`;
}

function renderGames() {
  const list = W.upcoming;
  const today = todayKey();
  if (!list.length) {
    $('wpGames').innerHTML = `<section class="aces-card"><div class="aces-empty">${icon('calendar')}<p class="aces-empty-title">No games in the next week</p>
      <p>Check the schedule for what's coming up.</p><a class="aces-btn is-primary" href="schedule.html?view=list">Schedule</a></div></section>`;
    return;
  }
  const byDay = new Map();
  list.forEach((g, i) => { if (!byDay.has(g.dateKey)) byDay.set(g.dateKey, []); byDay.get(g.dateKey).push([g, i]); });
  $('wpGames').innerHTML = [...byDay].map(([k, games]) => `<section class="wp-day${k === today ? ' is-today' : ''}">
    <h2>${esc(formatGameDate(k, 'long').replace(/, \d{4}$/, ''))}${k === today ? ' <span class="aces-badge is-brand">Today</span>' : ''}<span class="wp-day-count">${plural(games.length, 'game')}</span></h2>
    <div class="wp-grid">${games.map(([g, i]) => gameCard(g, i)).join('')}</div>
  </section>`).join('');
  list.forEach(async (g, i) => {
    const res = await pickPlayers(g);
    const el = document.querySelector(`[data-watch="${i}"]`);
    if (!el) return;
    const col = (team, r) => `<div><h3>${teamDot(team)}${esc(cap(team))}</h3>${r.players.length
      ? `<ul>${r.players.map(p => `<li><a href="${esc(p.href)}">${esc(p.name)}</a></li>`).join('')}</ul>` : '<p class="wp-note">No picks yet</p>'}</div>`;
    const why = res.away.why === res.home.why ? res.away.why : '';
    el.innerHTML = `<p class="wp-watch-head">Players to watch${why ? ` <small>${esc(why.toLowerCase())}</small>` : ''}</p><div class="wp-watch-cols">${col(g.away, res.away)}${col(g.home, res.home)}</div>`;
  });
}

function renderHead() {
  const list = W.upcoming;
  const keys = [...new Set(list.map(g => g.dateKey))];
  const span = !keys.length ? '' : keys.length === 1 ? formatGameDate(keys[0], 'long').replace(/, \d{4}$/, '')
    : `${formatGameDate(keys[0], 'monthDay')} to ${formatGameDate(keys[keys.length - 1], 'monthDay')}`;
  $('wpMeta').textContent = list.length ? `${plural(list.length, 'game')} \u00b7 ${span} \u00b7 ${seasonLabel(W.seasonId)}` : seasonLabel(W.seasonId);
  const tonight = list.some(g => g.dateKey === todayKey());
  $('wpActions').innerHTML = list.length ? `
    ${tonight ? `<button type="button" class="aces-btn is-sm" data-share-tonight>${icon('share')}Share tonight</button>` : ''}
    <button type="button" class="aces-btn is-sm${tonight ? ' is-ghost' : ''}" data-share-week>${icon('calendar-days')}Share the week</button>` : '';
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

async function shareItem(g) {
  const res = await pickPlayers(g);
  return {
    away: cap(g.away), home: cap(g.home), dateKey: g.dateKey,
    when: [formatGameDate(g.dateKey, 'short'), g.time ? formatTime(g.time) : ''].filter(Boolean).join(', '),
    time: g.time ? formatTime(g.time) : '',
    tier: tierOf(g.type, g.round),
    label: g.type === 'playoff' ? (g.round ? cap(g.round) : 'Playoffs') : 'Regular season',
    awayRec: recOf(g.away), homeRec: recOf(g.home), awayPlace: placeOf(g.away), homePlace: placeOf(g.home),
    awayPlayers: res.away.players.map(p => p.name), homePlayers: res.home.players.map(p => p.name),
    line: moneyLine(g.raw?.homeOdds, g.raw?.awayOdds)
  };
}

/** Same two teams on one day: one block, "6:30 PM & 8:00 PM", Doubleheader. */
function mergeDoubleheaders(items) {
  const out = [];
  const seen = new Map();
  for (const it of items) {
    if (it.day) { out.push(it); continue; }
    const key = `${it.dateKey}|${[it.away, it.home].map(lower).sort().join('|')}`;
    const prev = seen.get(key);
    if (prev) {
      prev.when = [prev.when, it.time].filter(Boolean).join(' & ');
      prev.label = `${prev.label} \u00b7 Doubleheader`;
      continue;
    }
    seen.set(key, it);
    out.push(it);
  }
  return out;
}

async function share(kind, games) {
  const choice = await openModal({
    title: kind === 'one' ? 'Share this matchup' : kind === 'tonight' ? "Share tonight's games" : "Share this week's games",
    html: '<p>Save an image for the group chat, or copy a text summary.</p>',
    actions: [{ label: 'Copy text', value: 'text' }, { label: 'Save image', value: 'image', variant: 'primary' }]
  });
  if (!choice) return;
  const items = await Promise.all(games.map(shareItem));
  let list = items;
  let heading = 'Game Preview', sub = items[0] ? items[0].when : '';
  if (kind === 'tonight') { heading = "Tonight's Games"; sub = formatGameDate(todayKey(), 'long'); list = mergeDoubleheaders(items); }
  if (kind === 'week') {
    heading = 'This Week';
    const keys = [...new Set(games.map(g => g.dateKey))];
    sub = keys.length > 1 ? `${formatGameDate(keys[0], 'monthDay')} to ${formatGameDate(keys[keys.length - 1], 'monthDay')}` : formatGameDate(keys[0], 'long');
    list = [];
    keys.forEach(k => { list.push({ day: formatGameDate(k, 'short') }); list.push(...items.filter(it => it.dateKey === k)); });
    list = mergeDoubleheaders(list);
  }
  if (kind === 'one') {
    const t = items[0].tier;
    heading = t === 'finals' ? 'Championship' : t === 'playoff' ? 'Playoff Preview' : 'Game Preview';
  }
  if (choice === 'text') {
    try { await navigator.clipboard.writeText(gamesText({ heading, sub, items: list })); showToast('Copied. Paste it anywhere.', 'success'); }
    catch { showToast('Could not copy to the clipboard.', 'error'); }
    return;
  }
  try { await shareGames({ heading, sub, items: list, detail: kind === 'one' || list.filter(x => !x.day).length <= 3 }); }
  catch (err) { console.error('[weekend] share image', err); showToast('Could not make the image.', 'error'); }
}

function wire() {
  document.addEventListener('click', (e) => {
    const one = e.target.closest('[data-share]');
    if (one) return share('one', [W.upcoming[Number(one.dataset.share)]]);
    if (e.target.closest('[data-share-tonight]')) return share('tonight', W.upcoming.filter(g => g.dateKey === todayKey()));
    if (e.target.closest('[data-share-week]')) return share('week', W.upcoming);
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-logo]')) e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'wp-logo-gap' }));
    if (e.target.matches?.('[data-bear]')) e.target.remove();
  }, true);
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Weekend Preview' });
  W.seasonId = await getDisplaySeasonId().catch(() => '') || '';
  const [docs, players, weather] = await Promise.all([
    W.seasonId ? getSeasonGames(W.seasonId) : [],
    getAllPlayerStatsOptimized().catch(() => []),
    loadWeather()
  ]);
  W.games = normalizeGames(docs).map((g, i) => ({ ...g, raw: docs[i] }));
  W.standings = computeStandings(W.games, { includeScheduled: true });
  W.upcoming = upcomingGames();
  W.weather = weather;
  const bat = buildBattingRows(players || []).filter(r => r.seasonId === W.seasonId);
  W.watch = createWatchList({ seasonId: W.seasonId, players: players || [], bat, games: W.games });

  renderHead();
  renderWeather();
  renderGames();
  wire();
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
