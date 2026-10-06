// js/ui/icons.js
// Icons from the SVG sprite (icons.svg at the site root) in place of emoji,
// so they look the same on every phone and survive any file encoding.
//
//   import { icon, iconEl } from './js/ui/icons.js';
//
//   el.innerHTML = `${icon('trophy')} Champions`;          // decorative
//   btn.innerHTML = icon('refresh', { label: 'Refresh' });  // icon-only button
//   heading.prepend(iconEl('calendar', { className: 'is-lg' }));
//
// In static markup (relative to the page):
//   <svg class="aces-icon" aria-hidden="true"><use href="icons.svg#icon-trophy"></use></svg>
//
// Sizing and color come from .aces-icon in css/components.css (1.25em,
// currentColor). Without that stylesheet, pass a size.
// The names are listed at the top of icons.svg; ICON_NAMES has them too.

// Resolved from this file's URL, so it works at the site root, on the
// /AcesStatsv2.0/ preview and from admin/ pages alike.
export const SPRITE_URL = new URL('../../icons.svg', import.meta.url).href;

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICON_NAMES = Object.freeze([
  'home', 'search', 'menu', 'close', 'check', 'plus', 'minus',
  'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'chevrons-up-down',
  'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down', 'arrow-up-right', 'arrow-left-right',
  'external-link', 'more', 'more-vertical',
  'filter', 'sort', 'sliders', 'settings', 'refresh', 'undo',
  'download', 'upload', 'share', 'copy', 'link', 'print', 'edit', 'trash', 'save',
  'eye', 'eye-off', 'lock', 'unlock', 'log-in', 'log-out',
  'info', 'help', 'alert', 'alert-circle', 'check-circle', 'x-circle',
  'bell', 'mail', 'message', 'megaphone', 'newspaper',
  'clock', 'calendar', 'calendar-days', 'map-pin', 'sun', 'moon',
  'grid', 'list', 'table', 'columns',
  'image', 'images', 'camera', 'video', 'tv', 'play', 'radio', 'smartphone',
  'user', 'users', 'user-plus', 'user-check', 'id-card', 'shield', 'shield-check',
  'trophy', 'medal', 'award', 'crown', 'star', 'star-filled', 'flame', 'zap', 'target',
  'trending-up', 'trending-down', 'chart-bar', 'chart-line', 'activity',
  'hash', 'percent', 'calculator', 'scale', 'swords', 'versus', 'binoculars', 'flag', 'whistle', 'timer',
  'clipboard', 'clipboard-check', 'book', 'scroll',
  'gamepad', 'dice', 'shuffle', 'sparkles', 'party', 'ticket', 'puzzle', 'grid-3x3', 'handshake',
  'leaf', 'snowflake', 'flower',
  'softball', 'bat', 'field', 'home-plate', 'dot'
]);

const KNOWN = new Set(ICON_NAMES);

function warnUnknown(name) {
  if (!KNOWN.has(name)) console.warn(`[icons] no icon named "${name}" in icons.svg`);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * SVG markup for one icon, for template strings.
 * @param {string} name  Icon name, such as 'trophy' (no 'icon-' prefix).
 * @param {object} [options]
 * @param {string} [options.label]      Accessible name. Leave empty when text sits beside the icon.
 * @param {string} [options.className]  Extra classes: 'is-sm', 'is-lg', 'is-muted', or your own.
 * @param {number|string} [options.size] Width and height attributes (px), for pages without components.css.
 * @returns {string}
 */
export function icon(name, { label = '', className = '', size } = {}) {
  warnUnknown(name);
  const cls = ['aces-icon', className].filter(Boolean).join(' ');
  const a11y = label
    ? `role="img" aria-label="${escapeAttr(label)}"`
    : 'aria-hidden="true" focusable="false"';
  const dims = size != null ? ` width="${escapeAttr(size)}" height="${escapeAttr(size)}"` : '';
  return `<svg class="${escapeAttr(cls)}"${dims} ${a11y}><use href="${SPRITE_URL}#icon-${escapeAttr(name)}"></use></svg>`;
}

/**
 * The same icon as an element, for DOM building.
 * @param {string} name
 * @param {{ label?: string, className?: string, size?: number|string }} [options]
 * @returns {SVGSVGElement}
 */
export function iconEl(name, { label = '', className = '', size } = {}) {
  warnUnknown(name);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ['aces-icon', className].filter(Boolean).join(' '));
  if (size != null) {
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
  }
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${SPRITE_URL}#icon-${name}`);
  svg.appendChild(use);
  return svg;
}

export default icon;
