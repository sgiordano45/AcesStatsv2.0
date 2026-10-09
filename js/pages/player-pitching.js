// js/pages/player-pitching.js
// player.html Pitching tab (it replaced pitcher.html): seasons and career,
// then home/away, by opponent and the game log from game-level docs.
//
// Data: aggregatedPlayerStats pitchingSeasons for older seasons, and
// pitchingStats/{legacyId}/games from 2026 Summer on. A season with game docs
// is added up from them; any other season uses the stored line. Pitching is
// G, IP, R, ERA and R/G only (no W/L/SV, K, BB or H).

import { mountStatTable } from '../ui/table.js';
import { pitchingTableConfig } from '../ui/pitching-stats.js';
import { applyTeamGames } from '../data/team-games.js';
import { pitchingSeasonsObjectToArray } from '../data/player-stats.js';
import { parseStatSeasonId, inningsValue, sortSeasonIds } from '../domain/season-ids.js';
import {
  esc, card, emptyCard, seasonLabel, seasonSortKey, summaryConfig, gameLogRows, pitchingLogConfig,
  pitSplitTable, teamName, cap, slug, baseSeasonId
} from './player-shared.js';

function seasonRows(ctx, games) {
  const base = { id: ctx.id, ids: [ctx.id], name: ctx.name, seasonCount: 1, teamGames: 0 };
  const make = (seasonId, team, games_, ip, runsAllowed, sub = false) => {
    const t = cap(team);
    return { ...base, team: t, teamKey: t.toLowerCase(), seasonId, seasonLabel: seasonLabel(seasonId), seasonKey: seasonSortKey(seasonId), sub, games: games_, ip, runsAllowed };
  };
  const bySeason = {};
  for (const g of games) {
    const sid = baseSeasonId(g.seasonId) || 'unknown';
    const s = (bySeason[sid] ||= { games: 0, ip: 0, ra: 0, team: '' });
    s.games++;
    s.ip += inningsValue(g.inningsPitched ?? 0);
    s.ra += Number(g.runsAllowed) || 0;
    if (g.teamId) s.team = g.teamId;
  }
  const rows = Object.entries(bySeason).map(([sid, s]) => make(sid, s.team, s.games, s.ip, s.ra));
  for (const s of pitchingSeasonsObjectToArray(ctx.player)) {
    const sid = parseStatSeasonId(s.seasonId);
    if (!sid.id || bySeason[sid.id]) continue;
    const g = Number(s.games) || 0, ip = inningsValue(s.inningsPitched);
    if (!g && !ip) continue;
    rows.push(make(sid.id, s.team || ctx.player.currentTeam, g, ip, Number(s.runsAllowed) || 0, sid.isSub));
  }
  return rows.sort((a, b) => b.seasonKey - a.seasonKey);
}

const sumGames = (list) => list.reduce((t, g) => ({ games: t.games + 1, ip: t.ip + inningsValue(g.inningsPitched ?? 0), ra: t.ra + (Number(g.runsAllowed) || 0) }), { games: 0, ip: 0, ra: 0 });

export async function render(el, ctx) {
  let games = [];
  try { games = await ctx.pitchingGames(); } catch (err) { console.warn('[player] pitching games unavailable', err); }
  const rows = seasonRows(ctx, games);
  if (!rows.length) {
    el.innerHTML = emptyCard('No pitching yet', 'No pitching appearances have been recorded.', 'softball');
    return;
  }

  const gameSeasons = sortSeasonIds(games.map(g => baseSeasonId(g.seasonId)));
  el.innerHTML = `
    ${card('Seasons', '<div id="plPitTable"></div>', { iconName: 'table' })}
    ${card('Career', '<div id="plPitCareer"></div>', { iconName: 'chart-bar' })}
    ${games.length ? `<div id="plPitGames"></div>` : `<p class="pl-note pl-foot-note">Home/away, opponent splits and a game log start with 2026 Summer, when pitching was first tracked by game.</p>`}`;

  const name = ctx.name;
  const table = mountStatTable(el.querySelector('#plPitTable'),
    pitchingTableConfig({ id: 'pit', omit: ['name'], lead: ['season', 'team'], sort: '-season' }), {
      rows, emptyMessage: 'No pitching stats yet.', exportName: `aces-${slug(name)}-pitching`, exportTitle: `${name} pitching`
    });
  applyTeamGames(rows).then(() => table.refresh()).catch(err => console.warn('[player] team games', err));

  const config = pitchingTableConfig({ id: 'pcar', omit: ['name', 'team'], lead: ['season'] });
  mountStatTable(el.querySelector('#plPitCareer'), summaryConfig(config), {
    useUrl: false,
    rows: [{ ...config.combine.merge(rows), seasonLabel: 'Career total', seasonKey: 1, seasonCount: 2, team: '', teamKey: '' }],
    exportName: `aces-${slug(name)}-pitching-career`, exportTitle: `${name} career pitching`
  });

  if (!games.length) return;
  const host = el.querySelector('#plPitGames');
  let scope = 'all';
  host.innerHTML = `
    <div class="pl-scope">
      <label class="aces-field is-inline"><span class="aces-label">Games</span>
        <span class="aces-select-wrap is-inline"><select class="aces-select is-sm" data-pit-scope>
          <option value="all">All tracked games</option>
          ${gameSeasons.map(s => `<option value="${esc(s)}">${esc(seasonLabel(s))}</option>`).join('')}
        </select></span></label>
    </div>
    <div class="pl-two">
      <div data-pit-ha></div>
      <div data-pit-opp></div>
    </div>
    ${card('Game log', '<div data-pit-log></div>', { iconName: 'list' })}`;

  const log = mountStatTable(host.querySelector('[data-pit-log]'), pitchingLogConfig('plog'), {
    useUrl: false, emptyMessage: 'No games.', exportName: `aces-${slug(name)}-pitching-log`, exportTitle: `${name} pitching log`
  });

  const draw = () => {
    const list = scope === 'all' ? games : games.filter(g => baseSeasonId(g.seasonId) === scope);
    host.querySelector('[data-pit-ha]').innerHTML = card('Home and away', pitSplitTable([
      { label: 'Home', iconName: 'home', s: sumGames(list.filter(g => g.isHome)) },
      { label: 'Away', iconName: 'map-pin', s: sumGames(list.filter(g => !g.isHome)) }
    ]), { iconName: 'arrow-left-right' });
    const opp = {};
    list.forEach(g => { (opp[cap(g.opponent || 'Unknown')] ||= []).push(g); });
    host.querySelector('[data-pit-opp]').innerHTML = card('By opponent', pitSplitTable(
      Object.entries(opp).sort((a, b) => b[1].length - a[1].length).map(([team, gs]) => ({ label: team, html: teamName(team), s: sumGames(gs) })),
      { firstLabel: 'Opponent' }), { iconName: 'swords' });
    log.setRows(gameLogRows(list).map(r => ({ ...r, ip: inningsValue(r.inningsPitched ?? 0), ra: Number(r.runsAllowed) || 0 })));
  };
  draw();
  host.querySelector('[data-pit-scope]').addEventListener('change', (e) => { scope = e.target.value; draw(); });
}
