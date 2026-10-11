// js/pages/playoffs-share.js
// The bracket as a PNG for playoffs.html, drawn on a canvas (no html2canvas):
// one column per round, a box per series with seeds, teams and series wins.
// openShare() shows it with Save, Share (where the device allows) and Copy.

import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { ROUND_KEYS, ROUND_TITLES } from './playoffs-format.js';

const W_COL = 210;
const GAP = 26;
const BOX_H = 62;
const PAD = 28;
const HEAD = 86;
const FOOT = 40;

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}\u2026`).width > max) t = t.slice(0, -1);
  return `${t}\u2026`;
}

/**
 * @param {object} data      bracket doc
 * @param {object} o
 * @param {(slot, series) => {seed, name}} o.team
 * @param {string} o.title    e.g. '2026 Fall Playoffs'
 * @param {string} o.subtitle e.g. 'Official bracket'
 */
export function drawBracket(data, { team, title, subtitle }) {
  const rounds = ROUND_KEYS.filter((k) => (data[k] || []).length);
  const tallest = Math.max(...rounds.map((k) => data[k].length), 1);
  const bodyH = tallest * (BOX_H + 18);
  const width = PAD * 2 + rounds.length * W_COL + (rounds.length - 1) * GAP;
  const height = HEAD + 24 + bodyH + FOOT;
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = width * scale;
  c.height = height * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);

  const bg = g.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#173a10');
  bg.addColorStop(1, '#2d5016');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);

  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = '#ffd700';
  g.font = '700 26px Inter, system-ui, sans-serif';
  g.fillText(title, width / 2, 38);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '500 13px Inter, system-ui, sans-serif';
  g.fillText(subtitle, width / 2, 64);

  rounds.forEach((k, ci) => {
    const x = PAD + ci * (W_COL + GAP);
    g.textAlign = 'left';
    g.fillStyle = k === 'finals' ? '#ffd700' : 'rgba(255,255,255,0.7)';
    g.font = '700 11px Inter, system-ui, sans-serif';
    g.fillText(ROUND_TITLES[k].toUpperCase(), x, HEAD + 8);

    const list = data[k];
    const slot = bodyH / list.length;
    list.forEach((s, i) => {
      const y = HEAD + 24 + i * slot + (slot - BOX_H) / 2;
      roundRect(g, x, y, W_COL, BOX_H, 8);
      g.fillStyle = k === 'finals' ? 'rgba(255,215,0,0.16)' : 'rgba(255,255,255,0.1)';
      g.fill();
      g.strokeStyle = k === 'finals' ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.25)';
      g.lineWidth = 1;
      g.stroke();

      [[s.team1, s.seriesWins1, 1], [s.team2, s.seriesWins2, 2]].forEach(([slotRef, wins, side], r) => {
        const t = team(slotRef, s);
        const ry = y + 16 + r * 30;
        const won = s.winner === side;
        const lost = s.winner && !won;
        g.textAlign = 'left';
        g.font = '700 10px Inter, system-ui, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText(t.seed ? String(t.seed) : '', x + 10, ry);
        g.font = `${won ? 700 : 500} 13px Inter, system-ui, sans-serif`;
        g.fillStyle = won ? '#ffd700' : lost ? 'rgba(255,255,255,0.45)' : '#ffffff';
        g.fillText(fit(g, t.name, W_COL - 60), x + 28, ry);
        g.textAlign = 'right';
        g.font = '700 13px Inter, system-ui, sans-serif';
        g.fillText(String(wins || 0), x + W_COL - 10, ry);
      });
    });
  });

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.font = '500 11px Inter, system-ui, sans-serif';
  g.fillText('Mountainside Aces', width / 2, height - FOOT / 2);
  return c;
}

export async function openShare(canvas, fileName) {
  const url = canvas.toDataURL('image/png');
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  await openModal({
    title: 'Share the bracket',
    wide: true,
    html: `<img class="po-share-img" src="${url}" alt="Playoff bracket">
      <div class="po-share-btns">
        <a class="aces-btn is-primary" href="${url}" download="${fileName}">Save image</a>
        ${canShare ? '<button type="button" class="aces-btn" data-share-file>Share</button>' : ''}
        <button type="button" class="aces-btn" data-copy-img>Copy image</button>
      </div>`,
    actions: [{ label: 'Done', value: true }],
    onOpen: (dialog) => {
      dialog.querySelector('[data-share-file]')?.addEventListener('click', async () => {
        try { await navigator.share({ files: [file], title: 'Aces playoff bracket' }); } catch { /* cancelled */ }
      });
      dialog.querySelector('[data-copy-img]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Image copied.', 'success');
        } catch {
          showToast("This browser can't copy images. Use Save image instead.", 'info');
        }
      });
    }
  });
}
