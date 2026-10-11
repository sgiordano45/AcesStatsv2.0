// js/admin/captain-digest.js
// The Tuesday milestone email (functions/captain-digest.js) on the stats
// pipeline page: preview any team's email or the league staff email as it
// would go out now, see who gets it, and send a test to yourself.
// Calls triggerCaptainDigest (admin only).

import { functions } from '../core/firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const call = (data) => httpsCallable(functions, 'triggerCaptainDigest')(data).then((r) => r.data);
let preview = null;

function frame(html) {
  const f = document.createElement('iframe');
  f.className = 'cdg-frame';
  f.setAttribute('title', 'Email preview');
  f.setAttribute('sandbox', '');
  f.srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:12px;background:#fff;">${html}</body>`;
  return f;
}

async function load(box) {
  box.querySelector('[data-cdg-body]').innerHTML = '<span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span>';
  try {
    preview = await call({ dryRun: true });
  } catch (err) {
    console.error('[captain digest] preview', err);
    box.querySelector('[data-cdg-body]').innerHTML = `<p class="cdg-note">${icon('alert-circle')} Preview unavailable: ${esc(err.message || err)}. Is triggerCaptainDigest deployed?</p>`;
    return;
  }
  render(box);
}

/** A team's captains: names, and which email each one gets. */
function who(t) {
  const list = t.captains || [];
  if (!list.length) return '<span class="cdg-warn">No captain with an email</span>';
  return list.map((c) => `<span class="cdg-who" title="${esc(c.to)}">${esc(c.name || c.to)}${c.via === 'staff' ? ' <span class="cdg-dim">(staff email)</span>' : ''}</span>`).join('<br>')
    + (t.quiet ? '<br><span class="cdg-dim">Not sent this week</span>' : '');
}

function render(box) {
  const p = preview;
  if (!p?.seasonId) { box.querySelector('[data-cdg-body]').innerHTML = '<p class="cdg-note">No season in progress, so nothing would go out.</p>'; return; }
  const byTeam = new Map();
  p.recipients.forEach((r) => { if (!byTeam.has(r.team)) byTeam.set(r.team, []); byTeam.get(r.team).push(r.to); });
  box.querySelector('[data-cdg-body]').innerHTML = `
    <div class="aces-table-wrap"><table class="aces-table is-compact cdg-table">
      <thead><tr><th scope="col">Email</th><th scope="col">Subject</th><th scope="col">Captains</th><th scope="col"></th></tr></thead>
      <tbody>
        <tr><th scope="row">League staff</th><td>${esc(p.staff.subject)}</td><td>${(byTeam.get('All') || []).length} staff</td>
          <td><button type="button" class="aces-btn is-sm is-ghost" data-cdg-view="All">Preview</button>
              <button type="button" class="aces-btn is-sm is-ghost" data-cdg-test="">Send me a test</button></td></tr>
        ${p.teams.map((t) => `<tr${t.quiet ? ' class="is-quiet"' : ''}><th scope="row">${esc(t.team)}</th>
          <td>${t.quiet ? '<span class="cdg-dim">Nothing to report; not sent</span>' : esc(t.subject)}</td>
          <td>${who(t)}</td>
          <td><button type="button" class="aces-btn is-sm is-ghost" data-cdg-view="${esc(t.team)}">Preview</button>
              <button type="button" class="aces-btn is-sm is-ghost" data-cdg-test="${esc(t.team)}">Send me a test</button></td></tr>`).join('')}
      </tbody>
    </table></div>
    <p class="cdg-note">Captains come from the roster's captain flag and team roles. League staff who captain get the staff email, which includes their team. Anyone with no email on their profile (users/{id}) or who turned it off isn't listed. It sends Tuesdays at 8:52 AM ET.</p>`;
}

async function view(team) {
  const p = preview;
  if (!p) return;
  const m = team === 'All' ? p.staff : p.teams.find((t) => t.team === team);
  if (!m) return;
  const to = p.recipients.filter((r) => r.team === team).map((r) => r.to);
  const body = document.createElement('div');
  body.className = 'cdg-view';
  body.innerHTML = `<p class="cdg-meta"><strong>Subject:</strong> ${esc(m.subject)}<br><strong>To:</strong> ${to.length ? esc(to.join(', ')) : 'no one'}</p>`;
  body.appendChild(frame(m.html));
  await openModal({ title: team === 'All' ? 'League staff email' : `${team} email`, body, wide: true, actions: [{ label: 'Close', value: true }] });
}

async function test(team, btn) {
  btn.disabled = true;
  try {
    const r = await call({ testTo: true, team });
    showToast(r.sent ? 'Test sent to your email.' : `Nothing sent${r.message ? `: ${r.message}` : ''}.`, r.sent ? 'success' : 'info');
  } catch (err) {
    console.error('[captain digest] test', err);
    showToast(`Test failed: ${err.message || err}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

export function mountCaptainDigest(box) {
  if (!box) return;
  box.innerHTML = `<section class="aces-card cdg">
    <div class="cdg-head">
      <h2 class="adm-heading">${icon('mail')} Tuesday milestone email</h2>
      <button type="button" class="aces-btn is-sm" data-cdg-load>${icon('eye')} Preview this week's</button>
    </div>
    <p class="cdg-note">Captains get their team: players within reach of career hits, runs or games played milestones, hit streaks of 10+, milestones reached last week, and games missing stats. League staff get every team.</p>
    <div data-cdg-body></div>
  </section>`;
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-cdg-load]')) { load(box); return; }
    const v = e.target.closest('[data-cdg-view]');
    if (v) { view(v.dataset.cdgView); return; }
    const t = e.target.closest('[data-cdg-test]');
    if (t) test(t.dataset.cdgTest, t);
  });
}
