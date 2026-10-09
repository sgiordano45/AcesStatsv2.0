// js/pages/current-season-team.js
// current-season-team.html?team=Teal: one team's season at a glance.
//
//   Hero      record, place, games back, run differential, last five, games
//             left and the next game (countdown, link to the preview), or the
//             final record and title once the season is over
//   Roster    a flip card per player from rosters/{seasonId}-{team}: photo,
//             number, position, captain; the back has bats/throws and the
//             season line. Players with no stats yet still show.
//   Batting   the team's batting table (js/ui/table.js), subs included
//   Pitching  the team's pitching table
//   Schedule  every game, results with W/L/T, links to recaps and previews
//
// URL: current-season-team.html?team=Teal&tab=batting&season=2026-fall
// The season defaults to the current one (the latest in the offseason).
// All past seasons for a team live on team.html.

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc, collection, getDocs, query, where } from '../core/firebase.js';
import { getAllPlayerStatsOptimized } from '../data/player-stats.js';
import { getSeasonGames } from '../data/games.js';
import { applyTeamGames } from '../data/team-games.js';
import { buildBattingRows, battingTableConfig } from '../ui/batting-stats.js';
import { buildPitchingRows, pitchingTableConfig } from '../ui/pitching-stats.js';
import { mountStatTable } from '../ui/table.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatIP, ordinal } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { getCalendarUrl } from '../../calendar-subscription.js';
import { normalizeGames, computeStandings, isDecided } from '../domain/standings.js';
import { formatGameDate, formatTime, todayKey, daysBetween, timeSortValue } from '../domain/dates.js';
import { parseStatSeasonId, seasonLabel } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TABS = [
  { id: 'roster', label: 'Roster', icon: 'users' },
  { id: 'batting', label: 'Batting', icon: 'bat' },
  { id: 'pitching', label: 'Pitching', icon: 'softball' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar' }
];

const S = {
  team: '', key: '', seasonId: '', games: [], mine: [], row: null, standings: [],
  bat: [], pit: [], roster: [], champion: '', runnerUp: ''
};
const rendered = new Set();

const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const opponentOf = (g) => (g.home === S.team ? g.away : g.home);
const done = (g) => isDecided(g) && g.hasScores;
const record = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
const empty = (title, message = '', iconName = 'info') => `<div class="aces-empty">${icon(iconName)}<p class="aces-empty-title">${esc(title)}</p>${message ? `<p>${esc(message)}</p>` : ''}</div>`;

/** 'W' | 'L' | 'T' for this team in a game with a result, else ''. */
function resultFor(g) {
  if (!isDecided(g) || !g.result) return '';
  if (g.result === 'tie') return 'T';
  return (g.result === 'home') === (g.home === S.team) ? 'W' : 'L';
}

function gameHref(g) {
  if (done(g) && g.id) return `game-recap.html?${new URLSearchParams({ gameId: g.id, seasonId: S.seasonId })}`;
  if (g.type === 'playoff' && g.id) return `game-preview.html?${new URLSearchParams({ gameId: g.id })}`;
  const q = new URLSearchParams({ home: g.home, away: g.away });
  if (g.dateKey) q.set('date', g.dateKey);
  return `game-preview.html?${q}`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadRoster() {
  try {
    const snap = await getDoc(doc(db, 'rosters', `${S.seasonId}-${S.key}`));
    return snap.exists() ? (snap.data().players || []) : [];
  } catch (err) {
    console.warn('[team] roster unavailable', err);
    return [];
  }
}

async function loadTitles() {
  try {
    const [c, r] = await Promise.all([
      getDocs(query(collection(db, 'champions'), where('seasonId', '==', S.seasonId))),
      getDocs(query(collection(db, 'runnerUps'), where('seasonId', '==', S.seasonId))).catch(() => ({ docs: [] }))
    ]);
    const cd = c.docs[0]?.data();
    return {
      champion: String(cd?.team || '').toLowerCase(),
      runnerUp: String(cd?.runnerUp || r.docs[0]?.data()?.runnerUp || '').toLowerCase()
    };
  } catch (err) {
    console.warn('[team] titles unavailable', err);
    return { champion: '', runnerUp: '' };
  }
}

/** Photos from the linked user accounts; a player without one gets initials. */
async function loadPhotos(list) {
  await Promise.all(list.filter(p => p.authId).map(async (p) => {
    try {
      const snap = await getDoc(doc(db, 'users', p.authId));
      const u = snap.exists() ? snap.data() : null;
      p.photo = u?.playerPhotoURL || u?.profilePhotoURL || '';
    } catch { /* photos are optional */ }
  }));
}

/** Roster entries joined to this season's batting and pitching rows. */
function buildRoster(rosterDocs) {
  const findRow = (rows, p) => rows.find(r => r.ids.some(id => id === p.authId || id === p.id)) || rows.find(r => norm(r.name) === norm(p.name));
  const seen = new Set();
  const list = rosterDocs.filter(p => p && p.name).map(p => {
    const bat = findRow(S.bat.filter(r => !r.sub), p) || null;
    const pit = findRow(S.pit, p) || null;
    if (bat) seen.add(bat);
    return {
      name: p.name, authId: p.authId || '', id: p.id || '', number: p.number || '', position: p.position || '',
      bats: p.bats || '', throws: p.throws || '', captain: !!p.captain, bat, pit, photo: ''
    };
  });
  // No roster doc: fall back to whoever has regular stats for the team.
  if (!list.length) {
    S.bat.filter(r => !r.sub && !seen.has(r)).forEach(r => list.push({
      name: r.name, authId: '', id: r.id, number: '', position: '', bats: '', throws: '', captain: false,
      bat: r, pit: S.pit.find(x => x.id === r.id) || null, photo: ''
    }));
  }
  return list.sort((a, b) => (b.captain - a.captain) || a.name.localeCompare(b.name));
}

async function load() {
  const [players, docs, rosterDocs, titles] = await Promise.all([
    getAllPlayerStatsOptimized(),
    getSeasonGames(S.seasonId).catch((err) => { console.warn('[team] games unavailable', err); return []; }),
    loadRoster(),
    loadTitles()
  ]);
  S.games = normalizeGames(docs);
  // Match the team's spelling on the schedule (e.g. "Master Batters").
  S.team = [...new Set(S.games.flatMap(g => [g.home, g.away]))].find(t => t && t.toLowerCase() === S.key) || S.team;
  S.mine = S.games.filter(g => g.home === S.team || g.away === S.team)
    .sort((a, b) => (a.dateKey || '9').localeCompare(b.dateKey || '9') || timeSortValue(a.time) - timeSortValue(b.time));
  S.standings = computeStandings(S.games, { includeScheduled: true }).filter(r => r.team && r.team !== 'TBD');
  S.row = S.standings.find(r => r.team === S.team) || null;
  S.bat = buildBattingRows(players || [], { team: S.team }).filter(r => r.seasonId === S.seasonId);
  S.pit = buildPitchingRows(players || [], { team: S.team }).filter(r => r.seasonId === S.seasonId);
  Object.assign(S, titles);
  await Promise.all([applyTeamGames(S.bat, { fallbackToPlayerGames: true }), applyTeamGames(S.pit)]).catch(() => {});
  S.roster = buildRoster(rosterDocs);
  await loadPhotos(S.roster);
}

// ---------------------------------------------------------------------------
// Header and hero
// ---------------------------------------------------------------------------

function renderHead() {
  $('ctKicker').textContent = seasonLabel(S.seasonId);
  $('ctTitle').textContent = S.team;
  $('ctLogo').innerHTML = `<img src="logos/${esc(S.key.replace(/\s+/g, '_'))}.png" alt="" data-logo>`;
  $('ctActions').innerHTML = `
    <button type="button" class="aces-btn is-sm" data-calendar>${icon('calendar')}Add to calendar</button>
    <a class="aces-btn is-sm is-ghost" href="team.html?${esc(new URLSearchParams({ team: S.team }).toString())}">${icon('scroll')}All seasons</a>`;
  document.title = `${S.team} - ${seasonLabel(S.seasonId)} - Mountainside Aces`;
}

function formDots() {
  const recent = [...(S.row?.history || [])].sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0)).slice(0, 5).reverse();
  if (!recent.length) return '-';
  return `<span class="ct-form" aria-label="Last ${recent.length}: ${recent.map(r => r.result).join(' ')}">${recent.map(r => `<i class="is-${r.result.toLowerCase()}">${r.result}</i>`).join('')}</span>`;
}

