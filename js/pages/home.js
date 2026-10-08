// js/pages/home.js
// The v2.0 home page: "what's happening in the league right now" on one screen.
//
//   Head ........ season, phase, games played / left
//   Live & next . live games (real time), the next games, recent finals
//   Standings ... top of the table with W-L, GB, last 5 and streak
//   Leaders ..... BA, AcesBPI and ERA, top 5, season or career
//   My Aces ..... signed in: my team's spot and next game, my season line, RSVP,
//                 captain actions by role. Signed out: sign in / create account
//   News ........ announcements (bannerMessages) and the activity feed
//   Milestones .. players close to 100/200... hits and 50/100... runs
//   Photos ...... league photos (siteConfig/features.photoGallery can hide them)
//   Explore ..... the five hubs
//
// Standings, games, leaders and milestones come from one season summary
// (js/data/summaries.js): the stored doc when fresh, else built in the browser.
// Offseason: the last season's summary, without the live strip, led by the
// offseason block: countdown to opening day (siteConfig/current.openingDay),
// the champion (champions/{seasonId}), signups (siteConfig/signups, set each
// year) and links to Year in review, Champions and the Aceys.
// Playoffs: the playoffs block leads (series by round from the playoff games,
// plus Bracket / Championship preview links as the nav allows them). Late in
// the regular season, a "Playoff race" row appears once Clinching or the
// Bracket is switched on in siteConfig/navigation/pages.
// Preview only: ?phase=offseason|regular|playoffs and ?season=<id> override
// the phase and season, to test a mode against a past season.

import { initPage, pageReady } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { getDisplaySeasonId, formatSeasonLabel } from '../core/config.js';
import { IS_PREVIEW } from '../core/env.js';
import { db, collection, query, where, orderBy, limit, getDocs, doc, getDoc } from '../core/firebase.js';
import { getSeasonSummary, rebuildSeasonSummary } from '../data/summaries.js';
import { findPlayerStatsForUser } from '../data/player-stats.js';
import { mySeason, myStatsHtml } from '../ui/my-stats.js';
import { escapeHtml as esc, fmtAvg, fmtRate, formatPlayerName, formatIP } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { teamChipHtml, TEAM_COLORS } from '../ui/stat-columns.js';
import { formatTime, formatRelativeDay, todayKey, daysBetween, formatGameDate } from '../domain/dates.js';
import { battingLine, era } from '../domain/stats.js';
import { parseStatSeasonId, hasCompleteHitTypes, inningsValue } from '../domain/season-ids.js';
import { buildNav, loadPageVisibility, isPageVisible } from '../../nav-config.js';

const $ = (id) => document.getElementById(id);
const state = { ctx: null, seasonId: null, phase: 'regular', summary: null, source: '', live: [], leaderScope: 'season' };

// ---- small helpers -------------------------------------------------------------

const chip = (team, { seasonId = state.seasonId } = {}) =>
  team ? teamChipHtml({ team, teamKey: String(team).toLowerCase(), seasonId, seasonCount: 1 }) : '';

const dot = (team) => {
  const key = String(team || '').toLowerCase();
  return `<span class="aces-team-dot"${TEAM_COLORS.has(key) ? ` data-team-color="${esc(key)}"` : ''}></span>`;
};

const playerHref = (id, name) => `player.html?${id ? `id=${encodeURIComponent(id)}` : `name=${encodeURIComponent(name || '')}`}`;

const gameHref = (g) => {
  const q = new URLSearchParams({ home: g.home, away: g.away });
  if (g.dateKey) q.set('date', g.dateKey);
  return `game-preview.html?${q}`;
};

function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

function section(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
  return el;
}

// ---- head ------------------------------------------------------------------------

