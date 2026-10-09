// js/pages/player-awards.js
// player.html Awards tab: championships and runner-up finishes, season
// awards (awards collection, by player name) and all-time top 10 career
// ranks against every player in aggregatedPlayerStats.

import { seasonsObjectToArray } from '../data/player-stats.js';
import { battingAverage, onBasePct, QUALIFIERS } from '../domain/stats.js';
import { parseStatSeasonId } from '../domain/season-ids.js';
import { ordinal } from '../ui/format.js';
import { esc, icon, card, empty, fmtAvg, fmtRate, seasonLabel } from './player-shared.js';

// Award art in awards/ (category -> file). Anything else gets the sprite icon.
const AWARD_ART = {
  'Team MVP': 'team_mvp.png',
  'All Aces': 'all_aces.png',
  'Gold Glove': 'gold_glove.png',
  'Team of the Year': 'team_of_the_year.png',
  'Rookie of the Year': 'rookie_of_the_year.png',
  'Most Improved Ace': 'most_improved_ace.png',
  'Comeback Player of the Year': 'comeback_player.png',
  'Slugger of the Year': 'slugger_of_the_year.png',
  'Pitcher of the Year': 'pitcher_of_the_year.png',
  'Captain of the Year': 'captain_of_the_year.png',
  'Al Pineda Good Guy Award': 'al_pineda_good_guy_award.png',
  'Iron Man Award': 'iron_man_award.png',
  'Sub of the Year': 'sub_of_the_year.png',
  'Andrew Streaman Boner Award': 'andrew_streaman_boner_award.png',
  'Erik Lund Perservenance Award': 'erik_lund_perservenance_award.png',
  'Mr. Streaman Award for Excellence': 'mr_streaman_award_for_excellence.png'
};

const CATEGORIES = [
  { name: 'Career games', key: 'games', fmt: v => String(v) },
  { name: 'Career at-bats', key: 'atBats', fmt: v => String(v) },
  { name: 'Career hits', key: 'hits', fmt: v => String(v) },
  { name: 'Career runs', key: 'runs', fmt: v => String(v) },
  { name: 'Career walks', key: 'walks', fmt: v => String(v) },
  { name: 'Career batting average', key: 'avg', fmt: v => fmtAvg(v), min: QUALIFIERS.CAREER_MIN_PA, note: `${QUALIFIERS.CAREER_MIN_PA}+ PA` },
  { name: 'Career on-base percentage', key: 'obp', fmt: v => fmtAvg(v), min: QUALIFIERS.CAREER_MIN_PA, note: `${QUALIFIERS.CAREER_MIN_PA}+ PA` },
  { name: 'Career average AcesBPI', key: 'bpi', fmt: v => fmtRate(v), needs: 'bpi' }
];

/** Career lines for every player, all seasons (as the old Top 10 counted them). */
function careerLines(players) {
  return players.map(p => {
    const t = { id: p.id, games: 0, atBats: 0, hits: 0, runs: 0, walks: 0, bpis: [] };
    for (const s of seasonsObjectToArray(p)) {
      if (!parseStatSeasonId(s.seasonId).id) continue;
      t.games += Number(s.games) || 0;
      t.atBats += Number(s.atBats) || 0;
      t.hits += Number(s.hits) || 0;
      t.runs += Number(s.runs) || 0;
      t.walks += Number(s.walks) || 0;
      if (typeof s.acesBPI === 'number') t.bpis.push(s.acesBPI);
    }
    t.pa = t.atBats + t.walks;
    t.avg = battingAverage(t.hits, t.atBats);
    t.obp = onBasePct(t.hits, t.walks, t.atBats);
    t.bpi = t.bpis.length ? t.bpis.reduce((a, b) => a + b, 0) / t.bpis.length : null;
    return t;
  });
}

function rankings(players, id) {
  const lines = careerLines(players);
  const out = [];
  for (const c of CATEGORIES) {
    const pool = lines.filter(l => (c.min ? l.pa >= c.min : true) && (c.needs ? l[c.needs] !== null : l[c.key] > 0))
      .sort((a, b) => b[c.key] - a[c.key]);
    const i = pool.findIndex(l => l.id === id);
    if (i < 0) continue;
    // Ties share a rank: count the players strictly ahead.
    const rank = pool.filter(l => l[c.key] > pool[i][c.key]).length + 1;
    if (rank <= 10) out.push({ ...c, rank, value: pool[i][c.key], of: pool.length });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export async function render(el, ctx) {
  const titles = ctx.titles.slice().reverse();
  const awards = ctx.awards;

  el.innerHTML = `
    ${titles.length ? card('Championships', `<ul class="pl-titles">${titles.map(t => `<li class="pl-title ${t.type === 'champion' ? 'is-gold' : 'is-silver'}">
        ${icon(t.type === 'champion' ? 'trophy' : 'medal')}<div><strong>${t.type === 'champion' ? 'Champion' : 'Runner-up'}</strong>
        <span>${esc(seasonLabel(t.seasonId))} with ${esc(t.team)}</span></div></li>`).join('')}</ul>`, { iconName: 'trophy' }) : ''}
    ${card('Awards and honors', awards.length ? `<ul class="pl-awards">${awards.map(a => {
        const art = AWARD_ART[a.category];
        return `<li class="pl-award">
          <span class="pl-award-art">${art ? `<img src="awards/${esc(art)}" alt="" loading="lazy" data-award-img>` : icon('award')}</span>
          <div><strong>${esc(a.category || 'Award')}</strong><span>${esc(a.seasonId ? seasonLabel(a.seasonId) : `${a.year} ${a.season}`)}</span></div></li>`;
      }).join('')}</ul>` : empty('No awards yet', 'Season awards are voted on at the end of each season.', 'award'),
      { iconName: 'award', extra: '<a class="aces-section-link" href="awards.html">All awards</a>' })}
    <div id="plRanks">${card('All-time top 10', '<span class="aces-skeleton is-row"></span><span class="aces-skeleton is-row"></span>', { iconName: 'star' })}</div>`;

  el.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-award-img]')) e.target.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('award') }).firstElementChild);
  }, true);

  const host = el.querySelector('#plRanks');
  if (ctx.placeholder) { host.innerHTML = ''; return; }
  let ranks = [];
  try { ranks = rankings(await ctx.allPlayers(), ctx.player.id); } catch (err) {
    console.warn('[player] rankings unavailable', err);
    host.innerHTML = card('All-time top 10', empty('Ranks could not load', 'League stats are unavailable right now.', 'alert-circle'), { iconName: 'star' });
    return;
  }
  host.innerHTML = card('All-time top 10', ranks.length
    ? `<p class="pl-note">Career ranks among every Aces player, all seasons.</p>
      <ul class="pl-ranks">${ranks.map(r => `<li class="pl-rank${r.rank <= 3 ? ` is-top is-${r.rank}` : ''}">
        <span class="pl-rank-num">${esc(ordinal(r.rank))}</span>
        <span class="pl-rank-name">${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
        <span class="pl-rank-value">${esc(r.fmt(r.value))}</span></li>`).join('')}</ul>`
    : empty('Not in a top 10 yet', 'Career totals and averages are ranked against every Aces player.', 'star'),
    { iconName: 'star', extra: '<a class="aces-section-link" href="leaders.html">Leaders</a>' });
}
