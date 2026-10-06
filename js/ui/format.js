// js/ui/format.js
// Display formatting and link helpers. One copy of each, so every page shows
// names, averages and links the same way.
//
// Replaces the per-page copies of capitalize (43), escapeHtml / esc / escHtml
// (16), formatPlayerName (8), fmtAvg / formatAvg (5+), formatTeamName,
// formatIP, and link-helpers.js.
//
// Pure functions only: no Firebase, no DOM writes. Date parsing and game-date
// formatting belong to domain/dates.js (Phase 1), not here.

// ---------------------------------------------------------------------------
// Text safety
// ---------------------------------------------------------------------------

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape a value for use inside HTML text or a quoted attribute.
 * null/undefined become ''. Numbers and booleans are stringified.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Short aliases matching the names pages already use.
export const esc = escapeHtml;
export const escHtml = escapeHtml;

/**
 * Tagged template that escapes every interpolated value.
 *   el.innerHTML = html`<td>${player.name}</td>`;
 * Wrap a value in raw() to insert trusted markup unescaped.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += renderValue(values[i]) + strings[i + 1];
  }
  return out;
}

const RAW = Symbol('raw-html');

/** Mark a string as trusted markup for html``. Never pass user text to this. */
export function raw(markup) {
  return { [RAW]: true, value: String(markup ?? '') };
}

function renderValue(value) {
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value && value[RAW]) return value.value;
  return escapeHtml(value);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** First letter upper-cased, the rest left as is. */
