// js/pages/player-badges.js
// player.html Badges tab: badges earned in each season (from 2025 Fall, when
// the badge calculator started), grouped by kind, with a season picker and
// progress toward the next tier. pitcher.html's pitching-only list is the
// Pitching group here.
//
// Data: playerBadges/{seasonId}_{legacyId} (loaded by player.js as ctx.badges,
// newest first: { seasonId, label, earned: { id: badge }, progress: { id: { current, max } } }).
// Names, tiers and images come from BADGE_DEFINITIONS in badge-calculator.js.

import { siteUrl } from '../core/app.js';
import { openModal } from '../ui/modal.js';
import { esc, icon, card, empty, emptyCard, cap, shortDate } from './player-shared.js';

const GROUPS = [
  ['hitting', 'Hitting', 'bat'],
  ['pitching', 'Pitching', 'softball'],
  ['two-way', 'Two-way', 'arrow-left-right'],
  ['milestone', 'Milestones', 'flag'],
  ['hidden', 'Hidden', 'sparkles']
];
const TIER_ORDER = { gold: 0, silver: 1, bronze: 2 };

let DEFS = {};

function imageFor(id, badge) {
  const def = DEFS[badge.badgeId || id] || {};
  const base = String(badge.iconPath || def.iconPath || '').replace(/^\//, '').replace(/\.png$/, '');
  if (!base) return '';
  const tier = def.type === 'tiered' && badge.tier && !badge.iconPath ? `-${badge.tier}` : '';
  return siteUrl(`${base}${tier}.png`);
}

function valueLabel(id) {
  const k = String(id || '').toLowerCase();
  if (k.includes('streak') || k.includes('ironman')) return 'Games';
  if (k.includes('hits') || k.includes('multihit')) return 'Hits';
  if (k.includes('runs') || k.includes('biggames')) return 'Runs';
  if (k.includes('walks')) return 'Walks';
  if (k.includes('innings')) return 'Innings';
  return 'Value';
}

function earnedOn(b) {
  const v = b.earnedAt || b.gameDate || b.earnedDate;
  if (!v) return '';
  const d = v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : shortDate(d);
}

function badgeArt(id, b, cls = '') {
  const src = imageFor(id, b);
  return `<span class="pl-badge-art ${cls}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" data-badge-img>` : icon('medal')}</span>`;
}

function badgeCard(id, b, i) {
  const def = DEFS[b.badgeId || id] || {};
  return `<button type="button" class="pl-badge${b.tier ? ` is-${esc(b.tier)}` : ''}" data-badge="${i}">
    ${badgeArt(id, b)}
    <span class="pl-badge-name">${esc(b.name || def.name || id)}</span>
    <span class="pl-badge-sub">${esc([b.tier ? cap(b.tier) : '', def.name && def.name !== b.name ? def.name : ''].filter(Boolean).join(' · '))}</span>
  </button>`;
}

function progressRows(season) {
  const out = [];
  Object.entries(season.progress || {}).forEach(([id, p]) => {
    const def = DEFS[id];
    if (!def || season.earned?.[id]?.tier === 'gold') return;
    const best = Number(p.max) || 0, now = Number(p.current) || 0;
    let next = null;
    if (def.type === 'tiered') next = ['bronze', 'silver', 'gold'].map(t => ({ t, ...def.tiers[t] })).find(t => t.threshold > best) || null;
    const pct = next ? Math.min(100, Math.round((best / next.threshold) * 100)) : 100;
    out.push(`<li class="pl-progress">
      <div class="pl-progress-head"><strong>${esc(def.name)}</strong><span>${next ? `${best} of ${next.threshold} for ${esc(next.name)} (${cap(next.t)})` : `${best}`}</span></div>
      <div class="pl-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      ${now !== best ? `<span class="pl-progress-now">Current: ${now}</span>` : ''}
    </li>`);
  });
  return out;
}

export async function render(el, ctx) {
  if (!ctx.badges.length) {
    el.innerHTML = emptyCard('No badges yet', 'Badges are earned through achievements during the season, starting with 2025 Fall.', 'medal');
    return;
  }
  try { DEFS = (await import('../../badge-calculator.js')).BADGE_DEFINITIONS || {}; } catch (err) { console.warn('[player] badge definitions unavailable', err); }

  let pick = ctx.badges[0].seasonId;
  let shown = [];

  const draw = () => {
    const season = ctx.badges.find(b => b.seasonId === pick) || ctx.badges[0];
    const earned = Object.entries(season.earned || {}).map(([id, b]) => ({ id, ...b }));
    shown = earned;
    const total = ctx.badges.reduce((n, b) => n + Object.keys(b.earned || {}).length, 0);
    const picker = ctx.badges.length > 1 ? `<span class="aces-select-wrap is-inline"><select class="aces-select is-sm" data-badge-season aria-label="Season">
      ${ctx.badges.map(b => `<option value="${esc(b.seasonId)}"${b.seasonId === season.seasonId ? ' selected' : ''}>${esc(b.label)} (${Object.keys(b.earned || {}).length})</option>`).join('')}
    </select></span>` : `<span class="aces-badge is-outline">${esc(season.label)}</span>`;

    const groups = GROUPS.map(([key, label, ic]) => {
      const list = earned.filter(b => (b.category || DEFS[b.badgeId || b.id]?.category || 'hitting') === key)
        .sort((a, b) => (TIER_ORDER[a.tier] ?? 3) - (TIER_ORDER[b.tier] ?? 3) || String(a.name).localeCompare(String(b.name)));
      return list.length ? `<div class="pl-badge-group"><h3 class="pl-group-title">${icon(ic)}${esc(label)} <span>${list.length}</span></h3>
        <div class="pl-badges">${list.map(b => badgeCard(b.id, b, shown.indexOf(b))).join('')}</div></div>` : '';
    }).join('');
    // Anything in a category this page doesn't know yet.
    const known = new Set(GROUPS.map(g => g[0]));
    const other = earned.filter(b => !known.has(b.category || DEFS[b.badgeId || b.id]?.category || 'hitting'));
    const otherHtml = other.length ? `<div class="pl-badge-group"><h3 class="pl-group-title">${icon('medal')}Other <span>${other.length}</span></h3>
      <div class="pl-badges">${other.map(b => badgeCard(b.id, b, shown.indexOf(b))).join('')}</div></div>` : '';

    const progress = progressRows(season);
    el.innerHTML = `
      ${card(`Badges`, `<p class="pl-note">${total} earned since 2025 Fall. Tap a badge for details.</p>
        ${groups || otherHtml ? groups + otherHtml : empty(`No badges in ${season.label}`, '', 'medal')}`, { iconName: 'medal', extra: picker })}
      ${progress.length ? card('In progress', `<ul class="pl-progress-list">${progress.join('')}</ul>`, { iconName: 'trending-up' }) : ''}`;
    el.querySelector('[data-badge-season]')?.addEventListener('change', (e) => { pick = e.target.value; draw(); });
  };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-badge]');
    if (!btn) return;
    const b = shown[Number(btn.dataset.badge)];
    if (!b) return;
    const def = DEFS[b.badgeId || b.id] || {};
    const season = ctx.badges.find(s => s.seasonId === pick);
    const when = earnedOn(b);
    const rows = [
      b.value !== undefined && b.value !== null && typeof b.value !== 'object' ? [valueLabel(b.badgeId || b.id), String(b.value)] : null,
      ['Season', season?.label || ''],
      when ? ['Earned', when] : null,
      def.name && def.name !== b.name ? ['Badge', def.name] : null
    ].filter(Boolean);
    openModal({
      title: b.name || def.name || b.id,
      html: `<div class="pl-badge-detail">${badgeArt(b.id, b, 'is-lg')}
        <div>${b.tier ? `<span class="aces-badge pl-tier is-${esc(b.tier)}">${esc(cap(b.tier))}</span>` : ''}
        <p>${esc(b.description || def.description || '')}</p>
        <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div></div>`,
      actions: [{ label: 'Close', value: true, variant: 'primary' }]
    });
  });
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-badge-img]')) e.target.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('medal') }).firstElementChild);
  }, true);

  draw();
}
