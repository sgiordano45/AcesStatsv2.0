// js/ui/table-model.js
// The pure half of the stat table: no DOM, no Firebase. js/ui/table.js draws
// what computeView() returns; tests/table.html (and Node) test this file alone.
//
// A table is described once by the page:
//
//   const config = {
//     id: 'bat',                       // URL prefix when a page has several tables ('' = none)
//     columns: [
//       { key: 'name', label: 'Player', type: 'text', value: r => r.name },
//       { key: 'G',  label: 'G',  type: 'count', value: r => r.games, perGame: false },
//       { key: 'H',  label: 'H',  type: 'count', value: r => r.hits },
//       { key: 'BA', label: 'BA', type: 'rate', value: r => battingAverage(r.hits, r.atBats),
//         format: v => fmtAvg(v), qualifiedOnly: true },
//       { key: 'ERA', label: 'ERA', type: 'rate', lowerIsBetter: true, ... },
//       { key: 'SLG', ..., when: rows => rows.every(r => r.hasHitTypes) }
//     ],
//     presets: [
//       { key: 'standard', label: 'Standard', columns: ['name','G','H','BA'], card: ['G','H','BA','OBP'], sort: '-BA' },
//     ],
//     games: r => r.games,             // for "per game"; omit to hide the toggle
//     qualifier: state => ({ label: 'min 2.0 PA per team game', test: r => ... }),   // or null
//     combine: { key: r => r.playerId, merge: group => ({...}) },   // omit to hide the toggle
//   };
//
// Column fields:
//   key        short, stable, used in the URL (?sort=-OPS) and CSV header
//   label      header text; title = tooltip (stat-tooltips wording)
//   type       'text' | 'count' | 'rate'. Counts divide by games in per-game mode.
//   value(row) the raw value used for sorting, shading and CSV
//   format(v, row, ctx) plain text shown in the cell and CSV (default: number / string)
//   html(row, v, ctx)   optional richer cell (links, team chip). Must escape itself.
//   lowerIsBetter  flips sort default and shading (ERA, RA)
//   perGame    false keeps a count column as-is in per-game mode (G, GP)
//   shade      false turns rank shading off for the column (text never shades)
//   qualifiedOnly  rate columns: only qualified rows are shaded (default true for rates)
//   when(rows) optional: the column only shows when this is true for the rows in view
//   defaultDir 'asc' | 'desc': the first-click direction (Season: newest first)
//   csv(row, value) optional plain text for the CSV (else the formatted text)

export const DEFAULT_STATE = Object.freeze({
  preset: null,      // null = first preset
  qualified: false,
  perGame: false,
  shade: true,
  combine: false,
  sort: null         // null = the preset's sort; otherwise { key, dir: 'asc'|'desc' }
});

export const SHADE_SHARE = 0.10;   // top and bottom 10%
export const SHADE_MIN_ROWS = 10;  // fewer rows than this: no shading

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Columns and presets
// ---------------------------------------------------------------------------

export function getPreset(config, key) {
  const presets = config.presets || [];
  return presets.find(p => p.key === key) || presets[0] || null;
}

export function columnMap(config) {
  const map = new Map();
  for (const c of config.columns || []) map.set(c.key, c);
  return map;
}

// Columns the preset lists, in its order, minus any whose when() fails.
export function visibleColumns(config, preset, rows = []) {
  const map = columnMap(config);
  const keys = preset?.columns || (config.columns || []).map(c => c.key);
  const out = [];
  for (const k of keys) {
    const c = map.get(k);
    if (!c) continue;
    if (typeof c.when === 'function' && !c.when(rows)) continue;
    out.push(c);
  }
  return out;
}