function nextGameHtml() {
  const today = todayKey();
  const next = S.mine.find(g => !isDecided(g) && (!g.dateKey || g.dateKey >= today));
  if (next) {
    const days = next.dateKey ? daysBetween(today, next.dateKey) : null;
    const opp = opponentOf(next);
    const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === null ? 'Date to be set' : `In ${days} days`;
    return `<a class="ct-next${days === 0 ? ' is-today' : ''}" href="${esc(gameHref(next))}">
      <span class="ct-next-label">${icon(days === 0 ? 'flame' : 'calendar')}Next game</span>
      <span class="ct-next-when">${esc(when)}</span>
      <span class="ct-next-match">${next.home === S.team ? 'vs' : 'at'} ${dot(opp)}<strong>${esc(cap(opp) || 'TBD')}</strong></span>
      <span class="ct-next-meta">${esc([next.dateKey ? formatGameDate(next.dateKey, 'short') : '', next.time ? formatTime(next.time) : '', next.type === 'playoff' ? (next.round ? cap(next.round) : 'Playoff') : ''].filter(Boolean).join(' \u00b7 '))}</span>
      <span class="ct-next-go">Preview${icon('chevron-right')}</span>
    </a>`;
  }
  const champ = S.champion === S.key, runner = S.runnerUp === S.key;
  const played = S.mine.filter(isDecided).length;
  if (!played) return '';
  return `<div class="ct-next is-final">
    <span class="ct-next-label">${icon(champ ? 'trophy' : 'flag')}Season complete</span>
    <span class="ct-next-when">${champ ? 'Champions' : runner ? 'Runner-up' : 'Final'}</span>
    <span class="ct-next-meta">${esc(plural(played, 'game'))} played${S.champion && !champ ? ` \u00b7 ${esc(cap(S.champion))} won the title` : ''}</span>
  </div>`;
}

