// js/pages/playoffs-format.js
// Playoff bracket shape for playoffs.html: building a bracket for any number
// of teams (2 to 16) with standard seeding and byes for the top seeds, and the
// league-staff dialog that sets the format and each game's date and time.
//
// The bracket doc keeps the shape every reader expects
// (seasons/{id}/playoffs/bracket): round1, quarterfinals, semifinals and
// finals arrays of series { id, round, team1, team2, seriesWins1, seriesWins2,
// winner, games: [{ gameNum, date 'YYYY-MM-DD', time 'HH:MM', homeTeam 1|2,
// ifNecessary, team1Score, team2Score }] }. A team slot is { seed } or
// { from: seriesId }. The format used is saved as format: { teams, bestOf }.

import { escapeHtml as esc } from '../ui/format.js';
import { openModal } from '../ui/modal.js';

export const ROUND_KEYS = ['round1', 'quarterfinals', 'semifinals', 'finals'];
export const ROUND_TITLES = { round1: 'Round 1', quarterfinals: 'Quarterfinals', semifinals: 'Semifinals', finals: 'Finals' };
const ID_PREFIX = { round1: 'r1s', quarterfinals: 'qf', semifinals: 'sf', finals: 'f' };
export const MAX_TEAMS = 16;

/** Every series in the bracket, round by round. */
export function allSeries(data) {
  return ROUND_KEYS.flatMap((k) => data?.[k] || []);
}

export const winsNeeded = (series) => Math.floor((series.games || []).length / 2) + 1;

/** Seeds in standard bracket order: 8 -> [1, 8, 4, 5, 2, 7, 3, 6]. */
function bracketOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** Rounds a bracket of `teams` needs, from the first round played to the final. */
export function roundKeysFor(teams) {
  const rounds = Math.min(ROUND_KEYS.length, Math.max(1, Math.ceil(Math.log2(Math.max(2, teams)))));
  return ROUND_KEYS.slice(ROUND_KEYS.length - rounds);
}

function makeGames(bestOf, keep = []) {
  const need = Math.floor(bestOf / 2) + 1;
  return Array.from({ length: bestOf }, (_, i) => {
    const gameNum = i + 1;
    const old = keep.find((g) => g.gameNum === gameNum) || {};
    return {
      gameNum,
      date: old.date || '',
      time: old.time || '',
      homeTeam: old.homeTeam || (i % 2 === 0 ? 1 : 2),
      ifNecessary: gameNum > need,
      team1Score: null,
      team2Score: null
    };
  });
}

/**
 * A new projected bracket. bestOf is { roundKey: 1|3|5 } (default 3). Dates and
 * times are carried over from `previous` for series and games with the same ID.
 */
export function generateBracket({ teams, bestOf = {} }, previous = null) {
  const keys = roundKeysFor(teams);
  const size = 2 ** keys.length;
  const order = bracketOrder(size);
  const oldSeries = new Map(allSeries(previous).map((s) => [s.id, s]));
  const out = { isProjected: true, lockedAt: null, lockedSeeds: [], format: { teams, bestOf: {} } };
  ROUND_KEYS.forEach((k) => { out[k] = []; });

  // Slots entering the first round: pairs of seeds; a seed past `teams` is a bye.
  let slots = [];
  for (let i = 0; i < order.length; i += 2) slots.push([{ seed: order[i] }, { seed: order[i + 1] }]);

  keys.forEach((key) => {
    const n = bestOf[key] || 3;
    out.format.bestOf[key] = n;
    const next = [];
    let count = 0;
    for (const [a, b] of slots) {
      const bye = (s) => s.seed && s.seed > teams;
      if (bye(b)) { next.push(a); continue; }
      if (bye(a)) { next.push(b); continue; }
      count += 1;
      const id = `${ID_PREFIX[key]}${count}`;
      out[key].push({
        id, round: ROUND_TITLES[key], team1: a, team2: b,
        seriesWins1: 0, seriesWins2: 0, winner: null,
        games: makeGames(n, oldSeries.get(id)?.games || [])
      });
      next.push({ from: id });
    }
    slots = [];
    for (let i = 0; i < next.length; i += 2) slots.push([next[i], next[i + 1]]);
  });
  return out;
}

/** Recount series wins and winners from the game scores. */
export function recount(data) {
  for (const s of allSeries(data)) {
    let w1 = 0;
    let w2 = 0;
    for (const g of s.games || []) {
      if (g.team1Score === null || g.team2Score === null || g.team1Score === undefined || g.team2Score === undefined) continue;
      if (g.team1Score > g.team2Score) w1 += 1;
      else if (g.team2Score > g.team1Score) w2 += 1;
    }
    s.seriesWins1 = w1;
    s.seriesWins2 = w2;
    const need = winsNeeded(s);
    s.winner = w1 >= need ? 1 : w2 >= need ? 2 : null;
  }
  return data;
}

