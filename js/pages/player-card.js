// js/pages/player-card.js
// player.html baseball card: Print card opens a print window with the front
// and back; Share card draws both on a canvas (no html2canvas) and shares the
// PNG, or downloads it where sharing files isn't supported.

import { showToast } from '../ui/toast.js';
import { escapeHtml as esc, fmtAvg } from '../ui/format.js';
import { parseStatSeasonId } from '../domain/season-ids.js';
import { slug, cap } from './player-shared.js';

const SITE = 'acessoftballreference.com';

function cardData(ctx) {
  const regular = ctx.rows.filter(r => !r.sub).slice().sort((a, b) => a.seasonKey - b.seasonKey);
  const t = regular.reduce((s, r) => ({ g: s.g + r.games, ab: s.ab + r.atBats, h: s.h + r.hits, r: s.r + r.runs, bb: s.bb + r.walks }), { g: 0, ab: 0, h: 0, r: 0, bb: 0 });
  const years = [...new Set(regular.map(r => r.seasonId.slice(0, 4)))].sort();
  const team = cap((ctx.rows.find(r => !r.sub) || ctx.rows[0])?.team || 'Aces');
  const key = team.toLowerCase();
  const css = getComputedStyle(document.documentElement);
  const color = css.getPropertyValue(`--team-${key}-fill`).trim() || css.getPropertyValue(`--team-${key}`).trim() || '#2d5016';
  const ink = css.getPropertyValue(`--team-${key}-ink`).trim() || '#ffffff';
  const info = ctx.info;
  return {
    name: ctx.name, team, color: key === 'white' ? '#ffffff' : color, ink: key === 'white' ? '#343a40' : ink,
    number: info.number || '', nickname: info.nickname || '', captain: !!info.captain,
    position: info.position && info.position !== '-' ? info.position : '',
    bats: info.bats && info.bats !== '-' ? info.bats : '', throws: info.throws && info.throws !== '-' ? info.throws : '',
    photo: info.photo || '',
    years: years.length ? (years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0]) : '',
    seasons: regular.map(r => {
      const { year, name } = parseStatSeasonId(r.seasonId);
      return { label: `${year.slice(2)}${name.slice(0, 2).toUpperCase()}`, team: r.team.length > 6 ? `${r.team.slice(0, 5)}.` : r.team,
        g: r.games, ab: r.atBats, h: r.hits, r: r.runs, bb: r.walks, avg: r.atBats ? fmtAvg(r.hits / r.atBats) : '-' };
    }),
    totals: { ...t, avg: fmtAvg(t.ab ? t.h / t.ab : null), obp: fmtAvg(t.ab + t.bb ? (t.h + t.bb) / (t.ab + t.bb) : null) }
  };
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

