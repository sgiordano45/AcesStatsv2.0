// js/ui/table.js
// The one stat table. Draws what js/ui/table-model.js computes: column presets,
// Qualified only (with the rule shown), Totals / Per game, Combine seasons,
// top/bottom 10% shading, sortable sticky header and first column, a card
// list on phones, settings in the URL, Copy CSV and Share as image.
//
//   import { mountStatTable } from './js/ui/table.js';
//   const table = mountStatTable(document.getElementById('stats'), config, {
//     rows,                         // optional; or call table.setRows(rows) later
//     emptyMessage: 'No stats for this season yet.',
//     exportName: 'aces-batting-2026-fall',   // CSV / image file name
//     exportTitle: 'Batting · 2026 Fall',     // heading on the shared image
//     rowClass: row => row.playerId === me ? 'is-me' : '',
//     onChange: state => {}         // after any toolbar change or sort
//   });
//   table.setLoading(true); table.setRows(rows); table.setState({ preset: 'advanced' });
//
// config is described in table-model.js. Each column's html(row, value, ctx)
// may return markup for the cell (links, team chips) and must escape its own
// text; otherwise the formatted text is escaped here.
//
// The table starts with skeleton rows until setRows() is called (or rows are
// passed in). URL keys are written with history.replaceState, so the back
// button is not filled with toggles. The page keeps its own keys (season,
// team) and reads them itself; writeUrlState leaves them alone.

import {
  computeView, readUrlState, writeUrlState, normalizeState, nextSort, toCSV
} from './table-model.js';
import { escapeHtml as esc } from './format.js';
import { showToast } from './toast.js';

const SITE_ROOT = new URL('../../', import.meta.url).href;
const HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const IMAGE_MAX_ROWS = 40;
const TALL_AFTER_ROWS = 15;   // more rows than this: the table scrolls inside a 70vh box so the header sticks

