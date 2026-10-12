// js/pages/trophy-case.js
// trophy-case.html: one season's badges (from 2025 Fall, when the badge
// calculator started). Tier counts, the player leaderboard (searchable, by
// team), the team medal table, badges earned most recently, and every badge by
// kind with how many players earned it; a badge opens its list of earners.
//
// URL: trophy-case.html?seasonId=2026-summer
// Data: playerBadges/season_{id} (summary, isPartialData) and
// playerBadges/{id}_{legacyId} (one per player: playerName, teamId, earned),
// written by the badge calculator (admin). Names, tiers and images come from
// BADGE_DEFINITIONS in badge-calculator.js.

import { initPage, pageReady, showPageError, siteUrl } from '../core/app.js';
import { getSeasonRange, getDisplaySeasonId } from '../core/config.js';
import { db, collection, doc, getDoc, getDocs, query, where, documentId } from '../core/firebase.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { seasonLabel, parseStatSeasonId } from '../domain/season-ids.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => { const t = String(s || '').replace(/_/g, ' ').trim(); return /[A-Z]/.test(t) ? t : t.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()); };
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const FIRST_SEASON = '2025-fall';
const PARTIAL = new Set(['2025-fall']);
const TIERS = ['gold', 'silver', 'bronze'];
const GROUPS = [
  ['hitting', 'Hitting', 'bat'],
  ['pitching', 'Pitching', 'softball'],
  ['two-way', 'Two-way', 'arrow-left-right'],
  ['milestone', 'Milestones', 'flag']
];
const LEADER_ROWS = 10;

let DEFS = {};
const S = { sid: '', summary: null, players: [], q: '', team: '', all: false, cache: new Map() };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chip(team) {
  if (!team) return '';
  const name = cap(team);
  const k = name.toLowerCase();
  return `<a class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''} href="team.html?${esc(new URLSearchParams({ team: name }).toString())}"><span class="aces-team-dot"></span>${esc(name)}</a>`;
}

const playerHref = (p) => `player.html?${new URLSearchParams(p.id ? { id: p.id, tab: 'badges' } : { name: p.name, tab: 'badges' })}`;

