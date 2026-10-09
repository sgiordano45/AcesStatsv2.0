// js/pages/player.js
// player.html: one page per player with Batting, Pitching, Splits, Spray,
// Badges and Awards tabs (player.html?id=<id>&tab=pitching). It replaced the
// old player.html, pitcher.html, player-splits.html and player_new.html; the
// last three forward here.
//
// Each tab is its own module, loaded the first time it opens:
//   player-batting.js   season and career tables, radial chart, career bests, single-game highs
//   player-pitching.js  season and career pitching, home/away, by opponent, game log
//   player-splits.js    batting splits (regular/playoffs, home/away, summer/fall, opponents, game log)
//   player-spray.js     batted-ball spray chart
//   player-badges.js    badges by season, with progress for the latest
//   player-awards.js    titles, awards and all-time top 10 ranks
//   player-card.js      print card and share image (loaded on click)
// Each exports render(el, ctx); ctx is built below.
//
// IDs: aggregatedPlayerStats docs are keyed by a legacy snake_case ID or an
// Auth UID. Game-level docs (playerStats, pitchingStats, playerBadges,
// sprayChartData, hitStreaks) are keyed by the legacy ID, so a UID-keyed
// player falls back to the name-derived ID for those (legacyId below).

import { initPage, pageReady, showPageState, showPageError, siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { getDisplaySeasonId } from '../core/config.js';
import { db, doc, getDoc, getDocs, updateDoc, collection, query, where, limit } from '../core/firebase.js';
import { getPlayerStatsOptimized, getAllPlayerStatsOptimized, pitchingSeasonsObjectToArray } from '../data/player-stats.js';
import { getPlayerAwards } from '../data/awards.js';
import { buildBattingRows } from '../ui/batting-stats.js';
import { formatPlayerName, fmtAvg, fmtRate } from '../ui/format.js';
import { showToast } from '../ui/toast.js';
import { seasonSortKey, seasonLabel } from '../domain/season-ids.js';
import { esc, cap, icon, teamAttr, gameTime } from './player-shared.js';

const $ = (id) => document.getElementById(id);

const TABS = [
  { id: 'batting', label: 'Batting', icon: 'bat' },
  { id: 'pitching', label: 'Pitching', icon: 'softball', when: (c) => c.hasPitching },
  { id: 'splits', label: 'Splits', icon: 'columns' },
  { id: 'spray', label: 'Spray', icon: 'target', when: (c) => c.hasSpray },
  { id: 'badges', label: 'Badges', icon: 'medal' },
  { id: 'awards', label: 'Awards', icon: 'trophy' }
];
// Old tab names in links and bookmarks.
const TAB_ALIASES = { stats: 'batting', records: 'batting' };
const MODULES = {
  batting: () => import('./player-batting.js'),
  pitching: () => import('./player-pitching.js'),
  splits: () => import('./player-splits.js'),
  spray: () => import('./player-spray.js'),
  badges: () => import('./player-badges.js'),
  awards: () => import('./player-awards.js')
};
const SECTION = { batting: 'plBatting', pitching: 'plPitching', splits: 'plSplits', spray: 'plSpray', badges: 'plBadges', awards: 'plAwards' };

// Badges are calculated from this season on.
const BADGES_FROM = '2025-fall';

let page = null;   // initPage() result
let ctx = null;
const loaded = new Set();

// ---------------------------------------------------------------------------
// Finding the player
// ---------------------------------------------------------------------------

/** Name -> legacy snake_case ID, as the badge calculator and stat pipeline write it. */
export const nameToLegacyId = (name) => String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '').replace(/\s+/g, '_');

// The whole aggregatedPlayerStats collection, read once and shared: name
// lookups, the radial chart's league maximums and the all-time ranks use it.
let allPromise = null;
const allPlayers = () => (allPromise ||= getAllPlayerStatsOptimized().catch((err) => { allPromise = null; throw err; }));

