// js/domain/dates.js
// Game dates and times. One parser for every page.
//
//   import { parseGameDate, toDateKey, formatGameDate, formatTime } from './js/domain/dates.js';
//
// How game dates are stored:
//   - Regular-season games: date is a 'YYYY-MM-DD' string, time a 12-hour ET
//     string ('7:45 PM').
//   - Playoff and some older games: date is a Firestore Timestamp.
//   - A few older docs: 'M/D/YYYY' strings.
//
// The rule: a date string is a calendar day in ET, so it is built from its
// own year/month/day with new Date(y, m - 1, d). Never new Date('2026-06-14'):
// that reads the string as UTC midnight, which is the evening before in ET.
// A Timestamp is an instant, so it is converted to its calendar day in ET.
//
// Comparing days: use date keys ('YYYY-MM-DD' strings). They sort and compare
// as plain strings, with no time-of-day or timezone in play.
//
// Replaces parseGameDate (10 copies), formatDate / formatGameDate / formatTime
// (14+ copies) and the 23 new Date(game.date) parses.

export const LEAGUE_TIME_ZONE = 'America/New_York';

const pad2 = (n) => String(n).padStart(2, '0');

function validYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d;
}

const keyOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

// Calendar day of an instant in ET: { y, m, d }.
let etFormatter = null;
function etParts(date) {
  etFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric'
  });
  const parts = {};
  for (const p of etFormatter.formatToParts(date)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

function isTimestampLike(value) {
  return !!value && typeof value === 'object' &&
    (typeof value.toDate === 'function' || typeof value.seconds === 'number');
}

function timestampToDate(value) {
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
}

/**
 * Any stored game date -> 'YYYY-MM-DD' (its calendar day in ET), or '' when
 * missing or unreadable.
 *   '2026-06-14'          -> '2026-06-14'
 *   '6/14/2026'           -> '2026-06-14'
 *   '2026-06-14T19:45'    -> '2026-06-14' (the date part is taken as written)
 *   Timestamp / Date      -> its day in ET
 */
export function toDateKey(value) {
  if (value === null || value === undefined || value === '') return '';

  if (isTimestampLike(value) || value instanceof Date) {
    const date = value instanceof Date ? value : timestampToDate(value);
    if (Number.isNaN(date.getTime())) return '';
    const { y, m, d } = etParts(date);
    return keyOf(y, m, d);
  }

  const s = String(value).trim();
  if (!s) return '';

  // YYYY-MM-DD, with or without a time part after it
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return validYmd(y, m, d) ? keyOf(y, m, d) : '';
  }

  // M/D/YYYY (what toLocaleDateString('en-US') writes), or M/D/YY
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:$|[,\s])/.exec(s);
  if (match) {
    let y = Number(match[3]);
    if (match[3].length === 2) y += 2000;
    const [m, d] = [Number(match[1]), Number(match[2])];
    return validYmd(y, m, d) ? keyOf(y, m, d) : '';
  }

  // Anything else ('June 14, 2026'): only a string with no zone or offset,
  // read with local components so it can't shift a day.
  if (/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(s)) {
    const date = new Date(s);
    if (Number.isNaN(date.getTime())) return '';
    const { y, m, d } = etParts(date);
    return keyOf(y, m, d);
  }
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return '';
  return keyOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Stored game date -> Date at local midnight of that day, or null.
 * Use for display and day arithmetic; use toDateKey for comparisons.
 */
export function parseGameDate(value) {
  return dateFromKey(toDateKey(value));
}

/** 'YYYY-MM-DD' -> Date at local midnight, or null. */
export function dateFromKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Today's date key in ET: '2026-10-06'. */
export function todayKey(now = new Date()) {
  const { y, m, d } = etParts(now);
  return keyOf(y, m, d);
}

/** Date key n days after (or before, if negative) a date key. */
export function addDays(key, days) {
  const date = dateFromKey(key);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return keyOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Whole days from key a to key b (b later -> positive). */
export function daysBetween(a, b) {
  const da = dateFromKey(a);
  const db = dateFromKey(b);
  if (!da || !db) return NaN;
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(db) - utc(da)) / 86400000);
}