function art(id, tier, cls = '') {
  const def = DEFS[id] || {};
  const base = String(def.iconPath || '').replace(/^\//, '').replace(/\.png$/, '');
  const src = base ? siteUrl(`${base}${def.type === 'tiered' && tier ? `-${tier}` : ''}.png`) : '';
  return `<span class="tc-art ${cls}"${tier ? ` data-tier="${esc(tier)}"` : ''}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" data-badge-img>` : icon('medal')}</span>`;
}

function badgeName(id, tier) {
  const def = DEFS[id] || {};
  return (tier && def.tiers?.[tier]?.name) || def.name || id;
}

function badgeText(id, tier) {
  const def = DEFS[id] || {};
  return (tier && def.tiers?.[tier]?.description) || def.description || '';
}

function valueText(id, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return v.hits !== undefined && v.ip !== undefined ? `${v.hits} H, ${v.ip} IP` : '';
  const units = { hitStreak: 'game streak', multiHitGames: 'hits', seasonHits: 'hits', seasonRuns: 'runs', seasonWalks: 'walks', bigGames: 'runs', scorelessOutings: 'outings', seasonInnings: 'IP', lowRunGames: 'games', theArchitect: 'games' };
  return units[id] ? `${v} ${units[id]}` : String(v);
}

function toDate(v) {
  if (!v) return null;
  const d = typeof v.toDate === 'function' ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadSeason(sid) {
  if (S.cache.has(sid)) return S.cache.get(sid);
  const [summarySnap, playersSnap] = await Promise.all([
    getDoc(doc(db, 'playerBadges', `season_${sid}`)).catch(() => null),
    getDocs(query(collection(db, 'playerBadges'), where(documentId(), '>=', `${sid}_`), where(documentId(), '<', `${sid}_\uf8ff`)))
  ]);
  const players = playersSnap.docs.map((d) => {
    const v = d.data();
    const earned = Object.entries(v.earned || {}).map(([id, b]) => ({
      id: b.badgeId || id, tier: TIERS.includes(b.tier) ? b.tier : '', hidden: !!b.hidden,
      name: b.name || '', description: b.description || '', value: b.value,
      when: toDate(b.earnedAt || b.gameDate || v.calculatedAt)
    }));
    const count = (t) => earned.filter((b) => b.tier === t).length;
    return {
      id: d.id.slice(sid.length + 1),
      name: v.playerName || v.name || '',
      team: v.teamId || v.team || '',
      earned,
      gold: count('gold'), silver: count('silver'), bronze: count('bronze'),
      hidden: earned.filter((b) => b.hidden).length,
      total: earned.length
    };
  }).filter((p) => p.total);
  const data = { summary: summarySnap?.exists() ? summarySnap.data() : null, players };
  S.cache.set(sid, data);
  return data;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function tilesHtml() {
  const sum = (k) => S.players.reduce((n, p) => n + p[k], 0);
  const tiles = [
    ['Badges earned', sum('total'), plural(S.players.length, 'player')],
    ['Gold', sum('gold'), ''],
    ['Silver', sum('silver'), ''],
    ['Bronze', sum('bronze'), ''],
    ['Hidden found', sum('hidden'), '']
  ];
  return tiles.map(([label, v, meta], i) => `<div class="aces-stat tc-tile"${i >= 1 && i <= 3 ? ` data-tier="${TIERS[i - 1]}"` : ''}>
    <span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${i >= 1 && i <= 3 ? '<span class="tc-dot"></span>' : ''}${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}
  </div>`).join('');
}

const medals = (p) => TIERS.map((t) => (p[t] ? `<span class="tc-medal" data-tier="${t}" title="${p[t]} ${t}"><span class="tc-dot"></span>${p[t]}</span>` : '')).join('');

function ranked(list) {
  return [...list].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || b.total - a.total || a.name.localeCompare(b.name));
}

function leaderRows() {
  const q = S.q.trim().toLowerCase();
  const all = ranked(S.players);
  const rank = new Map(all.map((p, i) => [p, i + 1]));
  const list = all.filter((p) => (!S.team || p.team.toLowerCase() === S.team) && (!q || p.name.toLowerCase().includes(q)));
  const shown = S.all || q || S.team ? list : list.slice(0, LEADER_ROWS);
  const body = shown.length ? shown.map((p) => `<li>
      <span class="tc-rank${rank.get(p) <= 3 ? ' is-top' : ''}">${rank.get(p)}</span>
      <span class="tc-who"><a href="${esc(playerHref(p))}">${esc(p.name)}</a>${chip(p.team)}</span>
      <span class="tc-medals">${medals(p)}${p.hidden ? `<span class="tc-medal is-hidden" title="${p.hidden} hidden">${icon('sparkles')}${p.hidden}</span>` : ''}</span>
      <b class="tc-total">${p.total}</b>
    </li>`).join('') : '<li class="tc-none">No players match.</li>';
  const more = !q && !S.team && list.length > LEADER_ROWS
    ? `<button type="button" class="aces-btn is-sm is-ghost tc-more" data-more>${S.all ? 'Show top 10' : `Show all ${list.length}`}</button>` : '';
  return `<ol class="tc-leaders">${body}</ol>${more}`;
}

function leaderHtml() {
  const teams = [...new Set(S.players.map((p) => p.team.toLowerCase()).filter(Boolean))].sort();
  return `<section class="aces-card tc-board">
    <h2 class="tc-h">${icon('trophy')}Leaderboard</h2>
    <div class="tc-filters">
      <input class="aces-input" type="search" data-f="q" value="${esc(S.q)}" placeholder="Find a player" aria-label="Find a player" autocomplete="off">
      <span class="aces-select-wrap"><select class="aces-select" data-f="team" aria-label="Team">
        <option value="">All teams</option>${teams.map((t) => `<option value="${esc(t)}"${t === S.team ? ' selected' : ''}>${esc(cap(t))}</option>`).join('')}
      </select></span>
    </div>
    <div data-leaders>${leaderRows()}</div>
    <p class="tc-note">Ranked by gold, then silver, then bronze.</p>
  </section>`;
}

function teamsHtml() {
  const by = new Map();
  S.players.forEach((p) => {
    const k = p.team.toLowerCase();
    if (!k) return;
    if (!by.has(k)) by.set(k, { team: p.team, gold: 0, silver: 0, bronze: 0, total: 0, players: 0 });
    const t = by.get(k);
    TIERS.forEach((x) => { t[x] += p[x]; });
    t.total += p.total;
    t.players += 1;
  });
  const rows = ranked([...by.values()].map((t) => ({ ...t, name: t.team })));
  if (!rows.length) return '';
  return `<section class="aces-card">
    <h2 class="tc-h">${icon('medal')}Team medal table</h2>
    <div class="aces-table-wrap"><table class="aces-table is-compact tc-table">
      <thead><tr><th scope="col">#</th><th scope="col">Team</th>${TIERS.map((t) => `<th scope="col" data-tier="${t}"><span class="tc-dot"></span><span class="u-sr-only">${capFirst(t)}</span></th>`).join('')}<th scope="col">Total</th></tr></thead>
      <tbody>${rows.map((t, i) => `<tr>
        <td>${i + 1}</td><th scope="row">${chip(t.team)}</th>
        ${TIERS.map((x) => `<td>${t[x] || '-'}</td>`).join('')}<td><b>${t.total}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function recentHtml() {
  const items = S.players.flatMap((p) => p.earned.map((b) => ({ p, b }))).filter((x) => x.b.when)
    .sort((a, b) => b.b.when - a.b.when).slice(0, 8);
  if (!items.length) return '';
  return `<section class="aces-card">
    <h2 class="tc-h">${icon('sparkles')}Recently earned</h2>
    <ul class="tc-recent">${items.map(({ p, b }) => `<li>
      ${art(b.id, b.tier, 'is-sm')}
      <span class="tc-recent-body"><a href="${esc(playerHref(p))}">${esc(p.name)}</a> ${b.hidden ? 'unlocked' : 'earned'} <b>${esc(b.name || badgeName(b.id, b.tier))}</b>${b.tier ? ` <span class="tc-tier" data-tier="${b.tier}">${capFirst(b.tier)}</span>` : ''}
        <small>${esc(b.description || badgeText(b.id, b.tier))}</small></span>
      <time>${esc(b.when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</time>
    </li>`).join('')}</ul>
  </section>`;
}

function earnersOf(id, tier) {
  return S.players.flatMap((p) => p.earned.filter((b) => b.id === id && (!tier || b.tier === tier)).map((b) => ({ p, b })));
}

function badgesHtml() {
  const defs = Object.values(DEFS);
  const groups = GROUPS.map(([key, label, ic]) => {
    const cards = defs.filter((d) => d.category === key).flatMap((d) => (d.type === 'tiered' ? TIERS.map((t) => [d, t]) : [[d, '']]))
      .map(([d, t]) => {
        const n = earnersOf(d.id, t).length;
        return `<button type="button" class="tc-badge${n ? '' : ' is-none'}"${t ? ` data-tier="${t}"` : ''} data-badge="${esc(d.id)}" data-badge-tier="${t}">
          ${art(d.id, t)}
          <span class="tc-badge-name">${esc(badgeName(d.id, t))}</span>
          <span class="tc-badge-sub">${t ? capFirst(t) : 'Elite'} &middot; ${plural(n, 'player')}</span>
        </button>`;
      }).join('');
    return cards ? `<div class="tc-group"><h3>${icon(ic)}${esc(label)}</h3><div class="tc-badges">${cards}</div></div>` : '';
  }).join('');
  const hidden = defs.filter((d) => d.category === 'hidden');
  const found = hidden.filter((d) => earnersOf(d.id, '').length);
  const hiddenHtml = hidden.length ? `<div class="tc-group"><h3>${icon('lock')}Hidden <span>${found.length} of ${hidden.length} found</span></h3>
    <div class="tc-hidden">${hidden.map((d) => (earnersOf(d.id, '').length
      ? `<button type="button" class="tc-slot is-found" data-badge="${esc(d.id)}" data-badge-tier="" title="${esc(d.name)}">${art(d.id, '')}</button>`
      : `<span class="tc-slot" title="Not found yet">${icon('help')}</span>`)).join('')}</div></div>` : '';
  return `<section class="aces-card">
    <h2 class="tc-h">${icon('grid')}Every badge</h2>
    <p class="tc-note">Tap a badge to see who earned it.</p>
    ${groups}${hiddenHtml}
  </section>`;
}

function openBadge(id, tier) {
  const def = DEFS[id] || {};
  const earners = earnersOf(id, tier).sort((a, b) => (Number(b.b.value) || 0) - (Number(a.b.value) || 0) || a.p.name.localeCompare(b.p.name));
  const other = def.type === 'tiered' && tier ? TIERS.filter((t) => t !== tier) : [];
  let next = null;
  const body = document.createElement('div');
  body.className = 'tc-detail';
  body.innerHTML = `<div class="tc-detail-head">${art(id, tier, 'is-lg')}
      <div>${tier ? `<span class="tc-tier" data-tier="${tier}">${capFirst(tier)}</span>` : ''}<p>${esc(badgeText(id, tier))}</p></div></div>
    <h3>${earners.length ? `Earned by ${plural(earners.length, 'player')}` : 'Nobody has earned this yet'}</h3>
    ${earners.length ? `<ul class="tc-earners">${earners.map(({ p, b }) => `<li><a href="${esc(playerHref(p))}">${esc(p.name)}</a>${chip(p.team)}${valueText(id, b.value) ? `<small>${esc(valueText(id, b.value))}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${other.length ? `<div class="tc-other">${other.map((t) => `<button type="button" class="aces-btn is-sm is-ghost" data-other="${t}"><span class="tc-dot" data-tier="${t}"></span>${esc(badgeName(id, t))}</button>`).join('')}</div>` : ''}`;
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-other]');
    if (!b) return;
    next = b.dataset.other;
    body.closest('.aces-modal')?.querySelector('.aces-modal-x')?.click();
  });
  openModal({ title: badgeName(id, tier), body, actions: [{ label: 'Close', value: true, variant: 'primary' }] })
    .then(() => { if (next) openBadge(id, next); });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function show(sid, { push = false } = {}) {
  S.sid = sid;
  $('tcSeason').value = sid;
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('seasonId', sid);
    history.replaceState(null, '', u);
  }
  const box = $('tcBody');
  box.innerHTML = '<div class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
  let data;
  try {
    data = await loadSeason(sid);
  } catch (err) {
    console.error('[trophy case] season', err);
    box.innerHTML = '<p class="aces-empty">Badges couldn\'t be loaded. Try again in a moment.</p>';
    return;
  }
  if (S.sid !== sid) return;
  S.summary = data.summary;
  S.players = data.players;
  S.all = false;
  if (S.team && !S.players.some((p) => p.team.toLowerCase() === S.team)) S.team = '';
  if (!S.players.length) {
    box.innerHTML = `<div class="aces-empty tc-empty">${icon('medal')}<p><b>No badges for ${esc(seasonLabel(sid))} yet.</b><br>Badges show up here once the season's games are processed.</p></div>`;
    return;
  }
  const partial = S.summary?.isPartialData || PARTIAL.has(sid);
  box.innerHTML = `
    ${partial ? `<div class="aces-notice is-warning tc-partial">${icon('info')}<div><b>Partial season.</b> ${esc(seasonLabel(sid))} badges come from incomplete game-by-game data, so not every game or player is counted. Full badge tracking starts with 2026 Summer.</div></div>` : ''}
    <div class="aces-stats tc-tiles">${tilesHtml()}</div>
    <div class="tc-two">${leaderHtml()}<div class="tc-stack">${teamsHtml()}${recentHtml()}</div></div>
    ${badgesHtml()}`;
}

async function main() {
  await initPage({ title: 'Trophy Case' });
  let seasons = [];
  try {
    [seasons] = await Promise.all([
      getSeasonRange(FIRST_SEASON).catch(() => []),
      import('../../badge-calculator.js').then((m) => { DEFS = m.BADGE_DEFINITIONS || {}; }).catch((err) => console.warn('[trophy case] badge definitions unavailable', err))
    ]);
    if (!seasons.length) {
      const id = (await getDisplaySeasonId().catch(() => null)) || FIRST_SEASON;
      seasons = [{ id }];
    }
  } catch (err) {
    showPageError(err);
    return;
  }
  $('tcSeason').innerHTML = seasons.map((s) => `<option value="${esc(s.id)}">${esc(seasonLabel(s.id))}${PARTIAL.has(s.id) ? ' (partial)' : ''}</option>`).join('');
  $('tcSeason').addEventListener('change', (e) => show(e.target.value, { push: true }));

  const box = $('tcBody');
  let t = null;
  const redraw = () => { const el = box.querySelector('[data-leaders]'); if (el) el.innerHTML = leaderRows(); };
  box.addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'q') return;
    S.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(redraw, 120);
  });
  box.addEventListener('change', (e) => { if (e.target.dataset.f === 'team') { S.team = e.target.value; redraw(); } });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { S.all = !S.all; redraw(); return; }
    const b = e.target.closest('[data-badge]');
    if (b) openBadge(b.dataset.badge, b.dataset.badgeTier || '');
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-badge-img]')) {
      const span = document.createElement('span');
      span.innerHTML = icon('medal');
      e.target.replaceWith(span.firstElementChild);
    }
  }, true);

  const want = parseStatSeasonId(new URLSearchParams(location.search).get('seasonId') || new URLSearchParams(location.search).get('season') || '').id;
  const display = await getDisplaySeasonId().catch(() => null);
  const first = seasons.find((s) => s.id === want)?.id || seasons.find((s) => s.id === display)?.id || seasons[0].id;
  pageReady();
  await show(first);
}

main().catch((err) => { pageReady(); showPageError(err); });
