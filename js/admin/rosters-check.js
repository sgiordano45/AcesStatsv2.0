// js/admin/rosters-check.js
// "Check & fix" tab of admin/rosters.html: one scan of the season's saved
// rosters for the problems the old Roster Sync tools each looked for.
//   Account not linked   no authId, but an account's linkedPlayer has this name
//   Account ID as the ID id holds a Firebase UID; the legacy ID is recovered
//                        from the account (mergedFromProfile, else its name)
//   ID doesn't match     id differs from the linked account's mergedFromProfile
//                        (stats are filed under one of them; game counts shown)
//   On two teams         the same player on more than one team
//   Profile differs      number, position, bats or throws differ from the
//                        player's profile; copy either way
// Fixes write straight away, to the roster doc or the profile.

import { db, collection, getDocs, doc, setDoc, updateDoc } from '../core/firebase.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { confirmModal } from '../ui/modal.js';
import { S, teamList, isDirty, isAuthUid, toLegacyId, clean, loadUsers } from './rosters-data.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const FIELDS = [['number', 'Number'], ['position', 'Position'], ['bats', 'Bats'], ['throws', 'Throws']];

let hooks = null;
let issues = [];
let scanned = '';

function profileFor(p, users) {
  return (p.authId && users.find(u => u.uid === p.authId)) || (p.id && users.find(u => u.mergedFromProfile === p.id)) || null;
}

async function gameCount(id) {
  try { return (await getDocs(collection(db, 'playerStats', id, 'games'))).size; } catch { return null; }
}

