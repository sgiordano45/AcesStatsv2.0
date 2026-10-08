// js/pages/media.js
// media.html: Photos, Video, Live and Upload in one page (media.html#live).
// It replaced pictures.html (gallery), the old media.html (YouTube and
// podcast embeds), stream.html (live stream) and photo-upload.html; the
// other three forward to their tab here.
//
// Data, unchanged:
//   teamPhotos            photo and video docs (firebase-storage.js uploads them)
//   mediaChannels         { type: youtube_channel | youtube_playlist | highlight | podcast,
//                           title, team, description, active, order, channelUrl,
//                           embedId, spotifyShowId, applePodcastsUrl, podcastUrl }
//   siteConfig/streamConfig  { isLive, videoId, title } (set by the Cloud Function
//                           that watches the channel, or by an admin here)

import { initPage, pageReady } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { db, doc, collection, getDocs, setDoc, query, orderBy, onSnapshot } from '../core/firebase.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const CHANNEL_URL = 'https://www.youtube.com/@MountainsideAcesStreams/live';
const UPLOAD_ROLES = ['team-staff', 'league-staff', 'photographer'];   // admins pass too

const TABS = [
  { id: 'photos', label: 'Photos', icon: 'images' },
  { id: 'video', label: 'Video', icon: 'video' },
  { id: 'live', label: 'Live', icon: 'radio' },
  { id: 'upload', label: 'Upload', icon: 'upload', role: UPLOAD_ROLES }
];

let ctx = null;
const loaded = new Set();

const teamAttr = (team) => {
  const k = String(team || '').toLowerCase().trim();
  return TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : '';
};

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const photos = { all: [], shown: [], folder: 'all', type: 'all', at: 0 };

async function loadPhotos() {
  const el = $('mediaPhotos');
  try {
    const snap = await getDocs(query(collection(db, 'teamPhotos'), orderBy('createdAt', 'desc')));
    photos.all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.url);
  } catch (err) {
    console.error('[media] photos unavailable', err);
    el.innerHTML = '<div class="aces-card"><p class="media-empty">Photos could not load. Try again in a minute.</p></div>';
    return;
  }
  renderPhotos();
}

function renderPhotos() {
  const folders = [...new Set(photos.all.map(p => p.folder).filter(Boolean))].sort((a, b) => (a === 'league' ? -1 : b === 'league' ? 1 : a.localeCompare(b)));
  photos.shown = photos.all.filter(p => (photos.folder === 'all' || p.folder === photos.folder) && (photos.type === 'all' || p.type === photos.type));
  const images = photos.shown.filter(p => p.type !== 'video').length;
  const chip = (v, label, extra = '') => `<button type="button" class="aces-chip" data-folder="${esc(v)}" aria-pressed="${photos.folder === v}"${extra}>${label}</button>`;
  $('mediaPhotos').innerHTML = `
    <div class="media-filters">
      <div class="aces-chip-row" role="group" aria-label="Team">
        ${chip('all', 'All')}${folders.map(f => chip(f, f === 'league' ? 'League' : `<span class="aces-team-dot"${teamAttr(f)}></span>${esc(cap(f))}`)).join('')}
      </div>
      <div class="aces-segmented" role="group" aria-label="Type">
        ${['all', 'image', 'video'].map(t => `<button type="button" class="aces-segment" data-type="${t}" aria-pressed="${photos.type === t}">${t === 'all' ? 'All' : t === 'image' ? 'Photos' : 'Videos'}</button>`).join('')}
      </div>
    </div>
    <p class="media-count">${photos.shown.length} item${photos.shown.length === 1 ? '' : 's'} &middot; ${images} photo${images === 1 ? '' : 's'}, ${photos.shown.length - images} video${photos.shown.length - images === 1 ? '' : 's'}</p>
    ${photos.shown.length ? `<ul class="media-grid">${photos.shown.map((p, i) => `<li>
      <button type="button" class="media-thumb${p.type === 'video' ? ' is-video' : ''}" data-open="${i}" aria-label="${esc(p.name || 'Photo')}">
        ${p.type === 'video'
          ? `<video src="${esc(p.url)}#t=0.5" muted playsinline preload="metadata"></video><span class="media-play">${icon('play')}</span>`
          : `<img src="${esc(p.url)}" alt="" loading="lazy" decoding="async">`}
        <span class="media-cap"><strong>${esc(p.name || '')}</strong><span>${esc(p.folder === 'league' ? 'League' : cap(p.folder))}</span></span>
      </button></li>`).join('')}</ul>`
      : '<div class="aces-card"><p class="media-empty">No photos here yet.</p></div>'}`;
}

