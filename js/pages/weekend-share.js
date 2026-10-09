// js/pages/weekend-share.js
// Share images and text for weekend-preview.html, drawn on a canvas (no
// html2canvas), like the player card and table images.
//
//   import { shareGames, gamesText } from './weekend-share.js';
//   await shareGames({ heading: "Tonight's Games", sub: 'Sunday, October 11', items, detail: true });
//   const text = gamesText({ heading, sub, items });
//
// items: [{ day: 'Sunday, Oct 11' }  // a day label (week image)
//         | { away, home, when, label, tier, awayRec, homeRec, awayPlace, homePlace,
//             awayPlayers: [names], homePlayers: [names], line: moneyLine() | null }]
// tier: 'regular' | 'playoff' | 'finals' (finals = championship / finals round)

import { showToast } from '../ui/toast.js';

const SITE = 'acessoftballreference.com';
const SANS = 'Inter, system-ui, -apple-system, sans-serif';
const DISPLAY = '"Bebas Neue", Impact, sans-serif';
const THEMES = {
  regular: { head: '#2d5016', head2: '#1f6b47', soft: '#f3f7f1', edge: '#dfe7da', ink: '#2d5016', label: 'Game Preview' },
  playoff: { head: '#2b1a6e', head2: '#4a148c', soft: '#f4f1fb', edge: '#d9cdf3', ink: '#4a148c', label: 'Playoffs' },
  finals: { head: '#7c5c00', head2: '#b8860b', soft: '#fff9ea', edge: '#f0d58a', ink: '#7c5c00', label: 'Championship' }
};

export const tierOf = (type, round) => (/championship|final/i.test(round || '') ? 'finals' : type === 'playoff' ? 'playoff' : 'regular');

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
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

function fit(g, text, max, size, weight, family) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > max && s > 10) { s -= 1; g.font = `${weight} ${s}px ${family}`; }
}

const lineText = (o) => (o === null || o === undefined ? '' : o > 0 ? `+${o}` : String(o));
const logoSrc = (team) => `logos/${String(team || '').toLowerCase().replace(/\s+/g, '_')}.png`;

function blockHeight(it, detail) {
  if (it.day) return 34;
  const players = detail && (it.awayPlayers?.length || it.homePlayers?.length);
  return 128 + (it.line ? 18 : 0) + (players ? 24 + 18 * Math.max(it.awayPlayers?.length || 0, it.homePlayers?.length || 0) : 0);
}

