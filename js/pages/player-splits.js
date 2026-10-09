// js/pages/player-splits.js
// player.html Splits tab (it replaced player-splits.html): regular season vs
// playoffs, home vs away, summer vs fall, by opponent, and a sortable game log,
// for the career or one season.
//
// Data:
//   aggregatedPlayerStats2025Splits/{nameId}  2025 seasons (seasons.{id}.splits / vsOpponent, careerSplits)
//   aggregatedPlayerStats seasons.{key}.splits / vsOpponent  2026 on
//   season totals (any year)                  summer vs fall for seasons without game-level splits
//   playerStats/{nameId}/games                game log (2025 on)
// 2025 game data is partial except 2025 Fall for Silver and White.

import { db, doc, getDoc } from '../core/firebase.js';
import { mountStatTable } from '../ui/table.js';
import { parseStatSeasonId, sortSeasonIds } from '../domain/season-ids.js';
import {
  esc, icon, card, empty, emptyCard, seasonLabel, seasonSortKey, ZERO_BAT, addBat, batSplitTable,
  battingLogConfig, gameLogRows, teamName, cap, slug, baseSeasonId
} from './player-shared.js';

const SPLITS_2025 = 'aggregatedPlayerStats2025Splits';
const COMPLETE_2025_FALL_TEAMS = ['silver', 'white'];
const KEYS = ['home', 'away', 'regular', 'playoff'];

const blank = () => ({ ...ZERO_BAT });
const blankSplits = () => Object.fromEntries(KEYS.map(k => [k, blank()]));

function addSplits(into, s) {
  if (!s) return into;
  KEYS.forEach(k => addBat(into[k], s[k]));
  return into;
}
function addOpp(into, v) {
  Object.entries(v || {}).forEach(([opp, s]) => addBat(into[cap(opp)] ||= blank(), s));
  return into;
}
const hasGameSplits = (s) => !!s && (s.home.games > 0 || s.away.games > 0 || s.regular.games > 0 || s.playoff.games > 0);

/** Per base season: { splits | null, opp, totals, team, partial }. */
function buildSeasons(ctx, s25) {
  const out = {};
  const get = (sid) => (out[sid] ||= { splits: null, opp: {}, totals: blank(), teams: new Set() });
  const from25 = new Set();
  Object.entries(s25?.seasons || {}).forEach(([key, s]) => {
    const sid = baseSeasonId(key);
    if (!s?.splits) return;
    from25.add(sid);
    const e = get(sid);
    e.splits = addSplits(e.splits || blankSplits(), s.splits);
    addOpp(e.opp, s.vsOpponent);
    addBat(addBat(e.totals, s.splits.regular), s.splits.playoff);
  });
  Object.entries(ctx.player?.seasons || {}).forEach(([key, s]) => {
    const sid = parseStatSeasonId(key).id;
    if (!sid) return;
    const e = get(sid);
    if (s?.team) e.teams.add(String(s.team).toLowerCase());
    if (from25.has(sid)) return;   // the 2025 splits doc covers it
    if (s?.splits) {
      e.splits = addSplits(e.splits || blankSplits(), s.splits);
      addOpp(e.opp, s.vsOpponent);
      addBat(addBat(e.totals, s.splits.regular), s.splits.playoff);
    } else {
      addBat(e.totals, s);
    }
  });
  Object.entries(out).forEach(([sid, e]) => {
    e.partial = sid.startsWith('2025-') && !!e.splits && !(sid === '2025-fall' && [...e.teams].some(t => COMPLETE_2025_FALL_TEAMS.includes(t)));
    if (!e.totals.games && !e.totals.atBats && !hasGameSplits(e.splits)) delete out[sid];
  });
  return out;
}