function renderHead() {
  const s = state.summary;
  const label = state.seasonId ? formatSeasonLabel(state.seasonId) : '';
  const phaseText = { regular: 'Regular season', playoffs: 'Playoffs', offseason: 'Offseason' }[state.phase] || '';
  const counts = !s?.counts ? ''
    : state.phase === 'offseason' ? `Season complete · ${s.counts.gamesPlayed} games played`
    : `${s.counts.gamesPlayed} games played${s.counts.gamesLeft ? ` · ${s.counts.gamesLeft} to go` : ''}`;
  section('homeHead', `
    <div>
      <span class="aces-page-kicker">${esc([label, phaseText].filter(Boolean).join(' · '))}</span>
      <h1 class="aces-page-title">Mountainside Aces</h1>
      ${counts ? `<p class="home-head-meta">${esc(counts)}</p>` : ''}
    </div>`);
}

// ---- live & next -------------------------------------------------------------------

function scoreCard(g, { live = null } = {}) {
  const final = g.result || g.winner;
  const status = live
    ? `<span class="aces-live">Live</span><span>${esc(live.isTop ? 'Top' : 'Bot')} ${esc(live.inning)}</span>`
    : final
      ? `<span>Final${g.type === 'playoff' ? ' · Playoff' : ''}</span><span>${esc(formatRelativeDay(g.dateKey))}</span>`
      : `<span>${esc(formatRelativeDay(g.dateKey))}</span><span>${esc(formatTime(g.time) || '')}</span>`;
  const awayRuns = live ? live.awayScore : g.awayScore;
  const homeRuns = live ? live.homeScore : g.homeScore;
  const showRuns = live || final;
  const row = (team, runs, win) => `<div class="aces-score-row${win ? ' is-winner' : ''}">
      <span class="home-score-team">${dot(team)}${esc(team)}</span>
      ${showRuns ? `<span class="aces-score-runs">${esc(runs ?? '')}</span>` : ''}</div>`;
  return `<a class="aces-score${live ? ' is-live' : ''}" href="${esc(gameHref(g))}">
    <div class="aces-score-status">${status}</div>
    ${row(g.away, awayRuns, final && g.result === 'away')}
    ${row(g.home, homeRuns, final && g.result === 'home')}
    ${!final && !live && g.field ? `<div class="aces-score-meta">${esc(g.field)}</div>` : ''}
  </a>`;
}

function renderStrip() {
  const s = state.summary;
  const el = $('homeStrip');
  if (!el) return;
  if (state.phase === 'offseason' || !s) { el.hidden = true; return; }

  const liveIds = new Set(state.live.map(l => l.id));
  const live = state.live.map(l => {
    const g = (s.upcoming || []).find(x => x.id === l.id) || { id: l.id, home: l.homeTeam, away: l.awayTeam, dateKey: todayKey() };
    return scoreCard(g, { live: l });
  });
  const next = (s.upcoming || []).filter(g => !liveIds.has(g.id)).slice(0, 6).map(g => scoreCard(g));
  const recent = (s.recent || []).slice(0, 6).map(g => scoreCard(g));
  const cards = [...live, ...next, ...recent];

  el.hidden = false;
  el.innerHTML = `
    <div class="aces-section-head">
      <h2 class="aces-section-title">${live.length ? 'Live & next' : 'Next & recent'}</h2>
      <a class="aces-section-link" href="schedule.html">Schedule</a>
    </div>
    ${cards.length ? `<div class="aces-score-strip home-strip">${cards.join('')}</div>`
      : '<div class="aces-empty">No games on the schedule yet.</div>'}`;
}

// ---- standings -----------------------------------------------------------------------

function renderStandings() {
  const rows = state.summary?.standings || [];
  const body = rows.map(r => `<tr${r.clinched ? ' class="is-clinched"' : ''}>
      <td class="is-rank">${r.rank}</td>
      <th scope="row">${chip(r.team)}</th>
      <td class="is-num">${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}</td>
      <td class="is-num">${r.gamesBack ? (r.gamesBack % 1 ? r.gamesBack.toFixed(1) : r.gamesBack) : '—'}</td>
      <td class="is-num home-hide-sm">${esc(r.last5 || '')}</td>
      <td class="is-num">${esc(r.streak || '')}</td>
    </tr>`).join('');
  section('homeStandings', `
    <div class="aces-card-head">
      <h2 class="aces-card-title">${icon('list')} ${state.phase === 'offseason' ? 'Final standings' : 'Standings'}</h2>
      <a class="aces-section-link" href="current-season.html">Full standings</a>
    </div>
    ${rows.length ? `<div class="aces-table-wrap"><table class="aces-table is-compact home-standings">
      <thead><tr><th class="is-rank">#</th><th>Team</th><th class="is-num">W-L</th><th class="is-num">GB</th><th class="is-num home-hide-sm">L5</th><th class="is-num">Strk</th></tr></thead>
      <tbody>${body}</tbody></table></div>`
      : '<div class="aces-empty">Standings start after the first game.</div>'}`);
}

