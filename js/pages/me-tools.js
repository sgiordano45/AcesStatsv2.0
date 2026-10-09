// js/pages/me-tools.js
// me.html#tools: the tools your roles open up, grouped by role. Replaced the
// Captain / League Staff / Admin / Contributor tool cards on profile.html.
// Admins see every group (hasRole passes admin for every role).

import { hasRole } from '../core/auth.js';
import { escapeHtml as esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

export const TOOL_GROUPS = [
  { role: 'team-staff', title: 'Captain and team staff', icon: 'clipboard', guide: 'help.html#captains', tools: [
    ['roster-management.html', 'Roster and RSVPs', 'Who’s in, lineups and fielding', 'users'],
    ['submit-score.html', 'Submit scores', 'Final scores for your games', 'hash'],
    ['submit-stats.html', 'Submit stats', 'Player stats for your games', 'calculator'],
    ['game-tracker.html', 'Game tracker', 'Score a game live, play by play', 'clipboard-check'],
    ['manage-team.html', 'Team staff', 'Add or remove co-captains and staff', 'shield'],
    ['captain-roster-edit.html', 'Edit roster info', 'Names, numbers and positions', 'edit'],
    ['team-scouting-report.html', 'Scouting report', 'Your next opponent at a glance', 'binoculars'],
    ['media.html#upload', 'Team photos', 'Upload photos from games', 'camera']
  ] },
  { role: 'league-staff', title: 'League staff', icon: 'settings', guide: 'help.html#league-staff', tools: [
    ['admin/index.html', 'Admin home', 'To-dos and every staff tool', 'grid'],
    ['admin/league-staff.html', 'League staff admin', 'Seasons, games and settings', 'sliders'],
    ['offseason.html', 'Offseason hub', 'Rosters, schedule and the draft', 'leaf'],
    ['offseason-roster.html', 'Offseason rosters', 'Team assignments for next season', 'users'],
    ['admin/schedule.html', 'Schedule', 'Build, tune, publish and fix it', 'calendar-days']
  ] },
  { role: 'admin', title: 'Admin', icon: 'shield-check', tools: [
    ['approve-links.html', 'Approve player links', 'Pending account-to-player requests', 'user-check'],
    ['admin/link-players.html', 'Link players', 'Connect accounts to player records', 'link'],
    ['admin/user-management.html', 'User management', 'Accounts, roles and View As', 'users'],
    ['admin/roles.html', 'Role updater', 'Change roles in bulk', 'shield'],
    ['admin/stats.html', 'Stats pipeline', 'Stats in, review, aggregate, badges', 'refresh'],
    ['admin/badges.html', 'Badge calculator', 'Award player badges', 'medal'],
    ['admin/games.html', 'Games admin', 'Daily games content', 'gamepad'],
    ['admin/content.html', 'Content tools', 'Announcements and site content', 'megaphone'],
    ['admin/features.html', 'Feature requests', 'What members have asked for', 'message']
  ] },
  { role: 'contributor', title: 'Contributor', icon: 'sparkles', tools: [
    ['contributor.html', 'Contributor dashboard', 'Recaps, previews and photos', 'edit']
  ] }
];

/** True when the profile has any tool group. */
export function hasTools(profile) {
  return TOOL_GROUPS.some(g => hasRole(profile, g.role));
}

/**
 * @param {HTMLElement} el
 * @param {{ profile: object }} o
 */
export function mountTools(el, { profile }) {
  const groups = TOOL_GROUPS.filter(g => hasRole(profile, g.role));
  el.innerHTML = groups.length ? groups.map(g => `
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon(g.icon)} ${esc(g.title)}</h2>
        ${g.guide ? `<a class="aces-section-link" href="${g.guide}">Guide</a>` : ''}</div>
      <ul class="me-toolgrid">${g.tools.map(([href, name, desc, ic]) => `<li><a class="me-tool" href="${href}">
        <span class="me-todo-icon">${icon(ic)}</span><span class="me-todo-text"><strong>${esc(name)}</strong><span>${esc(desc)}</span></span></a></li>`).join('')}</ul>
    </section>`).join('')
    : '<section class="aces-card"><p class="me-empty">No staff tools for your account.</p></section>';
}
