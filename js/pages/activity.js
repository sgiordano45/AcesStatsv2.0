// js/pages/activity.js
// activity.html: the league activity feed (the activity collection, written
// by Cloud Functions): games, milestones, badges, career highs, streaks,
// standings moves and photos. Filter by type and time, load more, share one
// item (image or link), and copy a milestone digest for the group chat.
//
// URL: activity.html[?type=milestone][&time=month]. A type filter needs the
// composite index type ASC + timestamp DESC (already in use).

import { initPage, pageReady, showPageError } from '../core/app.js';
import { db, collection, query, where, orderBy, limit, getDocs, startAfter, Timestamp } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 40;

const TYPES = [
  ['all', 'All', 'activity'],
  ['game', 'Games', 'softball'],
  ['milestone', 'Milestones', 'target'],
  ['badge', 'Badges', 'medal'],
  ['career_high', 'Career highs', 'trending-up'],
  ['streak', 'Streaks', 'flame'],
  ['standings', 'Standings', 'list'],
  ['photo', 'Photos', 'image']
];
const TYPE = Object.fromEntries(TYPES.map(([k, label, ic]) => [k, { label, icon: ic }]));
const TIMES = [['week', 'Week'], ['month', 'Month'], ['season', 'Season'], ['all', 'All time']];

const S = { type: 'all', time: 'week', items: [], last: null, more: false, loading: false };

