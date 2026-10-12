// js/pages/league-history.js
// league-history.html: the league over time, in two tabs.
//   Timeline  how many teams each season had (a stacked column per season),
//             headline numbers, and every season with its teams (new teams
//             marked, the champion starred).
//   Awards    every award winner (this replaced awards.html), by season or by
//             award, filtered by season, award or player, plus the players with
//             the most awards.
//
// URL: league-history.html?tab=awards&season=2025-fall&award=Team%20MVP&q=smith&view=award
// Data: seasons docs, each season's games (teams), champions, awards.

import { initPage, pageReady, showPageError } from '../core/app.js';
import { getSeasons, isSeasonId } from '../core/config.js';
import { db, collection, getDocs } from '../core/firebase.js';
import { getSeasonGames } from '../data/games.js';
import { getAllAwards } from '../data/awards.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { normalizeGames } from '../domain/standings.js';
import { seasonLabel, seasonSortKey, parseStatSeasonId } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => { const t = String(s || '').trim(); return /[A-Z]/.test(t) ? t : t.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const TABS = [
  { id: 'timeline', label: 'Timeline', icon: 'chart-bar' },
  { id: 'awards', label: 'Awards', icon: 'award' }
];

// The order awards are listed in; anything else follows alphabetically.
const AWARD_ORDER = [
  'MVP', 'Team MVP', 'All Aces', 'Gold Glove', 'Team of the Year',
  'Rookie of the Year', 'Most Improved Ace', 'Comeback Player of the Year',
  'Slugger of the Year', 'Pitcher of the Year', 'Captain of the Year',
  'Al Pineda Good Guy Award', 'Iron Man Award', 'Sub of the Year',
  'Andrew Streaman Boner Award', 'Erik Lund Perservenance Award',
  'Mr. Streaman Award for Excellence'
];
// Award artwork in awards/ (an award without one shows the award icon).
const AWARD_ART = {
  'MVP': 'mvp.png', 'Team MVP': 'team_mvp.png', 'All Aces': 'all_aces.png', 'Gold Glove': 'gold_glove.png',
  'Team of the Year': 'team_of_the_year.png', 'Rookie of the Year': 'rookie_of_the_year.png',
  'Most Improved Ace': 'most_improved_ace.png', 'Comeback Player of the Year': 'comeback_player.png',
  'Slugger of the Year': 'slugger_of_the_year.png', 'Pitcher of the Year': 'pitcher_of_the_year.png',
  'Captain of the Year': 'captain_of_the_year.png', 'Al Pineda Good Guy Award': 'al_pineda_good_guy_award.png',
  'Iron Man Award': 'iron_man_award.png', 'Sub of the Year': 'sub_of_the_year.png',
  'Andrew Streaman Boner Award': 'andrew_streaman_boner_award.png',
  'Erik Lund Perservenance Award': 'erik_lund_perservenance_award.png',
  'Mr. Streaman Award for Excellence': 'mr_streaman_award_for_excellence.png'
};
const awardRank = (a) => { const i = AWARD_ORDER.indexOf(a); return i === -1 ? 999 : i; };
const byAward = (a, b) => awardRank(a) - awardRank(b) || a.localeCompare(b);

const S = {
  tab: 'timeline',
  seasons: [],     // { id, teams: [names], champion }, oldest first
  awards: [],      // { award, player, team, position, seasonId }
  f: { season: '', award: '', q: '', view: 'season' },
  rendered: new Set()
};

function chip(team, { extra = '' } = {}) {
  if (!team) return '';
  const name = cap(team);
  const k = name.toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: name }).toString())}"><span class="aces-team-dot"></span>${esc(name)}${extra}</a>`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const realTeam = (name) => {
  const t = String(name || '').trim();
  return t && !/^(tbd|tba|bye|winner|loser|seed|#?\d+$)/i.test(t) && !/\b(seed|winner of|loser of)\b/i.test(t);
};

async function loadTimeline() {
  const [docs, champs] = await Promise.all([
    getSeasons(),
    getDocs(collection(db, 'champions')).catch(() => ({ docs: [] }))
  ]);
  const champion = {};
  champs.docs.forEach((d) => { const v = d.data(); champion[parseStatSeasonId(v.seasonId || d.id).id || d.id] = v.team || ''; });
  const ids = docs.map((s) => s.id).filter(isSeasonId);
  const lists = await Promise.all(ids.map((id) => getSeasonGames(id).catch(() => [])));
  const seasons = ids.map((id, i) => {
    const names = new Map();   // norm -> display name
    for (const g of normalizeGames(lists[i])) {
      if (g.type !== 'regular') continue;
      for (const t of [g.home, g.away]) if (realTeam(t) && !names.has(norm(t))) names.set(norm(t), cap(t));
    }
    return { id, teams: [...names.values()], champion: champion[id] || '' };
  }).filter((s) => s.teams.length)
    .sort((a, b) => seasonSortKey(a.id) - seasonSortKey(b.id));

  // Stack order: longest-serving teams at the bottom of each column.
  const seen = new Map();
  for (const s of seasons) {
    s.teams.forEach((t) => seen.set(norm(t), (seen.get(norm(t)) || 0) + 1));
    const tenure = new Map(s.teams.map((t) => [t, seen.get(norm(t))]));
    s.teams.sort((a, b) => tenure.get(b) - tenure.get(a) || a.localeCompare(b));
  }
  return seasons;
}