// The card's key stats: the preset's card list, else the first 4 non-text
// visible columns. Hidden columns are skipped.
export function cardColumns(config, preset, columns) {
  const visible = new Set(columns.map(c => c.key));
  const map = columnMap(config);
  const wanted = (preset?.card || []).filter(k => visible.has(k)).map(k => map.get(k));
  if (wanted.length) return wanted.slice(0, 4);
  return columns.filter(c => c.type !== 'text').slice(0, 4);
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

// The value a cell shows: per-game divides counts by games.
export function cellValue(col, row, ctx = {}) {
  let v = typeof col.value === 'function' ? col.value(row) : row[col.key];
  if (ctx.perGame && col.type === 'count' && col.perGame !== false && isNum(v)) {
    const g = ctx.games ? Number(ctx.games(row)) : 0;
    v = g > 0 ? v / g : null;
  }
  return v;
}

export function formatValue(col, v, row, ctx = {}) {
  if (typeof col.format === 'function') return col.format(v, row, ctx);
  if (v === null || v === undefined || v === '') return col.type === 'text' ? '' : '-';
  if (isNum(v)) {
    if (ctx.perGame && col.type === 'count' && col.perGame !== false) return v.toFixed(2);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// '-OBP' -> { key: 'OBP', dir: 'desc' }; 'name' -> asc.
export function parseSort(text) {
  if (!text || typeof text !== 'string') return null;
  const desc = text.startsWith('-');
  const key = desc ? text.slice(1) : text;
  return key ? { key, dir: desc ? 'desc' : 'asc' } : null;
}

export function sortToString(sort) {
  if (!sort || !sort.key) return '';
  return (sort.dir === 'desc' ? '-' : '') + sort.key;
}

// The first click on a header: best first (high for most stats, low for
// ERA/RA, A-Z for text).
export function defaultDir(col) {
  if (col && (col.defaultDir === 'asc' || col.defaultDir === 'desc')) return col.defaultDir;
  if (!col || col.type === 'text') return 'asc';
  return col.lowerIsBetter ? 'asc' : 'desc';
}

// Clicking a header: a new column starts at its default; the same column flips.
export function nextSort(current, col) {
  if (current && current.key === col.key) {
    return { key: col.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: col.key, dir: defaultDir(col) };
}

// Stable sort. Missing values (null, NaN, '') always go last whichever way.
export function sortRows(rows, col, dir, ctx = {}) {
  if (!col) return rows.slice();
  const sign = dir === 'desc' ? -1 : 1;
  const keyed = rows.map((row, i) => ({ row, i, v: cellValue(col, row, ctx) }));
  const missing = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  keyed.sort((a, b) => {
    const am = missing(a.v), bm = missing(b.v);
    if (am || bm) return am === bm ? a.i - b.i : (am ? 1 : -1);
    let c;
    if (isNum(a.v) && isNum(b.v)) c = a.v - b.v;
    else c = String(a.v).localeCompare(String(b.v), undefined, { sensitivity: 'base', numeric: true });
    return c !== 0 ? c * sign : a.i - b.i;
  });
  return keyed.map(k => k.row);
}

// ---------------------------------------------------------------------------
// Combining rows (one row per player instead of per player-season)
// ---------------------------------------------------------------------------

// Groups rows by combine.key and hands each group to combine.merge. Group
// order follows the first row of each group.
export function combineRows(rows, combine) {
  if (!combine || typeof combine.key !== 'function' || typeof combine.merge !== 'function') return rows.slice();
  const groups = new Map();
  for (const r of rows) {
    const k = combine.key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()].map(g => combine.merge(g));
}

// Helper for merge(): adds up the named numeric fields across a group.
export function sumFields(group, fields) {
  const out = {};
  for (const f of fields) {
    out[f] = group.reduce((s, r) => s + (Number(r?.[f]) || 0), 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rank shading
// ---------------------------------------------------------------------------

// For each shaded column, the values at or beyond which a cell is top or
// bottom 10%. Pool: rows with a number; for rate columns (unless
// qualifiedOnly is false) only qualified rows. No cutoffs when the pool is
// smaller than SHADE_MIN_ROWS or every value is the same.
// Returns Map(key -> { top, bottom, lowerIsBetter, pool: Set(row) | null }).
export function shadeCutoffs(columns, rows, ctx = {}) {
  const out = new Map();
  for (const col of columns) {
    if (col.type === 'text' || col.shade === false) continue;
    const rateOnlyQualified = col.type === 'rate' && col.qualifiedOnly !== false && typeof ctx.isQualified === 'function';
    const poolRows = rateOnlyQualified ? rows.filter(ctx.isQualified) : rows;
    const vals = [];
    for (const r of poolRows) {
      const v = cellValue(col, r, ctx);
      if (isNum(v)) vals.push(v);
    }
    if (vals.length < SHADE_MIN_ROWS) continue;
    vals.sort((a, b) => b - a);                       // high first
    const n = Math.max(1, Math.floor(vals.length * SHADE_SHARE));
    const hi = vals[n - 1];                           // nth highest
    const lo = vals[vals.length - n];                 // nth lowest
    if (hi === lo) continue;
    out.set(col.key, {
      top: col.lowerIsBetter ? lo : hi,
      bottom: col.lowerIsBetter ? hi : lo,
      lowerIsBetter: !!col.lowerIsBetter,
      pool: rateOnlyQualified ? new Set(poolRows) : null
    });
  }
  return out;
}

// 'top' | 'bottom' | ''. A value that is both (tiny spread) counts as top.
export function shadeFor(cut, v, row) {
  if (!cut || !isNum(v)) return '';
  if (cut.pool && !cut.pool.has(row)) return '';
  if (cut.lowerIsBetter) {
    if (v <= cut.top) return 'top';
    if (v >= cut.bottom) return 'bottom';
  } else {
    if (v >= cut.top) return 'top';
    if (v <= cut.bottom) return 'bottom';
  }
  return '';
}

// ---------------------------------------------------------------------------
// The view: everything table.js needs to draw
// ---------------------------------------------------------------------------

export function normalizeState(config, state = {}) {
  const s = { ...DEFAULT_STATE, ...state };
  const preset = getPreset(config, s.preset);
  s.preset = preset ? preset.key : null;
  if (!config.games) s.perGame = false;
  if (!config.combine) s.combine = false;
  if (!config.qualifier) s.qualified = false;
  const map = columnMap(config);
  if (s.sort && !map.has(s.sort.key)) s.sort = null;
  return s;
}

// rows: the page's rows after its own filters (season, team).
export function computeView(config, rows = [], state = {}) {
  const s = normalizeState(config, state);
  const preset = getPreset(config, s.preset);

  let base = s.combine ? combineRows(rows, config.combine) : rows.slice();

  const q = typeof config.qualifier === 'function' ? config.qualifier(s) : (config.qualifier || null);
  const isQualified = q && typeof q.test === 'function' ? q.test : null;
  const ctx = { perGame: s.perGame, games: config.games || null, isQualified, combine: s.combine };

  const totalRows = base.length;
  if (s.qualified && isQualified) base = base.filter(isQualified);

  const columns = visibleColumns(config, preset, base);
  const map = columnMap(config);

  // Sort: the URL/click sort if its column is showing, else the preset's.
  let sort = s.sort && columns.some(c => c.key === s.sort.key) ? s.sort : parseSort(preset?.sort);
  if (sort && !columns.some(c => c.key === sort.key)) sort = null;
  const sorted = sort ? sortRows(base, map.get(sort.key), sort.dir, ctx) : base;

  const cuts = s.shade ? shadeCutoffs(columns, sorted, ctx) : new Map();

  const out = sorted.map(row => ({
    row,
    qualified: isQualified ? !!isQualified(row) : true,
    cells: columns.map(col => {
      const value = cellValue(col, row, ctx);
      return { col, value, text: formatValue(col, value, row, ctx), shade: shadeFor(cuts.get(col.key), value, row) };
    })
  }));

  return {
    state: s,
    preset,
    presets: config.presets || [],
    columns,
    cardColumns: cardColumns(config, preset, columns),
    sort,
    ctx,
    qualifier: q ? { label: q.label || '' } : null,
    canPerGame: !!config.games,
    canCombine: !!config.combine,
    totalRows,
    rows: out
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The columns and rows in view, as shown (per-game applied, formatted).
// A column's csv(row, value) wins over its formatted text (e.g. a team name
// instead of a chip's label).
export function toCSV(view) {
  const lines = [view.columns.map(c => csvCell(c.label)).join(',')];
  for (const r of view.rows) {
    lines.push(r.cells.map(cell => {
      const t = typeof cell.col.csv === 'function' ? cell.col.csv(r.row, cell.value) : cell.text;
      return csvCell(t);
    }).join(','));
  }
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// URL state: ?preset=advanced&q=1&per=g&sort=-OBP&shade=0&combine=1
// With config.id = 'bat' the keys become bat.preset, bat.q, ...
// Defaults are left out, so a plain page has a plain URL.
// ---------------------------------------------------------------------------

export function urlKeys(config) {
  const p = config.id ? `${config.id}.` : '';
  return { preset: p + 'preset', q: p + 'q', per: p + 'per', sort: p + 'sort', shade: p + 'shade', combine: p + 'combine' };
}

// The settings the URL names, and nothing else, so a page's own defaults
// (opts.state) still apply to the rest.
export function readUrlState(config, params) {
  const k = urlKeys(config);
  const get = (key) => (params && typeof params.get === 'function' ? params.get(key) : null);
  const state = {};
  if (get(k.preset)) state.preset = get(k.preset);
  if (get(k.q) !== null) state.qualified = get(k.q) === '1';
  if (get(k.per) !== null) state.perGame = get(k.per) === 'g';
  if (get(k.shade) !== null) state.shade = get(k.shade) !== '0';
  if (get(k.combine) !== null) state.combine = get(k.combine) === '1';
  const sort = parseSort(get(k.sort));
  if (sort) state.sort = sort;
  return state;   // only the keys in the URL; normalizeState() fills the rest
}

// Writes the table's keys into params (a URLSearchParams), leaving the page's
// own keys (season, team) alone.
export function writeUrlState(config, state, params) {
  const k = urlKeys(config);
  const s = normalizeState(config, state);
  const first = (config.presets || [])[0]?.key || null;
  const set = (key, val) => (val === null ? params.delete(key) : params.set(key, val));
  set(k.preset, s.preset && s.preset !== first ? s.preset : null);
  set(k.q, s.qualified ? '1' : null);
  set(k.per, s.perGame ? 'g' : null);
  set(k.shade, s.shade ? null : '0');
  set(k.combine, s.combine ? '1' : null);
  set(k.sort, s.sort ? sortToString(s.sort) : null);
  return params;
}