async function draw({ heading, sub, items, detail }) {
  try { await Promise.all([document.fonts.load(`40px ${DISPLAY}`), document.fonts.load(`600 16px ${SANS}`)]); } catch { /* fallback fonts */ }
  const games = items.filter(it => !it.day);
  const tier = games.some(g => g.tier === 'finals') ? 'finals' : games.some(g => g.tier === 'playoff') ? 'playoff' : 'regular';
  const T = THEMES[tier];
  const logos = new Map();
  await Promise.all([...new Set(games.flatMap(g => [g.away, g.home]))].map(async t => logos.set(t, await loadImage(logoSrc(t)))));

  const W = 600, PAD = 20, HEAD = 64, SUB = 34, FOOT = 34, GAP = 10;
  const H = HEAD + SUB + PAD + items.reduce((n, it) => n + blockHeight(it, detail) + GAP, 0) + FOOT;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  // Header
  const grad = g.createLinearGradient(0, 0, W, HEAD);
  grad.addColorStop(0, T.head); grad.addColorStop(1, T.head2);
  g.fillStyle = grad; g.fillRect(0, 0, W, HEAD);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  fit(g, heading.toUpperCase(), W - 220, 34, 400, DISPLAY); g.fillText(heading.toUpperCase(), PAD, HEAD / 2 + 2);
  g.textAlign = 'right'; g.font = `600 12px ${SANS}`; g.globalAlpha = 0.85;
  g.fillText('MOUNTAINSIDE ACES', W - PAD, HEAD / 2 - 8); g.fillText(SITE, W - PAD, HEAD / 2 + 10); g.globalAlpha = 1;
  g.fillStyle = T.soft; g.fillRect(0, HEAD, W, SUB);
  g.fillStyle = T.ink; g.textAlign = 'left'; g.font = `700 13px ${SANS}`;
  g.fillText(sub.toUpperCase(), PAD, HEAD + SUB / 2);

  let y = HEAD + SUB + PAD;
  for (const it of items) {
    const h = blockHeight(it, detail);
    if (it.day) {
      g.fillStyle = '#1c201b'; g.textAlign = 'left'; g.font = `400 22px ${DISPLAY}`;
      g.fillText(it.day.toUpperCase(), PAD, y + h / 2 + 2);
      g.strokeStyle = '#e4e7e1'; g.beginPath(); g.moveTo(PAD + g.measureText(it.day.toUpperCase()).width + 10, y + h / 2); g.lineTo(W - PAD, y + h / 2); g.stroke();
      y += h + GAP; continue;
    }
    const th = THEMES[it.tier] || T;
    roundRect(g, PAD, y, W - PAD * 2, h, 12);
    g.fillStyle = it.tier === 'regular' ? '#f8faf7' : th.soft; g.fill();
    g.lineWidth = it.tier === 'regular' ? 1 : 2; g.strokeStyle = it.tier === 'regular' ? '#e4e7e1' : th.edge; g.stroke(); g.lineWidth = 1;
    // Label row
    g.textAlign = 'center'; g.fillStyle = th.ink; g.font = `700 11px ${SANS}`;
    g.fillText([it.when, it.label].filter(Boolean).join('  \u00b7  ').toUpperCase(), W / 2, y + 18);
    // Teams
    const side = (team, rec, place, line, cx) => {
      const img = logos.get(team);
      if (img) g.drawImage(img, cx - 22, y + 32, 44, 44);
      g.fillStyle = '#1c201b'; fit(g, String(team).toUpperCase(), 200, 26, 400, DISPLAY);
      g.fillText(String(team).toUpperCase(), cx, y + 92);
      g.fillStyle = '#5a6056'; g.font = `600 12px ${SANS}`;
      g.fillText([rec, place].filter(Boolean).join('  \u00b7  '), cx, y + 112);
      if (line !== null && line !== undefined && it.line) {
        g.font = `700 12px ${SANS}`; g.fillStyle = (it.line.favorite && it.line[it.line.favorite] === line) ? th.ink : '#5a6056';
        g.fillText(`Line ${lineText(line)}`, cx, y + 130);
      }
    };
    side(it.away, it.awayRec, it.awayPlace, it.line?.away, W * 0.27);
    side(it.home, it.homeRec, it.homePlace, it.line?.home, W * 0.73);
    g.fillStyle = th.ink; g.font = `400 30px ${DISPLAY}`; g.fillText('@', W / 2, y + 64);
    if (it.tier !== 'regular') { g.font = `700 10px ${SANS}`; g.fillText('WIN OR GO HOME', W / 2, y + 86); }
    if (detail && (it.awayPlayers?.length || it.homePlayers?.length)) {
      const top = y + 128 + (it.line ? 18 : 0);
      g.strokeStyle = it.tier === 'regular' ? '#e4e7e1' : th.edge; g.beginPath(); g.moveTo(PAD + 16, top); g.lineTo(W - PAD - 16, top); g.stroke();
      g.fillStyle = '#5a6056'; g.font = `700 10px ${SANS}`; g.fillText('PLAYERS TO WATCH', W / 2, top + 13);
      g.font = `500 13px ${SANS}`; g.fillStyle = '#1c201b';
      (it.awayPlayers || []).forEach((n, i) => g.fillText(n, W * 0.27, top + 32 + i * 18));
      (it.homePlayers || []).forEach((n, i) => g.fillText(n, W * 0.73, top + 32 + i * 18));
    }
    y += h + GAP;
  }
  // Footer
  g.fillStyle = '#8a9086'; g.textAlign = 'right'; g.font = `500 11px ${SANS}`;
  g.fillText(`Made ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}  \u00b7  ${SITE}`, W - PAD, H - FOOT / 2);
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('empty image'))), 'image/png'));
}

/** Draws the image and opens the share sheet on phones, or downloads it. */
export async function shareGames(opts) {
  const blob = await draw(opts);
  const name = `aces-${opts.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const phone = window.matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${opts.heading} - Mountainside Aces` }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('Image saved.', 'success');
}

/** Plain text for group chats. */
export function gamesText({ heading, sub, items }) {
  const out = [`${heading} - ${sub}`, ''];
  for (const it of items) {
    if (it.day) { out.push(it.day); continue; }
    out.push(`${it.away} at ${it.home}${it.when ? `, ${it.when}` : ''}${it.label ? ` (${it.label})` : ''}`);
    const rec = (t, r, p) => `  ${t}: ${[r, p].filter(Boolean).join(', ') || 'no games yet'}`;
    out.push(rec(it.away, it.awayRec, it.awayPlace), rec(it.home, it.homeRec, it.homePlace));
    if (it.line) out.push(`  Peter's line: ${it.away} ${lineText(it.line.away)}, ${it.home} ${lineText(it.line.home)}`);
    if (it.awayPlayers?.length || it.homePlayers?.length) {
      out.push(`  Players to watch: ${[...(it.awayPlayers || []).map(n => `${n} (${it.away})`), ...(it.homePlayers || []).map(n => `${n} (${it.home})`)].join(', ')}`);
    }
    out.push('');
  }
  out.push(SITE);
  return out.join('\n');
}