function awardSeasonId(a) {
  if (a.seasonId) return parseStatSeasonId(a.seasonId).id || a.seasonId;
  const y = a.year || a.Year;
  const s = a.season || a.Season;
  return y && s ? `${y}-${String(s).toLowerCase()}` : '';
}

async function loadAwards() {
  const raw = await getAllAwards();
  return raw.map((a) => ({
    award: String(a.category || a.Award || '').trim(),
    player: String(a.playerName || a.Player || '').trim(),
    team: String(a.teamName || a.team || a.Team || '').trim(),
    position: String(a.position || a.Position || '').trim(),
    seasonId: awardSeasonId(a)
  })).filter((a) => a.award);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function renderTimeline() {
  const ss = S.seasons;
  const box = $('lhTimeline');
  if (!ss.length) { box.innerHTML = '<p class="aces-empty">No seasons yet.</p>'; return; }
  const allTeams = new Map();
  ss.forEach((s) => s.teams.forEach((t) => allTeams.set(norm(t), t)));
  const latest = ss[ss.length - 1];
  const peak = ss.reduce((m, s) => (s.teams.length > m.teams.length ? s : m), ss[0]);
  const max = peak.teams.length;

  const tiles = [
    ['Seasons', ss.length, `Since ${seasonLabel(ss[0].id)}`],
    ['Teams all-time', allTeams.size, 'Every Aces team'],
    ['Teams now', latest.teams.length, seasonLabel(latest.id)],
    ['Most teams', max, seasonLabel(peak.id)]
  ].map(([label, value, sub]) => `<div class="aces-stat"><span class="aces-stat-value">${esc(value)}</span><span class="aces-stat-label">${esc(label)}</span><span class="aces-stat-meta">${esc(sub)}</span></div>`).join('');

  const cols = ss.map((s) => `<li class="lh-col" style="--n:${s.teams.length}">
    <span class="lh-col-n">${s.teams.length}</span>
    <span class="lh-stack">${s.teams.map((t) => { const k = t.toLowerCase(); return `<span class="lh-cell"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} title="${esc(t)}"><span>${esc(t)}</span></span>`; }).join('')}</span>
    <a class="lh-col-label" href="season.html?seasonId=${esc(encodeURIComponent(s.id))}">${esc(seasonLabel(s.id).replace(/^(\d{4}) /, '$1\n'))}</a>
  </li>`).join('');

  const rows = [...ss].reverse().map((s, i, list) => {
    const prev = list[i + 1];
    const prevKeys = new Set((prev?.teams || []).map(norm));
    const nowKeys = new Set(s.teams.map(norm));
    const gone = prev ? prev.teams.filter((t) => !nowKeys.has(norm(t))) : [];
    const teams = [...s.teams].sort((a, b) => a.localeCompare(b));
    return `<li class="lh-season">
      <div class="lh-season-head">
        <a href="season.html?seasonId=${esc(encodeURIComponent(s.id))}">${esc(seasonLabel(s.id))}</a>
        <span class="lh-count">${plural(s.teams.length, 'team')}</span>
      </div>
      <div class="lh-chips">${teams.map((t) => {
        const isNew = prev && !prevKeys.has(norm(t));
        const isChamp = s.champion && norm(s.champion) === norm(t);
        return chip(t, { extra: `${isChamp ? `<span class="lh-champ" title="Champion">${icon('trophy')}</span>` : ''}${isNew ? '<span class="lh-new">New</span>' : ''}` });
      }).join('')}</div>
      ${gone.length ? `<p class="lh-gone">Not back from ${esc(seasonLabel(prev.id))}: ${gone.map((t) => esc(t)).join(', ')}</p>` : ''}
    </li>`;
  }).join('');

  box.innerHTML = `
    <div class="aces-stats lh-stats">${tiles}</div>
    <section class="aces-card">
      <h2 class="lh-h">${icon('chart-bar')}Teams by season</h2>
      <p class="lh-note">Each column is a season; the longest-serving teams sit at the bottom.</p>
      <div class="lh-chart" style="--max:${max}"><ol class="lh-cols">${cols}</ol></div>
    </section>
    <section class="aces-card">
      <h2 class="lh-h">${icon('calendar')}Season by season</h2>
      <ol class="lh-seasons">${rows}</ol>
    </section>`;
  const chart = box.querySelector('.lh-chart');
  chart.scrollLeft = chart.scrollWidth;   // newest seasons in view on phones
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

function art(award) {
  const f = AWARD_ART[award];
  return f
    ? `<img class="lh-art" src="awards/${esc(f)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'lh-art is-icon',innerHTML:this.dataset.fb}))" data-fb="${esc(icon('award'))}">`
    : `<span class="lh-art is-icon">${icon('award')}</span>`;
}

function filtered() {
  const q = S.f.q.trim().toLowerCase();
  return S.awards.filter((a) => (!S.f.season || a.seasonId === S.f.season)
    && (!S.f.award || a.award === S.f.award)
    && (!q || a.player.toLowerCase().includes(q) || a.team.toLowerCase().includes(q)));
}

function winner(a, { showSeason = false } = {}) {
  return `<li>
    ${showSeason ? `<a class="lh-w-season" href="season.html?seasonId=${esc(encodeURIComponent(a.seasonId))}">${esc(seasonLabel(a.seasonId))}</a>` : ''}
    ${a.player ? `<a class="lh-w-name" href="player.html?name=${esc(encodeURIComponent(a.player))}">${esc(a.player)}</a>` : '<span class="lh-w-name">Team award</span>'}
    ${a.team ? chip(a.team) : ''}
    ${a.position ? `<small>${esc(a.position)}</small>` : ''}
  </li>`;
}

function group(list, key) {
  const m = new Map();
  list.forEach((a) => { const k = a[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(a); });
  return m;
}

function bySeasonHtml(list) {
  const seasons = [...group(list, 'seasonId')].sort((a, b) => seasonSortKey(b[0]) - seasonSortKey(a[0]));
  return seasons.map(([sid, items]) => {
    const awards = [...group(items, 'award')].sort((a, b) => byAward(a[0], b[0]));
    return `<section class="aces-card lh-aw-season">
      <h2 class="lh-h">${sid ? `<a href="season.html?seasonId=${esc(encodeURIComponent(sid))}">${esc(seasonLabel(sid))}</a>` : 'Season unknown'} <small>${plural(items.length, 'award')}</small></h2>
      <div class="lh-aw-grid">${awards.map(([award, ws]) => `<div class="lh-aw">
        <h3>${art(award)}<span>${esc(award)}</span></h3>
        <ul class="lh-winners">${ws.sort((a, b) => a.position.localeCompare(b.position) || a.player.localeCompare(b.player)).map((a) => winner(a)).join('')}</ul>
      </div>`).join('')}</div>
    </section>`;
  }).join('');
}

function byAwardHtml(list) {
  const awards = [...group(list, 'award')].sort((a, b) => byAward(a[0], b[0]));
  return `<div class="lh-aw-cols">${awards.map(([award, ws]) => `<section class="aces-card lh-aw">
    <h2 class="lh-h">${art(award)}<span>${esc(award)}</span> <small>${ws.length}</small></h2>
    <ul class="lh-winners is-dated">${ws.sort((a, b) => seasonSortKey(b.seasonId) - seasonSortKey(a.seasonId) || a.player.localeCompare(b.player)).map((a) => winner(a, { showSeason: true })).join('')}</ul>
  </section>`).join('')}</div>`;
}

function mostHtml(list) {
  const counts = [...group(list.filter((a) => a.player), 'player')]
    .map(([player, ws]) => ({ player, n: ws.length, kinds: [...new Set(ws.map((w) => w.award))].sort(byAward) }))
    .sort((a, b) => b.n - a.n || a.player.localeCompare(b.player))
    .slice(0, 10);
  if (counts.length < 2) return '';
  return `<section class="aces-card lh-most">
    <h2 class="lh-h">${icon('crown')}Most awards</h2>
    <ol>${counts.map((c) => `<li><a href="player.html?name=${esc(encodeURIComponent(c.player))}">${esc(c.player)}</a><b>${c.n}</b><small>${esc(c.kinds.slice(0, 3).join(', '))}${c.kinds.length > 3 ? ` +${c.kinds.length - 3}` : ''}</small></li>`).join('')}</ol>
  </section>`;
}

function renderAwardsList() {
  const list = filtered();
  const out = $('lhAwardList');
  if (!list.length) { out.innerHTML = '<p class="aces-empty">No awards match these filters.</p>'; return; }
  out.innerHTML = `${S.f.view === 'award' ? byAwardHtml(list) : bySeasonHtml(list)}${!S.f.award ? mostHtml(list) : ''}`;
  $('lhAwardCount').textContent = `${plural(list.length, 'award')}${list.length !== S.awards.length ? ` of ${S.awards.length}` : ''}`;
}

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('tab', S.tab);
  [['season', S.f.season], ['award', S.f.award], ['q', S.f.q.trim()], ['view', S.f.view === 'award' ? 'award' : '']]
    .forEach(([k, v]) => { if (S.tab === 'awards' && v) u.searchParams.set(k, v); else u.searchParams.delete(k); });
  history.replaceState(null, '', u);
}

function renderAwards() {
  const box = $('lhAwards');
  if (!S.awards.length) { box.innerHTML = '<p class="aces-empty">No awards yet.</p>'; return; }
  const seasonIds = [...new Set(S.awards.map((a) => a.seasonId).filter(Boolean))].sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  const kinds = [...new Set(S.awards.map((a) => a.award))].sort(byAward);
  if (S.f.season && !seasonIds.includes(S.f.season)) S.f.season = '';
  if (S.f.award && !kinds.includes(S.f.award)) S.f.award = '';
  box.innerHTML = `
    <div class="lh-filters">
      <label class="lh-field"><span class="aces-label">Season</span><span class="aces-select-wrap"><select class="aces-select" data-f="season">
        <option value="">All seasons</option>${seasonIds.map((id) => `<option value="${esc(id)}"${id === S.f.season ? ' selected' : ''}>${esc(seasonLabel(id))}</option>`).join('')}
      </select></span></label>
      <label class="lh-field"><span class="aces-label">Award</span><span class="aces-select-wrap"><select class="aces-select" data-f="award">
        <option value="">All awards</option>${kinds.map((k) => `<option value="${esc(k)}"${k === S.f.award ? ' selected' : ''}>${esc(k)}</option>`).join('')}
      </select></span></label>
      <label class="lh-field is-grow"><span class="aces-label">Player or team</span><input class="aces-input" type="search" data-f="q" value="${esc(S.f.q)}" placeholder="Search" autocomplete="off"></label>
      <div class="lh-field"><span class="aces-label">Group by</span><div class="aces-segmented" role="group" aria-label="Group awards by">
        <button type="button" class="aces-segment" data-view="season" aria-pressed="${S.f.view !== 'award'}">Season</button>
        <button type="button" class="aces-segment" data-view="award" aria-pressed="${S.f.view === 'award'}">Award</button>
      </div></div>
    </div>
    <p class="lh-note" id="lhAwardCount" aria-live="polite"></p>
    <div id="lhAwardList"></div>`;
  box.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (f === 'season' || f === 'award') { S.f[f] = e.target.value; renderAwardsList(); syncUrl(); }
  });
  let t = null;
  box.addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'q') return;
    S.f.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(() => { renderAwardsList(); syncUrl(); }, 150);
  });
  box.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (!v) return;
    S.f.view = v.dataset.view;
    box.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
    renderAwardsList();
    syncUrl();
  });
  renderAwardsList();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const SECTION = { timeline: 'lhTimeline', awards: 'lhAwards' };