async function scan() {
  if (teamList().some(isDirty)) { showToast('Save or undo your roster changes first', 'error'); return; }
  const btn = $('chkScan');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  try {
    const users = await loadUsers(true);
    const byLinked = new Map();
    users.forEach(u => { if (u.migrated !== true && u.linkedPlayer) byLinked.set(String(u.linkedPlayer).trim().toLowerCase(), u); });
    const out = [];
    const seen = new Map();
    for (const t of teamList()) {
      t.players.forEach(p => {
        const ref = { team: t.key, teamName: t.teamName, pid: p.id, name: p.name };
        const k = p.id || p.name.toLowerCase();
        (seen.get(k) || seen.set(k, []).get(k)).push(t.teamName);

        if (isAuthUid(p.id)) {
          const u = users.find(x => x.uid === p.id);
          const legacy = u?.mergedFromProfile || (u?.linkedPlayer ? toLegacyId(u.linkedPlayer) : '');
          out.push({ ...ref, kind: 'uid', text: `ID is an account ID (${p.id.slice(0, 10)}...)`, fix: legacy ? { id: legacy, authId: p.id } : null, fixText: legacy ? `Use ${legacy}, keep the account linked` : 'No player ID found on the account; fix by hand' });
          return;
        }
        if (!p.authId) {
          const u = byLinked.get(p.name.trim().toLowerCase());
          if (u) out.push({ ...ref, kind: 'link', text: 'Has an account that isn\'t linked', fix: { authId: u.uid }, fixText: `Link ${u.displayName || u.email || u.uid}` });
        } else {
          const u = users.find(x => x.uid === p.authId);
          if (u?.mergedFromProfile && u.mergedFromProfile !== p.id) {
            out.push({ ...ref, kind: 'id', text: `Roster ID ${p.id || '(none)'}, account says ${u.mergedFromProfile}`, fix: { id: u.mergedFromProfile }, fixText: `Use ${u.mergedFromProfile}`, ids: [p.id, u.mergedFromProfile] });
          }
        }
        const prof = profileFor(p, users);
        if (prof) {
          const diffs = FIELDS.filter(([f]) => clean(p[f]) !== clean(prof[f])).map(([f, l]) => ({ f, l, roster: clean(p[f]), profile: clean(prof[f]) }));
          if (diffs.length) out.push({ ...ref, kind: 'fields', uid: prof.uid, diffs, text: diffs.map(d => `${d.l}: roster ${d.roster ?? '-'}, profile ${d.profile ?? '-'}`).join('; ') });
        }
      });
    }
    seen.forEach((teams, k) => {
      if (teams.length > 1) out.push({ kind: 'dupe', name: k, teamName: teams.join(', '), text: `On ${teams.join(' and ')}`, fix: null, fixText: 'Remove them from one team in the Teams tab' });
    });
    // Game counts help pick the right ID
    await Promise.all(out.filter(i => i.kind === 'id').map(async i => {
      const [a, b] = await Promise.all(i.ids.map(gameCount));
      i.counts = [a, b];
    }));
    issues = out;
    scanned = S.seasonId;
    render();
  } catch (err) {
    console.error('[rosters] check failed', err);
    showToast(`Check failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check again';
  }
}

const KIND = {
  uid: ['Account ID as the player ID', 'is-loss'],
  id: ['ID doesn\'t match the account', 'is-loss'],
  link: ['Account not linked', 'is-alert'],
  dupe: ['On two teams', 'is-loss'],
  fields: ['Profile differs', 'is-outline']
};

function render() {
  const n = (k) => issues.filter(i => i.kind === k).length;
  $('chkSummary').innerHTML = [['Account IDs', n('uid')], ['ID mismatches', n('id')], ['Not linked', n('link')], ['Two teams', n('dupe')], ['Profile differs', n('fields')]]
    .map(([l, v]) => `<div class="aces-stat"><span class="aces-stat-value">${v}</span><span class="aces-stat-label">${l}</span></div>`).join('');
  $('chkResults').hidden = false;
  $('chkLinkAll').disabled = !issues.some(i => (i.kind === 'link' || i.kind === 'uid') && i.fix);
  $('chkProfileAll').disabled = !n('fields');
  if (!issues.length) {
    $('chkList').innerHTML = `<p class="sse-empty">${icon('check')} Nothing to fix in ${esc(S.seasonId)}.</p>`;
    return;
  }
  const order = ['uid', 'id', 'dupe', 'link', 'fields'];
  const rows = [...issues].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.teamName.localeCompare(b.teamName));
  $('chkList').innerHTML = `<div class="aces-table-wrap"><table class="aces-table chk-table">
    <thead><tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Problem</th><th scope="col">Fix</th></tr></thead>
    <tbody>${rows.map(i => {
      const idx = issues.indexOf(i);
      let fix;
      if (i.kind === 'fields') {
        fix = `<div class="sse-actions"><button class="aces-btn is-sm" type="button" data-fix="${idx}" data-dir="roster">Profile to roster</button><button class="aces-btn is-sm is-ghost" type="button" data-fix="${idx}" data-dir="profile">Roster to profile</button></div>`;
      } else if (i.fix) {
        fix = `<button class="aces-btn is-sm" type="button" data-fix="${idx}">${esc(i.fixText)}</button>`;
      } else {
        fix = `<span class="sse-dim">${esc(i.fixText)}</span>`;
      }
      const counts = i.counts ? `<span class="sse-dim chk-counts">Games filed: ${esc(i.ids[0] || '(none)')} ${i.counts[0] ?? '?'}, ${esc(i.ids[1])} ${i.counts[1] ?? '?'}</span>` : '';
      return `<tr${i.done ? ' class="is-done"' : ''}><th scope="row">${esc(i.name)}</th><td>${esc(i.teamName)}</td>
        <td><span class="aces-badge ${KIND[i.kind][1]}">${KIND[i.kind][0]}</span> <span class="chk-text">${esc(i.text)}</span>${counts}</td>
        <td>${i.done ? `<span class="chk-done">${icon('check')} ${esc(i.done)}</span>` : fix}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/** Updates one player on a saved roster doc (and in the page's copy). */
async function patchRoster(issue, patch) {
  const t = S.teams.get(issue.team);
  const p = t.players.find(x => x.id === issue.pid && x.name === issue.name) || t.players.find(x => x.name === issue.name);
  if (!p) throw new Error(`${issue.name} is no longer on ${issue.teamName}`);
  Object.assign(p, patch);
  await setDoc(doc(db, 'rosters', t.docId), { players: t.players, updatedAt: new Date().toISOString() }, { merge: true });
  t.base = JSON.stringify(t.players);
  if (patch.id) issue.pid = patch.id;
}

async function fixOne(idx, dir) {
  const i = issues[idx];
  if (!i || i.done) return;
  if (isDirty(S.teams.get(i.team))) { showToast('Save or undo your roster changes first', 'error'); return; }
  try {
    if (i.kind === 'id' && !(await confirmModal(`Change ${i.name}'s roster ID from ${i.ids[0] || '(none)'} to ${i.ids[1]}? Enter stats, the tracker and lineups look stats up by this ID. Games filed under each: ${i.counts?.[0] ?? '?'} and ${i.counts?.[1] ?? '?'}.`, { confirmLabel: 'Change ID' }))) return;
    if (i.kind === 'fields') {
      if (dir === 'roster') {
        const patch = Object.fromEntries(i.diffs.filter(d => d.profile !== null).map(d => [d.f, d.profile]));
        await patchRoster(i, patch);
      } else {
        const patch = Object.fromEntries(i.diffs.filter(d => d.roster !== null).map(d => [d.f, d.roster]));
        if (Object.keys(patch).length) await updateDoc(doc(db, 'users', i.uid), { ...patch, updatedAt: new Date().toISOString() });
      }
      i.done = dir === 'roster' ? 'Roster updated' : 'Profile updated';
    } else {
      await patchRoster(i, i.fix);
      i.done = 'Fixed';
    }
    render();
  } catch (err) {
    console.error('[rosters] fix failed', err);
    showToast(`Could not fix: ${err.message}`, 'error');
  }
}

async function fixAll(kinds, dir) {
  const list = issues.filter(i => kinds.includes(i.kind) && !i.done && (i.fix || i.kind === 'fields'));
  if (!list.length) return;
  const what = kinds.includes('fields') ? `Copy profile values onto ${plural(list.length, 'roster entry', 'roster entries')}?` : `Link ${plural(list.length, 'player')} to their accounts?`;
  if (!(await confirmModal(what, { confirmLabel: 'Fix all' }))) return;
  for (const i of list) await fixOne(issues.indexOf(i), dir);
  showToast('Done', 'success');
  hooks.reload();
}

export function refreshCheck(seasonChanged = false) {
  if (seasonChanged && scanned !== S.seasonId) {
    issues = [];
    $('chkResults').hidden = true;
    $('chkScan').textContent = 'Check this season';
  }
}

export function mountCheck(h) {
  hooks = h;
  $('chkScan').addEventListener('click', scan);
  $('chkList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fix]');
    if (b) fixOne(Number(b.dataset.fix), b.dataset.dir);
  });
  $('chkLinkAll').addEventListener('click', () => fixAll(['link', 'uid']));
  $('chkProfileAll').addEventListener('click', () => fixAll(['fields'], 'roster'));
}