export function printCard(ctx) {
  const d = cardData(ctx);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { showToast('Allow pop-ups for this site to print the card.', 'info'); return; }
  const vit = (k, v) => (v ? `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>` : '');
  const rows = d.seasons.slice(-16);
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(d.name)} card</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:.25in;font:400 10px/1.3 Inter,system-ui,sans-serif;color:#1c201b;background:#fff}
.cards{display:flex;flex-wrap:wrap;gap:.25in}
.card{width:2.5in;height:3.5in;border:3px solid ${d.color === '#ffffff' ? '#cdd1c9' : d.color};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;background:#fff;break-inside:avoid}
.band{background:${d.color};color:${d.ink};padding:6px 8px;text-align:center;border-bottom:${d.color === '#ffffff' ? '1px solid #cdd1c9' : '0'}}
.band b{display:block;font:400 22px/1 "Bebas Neue",sans-serif;letter-spacing:.04em}
.band small{font-size:7px;letter-spacing:.12em;text-transform:uppercase}
.photo{flex:1;margin:6px 8px 0;border-radius:6px;background:#e9ebe6 center/cover no-repeat;position:relative;min-height:0}
.num{position:absolute;left:6px;top:6px;background:${d.color};color:${d.ink};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:400 16px/1 "Bebas Neue",sans-serif;border:2px solid #fff}
.name{text-align:center;padding:4px 6px 0}
.name b{display:block;font:400 22px/1 "Bebas Neue",sans-serif;letter-spacing:.03em}
.name i{font-size:9px;color:#5a6056}
.name span{display:block;font-size:8px;color:#5a6056;text-transform:uppercase;letter-spacing:.08em}
.strip{display:grid;grid-template-columns:repeat(5,1fr);margin:6px 8px;border-top:1px solid #e9ebe6;padding-top:4px;text-align:center}
.strip b{display:block;font:400 15px/1 "Bebas Neue",sans-serif}
.strip span{font-size:6.5px;text-transform:uppercase;letter-spacing:.08em;color:#5a6056}
.foot{background:#1c201b;color:#fff;text-align:center;font-size:7px;letter-spacing:.12em;padding:3px;text-transform:uppercase}
.back{padding:8px;background:#f6f3e8}
.back h2{margin:0;font:400 20px/1 "Bebas Neue",sans-serif}
.back h3{margin:0 0 4px;font-size:8px;color:#5a6056;text-transform:uppercase;letter-spacing:.1em}
.vit{display:flex;gap:8px;margin:4px 0 6px;font-size:8px}.vit span{color:#5a6056;margin-right:3px}
table{width:100%;border-collapse:collapse;font-size:7.5px}
th{background:${d.color === '#ffffff' ? '#343a40' : d.color};color:${d.color === '#ffffff' ? '#fff' : d.ink};font-weight:700;padding:2px}
td{padding:1.5px 2px;text-align:center;border-bottom:1px solid #e3dfcf}
td:first-child,th:first-child{text-align:left}
tfoot td{font-weight:700;border-top:1.5px solid #1c201b}
.site{margin-top:auto;text-align:center;font-size:7px;color:#5a6056;padding-top:4px}
@page{margin:.25in}
</style></head><body><div class="cards">
<div class="card">
  <div class="band"><b>${esc(d.team)}</b><small>Mountainside Aces Softball</small></div>
  <div class="photo" style="${d.photo ? `background-image:url('${esc(d.photo)}')` : ''}">${d.number ? `<span class="num">${esc(d.number)}</span>` : ''}</div>
  <div class="name"><b>${esc(d.name)}</b>${d.nickname ? `<i>"${esc(d.nickname)}"</i>` : ''}<span>${esc([d.position, d.captain ? 'Captain' : ''].filter(Boolean).join(' / ') || 'Mountainside Aces')}</span></div>
  <div class="strip"><div><b>${d.totals.g}</b><span>Games</span></div><div><b>${d.totals.avg}</b><span>AVG</span></div><div><b>${d.totals.h}</b><span>Hits</span></div><div><b>${d.totals.r}</b><span>Runs</span></div><div><b>${d.totals.obp}</b><span>OBP</span></div></div>
  <div class="foot">${esc(d.years)} &middot; Mountainside Aces</div>
</div>
<div class="card back">
  <h2>${d.number ? `#${esc(d.number)} ` : ''}${esc(d.name)}</h2>
  <div class="vit">${vit('Team', d.team)}${vit('Pos', d.position)}${vit('Bats', d.bats)}${vit('Throws', d.throws)}</div>
  <h3>Year by year</h3>
  <table><thead><tr><th>Yr</th><th>Team</th><th>G</th><th>AB</th><th>H</th><th>R</th><th>BB</th><th>AVG</th></tr></thead>
  <tbody>${rows.map(s => `<tr><td>${esc(s.label)}</td><td>${esc(s.team)}</td><td>${s.g}</td><td>${s.ab}</td><td>${s.h}</td><td>${s.r}</td><td>${s.bb}</td><td>${s.avg}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td>TOT</td><td></td><td>${d.totals.g}</td><td>${d.totals.ab}</td><td>${d.totals.h}</td><td>${d.totals.r}</td><td>${d.totals.bb}</td><td>${d.totals.avg}</td></tr></tfoot></table>
  ${d.seasons.length > rows.length ? `<p style="font-size:7px;color:#5a6056;margin:3px 0 0">Last ${rows.length} of ${d.seasons.length} seasons; totals are career.</p>` : ''}
  <div class="site">${SITE}</div>
</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},400);window.onafterprint=function(){window.close()}};<\/script>
</body></html>`);
  w.document.close();
}

// ---------------------------------------------------------------------------
// Share image
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fit(g, text, max, font) {
  let size = parseInt(font, 10);
  const rest = font.slice(String(size).length);
  g.font = `${size}${rest}`;
  while (g.measureText(text).width > max && size > 12) { size -= 2; g.font = `${size}${rest}`; }
}

async function drawCard(ctx) {
  const d = cardData(ctx);
  try { await Promise.all([document.fonts.load('40px "Bebas Neue"'), document.fonts.load('600 16px Inter')]); } catch { /* fallback fonts */ }
  const photo = await loadImage(d.photo);

  const W = 500, H = 700, GAP = 40, PAD = 40;
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = (W * 2 + GAP + PAD * 2) * scale;
  canvas.height = (H + PAD * 2) * scale;
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = '#e9ebe6';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const border = d.color === '#ffffff' ? '#cdd1c9' : d.color;
  const display = '"Bebas Neue", "Arial Narrow", sans-serif';
  const sans = 'Inter, system-ui, sans-serif';

  // Front
  let x = PAD, y = PAD;
  g.save();
  roundRect(g, x, y, W, H, 22); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 8; g.strokeStyle = border; g.stroke(); g.clip();
  g.fillStyle = d.color; g.fillRect(x, y, W, 96);
  g.fillStyle = d.ink; g.textAlign = 'center';
  fit(g, d.team.toUpperCase(), W - 40, `52px ${display}`); g.fillText(d.team.toUpperCase(), x + W / 2, y + 58);
  g.font = `600 13px ${sans}`; g.fillText('MOUNTAINSIDE ACES SOFTBALL', x + W / 2, y + 82);
  const px = x + 24, py = y + 112, pw = W - 48, ph = 360;
  g.save(); roundRect(g, px, py, pw, ph, 14); g.clip();
  g.fillStyle = '#e9ebe6'; g.fillRect(px, py, pw, ph);
  if (photo) {
    const s = Math.max(pw / photo.width, ph / photo.height);
    g.drawImage(photo, px + (pw - photo.width * s) / 2, py + (ph - photo.height * s) / 2, photo.width * s, photo.height * s);
  } else {
    g.fillStyle = '#8d9389'; g.font = `120px ${display}`;
    g.fillText(d.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2), px + pw / 2, py + ph / 2 + 42);
  }
  g.restore();
  if (d.number) {
    g.beginPath(); g.arc(px + 40, py + 40, 30, 0, Math.PI * 2); g.fillStyle = d.color; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = d.ink; g.font = `36px ${display}`; g.fillText(d.number, px + 40, py + 53);
  }
  g.fillStyle = '#1c201b';
  fit(g, d.name.toUpperCase(), W - 40, `54px ${display}`); g.fillText(d.name.toUpperCase(), x + W / 2, py + ph + 56);
  g.fillStyle = '#5a6056'; g.font = `600 14px ${sans}`;
  const sub = [d.nickname ? `"${d.nickname}"` : '', d.position, d.captain ? 'Captain' : ''].filter(Boolean).join('  /  ');
  if (sub) g.fillText(sub, x + W / 2, py + ph + 80);
  const stats = [[d.totals.g, 'GAMES'], [d.totals.avg, 'AVG'], [d.totals.h, 'HITS'], [d.totals.r, 'RUNS'], [d.totals.obp, 'OBP']];
  const sy = y + H - 104, cw = (W - 40) / 5;
  g.strokeStyle = '#e9ebe6'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 20, sy - 14); g.lineTo(x + W - 20, sy - 14); g.stroke();
  stats.forEach(([v, l], i) => {
    const cx = x + 20 + cw * i + cw / 2;
    g.fillStyle = '#1c201b'; g.font = `38px ${display}`; g.fillText(String(v), cx, sy + 24);
    g.fillStyle = '#5a6056'; g.font = `600 11px ${sans}`; g.fillText(l, cx, sy + 44);
  });
  g.fillStyle = '#1c201b'; g.fillRect(x, y + H - 36, W, 36);
  g.fillStyle = '#fff'; g.font = `600 12px ${sans}`; g.fillText(`${d.years ? `${d.years}  ·  ` : ''}MOUNTAINSIDE ACES`, x + W / 2, y + H - 13);
  g.restore();

  // Back
  x = PAD + W + GAP;
  g.save();
  roundRect(g, x, y, W, H, 22); g.fillStyle = '#f6f3e8'; g.fill(); g.lineWidth = 8; g.strokeStyle = border; g.stroke(); g.clip();
  g.textAlign = 'left'; g.fillStyle = '#1c201b';
  fit(g, `${d.number ? `#${d.number} ` : ''}${d.name}`.toUpperCase(), W - 56, `46px ${display}`);
  g.fillText(`${d.number ? `#${d.number} ` : ''}${d.name}`.toUpperCase(), x + 28, y + 64);
  g.font = `600 13px ${sans}`; g.fillStyle = '#5a6056';
  g.fillText([`TEAM ${d.team}`, d.position && `POS ${d.position}`, d.bats && `BATS ${d.bats}`, d.throws && `THROWS ${d.throws}`].filter(Boolean).join('   ').toUpperCase(), x + 28, y + 92);
  const cols = [['YR', 0], ['TEAM', 52], ['G', 140], ['AB', 186], ['H', 236], ['R', 280], ['BB', 322], ['AVG', 372]];
  const tx = x + 28, rowsShown = d.seasons.slice(-17);
  let ty = y + 124;
  g.fillStyle = d.color === '#ffffff' ? '#343a40' : d.color; g.fillRect(tx - 8, ty - 18, W - 40, 26);
  g.fillStyle = d.color === '#ffffff' ? '#fff' : d.ink; g.font = `700 12px ${sans}`;
  cols.forEach(([c, dx]) => g.fillText(c, tx + dx, ty));
  g.font = `400 13px ${sans}`; g.fillStyle = '#1c201b';
  rowsShown.forEach(s => {
    ty += 26;
    [s.label, s.team, s.g, s.ab, s.h, s.r, s.bb, s.avg].forEach((v, i) => g.fillText(String(v), tx + cols[i][1], ty));
    g.strokeStyle = '#e3dfcf'; g.lineWidth = 1; g.beginPath(); g.moveTo(tx - 8, ty + 8); g.lineTo(x + W - 20, ty + 8); g.stroke();
  });
  ty += 30;
  g.strokeStyle = '#1c201b'; g.lineWidth = 2; g.beginPath(); g.moveTo(tx - 8, ty - 20); g.lineTo(x + W - 20, ty - 20); g.stroke();
  g.font = `700 13px ${sans}`;
  ['TOT', '', d.totals.g, d.totals.ab, d.totals.h, d.totals.r, d.totals.bb, d.totals.avg].forEach((v, i) => g.fillText(String(v), tx + cols[i][1], ty));
  if (d.seasons.length > rowsShown.length) {
    g.font = `400 11px ${sans}`; g.fillStyle = '#5a6056';
    g.fillText(`Last ${rowsShown.length} of ${d.seasons.length} seasons; totals are career.`, tx, ty + 22);
  }
  g.textAlign = 'center'; g.fillStyle = '#5a6056'; g.font = `600 12px ${sans}`;
  g.fillText(SITE.toUpperCase(), x + W / 2, y + H - 20);
  g.restore();

  try {
    return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('empty'))), 'image/png'));
  } catch {
    // A photo without CORS headers taints the canvas; draw again without it.
    if (photo) return drawCard({ ...ctx, info: { ...ctx.info, photo: '' } });
    throw new Error('card image failed');
  }
}

export async function shareCard(ctx) {
  const blob = await drawCard(ctx);
  const name = `${slug(ctx.name)}-player-card.png`;
  const file = new File([blob], name, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `${ctx.name} - Mountainside Aces` }); return; }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('Card saved as an image.', 'success');
}
