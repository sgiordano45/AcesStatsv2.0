// functions/captain-digest.js
// Tuesday milestone email for captains and league staff.
//
// Each team's captains get their team: players within reach of a career
// milestone this week, active hit streaks of 10+ games, milestones reached in
// the last 7 days, the team's games this week, and a heads-up for any of the
// team's finished games whose stats aren't in yet (or are in but not yet
// aggregated), since those can change the numbers. League staff get every
// team in one email, plus every game missing stats.
//
//   Milestones   career hits and runs (the home page's steps, domain/summary.js)
//                and games played every 50. These are the stats with full
//                history back to 2019.
//   "Within reach" is adaptive: gap <= the player's per-game rate x the team's
//                games this week (this season's rate once they have 3 games,
//                else career). Games played: gap <= games this week.
//   Recipients   captains from the roster doc (captain: true) and users with
//                isCaptain + linkedTeam; league staff and admins. The email
//                comes from users/{authId} or users/{legacyId} (legacy
//                profiles carry an email too). Opt out:
//                users/{id}.emailPreferences.captainDigest === false.
//   Dedupe       emailLogs/captainDigest_{YYYY-MM-DD}: one email per address
//                per send day.
//
// Functions:
//   sendCaptainDigest      Tuesdays 8:52 AM ET
//   triggerCaptainDigest   callable, admin: { dryRun, force, team, testTo }
//                          dryRun returns every email without sending;
//                          testTo sends the chosen emails to one address only.
//
// Deploy: firebase deploy --only functions:sendCaptainDigest,functions:triggerCaptainDigest

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const path = require('path');
const { pathToFileURL } = require('url');

const db = () => admin.firestore();
const SITE = 'https://acessoftballreference.com';
const FROM = 'Mountainside Aces <noreply@acessoftballreference.com>';
const GAMES_STEP = 50;
const STREAK_MIN = 10;

let domainP = null;
const domain = () => (domainP ??= Promise.all([
  import(pathToFileURL(path.join(__dirname, 'domain', 'standings.js')).href),
  import(pathToFileURL(path.join(__dirname, 'domain', 'dates.js')).href),
  import(pathToFileURL(path.join(__dirname, 'domain', 'summary.js')).href),
  import(pathToFileURL(path.join(__dirname, 'domain', 'season-ids.js')).href)
]).then(([standings, dates, summary, seasonIds]) => ({ ...standings, ...dates, ...summary, ...seasonIds })));

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lower = (s) => String(s || '').trim().toLowerCase();
const norm = (s) => lower(s).replace(/[^a-z0-9]/g, '');
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : Date.parse(v || '') || 0);

