// js/ui/radial-chart.js
// A radial (radar) profile: one player against the league average on five or
// so axes, each scaled to the league best (the outer ring). Held back from the
// Explore merge for the player page; any page can use it.
//
//   import { radialChart } from './js/ui/radial-chart.js';
//   el.innerHTML = radialChart({
//     axes: [{ label: 'AVG', value: 0.412, avg: 0.301, max: 0.560, format: v => fmtAvg(v) }, ...],
//     name: 'Steve Giordano',
//     compareLabel: 'League average'
//   });
//
// Styles: .aces-radial in css/player.css (colors come from tokens, so dark
// mode works). Each point has a <title> for hover and a matching row in the
// value list under the chart, so nothing depends on color or hover alone.

import { escapeHtml as esc } from './format.js';

const SIZE = 320;
const C = SIZE / 2;
const R = 112;          // outer ring radius; leaves room for labels
const RINGS = 4;

const pt = (i, n, frac) => {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [C + Math.cos(a) * R * frac, C + Math.sin(a) * R * frac];
};
const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
const frac = (v, max) => (typeof v === 'number' && Number.isFinite(v) && max > 0 ? Math.max(0, Math.min(1, v / max)) : 0);

export function radialChart({ axes = [], name = 'Player', compareLabel = 'League average', caption = '' } = {}) {
  const n = axes.length;
  if (n < 3) return '';
  const fmt = (a, v) => (typeof v === 'number' && Number.isFinite(v) ? (a.format ? a.format(v) : String(v)) : '-');

  const rings = Array.from({ length: RINGS }, (_, k) => {
    const f = (k + 1) / RINGS;
    return `<path class="aces-radial-ring" d="${path(axes.map((_, i) => pt(i, n, f)))}"/>`;
  }).join('');
  const spokes = axes.map((_, i) => { const [x, y] = pt(i, n, 1); return `<line class="aces-radial-spoke" x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');

  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, n, 1.2);
    const anchor = Math.abs(x - C) < 4 ? 'middle' : x > C ? 'start' : 'end';
    const dy = y < C - R * 0.9 ? -4 : y > C + R * 0.5 ? 12 : 4;
    return `<text class="aces-radial-label" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(a.label)}</text>`;
  }).join('');

  const avgPts = axes.map((a, i) => pt(i, n, frac(a.avg, a.max)));
  const youPts = axes.map((a, i) => pt(i, n, frac(a.value, a.max)));
  const hasAvg = axes.some(a => typeof a.avg === 'number');

  const dots = youPts.map(([x, y], i) => {
    const a = axes[i];
    const tip = `${a.label}: ${fmt(a, a.value)}${hasAvg ? ` (league avg ${fmt(a, a.avg)})` : ''}, league best ${fmt(a, a.max)}`;
    return `<g class="aces-radial-hit"><title>${esc(tip)}</title>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="transparent"/>
      <circle class="aces-radial-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/></g>`;
  }).join('');

  const svg = `<svg class="aces-radial-svg" viewBox="-40 -6 ${SIZE + 80} ${SIZE + 12}" role="img" aria-label="${esc(`${name} profile against the ${compareLabel.toLowerCase()}`)}">
    ${rings}${spokes}
    ${hasAvg ? `<path class="aces-radial-avg" d="${path(avgPts)}"/>` : ''}
    <path class="aces-radial-you" d="${path(youPts)}"/>
    ${dots}${labels}
  </svg>`;

  const legend = `<div class="aces-radial-legend">
    <span><i class="aces-radial-key is-you"></i>${esc(name)}</span>
    ${hasAvg ? `<span><i class="aces-radial-key is-avg"></i>${esc(compareLabel)}</span>` : ''}
  </div>`;

  const list = `<table class="aces-radial-values"><thead><tr><th scope="col">Stat</th><th scope="col">${esc(name.split(' ')[0] || 'Player')}</th>${hasAvg ? '<th scope="col">League avg</th>' : ''}<th scope="col">League best</th></tr></thead>
    <tbody>${axes.map(a => `<tr><th scope="row">${esc(a.title || a.label)}</th><td>${esc(fmt(a, a.value))}</td>${hasAvg ? `<td>${esc(fmt(a, a.avg))}</td>` : ''}<td>${esc(fmt(a, a.max))}</td></tr>`).join('')}</tbody></table>`;

  return `<figure class="aces-radial">
    <div class="aces-radial-plot">${legend}${svg}</div>
    <figcaption>${list}${caption ? `<p class="aces-radial-note">${esc(caption)}</p>` : ''}</figcaption>
  </figure>`;
}