// ---- leaders ---------------------------------------------------------------------------

const LEADER_BOARDS = [
  { key: 'BA', label: 'Batting average', format: v => fmtAvg(v), kind: 'batting' },
  { key: 'BPI', label: 'AcesBPI', format: v => fmtRate(v), kind: 'batting', careerLabel: 'AcesBPI (avg)' },
  { key: 'ERA', label: 'ERA', format: v => fmtRate(v), kind: 'pitching' }
];

function renderLeaders() {
  const s = state.summary;
  const scope = state.leaderScope;
  const L = s?.leaders?.[scope] || {};
  const mins = s?.leaders?.minimums?.[scope] || {};
  const board = (b) => {
    const list = L[b.key] || [];
    return `<div class="home-board">
      <h3 class="home-board-title">${esc(scope === 'career' && b.careerLabel ? b.careerLabel : b.label)}</h3>
      ${list.length ? `<ol class="home-board-list">${list.map((x, i) => `<li>
          <span class="home-board-rank">${i + 1}</span>
          <a href="${esc(playerHref(x.id, x.name))}">${dot(x.team)}${esc(formatPlayerName(x.name))}</a>
          <span class="home-board-value">${esc(b.format(x.value))}</span></li>`).join('')}</ol>`
        : '<p class="home-board-empty">No one qualifies yet.</p>'}
      ${mins[b.kind] ? `<p class="home-board-note">${esc(mins[b.kind])}</p>` : ''}
    </div>`;
  };
  section('homeLeaders', `
    <div class="aces-card-head">
      <h2 class="aces-card-title">${icon('trophy')} Leaders</h2>
      <div class="aces-segmented" role="group" aria-label="Season or career">
        <button type="button" class="aces-segment" data-scope="season" aria-pressed="${scope === 'season'}">Season</button>
        <button type="button" class="aces-segment" data-scope="career" aria-pressed="${scope === 'career'}">Career</button>
      </div>
    </div>
    <div class="home-boards">${LEADER_BOARDS.map(board).join('')}</div>
    <a class="aces-section-link home-more" href="leaders.html${scope === 'career' ? '' : '?scope=season'}">All leaders</a>`);
}

// ---- my aces ----------------------------------------------------------------------------

