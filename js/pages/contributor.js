// js/pages/contributor.js
// contributor.html: the contributor dashboard. Each tab shows for its role
// (league staff and admins see them all):
//
//   Previews     oddsmaker     Peter's odds and preview on each game doc
//   Eulogies     eulogist      the Year in Review eulogies, per season
//   My photos    photographer  your uploads: caption, team album, delete
//   Media        mediaManager  Media page channels, playlists, highlights, podcasts
//   Announcements league staff the home page's league news (bannerMessages)
//
// Editing happens in a dialog. URL: ?tab=eulogies&season=2026-fall
//
// Data: seasons/{sid}/games/{gid} { preview, homeOdds, awayOdds, previewStatus,
// previewUpdatedAt, previewUpdatedBy }; eulogies { seasonId, teamName,
// eliminationOrder, eliminatedInRound, isChampion, text, createdAt, createdBy,
// lastUpdate, lastUpdatedBy }; teamPhotos { url, thumbnailUrl, storagePath,
// caption, folder, type, uploadedBy, uploadedAt }; mediaChannels { type, team,
// title, description, channelUrl, teamColor, embedId, spotifyShowId,
// applePodcastsUrl, podcastUrl, order, active }; bannerMessages { message,
// priority, isActive, startDate, endDate }.

import { initPage, pageReady, showPageError, siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import {
  db, storage, collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from '../core/firebase.js';
import { ref, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getAllSeasons, getCurrentSeason } from '../data/seasons.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';
import { toDateKey, todayKey, formatGameDate, compareGames } from '../domain/dates.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const STAFF = 'league-staff';
const TABS = [
  { id: 'previews', label: 'Previews', icon: 'dice', role: ['oddsmaker', STAFF] },
  { id: 'eulogies', label: 'Eulogies', icon: 'scroll', role: ['eulogist', STAFF] },
  { id: 'photos', label: 'My photos', icon: 'camera', role: ['photographer', STAFF] },
  { id: 'media', label: 'Media', icon: 'tv', role: ['mediaManager', STAFF] },
  { id: 'banners', label: 'Announcements', icon: 'megaphone', role: [STAFF] }
];
const ROLE_LABELS = [
  ['admin', 'Admin'], [STAFF, 'League staff'], ['oddsmaker', 'Oddsmaker'],
  ['eulogist', 'Eulogist'], ['photographer', 'Photographer'], ['mediaManager', 'Media manager']
];
const MEDIA_TYPES = {
  youtube_channel: 'YouTube channel',
  youtube_playlist: 'YouTube playlist',
  highlight: 'Single video',
  podcast: 'Podcast'
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const TEAMS = [...TEAM_COLORS].sort().map(cap);

const S = {
  ctx: null, uid: '', tabs: [], tab: '',
  seasons: [], season: '',
  games: null, gameView: 'upcoming',
  eulogies: null, photos: null, media: null, banners: null
};

function teamChip(team) {
  if (!team) return '';
  const k = String(team).toLowerCase();
  return `<span class="aces-team-chip"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}><span class="aces-team-dot"></span>${esc(cap(team))}</span>`;
}

const empty = (title, text = '') => `<div class="aces-empty"><p class="aces-empty-title">${esc(title)}</p>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
const loading = () => '<div class="aces-card"><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></div>';

function localDateInput(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const shortDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
};

function formError(body, msg) {
  const p = body.querySelector('.ct-form-error');
  p.textContent = msg;
  p.hidden = !msg;
  return !msg;
}

async function share(title, text) {
  const go = await openModal({
    title: 'Share',
    body: `Send "${title}" to the group chat?`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Copy text', value: 'copy' }, { label: 'Send to WhatsApp', value: 'wa', variant: 'primary' }]
  });
  if (go === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (go === 'copy') {
    try { await navigator.clipboard.writeText(text); showToast('Copied. Paste it in the group chat.', 'success'); } catch { showToast("Couldn't copy on this device.", 'error'); }
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('tab', S.tab);
  if ((S.tab === 'previews' || S.tab === 'eulogies') && S.season) u.searchParams.set('season', S.season);
  else u.searchParams.delete('season');
  history.replaceState(null, '', u);
}

function render() {
  $('ctTabs').innerHTML = S.tabs.map((t) =>
    `<a class="aces-tab" href="?tab=${t.id}" data-goto="${t.id}"${t.id === S.tab ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span></a>`).join('');
  TABS.forEach((t) => { $(`ct-${t.id}`).hidden = t.id !== S.tab; });
  syncUrl();
  ({ previews: showPreviews, eulogies: showEulogies, photos: showPhotos, media: showMedia, banners: showBanners })[S.tab]?.();
}

function seasonSelect() {
  return `<span class="aces-select-wrap"><select class="aces-select" data-f="season" aria-label="Season">${S.seasons.map((s) =>
    `<option value="${esc(s.id)}"${s.id === S.season ? ' selected' : ''}>${esc(seasonLabel(s.id))}</option>`).join('')}</select></span>`;
}

// ---------------------------------------------------------------------------
// Previews and odds (on each game doc)
// ---------------------------------------------------------------------------

const gName = (g, side) => g[`${side}TeamName`] || g[`${side}Team`] || cap(g[`${side}TeamId`]) || 'TBD';
const isFinal = (g) => g.status === 'completed' || !!g.winner;
const fmtOdds = (o) => (o === null || o === undefined || o === '' ? '-' : Number(o) > 0 ? `+${o}` : String(o));

async function loadGames() {
  const snap = await getDocs(collection(db, 'seasons', S.season, 'games'));
  S.games = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => compareGames(a, b));
}

async function showPreviews() {
  const box = $('ct-previews');
  if (!S.games) {
    box.innerHTML = loading();
    try { await loadGames(); } catch (err) { console.error('[contributor] games', err); box.innerHTML = empty("Games couldn't load.", 'Refresh to try again.'); return; }
  }
  const today = todayKey();
  const list = S.games.filter((g) => {
    if (S.gameView === 'upcoming') return !isFinal(g) && (toDateKey(g.date) || '9999') >= today;
    if (S.gameView === 'missing') return !isFinal(g) && !String(g.preview || '').trim();
    return true;
  });
  const seg = (v, l) => `<button type="button" class="aces-segment" data-view="${v}" aria-pressed="${S.gameView === v}">${l}</button>`;
  box.innerHTML = `
    <div class="ct-tools">${seasonSelect()}<div class="aces-segmented">${seg('upcoming', 'Upcoming')}${seg('missing', 'Needs a preview')}${seg('all', 'All games')}</div></div>
    <p class="ct-note">Odds and previews save to the game, and show on its preview page and the weekend preview.</p>
    ${list.length ? `<ul class="ct-list">${list.map((g) => {
      const has = String(g.preview || '').trim();
      const odds = g.homeOdds != null || g.awayOdds != null;
      return `<li><button type="button" class="ct-row" data-edit="game" data-id="${esc(g.id)}">
        <span class="ct-row-main"><strong>${esc(gName(g, 'away'))} @ ${esc(gName(g, 'home'))}</strong>
          <small>${esc(formatGameDate(g.date, 'short'))}${g.time ? ` &middot; ${esc(g.time)}` : ''}${isFinal(g) ? ' &middot; Final' : ''}</small></span>
        <span class="ct-row-tags">${odds ? `<span class="aces-badge is-outline">${esc(fmtOdds(g.awayOdds))} / ${esc(fmtOdds(g.homeOdds))}</span>` : ''}${has ? '<span class="aces-badge is-win">Preview</span>' : '<span class="aces-badge is-outline">No preview</span>'}</span>
        ${icon('chevron-right')}
      </button></li>`;
    }).join('')}</ul>` : empty(S.gameView === 'upcoming' ? 'No upcoming games this season.' : S.gameView === 'missing' ? 'Every upcoming game has a preview.' : 'No games this season.')}`;
}

async function editGame(g) {
  const away = gName(g, 'away'), home = gName(g, 'home');
  const body = document.createElement('form');
  body.className = 'ct-form';
  body.innerHTML = `
    <p class="ct-note">${esc(formatGameDate(g.date, 'long'))}${g.time ? ` &middot; ${esc(g.time)}` : ''}${isFinal(g) ? ' &middot; Final' : ''}</p>
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">${esc(away)} odds (away)</span><input class="aces-input" name="awayOdds" inputmode="numeric" placeholder="+150 or -120" value="${g.awayOdds ?? ''}"></label>
      <label class="aces-field"><span class="aces-label">${esc(home)} odds (home)</span><input class="aces-input" name="homeOdds" inputmode="numeric" placeholder="+150 or -120" value="${g.homeOdds ?? ''}"></label>
    </div>
    <p class="aces-hint">Plus is the underdog, minus the favorite. Leave blank for no line.</p>
    <label class="aces-field"><span class="aces-label">Peter's preview</span><textarea class="aces-input" name="preview" rows="8" placeholder="Peter's take on this one">${esc(g.preview || '')}</textarea></label>
    <p class="ct-form-error" hidden></p>`;
  let vals = null;
  const res = await openModal({
    title: `${away} @ ${home}`, body, wide: true,
    actions: [{ label: 'Share', value: 'share' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', variant: 'primary' }],
    beforeClose: (v) => {
      if (v !== 'save' && v !== 'share') return true;
      const f = new FormData(body);
      const odds = (k) => { const s = String(f.get(k) || '').trim().replace(/^\+/, ''); return s === '' ? null : Number(s); };
      vals = { awayOdds: odds('awayOdds'), homeOdds: odds('homeOdds'), preview: String(f.get('preview') || '').trim() };
      const bad = [vals.awayOdds, vals.homeOdds].some((o) => o !== null && (!Number.isInteger(o) || Math.abs(o) < 100));
      return formError(body, bad ? 'Odds are whole numbers like +150 or -120.' : '');
    }
  });
  if (!vals || (res !== 'save' && res !== 'share')) return;
  if (res === 'share') {
    const when = `${formatGameDate(g.date, 'long')}${g.time ? ` at ${g.time}` : ''}`;
    const lines = [`${away} @ ${home}: game preview`, when];
    if (vals.awayOdds !== null || vals.homeOdds !== null) lines.push('', `Peter's odds: ${away} ${fmtOdds(vals.awayOdds)} / ${home} ${fmtOdds(vals.homeOdds)}`);
    if (vals.preview) lines.push('', vals.preview);
    lines.push('', siteUrl(`game-preview.html?gameId=${encodeURIComponent(g.id)}`));
    share(`${away} @ ${home}`, lines.join('\n'));
    return;
  }
  try {
    const data = {
      ...vals,
      previewStatus: vals.preview ? 'preview_available' : 'scheduled',
      previewUpdatedAt: serverTimestamp(),
      previewUpdatedBy: S.uid
    };
    await updateDoc(doc(db, 'seasons', S.season, 'games', g.id), data);
    Object.assign(g, vals, { previewStatus: data.previewStatus });
    showToast('Preview saved.', 'success');
    showPreviews();
  } catch (err) {
    console.error('[contributor] preview', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Eulogies
// ---------------------------------------------------------------------------

async function showEulogies() {
  const box = $('ct-eulogies');
  if (!S.eulogies) {
    box.innerHTML = loading();
    try {
      const snap = await getDocs(query(collection(db, 'eulogies'), where('seasonId', '==', S.season)));
      S.eulogies = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (Number(a.eliminationOrder) || 99) - (Number(b.eliminationOrder) || 99));
    } catch (err) { console.error('[contributor] eulogies', err); box.innerHTML = empty("Eulogies couldn't load.", 'Refresh to try again.'); return; }
  }
  box.innerHTML = `
    <div class="ct-tools">${seasonSelect()}<button type="button" class="aces-btn is-primary" data-new="eulogy">${icon('plus')}Add eulogy</button></div>
    <p class="ct-note">Shown on the <a href="recap.html?season=${esc(S.season)}">Year in Review</a> in elimination order, the champion last.</p>
    ${S.eulogies.length ? `<ul class="ct-list">${S.eulogies.map((e) => `<li><button type="button" class="ct-row" data-edit="eulogy" data-id="${esc(e.id)}">
      <span class="ct-order">${e.isChampion ? icon('trophy') : esc(e.eliminationOrder ?? '-')}</span>
      <span class="ct-row-main"><span>${teamChip(e.teamName)}</span><small>${esc(e.isChampion ? 'Champion' : (e.eliminatedInRound || 'Round not set'))}</small></span>
      <span class="ct-row-snip">${esc(String(e.text || '').slice(0, 90))}${String(e.text || '').length > 90 ? '...' : ''}</span>
      ${icon('chevron-right')}
    </button></li>`).join('')}</ul>` : empty('No eulogies for this season yet.', 'Add one for each team as it goes out.')}`;
}

async function editEulogy(e = null) {
  const used = new Set((S.eulogies || []).filter((x) => x !== e).map((x) => x.teamName));
  const nextOrder = Math.max(0, ...(S.eulogies || []).map((x) => Number(x.eliminationOrder) || 0)) + 1;
  const body = document.createElement('form');
  body.className = 'ct-form';
  body.innerHTML = `
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" name="teamName" required>
        <option value="">Pick a team</option>${TEAMS.map((t) => `<option${t === e?.teamName ? ' selected' : ''}${used.has(t) ? ' disabled' : ''}>${esc(t)}</option>`).join('')}</select></span></label>
      <label class="aces-field"><span class="aces-label">Order out</span><input class="aces-input" type="number" name="eliminationOrder" min="1" max="20" value="${esc(e?.eliminationOrder ?? nextOrder)}"><span class="aces-hint">1 = first team out</span></label>
    </div>
    <label class="aces-field"><span class="aces-label">Eliminated in</span><input class="aces-input" name="eliminatedInRound" maxlength="60" placeholder="Losers round 2" value="${esc(e?.eliminatedInRound || '')}"></label>
    <label class="ct-check"><input type="checkbox" name="isChampion"${e?.isChampion ? ' checked' : ''}><span>Champion (a celebration, not a eulogy)</span></label>
    <label class="aces-field"><span class="aces-label">Eulogy</span><textarea class="aces-input" name="text" rows="10" placeholder="Dearly beloved...">${esc(e?.text || '')}</textarea><span class="aces-hint">A blank line starts a new paragraph.</span></label>
    <p class="ct-form-error" hidden></p>`;
  let vals = null;
  const actions = [{ label: 'Share', value: 'share' }, { label: 'Cancel', value: null }, { label: e ? 'Save' : 'Add', value: 'save', variant: 'primary' }];
  if (e) actions.unshift({ label: 'Delete', value: 'delete', variant: 'danger' });
  const res = await openModal({
    title: e ? `Eulogy: ${e.teamName}` : 'New eulogy', body, wide: true, actions,
    beforeClose: (v) => {
      if (v !== 'save' && v !== 'share') return true;
      const f = new FormData(body);
      vals = {
        teamName: String(f.get('teamName') || ''),
        eliminationOrder: parseInt(f.get('eliminationOrder'), 10) || 1,
        eliminatedInRound: String(f.get('eliminatedInRound') || '').trim(),
        isChampion: f.get('isChampion') === 'on',
        text: String(f.get('text') || '').trim()
      };
      return formError(body, !vals.teamName ? 'Pick the team.' : !vals.text ? 'Write the eulogy.' : '');
    }
  });
  if (res === 'delete' && e) return removeEulogy(e);
  if (!vals) return;
  if (res === 'share') {
    const title = vals.isChampion ? `Championship celebration: Aces ${vals.teamName}` : `Requiem for Aces ${vals.teamName}`;
    share(title, `${title}\n\n${vals.text}\n\nThe full Year in Review and every eulogy:\n${siteUrl(`recap.html?season=${S.season}`)}`);
    return;
  }
  if (res !== 'save') return;
  try {
    const data = { ...vals, seasonId: S.season, lastUpdate: serverTimestamp(), lastUpdatedBy: S.uid };
    if (e) await updateDoc(doc(db, 'eulogies', e.id), data);
    else await addDoc(collection(db, 'eulogies'), { ...data, createdAt: serverTimestamp(), createdBy: S.uid });
    S.eulogies = null;
    showToast(e ? 'Eulogy saved.' : 'Eulogy added.', 'success');
    showEulogies();
  } catch (err) {
    console.error('[contributor] eulogy', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

async function removeEulogy(e) {
  if (!await confirmModal(`Delete the eulogy for ${e.teamName}? This can't be undone.`, { title: 'Delete eulogy', confirmLabel: 'Delete', danger: true })) return;
  try {
    await deleteDoc(doc(db, 'eulogies', e.id));
    S.eulogies = S.eulogies.filter((x) => x !== e);
    showToast('Eulogy deleted.', 'success');
    showEulogies();
  } catch (err) {
    console.error('[contributor] delete eulogy', err);
    showToast("That didn't delete. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// My photos
// ---------------------------------------------------------------------------

const folderLabel = (f) => (!f || f === 'league' ? 'League' : cap(f));

async function showPhotos() {
  const box = $('ct-photos');
  if (!S.photos) {
    box.innerHTML = loading();
    try {
      const snap = await getDocs(query(collection(db, 'teamPhotos'), where('uploadedBy', '==', S.uid), orderBy('uploadedAt', 'desc')));
      S.photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error('[contributor] photos', err); box.innerHTML = empty("Your photos couldn't load.", 'Refresh to try again.'); return; }
  }
  const nPhotos = S.photos.filter((p) => p.type !== 'video').length;
  const nVideos = S.photos.length - nPhotos;
  box.innerHTML = `
    <div class="ct-tools"><span class="ct-note">${nPhotos} photo${nPhotos === 1 ? '' : 's'}, ${nVideos} video${nVideos === 1 ? '' : 's'}. Tap one to edit its caption or team, or delete it.</span>
      <a class="aces-btn is-primary" href="media.html#upload">${icon('upload')}Upload</a></div>
    ${S.photos.length ? `<ul class="ct-photos">${S.photos.map((p) => `<li><button type="button" class="ct-photo" data-edit="photo" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.caption || 'photo')}">
      ${p.type === 'video' ? `<video src="${esc(p.url)}" muted preload="metadata"></video><span class="ct-photo-video">${icon('video')}</span>` : `<img src="${esc(p.thumbnailUrl || p.url)}" alt="" loading="lazy">`}
      <span class="ct-photo-cap">${esc(folderLabel(p.folder))}${p.caption ? ` &middot; ${esc(p.caption)}` : ''}</span>
    </button></li>`).join('')}</ul>` : empty('No uploads yet.', 'Photos and videos you upload on the Media page show up here.')}`;
}

async function editPhoto(p) {
  const video = p.type === 'video';
  const body = document.createElement('form');
  body.className = 'ct-form';
  body.innerHTML = `
    ${video ? `<video class="ct-photo-large" src="${esc(p.url)}" controls></video>` : `<img class="ct-photo-large" src="${esc(p.url)}" alt="">`}
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Team album</span><span class="aces-select-wrap"><select class="aces-select" name="folder">
        ${['league', ...[...TEAM_COLORS].sort()].map((f) => `<option value="${f}"${f === (p.folder || 'league') ? ' selected' : ''}>${esc(folderLabel(f))}</option>`).join('')}
        ${p.folder && p.folder !== 'league' && !TEAM_COLORS.has(p.folder) ? `<option value="${esc(p.folder)}" selected>${esc(cap(p.folder))}</option>` : ''}
      </select></span></label>
      <label class="aces-field"><span class="aces-label">Caption</span><input class="aces-input" name="caption" maxlength="120" value="${esc(p.caption || '')}"></label>
    </div>`;
  let vals = null;
  const res = await openModal({
    title: video ? 'Edit video' : 'Edit photo', body, wide: true,
    actions: [{ label: 'Delete', value: 'delete', variant: 'danger' }, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', variant: 'primary' }],
    beforeClose: (v) => {
      if (v === 'save') { const f = new FormData(body); vals = { folder: String(f.get('folder') || 'league'), caption: String(f.get('caption') || '').trim() }; }
      return true;
    }
  });
  if (res === 'delete') return removePhoto(p);
  if (res !== 'save' || !vals) return;
  try {
    await updateDoc(doc(db, 'teamPhotos', p.id), { ...vals, lastModified: serverTimestamp() });
    Object.assign(p, vals);
    showToast('Saved.', 'success');
    showPhotos();
  } catch (err) {
    console.error('[contributor] photo', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

async function removePhoto(p) {
  if (!await confirmModal(`Delete this ${p.type === 'video' ? 'video' : 'photo'}? It comes off the Media page too, and can't be undone.`, { title: 'Delete', confirmLabel: 'Delete', danger: true })) return;
  try {
    await deleteDoc(doc(db, 'teamPhotos', p.id));
    if (p.storagePath) { try { await deleteObject(ref(storage, p.storagePath)); } catch { /* file already gone */ } }
    S.photos = S.photos.filter((x) => x !== p);
    showToast('Deleted.', 'success');
    showPhotos();
  } catch (err) {
    console.error('[contributor] delete photo', err);
    showToast("That didn't delete. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Media page entries
// ---------------------------------------------------------------------------

async function showMedia() {
  const box = $('ct-media');
  if (!S.media) {
    box.innerHTML = loading();
    try {
      const snap = await getDocs(query(collection(db, 'mediaChannels'), orderBy('order', 'asc')));
      S.media = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error('[contributor] media', err); box.innerHTML = empty("Media entries couldn't load.", 'Refresh to try again.'); return; }
  }
  box.innerHTML = `
    <div class="ct-tools"><span class="ct-note">Channels, playlists, highlights and podcasts on the <a href="media.html#video">Media page</a>. Changes go live right away.</span>
      <button type="button" class="aces-btn is-primary" data-new="media">${icon('plus')}Add entry</button></div>
    ${S.media.length ? `<ul class="ct-list">${S.media.map((m) => `<li><button type="button" class="ct-row${m.active === false ? ' is-off' : ''}" data-edit="media" data-id="${esc(m.id)}">
      <span class="ct-order">${esc(m.order ?? '-')}</span>
      <span class="ct-row-main"><strong>${esc(m.title || 'Untitled')}</strong><small>${esc(MEDIA_TYPES[m.type] || m.type || '')} &middot; ${esc(m.team || 'League')}</small></span>
      <span class="ct-row-tags">${m.active === false ? '<span class="aces-badge is-outline">Hidden</span>' : '<span class="aces-badge is-win">Live</span>'}</span>
      ${icon('chevron-right')}
    </button></li>`).join('')}</ul>` : empty('No media entries yet.')}`;
}

async function editMedia(m = null) {
  const v = m || {};
  const type = v.type || 'youtube_channel';
  const body = document.createElement('form');
  body.className = 'ct-form';
  body.innerHTML = `
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Type</span><span class="aces-select-wrap"><select class="aces-select" name="type">
        ${Object.entries(MEDIA_TYPES).map(([k, l]) => `<option value="${k}"${k === type ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span></label>
      <label class="aces-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" name="team">
        ${['League', ...TEAMS].map((t) => `<option${t === (v.team || 'League') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span></label>
    </div>
    <label class="aces-field"><span class="aces-label">Title</span><input class="aces-input" name="title" maxlength="100" value="${esc(v.title || '')}" placeholder="Green team highlights"></label>
    <label class="aces-field"><span class="aces-label">Description (optional)</span><textarea class="aces-input" name="description" rows="3">${esc(v.description || '')}</textarea></label>
    <div data-for="youtube_channel" class="ct-form-group">
      <label class="aces-field"><span class="aces-label">Channel link</span><input class="aces-input" type="url" name="channelUrl" value="${esc(v.channelUrl || '')}" placeholder="https://www.youtube.com/@handle"></label>
      <label class="aces-field"><span class="aces-label">Color (optional)</span><input class="aces-input" name="teamColor" value="${esc(v.teamColor || '')}" placeholder="#2d7d32, or blank for the team's color"></label>
    </div>
    <div data-for="youtube_playlist highlight" class="ct-form-group">
      <label class="aces-field"><span class="aces-label">YouTube ID</span><input class="aces-input" name="embedId" value="${esc(v.embedId || '')}">
        <span class="aces-hint">Playlist: the part after list= in its link. Video: the part after v=.</span></label>
    </div>
    <div data-for="podcast" class="ct-form-group">
      <label class="aces-field"><span class="aces-label">Spotify show ID</span><input class="aces-input" name="spotifyShowId" value="${esc(v.spotifyShowId || '')}" placeholder="The part after open.spotify.com/show/"></label>
      <label class="aces-field"><span class="aces-label">Apple Podcasts link</span><input class="aces-input" type="url" name="applePodcastsUrl" value="${esc(v.applePodcastsUrl || '')}"></label>
      <label class="aces-field"><span class="aces-label">Other podcast link</span><input class="aces-input" type="url" name="podcastUrl" value="${esc(v.podcastUrl || '')}"></label>
    </div>
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Order</span><input class="aces-input" type="number" name="order" min="1" max="999" value="${esc(v.order ?? 10)}"><span class="aces-hint">Lower shows first in its section</span></label>
      <label class="ct-check"><input type="checkbox" name="active"${v.active !== false ? ' checked' : ''}><span>Show on the Media page</span></label>
    </div>
    <p class="ct-form-error" hidden></p>`;
  const sync = () => {
    const t = body.elements.type.value;
    body.querySelectorAll('[data-for]').forEach((g) => { g.hidden = !g.dataset.for.split(' ').includes(t); });
  };
  body.elements.type.addEventListener('change', sync);
  sync();
  let data = null;
  const actions = [{ label: 'Cancel', value: null }, { label: m ? 'Save' : 'Add', value: 'save', variant: 'primary' }];
  if (m) actions.unshift({ label: 'Delete', value: 'delete', variant: 'danger' });
  const res = await openModal({
    title: m ? 'Edit media entry' : 'New media entry', body, wide: true, actions,
    beforeClose: (val) => {
      if (val !== 'save') return true;
      const f = new FormData(body);
      const get = (k) => String(f.get(k) || '').trim();
      const t = get('type');
      data = { type: t, team: get('team') || 'League', title: get('title'), description: get('description') || null, order: parseInt(get('order'), 10) || 10, active: f.get('active') === 'on' };
      let err = !data.title ? 'Add a title.' : '';
      if (!err && t === 'youtube_channel') { data.channelUrl = get('channelUrl'); data.teamColor = get('teamColor') || null; if (!data.channelUrl) err = 'Add the channel link.'; }
      if (!err && (t === 'youtube_playlist' || t === 'highlight')) { data.embedId = get('embedId'); if (!data.embedId) err = 'Add the YouTube ID.'; }
      if (!err && t === 'podcast') {
        data.spotifyShowId = get('spotifyShowId') || null; data.applePodcastsUrl = get('applePodcastsUrl') || null; data.podcastUrl = get('podcastUrl') || null;
        if (!data.spotifyShowId && !data.applePodcastsUrl && !data.podcastUrl) err = 'Add at least one podcast link.';
      }
      return formError(body, err);
    }
  });
  if (res === 'delete' && m) return removeMedia(m);
  if (res !== 'save' || !data) return;
  try {
    const stamp = { lastUpdated: serverTimestamp(), lastUpdatedBy: S.uid };
    if (m) await updateDoc(doc(db, 'mediaChannels', m.id), { ...data, ...stamp });
    else await addDoc(collection(db, 'mediaChannels'), { ...data, ...stamp, createdAt: serverTimestamp(), createdBy: S.uid });
    S.media = null;
    showToast(m ? 'Saved.' : 'Added.', 'success');
    showMedia();
  } catch (err) {
    console.error('[contributor] media save', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

async function removeMedia(m) {
  if (!await confirmModal(`Delete "${m.title}"? It comes off the Media page and can't be undone.`, { title: 'Delete entry', confirmLabel: 'Delete', danger: true })) return;
  try {
    await deleteDoc(doc(db, 'mediaChannels', m.id));
    S.media = S.media.filter((x) => x !== m);
    showToast('Deleted.', 'success');
    showMedia();
  } catch (err) {
    console.error('[contributor] media delete', err);
    showToast("That didn't delete. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Announcements (bannerMessages, the home page's league news)
// ---------------------------------------------------------------------------

function bannerState(b) {
  if (!b.isActive) return ['Off', 'is-outline'];
  const now = Date.now();
  if (b.startDate?.toMillis && b.startDate.toMillis() > now) return ['Scheduled', 'is-accent'];
  if (b.endDate?.toMillis && b.endDate.toMillis() < now) return ['Ended', 'is-outline'];
  return ['Live', 'is-win'];
}

async function showBanners() {
  const box = $('ct-banners');
  if (!S.banners) {
    box.innerHTML = loading();
    try {
      const snap = await getDocs(query(collection(db, 'bannerMessages'), orderBy('priority', 'asc')));
      S.banners = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) { console.error('[contributor] banners', err); box.innerHTML = empty("Announcements couldn't load.", 'Refresh to try again.'); return; }
  }
  box.innerHTML = `
    <div class="ct-tools"><span class="ct-note">League news on the home page. Lower priority numbers show first.</span>
      <button type="button" class="aces-btn is-primary" data-new="banner">${icon('plus')}Add announcement</button></div>
    ${S.banners.length ? `<ul class="ct-list">${S.banners.map((b) => {
      const [label, cls] = bannerState(b);
      const range = [shortDate(b.startDate), shortDate(b.endDate)];
      const when = range[0] && range[1] ? `${range[0]} - ${range[1]}` : range[0] ? `From ${range[0]}` : range[1] ? `Until ${range[1]}` : 'No dates';
      return `<li><button type="button" class="ct-row${label === 'Live' ? '' : ' is-off'}" data-edit="banner" data-id="${esc(b.id)}">
        <span class="ct-order">${esc(b.priority ?? '-')}</span>
        <span class="ct-row-main"><strong class="ct-clamp">${esc(b.message || '(no text)')}</strong><small>${esc(when)}</small></span>
        <span class="ct-row-tags"><span class="aces-badge ${cls}">${label}</span></span>
        ${icon('chevron-right')}
      </button></li>`;
    }).join('')}</ul>` : empty('No announcements yet.')}`;
}

async function editBanner(b = null) {
  const body = document.createElement('form');
  body.className = 'ct-form';
  body.innerHTML = `
    <label class="aces-field"><span class="aces-label">Announcement</span><textarea class="aces-input" name="message" rows="4" maxlength="400">${esc(b?.message || '')}</textarea></label>
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Priority</span><input class="aces-input" type="number" name="priority" min="1" max="100" value="${esc(b?.priority ?? 10)}"><span class="aces-hint">1 shows first</span></label>
      <label class="ct-check"><input type="checkbox" name="isActive"${!b || b.isActive ? ' checked' : ''}><span>On</span></label>
    </div>
    <div class="ct-form-row">
      <label class="aces-field"><span class="aces-label">Start (optional)</span><input class="aces-input" type="date" name="start" value="${localDateInput(b?.startDate)}"></label>
      <label class="aces-field"><span class="aces-label">End (optional)</span><input class="aces-input" type="date" name="end" value="${localDateInput(b?.endDate)}"></label>
    </div>
    <p class="ct-form-error" hidden></p>`;
  let data = null;
  const actions = [{ label: 'Cancel', value: null }, { label: b ? 'Save' : 'Add', value: 'save', variant: 'primary' }];
  if (b) actions.unshift({ label: 'Delete', value: 'delete', variant: 'danger' });
  const res = await openModal({
    title: b ? 'Edit announcement' : 'New announcement', body, wide: true, actions,
    beforeClose: (v) => {
      if (v !== 'save') return true;
      const f = new FormData(body);
      const start = String(f.get('start') || ''), end = String(f.get('end') || '');
      data = {
        message: String(f.get('message') || '').trim(),
        priority: parseInt(f.get('priority'), 10) || 10,
        isActive: f.get('isActive') === 'on',
        startDate: start ? Timestamp.fromDate(new Date(`${start}T00:00:00`)) : null,
        endDate: end ? Timestamp.fromDate(new Date(`${end}T23:59:59`)) : null
      };
      return formError(body, !data.message ? 'Write the announcement.' : start && end && end < start ? 'The end is before the start.' : '');
    }
  });
  if (res === 'delete' && b) return removeBanner(b);
  if (res !== 'save' || !data) return;
  try {
    const stamp = { lastUpdated: serverTimestamp(), lastUpdatedBy: S.uid };
    if (b) await updateDoc(doc(db, 'bannerMessages', b.id), { ...data, ...stamp });
    else await addDoc(collection(db, 'bannerMessages'), { ...data, ...stamp, createdAt: serverTimestamp(), createdBy: S.uid });
    S.banners = null;
    showToast(b ? 'Saved.' : 'Added.', 'success');
    showBanners();
  } catch (err) {
    console.error('[contributor] banner', err);
    showToast("That didn't save. Try again.", 'error');
  }
}

async function removeBanner(b) {
  if (!await confirmModal("Delete this announcement? This can't be undone.", { title: 'Delete announcement', confirmLabel: 'Delete', danger: true })) return;
  try {
    await deleteDoc(doc(db, 'bannerMessages', b.id));
    S.banners = S.banners.filter((x) => x !== b);
    showToast('Deleted.', 'success');
    showBanners();
  } catch (err) {
    console.error('[contributor] banner delete', err);
    showToast("That didn't delete. Try again.", 'error');
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

function wire() {
  const root = $('ctRoot');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-goto],[data-view],[data-new],[data-edit]');
    if (!t) return;
    if (t.dataset.goto) { e.preventDefault(); S.tab = t.dataset.goto; render(); return; }
    if (t.dataset.view) { S.gameView = t.dataset.view; showPreviews(); return; }
    if (t.dataset.new === 'eulogy') return void editEulogy();
    if (t.dataset.new === 'media') return void editMedia();
    if (t.dataset.new === 'banner') return void editBanner();
    const id = t.dataset.id;
    const find = (list) => (list || []).find((x) => x.id === id);
    if (t.dataset.edit === 'game') { const g = find(S.games); if (g) editGame(g); }
    if (t.dataset.edit === 'eulogy') { const x = find(S.eulogies); if (x) editEulogy(x); }
    if (t.dataset.edit === 'photo') { const x = find(S.photos); if (x) editPhoto(x); }
    if (t.dataset.edit === 'media') { const x = find(S.media); if (x) editMedia(x); }
    if (t.dataset.edit === 'banner') { const x = find(S.banners); if (x) editBanner(x); }
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-f="season"]')) return;
    S.season = e.target.value;
    S.games = null;
    S.eulogies = null;
    render();
  });
}

async function main() {
  const ctx = await initPage({ title: 'Contributor', role: ['contributor', 'photographer', 'oddsmaker', 'eulogist', 'mediaManager', STAFF] });
  S.ctx = ctx;
  S.uid = ctx.user.uid;
  const p = ctx.profile;
  S.tabs = TABS.filter((t) => hasRole(p, t.role));

  $('ctRoles').innerHTML = ROLE_LABELS
    .filter(([r]) => (r === 'admin' ? hasRole(p, 'admin') : r === STAFF ? hasRole(p, STAFF) && !hasRole(p, 'admin') : p?.specialRoles?.[r] === true))
    .map(([, l]) => `<span class="aces-badge is-outline">${esc(l)}</span>`).join('');

  if (!S.tabs.length) {
    pageReady();
    $('ctRoot').innerHTML = empty('Nothing to edit yet.', 'Your contributor role has no tools here. Ask a league admin if that seems wrong.');
    return;
  }

  const [all, current] = await Promise.all([getAllSeasons().catch(() => []), getCurrentSeason().catch(() => null)]);
  S.seasons = all.filter((s) => /^\d{4}-(spring|summer|fall)$/.test(s.id)).sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  const params = new URLSearchParams(location.search);
  const want = params.get('season');
  S.season = S.seasons.some((s) => s.id === want) ? want : (current?.id || S.seasons[0]?.id || '');
  const tab = params.get('tab');
  S.tab = S.tabs.some((t) => t.id === tab) ? tab : S.tabs[0].id;

  wire();
  render();
  pageReady();
}

main().catch((err) => showPageError(err));