async function currentSeasonId() {
  const cfg = await db().doc('siteConfig/current').get();
  const data = cfg.exists ? cfg.data() : null;
  if (data && data.currentSeasonId && data.phase !== 'offseason') return data.currentSeasonId;
  const active = await db().collection('seasons').where('isActive', '==', true).limit(1).get();
  return active.empty ? null : active.docs[0].id;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** Career and this-season lines from an aggregatedPlayerStats doc. */
function lines(p, seasonId, parseStatSeasonId) {
  const car = { h: 0, r: 0, g: 0 };
  const sea = { h: 0, r: 0, g: 0 };
  for (const [rawId, s] of Object.entries(p.seasons || {})) {
    car.h += num(s.hits); car.r += num(s.runs); car.g += num(s.games);
    if (parseStatSeasonId(rawId).id === seasonId) { sea.h += num(s.hits); sea.r += num(s.runs); sea.g += num(s.games); }
  }
  return {
    hits: num(p.career?.hits ?? car.h),
    runs: num(p.career?.runs ?? car.r),
    games: num(p.career?.games ?? car.g),
    season: sea
  };
}

/** Next milestone above `cur` from a list of steps (carried on past the end). */
function nextMark(cur, steps) {
  const list = [...steps];
  const inc = list.length > 1 ? list[list.length - 1] - list[list.length - 2] : list[0];
  while (list[list.length - 1] <= cur) list.push(list[list.length - 1] + inc);
  return list.find((m) => m > cur);
}

/** Active hit streak (games with a hit, most recent first). */
async function activeStreak(legacyId) {
  if (!legacyId) return 0;
  const ref = db().collection('playerStats').doc(legacyId).collection('games');
  let snap = await ref.orderBy('gameDate', 'desc').limit(30).get().catch(() => null);
  if (!snap) return 0;
  let docs = snap.docs;
  if (docs.length === 30 && docs.every((d) => num(d.data().hits) >= 1)) {
    snap = await ref.orderBy('gameDate', 'desc').get();
    docs = snap.docs;
  }
  let n = 0;
  for (const d of docs) { if (num(d.data().hits) >= 1) n += 1; else break; }
  return n;
}

// ---------------------------------------------------------------------------
// Build the digest
// ---------------------------------------------------------------------------

async function buildDigest({ onlyTeam = '' } = {}) {
  const D = await domain();
  const seasonId = await currentSeasonId();
  if (!seasonId) return { seasonId: null, teams: [] };
  const today = D.todayKey();
  const weekEnd = D.addDays(today, 6);
  const lastWeek = D.addDays(today, -7);

  const [gamesSnap, rostersSnap, playersSnap, actSnap] = await Promise.all([
    db().collection('seasons').doc(seasonId).collection('games').get(),
    db().collection('rosters').where('seasonId', '==', seasonId).get(),
    db().collection('aggregatedPlayerStats').get(),
    db().collection('activity').where('type', '==', 'milestone')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 86400000))
      .orderBy('timestamp', 'desc').get().catch(() => ({ docs: [] }))
  ]);

  const rawGames = gamesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const games = rawGames.map((g) => ({ raw: g, n: D.normalizeGame(g) }));

  // Player docs by every ID they go by; migrated docs point elsewhere.
  const byId = new Map();
  const byName = new Map();
  let lastAgg = 0;
  for (const d of playersSnap.docs) {
    const p = { id: d.id, ...d.data() };
    lastAgg = Math.max(lastAgg, toMillis(p.lastUpdated));
    if (p.migrated) continue;
    [d.id, p.playerId, p.legacyId, p.userId].filter(Boolean).forEach((k) => byId.set(k, p));
    if (p.name) byName.set(norm(p.name), p);
  }

  const teams = [];
  for (const r of rostersSnap.docs) {
    const roster = r.data();
    const team = roster.teamName || r.id.split('-').slice(2).join('-');
    if (onlyTeam && lower(team) !== lower(onlyTeam)) continue;
    const key = lower(team);
    const mine = games.filter(({ n }) => lower(n.home) === key || lower(n.away) === key);
    const label = mine.find(({ n }) => lower(n.home) === key)?.n.home || mine.find(({ n }) => lower(n.away) === key)?.n.away || team;

    const thisWeek = mine.filter(({ n }) => n.dateKey && n.dateKey >= today && n.dateKey <= weekEnd && !n.winner)
      .sort((a, b) => (a.n.dateKey < b.n.dateKey ? -1 : a.n.dateKey > b.n.dateKey ? 1 : D.timeSortValue(a.n.time) - D.timeSortValue(b.n.time)));
    const G = Math.max(1, thisWeek.length);

    // Finished games of this team missing this team's stats, or entered since the last aggregation.
    const missing = [];
    const pending = [];
    for (const { raw, n } of mine) {
      if (!n.dateKey || n.dateKey >= today) continue;
      if (raw.status === 'cancelled' || raw.status === 'postponed') continue;
      const home = lower(n.home) === key;
      const opp = home ? n.away : n.home;
      const side = home ? 'home' : 'away';
      const done = home ? raw.statsSubmittedHome === true : raw.statsSubmittedAway === true;
      const line = { id: raw.id, dateKey: n.dateKey, opp, home, side };
      if (!done) missing.push(line);
      else if (toMillis(raw.statsSubmittedAt) > lastAgg) pending.push(line);
    }

    const close = [];
    const streaks = [];
    const ids = new Set();
    for (const pl of roster.players || []) {
      const p = byId.get(pl.authId) || byId.get(pl.id) || byName.get(norm(pl.name));
      if (!p) continue;
      ids.add(p.id); if (pl.id) ids.add(pl.id); if (pl.authId) ids.add(pl.authId);
      const L = lines(p, seasonId, D.parseStatSeasonId);
      const rateBase = L.season.g >= 3 ? L.season : { h: L.hits, r: L.runs, g: L.games };
      const rate = (k) => (rateBase.g ? rateBase[k] / rateBase.g : 0);
      const checks = [
        ['hits', L.hits, D.MILESTONES.hits, Math.max(1, Math.ceil(rate('h') * G))],
        ['runs', L.runs, D.MILESTONES.runs, Math.max(1, Math.ceil(rate('r') * G))],
        ['games', L.games, [GAMES_STEP, GAMES_STEP * 2], G]
      ];
      for (const [stat, cur, steps, reach] of checks) {
        if (!cur) continue;
        const mark = nextMark(cur, steps);
        const gap = mark - cur;
        if (gap <= reach) close.push({ name: pl.name || p.name, stat, cur, mark, gap });
      }
      const s = await activeStreak(pl.id || p.legacyId);
      if (s >= STREAK_MIN) streaks.push({ name: pl.name || p.name, games: s });
    }
    close.sort((a, b) => a.gap - b.gap || a.name.localeCompare(b.name));
    streaks.sort((a, b) => b.games - a.games);

    const reached = actSnap.docs.map((d) => d.data())
      .filter((a) => ids.has(a.playerId) || lower(a.teamName) === key || lower(a.teamId) === key)
      .map((a) => ({ name: a.playerName || '', title: a.title || '' }));

    const captains = (roster.players || []).filter((p) => p.captain).map((p) => ({ name: p.name, ids: [p.authId, p.id].filter(Boolean) }));
    teams.push({ team: label, key, close, streaks, reached, thisWeek: thisWeek.map(({ n }) => ({ dateKey: n.dateKey, time: n.time, opp: lower(n.home) === key ? n.away : n.home, home: lower(n.home) === key })), missing, pending, captains, G });
  }
  teams.sort((a, b) => a.team.localeCompare(b.team));
  return { seasonId, lastAgg, teams, D, today, lastWeek };
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

