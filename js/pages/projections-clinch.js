// js/pages/projections-clinch.js
// The Clinching tab of projections.html (it replaced playoff-clinching.html):
// what's settled and what each team needs, worked out from records alone (no
// simulation).
//
//   renderClinching(el, { standings, left, playoffTeams, seasonId });
//
// standings  computeStandings rows (with remainingCount, h2h, runsAgainst)
// left       the regular-season games still to play (normalized)
//
// For each team, from final win % if it won or lost every game left:
//   Possible seeds  best = 1 + teams sure to finish ahead (their worst beats
//                   its best); worst = 1 + teams that could finish ahead
//                   (their best reaches its worst). A tie counts as "could
//                   finish ahead": tiebreakers can't be settled in advance.
//   Clinched        best == worst.
//   Wins to clinch  the fewest more wins (losing the rest) that put the team
//                   ahead of everyone who could pass it, whatever else happens.
//   Wins for a shot the fewest more wins that still leave it a way in.
// The bounds treat every other team's games as independent, so "possible"
// can be a little generous late in the season; clinches are always safe.
//
// Byes: a bracket of P teams fills up to the next power of two, so the top
// (2^k - P) seeds skip round 1 (11 teams: 5 byes), as on playoffs.html.

import { escapeHtml as esc, ordinal } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { TEAM_COLORS } from '../ui/stat-columns.js';
import { formatGameDate } from '../domain/dates.js';
import { compareHeadToHead } from '../domain/standings.js';

const EPS = 1e-9;
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const dot = (team) => { const k = String(team || '').toLowerCase(); return `<span class="aces-team-dot"${TEAM_COLORS.has(k) ? ` data-team-color="${esc(k)}"` : ''}></span>`; };
const rec = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

export const byesFor = (teams) => (teams > 1 ? 2 ** Math.ceil(Math.log2(teams)) - teams : 0);

function model(rows, left) {
  const total = (r) => r.wins + r.losses + r.ties + r.remainingCount;
  const pctWith = (r, k) => (total(r) ? (r.wins + k + r.ties * 0.5) / total(r) : 0);
  const games = (a, b) => left.some((g) => (g.home === a.team && g.away === b.team) || (g.home === b.team && g.away === a.team));
  // a is sure to finish ahead of b when a's worst beats b's best, or they can
  // only tie and head-to-head is already settled with no games left between them.
  const sureAhead = (a, b, aWins = 0, bWins = b.remainingCount) => {
    const d = pctWith(a, aWins) - pctWith(b, bWins);
    if (d > EPS) return true;
    if (Math.abs(d) <= EPS && !games(a, b)) return compareHeadToHead(a, b) < 0;
    return false;
  };
  const couldBeAhead = (a, b, aWins = a.remainingCount, bWins = 0) => !sureAhead(b, a, bWins, aWins);
  return { pctWith, sureAhead, couldBeAhead };
}

function analyse(rows, left, playoffTeams) {
  const m = model(rows, left);
  const n = rows.length;
  const byes = byesFor(Math.min(playoffTeams, n));
  return rows.map((t, i) => {
    const others = rows.filter((o) => o !== t);
    const best = 1 + others.filter((o) => m.sureAhead(o, t)).length;
    const worst = 1 + others.filter((o) => m.couldBeAhead(o, t)).length;
    const R = t.remainingCount;
    // Fewest more wins (losing the rest) that keep all but `spots - 1` teams behind for sure.
    const winsToClinch = (spots) => {
      for (let k = 0; k <= R; k++) {
        const ahead = others.filter((o) => m.couldBeAhead(o, t, o.remainingCount, k)).length;
        if (ahead <= spots - 1) return k;
      }
      return null;
    };
    // Fewest more wins that still leave a way into the top `spots`.
    const winsForShot = (spots) => {
      for (let k = 0; k <= R; k++) {
        const ahead = others.filter((o) => m.sureAhead(o, t, 0, k)).length;
        if (ahead <= spots - 1) return k;
      }
      return null;
    };
    return {
      t, seed: i + 1, R, best, worst,
      clinched: best === worst,
      top: { clinch: winsToClinch(1), shot: winsForShot(1) },
      bye: byes ? { clinch: winsToClinch(byes), shot: winsForShot(byes) } : null,
      berth: playoffTeams < n ? { clinch: winsToClinch(playoffTeams), shot: winsForShot(playoffTeams) } : null
    };
  });
}

