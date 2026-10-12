// js/pages/pickem.js
// pickem.html (signed-in): weekly Pick'em on every game of the current season.
//
//   My picks        this week's games by day. Tap a team (or Tie, from
//                   TIE_FROM on) to pick, tap it again to clear. Saves at once.
//   Week board      the week's leaderboard and, once a game locks, how many
//                   picked each side (counts only, never who).
//   Season          season standings. Admins (their own profile, not View As)
//                   also get a Paid column that only they can see.
//   Rules           how scoring works.
//
// URL: ?tab=week|season|rules&week=N
// Data: pickem/{seasonId}/entries/{uid} = { uid, displayName, seasonId,
// updatedAt, picks: { gameId: { team, at } } }; pickem/{seasonId}/private/payments
// = { paid: { uid: { paid, name, at } } } (admin-only by the Firestore rules).
// Scoring lives in js/domain/pickem.js.

import { initPage, pageReady, showPageError, showPageState } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, serverTimestamp, FieldPath } from '../core/firebase.js';
import { getCurrentSeason } from '../data/seasons.js';
import { getSeasonGames } from '../data/index.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { seasonLabel } from '../domain/season-ids.js';
import {
  TIE, TIE_FROM, TIE_POINTS, normalizeGame, isLocked, isGraded, splitFor, isUpset,
  pickPoints, scoreGames, buildWeeks, dow, dpKey, addDays
} from '../domain/pickem.js';

const $ = (id) => document.getElementById(id);
const TZ = 'America/New_York';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TABS = [
  ['picks', 'My picks', 'check-circle'],
  ['week', 'Week board', 'users'],
  ['season', 'Season', 'trophy'],
  ['rules', 'Rules', 'book']
];

const S = {
  uid: '', name: '', admin: false, season: null,
  games: [], byId: {}, weeks: [], week: 0, entries: {},
  tab: 'picks', payments: null, paymentsLoading: false
};

