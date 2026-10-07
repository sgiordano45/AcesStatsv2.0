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

// Extra-base hits and RBI (2B/3B/HR/RBI, so SLG/OPS) are complete for every
// team from HIT_TYPES_FROM on. Before that, only the teams listed in
// HIT_TYPES_TEAMS tracked them for every game: in 2026 Summer their RBI add up
// to their runs (Teal 126 of 126, Black 169 of 179, Blue 164 of 192); the other
// eight teams have 0 RBI. Add a team here if its older games are filled in.
export const HIT_TYPES_FROM = '2026-fall';
export const HIT_TYPES_TEAMS = Object.freeze({
  '2026-summer': ['black', 'blue', 'teal']
});

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

/**
 * True when a team's batting records for a season have complete 2B/3B/HR/RBI.
 * Without a team: true only when every team that season has them.
 */
export function hasCompleteHitTypes(id, team = null) {
  const season = parseStatSeasonId(id).id;
  if (seasonSortKey(season) >= seasonSortKey(HIT_TYPES_FROM)) return true;
  return !!team && (HIT_TYPES_TEAMS[season] || []).includes(String(team).toLowerCase());
}

/** True when any team that season has complete 2B/3B/HR/RBI. */
export function seasonHasHitTypes(id) {
  const season = parseStatSeasonId(id).id;
  return seasonSortKey(season) >= seasonSortKey(HIT_TYPES_FROM) || (HIT_TYPES_TEAMS[season] || []).length > 0;
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