function openViewer(i) {
  photos.at = (i + photos.shown.length) % photos.shown.length;
  const p = photos.shown[photos.at];
  const v = $('mediaViewer');
  v.querySelector('[data-stage]').innerHTML = p.type === 'video'
    ? `<video src="${esc(p.url)}" controls autoplay playsinline></video>`
    : `<img src="${esc(p.url)}" alt="${esc(p.name || '')}">`;
  const when = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  v.querySelector('[data-info]').innerHTML = `<strong>${esc(p.name || '')}</strong>
    <span>${esc(p.folder === 'league' ? 'League' : cap(p.folder))}${p.uploadedByName ? ` &middot; ${esc(p.uploadedByName)}` : ''}${when ? ` &middot; ${esc(when)}` : ''} &middot; ${photos.at + 1} of ${photos.shown.length}</span>`;
  if (!v.open) v.showModal();
}

function closeViewer() {
  const v = $('mediaViewer');
  v.querySelector('[data-stage]').innerHTML = '';   // stops a playing video
  if (v.open) v.close();
}

// ---------------------------------------------------------------------------
// Video: YouTube playlists, highlights, channels and the podcast
// ---------------------------------------------------------------------------

async function loadVideo() {
  const el = $('mediaVideo');
  let items = [];
  try {
    const snap = await getDocs(query(collection(db, 'mediaChannels'), orderBy('order', 'asc')));
    items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.active !== false);
  } catch (err) {
    console.warn('[media] mediaChannels unavailable', err);
  }
  if (!items.length) {
    el.innerHTML = '<div class="aces-card"><p class="media-empty">No videos yet. Check back soon.</p></div>';
    return;
  }
  const tag = (it) => `<span class="aces-team-chip"${teamAttr(it.team)}><span class="aces-team-dot"></span>${esc(cap((it.team || 'League').trim()))}</span>`;
  const embed = (src, title) => `<div class="media-embed"><iframe src="${esc(src)}" title="${esc(title)}" loading="lazy" allowfullscreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`;
  const card = {
    podcast: (it) => `<article class="aces-card media-card">
      <h3 class="media-card-title">${icon('radio')} ${esc(it.title)}</h3>
      ${it.description ? `<p class="media-desc">${esc(it.description)}</p>` : ''}
      ${it.spotifyShowId ? `<iframe class="media-spotify" src="https://open.spotify.com/embed/show/${encodeURIComponent(it.spotifyShowId)}?utm_source=generator&theme=0" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="${esc(it.title)}"></iframe>` : ''}
      <div class="aces-cluster">
        ${it.spotifyShowId ? `<a class="aces-btn is-sm" href="https://open.spotify.com/show/${encodeURIComponent(it.spotifyShowId)}" target="_blank" rel="noopener">Spotify</a>` : ''}
        ${it.applePodcastsUrl ? `<a class="aces-btn is-sm" href="${esc(it.applePodcastsUrl)}" target="_blank" rel="noopener">Apple Podcasts</a>` : ''}
        ${it.podcastUrl && !it.spotifyShowId && !it.applePodcastsUrl ? `<a class="aces-btn is-sm" href="${esc(it.podcastUrl)}" target="_blank" rel="noopener">Listen</a>` : ''}
      </div>
    </article>`,
    youtube_playlist: (it) => `<article class="aces-card is-flush media-card">
      ${embed(`https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(it.embedId)}&rel=0`, it.title)}
      <div class="media-card-foot"><strong>${esc(it.title)}</strong>${tag(it)}</div></article>`,
    highlight: (it) => `<article class="aces-card is-flush media-card">
      ${embed(`https://www.youtube.com/embed/${encodeURIComponent(it.embedId)}?rel=0`, it.title)}
      <div class="media-card-foot"><strong>${esc(it.title)}</strong>${tag(it)}</div></article>`,
    youtube_channel: (it) => `<article class="aces-card media-card"${teamAttr(it.team)}>
      <h3 class="media-card-title">${icon('tv')} ${esc(it.title)}</h3>
      <p class="media-desc">${esc(it.description || 'Game footage and highlights on YouTube.')}</p>
      <div class="media-card-foot is-plain">${tag(it)}<a class="aces-btn is-sm" href="${esc(it.channelUrl || '#')}" target="_blank" rel="noopener">${icon('external-link')} Watch on YouTube</a></div></article>`
  };
  const groups = [['podcast', 'Podcast'], ['youtube_playlist', 'Playlists'], ['highlight', 'Highlights'], ['youtube_channel', 'Team channels']];
  el.innerHTML = groups.map(([type, title]) => {
    const list = items.filter(i => i.type === type);
    return list.length ? `<section class="media-group"><h2 class="media-group-title">${esc(title)} <span>${list.length}</span></h2>
      <div class="media-cards">${list.map(card[type]).join('')}</div></section>` : '';
  }).join('');
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

let liveUnsub = null;

function loadLive() {
  const admin = hasRole(ctx.profile, 'admin') && !ctx.impersonating;
  $('mediaLive').innerHTML = `
    <section class="aces-card is-flush media-live">
      <div class="media-live-head"><span class="aces-badge" id="liveBadge">Off air</span><strong id="liveTitle">Aces TV</strong>
        <a class="aces-section-link" href="${CHANNEL_URL}" target="_blank" rel="noopener">YouTube channel</a></div>
      <div class="media-embed is-live" id="liveStage"></div>
    </section>
    <section class="aces-card media-live-notes">
      <ul>
        <li>The stream starts here on its own when a game goes live. No refresh needed.</li>
        <li>No account needed to watch. WiFi gives the best picture.</li>
        <li>Not every game is streamed. You can also watch on the <a href="${CHANNEL_URL}" target="_blank" rel="noopener">Aces YouTube channel</a>.</li>
      </ul>
    </section>
    ${admin ? `<section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('settings')} Stream control</h2><span class="aces-badge is-outline">Admin</span></div>
      <form class="media-admin" data-live-form>
        <label class="aces-field"><span class="aces-label">YouTube link</span><input class="aces-input" name="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></label>
        <label class="aces-field"><span class="aces-label">Title (optional)</span><input class="aces-input" name="title" placeholder="Teal vs Blue" maxlength="80"></label>
        <div class="aces-cluster"><button type="submit" class="aces-btn is-primary is-sm">Go live</button>
          <button type="button" class="aces-btn is-sm" data-live-end>End stream</button></div>
      </form>
    </section>` : ''}`;
  liveUnsub = onSnapshot(doc(db, 'siteConfig', 'streamConfig'), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    const on = !!(d.isLive && d.videoId);
    $('liveBadge').textContent = on ? 'Live' : 'Off air';
    $('liveBadge').className = `aces-badge${on ? ' is-loss media-live-dot' : ''}`;
    $('liveTitle').textContent = on && d.title ? d.title : 'Aces TV';
    $('liveStage').innerHTML = on
      ? `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(d.videoId)}?autoplay=1&modestbranding=1&rel=0&playsinline=1" title="Live game" allowfullscreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe>`
      : `<div class="media-offair">${icon('tv')}<strong>No game on right now</strong><span>When a game is streamed it shows up here automatically.</span></div>`;
  }, (err) => console.warn('[media] stream status unavailable', err));
}

