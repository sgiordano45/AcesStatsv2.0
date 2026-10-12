// js/admin/team-audit.js
// admin/team-audit.html: currentTeam vs roster audit (league staff).
//
// Compares currentTeam on every aggregatedPlayerStats doc with the
// rosters/{seasonId}-{team} docs for one season. Players are matched by legacy
// id, then doc id as authId, then mergedFromProfile, then name. A player's
// linked docs (the live authId doc and a migrated legacy doc) are grouped into
// one row, and a fix writes currentTeam = roster team to every doc in the
// group. Nothing is written on a scan.
//
// Flags: wrong team, blank currentTeam, on 2+ rosters, rostered with no stats
// doc, and a stats doc with a currentTeam but no roster spot this season.

import { initPage, pageReady } from '../core/app.js';
import { db, collection, getDocs, doc, writeBatch } from '../core/firebase.js';
import { getAllSeasons } from '../data/seasons.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';
import { escapeHtml as esc } from '../ui/format.js';
import { confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { mountAdminShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const STATUS = {
  mismatch: ['Wrong team', 'is-loss'],
  missing: ['Blank', 'is-alert'],
  multi: ['Multiple rosters', 'is-alert'],
  rosteronly: ['No stats doc', 'is-outline'],
  norost: ['Not rostered', 'is-outline'],
  match: ['Match', 'is-win']
};
const ISSUES = new Set(['mismatch', 'missing', 'multi', 'rosteronly']);
const FIXABLE = new Set(['mismatch', 'missing']);
const FILTERS = [['issues', 'Issues'], ['mismatch', 'Wrong team'], ['missing', 'Blank'], ['multi', 'Multiple rosters'],
  ['rosteronly', 'No stats doc'], ['norost', 'Not rostered'], ['match', 'Match'], ['all', 'All']];

const S = { rows: [], filter: 'issues', q: '', rosterDocs: 0 };

const normName = (s) => String(s || '').toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim();
const toLegacy = (s) => String(s || '').toLowerCase().replace(/[.']/g, '').trim().replace(/\s+/g, '_');
const titleCase = (s) => String(s || '').split(/[-\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const sameTeam = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const docsToFix = (r) => (r.fixTeam ? r.docs.filter((x) => x.currentTeam !== r.fixTeam) : []);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function note(msg, kind = '') {
  $('taNote').innerHTML = msg ? `<p class="aces-notice${kind ? ` is-${kind}` : ''}">${msg}</p>` : '';
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

async function scan() {
  const seasonId = $('taSeason').value;
  if (!seasonId) return;
  $('taScan').disabled = true;
  $('taFixAll').disabled = true;
  note('Loading rosters and aggregatedPlayerStats...');
  try {
    const [rostersSnap, aggSnap] = await Promise.all([
      getDocs(collection(db, 'rosters')),
      getDocs(collection(db, 'aggregatedPlayerStats'))
    ]);

    const entries = [];
    const byLegacy = {}, byAuth = {}, byName = {};
    const push = (map, k, e) => { if (k) (map[k] = map[k] || []).push(e); };
    const prefix = `${seasonId}-`;
    let rosterDocs = 0;
    rostersSnap.forEach((d) => {
      if (!d.id.startsWith(prefix)) return;
      rosterDocs++;
      const data = d.data();
      const team = data.teamName || titleCase(d.id.slice(prefix.length));
      (data.players || []).forEach((p, i) => {
        const e = { key: `${d.id}#${i}`, team, name: p.name || p.id || '?', id: p.id || '', authId: p.authId || '', matched: false };
        entries.push(e);
        push(byLegacy, e.id, e);
        push(byAuth, e.authId, e);
        push(byName, normName(e.name), e);
      });
    });
    if (!rosterDocs) { note(`No rosters/${esc(seasonId)}-* docs found.`, 'warning'); S.rows = []; render(); return; }

    // Every stats doc (migrated included) to its roster entries
    const docs = [], byId = {};
    aggSnap.forEach((d) => {
      const data = d.data();
      const legacyId = data.isAuthUser && data.linkedPlayer ? toLegacy(data.linkedPlayer) : d.id;
      const tries = [
        ['legacy id', byLegacy[legacyId]],
        ['doc id', byLegacy[d.id]],
        ['authId', byAuth[d.id]],
        ['mergedFromProfile', data.mergedFromProfile ? byLegacy[data.mergedFromProfile] : null],
        ['name', byName[normName(data.name || data.linkedPlayer)]]
      ];
      let hits = [], via = '';
      for (const [label, list] of tries) if (list && list.length) { hits = list; via = label; break; }
      const info = {
        docId: d.id, migrated: data.migrated === true, legacyId,
        name: data.name || data.linkedPlayer || data.displayName || d.id,
        currentTeam: String(data.currentTeam || '').trim(), hits, via
      };
      docs.push(info);
      byId[d.id] = info;
    });

    // Group docs that belong to one person
    const parent = {};
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    docs.forEach((x) => { parent[x.docId] = x.docId; });
    const firstDoc = {};
    docs.forEach((x) => {
      x.hits.forEach((h) => {
        h.matched = true;
        if (firstDoc[h.key]) union(x.docId, firstDoc[h.key]); else firstDoc[h.key] = x.docId;
      });
      if (x.legacyId !== x.docId && byId[x.legacyId]) union(x.docId, x.legacyId);
    });
    const groups = {};
    docs.forEach((x) => { const r = find(x.docId); (groups[r] = groups[r] || []).push(x); });

    const rows = [];
    Object.values(groups).forEach((g) => {
      g.sort((a, b) => (a.migrated - b.migrated) || a.docId.localeCompare(b.docId));
      const live = g.filter((x) => !x.migrated);
      const hitMap = {};
      g.forEach((x) => x.hits.forEach((h) => { hitMap[h.key] = h; }));
      const hits = Object.values(hitMap);
      const name = (live[0] || g[0]).name;
      const via = [...new Set(g.filter((x) => x.via).map((x) => x.via))].join(', ');
      if (!hits.length) {
        if (!live.length || !g.some((x) => x.currentTeam)) return;   // inactive or historical
        rows.push({ status: 'norost', name, docs: g, rosterTeam: '', fixTeam: '', via: '' });
        return;
      }
      const teams = [...new Set(hits.map((h) => h.team))];
      let status;
      if (!live.length) status = 'rosteronly';
      else if (teams.length > 1) status = 'multi';
      else {
        const wrong = g.some((x) => x.currentTeam && !sameTeam(x.currentTeam, teams[0]));
        const blank = g.some((x) => !x.currentTeam);
        status = wrong ? 'mismatch' : blank ? 'missing' : 'match';
      }
      rows.push({ status, name, docs: g, rosterTeam: teams.join(' / '), fixTeam: teams.length === 1 ? teams[0] : '', via });
    });
    entries.filter((e) => !e.matched).forEach((e) => {
      rows.push({ status: 'rosteronly', name: e.name, docs: [], rosterId: e.id, rosterTeam: e.team, fixTeam: '', via: '' });
    });

    const order = { mismatch: 0, missing: 1, multi: 2, rosteronly: 3, norost: 4, match: 5 };
    rows.sort((a, b) => (order[a.status] - order[b.status]) || a.rosterTeam.localeCompare(b.rosterTeam) || a.name.localeCompare(b.name));
    S.rows = rows;
    S.rosterDocs = rosterDocs;
    render();
    const issues = rows.filter((r) => ISSUES.has(r.status)).length;
    const fixable = rows.filter((r) => FIXABLE.has(r.status) && docsToFix(r).length).length;
    note(issues
      ? `${plural(issues, 'issue')} across ${plural(rosterDocs, 'roster doc')} (${fixable} can be fixed here).`
      : `Every rostered player matches their roster team across ${plural(rosterDocs, 'roster doc')}.`, issues ? 'warning' : 'success');
  } catch (err) {
    console.error('[team-audit] scan', err);
    note(`The audit failed: ${esc(err.message)}`, 'error');
  } finally {
    $('taScan').disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const box = $('taResults');
  $('taFixAll').disabled = !S.rows.some((r) => FIXABLE.has(r.status) && docsToFix(r).length);
  if (!S.rows.length) { box.innerHTML = ''; return; }
  const counts = {};
  S.rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const q = S.q.trim().toLowerCase();
  const visible = S.rows.filter((r) => {
    if (S.filter === 'issues' && !ISSUES.has(r.status)) return false;
    if (S.filter !== 'issues' && S.filter !== 'all' && r.status !== S.filter) return false;
    if (q && !`${r.name} ${r.rosterTeam} ${r.rosterId || ''} ${r.docs.map((x) => `${x.docId} ${x.legacyId} ${x.currentTeam}`).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const chips = FILTERS.map(([id, label]) => {
    const n = id === 'issues' ? S.rows.filter((r) => ISSUES.has(r.status)).length : id === 'all' ? S.rows.length : (counts[id] || 0);
    return `<button type="button" class="aces-chip" data-filter="${id}" aria-pressed="${S.filter === id}">${label} <small>${n}</small></button>`;
  }).join('');
  const body = visible.length ? visible.map((r) => {
    const i = S.rows.indexOf(r);
    const n = docsToFix(r).length;
    const [label, cls] = STATUS[r.status];
    const docCell = r.docs.length
      ? r.docs.map((x) => `<code>${esc(x.docId)}</code>${x.migrated ? ' <small>(migrated)</small>' : ''} &rarr; <strong>${esc(x.currentTeam || '-')}</strong>`).join('<br>')
      : `<small>roster id: ${esc(r.rosterId || '-')}</small>`;
    return `<tr>
      <td><strong>${esc(r.name)}</strong></td>
      <td class="is-wrap">${docCell}</td>
      <td>${esc(r.rosterTeam || '-')}</td>
      <td><small>${esc(r.via || '-')}</small></td>
      <td><span class="aces-badge ${cls}">${label}</span></td>
      <td>${FIXABLE.has(r.status) && n ? `<button type="button" class="aces-btn is-sm" data-fix="${i}">Set ${plural(n, 'doc')} to ${esc(r.fixTeam)}</button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="ta-empty">Nothing for this filter.</td></tr>';
  box.innerHTML = `
    <div class="ta-tools"><div class="aces-chip-row">${chips}</div>
      <input class="aces-input ta-search" type="search" data-search placeholder="Search player, team or id" value="${esc(S.q)}" aria-label="Search"></div>
    <div class="aces-table-wrap"><table class="aces-table ta-table">
      <thead><tr><th>Player</th><th>Stats docs and currentTeam</th><th>Roster team</th><th>Matched by</th><th>Status</th><th></th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Fixes
// ---------------------------------------------------------------------------

async function fixRow(r) {
  const targets = docsToFix(r);
  if (!targets.length) return;
  try {
    const batch = writeBatch(db);
    targets.forEach((x) => batch.update(doc(db, 'aggregatedPlayerStats', x.docId), { currentTeam: r.fixTeam }));
    await batch.commit();
    targets.forEach((x) => { x.currentTeam = r.fixTeam; });
    r.status = 'match';
    render();
    showToast(`${r.name}: set to ${r.fixTeam}.`, 'success');
  } catch (err) {
    console.error('[team-audit] fix', err);
    showToast(`Couldn't update ${r.name}: ${err.message}`, 'error');
  }
}

async function fixAll() {
  const rows = S.rows.filter((r) => FIXABLE.has(r.status) && docsToFix(r).length);
  const updates = [];
  rows.forEach((r) => docsToFix(r).forEach((x) => updates.push({ x, team: r.fixTeam })));
  if (!updates.length) return;
  const ok = await confirmModal(`Set currentTeam on ${plural(updates.length, 'stats doc')} for ${plural(rows.length, 'player')} to their roster team?`, { title: 'Fix all', confirmLabel: 'Fix all' });
  if (!ok) return;
  $('taFixAll').disabled = true;
  try {
    for (let i = 0; i < updates.length; i += 400) {
      const batch = writeBatch(db);
      updates.slice(i, i + 400).forEach((u) => batch.update(doc(db, 'aggregatedPlayerStats', u.x.docId), { currentTeam: u.team }));
      await batch.commit();
    }
    updates.forEach((u) => { u.x.currentTeam = u.team; });
    rows.forEach((r) => { r.status = 'match'; });
    render();
    note(`Done: ${plural(updates.length, 'doc')} updated for ${plural(rows.length, 'player')}.`, 'success');
  } catch (err) {
    console.error('[team-audit] fix all', err);
    note(`Fixing failed partway: ${esc(err.message)}. Run the audit again to see what's left.`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const ctx = await initPage({ title: 'Team audit', role: 'league-staff', deniedMessage: 'The team audit is for league staff.' });
  mountAdminShell(ctx.profile, 'admin/team-audit.html');
  const seasons = (await getAllSeasons().catch(() => []))
    .filter((s) => /^\d{4}-(spring|summer|fall)$/.test(s.id))
    .sort((a, b) => seasonSortKey(b.id) - seasonSortKey(a.id));
  const current = seasons.find((s) => s.isActive)?.id || seasons[0]?.id || '';
  $('taSeason').innerHTML = seasons.map((s) => `<option value="${esc(s.id)}"${s.id === current ? ' selected' : ''}>${esc(seasonLabel(s.id))}</option>`).join('');
  $('taSeason').addEventListener('change', () => { S.rows = []; note(''); render(); });
  $('taScan').addEventListener('click', scan);
  $('taFixAll').addEventListener('click', fixAll);
  $('taResults').addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { S.filter = f.dataset.filter; render(); return; }
    const b = e.target.closest('[data-fix]');
    if (b) { b.disabled = true; fixRow(S.rows[Number(b.dataset.fix)]); }
  });
  $('taResults').addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    S.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const box = $('taResults').querySelector('[data-search]');
    box.focus();
    try { box.setSelectionRange(pos, pos); } catch { /* search inputs */ }
  });
  pageReady();
}

main().catch((err) => { console.error('[team-audit]', err); });
