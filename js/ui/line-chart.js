// js/ui/line-chart.js
// A small multi-series line chart as inline SVG (no library). Used by the
// Team stats view on teams.html.
//
//   el.innerHTML = lineChart({
//     labels: ['2024 Summer', '2024 Fall'],
//     series: [{ key: 'green', label: 'Green', values: [0.31, null] }, ...],
//     format: (v) => v.toFixed(2),          // axis and tooltip values
//     zeroLine: false                       // emphasise y = 0 (run differential)
//   });
//   wireLineChart(el);   // legend clicks focus one series
//
// Series colours come from the team tokens (--team-<key>), falling back to
// the text colour. A null value leaves a gap.

import { escapeHtml as esc } from './format.js';

const W = 720, H = 300, PAD = { t: 16, r: 16, b: 44, l: 52 };

function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function lineChart({ labels = [], series = [], format = (v) => String(v), zeroLine = false, ariaLabel = 'Line chart' } = {}) {
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!labels.length || !vals.length) return '<p class="aces-empty lc-empty">No data to chart.</p>';
  const ticks = niceTicks(Math.min(...vals, zeroLine ? 0 : Infinity), Math.max(...vals, zeroLine ? 0 : -Infinity));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v) => PAD.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const every = Math.max(1, Math.ceil(labels.length / 10));

  const grid = ticks.map((t) => `<g class="lc-tick"><line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"${zeroLine && t === 0 ? ' class="is-zero"' : ''}/>
    <text x="${PAD.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(format(t))}</text></g>`).join('');
  const xl = labels.map((l, i) => (i % every === 0 || i === labels.length - 1
    ? `<text class="lc-x" x="${x(i).toFixed(1)}" y="${H - PAD.b + 18}" text-anchor="middle">${esc(l)}</text>` : '')).join('');

  const lines = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null || v === undefined || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    const dots = s.values.map((v, i) => (v === null || v === undefined || !Number.isFinite(v) ? ''
      : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5"><title>${esc(`${s.label}, ${labels[i]}: ${format(v)}`)}</title></circle>`)).join('');
    return `<g class="lc-series" data-series="${esc(s.key)}" data-team-color="${esc(s.key)}"><path d="${d.trim()}"/>${dots}</g>`;
  }).join('');

  const legend = series.map((s) => `<button type="button" class="lc-key" data-series="${esc(s.key)}" data-team-color="${esc(s.key)}" aria-pressed="false"><span class="lc-swatch"></span>${esc(s.label)}</button>`).join('');

  return `<div class="lc">
    <svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">${grid}${xl}${lines}</svg>
    <div class="lc-legend">${legend}</div>
  </div>`;
}

/** Legend buttons focus one series (click again to show all). */
export function wireLineChart(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.lc-key');
    if (!b) return;
    const box = b.closest('.lc');
    const on = b.getAttribute('aria-pressed') !== 'true';
    box.querySelectorAll('.lc-key').forEach((k) => k.setAttribute('aria-pressed', String(on && k === b)));
    box.classList.toggle('has-focus', on);
    box.querySelectorAll('.lc-series').forEach((g) => g.classList.toggle('is-focus', on && g.dataset.series === b.dataset.series));
  });
}