/** Same matching as resolvePlayerName() in js/data/player-stats.js, on the shared list. */
function matchName(list, searchName) {
  const lower = String(searchName || '').toLowerCase().trim();
  if (!lower) return null;
  const norm = lower.replace(/\s+/g, '_');
  const parts = lower.split(/\s+/);
  let best = null, bestScore = 0;
  for (const p of list) {
    const name = String(p.name || p.displayName || '').toLowerCase();
    if (name === lower) return p;
    if (name.replace(/\s+/g, '_') === norm && bestScore < 90) { best = p; bestScore = 90; }
    const dp = name.split(/\s+/);
    if (parts.length >= 2 && dp.length >= 2) {
      let score = 0;
      if (parts[parts.length - 1] === dp[dp.length - 1]) score += 50;
      if (parts[0] === dp[0]) score += 40;
      else if (parts[0].startsWith(dp[0]) || dp[0].startsWith(parts[0])) score += 30;
      if (score > bestScore) { best = p; bestScore = score; }
    }
  }
  return best;
}

async function getUserDoc(id) {
  try {
    const snap = await getDoc(doc(db, 'users', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch { return null; }
}

/**
 * { player } for a stats doc, { user, placeholder: true } for a signed-up
 * player with no stats yet, or null.
 */
async function resolvePlayer(idParam, nameParam) {
  if (idParam) {
    const direct = await getPlayerStatsOptimized(idParam);
    if (direct) return { player: direct };
    const user = await getUserDoc(idParam);
    if (user) {
      if (user.linkedPlayer) {
        const p = matchName(await allPlayers(), user.linkedPlayer);
        if (p) return { player: p, user };
      }
      return { user, placeholder: true };
    }
    // A legacy ID that was merged into a UID doc: john_doe matches "John Doe".
    const p = matchName(await allPlayers(), idParam);
    return p ? { player: p } : null;
  }
  const p = matchName(await allPlayers(), nameParam);
  return p ? { player: p } : null;
}

/** The users doc behind a player: linkedPlayer, then the stats ID, then display name. */
async function findLinkedUser(name, id) {
  try {
    const byLink = await getDocs(query(collection(db, 'users'), where('linkedPlayer', '==', name), limit(1)));
    if (!byLink.empty) return { id: byLink.docs[0].id, ...byLink.docs[0].data(), linked: true };
  } catch (err) { console.warn('[player] linked user lookup failed', err); }
  const direct = id ? await getUserDoc(id) : null;
  if (direct) return { ...direct, linked: true };
  try {
    const byName = await getDocs(query(collection(db, 'users'), where('displayName', '==', name), limit(1)));
    // A display-name match supplies number, bats and so on, but not photo edit rights.
    if (!byName.empty) return { id: byName.docs[0].id, ...byName.docs[0].data(), linked: false };
  } catch { /* no index or rules: fine */ }
  return null;
}

function infoFrom(user) {
  if (!user) return {};
  return {
    number: user.number || user.jerseyNumber || '',
    nickname: user.nickname || '',
    bats: user.bats || user.batting || '',
    throws: user.throws || user.throwing || '',
    position: user.position || '',
    captain: /^yes$/i.test(String(user.captain || '')),
    photo: user.playerPhotoURL || user.profilePhotoURL || user.photo || ''
  };
}

// ---------------------------------------------------------------------------
// Header data: titles, badges, tab visibility
// ---------------------------------------------------------------------------

async function loadTitles(rows) {
  const mine = rows.filter(r => !r.sub);
  if (!mine.length) return [];
  try {
    const [champs, runners] = await Promise.all([getDocs(collection(db, 'champions')), getDocs(collection(db, 'runnerUps'))]);
    const champ = {}, runner = {};
    champs.forEach(d => { const v = d.data(); if (v.seasonId) champ[v.seasonId] = String(v.team || '').toLowerCase(); });
    runners.forEach(d => { const v = d.data(); if (v.seasonId) runner[v.seasonId] = String(v.runnerUp || '').toLowerCase(); });
    const out = [];
    for (const r of mine) {
      if (champ[r.seasonId] && champ[r.seasonId] === r.teamKey) out.push({ type: 'champion', seasonId: r.seasonId, team: r.team });
      else if (runner[r.seasonId] && runner[r.seasonId] === r.teamKey) out.push({ type: 'runner-up', seasonId: r.seasonId, team: r.team });
    }
    return out.sort((a, b) => seasonSortKey(a.seasonId) - seasonSortKey(b.seasonId));
  } catch (err) {
    console.warn('[player] titles unavailable', err);
    return [];
  }
}

/** playerBadges/{seasonId}_{legacyId} for each season the player played from BADGES_FROM on, newest first. */
async function loadBadges(rows, legacyId, authUid) {
  const from = seasonSortKey(BADGES_FROM);
  const ids = new Set(rows.map(r => r.seasonId).filter(id => seasonSortKey(id) >= from));
  try { const show = await getDisplaySeasonId(); if (show) ids.add(show); } catch { /* ignore */ }
  const keys = [legacyId, authUid].filter((k, i, a) => k && a.indexOf(k) === i);
  const found = await Promise.all([...ids].map(async (sid) => {
    for (const k of keys) {
      try {
        const snap = await getDoc(doc(db, 'playerBadges', `${sid}_${k}`));
        if (snap.exists()) return { seasonId: sid, label: seasonLabel(sid), ...snap.data() };
      } catch { /* try the next key */ }
    }
    return null;
  }));
  return found.filter(b => b && Object.keys(b.earned || {}).length + Object.keys(b.progress || {}).length > 0)
    .sort((a, b) => seasonSortKey(b.seasonId) - seasonSortKey(a.seasonId));
}

// Memoized reads the tabs share.
function once(fn) {
  let p = null;
  return () => (p ||= fn().catch((err) => { p = null; throw err; }));
}

function gameDocs(coll, legacyId) {
  return once(async () => {
    const snap = await getDocs(collection(db, coll, legacyId, 'games'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => gameTime(b) - gameTime(a));
  });
}

async function checkPitching(c) {
  const stored = pitchingSeasonsObjectToArray(c.player).some(s => (Number(s.games) || 0) > 0 || (Number(s.inningsPitched) || 0) > 0);
  if (stored) return true;
  try { return (await c.pitchingGames()).length > 0; } catch { return false; }
}

async function checkSpray(c) {
  try {
    const d = await c.spray();
    return !!d && ((d.csvPlays || []).length > 0 || Object.values(d.gamePlays || {}).some(a => (a || []).length > 0));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function canEditPhoto() {
  if (!ctx?.user?.linked || !page?.user) return false;
  const acting = page.impersonating ? page.profile?.id : page.user.uid;
  return acting === ctx.user.id || hasRole(page.profile, 'admin');
}

function renderHead() {
  const c = ctx;
  const regular = c.rows.filter(r => !r.sub);
  const years = [...new Set(regular.map(r => r.seasonId.slice(0, 4)))].sort();
  const latest = regular[0] || c.rows[0];   // newest regular season, else a sub season
  const team = latest?.team || c.user?.linkedTeam || '';
  const meta = [];
  if (team) meta.push(`<a class="aces-team-chip"${teamAttr(team)} href="team.html?${esc(new URLSearchParams({ team: cap(team), ...(latest ? { season: latest.seasonId } : {}) }))}"><span class="aces-team-dot"></span>${esc(cap(team))}</a>`);
  if (c.info.position && c.info.position !== '-') meta.push(`<span>${esc(c.info.position)}</span>`);
  const bt = [c.info.bats && c.info.bats !== '-' ? `Bats ${c.info.bats}` : '', c.info.throws && c.info.throws !== '-' ? `Throws ${c.info.throws}` : ''].filter(Boolean).join(' / ');
  if (bt) meta.push(`<span>${esc(bt)}</span>`);
  if (years.length) meta.push(`<span>${regular.length} season${regular.length === 1 ? '' : 's'} (${years[0]}${years.length > 1 ? `-${years[years.length - 1]}` : ''})</span>`);
  if (c.placeholder) meta.push('<span>New player</span>');

  const career = c.player?.career || {};
  const bpis = regular.map(r => r.acesBPI).filter(v => typeof v === 'number');
  const avgBPI = typeof career.acesBPI === 'number' && career.acesBPI ? career.acesBPI : (bpis.length ? bpis.reduce((a, b) => a + b, 0) / bpis.length : null);
  // The stored career line (as the old page showed), else added up from the season rows.
  const sum = c.rows.reduce((t, r) => ({ ab: t.ab + r.atBats, h: t.h + r.hits, r: t.r + r.runs, bb: t.bb + r.walks }), { ab: 0, h: 0, r: 0, bb: 0 });
  const has = (v) => typeof v === 'number' && Number.isFinite(v);
  const t = {
    h: has(career.hits) ? career.hits : sum.h,
    r: has(career.runs) ? career.runs : sum.r,
    avg: has(career.battingAverage) && career.atBats ? career.battingAverage : (sum.ab ? sum.h / sum.ab : null),
    obp: has(career.onBasePercentage) && career.atBats ? career.onBasePercentage : (sum.ab + sum.bb ? (sum.h + sum.bb) / (sum.ab + sum.bb) : null)
  };
  const tile = (value, label) => `<div class="aces-stat"><span class="aces-stat-value">${esc(value)}</span><span class="aces-stat-label">${esc(label)}</span></div>`;
  const stats = c.placeholder ? '' : `<div class="aces-stats pl-head-stats">
    ${tile(fmtAvg(t.avg), 'Career AVG')}
    ${tile(String(t.h), 'Hits')}
    ${tile(String(t.r), 'Runs')}
    ${tile(fmtAvg(t.obp), 'Career OBP')}
    ${tile(avgBPI === null ? '-' : fmtRate(avgBPI), 'Avg AcesBPI')}
  </div>`;

  // Titles, then the best badges and awards (up to 6 chips).
  const chips = c.titles.map(t => `<a class="pl-chip ${t.type === 'champion' ? 'is-gold' : 'is-silver'}" href="champions.html">${icon(t.type === 'champion' ? 'trophy' : 'medal')}${esc(seasonLabel(t.seasonId))} ${t.type === 'champion' ? 'Champion' : 'Runner-up'}</a>`);
  const tierOrder = { gold: 0, silver: 1, bronze: 2 };
  const allBadges = c.badges.flatMap(b => Object.entries(b.earned || {}).map(([id, v]) => ({ id, ...v, seasonId: b.seasonId })))
    .sort((a, b) => (tierOrder[a.tier] ?? 3) - (tierOrder[b.tier] ?? 3) || seasonSortKey(b.seasonId) - seasonSortKey(a.seasonId));
  const room = Math.max(0, 6 - chips.length);
  const items = [
    ...allBadges.map(b => `<a class="pl-chip${b.tier ? ` is-${esc(b.tier)}` : ''}" href="?${esc(tabQuery('badges'))}" data-goto="badges">${icon('medal')}${esc(b.name || b.id)}</a>`),
    ...c.awards.map(a => `<a class="pl-chip is-award" href="?${esc(tabQuery('awards'))}" data-goto="awards">${icon('award')}${esc(a.category || 'Award')} ${esc(a.year || '')}</a>`)
  ];
  const more = items.length - room;
  chips.push(...items.slice(0, room));
  if (more > 0) chips.push(`<a class="pl-chip is-more" href="?${esc(tabQuery('badges'))}" data-goto="${allBadges.length ? 'badges' : 'awards'}">+${more} more</a>`);

  const photo = c.info.photo
    ? `<img src="${esc(c.info.photo)}" alt="" data-photo-img>`
    : `<span class="pl-photo-empty">${icon('user')}</span>`;

  $('plHead').innerHTML = `
    <div class="pl-hero"${teamAttr(team)}>
      <div class="pl-photo" title="${esc(c.name)}">
        ${photo}
        ${canEditPhoto() ? `<button type="button" class="pl-photo-edit" data-action="photo" aria-label="Change player photo">${icon('camera')}</button>` : ''}
      </div>
      <div class="pl-id">
        <span class="aces-page-kicker">Teams &amp; Players</span>
        <h1 class="pl-name">${c.info.number ? `<span class="pl-number">#${esc(c.info.number)}</span>` : ''}${esc(c.name)}</h1>
        ${c.info.nickname ? `<p class="pl-nick">"${esc(c.info.nickname)}"</p>` : ''}
        <div class="pl-meta">${meta.join('<span class="pl-sep" aria-hidden="true"></span>')}${c.info.captain ? '<span class="aces-badge is-brand">Captain</span>' : ''}</div>
      </div>
      <div class="pl-actions">
        ${c.placeholder ? '' : `<a class="aces-btn is-sm" href="compare.html?${esc(new URLSearchParams({ mode: 'players', a: c.id }))}">${icon('arrow-left-right')}Compare</a>
        <button type="button" class="aces-btn is-sm" data-action="print">${icon('print')}Print card</button>
        <button type="button" class="aces-btn is-sm" data-action="share">${icon('share')}Share card</button>`}
      </div>
    </div>
    ${stats}
    ${chips.length ? `<div class="pl-chips">${chips.join('')}</div>` : ''}`;
}

function renderRelated() {
  const c = ctx;
  const latest = c.rows.find(r => !r.sub) || c.rows[0];
  const team = latest?.team;
  const links = [
    !c.placeholder && [`compare.html?${new URLSearchParams({ mode: 'players', a: c.id })}`, 'arrow-left-right', 'Compare with another player'],
    ['leaders.html', 'trophy', 'League leaders'],
    team && [`team.html?${new URLSearchParams({ team, season: latest.seasonId })}`, 'shield', `${team} ${seasonLabel(latest.seasonId)}`],
    ['players.html', 'users', 'All players']
  ].filter(Boolean);
  $('plRelated').innerHTML = `<span class="pl-related-label">See also</span>${links.map(([href, ic, label]) => `<a href="${esc(href)}">${icon(ic)}${esc(label)}</a>`).join('')}`;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function tabs() {
  return TABS.filter(t => !t.when || t.when(ctx)).filter(t => !ctx.placeholder || t.id === 'batting');
}

function tabQuery(id) {
  const q = new URLSearchParams(location.search);
  q.set('tab', id);
  return q.toString();
}

function currentTab() {
  const raw = new URLSearchParams(location.search).get('tab') || location.hash.slice(1) || 'batting';
  const id = TAB_ALIASES[raw] || raw;
  return tabs().some(t => t.id === id) ? id : 'batting';
}

async function show(id, { push = false } = {}) {
  if (!tabs().some(t => t.id === id)) id = 'batting';
  if (push) {
    const q = new URLSearchParams(location.search);
    if (id === 'batting') q.delete('tab'); else q.set('tab', id);
    history.replaceState({}, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
  }
  $('plTabs').innerHTML = tabs().map(t => `<a class="aces-tab" href="?${esc(tabQuery(t.id))}" data-goto="${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  Object.entries(SECTION).forEach(([tab, sec]) => { $(sec).hidden = tab !== id; });
  if (loaded.has(id)) return;
  loaded.add(id);
  const el = $(SECTION[id]);
  el.innerHTML = '<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></section>';
  try {
    const mod = await MODULES[id]();
    await mod.render(el, ctx);
  } catch (err) {
    console.error(`[player] ${id} tab failed`, err);
    loaded.delete(id);
    el.innerHTML = `<section class="aces-card"><div class="aces-empty">${icon('alert-circle')}<p class="aces-empty-title">This tab could not load</p><p>Check your connection and try again.</p>
      <button type="button" class="aces-btn is-sm" data-retry="${id}">${icon('refresh')}Try again</button></div></section>`;
  }
}

// ---------------------------------------------------------------------------
// Photo upload (the linked player or an admin)
// ---------------------------------------------------------------------------

async function uploadPhoto(file) {
  if (!file || !canEditPhoto()) return;
  if (!file.type.startsWith('image/')) return showToast('Choose an image file.', 'info');
  if (file.size > 5 * 1024 * 1024) return showToast('Player photos must be under 5 MB.', 'info');
  const btn = document.querySelector('[data-action="photo"]');
  if (btn) btn.disabled = true;
  try {
    const { uploadPlayerPhoto, deleteOldPlayerPhoto } = await import('../../firebase-storage.js');
    const uid = ctx.user.id;
    const result = await uploadPlayerPhoto(file, uid, () => {});
    const ref = doc(db, 'users', uid);
    const old = (await getDoc(ref)).data()?.playerPhotoStoragePath;
    if (old) { try { await deleteOldPlayerPhoto(old); } catch (err) { console.warn('[player] old photo not deleted', err); } }
    await updateDoc(ref, { playerPhotoURL: result.downloadURL, playerPhotoStoragePath: result.storagePath, playerPhotoUpdatedAt: new Date() });
    ctx.info.photo = result.downloadURL;
    renderHead();
    showToast('Photo updated.', 'success');
  } catch (err) {
    console.error('[player] photo upload failed', err);
    showToast('The photo could not be uploaded.', 'error');
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function wire() {
  document.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-goto]');
    if (go && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      await show(go.dataset.goto, { push: true });
      if (go.closest('#plHead')) $('plTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const retry = e.target.closest('[data-retry]');
    if (retry) return show(retry.dataset.retry);
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (act === 'photo') return $('plPhotoInput').click();
    if (act === 'print' || act === 'share') {
      const btn = e.target.closest('[data-action]');
      btn.disabled = true;
      try {
        const card = await import('./player-card.js');
        await (act === 'print' ? card.printCard(ctx) : card.shareCard(ctx));
      } catch (err) {
        console.error('[player] card failed', err);
        showToast('The card could not be made. Try again.', 'error');
      } finally { btn.disabled = false; }
    }
  });
  $('plPhotoInput').addEventListener('change', (e) => { uploadPhoto(e.target.files[0]); e.target.value = ''; });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-photo-img]')) e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'pl-photo-empty', innerHTML: icon('user') }));
  }, true);
  window.addEventListener('popstate', () => show(currentTab()));
}

// ---------------------------------------------------------------------------

async function main() {
  page = await initPage({ title: 'Player' });
  const params = new URLSearchParams(location.search);
  const idParam = params.get('id');
  const nameParam = params.get('name');
  const missing = (title, message) => {
    pageReady();
    showPageState({ title, message, actions: [{ label: 'Browse players', href: siteUrl('players.html'), primary: true }] });
  };
  if (!idParam && !nameParam) return missing('No player picked', 'Choose a player from the players page.');

  const found = await resolvePlayer(idParam, nameParam);
  if (!found) return missing('Player not found', `We couldn't find a player matching "${nameParam || idParam}".`);

  const player = found.player || null;
  const name = formatPlayerName(player ? (player.name || player.displayName) : (found.user.displayName || found.user.preferredDisplayName || found.user.linkedPlayer || 'New player'));
  const id = player ? player.id : found.user.id;
  if (nameParam && !idParam && player) {
    params.delete('name');
    params.set('id', id);
    history.replaceState({}, '', `${location.pathname}?${params}`);
  }
  document.title = `${name} - Mountainside Aces`;

  // Firebase UIDs are 28 mixed-case characters; game-level docs use the name-derived ID instead.
  const isUid = id.length > 20 && /[A-Z]/.test(id);
  const legacyId = isUid ? nameToLegacyId(name) : id;
  const rows = player ? buildBattingRows([player]) : [];

  const user = found.user ? { ...found.user, linked: true } : await findLinkedUser(name, id);

  ctx = {
    page, id, name, player, rows, legacyId,
    authUid: isUid ? id : null,
    placeholder: !!found.placeholder,
    user,
    info: infoFrom(user),
    awards: [], titles: [], badges: [],
    hasPitching: false, hasSpray: false,
    allPlayers,
    // Batting game docs and the 2025 splits doc have always been read by the name-derived ID.
    nameId: nameToLegacyId(name),
    battingGames: gameDocs('playerStats', nameToLegacyId(name)),
    pitchingGames: gameDocs('pitchingStats', legacyId),
    spray: once(async () => { const s = await getDoc(doc(db, 'sprayChartData', legacyId)); return s.exists() ? s.data() : null; }),
    goto: (tab) => show(tab, { push: true })
  };

  if (!ctx.placeholder) {
    const [awards, titles, badges, hasPitching, hasSpray] = await Promise.all([
      getPlayerAwards(name).catch(() => []),
      loadTitles(rows),
      loadBadges(rows, legacyId, ctx.authUid).catch(() => []),
      checkPitching(ctx),
      checkSpray(ctx)
    ]);
    Object.assign(ctx, { awards, titles, badges, hasPitching, hasSpray });
  }

  renderHead();
  renderRelated();
  wire();
  await show(currentTab());
  pageReady();
}

main().catch((err) => { pageReady(); showPageError(err); });
