// js/domain/season-ids.js
// Season IDs as stat records store them, and how pages label and order them.
// Pure: no Firebase, no DOM.
//
// Stat records (aggregatedPlayerStats seasons / pitchingSeasons) can carry a
// team and sub suffix on older seasons: '2024-fall-gold-sub'. The season is
// always the first two parts.
//
//   parseStatSeasonId('2024-fall-gold-sub') -> { id: '2024-fall', year: '2024', name: 'fall', isSub: true }
//   seasonLabel('2024-fall') -> '2024 Fall'
//   seasonSortKey('2024-fall') -> 20243   (newer seasons sort higher)

export const SEASON_ORDER = Object.freeze({ spring: 1, summer: 2, fall: 3 });

// First season with complete extra-base hits and RBI for every game. 2026
// Summer records have the fields, but only some games were tracked (109
// doubles on 4,021 hits), so 2B/3B/HR/RBI/SLG/OPS start here.
export const HIT_TYPES_FROM = '2026-fall';

export function parseStatSeasonId(raw) {
  const parts = String(raw || '').toLowerCase().split('-');
  const year = parts[0] || '';
  const name = parts[1] || '';
  return { id: year && name ? `${year}-${name}` : '', year, name, isSub: parts.slice(2).includes('sub') };
}

export function seasonLabel(id) {
  const { year, name } = parseStatSeasonId(id);
  return year && name ? `${year} ${name.charAt(0).toUpperCase()}${name.slice(1)}` : String(id || '');
}

export function seasonSortKey(id) {
  const { year, name } = parseStatSeasonId(id);
  return (Number(year) || 0) * 10 + (SEASON_ORDER[name] || 0);
}

/** True when a season's batting records have complete 2B/3B/HR/RBI. */
export function hasCompleteHitTypes(id) {
  return seasonSortKey(id) >= seasonSortKey(HIT_TYPES_FROM);
}

/** Unique season IDs from a list, newest first. */
export function sortSeasonIds(ids) {
  return [...new Set(ids)].filter(Boolean).sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
}

// ---------------------------------------------------------------------------
// Innings
// ---------------------------------------------------------------------------

/**
 * Innings as a true number. Stored innings are either decimals (5.333) or
 * baseball thirds notation (5.1 = 5 1/3, 5.2 = 5 2/3); thirds are converted.
 * Use this before adding innings up or dividing by them.
 */
export function inningsValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 1000) / 1000;
  if (frac === 0.1) return whole + 1 / 3;
  if (frac === 0.2) return whole + 2 / 3;
  return n;
}