function renderHero() {
  const r = S.row;
  const has = r && r.games;
  const ab = S.bat.reduce((n, x) => n + x.atBats, 0), h = S.bat.reduce((n, x) => n + x.hits, 0), bb = S.bat.reduce((n, x) => n + x.walks, 0);
  const fact = (label, value, cls = '') => `<div><dt>${esc(label)}</dt><dd class="${cls}">${value}</dd></div>`;
  const ribbon = S.champion === S.key ? `<span class="ct-ribbon is-gold">${icon('trophy')}Champion</span>`
    : S.runnerUp === S.key ? `<span class="ct-ribbon is-silver">${icon('medal')}Runner-up</span>` : '';
  const color = TEAM_COLORS.has(S.key) ? ` data-team-color="${esc(S.key)}"` : '';
  $('ctHero').innerHTML = `<section class="aces-card ct-hero"${color}>
    <div class="ct-hero-main">
      <div class="ct-record">
        <strong>${has ? esc(record(r)) : '0-0'}</strong>
        <span>${has ? `${esc(ordinal(r.rank))} of ${S.standings.length}` : 'No games yet'}${has ? ` \u00b7 ${fmtAvg(r.winPct)}` : ''}</span>
        ${ribbon}
      </div>
      <dl class="ct-facts">
        ${fact('GB', has ? (r.gamesBack ? esc(String(r.gamesBack)) : '-') : '-')}
        ${fact('Run diff', has ? `${r.runDiff > 0 ? '+' : ''}${r.runDiff}` : '-', has ? (r.runDiff > 0 ? 'is-up' : r.runDiff < 0 ? 'is-down' : '') : '')}
        ${fact('Last 5', formDots())}
        ${fact('Left', String(r?.remainingCount ?? S.mine.filter(g => !isDecided(g)).length))}
      </dl>
    </div>
    ${nextGameHtml()}
  </section>`;
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;
  const totalRuns = has ? r.runsFor : 0;
  $('ctStats').innerHTML = [
    tile(ab ? fmtAvg(h / ab) : '-', 'Team AVG', ab ? `${h} H / ${ab} AB` : 'no stats yet'),
    tile(ab + bb ? fmtAvg((h + bb) / (ab + bb)) : '-', 'Team OBP'),
    tile(has ? fmtRate(totalRuns / r.games, { digits: 1 }) : '-', 'Runs per game', has ? `${totalRuns} scored` : ''),
    tile(has ? fmtRate(r.runsAgainst / r.games, { digits: 1 }) : '-', 'Allowed per game', has ? `${r.runsAgainst} allowed` : ''),
    tile(String(S.roster.length), 'Roster', S.bat.some(x => x.sub) ? plural(new Set(S.bat.filter(x => x.sub).map(x => x.name)).size, 'sub') + ' used' : '')
  ].join('');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const profileHref = (p) => (p.authId ? `player.html?id=${encodeURIComponent(p.authId)}`
  : p.bat?.id ? `player.html?id=${encodeURIComponent(p.bat.id)}` : `player.html?name=${encodeURIComponent(p.name)}`);

function cardHtml(p, i) {
  const b = p.bat;
  const initials = p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avg = b && b.atBats ? fmtAvg(b.hits / b.atBats) : '-';
  const obp = b && b.atBats + b.walks ? fmtAvg((b.hits + b.walks) / (b.atBats + b.walks)) : '-';
  const stat = (v, l) => `<div><b>${esc(String(v))}</b><span>${l}</span></div>`;
  const vit = (l, v) => (v ? `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>` : '');
  const color = TEAM_COLORS.has(S.key) ? ` data-team-color="${esc(S.key)}"` : '';
  return `<li class="ct-card" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(`${p.name}, show season stats`)}" data-card="${i}"${color}>
    <div class="ct-card-inner">
      <div class="ct-face is-front">
        <div class="ct-photo">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" data-photo>` : ''}<span class="ct-initials"${p.photo ? ' hidden' : ''}>${esc(initials)}</span>
          ${p.number ? `<span class="ct-num">${esc(p.number)}</span>` : ''}
          ${p.captain ? `<span class="ct-cap" title="Captain">${icon('star-filled')}C</span>` : ''}</div>
        <div class="ct-card-name"><strong>${esc(p.name)}</strong><span>${esc(p.position || (b ? '' : 'No games yet'))}</span></div>
        <div class="ct-card-stats">${b ? `${stat(b.games, 'G')}${stat(avg, 'AVG')}${stat(b.hits, 'H')}${stat(b.runs, 'R')}` : '<p>No stats yet</p>'}</div>
      </div>
      <div class="ct-face is-back">
        <div class="ct-back-head"><strong>${esc(p.name)}</strong>${p.number ? `<span>#${esc(p.number)}</span>` : ''}</div>
        <dl class="ct-vitals">${vit('Pos', p.position)}${vit('Bats', p.bats)}${vit('Throws', p.throws)}${p.captain ? vit('Role', 'Captain') : ''}</dl>
        ${b ? `<table class="ct-line"><thead><tr><th>G</th><th>AB</th><th>H</th><th>R</th><th>BB</th><th>RBI</th></tr></thead>
          <tbody><tr><td>${b.games}</td><td>${b.atBats}</td><td>${b.hits}</td><td>${b.runs}</td><td>${b.walks}</td><td>${b.hasHitTypes ? b.rbi : '-'}</td></tr></tbody></table>
          <p class="ct-slash"><span>${avg}<small>AVG</small></span><span>${obp}<small>OBP</small></span><span>${b.acesBPI !== null && b.acesBPI !== undefined ? fmtRate(b.acesBPI, { digits: 1 }) : '-'}<small>BPI</small></span></p>`
          : '<p class="ct-none">No games yet this season.</p>'}
        ${p.pit && p.pit.ip ? `<p class="ct-pit">${icon('softball')}Pitching: ${esc(formatIP(p.pit.ip))} IP, ${p.pit.runsAllowed} R</p>` : ''}
        <a class="ct-profile" href="${esc(profileHref(p))}">Full profile${icon('chevron-right')}</a>
      </div>
    </div>
  </li>`;
}

function renderRoster() {
  const subs = [...new Set(S.bat.filter(r => r.sub).map(r => r.name))].sort();
  $('ctRoster').innerHTML = S.roster.length
    ? `<ul class="ct-cards">${S.roster.map(cardHtml).join('')}</ul>
       <p class="ct-note">Tap a card for the season line.${subs.length ? ` Subs this season: ${esc(subs.join(', '))}.` : ''}</p>`
    : `<div class="aces-card">${empty('No roster yet', 'The roster shows up once captains set it.', 'users')}</div>`;
}

function renderBatting() {
  $('ctBatting').innerHTML = '<section class="aces-card ct-table"><div id="ctBatTable"></div></section>';
  mountStatTable($('ctBatTable'), battingTableConfig({ id: 'bat', omit: ['team', 'season'] }), {
    rows: S.bat, emptyMessage: 'No batting stats for this team yet.',
    exportName: `aces-${S.key}-batting-${S.seasonId}`, exportTitle: `${S.team} batting \u00b7 ${seasonLabel(S.seasonId)}`
  });
}

function renderPitching() {
  $('ctPitching').innerHTML = '<section class="aces-card ct-table"><div id="ctPitTable"></div></section>';
  mountStatTable($('ctPitTable'), pitchingTableConfig({ id: 'pit', omit: ['team', 'season'] }), {
    rows: S.pit, emptyMessage: 'No pitching stats for this team yet.',
    exportName: `aces-${S.key}-pitching-${S.seasonId}`, exportTitle: `${S.team} pitching \u00b7 ${seasonLabel(S.seasonId)}`
  });
}

function gameRow(g, nextId) {
  const r = resultFor(g);
  const opp = opponentOf(g);
  const mine = g.home === S.team ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
  const res = r ? `<span class="ct-result is-${r.toLowerCase()}"><b>${r}</b>${g.hasScores ? `${mine[0]}-${mine[1]}` : ''}</span>`
    : `<span class="ct-time">${esc(g.time ? formatTime(g.time) : '')}</span>`;
  const tag = g.type === 'playoff' ? `<span class="aces-badge is-accent">${esc(g.round ? cap(g.round) : 'Playoff')}</span>` : '';
  const next = g === nextId ? '<span class="aces-badge is-brand">Next</span>' : '';
  return `<li><a class="ct-game${r ? ' is-done' : ''}${g === nextId ? ' is-next' : ''}" href="${esc(gameHref(g))}">
    <span class="ct-date"><b>${esc(g.dateKey ? formatGameDate(g.dateKey, 'monthDay') : 'TBD')}</b><small>${esc(g.dateKey ? formatGameDate(g.dateKey, 'weekday') : '')}</small></span>
    <span class="ct-opp"><span class="ct-ha">${g.home === S.team ? 'vs' : 'at'}</span>${dot(opp)}<span>${esc(cap(opp) || 'TBD')}</span></span>
    <span class="ct-tags">${tag}${next}</span>
    ${res}${icon('chevron-right')}</a></li>`;
}

function renderSchedule() {
  if (!S.mine.length) {
    $('ctSchedule').innerHTML = `<div class="aces-card">${empty('No games scheduled yet', '', 'calendar')}</div>`;
    return;
  }
  const today = todayKey();
  const next = S.mine.find(g => !isDecided(g) && (!g.dateKey || g.dateKey >= today));
  const reg = S.mine.filter(g => g.type !== 'playoff'), po = S.mine.filter(g => g.type === 'playoff');
  const block = (title, list, iconName) => `<section class="aces-card ct-sched">
    <div class="aces-card-head"><h2 class="aces-card-title">${icon(iconName)}${esc(title)}</h2><span class="aces-badge is-outline">${plural(list.length, 'game')}</span></div>
    <ul class="ct-games">${list.map(g => gameRow(g, next)).join('')}</ul></section>`;
  $('ctSchedule').innerHTML = `${block('Regular season', reg, 'calendar')}${po.length ? block('Playoffs', po, 'trophy') : ''}`;
}

const SECTION = { roster: 'ctRoster', batting: 'ctBatting', pitching: 'ctPitching', schedule: 'ctSchedule' };
const RENDER = { roster: renderRoster, batting: renderBatting, pitching: renderPitching, schedule: renderSchedule };

function tabQuery(id) {
  const q = new URLSearchParams(location.search);
  q.set('team', S.team);
  if (id === 'roster') q.delete('tab'); else q.set('tab', id);
  return q.toString();
}

function show(id, { push = false } = {}) {
  if (!SECTION[id]) id = 'roster';
  if (push) history.replaceState({}, '', `${location.pathname}?${tabQuery(id)}`);
  $('ctTabs').innerHTML = TABS.map(t => `<a class="aces-tab" href="?${esc(tabQuery(t.id))}" data-goto="${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  Object.entries(SECTION).forEach(([tab, sec]) => { $(sec).hidden = tab !== id; });
  if (!rendered.has(id)) { rendered.add(id); RENDER[id](); }
}