const NOUN = { hits: ['hit', 'hits'], runs: ['run', 'runs'], games: ['game', 'games'] };
/** '5 hits from 100', '1 run from 50', '2 games from 100 games played'. */
const gapText = (c) => `${c.gap} ${NOUN[c.stat][c.gap === 1 ? 0 : 1]} from ${c.mark}${c.stat === 'games' ? ' games played' : ''}`;
const streakText = (s) => `${s.games === 8 || s.games === 11 || s.games === 18 || String(s.games).startsWith('8') ? 'an' : 'a'} ${s.games}-game hit streak going`;

function enterLink(m, seasonId, staff) {
  return staff
    ? `${SITE}/admin/submit-stats.html?season=${encodeURIComponent(seasonId)}&game=${encodeURIComponent(m.id)}&side=${m.side}`
    : `${SITE}/submit-stats.html`;
}

function teamText(t, D, lastAgg, seasonId, staff = false) {
  const out = [t.team];
  if (t.close.length) t.close.forEach((c) => out.push(`- ${c.name} is ${gapText(c)} (${c.cur} now)`));
  else out.push('- No one is within reach of a milestone this week.');
  t.streaks.forEach((s) => out.push(`- ${s.name} has ${streakText(s)}`));
  if (t.reached.length) out.push('Reached last week:', ...t.reached.map((r) => `- ${r.name}: ${r.title}`));
  if (t.thisWeek.length) out.push(`This week: ${t.thisWeek.map((g) => `${D.formatGameDate(g.dateKey)} ${g.home ? 'vs' : 'at'} ${g.opp}${g.time ? ` ${D.formatTime(g.time)}` : ''}`).join(', ')}`);
  t.missing.forEach((m) => out.push(`Note: ${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp} is missing ${t.team}'s stats, which may affect these milestone alerts. Enter them: ${enterLink(m, seasonId, staff)}`));
  if (t.pending.length) out.push(`Note: stats for ${t.pending.map((m) => `${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp}`).join(', ')} are in but not counted in the career totals yet.`);
  return out.join('\n');
}