async function renderMyAces() {
  const el = $('homeMine');
  if (!el) return;
  const { user, profile } = state.ctx || {};
  if (!user) {
    el.innerHTML = `
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('user')} My Aces</h2></div>
      <p class="home-mine-pitch">Sign in to see your team's next game, RSVP, and your own stats here.</p>
      <div class="aces-cluster">
        <a class="aces-btn is-primary" href="signin.html">Sign in</a>
        <a class="aces-btn" href="signup.html">Create account</a>
      </div>`;
    return;
  }

  // View As shows the viewed user's stats, so go by the profile's own id.
  const player = profile ? await findPlayerStatsForUser(profile, profile.id || user?.uid).catch(() => null) : null;
  const playerId = player?.id || null;

  // The team from this season's regular record (js/ui/my-stats.js).
  let team = mySeason(player, state.seasonId).team;
  team = String(team || player?.currentTeam || profile?.team || profile?.linkedTeam || '');
  team = team ? team.charAt(0).toUpperCase() + team.slice(1).toLowerCase() : '';

  const s = state.summary;
  const standing = team ? (s?.standings || []).find(r => r.team.toLowerCase() === team.toLowerCase()) : null;
  const next = team && state.phase !== 'offseason' ? (s?.upcoming || []).find(g => g.home.toLowerCase() === team.toLowerCase() || g.away.toLowerCase() === team.toLowerCase()) : null;

  // Game-day actions only in season.
  const staff = state.phase !== 'offseason' && hasRole(profile, 'team-staff');
  const actions = [
    `<a class="aces-btn is-sm" href="me.html">${icon('calendar')} RSVP &amp; dashboard</a>`,
    staff && `<a class="aces-btn is-sm" href="submit-score.html">${icon('hash')} Submit score</a>`,
    staff && `<a class="aces-btn is-sm" href="submit-stats.html">${icon('calculator')} Submit stats</a>`,
    staff && `<a class="aces-btn is-sm" href="roster-management.html">${icon('users')} Roster</a>`
  ].filter(Boolean).join('');

  const statBlock = playerId ? myStatsHtml(player, { seasonId: state.seasonId, finished: state.phase === 'offseason' }) : '';

  el.innerHTML = `
    <div class="aces-card-head">
      <h2 class="aces-card-title">${icon('user')} My Aces</h2>
      ${playerId ? `<a class="aces-section-link" href="${esc(playerHref(playerId))}">My page</a>` : ''}
    </div>
    ${team ? `<div class="home-mine-team">${chip(team)}${standing ? `<span>${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ''} · ${ordinal(standing.rank)} place</span>` : ''}</div>` : ''}
    ${next ? `<a class="home-mine-next" href="${esc(gameHref(next))}">
        <span class="home-mine-label">Next game</span>
        <span>${esc(next.home.toLowerCase() === team.toLowerCase() ? `vs ${next.away}` : `at ${next.home}`)} · ${esc(formatRelativeDay(next.dateKey))}${next.time ? ` · ${esc(formatTime(next.time))}` : ''}${next.field ? ` · ${esc(next.field)}` : ''}</span>
      </a>` : ''}
    ${!playerId ? '<p class="home-mine-pitch">Link your account to your player record to see your stats here.</p>' : ''}
    <div class="aces-cluster home-mine-actions">${actions}</div>
    ${statBlock}`;
}

const ordinal = (n) => {
  const v = n % 100;
  return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th');
};

// ---- news ---------------------------------------------------------------------------------

const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);

async function loadAnnouncements() {
  try {
    const snap = await getDocs(query(collection(db, 'bannerMessages'), where('isActive', '==', true), orderBy('priority', 'asc')));
    const now = new Date();
    return snap.docs.map(d => d.data()).filter(m => {
      const start = toDate(m.startDate);
      const end = toDate(m.endDate);
      return m.message && (!start || now >= start) && (!end || now <= end);
    }).map(m => ({ kind: 'announcement', text: m.message, link: m.linkUrl || m.link || '' }));
  } catch (err) {
    console.warn('[home] announcements unavailable', err);
    return [];
  }
}

async function loadActivity() {
  try {
    const snap = await getDocs(query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(8)));
    return snap.docs.map(d => d.data()).map(a => ({
      kind: 'activity', type: a.type || '', title: a.title || '', text: a.description || '',
      link: a.linkUrl ? String(a.linkUrl).replace(/^\//, '') : '', when: toDate(a.timestamp)
    }));
  } catch (err) {
    console.warn('[home] activity unavailable', err);
    return [];
  }
}

const ACTIVITY_ICONS = { game: 'softball', milestone: 'target', badge: 'medal', careerHigh: 'trending-up', streak: 'flame', photo: 'image', standings: 'list' };

async function renderNews() {
  const [notes, feed] = await Promise.all([loadAnnouncements(), loadActivity()]);
  const item = (n) => {
    const body = n.kind === 'announcement'
      ? `<span class="home-news-icon is-pinned">${icon('megaphone')}</span><span class="home-news-text">${esc(n.text)}</span>`
      : `<span class="home-news-icon">${icon(ACTIVITY_ICONS[n.type] || 'activity')}</span>
         <span class="home-news-text"><strong>${esc(n.title)}</strong>${n.text ? ` <span class="home-news-sub">${esc(n.text)}</span>` : ''}</span>
         ${n.when ? `<time class="home-news-time" datetime="${esc(n.when.toISOString())}">${esc(ago(n.when.toISOString()))}</time>` : ''}`;
    return `<li>${n.link ? `<a class="home-news-item" href="${esc(n.link)}">${body}</a>` : `<div class="home-news-item">${body}</div>`}</li>`;
  };
  const items = [...notes, ...feed];
  section('homeNews', `
    <div class="aces-card-head">
      <h2 class="aces-card-title">${icon('newspaper')} League news</h2>
      <a class="aces-section-link" href="activity.html">All activity</a>
    </div>
    ${items.length ? `<ul class="home-news">${items.map(item).join('')}</ul>` : '<div class="aces-empty">Nothing new yet.</div>'}`);
}