/**
 * True when a game's date is on or before a reference day (default: today in
 * ET). A game with no date counts as on or before, as the old pages did.
 */
export function isOnOrBefore(dateValue, refKey = todayKey()) {
  const key = toDateKey(dateValue);
  return !key || key <= refKey;
}

/** True when a game's date is after the reference day (default: today in ET). */
export function isAfter(dateValue, refKey = todayKey()) {
  const key = toDateKey(dateValue);
  return !!key && key > refKey;
}

// ---------------------------------------------------------------------------
// Times ('7:45 PM')
// ---------------------------------------------------------------------------

/**
 * '7:45 PM' / '7:45pm' / '19:45' / '7 PM' -> minutes after midnight, or null.
 */
export function parseTimeMinutes(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i.exec(s);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2] || 0);
  const meridiem = (match[3] || '').replace(/\./g, '').toUpperCase();
  if (mins > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else {
    if (match[2] === undefined || hours > 23) return null; // bare '7' is not a time
  }
  return hours * 60 + mins;
}

/** Sort value for a game time: minutes after midnight, unknown times last (9999). */
export function timeSortValue(value) {
  const minutes = parseTimeMinutes(value);
  return minutes === null ? 9999 : minutes;
}

/**
 * Game time for display: '7:45 PM'. Accepts 12- or 24-hour input. Text that
 * isn't a time (like 'TBD') comes back trimmed and unchanged.
 */
export function formatTime(value) {
  if (value === null || value === undefined) return '';
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return String(value).trim();
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 || 12;
  return `${h12}:${pad2(minutes % 60)} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/** Date plus time -> local Date at that moment, or null without a date. */
export function parseGameDateTime(dateValue, timeValue) {
  const date = parseGameDate(dateValue);
  if (!date) return null;
  const minutes = parseTimeMinutes(timeValue);
  if (minutes !== null) date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/**
 * Array.sort comparator for games: by day, then time, earliest first.
 * Pass { desc: true } for latest first. Reads game.date and game.time unless
 * dateField / timeField say otherwise.
 */
export function compareGames(a, b, { desc = false, dateField = 'date', timeField = 'time' } = {}) {
  const ka = toDateKey(a?.[dateField]);
  const kb = toDateKey(b?.[dateField]);
  let diff = ka === kb ? 0 : (ka < kb ? -1 : 1);
  if (!diff) diff = timeSortValue(a?.[timeField]) - timeSortValue(b?.[timeField]);
  return desc ? -diff : diff;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const DATE_STYLES = {
  short: { weekday: 'short', month: 'short', day: 'numeric' },                    // Sat, Jun 14
  medium: { month: 'short', day: 'numeric', year: 'numeric' },                    // Jun 14, 2026
  long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },      // Saturday, June 14, 2026
  full: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },    // Sat, Jun 14, 2026
  monthDay: { month: 'short', day: 'numeric' },                                   // Jun 14
  numeric: { month: 'numeric', day: 'numeric', year: 'numeric' },                 // 6/14/2026
  weekday: { weekday: 'long' }                                                    // Saturday
};

/**
 * Game date for display. style: short (default) | medium | long | full |
 * monthDay | numeric | weekday. Missing dates show `empty` ('TBD').
 */
export function formatGameDate(value, style = 'short', { empty = 'TBD' } = {}) {
  const date = parseGameDate(value);
  if (!date) return empty;
  return date.toLocaleDateString('en-US', DATE_STYLES[style] || DATE_STYLES.short);
}

/** 'Sat, Jun 14 \u00b7 7:45 PM' (or just the date when there's no time). */
export function formatGameDateTime(dateValue, timeValue, style = 'short', { empty = 'TBD', separator = ' \u00b7 ' } = {}) {
  const day = formatGameDate(dateValue, style, { empty });
  const time = formatTime(timeValue);
  return time && day !== empty ? `${day}${separator}${time}` : day;
}

/** 'Today', 'Tomorrow', 'Yesterday', else the short date. */
export function formatRelativeDay(value, { now = new Date(), style = 'short', empty = 'TBD' } = {}) {
  const key = toDateKey(value);
  if (!key) return empty;
  const diff = daysBetween(todayKey(now), key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatGameDate(key, style, { empty });
}