// ---------------------------------------------------------------------------
// Calendar, cards, events
// ---------------------------------------------------------------------------

function openCalendarMenu() {
  const url = getCalendarUrl({ team: S.key, season: S.seasonId });
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  return openModal({
    title: 'Add to calendar',
    html: `<p>${esc(S.team)}'s games for ${esc(seasonLabel(S.seasonId))}. A subscription stays up to date when games move.</p>
      <div class="ct-cal-options">
        <a class="aces-btn is-primary" href="${esc(webcal)}">${icon('calendar')}Subscribe (iPhone, Mac, Outlook)</a>
        <a class="aces-btn" href="${esc(google)}" target="_blank" rel="noopener">${icon('external-link')}Google Calendar</a>
        <a class="aces-btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('download')}Download .ics</a>
        <button type="button" class="aces-btn is-ghost" data-copy>${icon('copy')}Copy link</button>
      </div>`,
    actions: [{ label: 'Done', value: true, variant: 'secondary' }],
    onOpen: (dialog) => dialog.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); showToast('Calendar link copied.', 'success'); }
      catch { showToast('Could not copy. Long-press the Download link instead.', 'info'); }
    })
  });
}

function flip(card) {
  const on = card.getAttribute('aria-pressed') !== 'true';
  document.querySelectorAll('.ct-card[aria-pressed="true"]').forEach(c => { if (c !== card) c.setAttribute('aria-pressed', 'false'); });
  card.setAttribute('aria-pressed', String(on));
}

