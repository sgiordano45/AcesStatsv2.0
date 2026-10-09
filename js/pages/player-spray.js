// js/pages/player-spray.js
// player.html Spray tab: where the player's batted balls went.
//
// Data: sprayChartData/{legacyId}
//   csvPlays   [{ angle_deg, distance_ft, result: 'Hit'|'Out', zone }]  precise (imported)
//   gamePlays  { gameId: [{ zone, result, playType }] }               by fielding zone (tracker)
// Field geometry mirrors scouting-report.html.

import { esc, card, emptyCard } from './player-shared.js';

const HOME = { x: 150, y: 248 };
const OF_R = 210, IF_R = 105, BASE = 88, SCALE = 1.05;
const at = (r, side) => ({ x: HOME.x + side * r * Math.SQRT1_2, y: HOME.y - r * Math.SQRT1_2 });
const FL_L = at(OF_R, -1), FL_R = at(OF_R, 1), IF_L = at(IF_R, -1), IF_R2 = at(IF_R, 1);
const B1 = at(BASE, 1), B3 = at(BASE, -1), B2 = { x: HOME.x, y: HOME.y - BASE * Math.SQRT2 };
const ZONES = {
  LF: { x: 48, y: 88 }, LCF: { x: 98, y: 58 }, CF: { x: 150, y: 42 }, RCF: { x: 202, y: 58 }, RF: { x: 252, y: 88 },
  '3B': { x: Math.round(B3.x), y: Math.round(B3.y) }, SS: { x: 112, y: 158 }, '2B': { x: 188, y: 158 },
  '1B': { x: Math.round(B1.x), y: Math.round(B1.y) }, P: { x: 150, y: 208 }, C: { x: 150, y: 236 }
};
const f = (n) => n.toFixed(1);

function field() {
  return `
    <path class="pl-spray-of" d="M ${f(FL_L.x)} ${f(FL_L.y)} A ${OF_R} ${OF_R} 0 0 1 ${f(FL_R.x)} ${f(FL_R.y)} L ${HOME.x} ${HOME.y} Z"/>
    <path class="pl-spray-if" d="M ${f(IF_L.x)} ${f(IF_L.y)} A ${IF_R} ${IF_R} 0 0 1 ${f(IF_R2.x)} ${f(IF_R2.y)} L ${HOME.x} ${HOME.y} Z"/>
    <polyline class="pl-spray-bases" points="${HOME.x},${HOME.y} ${f(B1.x)},${f(B1.y)} ${B2.x},${f(B2.y)} ${f(B3.x)},${f(B3.y)} ${HOME.x},${HOME.y}"/>
    <line class="pl-spray-line" x1="${HOME.x}" y1="${HOME.y}" x2="${f(FL_L.x)}" y2="${f(FL_L.y)}"/>
    <line class="pl-spray-line" x1="${HOME.x}" y1="${HOME.y}" x2="${f(FL_R.x)}" y2="${f(FL_R.y)}"/>
    <circle class="pl-spray-mound" cx="${HOME.x}" cy="${HOME.y - 48}" r="7"/>
    <polygon class="pl-spray-plate" points="${HOME.x},${HOME.y + 4} ${HOME.x - 5},${HOME.y} ${HOME.x},${HOME.y - 5} ${HOME.x + 5},${HOME.y}"/>`;
}

const dot = (x, y, hit, label, precise) => `<circle class="pl-spray-dot ${hit ? 'is-hit' : 'is-out'}${precise ? ' is-precise' : ''}" cx="${f(x)}" cy="${f(y)}" r="${precise ? 5.5 : 7}"><title>${esc(label)}</title></circle>`;

export async function render(el, ctx) {
  const data = await ctx.spray();
  const precise = (data?.csvPlays || []).filter(p => p.angle_deg != null && p.distance_ft != null);
  const zoned = Object.values(data?.gamePlays || {}).flatMap(a => (a || []).filter(p => p.zone && ZONES[p.zone]));
  if (!precise.length && !zoned.length) {
    el.innerHTML = emptyCard('No spray data yet', 'Batted-ball locations show up once games are tracked.', 'target');
    return;
  }

  const dots = [];
  for (const p of precise) {
    const rad = (p.angle_deg * Math.PI) / 180;
    const x = HOME.x + p.distance_ft * Math.sin(rad) * SCALE, y = HOME.y - p.distance_ft * Math.cos(rad) * SCALE;
    if (Math.hypot(x - HOME.x, y - HOME.y) <= OF_R + 10) dots.push(dot(x, y, p.result === 'Hit', `${p.zone || ''} ${p.result} (${Math.round(p.distance_ft)} ft)`.trim(), true));
  }
  // Zone plays spread out around the zone point (golden-angle) so they don't stack.
  const count = {}, seen = {};
  zoned.forEach(p => { count[p.zone] = (count[p.zone] || 0) + 1; });
  for (const p of zoned) {
    const z = ZONES[p.zone], i = (seen[p.zone] = (seen[p.zone] || 0) + 1);
    const spread = Math.min(14, 3 + count[p.zone] * 2);
    const a = (i * 137.5 * Math.PI) / 180;
    const x = count[p.zone] > 1 ? z.x + spread * Math.cos(a) : z.x, y = count[p.zone] > 1 ? z.y + spread * Math.sin(a) : z.y;
    dots.push(dot(x, y, p.result === 'Hit', `${p.zone}: ${p.playType || p.result}`, false));
  }

  const all = [...precise, ...zoned];
  const hits = all.filter(p => p.result === 'Hit').length;
  // Where the ball went, by zone, for the table under the chart.
  const byZone = {};
  zoned.forEach(p => { const z = (byZone[p.zone] ||= { n: 0, h: 0 }); z.n++; if (p.result === 'Hit') z.h++; });
  const order = ['LF', 'LCF', 'CF', 'RCF', 'RF', '3B', 'SS', '2B', '1B', 'P', 'C'].filter(z => byZone[z]);

  el.innerHTML = card('Spray chart', `
    <div class="pl-spray">
      <div class="pl-spray-plot">
        <div class="pl-spray-legend"><span><i class="pl-spray-key is-hit"></i>Hit</span><span><i class="pl-spray-key is-out"></i>Out</span></div>
        <svg viewBox="0 0 300 270" role="img" aria-label="Spray chart: ${all.length} batted balls, ${hits} hits">${field()}${dots.join('')}</svg>
        <p class="pl-note">${all.length} tracked batted ball${all.length === 1 ? '' : 's'}: ${hits} hit${hits === 1 ? '' : 's'}, ${all.length - hits} out${all.length - hits === 1 ? '' : 's'}${precise.length ? ` (${precise.length} with exact location)` : ''}.</p>
      </div>
      ${order.length ? `<div class="aces-table-wrap"><table class="aces-table is-compact pl-split-table">
        <thead><tr><th scope="col">Zone</th><th scope="col" class="is-num">Balls</th><th scope="col" class="is-num">Hits</th><th scope="col" class="is-num">Share</th></tr></thead>
        <tbody>${order.map(z => `<tr><th scope="row">${esc(z)}</th><td class="is-num">${byZone[z].n}</td><td class="is-num">${byZone[z].h}</td>
          <td class="is-num">${Math.round((byZone[z].n / zoned.length) * 100)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`, { iconName: 'target' });
}