export function capitalize(str) {
  if (!str) return '';
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Surnames that plain title-casing gets wrong. Keys are lower case.
// Add to this list rather than special-casing a name on a page.
const NAME_EXCEPTIONS = {
  delledonne: 'DelleDonne',
  mcdonald: 'McDonald',
  mccarthy: 'McCarthy',
  mccabe: 'McCabe',
  mcmahon: 'McMahon',
  mccorkell: 'McCorkell',
  lacasse: 'LaCasse',
  "o'grady": "O'Grady",
  denoble: 'DeNoble',
  digiacomo: 'DiGiacomo',
  deanna: 'DeAnna'
};

function titleWord(word) {
  if (!word) return '';
  const lower = word.toLowerCase();
  if (NAME_EXCEPTIONS[lower]) return NAME_EXCEPTIONS[lower];
  // Hyphenated names: each part gets its own capital (Smith-Jones)
  if (lower.includes('-')) return lower.split('-').map(titleWord).join('-');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Display form of a player name or legacy player ID.
 *   'steve_giordano' -> 'Steve Giordano'
 *   'JOHN MCDONALD'  -> 'John McDonald'
 */
export function formatPlayerName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(titleWord)
    .join(' ');
}

/**
 * Legacy snake_case player ID from a display name.
 *   'Steve Giordano' -> 'steve_giordano'
 * Only for building IDs the old way; resolving a player to the ID their stats
 * use is data/players.js's job (Phase 1), since merged profiles differ.
 */
export function toPlayerId(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Display form of a team ID: 'teal' -> 'Teal', 'army_green' -> 'Army Green'.
 * Returns fallback for an empty value.
 */
export function formatTeamName(teamId, fallback = 'Unknown') {
  if (!teamId) return fallback;
  return String(teamId)
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Lower-case team key for comparisons and CSS classes ('Teal' -> 'teal'). */
export function teamKey(team) {
  if (!team) return '';
  return String(team).trim().toLowerCase().replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return typeof value === 'number' ? value : parseFloat(value);
}

/**
 * Rate stat in baseball style: .345, 1.000, with no leading zero.
 * Use for AVG, OBP, SLG, OPS, fielding %.
 *   fmtAvg(0.3456) -> '.346'   fmtAvg(1) -> '1.000'   fmtAvg(null) -> '.000'
 * Pass empty to change what a missing value shows (for example '-').
 */
export function fmtAvg(value, { digits = 3, empty = '.000' } = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return empty;
  const s = n.toFixed(digits);
  return n < 1 && n > -1 ? s.replace(/^(-?)0\./, '$1.') : s;
}

// Old names used across pages.
export const formatAvg = fmtAvg;

/**
 * Average from counts, guarding against zero at-bats.
 *   avgFrom(12, 40) -> '.300'   avgFrom(0, 0) -> '.000'
 */
export function avgFrom(hits, atBats, options) {
  const ab = toNumber(atBats);
  if (!ab) return fmtAvg(null, options);
  return fmtAvg(toNumber(hits) / ab, options);
}

/**
 * ERA, WHIP and other rates that keep their leading digit: 3.50, 0.00.
 */
export function fmtRate(value, { digits = 2, empty = '-' } = {}) {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toFixed(digits) : empty;
}

/**
 * Innings pitched. Stored either as thirds-notation (5.1 = 5 1/3, 5.2 = 5 2/3)
 * or as a decimal of outs (5.333). Whole innings show no decimal.
 *   formatIP(5) -> '5'   formatIP(5.1) -> '5.1'   formatIP(5.3333) -> '5.1'
 */
export function formatIP(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '0';
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 1000) / 1000;
  if (frac === 0) return String(whole);
  // Already thirds-notation (.1 or .2): keep it.
  if (frac === 0.1 || frac === 0.2) return `${whole}.${frac * 10}`;
  // Decimal innings: convert to outs.
  const outs = Math.round(frac * 3);
  if (outs === 0) return String(whole);
  if (outs === 3) return String(whole + 1);
  return `${whole}.${outs}`;
}

/** Whole number with thousands separators: 1234 -> '1,234'. */
export function formatNumber(value, { digits = 0, empty = '0' } = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return empty;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Percentage from a 0-1 fraction: 0.625 -> '62.5%'.
 */
export function formatPct(value, { digits = 1, empty = '-' } = {}) {
  const n = toNumber(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : empty;
}

/** Signed number for differentials: 5 -> '+5', -3 -> '-3', 0 -> '0'. */
export function formatSigned(value, { digits = 0 } = {}) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '0';
  const s = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${s}`;
  if (n < 0) return `-${s}`;
  return s;
}

/** 1 -> '1st', 2 -> '2nd', 11 -> '11th', 23 -> '23rd'. */
export function ordinal(value) {
  const n = Math.trunc(toNumber(value));
  if (!Number.isFinite(n)) return '';
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[Math.abs(n) % 10] || 'th');
}

/** pluralize(1, 'game') -> '1 game'; pluralize(3, 'game') -> '3 games'. */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** W-L record, with ties only when there are any: '8-3' or '8-3-1'. */
export function formatRecord(wins = 0, losses = 0, ties = 0) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
// URLs are relative to the site root. Pages at the root can use them as is;
// pages in a subfolder (admin/) pass { base: '../' }.

/**
 * URL of a player's page. Accepts a player object ({ id | playerId, name })
 * or a plain name string. ID is preferred because names are not unique.
 */
export function playerUrl(player, { base = '' } = {}) {
  if (!player) return '#';
  if (typeof player === 'string') return `${base}player.html?name=${encodeURIComponent(player)}`;
  const id = player.id || player.playerId;
  if (id) return `${base}player.html?id=${encodeURIComponent(id)}`;
  const name = player.name || player.playerName || player.displayName;
  return name ? `${base}player.html?name=${encodeURIComponent(name)}` : '#';
}

/** URL of a team's page, optionally for a given season. */
export function teamUrl(team, { season, base = '' } = {}) {
  const name = typeof team === 'string' ? team : (team?.name || team?.id);
  if (!name) return '#';
  const q = new URLSearchParams({ team: name });
  if (season) q.set('season', season);
  return `${base}team.html?${q}`;
}

// Same names as link-helpers.js so moving a page over is a one-word change.
export const createPlayerLink = (player) => playerUrl(player);
export const createTeamLink = (team) => teamUrl(team);

/** <a> markup for a player, name escaped. */
export function playerLink(player, options = {}) {
  const label = options.label
    ?? formatPlayerName(typeof player === 'string' ? player : (player?.name || player?.playerName || player?.displayName || player?.id));
  return `<a class="player-link" href="${escapeHtml(playerUrl(player, options))}">${escapeHtml(label)}</a>`;
}

/** <a> markup for a team, with a team-<key> class for team colors. */
export function teamLink(team, options = {}) {
  const name = typeof team === 'string' ? team : (team?.name || team?.id);
  const label = options.label ?? formatTeamName(name);
  const key = teamKey(name);
  return `<a class="team-link team-${escapeHtml(key)}" href="${escapeHtml(teamUrl(team, options))}">${escapeHtml(label)}</a>`;
}