const shortDate = (dp) => `${MONTHS[dp.m]} ${dp.day}`;
const tieDate = (() => { const [y, m, d] = TIE_FROM.split('-').map(Number); return shortDate({ y, m: m - 1, day: d }); })();
const fmtLock = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function countdown(ms) {
  const s = Math.max(Math.floor(ms / 1000), 0);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const colorAttr = (name) => {
  const k = String(name || '').toLowerCase();
  return TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : '';
};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function load() {
  const season = await getCurrentSeason();
  if (!season) return null;
  const [raw, snap] = await Promise.all([
    getSeasonGames(season.id),
    getDocs(collection(db, 'pickem', season.id, 'entries'))
  ]);
  const games = (raw || []).map(normalizeGame).filter(Boolean)
    .sort((a, b) => (a.lockAt - b.lockAt) || a.homeName.localeCompare(b.homeName));
  const entries = {};
  snap.forEach((d) => {
    const data = d.data();
    const picks = {};
    Object.entries(data.picks || {}).forEach(([gid, p]) => {
      if (p) picks[gid] = { team: p.team, atMs: p.at?.toMillis ? p.at.toMillis() : null };
    });
    entries[d.id] = { displayName: data.displayName || 'Unknown', picks };
  });
  return { season, games, entries };
}

function defaultWeek() {
  const now = Date.now();
  const i = S.weeks.findIndex((w) => w.games.some((g) => g.lockAt > now && !g.cancelled));
  return i === -1 ? S.weeks.length - 1 : i;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('tab');
  u.searchParams.delete('week');
  if (S.tab !== 'picks') u.searchParams.set('tab', S.tab);
  if ((S.tab === 'picks' || S.tab === 'week') && S.week !== defaultWeek()) u.searchParams.set('week', String(S.weeks[S.week].num));
  history.replaceState(null, '', u);
}

function render() {
  $('pkTabs').innerHTML = TABS.map(([id, label, ic]) =>
    `<a class="aces-tab" href="?tab=${id}" data-goto="${id}"${id === S.tab ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  TABS.forEach(([id]) => { $(`pk-${id}`).hidden = id !== S.tab; });
  const weekly = S.tab === 'picks' || S.tab === 'week';
  $('pkWeek').hidden = !weekly;
  if (weekly) renderWeekNav();
  if (S.tab === 'picks') renderPicks();
  if (S.tab === 'week') renderWeekBoard();
  if (S.tab === 'season') renderSeason();
  if (S.tab === 'rules') renderRules();
  syncUrl();
}

function renderWeekNav() {
  const w = S.weeks[S.week];
  $('pkWeek').innerHTML = `
    <button type="button" class="aces-btn is-icon" data-week="-1" aria-label="Previous week"${S.week === 0 ? ' disabled' : ''}>${icon('chevron-left')}</button>
    <div class="pk-week-title">
      <strong>Week ${w.num}${w.allPlayoff ? ' <span class="aces-badge is-accent">Playoffs</span>' : ''}</strong>
      <span>${shortDate(w.start)} - ${shortDate(addDays(w.start, 6))} &middot; ${plural(w.games.length, 'game')}</span>
    </div>
    <button type="button" class="aces-btn is-icon" data-week="1" aria-label="Next week"${S.week === S.weeks.length - 1 ? ' disabled' : ''}>${icon('chevron-right')}</button>`;
}

// ---- My picks --------------------------------------------------------------

function renderPicks() {
  const w = S.weeks[S.week];
  const mine = S.entries[S.uid]?.picks || {};
  const now = Date.now();
  const pickable = w.games.filter((g) => !g.isTBD && !g.cancelled);
  const made = pickable.filter((g) => mine[g.id]?.team).length;
  const me = scoreGames(S.entries, w.games).find((r) => r.uid === S.uid) || { pts: 0, correct: 0, wrong: 0 };
  const next = pickable.filter((g) => g.lockAt > now).sort((a, b) => a.lockAt - b.lockAt)[0];
  const open = pickable.filter((g) => g.lockAt > now && !mine[g.id]?.team).length;

  let html = `<div class="aces-stats pk-summary">
    <div class="aces-stat"><span class="aces-stat-value">${me.pts}</span><span class="aces-stat-label">Points</span></div>
    <div class="aces-stat"><span class="aces-stat-value">${me.correct}-${me.wrong}</span><span class="aces-stat-label">Record</span></div>
    <div class="aces-stat"><span class="aces-stat-value">${made}/${pickable.length}</span><span class="aces-stat-label">Picks made</span></div>
    <div class="aces-stat"><span class="aces-stat-value">${next ? countdown(next.lockAt - now) : '-'}</span><span class="aces-stat-label">Next lock</span>${next ? `<span class="aces-stat-meta">${esc(fmtLock(next.lockAt))}</span>` : ''}</div>
  </div>`;
  if (open) html += `<p class="aces-notice is-warning pk-open">${icon('clock')}<span>${plural(open, 'open game')} without a pick this week.</span></p>`;

  let day = '';
  w.games.forEach((g) => {
    const k = dpKey(g.dp);
    if (k !== day) {
      if (day) html += '</div>';
      html += `<h2 class="pk-day">${DAYS[dow(g.dp)]}, ${shortDate(g.dp)}</h2><div class="pk-games">`;
      day = k;
    }
    html += gameCard(g, mine[g.id]);
  });
  if (day) html += '</div>';
  else html += '<div class="aces-empty"><p class="aces-empty-title">No games this week.</p></div>';
  $('pk-picks').innerHTML = html;
}

function statusBadge(g) {
  if (g.cancelled) return '<span class="aces-badge is-outline">Postponed</span>';
  if (g.isFinal && g.isVoid) return `<span class="aces-badge is-outline">${g.isForfeit ? 'Forfeit' : 'Tie'} &middot; no contest</span>`;
  if (g.isFinal) return `<span class="aces-badge">Final${g.winnerKey === TIE ? ' &middot; Tie' : ''}</span>`;
  if (isLocked(g)) return `<span class="aces-badge is-alert">${icon('lock')}Locked</span>`;
  if (g.isTBD) return '<span class="aces-badge is-outline">Matchup TBD</span>';
  return `<span class="aces-badge is-outline">${icon('clock')}Locks ${esc(fmtLock(g.lockAt))}</span>`;
}

function splitBar(g, s, { labels = true } = {}) {
  if (!s.total) return '';
  const pc = (n) => Math.round(100 * n / s.total);
  const seg = (n, attr, cls = '') => (n ? `<span class="pk-seg${cls}"${attr} style="width:${pc(n)}%"></span>` : '');
  const bar = `<div class="pk-bar" aria-hidden="true">${seg(s.away, colorAttr(g.awayName))}${seg(s.tie, '', ' is-tie')}${seg(s.home, colorAttr(g.homeName))}</div>`;
  if (!labels) return bar;
  return `<div class="pk-split">${bar}<div class="pk-split-labels">
    <span>${esc(g.awayName)} ${pc(s.away)}% (${s.away})</span>
    ${g.tiesAllowed ? `<span>Tie ${pc(s.tie)}% (${s.tie})</span>` : ''}
    <span>${esc(g.homeName)} ${pc(s.home)}% (${s.home})</span></div></div>`;
}

function gameCard(g, myPick) {
  const locked = isLocked(g);
  const done = locked || g.isFinal;
  const mine = myPick?.team || null;
  const late = !!(myPick && myPick.atMs && myPick.atMs > g.lockAt);
  const disabled = locked || g.isTBD || g.cancelled;
  const graded = isGraded(g);
  const dis = disabled ? ' disabled' : '';

  const mark = (key) => (mine === key && graded
    ? `<span class="pk-mark ${g.winnerKey === key ? 'is-win' : 'is-loss'}">${icon(g.winnerKey === key ? 'check' : 'close')}<span class="u-sr-only">${g.winnerKey === key ? 'Correct' : 'Missed'}</span></span>`
    : '');

  const team = (key, name, side, score) => {
    const picked = mine === key;
    const won = g.isFinal && g.winnerKey === key;
    const cls = `pk-pick${picked ? ' is-picked' : ''}${mine && !picked && done ? ' is-dim' : ''}`;
    return `<button type="button" class="${cls}"${colorAttr(name)} data-pick="${esc(key)}" data-game="${esc(g.id)}" aria-pressed="${picked}"${dis}>
      <span class="pk-side">${side}</span>
      <span class="pk-team"><span class="aces-team-dot"></span>${esc(name)}</span>
      ${g.isFinal && score !== null && score !== '' ? `<span class="pk-score${won ? ' is-won' : ''}">${esc(score)}</span>` : ''}
      ${mark(key)}
    </button>`;
  };

  const middle = g.tiesAllowed
    ? `<button type="button" class="pk-pick is-tie${mine === TIE ? ' is-picked' : ''}${mine && mine !== TIE && done ? ' is-dim' : ''}" data-pick="${TIE}" data-game="${esc(g.id)}" aria-pressed="${mine === TIE}" title="Pick a tie: ${TIE_POINTS} points if it ends tied"${dis}>
        <span class="pk-side">or</span><span class="pk-team">Tie</span>${mark(TIE)}
      </button>`
    : '<span class="pk-at" aria-hidden="true">@</span>';

  let below = '';
  if (locked && !g.isTBD && !g.cancelled) below += splitBar(g, splitFor(S.entries, g));
  if (late) {
    below += `<p class="pk-result">${icon('alert-circle')}Pick saved after first pitch, so it doesn't count.</p>`;
  } else if (graded && mine) {
    const { pts, bonus } = pickPoints(S.entries, g, mine);
    below += pts
      ? `<p class="pk-result is-win">${icon('check-circle')}+${plural(pts, 'pt')}${bonus ? ` <span class="aces-badge is-accent">${icon(bonus === 'tie' ? 'handshake' : 'zap')}${bonus === 'tie' ? 'Tie bonus' : 'Upset bonus'}</span>` : ''}</p>`
      : `<p class="pk-result is-loss">${icon('x-circle')}Missed</p>`;
  } else if (locked && !mine && !g.isTBD && !g.cancelled && !g.isVoid) {
    below += '<p class="pk-result">No pick made.</p>';
  }

  return `<article class="aces-card pk-game">
    <div class="pk-meta"><span>${esc(g.time || 'Time TBD')}${g.isPlayoff ? ' <span class="aces-badge is-accent">Playoff</span>' : ''}</span>${statusBadge(g)}</div>
    <div class="pk-matchup${g.tiesAllowed ? ' has-tie' : ''}">
      ${team(g.awayKey, g.awayName, 'Away', g.awayScore)}
      ${middle}
      ${team(g.homeKey, g.homeName, 'Home', g.homeScore)}
    </div>
    ${below}
  </article>`;
}

// ---- Tables ----------------------------------------------------------------

function board(rows, { paid = null } = {}) {
  if (!rows.length) return '<div class="aces-empty"><p class="aces-empty-title">No picks yet.</p></div>';
  const body = rows.map((r) => {
    const n = r.correct + r.wrong;
    const pct = n ? (r.correct / n).toFixed(3).replace(/^0/, '') : '-';
    const box = paid
      ? `<td class="is-center"><input type="checkbox" class="pk-paid" data-paid="${esc(r.uid)}" aria-label="${esc(r.name)} paid"${paid[r.uid]?.paid ? ' checked' : ''}></td>`
      : '';
    return `<tr${r.uid === S.uid ? ' class="is-me"' : ''}>
      <td class="is-rank">${r.rank}</td>
      <td>${esc(r.name)}</td>
      <td class="is-num">${r.correct}-${r.wrong}</td>
      <td class="is-num pk-hide-sm">${pct}</td>
      <td class="is-num pk-hide-sm">${r.bonuses}</td>
      <td class="is-num pk-pts">${r.pts}</td>${box}
    </tr>`;
  }).join('');
  return `<div class="aces-table-wrap"><table class="aces-table pk-table">
    <thead><tr><th class="is-rank">#</th><th>Name</th><th class="is-num">W-L</th><th class="is-num pk-hide-sm">Pct</th><th class="is-num pk-hide-sm" title="Upset and tie bonuses">Bonus</th><th class="is-num">Pts</th>${paid ? '<th class="is-center" title="Only you can see this">Paid</th>' : ''}</tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

// ---- Week board ------------------------------------------------------------

function renderWeekBoard() {
  const w = S.weeks[S.week];
  const locked = w.games.filter((g) => isLocked(g) && !g.isTBD && !g.cancelled);
  const counts = locked.map((g) => {
    const s = splitFor(S.entries, g);
    const graded = isGraded(g);
    const side = (key, name, n) => `<div class="pk-count${graded && g.winnerKey !== key ? ' is-lost' : ''}"${colorAttr(name)}>
        <span class="pk-team"><span class="aces-team-dot"></span>${esc(name)}${graded && g.winnerKey === key ? icon('check') : ''}</span>
        <strong>${n}</strong></div>`;
    const mid = g.tiesAllowed
      ? `<div class="pk-count is-tie${graded && g.winnerKey !== TIE ? ' is-lost' : ''}"><span class="pk-team">Tie${graded && g.winnerKey === TIE ? icon('check') : ''}</span><strong>${s.tie}</strong></div>`
      : '<span class="pk-at" aria-hidden="true">@</span>';
    return `<li class="pk-count-row">
      <div class="pk-count-meta">${DAYS[dow(g.dp)].slice(0, 3)} ${shortDate(g.dp)}${g.time ? ` &middot; ${esc(g.time)}` : ''} &middot; ${plural(s.total, 'pick')}${isUpset(S.entries, g) ? ` <span class="aces-badge is-accent">${icon('zap')}Upset</span>` : ''}</div>
      <div class="pk-count-sides${g.tiesAllowed ? ' has-tie' : ''}">${side(g.awayKey, g.awayName, s.away)}${mid}${side(g.homeKey, g.homeName, s.home)}</div>
      ${splitBar(g, s, { labels: false })}
    </li>`;
  }).join('');

  $('pk-week').innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">Week ${S.weeks[S.week].num} leaderboard</h2></div>
      <p class="pk-sub">Points from this week's final games.</p>
      ${board(scoreGames(S.entries, w.games))}
    </section>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">Pick counts</h2></div>
      <p class="pk-sub">How many took each side. Counts show once a game locks at first pitch; nobody sees who picked what.</p>
      ${counts ? `<ul class="pk-counts">${counts}</ul>` : '<div class="aces-empty"><p class="aces-empty-title">No games have locked yet this week.</p></div>'}
    </section>`;
}

// ---- Season ----------------------------------------------------------------

function renderSeason() {
  const graded = S.games.filter(isGraded).length;
  const rows = scoreGames(S.entries, S.games);
  if (S.admin && !S.payments && !S.paymentsLoading) {
    S.paymentsLoading = true;
    loadPayments().then(() => { S.paymentsLoading = false; if (S.tab === 'season') renderSeason(); });
  }
  const paid = S.admin && S.payments ? S.payments : null;
  const note = paid
    ? `<p class="aces-notice pk-paid-note">${icon('lock')}<span>Paid: <strong>${rows.filter((r) => paid[r.uid]?.paid).length} of ${rows.length}</strong>. Only you can see this column.</span></p>`
    : '';
  $('pk-season').innerHTML = `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">Season standings</h2></div>
    <p class="pk-sub">${esc(S.season.name || seasonLabel(S.season.id))} &middot; ${plural(graded, 'graded game')} so far</p>
    ${note}${board(rows, { paid })}
  </section>`;
}

const paymentsRef = () => doc(db, 'pickem', S.season.id, 'private', 'payments');

async function loadPayments() {
  try {
    const snap = await getDoc(paymentsRef());
    S.payments = snap.exists() ? (snap.data().paid || {}) : {};
  } catch (err) {
    console.warn('Pick\'em payments unavailable', err);
    S.admin = false;   // no access: hide the column rather than show it empty
  }
}

async function setPaid(uid, paid) {
  const name = S.entries[uid]?.displayName || '';
  const before = S.payments[uid];
  S.payments[uid] = { paid, name };
  renderSeason();
  try {
    await setDoc(paymentsRef(), { paid: { [uid]: { paid, name, at: serverTimestamp() } }, updatedAt: serverTimestamp() }, { merge: true });
    showToast(`${name || 'Player'} marked ${paid ? 'paid' : 'unpaid'}`);
  } catch (err) {
    console.error('Payment save failed', err);
    if (before) S.payments[uid] = before; else delete S.payments[uid];
    renderSeason();
    showToast('Could not save. Try again.', 'error');
  }
}

// ---- Rules -----------------------------------------------------------------

function renderRules() {
  $('pk-rules').innerHTML = `<section class="aces-card">
    <div class="aces-card-head"><h2 class="aces-card-title">How it works</h2></div>
    <ul class="pk-rules">
      <li>Tap a team to pick it. Tap it again to clear the pick. Picks save right away.</li>
      <li>Each game locks at its scheduled first pitch, so you can make or change Thursday's picks on Wednesday.</li>
      <li>Nobody sees anyone else's pick for a game until it locks, and then only the counts.</li>
      <li><strong>1 point</strong> for every correct pick.</li>
      <li><strong>+1 upset bonus</strong> when you're right and fewer than a third of pickers took that team (at least 3 picks on the game).</li>
      <li><strong>Pick a tie</strong> (games from ${tieDate} on): the middle button. Call a tie right for <strong>${TIE_POINTS} points</strong> (1 + a tie bonus). When one of those games ends tied, team picks miss.</li>
      <li>Forfeits and cancelled games don't count for anyone, and neither do ties in games before ${tieDate}.</li>
      <li>Standings: points, then correct picks, then fewest misses.</li>
    </ul>
  </section>`;
}

// ---------------------------------------------------------------------------
// Save a pick
// ---------------------------------------------------------------------------

async function pick(gameId, team) {
  const g = S.byId[gameId];
  if (!g) return;
  if (isLocked(g)) { showToast('That game is locked.', 'error'); renderPicks(); return; }
  const uid = S.uid;
  if (!S.entries[uid]) S.entries[uid] = { displayName: S.name, picks: {} };
  const prev = S.entries[uid].picks[gameId] ? { ...S.entries[uid].picks[gameId] } : null;
  const clearing = prev?.team === team;
  const ref = doc(db, 'pickem', S.season.id, 'entries', uid);

  if (clearing) delete S.entries[uid].picks[gameId];
  else S.entries[uid].picks[gameId] = { team, atMs: Date.now() };
  renderPicks();

  try {
    if (clearing) {
      await updateDoc(ref, new FieldPath('picks', gameId), deleteField(), 'updatedAt', serverTimestamp());
      showToast('Pick cleared', 'info');
    } else {
      await setDoc(ref, {
        uid, displayName: S.name, seasonId: S.season.id, updatedAt: serverTimestamp(),
        picks: { [gameId]: { team, at: serverTimestamp() } }
      }, { merge: true });
      showToast(`Picked ${team === TIE ? 'a tie' : team === g.homeKey ? g.homeName : g.awayName}`);
    }
  } catch (err) {
    console.error('Pick save failed', err);
    if (prev) S.entries[uid].picks[gameId] = prev; else delete S.entries[uid].picks[gameId];
    renderPicks();
    showToast('Could not save your pick. Try again.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

function wire() {
  const root = $('pkRoot');
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-goto]');
    if (tab) { e.preventDefault(); S.tab = tab.dataset.goto; render(); return; }
    const wk = e.target.closest('[data-week]');
    if (wk && !wk.disabled) {
      S.week = Math.min(Math.max(S.week + Number(wk.dataset.week), 0), S.weeks.length - 1);
      render();
      return;
    }
    const p = e.target.closest('[data-pick]');
    if (p && !p.disabled) pick(p.dataset.game, p.dataset.pick);
  });
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-paid]');
    if (box && S.admin && S.payments) setPaid(box.dataset.paid, box.checked);
  });
  // Countdowns and locks move on their own.
  setInterval(() => { if (S.tab === 'picks' && !document.hidden) renderPicks(); }, 30000);
}

async function main() {
  const ctx = await initPage({ title: "Pick'em", requiresAuth: true });
  if (!ctx?.user) return;
  const { user } = ctx;
  const me = ctx.realProfile || ctx.profile || {};
  S.uid = user.uid;
  S.name = me.displayName || me.linkedPlayer || (user.email ? user.email.split('@')[0] : 'Aces Fan');
  S.admin = hasRole(ctx.realProfile, 'admin');

  const data = await load();
  if (!data || !data.games.length) {
    showPageState({ title: 'No games yet', message: 'There are no games on the schedule for the current season yet.' });
    return;
  }
  Object.assign(S, data);
  S.byId = Object.fromEntries(S.games.map((g) => [g.id, g]));
  S.weeks = buildWeeks(S.games);

  const params = new URLSearchParams(location.search);
  const t = params.get('tab');
  if (TABS.some(([id]) => id === t)) S.tab = t;
  const wn = Number(params.get('week'));
  const wi = S.weeks.findIndex((w) => w.num === wn);
  S.week = wi === -1 ? defaultWeek() : wi;

  wire();
  render();
  pageReady();
}

main().catch((err) => {
  console.error('Pick\'em failed to load', err);
  showPageError(err, { message: "Could not load Pick'em. Please refresh." });
});