// Activity links are written as site-root paths (/player.html?id=...); make
// them relative so they also work on the preview site.
const link = (u) => (u ? String(u).replace(/^\//, '') : '');
const SINGULAR = { game: 'Game', milestone: 'Milestone', badge: 'Badge', career_high: 'Career high', streak: 'Streak', standings: 'Standings', photo: 'Photo' };
const typeLabel = (t) => SINGULAR[t] || 'Update';

function since(time) {
  const d = new Date();
  if (time === 'week') d.setDate(d.getDate() - 7);
  else if (time === 'month') d.setMonth(d.getMonth() - 1);
  else if (time === 'season') d.setMonth(d.getMonth() - 4);
  else return null;
  return Timestamp.fromDate(d);
}

function ago(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function load(more = false) {
  if (S.loading) return;
  S.loading = true;
  if (!more) { S.items = []; S.last = null; renderFeed(true); }
  else renderMore(true);
  try {
    const parts = [];
    if (S.type !== 'all') parts.push(where('type', '==', S.type));
    const from = since(S.time);
    if (from) parts.push(where('timestamp', '>=', from));
    parts.push(orderBy('timestamp', 'desc'));
    if (more && S.last) parts.push(startAfter(S.last));
    parts.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(collection(db, 'activity'), ...parts));
    const items = snap.docs.map((d) => {
      const v = d.data();
      return { id: d.id, ...v, when: v.timestamp?.toDate ? v.timestamp.toDate() : new Date() };
    });
    if (snap.docs.length) S.last = snap.docs[snap.docs.length - 1];
    S.items = more ? [...S.items, ...items] : items;
    S.more = snap.docs.length >= PAGE_SIZE;
    renderFeed();
  } catch (err) {
    console.error('[activity] load failed', err);
    const index = err?.code === 'failed-precondition' || /index/i.test(err?.message || '');
    $('acFeed').innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('alert-circle')}
      <p class="aces-empty-title">${index ? 'This filter needs a database index' : "Activity couldn't load"}</p>
      <p>${index ? 'An admin can open the browser console for the link that creates it (about a minute to build).' : 'Check your connection and try again.'}</p></div></div>`;
    S.more = false;
  } finally {
    S.loading = false;
    renderMore(false);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderFilters() {
  $('acTypes').innerHTML = TYPES.map(([k, label, ic]) => `<button type="button" class="aces-chip" data-type="${k}" aria-pressed="${S.type === k}">${icon(ic)}${esc(label)}</button>`).join('');
  $('acTimes').innerHTML = TIMES.map(([k, label]) => `<button type="button" class="aces-segment" data-time="${k}" aria-pressed="${S.time === k}">${esc(label)}</button>`).join('');
}

function itemHtml(a) {
  const t = TYPE[a.type] || { icon: 'activity' };
  const href = link(a.linkUrl);
  const title = esc(a.title || 'Activity');
  return `<li class="ac-item is-${esc(a.type || 'other')}">
    <span class="ac-icon" aria-hidden="true">${icon(t.icon)}</span>
    <div class="ac-body">
      <p class="ac-title">${href ? `<a href="${esc(href)}">${title}</a>` : title}</p>
      ${a.description ? `<p class="ac-desc">${esc(a.description)}</p>` : ''}
      <p class="ac-meta"><span class="ac-type">${esc(typeLabel(a.type))}</span><time datetime="${esc(a.when.toISOString())}">${esc(ago(a.when))}</time></p>
    </div>
    <button type="button" class="aces-btn is-icon is-sm is-ghost ac-share" data-share="${esc(a.id)}" aria-label="Share">${icon('share')}</button>
  </li>`;
}

function renderFeed(loading = false) {
  if (loading) {
    $('acFeed').innerHTML = '<div class="aces-card"><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';
    return;
  }
  if (!S.items.length) {
    $('acFeed').innerHTML = `<div class="aces-card"><div class="aces-empty">${icon('newspaper')}<p class="aces-empty-title">Nothing here yet</p>
      <p>${S.time === 'all' ? 'Activity shows up as games are played and milestones are reached.' : 'Try a longer time range.'}</p></div></div>`;
    return;
  }
  const days = new Map();
  for (const a of S.items) {
    const k = dayLabel(a.when);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(a);
  }
  $('acFeed').innerHTML = [...days].map(([label, list]) => `<section class="ac-day">
    <h2 class="ac-day-head">${esc(label)}</h2>
    <ul class="aces-card ac-list">${list.map(itemHtml).join('')}</ul>
  </section>`).join('');
}

function renderMore(busy) {
  $('acMore').hidden = !S.more && !busy;
  $('acMore').innerHTML = S.more || busy
    ? `<button type="button" class="aces-btn" data-more${busy ? ' disabled' : ''}>${busy ? 'Loading\u2026' : 'Load more'}</button>` : '';
}

function syncUrl() {
  const q = new URLSearchParams();
  if (S.type !== 'all') q.set('type', S.type);
  if (S.time !== 'week') q.set('time', S.time);
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
}

// ---------------------------------------------------------------------------
// Share one item
// ---------------------------------------------------------------------------

function wrap(g, text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function shareImage(a) {
  const share = a.share || {};
  const W = 1080;
  const H = 1080;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#173a10');
  bg.addColorStop(1, '#2d5016');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd700';
  g.font = '700 30px Inter, system-ui, sans-serif';
  g.fillText('MOUNTAINSIDE ACES', W / 2, 120);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '700 28px Inter, system-ui, sans-serif';
  g.fillText(String(share.type || typeLabel(a.type)).toUpperCase(), W / 2, 300);
  g.fillStyle = '#ffffff';
  g.font = '700 64px Inter, system-ui, sans-serif';
  wrap(g, share.headline || a.playerName || a.teamName || '', W - 160).forEach((l, i) => g.fillText(l, W / 2, 420 + i * 76));
  g.fillStyle = '#ffd700';
  g.font = '700 84px Inter, system-ui, sans-serif';
  wrap(g, share.subheadline || a.title || '', W - 160).forEach((l, i) => g.fillText(l, W / 2, 640 + i * 96));
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = '500 30px Inter, system-ui, sans-serif';
  g.fillText(a.when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W / 2, 930);
  g.fillText('acessoftballreference.com', W / 2, 990);
  return c;
}

async function share(id) {
  const a = S.items.find((x) => x.id === id);
  if (!a) return;
  const url = `https://acessoftballreference.com/${link(a.linkUrl) || 'activity.html'}`;
  const sh = a.share || {};
  const text = `${sh.headline || a.playerName || a.teamName || ''}${sh.headline || a.playerName || a.teamName ? ': ' : ''}${sh.subheadline || a.title || ''} (Mountainside Aces)`;
  const canvas = shareImage(a);
  const png = canvas.toDataURL('image/png');
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = blob ? new File([blob], `aces-${a.type || 'activity'}.png`, { type: 'image/png' }) : null;
  const canFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  await openModal({
    title: 'Share',
    html: `<img class="ac-share-img" src="${png}" alt="">
      <div class="ac-share-btns">
        ${canFiles ? `<button type="button" class="aces-btn is-primary" data-sh="native">${icon('share')}Share image</button>` : ''}
        <a class="aces-btn${canFiles ? '' : ' is-primary'}" href="${png}" download="aces-${esc(a.type || 'activity')}.png">${icon('download')}Save image</a>
        <button type="button" class="aces-btn" data-sh="copy">${icon('link')}Copy link</button>
        <a class="aces-btn" href="https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}" target="_blank" rel="noopener">${icon('message')}WhatsApp</a>
        <a class="aces-btn" href="sms:?&body=${encodeURIComponent(`${text} ${url}`)}">${icon('smartphone')}Text</a>
      </div>`,
    actions: [{ label: 'Done', value: true }],
    onOpen: (dialog) => {
      dialog.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sh]');
        if (!b) return;
        if (b.dataset.sh === 'native') {
          try { await navigator.share({ files: [file], text: `${text} ${url}` }); } catch { /* cancelled */ }
        } else {
          try { await navigator.clipboard.writeText(url); showToast('Link copied.', 'success'); }
          catch { showToast("Couldn't copy the link.", 'error'); }
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Milestone digest (milestones and career highs, for the group chat)
// ---------------------------------------------------------------------------

const DIGEST_GROUPS = {
  hits: 'Hits', runs: 'Runs', games: 'Games played', walks: 'Walks', rbis: 'RBIs', career_high: 'Career highs', milestone: 'Milestones'
};
const leadNum = (a) => Number((String(a.title || '').match(/(\d+)/) || [])[1] || 0);

async function digestData(days) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const q = (type) => query(collection(db, 'activity'), where('type', '==', type), where('timestamp', '>=', Timestamp.fromDate(from)), orderBy('timestamp', 'desc'));
  const [m, c] = await Promise.all([getDocs(q('milestone')), getDocs(q('career_high'))]);
  const list = [...m.docs, ...c.docs].map((d) => d.data());
  const groups = new Map();
  for (const a of list) {
    const k = a.type === 'milestone' ? (a.data?.milestoneType || 'milestone') : a.type;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  groups.forEach((items) => items.sort((a, b) => leadNum(b) - leadNum(a)));
  return { from, groups };
}

function digestText({ from, groups }) {
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let text = `Mountainside Aces milestone recap\n${fmt(from)} - ${fmt(new Date())}\n`;
  for (const [k, items] of groups) {
    text += `\n${DIGEST_GROUPS[k] || k.replace(/_/g, ' ')}\n`;
    items.forEach((a) => {
      const name = a.playerName || a.teamName || '';
      text += `- ${name}${name && a.title ? ': ' : ''}${a.title || ''}\n`;
    });
  }
  return `${text}\nCongrats to all our Aces!`;
}

async function openDigest() {
  const body = document.createElement('div');
  body.className = 'ac-digest';
  body.innerHTML = `<label class="ac-digest-range"><span class="aces-label">Range</span>
      <span class="aces-select-wrap"><select class="aces-select is-sm" data-range>
        <option value="7">Past 7 days</option><option value="14">Past 14 days</option><option value="30">Past 30 days</option>
      </select></span></label>
    <div class="ac-digest-body" data-body><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>
    <button type="button" class="aces-btn is-primary" data-copy disabled>${icon('copy')}Copy for the group chat</button>`;
  let current = null;
  const paint = async () => {
    const out = body.querySelector('[data-body]');
    const btn = body.querySelector('[data-copy]');
    out.innerHTML = '<span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span>';
    btn.disabled = true;
    try {
      current = await digestData(Number(body.querySelector('[data-range]').value));
    } catch (err) {
      console.error('[activity] digest', err);
      out.innerHTML = '<p class="ac-dim">The digest could not load.</p>';
      return;
    }
    if (!current.groups.size) { out.innerHTML = '<p class="ac-dim">No milestones in this range.</p>'; return; }
    out.innerHTML = [...current.groups].map(([k, items]) => `<h3>${esc(DIGEST_GROUPS[k] || k.replace(/_/g, ' '))}</h3>
      <ul>${items.map((a) => `<li><strong>${esc(a.playerName || a.teamName || '')}</strong>${a.title ? ` ${esc(a.title)}` : ''}</li>`).join('')}</ul>`).join('');
    btn.disabled = false;
  };
  body.querySelector('[data-range]').addEventListener('change', paint);
  body.querySelector('[data-copy]').addEventListener('click', async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(digestText(current)); showToast('Digest copied.', 'success'); }
    catch { showToast("Couldn't copy. Select the text instead.", 'error'); }
  });
  paint();
  await openModal({ title: 'Milestone digest', body, actions: [{ label: 'Done', value: true }] });
}

// ---------------------------------------------------------------------------

function wire() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]');
    if (t) { S.type = t.dataset.type; renderFilters(); syncUrl(); load(); return; }
    const tm = e.target.closest('[data-time]');
    if (tm) { S.time = tm.dataset.time; renderFilters(); syncUrl(); load(); return; }
    if (e.target.closest('[data-more]')) { load(true); return; }
    const sh = e.target.closest('[data-share]');
    if (sh) { share(sh.dataset.share); return; }
    if (e.target.closest('[data-digest]')) openDigest();
  });
}

async function main() {
  await initPage({ title: 'Activity' });
  const q = new URLSearchParams(location.search);
  if (TYPE[q.get('type')]) S.type = q.get('type');
  if (TIMES.some(([k]) => k === q.get('time'))) S.time = q.get('time');
  renderFilters();
  wire();
  pageReady();
  await load();
}

main().catch((err) => { pageReady(); showPageError(err, { container: '#acFeed' }); });