// ---- milestones ------------------------------------------------------------------------------

function renderMilestones() {
  const m = state.summary?.milestones || { hits: [], runs: [] };
  const list = (rows, unit) => rows.length
    ? `<ul class="home-ms">${rows.slice(0, 5).map(x => `<li>
        <a href="${esc(playerHref(x.id, x.name))}">${dot(x.team)}${esc(formatPlayerName(x.name))}</a>
        <span class="home-ms-gap"><strong>${x.gap}</strong> to ${x.milestone} ${unit}</span>
        <span class="home-ms-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round((x.current / x.milestone) * 100))}%"></span></span>
      </li>`).join('')}</ul>`
    : '<p class="home-board-empty">No one is close right now.</p>';
  const any = (m.hits?.length || 0) + (m.runs?.length || 0);
  const el = section('homeMilestones', `
    <div class="aces-card-head">
      <h2 class="aces-card-title">${icon('target')} Milestone watch</h2>
      <a class="aces-section-link" href="leaders.html?view=milestones">Milestones</a>
    </div>
    <div class="home-boards is-two">
      <div class="home-board"><h3 class="home-board-title">Career hits</h3>${list(m.hits || [], 'hits')}</div>
      <div class="home-board"><h3 class="home-board-title">Career runs</h3>${list(m.runs || [], 'runs')}</div>
    </div>`);
  if (el) el.hidden = !any;
}

// ---- photos ------------------------------------------------------------------------------------