function teamHtml(t, D, seasonId, staff = false) {
  const li = (s) => `<li style="margin:2px 0;">${s}</li>`;
  const close = t.close.length
    ? t.close.map((c) => li(`<strong>${escHtml(c.name)}</strong> is ${escHtml(gapText(c))} <span style="color:#718096;">(${c.cur} now)</span>`)).join('')
    : li('<span style="color:#718096;">No one is within reach of a milestone this week.</span>');
  const streaks = t.streaks.map((s) => li(`<strong>${escHtml(s.name)}</strong> has ${escHtml(streakText(s))}`)).join('');
  const reached = t.reached.length ? `<p style="margin:12px 0 4px;font-weight:700;">Reached last week</p><ul style="margin:0;padding-left:18px;">${t.reached.map((r) => li(`${escHtml(r.name)}: ${escHtml(r.title)}`)).join('')}</ul>` : '';
  const week = t.thisWeek.length ? `<p style="margin:12px 0 0;color:#4a5568;"><strong>This week:</strong> ${t.thisWeek.map((g) => escHtml(`${D.formatGameDate(g.dateKey)} ${g.home ? 'vs' : 'at'} ${g.opp}${g.time ? ` ${D.formatTime(g.time)}` : ''}`)).join(' &middot; ')}</p>` : '';
  const notes = [
    ...t.missing.map((m) => `<p style="margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#fff8e1;color:#5d4500;"><strong>Heads up:</strong> ${escHtml(`${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp}`)} is missing ${escHtml(t.team)}'s stats, which may affect these milestone alerts. <a href="${escHtml(enterLink(m, seasonId, staff))}" style="color:#2d5016;font-weight:700;">Enter stats</a></p>`),
    t.pending.length ? `<p style="margin:12px 0 0;color:#718096;font-size:13px;">Stats for ${escHtml(t.pending.map((m) => `${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp}`).join(', '))} are in but not counted in the career totals yet.</p>` : ''
  ].join('');
  return `<div style="margin:0 0 20px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
    <h2 style="margin:0 0 8px;font-size:18px;color:#2d5016;">${escHtml(t.team)}</h2>
    <ul style="margin:0;padding-left:18px;">${close}${streaks}</ul>${reached}${week}${notes}</div>`;
}

function wrapHtml(title, inner, footer) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;color:#1a202c;">
    <div style="padding:18px 20px;border-radius:10px 10px 0 0;background:#2d5016;color:#fff;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#ffd700;font-weight:700;">Mountainside Aces</div>
      <div style="font-size:20px;font-weight:700;">${escHtml(title)}</div>
    </div>
    <div style="padding:18px 4px 0;">${inner}</div>
    <p style="color:#a0aec0;font-size:12px;margin:8px 4px 0;">${footer}</p>
  </div>`;
}

function footerFor(lastAgg) {
  const when = lastAgg ? new Date(lastAgg).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown';
  return `Career totals are as of the last stats update (${escHtml(when)} ET). Hits, runs and games played go back to 2019. "Within reach" means the player could get there in this week's games at their usual pace. You get this as a captain or league staff; turn it off on Me &gt; Notifications (${SITE}/me.html#notifications).`;
}