const videoId = (url) => (String(url).match(/(?:v=|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/) || [])[1] || null;

async function setStream(live, url, title) {
  const id = live ? videoId(url) : null;
  if (live && !id) return showToast('Paste a YouTube link first.', 'info');
  try {
    await setDoc(doc(db, 'siteConfig', 'streamConfig'),
      live ? { isLive: true, videoId: id, title: title || '', source: 'manual', updatedAt: new Date().toISOString() }
        : { isLive: false, videoId: null, title: '', updatedAt: new Date().toISOString() });
    showToast(live ? 'The stream is live.' : 'Stream ended.', 'success');
  } catch (err) {
    console.error('[media] stream update failed', err);
    showToast('Could not update the stream.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Upload (captains, team staff, league staff, photographers, admins)
// ---------------------------------------------------------------------------

let files = [];

function loadUpload() {
  const team = String(ctx.profile?.linkedTeam || ctx.profile?.team || '').toLowerCase();
  const opts = ['league', ...[...TEAM_COLORS].sort()].map(f => `<option value="${f}"${f === team ? ' selected' : ''}>${f === 'league' ? 'League (general)' : esc(cap(f))}</option>`).join('');
  $('mediaUpload').innerHTML = `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('upload')} Add photos and videos</h2></div>
      <form class="media-upload" data-upload-form>
        <div class="media-upload-row">
          <label class="aces-field"><span class="aces-label">Team</span><span class="aces-select-wrap"><select class="aces-select" name="folder">${opts}</select></span></label>
          <label class="aces-field"><span class="aces-label">Caption (optional)</span><input class="aces-input" name="caption" placeholder="Team photo" maxlength="80"></label>
        </div>
        <label class="media-drop" data-drop>
          ${icon('camera')}<strong>Choose photos or videos</strong><span>or drop them here. JPG, PNG, GIF, WEBP, MP4 or MOV, up to 50 MB each.</span>
          <input type="file" name="files" accept="image/*,video/mp4,video/quicktime" multiple hidden>
        </label>
        <ul class="media-files" data-files></ul>
        <div class="aces-cluster"><button type="submit" class="aces-btn is-primary" data-upload-btn disabled>Upload</button>
          <button type="button" class="aces-btn is-ghost" data-clear hidden>Clear</button></div>
      </form>
    </section>`;
}

function renderFiles() {
  const list = $('mediaUpload').querySelector('[data-files]');
  list.innerHTML = files.map((f, i) => `<li data-i="${i}" class="${f.state ? `is-${f.state}` : ''}">
    <span class="media-file-name">${esc(f.file.name)}</span><span class="media-file-size">${(f.file.size / 1048576).toFixed(1)} MB</span>
    <span class="media-file-state">${f.state === 'done' ? 'Uploaded' : f.state === 'failed' ? esc(f.error || 'Failed') : f.state === 'uploading' ? 'Uploading...' : ''}</span></li>`).join('');
  const pending = files.filter(f => !f.state || f.state === 'failed').length;
  const btn = $('mediaUpload').querySelector('[data-upload-btn]');
  btn.disabled = !pending;
  btn.textContent = pending ? `Upload ${pending} file${pending === 1 ? '' : 's'}` : 'Upload';
  $('mediaUpload').querySelector('[data-clear]').hidden = !files.length;
}

function addFiles(list) {
  for (const file of list) {
    if (!/^(image|video)\//.test(file.type)) continue;
    files.push(file.size > 50 * 1048576 ? { file, state: 'failed', error: 'Over 50 MB' } : { file });
  }
  renderFiles();
}

async function upload(form) {
  const { uploadPhoto } = await import('../../firebase-storage.js');
  const folder = form.elements.folder.value;
  const caption = form.elements.caption.value.trim() || 'Team photo';
  const todo = files.filter(f => !f.state || (f.state === 'failed' && f.error !== 'Over 50 MB'));
  let n = 0;
  for (const f of todo) {
    f.state = 'uploading';
    renderFiles();
    const label = todo.length > 1 ? `${caption} ${++n}` : caption;
    const res = await uploadPhoto(f.file, folder, label, folder === 'league' ? null : folder);
    f.state = res?.success ? 'done' : 'failed';
    f.error = res?.error || '';
    renderFiles();
  }
  const ok = todo.filter(f => f.state === 'done').length;
  showToast(ok === todo.length ? `Uploaded ${ok} file${ok === 1 ? '' : 's'}.` : `${ok} of ${todo.length} uploaded.`, ok ? 'success' : 'error');
  if (ok) loaded.delete('photos');   // the gallery reloads next time it opens
}

// ---------------------------------------------------------------------------
// Tabs and events
// ---------------------------------------------------------------------------

function tabs() {
  return TABS.filter(t => !t.role || hasRole(ctx.profile, t.role));
}

async function show(id) {
  if (!tabs().some(t => t.id === id)) id = 'photos';
  $('mediaTabs').innerHTML = tabs().map(t => `<a class="aces-tab" href="#${t.id}"${t.id === id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  document.querySelectorAll('[data-tab]').forEach(el => { el.hidden = el.dataset.tab !== id; });
  if (id !== 'live' && liveUnsub) { liveUnsub(); liveUnsub = null; loaded.delete('live'); $('liveStage') && ($('liveStage').innerHTML = ''); }
  if (id !== 'video') document.querySelectorAll('#mediaVideo iframe').forEach(f => { f.src = f.src; });   // stop playback
  if (loaded.has(id)) return;
  loaded.add(id);
  if (id === 'photos') await loadPhotos();
  else if (id === 'video') await loadVideo();
  else if (id === 'live') loadLive();
  else if (id === 'upload') loadUpload();
}

function wire() {
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-folder]');
    if (f) { photos.folder = f.dataset.folder; return renderPhotos(); }
    const t = e.target.closest('[data-type]');
    if (t) { photos.type = t.dataset.type; return renderPhotos(); }
    const o = e.target.closest('[data-open]');
    if (o) return openViewer(Number(o.dataset.open));
    if (e.target.closest('[data-prev]')) return openViewer(photos.at - 1);
    if (e.target.closest('[data-next]')) return openViewer(photos.at + 1);
    if (e.target.closest('[data-close]') || e.target === $('mediaViewer')) return closeViewer();
    if (e.target.closest('[data-live-end]')) return setStream(false);
    if (e.target.closest('[data-clear]')) { files = []; return renderFiles(); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.matches('[data-live-form]')) { e.preventDefault(); setStream(true, e.target.elements.url.value, e.target.elements.title.value.trim()); }
    if (e.target.matches('[data-upload-form]')) { e.preventDefault(); upload(e.target); }
  });
  document.addEventListener('change', (e) => { if (e.target.name === 'files') { addFiles(e.target.files); e.target.value = ''; } });
  document.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('is-over'); } });
  document.addEventListener('dragleave', (e) => { e.target.closest('[data-drop]')?.classList.remove('is-over'); });
  document.addEventListener('drop', (e) => {
    const d = e.target.closest('[data-drop]');
    if (!d) return;
    e.preventDefault();
    d.classList.remove('is-over');
    addFiles(e.dataTransfer.files);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('mediaViewer').open) return;
    if (e.key === 'ArrowLeft') openViewer(photos.at - 1);
    if (e.key === 'ArrowRight') openViewer(photos.at + 1);
  });
  $('mediaViewer').addEventListener('close', () => { $('mediaViewer').querySelector('[data-stage]').innerHTML = ''; });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
}

async function main() {
  ctx = await initPage({ title: 'Media' });
  wire();
  await show(location.hash.slice(1));
  pageReady();
}

main();