function needText(a, byes, playoffTeams) {
  const t = a.t;
  const lines = [];
  const w = (k) => `${k} more win${k === 1 ? '' : 's'}`;
  if (a.berth) {
    if (a.berth.clinch === 0) lines.push('Clinched a playoff spot.');
    else if (a.berth.shot === null) lines.push('Eliminated from the playoffs.');
    else if (a.berth.clinch !== null) lines.push(`Clinches a playoff spot with ${w(a.berth.clinch)}.`);
    else lines.push(`Needs help to clinch a playoff spot (top ${playoffTeams}).`);
  }
  if (a.clinched) return [...lines, `Locked into the ${ordinal(a.best)} seed.`];
  if (a.top.clinch === 0) lines.push('Clinched the 1 seed.');
  else if (a.top.clinch !== null && a.best === 1) lines.push(`Clinches the 1 seed with ${w(a.top.clinch)}.`);
  if (a.bye) {
    if (a.bye.clinch === 0) { if (a.top.clinch !== 0) lines.push('Clinched a bye.'); }
    else if (a.bye.shot === null) lines.push('Out of the bye race.');
    else if (a.bye.clinch !== null) lines.push(`Clinches a bye with ${w(a.bye.clinch)}.`);
    else if (a.bye.shot > 0) lines.push(`Needs at least ${a.bye.shot} of ${a.R} wins to stay alive for a bye.`);
    else lines.push('Can reach a bye, but needs help to clinch one.');
  }
  if (!lines.length) lines.push(a.R ? `${a.R} game${a.R === 1 ? '' : 's'} left; seed still open.` : 'Done; waiting on other results.');
  return lines;
}

function statusBadge(a, byes) {
  if (a.clinched) return `<span class="aces-badge is-win">${icon('lock')}Clinched ${ordinal(a.best)}</span>`;
  if (a.berth && a.berth.shot === null) return '<span class="aces-badge is-loss">Eliminated</span>';
  if (!byes) return '<span class="aces-badge is-outline">Open</span>';
  if (a.bye.clinch === 0) return `<span class="aces-badge is-win">${icon('shield-check')}Bye clinched</span>`;
  if (a.bye.shot === null) return '<span class="aces-badge is-outline">Round 1</span>';
  return '<span class="aces-badge is-alert">In the bye race</span>';
}

function matchupsHtml(rows, left, byes) {
  const seedOf = new Map(rows.map((r, i) => [r.team, i + 1]));
  const tag = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (hi <= 2) return ['crown', 'Battle for the 1 seed'];
    if (byes && lo <= byes && hi > byes && hi - byes <= 2 && byes - lo <= 2) return ['swords', 'Bye line'];
    if (hi - lo === 1) return ['arrow-left-right', 'Neighbors in the standings'];
    return ['activity', 'Seeding swing'];
  };
  const list = left.map((g) => ({ g, a: seedOf.get(g.home), b: seedOf.get(g.away) }))
    .filter((x) => x.a && x.b && Math.abs(x.a - x.b) <= 3)
    .sort((x, y) => (x.g.dateKey || '9').localeCompare(y.g.dateKey || '9') || Math.min(x.a, x.b) - Math.min(y.a, y.b))
    .slice(0, 12);
  if (!list.length) return '<p class="aces-empty">No games left between teams close in the standings.</p>';
  return `<ul class="pc-games">${list.map(({ g, a, b }) => {
    const [ic, label] = tag(a, b);
    return `<li>
      <span class="pc-date">${g.dateKey ? esc(formatGameDate(g.dateKey, 'short')) : 'TBD'}</span>
      <span class="pc-match">${dot(g.away)}<b>${b}</b> ${esc(cap(g.away))} <span class="pc-at">at</span> ${dot(g.home)}<b>${a}</b> ${esc(cap(g.home))}</span>
      <span class="pc-tag">${icon(ic)}${esc(label)}</span>
    </li>`;
  }).join('')}</ul>`;
}

