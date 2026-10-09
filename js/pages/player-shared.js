// js/pages/player-shared.js
// Small helpers the player.html tab modules share (player-batting.js,
// player-pitching.js, player-splits.js, ...). No Firebase reads here.

import { escapeHtml as esc, fmtAvg, fmtRate, formatIP } from '../ui/format.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { icon } from '../ui/icons.js';
import { parseGameDate } from '../domain/dates.js';
import { battingAverage, onBasePct, era } from '../domain/stats.js';
import { seasonLabel, seasonSortKey } from '../domain/season-ids.js';

export { esc, fmtAvg, fmtRate, formatIP, icon, seasonLabel, seasonSortKey };

export const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '');

/** 'Fall 2025' style ids from a stat key: '2025-fall-teal' -> '2025-fall'. */
export const baseSeasonId = (key) => String(key || '').split('-').slice(0, 2).join('-');

export function teamAttr(team) {
  const k = String(team || '').toLowerCase().trim();
  return TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : '';
}

/** Team dot and name, not a link (opponents in game logs). */
export function teamName(team) {
  const t = cap(team || 'Unknown');
  return `<span class="pl-team"><span class="aces-team-dot"${teamAttr(t)}></span>${esc(t)}</span>`;
}

/** A card with a heading. */
export function card(title, body, { iconName = '', extra = '', cls = '' } = {}) {
  return `<section class="aces-card pl-card ${cls}">
    <div class="aces-card-head"><h2 class="aces-card-title">${iconName ? icon(iconName) : ''}${esc(title)}</h2>${extra}</div>
    ${body}
  </section>`;
}