/** Games that still need a date or a time (for publishing or locking). */
export function missingDates(data) {
  const out = [];
  for (const s of allSeries(data)) {
    for (const g of s.games || []) if (!g.date || !g.time) out.push(`${s.round} ${s.id.toUpperCase()} game ${g.gameNum}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Format dialog (league staff, before the bracket is locked)
// ---------------------------------------------------------------------------

/**
 * @param {object} data   the current projected bracket
 * @param {object} o
 * @param {number} o.teamCount   teams in the standings (default for "Teams")
 * @param {(slot: object) => string} o.label   display text for a team slot
 * @returns {Promise<object|null>} the new bracket, or null when cancelled
 */
export async function editFormat(data, { teamCount, label }) {
  let draft = JSON.parse(JSON.stringify(data));
  const teams0 = draft.format?.teams || teamCount || 8;
  const SAVE = Symbol('save');

  const body = document.createElement('div');
  body.className = 'po-format';

  const bestOfFor = (key) => draft.format?.bestOf?.[key] || (allSeries(draft).find((s) => s.round === ROUND_TITLES[key])?.games.length) || 3;

  function controls(teams) {
    const keys = roundKeysFor(teams);
    return `<div class="po-format-top">
      <label class="po-field"><span class="aces-label">Playoff teams</span>
        <input class="aces-input" type="number" min="2" max="${MAX_TEAMS}" value="${teams}" data-f="teams"></label>
      ${keys.map((k) => `<label class="po-field"><span class="aces-label">${esc(ROUND_TITLES[k])}</span>
        <span class="aces-select-wrap"><select class="aces-select" data-f="bestOf" data-key="${k}">
          ${[1, 3, 5].map((n) => `<option value="${n}"${bestOfFor(k) === n ? ' selected' : ''}>Best of ${n}</option>`).join('')}
        </select></span></label>`).join('')}
      <button type="button" class="aces-btn is-sm" data-f="rebuild">Rebuild bracket</button>
    </div>
    <p class="po-hint">Top seeds get byes when the field isn't a power of two. Rebuilding keeps the dates of games that still exist.</p>`;
  }

  function gamesTable() {
    return ROUND_KEYS.filter((k) => (draft[k] || []).length).map((k) => `<fieldset class="po-fround">
      <legend>${esc(ROUND_TITLES[k])}</legend>
      ${draft[k].map((s) => `<div class="po-series">
        <div class="po-series-name"><b>${esc(s.id.toUpperCase())}</b> ${esc(label(s.team1))} vs ${esc(label(s.team2))}</div>
        ${s.games.map((g) => `<div class="po-game" data-series="${esc(s.id)}" data-game="${g.gameNum}">
          <span class="po-gnum">G${g.gameNum}${g.ifNecessary ? '<small>if nec.</small>' : ''}</span>
          <input class="aces-input" type="date" value="${esc(g.date || '')}" data-g="date" aria-label="${esc(s.id)} game ${g.gameNum} date">
          <input class="aces-input" type="time" value="${esc(g.time || '')}" data-g="time" step="900" aria-label="${esc(s.id)} game ${g.gameNum} time">
          <span class="aces-select-wrap"><select class="aces-select" data-g="homeTeam" aria-label="Home team">
            <option value="1"${g.homeTeam === 1 ? ' selected' : ''}>Home: ${esc(label(s.team1))}</option>
            <option value="2"${g.homeTeam === 2 ? ' selected' : ''}>Home: ${esc(label(s.team2))}</option>
          </select></span>
        </div>`).join('')}
      </div>`).join('')}
    </fieldset>`).join('');
  }

  function readGames() {
    body.querySelectorAll('.po-game').forEach((row) => {
      const s = allSeries(draft).find((x) => x.id === row.dataset.series);
      const g = s?.games.find((x) => x.gameNum === Number(row.dataset.game));
      if (!g) return;
      g.date = row.querySelector('[data-g="date"]').value || '';
      g.time = row.querySelector('[data-g="time"]').value || '';
      g.homeTeam = Number(row.querySelector('[data-g="homeTeam"]').value) || 1;
    });
  }

  function paint() {
    body.innerHTML = controls(draft.format?.teams || teams0) + `<div class="po-format-games">${gamesTable()}</div>`;
  }

  draft.format ??= { teams: teams0, bestOf: {} };
  paint();

  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-f="rebuild"]')) return;
    readGames();
    const teams = Math.max(2, Math.min(MAX_TEAMS, Number(body.querySelector('[data-f="teams"]').value) || teams0));
    const bestOf = {};
    body.querySelectorAll('[data-f="bestOf"]').forEach((sel) => { bestOf[sel.dataset.key] = Number(sel.value); });
    roundKeysFor(teams).forEach((k) => { bestOf[k] ??= 3; });
    draft = generateBracket({ teams, bestOf }, draft);
    paint();
  });
  body.addEventListener('change', (e) => {
    // A changed best-of or team count only takes effect with Rebuild; say so.
    if (e.target.matches('[data-f]')) body.querySelector('[data-f="rebuild"]')?.classList.add('is-primary');
  });

  const result = await openModal({
    title: 'Playoff format and dates',
    body,
    wide: true,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Save', value: SAVE, variant: 'primary' }
    ]
  });
  if (result !== SAVE) return null;
  readGames();
  return draft;
}