const LOAD = {
  timeline: async () => { S.seasons = await loadTimeline(); renderTimeline(); },
  awards: async () => { S.awards = await loadAwards(); renderAwards(); }
};

async function show(id, { push = false } = {}) {
  if (!SECTION[id]) id = 'timeline';
  S.tab = id;
  $('lhTabs').innerHTML = TABS.map((t) => `<a class="aces-tab" href="?tab=${t.id}" data-goto="${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  Object.entries(SECTION).forEach(([tab, sec]) => { $(sec).hidden = tab !== id; });
  document.title = `${id === 'awards' ? 'Awards' : 'League History'} - Mountainside Aces`;
  if (push) syncUrl();
  if (S.rendered.has(id)) return;
  S.rendered.add(id);
  const sec = $(SECTION[id]);
  sec.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  try {
    await LOAD[id]();
  } catch (err) {
    console.error(`[league history] ${id}`, err);
    S.rendered.delete(id);
    sec.innerHTML = '<p class="aces-empty">This couldn\'t be loaded. Try again in a moment.</p>';
  }
}

async function main() {
  await initPage({ title: 'League History' });
  const q = new URLSearchParams(location.search);
  S.f = {
    season: parseStatSeasonId(q.get('season') || '').id || '',
    award: q.get('award') || '',
    q: q.get('q') || '',
    view: q.get('view') === 'award' ? 'award' : 'season'
  };
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-goto]');
    if (tab && !e.metaKey && !e.ctrlKey) { e.preventDefault(); show(tab.dataset.goto, { push: true }); }
  });
  pageReady();
  await show(q.get('tab') === 'awards' ? 'awards' : 'timeline');
}

main().catch((err) => { pageReady(); showPageError(err); });