/** One email per team for captains, one combined email for league staff. */
function composeEmails(digest) {
  const { teams, D, lastAgg, seasonId } = digest;
  const footer = footerFor(lastAgg);
  const perTeam = teams.map((t) => {
    const n = t.close.length + t.streaks.length;
    const subject = `${t.team} milestone watch: ${n ? `${n} to watch` : 'this week'}${t.missing.length ? ' (stats missing)' : ''}`;
    return {
      team: t.team, key: t.key, captains: t.captains, subject,
      quiet: !n && !t.missing.length && !t.reached.length,
      html: wrapHtml(`${t.team} milestone watch`, teamHtml(t, D, seasonId), footer),
      text: `${teamText(t, D, lastAgg, seasonId)}\n\n${footer.replace(/&gt;/g, '>')}`
    };
  });
  const allMissing = teams.flatMap((t) => t.missing.map((m) => ({ ...m, team: t.team })));
  const staffIntro = allMissing.length
    ? `<div style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:#fff8e1;color:#5d4500;"><strong>${allMissing.length} game side${allMissing.length === 1 ? '' : 's'} missing stats:</strong><ul style="margin:6px 0 0;padding-left:18px;">${allMissing.map((m) => `<li>${escHtml(`${m.team}: ${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp}`)}</li>`).join('')}</ul></div>`
    : '';
  const staff = {
    subject: `League milestone watch${allMissing.length ? ` (${allMissing.length} missing stats)` : ''}`,
    html: wrapHtml('League milestone watch', staffIntro + teams.map((t) => teamHtml(t, D, seasonId, true)).join(''), footer),
    text: `${allMissing.length ? `Missing stats: ${allMissing.map((m) => `${m.team} ${D.formatGameDate(m.dateKey)} ${m.home ? 'vs' : 'at'} ${m.opp}`).join('; ')}\n\n` : ''}${teams.map((t) => teamText(t, D, lastAgg, seasonId, true)).join('\n\n')}\n\n${footer.replace(/&gt;/g, '>')}`
  };
  return { perTeam, staff };
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

async function userDocs(ids) {
  const refs = [...new Set(ids.filter(Boolean))].map((id) => db().collection('users').doc(id));
  if (!refs.length) return [];
  const snaps = await db().getAll(...refs);
  return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
}

const optedOut = (u) => u?.emailPreferences?.captainDigest === false;
const validEmail = (e) => typeof e === 'string' && /.+@.+\..+/.test(e);

async function recipients(perTeam) {
  const toTeam = new Map();   // email -> Set(team keys)
  const add = (u, key) => {
    if (!u || optedOut(u) || !validEmail(u.email)) return;
    const e = u.email.trim().toLowerCase();
    if (!toTeam.has(e)) toTeam.set(e, { name: u.displayName || u.linkedPlayer || u.name || '', teams: new Set() });
    toTeam.get(e).teams.add(key);
  };
  const capSnap = await db().collection('users').where('isCaptain', '==', true).get().catch(() => ({ docs: [] }));
  const flagged = capSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  for (const t of perTeam) {
    const fromRoster = await userDocs(t.captains.flatMap((c) => c.ids));
    fromRoster.forEach((u) => add(u, t.key));
    flagged.filter((u) => lower(u.linkedTeam) === t.key).forEach((u) => add(u, t.key));
  }

  const staff = new Map();
  const staffQueries = [
    db().collection('users').where('userRole', 'in', ['league-staff', 'admin']).get(),
    db().collection('users').where('isAdmin', '==', true).get(),
    db().collection('users').where('userType', '==', 'league-staff').get()
  ];
  for (const snap of await Promise.all(staffQueries.map((q) => q.catch(() => ({ docs: [] }))))) {
    snap.docs.forEach((d) => {
      const u = d.data();
      if (optedOut(u) || !validEmail(u.email)) return;
      staff.set(u.email.trim().toLowerCase(), u.displayName || u.linkedPlayer || '');
    });
  }
  // League staff who also captain get the combined email only.
  for (const e of staff.keys()) toTeam.delete(e);
  return { captains: toTeam, staff };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function sendBatch(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function runCaptainDigest({ dryRun = false, force = false, team = '', testTo = '' } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !dryRun) return { success: false, message: 'RESEND_API_KEY not set' };

  const digest = await buildDigest({ onlyTeam: team });
  if (!digest.seasonId) return { success: true, message: 'No season in progress', sent: 0 };
  const { perTeam, staff } = composeEmails(digest);
  const { captains, staff: staffTo } = await recipients(perTeam);

  // Messages: each captain gets each of their teams that has something to say.
  const messages = [];
  for (const [email, info] of captains) {
    for (const key of info.teams) {
      const m = perTeam.find((x) => x.key === key);
      if (m && !m.quiet) messages.push({ to: email, kind: 'captain', team: m.team, subject: m.subject, html: m.html, text: m.text });
    }
  }
  if (!team) for (const email of staffTo.keys()) messages.push({ to: email, kind: 'staff', team: 'All', subject: staff.subject, html: staff.html, text: staff.text });
  else if (testTo) {
    const m = perTeam[0];
    if (m) messages.push({ to: testTo, kind: 'captain', team: m.team, subject: m.subject, html: m.html, text: m.text });
  }

  if (dryRun) {
    return {
      success: true, dryRun: true, seasonId: digest.seasonId,
      recipients: messages.map((m) => ({ to: m.to, kind: m.kind, team: m.team, subject: m.subject })),
      teams: perTeam.map((m) => ({ team: m.team, subject: m.subject, quiet: m.quiet, html: m.html, text: m.text })),
      staff: { subject: staff.subject, html: staff.html, text: staff.text }
    };
  }

  // Test send: only to the one address given.
  let toSend = messages;
  if (testTo) {
    const seen = new Set();
    toSend = messages.filter((m) => (team ? m.team.toLowerCase() === team.toLowerCase() : m.kind === 'staff'))
      .filter((m) => { const k = m.kind + m.team; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((m) => ({ ...m, to: testTo, subject: `[Test] ${m.subject}` }));
    if (!toSend.length && !team) toSend = [{ to: testTo, kind: 'staff', team: 'All', subject: `[Test] ${staff.subject}`, html: staff.html, text: staff.text }];
  }

  const day = digest.today;
  const logRef = db().collection('emailLogs').doc(`captainDigest_${day}`);
  const already = new Set(testTo || force ? [] : ((await logRef.get()).data()?.sent || []));
  toSend = toSend.filter((m) => !already.has(`${m.to}|${m.team}`));

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < toSend.length; i += 50) {
    if (i) await new Promise((r) => setTimeout(r, 1000));
    const chunk = toSend.slice(i, i + 50);
    try {
      await sendBatch(apiKey, chunk.map((m) => ({ from: FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text })));
      sent += chunk.length;
      if (!testTo) {
        await logRef.set({
          sent: admin.firestore.FieldValue.arrayUnion(...chunk.map((m) => `${m.to}|${m.team}`)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      failed += chunk.length;
      console.error('[captainDigest] batch failed', err.message);
    }
  }
  console.log(`[captainDigest] ${digest.seasonId}: sent ${sent}, failed ${failed}${testTo ? ` (test to ${testTo})` : ''}`);
  return { success: failed === 0, sent, failed };
}

exports.sendCaptainDigest = functions
  .runWith({ secrets: ['RESEND_API_KEY'], timeoutSeconds: 300, memory: '512MB' })
  .pubsub
  .schedule('52 8 * * 2')
  .timeZone('America/New_York')
  .onRun(async () => {
    await runCaptainDigest();
    return null;
  });

// Admin only. data: { dryRun?: bool, force?: bool, team?: 'Teal', testTo?: email }
exports.triggerCaptainDigest = functions
  .runWith({ secrets: ['RESEND_API_KEY'], timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const u = (await db().collection('users').doc(context.auth.uid).get()).data();
    if (!(u?.role === 'admin' || u?.isAdmin === true || u?.userRole === 'admin')) {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const testTo = data?.testTo === true ? (u?.email || '') : (typeof data?.testTo === 'string' ? data.testTo : '');
    return runCaptainDigest({
      dryRun: data?.dryRun === true,
      force: data?.force === true,
      team: typeof data?.team === 'string' ? data.team : '',
      testTo
    });
  });