function ensureStyles() {
  for (const file of ['css/tokens.css', 'css/components.css', 'css/table.css']) {
    const href = new URL(file, SITE_ROOT).href;
    if (document.querySelector(`link[href="${href}"], link[href="${file}"], link[href="./${file}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

const ariaSort = (dir) => (dir === 'desc' ? 'descending' : 'ascending');

function cellHtml(cell, row, ctx) {
  if (typeof cell.col.html === 'function') {
    const out = cell.col.html(row, cell.value, { ...ctx, text: cell.text });
    if (out !== undefined && out !== null) return String(out);
  }
  return esc(cell.text);
}

function cellClass(cell, i) {
  const c = [];
  if (cell.col.type !== 'text') c.push('is-num');
  if (cell.shade === 'top') c.push('is-top');
  if (cell.shade === 'bottom') c.push('is-bottom');
  if (i === 0) c.push('is-first');
  return c.join(' ');
}

export function mountStatTable(el, config, options = {}) {
  if (!el) throw new Error('mountStatTable: no element');
  ensureStyles();

  const opts = { useUrl: true, ...options };
  let rows = Array.isArray(opts.rows) ? opts.rows : null;
  // URL settings win over opts.state (the page's defaults).
  let state = normalizeState(config, {
    ...(opts.state || {}),
    ...(opts.useUrl ? readUrlState(config, new URLSearchParams(location.search)) : {})
  });
  let view = null;
  const expanded = new Set();   // card indexes open on phones

  el.classList.add('aces-st');
  el.innerHTML = `
    <div class="aces-st__bar" data-st="bar"></div>
    <div class="aces-st__note" data-st="note" hidden></div>
    <div class="aces-table-wrap" data-st="wrap"></div>
    <ol class="aces-st__cards" data-st="cards"></ol>`;
  const $ = (k) => el.querySelector(`[data-st="${k}"]`);
  const bar = $('bar'), note = $('note'), wrap = $('wrap'), cards = $('cards');

  // ---- toolbar -----------------------------------------------------------

  function renderBar() {
    const presets = config.presets || [];
    const s = view ? view.state : state;
    const parts = [];
    if (presets.length > 1) {
      parts.push(`<div class="aces-segmented" role="group" aria-label="Columns">${presets.map(p =>
        `<button type="button" class="aces-segment" data-preset="${esc(p.key)}" aria-pressed="${p.key === s.preset}">${esc(p.label)}</button>`).join('')}</div>`);
    }
    if (config.games) {
      parts.push(`<div class="aces-segmented" role="group" aria-label="Totals or per game">
        <button type="button" class="aces-segment" data-per="t" aria-pressed="${!s.perGame}">Totals</button>
        <button type="button" class="aces-segment" data-per="g" aria-pressed="${s.perGame}">Per game</button></div>`);
    }
    const chips = [];
    if (config.qualifier) chips.push(`<button type="button" class="aces-chip" data-toggle="qualified" aria-pressed="${s.qualified}">Qualified</button>`);
    if (config.combine) chips.push(`<button type="button" class="aces-chip" data-toggle="combine" aria-pressed="${s.combine}">${esc(config.combine.label || 'Combine seasons')}</button>`);
    chips.push(`<button type="button" class="aces-chip" data-toggle="shade" aria-pressed="${s.shade}" title="Shade the top and bottom 10% of each column">Shading</button>`);
    parts.push(`<div class="aces-st__chips">${chips.join('')}</div>`);
    parts.push(`<div class="aces-st__actions">
      <button type="button" class="aces-btn is-sm is-ghost" data-action="csv">Copy CSV</button>
      <button type="button" class="aces-btn is-sm is-ghost" data-action="image">Share image</button></div>`);
    bar.innerHTML = parts.join('');
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.preset) return update({ preset: b.dataset.preset });
    if (b.dataset.per) return update({ perGame: b.dataset.per === 'g' });
    if (b.dataset.toggle) return update({ [b.dataset.toggle]: !(view ? view.state : state)[b.dataset.toggle] });
    if (b.dataset.action === 'csv') return copyCsv();
    if (b.dataset.action === 'image') return shareImage(b);
  });

  // ---- table, cards, note ------------------------------------------------

  function renderSkeleton() {
    const n = (config.presets?.[0]?.columns || config.columns || []).length || 6;
    wrap.classList.remove('is-tall');
    wrap.innerHTML = `<div class="aces-st__skeleton" aria-busy="true" aria-label="Loading">${
      Array.from({ length: 8 }, () => `<span class="aces-skeleton is-row"></span>`).join('')}</div>`;
    wrap.dataset.cols = n;
    cards.innerHTML = '';
    note.hidden = true;
  }

  function renderNote() {
    if (!view.qualifier) { note.hidden = true; return; }
    const label = view.qualifier.label ? esc(view.qualifier.label) : '';
    note.innerHTML = view.state.qualified
      ? `Qualified only${label ? ` (${label})` : ''}: ${view.rows.length} of ${view.totalRows}`
      : `Qualified${label ? ` = ${label}` : ''}. Rate stats are shaded among qualified rows only.`;
    note.hidden = false;
  }

  function renderEmpty() {
    const msg = view.totalRows && view.state.qualified
      ? 'No one qualifies yet. Turn off Qualified to see everyone.'
      : (opts.emptyMessage || 'No stats to show.');
    wrap.classList.remove('is-tall');
    wrap.innerHTML = `<div class="aces-empty">${esc(msg)}</div>`;
    cards.innerHTML = '';
  }

  function renderTable() {
    const { columns, sort, ctx } = view;
    const head = columns.map((col, i) => {
      const sorted = sort && sort.key === col.key;
      const cls = [col.type !== 'text' ? 'is-num' : '', i === 0 ? 'is-first' : ''].filter(Boolean).join(' ');
      return `<th scope="col"${cls ? ` class="${cls}"` : ''}${sorted ? ` aria-sort="${ariaSort(sort.dir)}"` : ''}>` +
        `<button type="button" class="aces-sort" data-sort="${esc(col.key)}"${col.title ? ` title="${esc(col.title)}"` : ''}>${esc(col.label)}</button></th>`;
    }).join('');
    const body = view.rows.map(r => {
      const rc = typeof opts.rowClass === 'function' ? opts.rowClass(r.row) : '';
      return `<tr${rc ? ` class="${esc(rc)}"` : ''}>${r.cells.map((cell, i) => {
        const cls = cellClass(cell, i);
        const tag = i === 0 ? 'th scope="row"' : 'td';
        return `<${tag}${cls ? ` class="${cls}"` : ''}>${cellHtml(cell, r.row, ctx)}</${i === 0 ? 'th' : 'td'}>`;
      }).join('')}</tr>`;
    }).join('');
    wrap.classList.toggle('is-tall', view.rows.length > TALL_AFTER_ROWS);
    wrap.innerHTML = `<table class="aces-table is-sticky-first${view.state.perGame ? ' is-per-game' : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderCards() {
    const { columns, cardColumns, ctx } = view;
    const first = columns[0];
    const subKey = config.cardSub;
    const keySet = new Set([first.key, subKey, ...cardColumns.map(c => c.key)]);
    const idx = (key) => columns.findIndex(c => c.key === key);
    cards.innerHTML = view.rows.map((r, n) => {
      const cellOf = (key) => r.cells[idx(key)];
      const rest = r.cells.filter(c => !keySet.has(c.col.key));
      const rc = typeof opts.rowClass === 'function' ? opts.rowClass(r.row) : '';
      const sub = subKey && idx(subKey) >= 0 ? `<span class="aces-st__card-sub">${cellHtml(cellOf(subKey), r.row, ctx)}</span>` : '';
      const stat = (c) => `<div class="aces-st__stat${c.shade ? ` is-${c.shade}` : ''}"><dt>${esc(c.col.label)}</dt><dd>${cellHtml(c, r.row, ctx)}</dd></div>`;
      const open = expanded.has(n);
      return `<li class="aces-st__card${rc ? ' ' + esc(rc) : ''}${open ? ' is-open' : ''}" data-card="${n}">
        <div class="aces-st__card-head"><span class="aces-st__card-name">${cellHtml(r.cells[0], r.row, ctx)}</span>${sub}
          ${rest.length ? `<button type="button" class="aces-st__more" aria-expanded="${open}" aria-label="More stats">${open ? '−' : '+'}</button>` : ''}</div>
        <dl class="aces-st__stats">${cardColumns.map(c => cellOf(c.key)).filter(Boolean).map(stat).join('')}</dl>
        ${rest.length ? `<dl class="aces-st__stats is-rest"${open ? '' : ' hidden'}>${rest.map(stat).join('')}</dl>` : ''}
      </li>`;
    }).join('');
  }

  cards.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('[data-card]');
    if (!li) return;
    const n = Number(li.dataset.card);
    if (expanded.has(n)) expanded.delete(n); else expanded.add(n);
    const open = expanded.has(n);
    li.classList.toggle('is-open', open);
    const rest = li.querySelector('.is-rest');
    if (rest) rest.hidden = !open;
    const btn = li.querySelector('.aces-st__more');
    if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? '−' : '+'; }
  });

  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b || !view) return;
    const col = view.columns.find(c => c.key === b.dataset.sort);
    if (col) update({ sort: nextSort(view.sort, col) });
  });

  function render() {
    renderBar();
    if (!rows) { renderSkeleton(); return; }
    view = computeView(config, rows, state);
    state = view.state;
    renderBar();
    renderNote();
    if (!view.rows.length) { renderEmpty(); return; }
    renderTable();
    renderCards();
  }

  function writeUrl() {
    if (!opts.useUrl) return;
    const params = new URLSearchParams(location.search);
    writeUrlState(config, state, params);
    const qs = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }

  function update(patch) {
    state = normalizeState(config, { ...state, ...patch });
    expanded.clear();
    render();
    writeUrl();
    if (typeof opts.onChange === 'function') opts.onChange({ ...state });
  }

  // ---- export ------------------------------------------------------------

  const fileBase = () => String(opts.exportName || config.id || 'aces-stats').replace(/[^\w.-]+/g, '-');

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function copyCsv() {
    if (!view || !view.rows.length) return showToast('Nothing to copy yet', 'info');
    const csv = toCSV(view);
    try {
      await navigator.clipboard.writeText(csv);
      showToast(`Copied ${view.rows.length} rows as CSV`);
    } catch {
      download(new Blob([csv], { type: 'text/csv' }), `${fileBase()}.csv`);
      showToast('Saved as a CSV file', 'info');
    }
  }

  function loadHtml2canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = HTML2CANVAS;
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => reject(new Error('Could not load html2canvas'));
      document.head.appendChild(s);
    });
  }

  // Draws the first IMAGE_MAX_ROWS rows off screen (no scroll box, no
  // toolbar) with a title and the site name, then shares or downloads it.
  async function shareImage(btn) {
    if (!view || !view.rows.length) return showToast('Nothing to share yet', 'info');
    btn.disabled = true;
    const box = document.createElement('div');
    box.className = 'aces-st__capture';
    const shown = view.rows.slice(0, IMAGE_MAX_ROWS);
    const more = view.rows.length - shown.length;
    try {
      const html2canvas = await loadHtml2canvas();
      const saveRows = view.rows;
      view.rows = shown;
      renderTable();
      const table = wrap.innerHTML;
      view.rows = saveRows;
      renderTable();
      const preset = view.presets.length > 1 && view.preset ? ` · ${view.preset.label}` : '';
      box.innerHTML = `<div class="aces-st__capture-title">${esc(opts.exportTitle || document.title)}${esc(preset)}${view.state.perGame ? ' · per game' : ''}</div>
        ${table}
        <div class="aces-st__capture-foot">${more > 0 ? `Top ${shown.length} of ${view.rows.length} · ` : ''}${esc(location.host)}</div>`;
      document.body.appendChild(box);
      const bg = getComputedStyle(document.body).backgroundColor;
      const canvas = await html2canvas(box, { backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff', scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, logging: false });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      const file = new File([blob], `${fileBase()}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: opts.exportTitle || document.title }); }
        catch (e) { if (e.name !== 'AbortError') download(blob, file.name); }
      } else {
        download(blob, file.name);
        showToast('Image saved');
      }
    } catch (e) {
      console.error('[table] share image', e);
      showToast('Could not make the image', 'error');
    } finally {
      box.remove();
      btn.disabled = false;
    }
  }

  // ---- public API --------------------------------------------------------

  render();

  return {
    setRows(next) { rows = Array.isArray(next) ? next : []; expanded.clear(); render(); },
    setLoading(on = true) { if (on) { rows = null; render(); } },
    setState(patch = {}) { update(patch); },
    getState() { return { ...state }; },
    getView() { return view; },
    refresh() { render(); },
    destroy() { el.innerHTML = ''; el.classList.remove('aces-st'); }
  };
}

export default mountStatTable;