export async function render(el, ctx) {
  let s25 = null, games = [];
  const [a, b] = await Promise.allSettled([
    getDoc(doc(db, SPLITS_2025, ctx.nameId)),
    ctx.battingGames()
  ]);
  if (a.status === 'fulfilled' && a.value.exists()) s25 = a.value.data();
  if (b.status === 'fulfilled') games = b.value.filter(g => seasonSortKey(g.seasonId) >= seasonSortKey('2025-summer'));

  const seasons = buildSeasons(ctx, s25);
  const ids = sortSeasonIds(Object.keys(seasons));
  if (!ids.length && !games.length) {
    el.innerHTML = emptyCard('No splits yet', 'Splits appear once this player has game stats.', 'columns');
    return;
  }

  let scope = 'career';
  el.innerHTML = `
    <div class="pl-scope">
      <label class="aces-field is-inline"><span class="aces-label">Show</span>
        <span class="aces-select-wrap is-inline"><select class="aces-select is-sm" data-split-scope>
          <option value="career">Career</option>
          ${ids.map(s => `<option value="${esc(s)}">${esc(seasonLabel(s))}${seasons[s].partial ? ' (partial)' : ''}</option>`).join('')}
        </select></span></label>
    </div>
    <div data-split-note></div>
    <div class="pl-splits" data-split-cards></div>
    <div data-split-opp></div>
    ${card('Game log', '<div data-split-log></div>', { iconName: 'list' })}`;

  const log = mountStatTable(el.querySelector('[data-split-log]'), battingLogConfig('glog'), {
    useUrl: false, emptyMessage: 'No tracked games for this selection.',
    exportName: `aces-${slug(ctx.name)}-game-log`, exportTitle: `${ctx.name} game log`
  });

  const draw = () => {
    const list = scope === 'career' ? ids : [scope];
    const splits = blankSplits();
    const opp = {};
    let any = false;
    const summer = blank(), fall = blank();
    list.forEach(sid => {
      const e = seasons[sid];
      if (!e) return;
      if (e.splits) { any = true; addSplits(splits, e.splits); addOpp(opp, e.opp); }
      const name = parseStatSeasonId(sid).name;
      if (name === 'summer') addBat(summer, e.totals);
      if (name === 'fall') addBat(fall, e.totals);
    });
    // The 2025 doc's own career line, when it has one, matches the old page's career view.
    if (scope === 'career' && s25?.careerSplits?.splits) {
      const fromSeasons = blankSplits();
      ids.filter(s => s.startsWith('2025-')).forEach(s => addSplits(fromSeasons, seasons[s].splits));
      if (!hasGameSplits(fromSeasons)) addSplits(splits, s25.careerSplits.splits);
    }

    const partial = list.some(s => seasons[s]?.partial);
    el.querySelector('[data-split-note]').innerHTML = partial
      ? `<div class="aces-notice is-warning">${icon('alert')}<div><strong>Partial game data.</strong> Game-level splits for 2025 are incomplete${scope === 'career' ? ' and are included here' : ''}; full tracking starts with 2026 Summer.</div></div>`
      : '';

    const noGame = empty('No game-level data', 'Home/away and playoff splits start with 2025.', 'columns');
    const gameSplits = hasGameSplits(splits);
    const sf = summer.games || fall.games;
    el.querySelector('[data-split-cards]').innerHTML = [
      card('Regular season vs playoffs', gameSplits ? batSplitTable([
        { label: 'Regular season', iconName: 'calendar', s: splits.regular },
        { label: 'Playoffs', iconName: 'trophy', s: splits.playoff }
      ]) : noGame, { iconName: 'trophy' }),
      card('Home vs away', gameSplits ? batSplitTable([
        { label: 'Home', iconName: 'home', s: splits.home },
        { label: 'Away', iconName: 'map-pin', s: splits.away }
      ]) : noGame, { iconName: 'arrow-left-right' }),
      card('Summer vs fall', sf ? batSplitTable([
        { label: 'Summer', iconName: 'sun', s: summer },
        { label: 'Fall', iconName: 'leaf', s: fall }
      ]) : empty('No season totals', '', 'calendar'), { iconName: 'calendar' })
    ].join('');

    const oppRows = Object.entries(opp).filter(([, s]) => s.games > 0).sort((x, y) => y[1].games - x[1].games);
    el.querySelector('[data-split-opp]').innerHTML = oppRows.length && any
      ? card('By opponent', batSplitTable(oppRows.map(([team, s]) => ({ label: team, html: teamName(team), s })), { firstLabel: 'Opponent' }), { iconName: 'swords' })
      : '';

    const shown = scope === 'career' ? games : games.filter(g => baseSeasonId(g.seasonId) === scope);
    log.setRows(gameLogRows(shown));
  };
  draw();
  el.querySelector('[data-split-scope]').addEventListener('change', (e) => { scope = e.target.value; draw(); });
}