export function renderClinching(el, { standings, left, playoffTeams }) {
  const rows = standings;
  const n = rows.length;
  const P = Math.min(playoffTeams || n, n);
  const byes = byesFor(P);
  const all = analyse(rows, left, P);
  const locked = all.filter((a) => a.clinched).length;
  const byeClinched = byes ? all.filter((a) => a.bye && a.bye.clinch === 0).length : 0;
  const alive1 = all.filter((a) => a.best === 1).length;
  const tile = (v, label, meta = '') => `<div class="aces-stat"><span class="aces-stat-value">${esc(v)}</span><span class="aces-stat-label">${esc(label)}</span>${meta ? `<span class="aces-stat-meta">${esc(meta)}</span>` : ''}</div>`;

  el.innerHTML = `
    <div class="aces-stats pj-summary">
      ${tile(String(left.length), 'Games left')}
      ${tile(`${locked} of ${n}`, 'Seeds locked')}
      ${byes ? tile(`${byeClinched} of ${byes}`, 'Byes clinched', `top ${byes} skip round 1`) : tile(P < n ? `Top ${P}` : 'Everyone', 'Make the playoffs')}
      ${tile(String(alive1), 'Alive for the 1 seed')}
    </div>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('lock')}Where every team stands</h2></div>
      <div class="aces-table-wrap"><table class="aces-table is-compact pc-table">
        <thead><tr><th scope="col" class="is-num">Seed</th><th scope="col">Team</th><th scope="col" class="is-num">Record</th><th scope="col" class="is-num">Left</th><th scope="col">Possible seeds</th><th scope="col">Status</th><th scope="col">What it takes</th></tr></thead>
        <tbody>${all.map((a) => {
          const range = a.clinched ? `<b>${a.best}</b>` : `${a.best}&ndash;${a.worst}`;
          const bar = Array.from({ length: n }, (_, k) => `<i class="${k + 1 >= a.best && k + 1 <= a.worst ? 'is-on' : ''}${byes && k + 1 === byes ? ' is-edge' : ''}${k + 1 === a.seed ? ' is-now' : ''}"></i>`).join('');
          return `<tr${byes && a.seed === byes ? ' class="is-bye-edge"' : ''}>
            <td class="is-num pc-seed">${a.seed}</td>
            <th scope="row"><a class="pj-team" href="current-season-team.html?team=${esc(encodeURIComponent(cap(a.t.team)))}">${dot(a.t.team)}${esc(cap(a.t.team))}</a></th>
            <td class="is-num">${esc(rec(a.t))}</td>
            <td class="is-num">${a.R}</td>
            <td><span class="pc-range" title="Possible seeds ${a.best} to ${a.worst}"><span class="pc-bar">${bar}</span>${range}</span></td>
            <td>${statusBadge(a, byes)}</td>
            <td class="pc-need">${needText(a, byes, P).map((l) => esc(l)).join('<br>')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="pj-note">Worked out from records only: each bar shows the seeds a team can still finish in (dark) and where it is now (outlined)${byes ? `; the line marks the last bye, seed ${byes}` : ''}. A tie at the end counts against a team here, since tiebreakers (head-to-head for two teams, then runs allowed, then run differential) can't be settled until the games are played. For likelihoods, see Seed odds.</p>
    </section>
    <section class="aces-card">
      <div class="aces-card-head"><h2 class="aces-card-title">${icon('swords')}Games that move the seeds</h2></div>
      ${matchupsHtml(rows, left, byes)}
    </section>`;
}
