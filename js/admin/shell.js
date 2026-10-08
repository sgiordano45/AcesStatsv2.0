// js/admin/shell.js
// The sidebar every /admin/ page shares: every tool by job (catalog.js),
// filtered to the viewer's roles, with a find box and the phone menu button.
// The page needs #adminNav, #adminFilter and #adminMenuBtn (see admin/index.html).

import { siteUrl } from '../core/app.js';
import { hasRole } from '../core/auth.js';
import { ADMIN_GROUPS } from './catalog.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);
const norm = (s) => String(s).toLowerCase();

function render(profile, here) {
  const q = norm($('adminFilter')?.value || '');
  const groups = [{ id: 'home', label: 'Admin', icon: 'grid', items: [['admin/index.html', 'Admin home', 'To-dos and site status', 'league-staff']] }, ...ADMIN_GROUPS];
  $('adminNav').innerHTML = groups.map(g => {
    const items = g.items.filter(([, , , role]) => hasRole(profile, role))
      .filter(([page, name, desc]) => !q || norm(`${name} ${desc} ${page}`).includes(q));
    return items.length ? `<section class="adm-group">
      <h2 class="adm-group-title">${icon(g.icon)} ${esc(g.label)}</h2>
      <ul>${items.map(([page, name, desc]) => `<li><a href="${esc(siteUrl(page))}" title="${esc(desc)}"${page === here ? ' aria-current="page"' : ''}>${esc(name)}</a></li>`).join('')}</ul>
    </section>` : '';
  }).join('') || '<p class="adm-none">No tools match.</p>';
}

/**
 * @param {object} profile  the viewer (View-As aware)
 * @param {string} here     this page's catalog path, e.g. 'admin/stats.html'
 */
export function mountAdminShell(profile, here) {
  render(profile, here);
  $('adminFilter')?.addEventListener('input', () => render(profile, here));
  $('adminMenuBtn')?.addEventListener('click', () => document.body.classList.toggle('adm-nav-open'));
  const who = $('adminWho');
  if (who) who.textContent = hasRole(profile, 'admin') ? 'Admin' : 'League staff';
}