export function empty(title, message = '', iconName = 'info') {
  return `<div class="aces-empty pl-empty">${icon(iconName)}<p class="aces-empty-title">${esc(title)}</p>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
}

export function emptyCard(title, message = '', iconName = 'info') {
  return `<section class="aces-card">${empty(title, message, iconName)}</section>`;
}

export const loadingCard = () => `<section class="aces-card"><span class="aces-skeleton is-title"></span><span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span></section>`;

// ---------------------------------------------------------------------------
// Game docs (playerStats/{id}/games and pitchingStats/{id}/games)
// ---------------------------------------------------------------------------

/** A game doc's date: Timestamp, Date or an ET date string (read with local parts). */
export function gameDate(g) {
  const v = g?.gameDate;
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  return parseGameDate(v || g?.gameDateFormatted) || null;
}

export const gameTime = (g) => gameDate(g)?.getTime() ?? 0;

export function shortDate(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
}

export const isPlayoffGame = (g) => g.isPlayoff === true || /^playoff$/i.test(String(g.gameType || ''));

// ---------------------------------------------------------------------------
// Batting and pitching lines for split tables
// ---------------------------------------------------------------------------

export const ZERO_BAT = Object.freeze({ games: 0, atBats: 0, hits: 0, runs: 0, walks: 0 });

export function addBat(into, s) {
  if (!s) return into;
  into.games += Number(s.games) || 0;
  into.atBats += Number(s.atBats) || 0;
  into.hits += Number(s.hits) || 0;
  into.runs += Number(s.runs) || 0;
  into.walks += Number(s.walks) || 0;
  return into;
}

export const batLine = (s) => ({ ...s, avg: battingAverage(s.hits, s.atBats), obp: onBasePct(s.hits, s.walks, s.atBats) });

/**
 * A small split table: rows of { label, iconName, s: {games, atBats, hits, runs, walks} }.
 * The better AVG and OBP of two rows are marked.
 */
export function batSplitTable(rows, { firstLabel = 'Split' } = {}) {
  const lines = rows.map(r => ({ ...r, s: batLine(r.s) }));
  const best = (k) => {
    const vals = lines.filter(l => l.s.atBats + l.s.walks > 0).map(l => l.s[k]);
    if (vals.length < 2) return null;
    const max = Math.max(...vals);
    return vals.filter(v => v === max).length === 1 ? max : null;
  };
  const bA = best('avg'), bO = best('obp');
  const cell = (v, b, has) => `<td class="is-num${b !== null && has && v === b ? ' pl-better' : ''}">${has ? fmtAvg(v) : '-'}</td>`;
  return `<div class="aces-table-wrap"><table class="aces-table is-compact pl-split-table">
    <thead><tr><th scope="col">${esc(firstLabel)}</th><th scope="col" class="is-num">G</th><th scope="col" class="is-num">AB</th><th scope="col" class="is-num">H</th>
      <th scope="col" class="is-num">R</th><th scope="col" class="is-num">BB</th><th scope="col" class="is-num">AVG</th><th scope="col" class="is-num">OBP</th></tr></thead>
    <tbody>${lines.map(l => {
      const has = l.s.atBats + l.s.walks > 0;
      return `<tr><th scope="row">${l.iconName ? icon(l.iconName) : ''}${l.html || esc(l.label)}</th>
        <td class="is-num">${l.s.games}</td><td class="is-num">${l.s.atBats}</td><td class="is-num">${l.s.hits}</td>
        <td class="is-num">${l.s.runs}</td><td class="is-num">${l.s.walks}</td>${cell(l.s.avg, bA, has)}${cell(l.s.obp, bO, has)}</tr>`;
    }).join('')}</tbody></table></div>`;
}

/** Pitching split table: rows of { label, s: { games, ip, ra } }. Lower ERA is marked. */
export function pitSplitTable(rows, { firstLabel = 'Split' } = {}) {
  const lines = rows.map(r => ({ ...r, era: era(r.s.ra, r.s.ip) }));
  const eras = lines.map(l => l.era).filter(v => v !== null);
  const low = eras.length >= 2 ? Math.min(...eras) : null;
  const lowOnce = low !== null && eras.filter(v => v === low).length === 1;
  return `<div class="aces-table-wrap"><table class="aces-table is-compact pl-split-table">
    <thead><tr><th scope="col">${esc(firstLabel)}</th><th scope="col" class="is-num">G</th><th scope="col" class="is-num">IP</th>
      <th scope="col" class="is-num">R</th><th scope="col" class="is-num">ERA</th><th scope="col" class="is-num">R/G</th></tr></thead>
    <tbody>${lines.map(l => `<tr><th scope="row">${l.iconName ? icon(l.iconName) : ''}${l.html || esc(l.label)}</th>
      <td class="is-num">${l.s.games}</td><td class="is-num">${formatIP(l.s.ip)}</td><td class="is-num">${l.s.ra}</td>
      <td class="is-num${lowOnce && l.era === low ? ' pl-better' : ''}">${fmtRate(l.era)}</td>
      <td class="is-num">${l.s.games ? fmtRate(l.s.ra / l.s.games) : '-'}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// js/ui/table.js configs
// ---------------------------------------------------------------------------

/** A summary table (fixed rows, no sorting, Qualified or Combine): Season column is the row label. */
export function summaryConfig(config, label = '') {
  return {
    ...config,
    qualifier: null,
    combine: null,
    columns: config.columns.map(c => (c.key === 'season' ? { ...c, label, defaultDir: undefined } : c)),
    presets: config.presets.map(p => ({ ...p, sort: null }))
  };
}

const dateCol = { key: 'date', label: 'Date', type: 'text', defaultDir: 'desc', value: r => r.time, format: (v, r) => r.dateText, csv: r => r.dateText };
const oppCol = { key: 'opp', label: 'Opponent', type: 'text', value: r => r.opponent, html: r => teamName(r.opponent) };
const haCol = { key: 'ha', label: 'H/A', type: 'text', value: r => (r.isHome ? 'Home' : 'Away'), html: r => `<span class="aces-badge is-outline">${r.isHome ? 'Home' : 'Away'}</span>` };
const typeCol = { key: 'type', label: 'Type', type: 'text', value: r => (r.playoff ? 'Playoff' : 'Regular'), html: r => (r.playoff ? '<span class="aces-badge is-accent">Playoff</span>' : 'Regular') };

/** Rows for a game log from game docs. */
export function gameLogRows(games) {
  return games.map((g, i) => {
    const d = gameDate(g);
    return {
      ...g, id: g.id || String(i), name: '',
      time: d ? d.getTime() : 0, dateText: d ? shortDate(d) : '-',
      opponent: cap(g.opponent || 'Unknown'), isHome: !!g.isHome, playoff: isPlayoffGame(g)
    };
  });
}

export function battingLogConfig(id) {
  const hasType = (k) => (rows) => rows.some(r => typeof r[k] === 'number');
  return {
    id,
    cardSub: 'opp',
    columns: [
      dateCol, oppCol, haCol, typeCol,
      { key: 'AB', label: 'AB', type: 'count', value: r => Number(r.atBats) || 0 },
      { key: 'H', label: 'H', type: 'count', value: r => Number(r.hits) || 0 },
      { key: '2B', label: '2B', type: 'count', value: r => r.doubles ?? null, when: hasType('doubles') },
      { key: 'HR', label: 'HR', type: 'count', value: r => r.homeRuns ?? null, when: hasType('homeRuns') },
      { key: 'R', label: 'R', type: 'count', value: r => Number(r.runs) || 0 },
      { key: 'BB', label: 'BB', type: 'count', value: r => Number(r.walks) || 0 },
      { key: 'AVG', label: 'AVG', type: 'rate', qualifiedOnly: false, value: r => (r.atBats ? r.hits / r.atBats : null), format: v => fmtAvg(v, { empty: '-' }) }
    ],
    presets: [{ key: 'log', label: 'Game log', sort: '-date', card: ['AB', 'H', 'R', 'BB'],
      columns: ['date', 'opp', 'ha', 'type', 'AB', 'H', '2B', 'HR', 'R', 'BB', 'AVG'] }],
    qualifier: null
  };
}

export function pitchingLogConfig(id) {
  return {
    id,
    cardSub: 'opp',
    columns: [
      dateCol, oppCol, haCol, typeCol,
      { key: 'IP', label: 'IP', type: 'count', value: r => r.ip, format: v => formatIP(v) },
      { key: 'R', label: 'R', title: 'Runs allowed', type: 'count', shade: false, value: r => r.ra },
      { key: 'ERA', label: 'ERA', type: 'rate', lowerIsBetter: true, qualifiedOnly: false, value: r => era(r.ra, r.ip), format: v => fmtRate(v) }
    ],
    presets: [{ key: 'log', label: 'Game log', sort: '-date', card: ['IP', 'R', 'ERA'], columns: ['date', 'opp', 'ha', 'type', 'IP', 'R', 'ERA'] }],
    qualifier: null
  };
}

/** File-name friendly name: 'Steve Giordano' -> 'steve-giordano'. */
export const slug = (name) => String(name || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