function wire() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-goto]');
    if (tab && !e.metaKey && !e.ctrlKey) { e.preventDefault(); return show(tab.dataset.goto, { push: true }); }
    if (e.target.closest('[data-calendar]')) return openCalendarMenu();
    const card = e.target.closest('.ct-card');
    if (card && !e.target.closest('a')) return flip(card);
    if (!card) document.querySelectorAll('.ct-card[aria-pressed="true"]').forEach(c => c.setAttribute('aria-pressed', 'false'));
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.ct-card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flip(card); }
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-logo]')) e.target.remove();
    if (e.target.matches?.('[data-photo]')) { e.target.nextElementSibling?.removeAttribute('hidden'); e.target.remove(); }
  }, true);
}

// ---------------------------------------------------------------------------

async function main() {
  await initPage({ title: 'Team' });
  const q = new URLSearchParams(location.search);
  const teamParam = (q.get('team') || '').trim();
  if (!teamParam) {
    pageReady();
    showPageState({ title: 'Pick a team', message: 'This page needs a team, like ?team=Teal.', actions: [{ label: 'All teams', href: siteUrl('teams.html'), primary: true }] });
    return;
  }
  S.seasonId = parseStatSeasonId(q.get('season') || '').id || await getDisplaySeasonId().catch(() => '') || '';
  S.team = cap(teamParam);
  S.key = S.team.toLowerCase();
  await load();
  if (!S.mine.length && !S.bat.length && !S.roster.length) {
    pageReady();
    showPageState({ title: 'Team not found', message: `${S.team} isn't playing in ${seasonLabel(S.seasonId)}.`,
      actions: [{ label: 'All teams', href: siteUrl('teams.html'), primary: true }, { label: `${S.team} history`, href: siteUrl(`team.html?team=${encodeURIComponent(S.team)}`) }] });
    return;
  }
  renderHead();
  renderHero();
  wire();
  show(q.get('tab') || 'roster');
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