async function renderPhotos() {
  const el = $('homePhotos');
  if (!el) return;
  try {
    const features = await getDoc(doc(db, 'siteConfig', 'features'));
    const f = features.exists() ? features.data() : {};
    if (f.photoGallery === false || f.photoGalleryEnabled === false) { el.hidden = true; return; }
    const snap = await getDocs(query(collection(db, 'teamPhotos'), where('folder', '==', 'league'), orderBy('createdAt', 'desc'), limit(12)));
    const photos = snap.docs.map(d => d.data()).filter(p => p.url && (!p.type || String(p.type).startsWith('image')));
    if (!photos.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      <div class="aces-section-head">
        <h2 class="aces-section-title">League photos</h2>
        <a class="aces-section-link" href="pictures.html">All photos</a>
      </div>
      <div class="home-photos">${photos.map(p => `<a class="home-photo" href="pictures.html"><img src="${esc(p.url)}" alt="${esc(p.name || 'League photo')}" loading="lazy"></a>`).join('')}</div>`;
  } catch (err) {
    console.warn('[home] photos unavailable', err);
    el.hidden = true;
  }
}

// ---- explore (the five hubs in the bar; Help is a utility hub) ------------------------------------------------------------------------------------

const HUB_BLURBS = {
  season: 'Standings, schedule, playoffs and rules',
  stats: 'Batting, pitching, leaders and compare',
  teams: 'Every team, every player',
  history: 'Champions, awards and past seasons',
  play: 'Daily games, pick’em and DFS'
};

async function renderExplore() {
  await loadPageVisibility().catch(() => null);
  const { user, profile } = state.ctx || {};
  const nav = buildNav({ signedIn: !!user, profile, phase: state.phase, hasRole, isVisible: isPageVisible });
  section('homeExplore', `
    <div class="aces-section-head"><h2 class="aces-section-title">Explore</h2></div>
    <div class="home-hubs">${nav.hubs.filter(h => h.href && HUB_BLURBS[h.id]).map(h => `
      <a class="home-hub" href="${esc(h.href)}">
        <span class="home-hub-icon">${icon(h.icon)}</span>
        <span class="home-hub-name">${esc(h.label)}</span>
        <span class="home-hub-blurb">${esc(HUB_BLURBS[h.id] || h.tabs.slice(0, 3).map(t => t.label).join(', '))}</span>
      </a>`).join('')}</div>`);
}

// ---- data freshness (admins can rebuild) ----------------------------------------------------------

function renderFoot() {
  const el = $('homeFoot');
  if (!el) return;
  const s = state.summary;
  const { profile } = state.ctx || {};
  const canRebuild = hasRole(profile, ['admin', 'league-staff']);
  const when = s?.builtAt ? `Standings and leaders updated ${ago(s.builtAt)}` : '';
  el.innerHTML = `${esc(when)}${canRebuild ? ` · <button type="button" class="home-rebuild" id="homeRebuild">Rebuild now</button>` : ''}`;
  $('homeRebuild')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const res = await rebuildSeasonSummary(state.seasonId);
      showToast(`Summary rebuilt (${res.gamesPlayed} games)`);
      await loadSummary({ allowBuild: true });
      renderAll();
    } catch (err) {
      console.error('[home] rebuild', err);
      showToast('Rebuild failed. Is the summary function deployed?', 'error');
    } finally {
      e.target.disabled = false;
    }
  });
}



// ---- playoffs -----------------------------------------------------------------------------------

// The Playoffs group's pages, as the nav would show them now (phase window and
// the hand switches in siteConfig/navigation/pages both apply).
function playoffLinks() {
  const { user, profile } = state.ctx || {};
  const nav = buildNav({ signedIn: !!user, profile, phase: state.phase, hasRole, isVisible: isPageVisible });
  const season = nav.hubs.find(h => h.id === 'season');
  const group = season?.tabs.find(t => t.key === 'playoffs');
  return group?.pages || [];
}

function seriesCard(sr) {
  const [a, b] = sr.teams;
  const wa = sr.wins[a] || 0;
  const wb = sr.wins[b] || 0;
  const done = !sr.next && sr.played > 0;
  const leader = wa === wb ? null : wa > wb ? a : b;
  const status = !sr.played ? 'Not started'
    : done && leader ? `${leader} ${wa + wb === 1 ? 'wins' : 'wins the series'} ${Math.max(wa, wb)}-${Math.min(wa, wb)}`
    : leader ? `${leader} leads ${Math.max(wa, wb)}-${Math.min(wa, wb)}`
    : `Tied ${wa}-${wb}`;
  const row = (t, w) => `<div class="home-series-row${done && leader === t ? ' is-winner' : ''}${done && leader && leader !== t ? ' is-out' : ''}">
      <span class="home-score-team">${dot(t)}${esc(t)}</span><span class="home-series-wins">${w}</span></div>`;
  const next = sr.next
    ? `<span>Next: ${esc(formatRelativeDay(sr.next.dateKey))}${sr.next.time ? ` · ${esc(formatTime(sr.next.time))}` : ''}${sr.next.ifNecessary ? ' (if necessary)' : ''}</span>`
    : '';
  return `<a class="aces-card home-series" href="playoffs.html">
    ${row(a, wa)}${row(b, wb)}
    <div class="home-series-status"><strong>${esc(status)}</strong>${next}</div>
  </a>`;
}

function renderPlayoffs() {
  const el = $('homePlayoffs');
  if (!el) return;
  const links = playoffLinks();
  const linkRow = links.length ? `<div class="aces-chip-row home-po-links">${links.map(p =>
    `<a class="aces-chip" href="${esc(p.href)}">${icon(p.icon)}${esc(p.label)}</a>`).join('')}</div>` : '';

  // Regular season: just the race links, once Clinching or the Bracket is switched on.
  if (state.phase === 'regular') {
    if (!links.some(p => p.id === 'clinching' || p.id === 'playoffs')) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="aces-section-head"><h2 class="aces-section-title">Playoff race</h2></div>${linkRow}`;
    return;
  }
  if (state.phase !== 'playoffs') { el.hidden = true; return; }

  const po = state.summary?.playoffs || { rounds: [] };
  const rounds = po.rounds || [];
  // The round being played: the first with a game still to come, else the last.
  const current = rounds.find(r => r.series.some(sr => sr.next)) || rounds[rounds.length - 1];
  const earlier = current ? rounds.slice(0, rounds.indexOf(current)).reverse() : [];

  el.hidden = false;
  el.innerHTML = `
    <div class="aces-section-head">
      <h2 class="aces-section-title">Playoffs${current ? ` · ${esc(current.name)}` : ''}</h2>
      <a class="aces-section-link" href="playoffs.html">Bracket</a>
    </div>
    ${current ? `<div class="home-series-grid">${current.series.map(seriesCard).join('')}</div>`
      : '<div class="aces-empty">The bracket is set once the regular season ends.</div>'}
    ${earlier.length ? `<details class="home-po-earlier"><summary>Earlier rounds</summary>
      ${earlier.map(r => `<div class="home-po-round"><h3 class="home-board-title">${esc(r.name)}</h3>
        <ul class="home-po-results">${r.series.map(sr => {
          const [a, b] = sr.teams;
          return `<li>${dot(a)}${esc(a)} <strong>${sr.wins[a] || 0}-${sr.wins[b] || 0}</strong> ${esc(b)}${dot(b)}</li>`;
        }).join('')}</ul></div>`).join('')}
    </details>` : ''}
    ${linkRow}`;
}

// ---- offseason --------------------------------------------------------------------------------

// siteConfig/signups, set by admins each year (Firebase console):
//   { url: 'https://...', label: 'Register for 2027', opens: '2027-01-15',
//     closes: '2027-03-01', note: 'Returning and new players' }
// The button shows only between opens and closes (either may be left out).
async function loadSignups() {
  try {
    const snap = await getDoc(doc(db, 'siteConfig', 'signups'));
    const d = snap.exists() ? snap.data() : null;
    if (!d || !d.url) return null;
    const today = todayKey();
    const key = (v) => (v && typeof v.toDate === 'function' ? todayKey(v.toDate()) : v ? String(v).slice(0, 10) : '');
    if (d.opens && key(d.opens) > today) return null;
    if (d.closes && key(d.closes) < today) return null;
    return { url: d.url, label: d.label || 'Sign up for next season', note: d.note || '', closes: key(d.closes) };
  } catch (err) {
    console.warn('[home] signups unavailable', err);
    return null;
  }
}

// The champion of the season shown, else the most recent one on record.
async function loadChampion(seasonId) {
  try {
    const own = seasonId ? await getDoc(doc(db, 'champions', seasonId)) : null;
    if (own?.exists()) return { seasonId, ...own.data() };
    const all = await getDocs(collection(db, 'champions'));
    const docs = all.docs.map(d => ({ seasonId: d.id, ...d.data() }));
    const key = (id) => { const [y, n] = String(id).split('-'); return (Number(y) || 0) * 10 + ({ spring: 1, summer: 2, fall: 3 }[n] || 0); };
    return docs.sort((a, b) => key(b.seasonId) - key(a.seasonId))[0] || null;
  } catch (err) {
    console.warn('[home] champion unavailable', err);
    return null;
  }
}

async function renderOffseason() {
  const el = $('homeOffseason');
  if (!el) return;
  if (state.phase !== 'offseason') { el.hidden = true; return; }

  const [champ, signups] = await Promise.all([loadChampion(state.seasonId), loadSignups()]);
  const opening = state.ctx?.config?.openingDay || '';
  const days = opening ? daysBetween(todayKey(), opening) : null;

  const countdown = days !== null && days >= 0 ? `
    <div class="aces-card home-off-count">
      <span class="home-off-label">Opening day</span>
      <span class="home-off-days">${days === 0 ? 'Today' : days}</span>
      <span class="home-off-sub">${days === 0 ? esc(formatGameDate(opening, 'long')) : `${days === 1 ? 'day' : 'days'} to go · ${esc(formatGameDate(opening, 'long'))}`}</span>
    </div>` : '';

  const champCard = champ?.team ? `
    <a class="aces-card home-off-champ" href="champions.html">
      <span class="home-off-label">${icon('trophy')} ${esc(formatSeasonLabel(champ.seasonId))} champions</span>
      <span class="home-off-team">${dot(champ.team)}${esc(champ.team)}</span>
      ${champ.runnerUp ? `<span class="home-off-sub">Runner-up: ${esc(champ.runnerUp)}</span>` : ''}
    </a>` : '';

  const signupCard = signups ? `
    <div class="aces-card home-off-signup">
      <span class="home-off-label">${icon('user-plus')} Signups are open</span>
      ${signups.note ? `<p class="home-off-sub">${esc(signups.note)}</p>` : ''}
      <a class="aces-btn is-accent" href="${esc(signups.url)}" target="_blank" rel="noopener">${esc(signups.label)}</a>
      ${signups.closes ? `<span class="home-off-sub">Closes ${esc(formatGameDate(signups.closes, 'long'))}</span>` : ''}
    </div>` : '';

  const links = [
    ['recap.html', 'book', 'Year in review', 'The season in stories and numbers'],
    ['champions.html', 'trophy', 'Champions', 'Every title, every season'],
    ['aceys-2026.html', 'star', 'The Aceys', 'This year’s awards'],
    ['awards.html', 'award', 'Awards', 'All-time honors']
  ].map(([href, ic, name, blurb]) => `
    <a class="home-hub" href="${href}">
      <span class="home-hub-icon">${icon(ic)}</span>
      <span class="home-hub-name">${esc(name)}</span>
      <span class="home-hub-blurb">${esc(blurb)}</span>
    </a>`).join('');

  el.hidden = false;
  el.innerHTML = `
    <div class="home-off-top">${countdown}${champCard}${signupCard}</div>
    <div class="aces-section-head home-off-links-head"><h2 class="aces-section-title">The offseason</h2></div>
    <div class="home-hubs">${links}</div>`;
}

// ---- start --------------------------------------------------------------------------------------

async function loadSummary(opts) {
  const { summary, source } = await getSeasonSummary(state.seasonId, opts);
  state.summary = summary;
  state.source = source;
}

function renderAll() {
  renderHead();
  renderStrip();
  renderStandings();
  renderLeaders();
  renderMilestones();
  renderFoot();
  renderPlayoffs();
}

async function startLive() {
  if (state.phase === 'offseason') return;
  try {
    const { initializeLiveGameTracking } = await import('../../live-game-indicator.js');
    await initializeLiveGameTracking((games) => { state.live = games || []; renderStrip(); });
  } catch (err) {
    console.warn('[home] live games unavailable', err);
  }
}

async function main() {
  const ctx = await initPage({ title: 'Home' });
  state.ctx = ctx;
  state.phase = ctx?.config?.phase || 'regular';
  // Preview only: ?phase=offseason (or regular / playoffs) to test a mode.
  const forced = IS_PREVIEW ? new URLSearchParams(location.search).get('phase') : null;
  if (['regular', 'playoffs', 'offseason'].includes(forced)) state.phase = forced;
  // In season: the current season. Offseason: the last one played.
  state.seasonId = (state.phase !== 'offseason' && ctx?.config?.currentSeasonId) || await getDisplaySeasonId();
  const forcedSeason = IS_PREVIEW ? new URLSearchParams(location.search).get('season') : null;
  if (forcedSeason && /^\d{4}-[a-z]+$/.test(forcedSeason)) state.seasonId = forcedSeason;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    state.leaderScope = b.dataset.scope === 'career' ? 'career' : 'season';
    renderLeaders();
  });

  await loadSummary();
  renderAll();
  pageReady();

  // The rest loads after the first screen is up.
  renderOffseason().catch(err => console.warn('[home] offseason', err));
  renderMyAces().catch(err => console.warn('[home] my aces', err));
  renderNews();
  renderPhotos();
  renderExplore().then(renderPlayoffs).catch(err => console.warn('[home] playoffs', err));
  startLive();
}

main().catch((err) => {
  console.error('[home]', err);
  const el = $('homeHead');
  if (el) el.innerHTML = '<div class="aces-notice">Something went wrong loading the home page. Try refreshing.</div>';
});
