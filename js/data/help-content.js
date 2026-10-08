// js/data/help-content.js
// Everything on help.html: sections of short how-to topics, condensed from the
// eleven old guide pages (captain, game tracker, scoring, calendar, features,
// signup, profile setup, contributor, league staff, offseason, help hub) and
// updated for v2.0 (Me page, new header, search). Edit the text here.
//
// Section: { id, title, icon, audience, intro, topics: [{ id, title, keywords, body }] }
//   audience: null (everyone) or a role / list of roles for hasRole(); admins see all.
//   body: HTML (p, ul, ol, li, strong, a). No emoji: they break in this codebase.

export const HELP_SECTIONS = [
 {
  "id": "getting-started",
  "title": "Getting started",
  "icon": "star",
  "audience": null,
  "intro": "Create your account, link it to your player record, and set up your profile and notifications.",
  "topics": [
   {
    "id": "create-account",
    "title": "Create your account",
    "keywords": "sign up register google email password new account",
    "body": "<p>Go to <a href=\"signup.html\">Sign up</a> and pick one of two options.</p><ul><li><strong>Sign up with Google:</strong> choose your Google account. This is the fastest option and your email is verified automatically.</li><li><strong>Sign up with email:</strong> enter your full name, a valid email address and a password of at least 6 characters.</li></ul><p>Use your real first and last name. The site uses it to match you to your existing player record, so a nickname or partial name makes linking harder.</p><p>After you sign in you land on <a href=\"me.html\">Me</a>, where the Dashboard to-do list walks you through the remaining setup steps.</p>"
   },
   {
    "id": "verify-email",
    "title": "Verify your email",
    "keywords": "verification link spam junk noreply confirm email",
    "body": "<p>If you signed up with email and password, you must verify your address. Google sign-ups skip this step.</p><ol><li>Look for an email from noreply@acessoftballreference-84791.firebaseapp.com.</li><li>If it is not in your inbox, check your spam or junk folder. Spam filters often catch it.</li><li>Click the link in the email, then return to the site and click <strong>I've Verified My Email</strong>.</li></ol><p>Until you verify, the Dashboard to-do list on <a href=\"me.html\">Me</a> will keep showing this step.</p>"
   },
   {
    "id": "link-player-record",
    "title": "Link your player record",
    "keywords": "link player claim profile match approval captain staff fan skip",
    "body": "<p>Linking connects your login to your player record in the league database. This is important: your stats, RSVPs and player details depend on it.</p><ol><li>Open <a href=\"link-player.html\">Link your player</a> (also listed in the Dashboard to-do list on <a href=\"me.html\">Me</a>).</li><li>Browse by team or search for your name. A strong match based on your name shows a <strong>Suggested</strong> badge.</li><li>Select your record and click <strong>Submit Link Request</strong>.</li></ol><p>Approval depends on how closely your account name matches the player name:</p><ul><li>90% or higher: approved immediately.</li><li>60 to 89%: your team captain approves it.</li><li>Below 60%: league staff approve it.</li></ul><p>Not a player? Fans and family can click <strong>Skip - I'm Not a Player</strong> and use the site as a fan.</p>"
   },
   {
    "id": "profile-details",
    "title": "Set up your photo and player details",
    "keywords": "profile photo display name nickname jersey number bats throws position secondary",
    "body": "<p>Open <a href=\"me.html#profile\">Me, Profile tab</a> to set your profile photo and display name, and fill in your player details:</p><ul><li><strong>Nickname:</strong> what you like to be called on the field.</li><li><strong>Jersey number(s):</strong> used on the roster and stats display. You can list numbers for different teams or seasons.</li><li><strong>Bats and throws:</strong> right, left or switch hitter, and throwing arm.</li><li><strong>Primary and secondary positions:</strong> where you play most often (P, C, IF, OF, etc.) and where you can fill in.</li></ul><p>These details show on your player page. Captains also use your positions when building defensive rotations in Roster Management, so filling them in helps them plan balanced lineups.</p>"
   },
   {
    "id": "install-app",
    "title": "Install the app on your phone",
    "keywords": "install app home screen pwa iphone android desktop offline add to dock",
    "body": "<p>The site can be installed as an app. There is no app store; it is a home-screen shortcut that loads faster, works offline at the field, and is <strong>required for push notifications on iPhone</strong>.</p><ul><li><strong>iPhone/iPad:</strong> open the home page in Safari, tap Share (square with arrow), scroll to <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li><li><strong>Android:</strong> in Chrome tap the menu (three dots), tap <strong>Add to Home Screen</strong> or <strong>Install App</strong>, then <strong>Install</strong>.</li><li><strong>Desktop Chrome/Edge:</strong> click the install icon in the address bar, then <strong>Install</strong>.</li><li><strong>Desktop Safari:</strong> open the home page, choose File, then <strong>Add to Dock</strong>. Safari's support is limited; Chrome works better.</li></ul>"
   },
   {
    "id": "turn-on-notifications",
    "title": "Turn on push notifications",
    "keywords": "push notifications alerts device phone quiet hours reminders rsvp schedule lineup scores announcements email",
    "body": "<p>Go to <a href=\"me.html#notifications\">Me, Notifications tab</a>.</p><p>Push must be turned on <strong>separately on each device</strong>. Do it on your phone first, since that is where game-day alerts matter. On iPhone, install the app before enabling push.</p><p>You can choose which pushes you get:</p><ul><li>Game reminders before your games start</li><li>RSVP reminders if you have not responded to an upcoming game</li><li>Schedule changes (time, date, field or opponent)</li><li>Lineup changes when your captain posts or updates the batting order</li><li>League announcements</li><li>Final scores</li></ul><p>Set <strong>quiet hours</strong> to pause pushes overnight (default 10pm to 8am). Email preferences are on the same tab.</p>"
   },
   {
    "id": "join-directory",
    "title": "Join the Aces Directory",
    "keywords": "directory contact phone occupation skills members opt in opt out privacy",
    "body": "<p>The Aces Directory lets members find each other for carpools, subs, or skills and services (a plumber, a photographer, and so on). It is opt-in and visible only to signed-in members.</p><p>Go to <a href=\"me.html#directory\">Me, Directory tab</a> and turn on <strong>Include me in the Aces Directory</strong>. Then add:</p><ul><li><strong>Phone number:</strong> visible to signed-in members.</li><li><strong>Occupation/job title:</strong> optional.</li><li><strong>Skills/interests:</strong> optional, up to 200 characters.</li></ul><p>You can opt out at any time by turning the setting off.</p>"
   },
   {
    "id": "account-help",
    "title": "Manage your account or get help",
    "keywords": "password sign out account help contact admin",
    "body": "<p>Change your password or sign out on <a href=\"me.html#account\">Me, Account tab</a>. If you forget your password, use <a href=\"reset-password.html\">Reset password</a> from the sign-in page. Google sign-in users manage their password through Google instead.</p><p>For problems with your account or player link, contact the site admin at notredamegeo@gmail.com.</p>"
   }
  ]
 },
 {
  "id": "using-the-site",
  "title": "Using the site",
  "icon": "softball",
  "audience": null,
  "intro": "How to find things, follow the season, dig into stats and use the member features.",
  "topics": [
   {
    "id": "find-your-way",
    "title": "Find your way around",
    "keywords": "navigation menu header hubs season stats teams players history play bottom bar avatar",
    "body": "<p>The header groups the site into hubs:</p><ul><li><strong>Season:</strong> standings, schedule and playoffs.</li><li><strong>Stats:</strong> Batting, Pitching, Leaders, Compare and Explore.</li><li><strong>Teams &amp; Players:</strong> rosters, team pages and player pages.</li><li><strong>History:</strong> past seasons, awards and records.</li><li><strong>Play:</strong> the daily games and other league games.</li></ul><p>Your avatar at the top right opens <a href=\"me.html\">Me</a>. On phones, the hubs sit in a bar at the bottom of the screen.</p>"
   },
   {
    "id": "search",
    "title": "Search the site",
    "keywords": "search find player team season page keyboard shortcut slash cmd k ctrl k",
    "body": "<p>Click the <strong>Search</strong> button or press the <strong>/</strong> key (or Cmd-K / Ctrl-K) anywhere on the site. Search finds players, teams, seasons and pages, so it is the quickest way to jump to someone's stats or a specific season. Start typing a name and pick a result from the list.</p>"
   },
   {
    "id": "rsvp",
    "title": "RSVP for games",
    "keywords": "rsvp in maybe out attendance captain next game reminder",
    "body": "<p>Your next game appears at the top of the Dashboard on <a href=\"me.html\">Me</a> with <strong>In</strong>, <strong>Maybe</strong> and <strong>Out</strong> buttons. One tap records your answer, and your captain sees who is coming.</p><p>Please respond for every game. Captains rely on RSVPs to plan lineups, and if you have not answered you may get a daily RSVP reminder (if you turned that push on in <a href=\"me.html#notifications\">Notifications</a>). Your player record must be linked for RSVPs to count.</p>"
   },
   {
    "id": "season-pages",
    "title": "Follow the season",
    "keywords": "standings schedule playoffs clinching weekend preview game preview matchup weather",
    "body": "<p>Under <strong>Season</strong> you will find:</p><ul><li><strong>Standings:</strong> updated after every game.</li><li><strong>Schedule:</strong> dates, times, opponents, past results and upcoming games.</li><li><strong>Playoffs:</strong> the playoff bracket and <a href=\"playoff-clinching.html\">clinching scenarios</a> showing what each team needs to clinch a spot or seed.</li></ul><p>The <a href=\"weekend-preview.html\">Weekend Preview</a> covers the upcoming games with matchups, team records, players to watch and weather. Each game also has its own preview with head-to-head records, recent form and stat comparisons.</p>"
   },
   {
    "id": "calendar",
    "title": "Add the schedule to your calendar",
    "keywords": "calendar subscribe ical google apple outlook sync rainout",
    "body": "<p>You can add your team's games (or the full league schedule) to Google Calendar, Apple Calendar or Outlook from your team's schedule page.</p><p><strong>Subscribe rather than download.</strong> A subscription picks up rainouts, reschedules and new games automatically, usually within an hour. A one-time download does not update.</p>"
   },
   {
    "id": "stats-tables",
    "title": "Read and customize stats tables",
    "keywords": "batting pitching tables presets standard advanced counting qualified totals per game csv share image acesbpi era",
    "body": "<p>The <strong>Batting</strong> and <strong>Pitching</strong> tables under Stats have controls along the top:</p><ul><li><strong>Presets:</strong> Standard, Advanced or Counting columns.</li><li><strong>Qualified:</strong> show only players who meet the qualifying minimum.</li><li><strong>Totals / Per game:</strong> switch between raw totals and per-game rates.</li><li><strong>Shading</strong> to highlight standout values.</li><li><strong>Copy CSV</strong> and <strong>share as image</strong>.</li></ul><p>Pitching stats are limited to games, innings, runs allowed and ERA. AcesBPI is the league's own rating that combines batting average, on-base percentage and run production into one number.</p>"
   },
   {
    "id": "leaders-compare-explore",
    "title": "Use Leaders, Compare and Explore",
    "keywords": "leaders career best seasons one season milestones compare head-to-head explore filter chart",
    "body": "<ul><li><strong>Leaders:</strong> switch between Career, Best seasons and One season views. <strong>Milestones</strong> tracks career marks (such as 100 hits) and who is closing in on the next one.</li><li><strong>Compare:</strong> put Players side by side, compare Teams, or look up Head-to-head records between teams.</li><li><strong>Explore:</strong> filter players or teams by any stat and view the results as a table or a chart.</li></ul><p>Each player page has season-by-season stats, career totals and trends. The <strong>History</strong> hub has every past season's standings, stats and champions, plus award winners.</p>"
   },
   {
    "id": "favorites",
    "title": "Follow favorite players and teams",
    "keywords": "favorites follow star players teams quick access",
    "body": "<p>Follow up to 10 players and any number of teams. Add and remove them on <a href=\"me.html#favorites\">Me, Favorites tab</a>. Favorites give you quick access to the stats and schedules you care about most.</p><p>The 10-player limit is firm: once you reach it, remove a player before adding another.</p>"
   },
   {
    "id": "badges",
    "title": "Earn badges",
    "keywords": "badges achievements hit streak multi-hit pitching hidden bronze silver gold",
    "body": "<p>Since 2026, players earn badges for on-field accomplishments. They appear on your player page.</p><ul><li><strong>Hit streaks:</strong> a hit in 3, 5 or 8+ straight games earns bronze, silver or gold.</li><li><strong>Multi-hit games:</strong> games with 3, 4 or 5+ hits.</li><li><strong>Pitching:</strong> scoreless outings, workhorse innings and shutdown performances.</li><li><strong>Hidden badges:</strong> secret achievements to discover.</li></ul>"
   },
   {
    "id": "daily-games-photos",
    "title": "Play the daily games and share photos",
    "keywords": "daily word game 6-letter streak play photos gallery upload videos baseball card",
    "body": "<p>The <strong>Play</strong> hub has the daily 6-letter word games, with a new puzzle every day. Your record, streaks and game badges are on <a href=\"me.html#games\">Me, Games tab</a>.</p><p>The <a href=\"pictures.html\">photo gallery</a> holds photos and videos from games and events, organized by team. Signed-in members can add their own on <a href=\"photo-upload.html\">Photo upload</a>.</p><p>You can also make a baseball card from your photo, stats and team colors, and download or share it.</p>"
   }
  ]
 },
 {
  "id": "scoring",
  "title": "Scores and stats",
  "icon": "hash",
  "audience": null,
  "intro": "Who can submit results and how to record final scores and player stats after a game.",
  "topics": [
   {
    "id": "who-can-submit",
    "title": "Who can submit scores and stats",
    "keywords": "permissions access roles admin league staff captain team staff sign in linked",
    "body": "<ul> <li><strong>Admin and League Staff:</strong> any game and any team. A team selector appears at the top of Submit stats so they can enter stats on behalf of any team.</li> <li><strong>Captain and team staff:</strong> their own team's games only. Their team loads automatically.</li> <li><strong>Players and fans:</strong> no access.</li> </ul> <p>Both pages send you to sign-in if you are not logged in. Make sure your account is linked to your team before you try to submit. Captains and team staff reach both pages from <a href=\"me.html#tools\">Me &gt; Your tools</a>.</p>"
   },
   {
    "id": "submit-final-score",
    "title": "Submit a final score",
    "keywords": "final score result standings home away submit score",
    "body": "<p>Open <a href=\"submit-score.html\">Submit scores</a>.</p> <ol> <li>Pick the season (usually the current one). Only seasons you have access to appear.</li> <li>Pick the game; the list shows date, home team and away team. If a score is already saved, it pre-fills.</li> <li>Enter home and away runs as whole numbers, no negatives. The preview at the bottom shows the winner as you type.</li> <li>Click <strong>Submit Score</strong>. A confirmation shows the full result before anything is saved; confirm to finalize.</li> </ol> <p>Standings update immediately, so submit while you are still at the field. The form is a single page and works well on a phone.</p>"
   },
   {
    "id": "line-score-forfeit",
    "title": "Add a line score, forfeit or notes",
    "keywords": "inning by inning line score box score extra innings forfeit notes rain delay",
    "body": "<p>These options are on the <a href=\"submit-score.html\">Submit scores</a> form and are all optional.</p> <ul> <li><strong>Line score:</strong> check Enter inning-by-inning scores to open the grid. Enter runs per inning; the totals calculate automatically and become read-only. Use the + and - controls to add or remove innings, from 1 up to 15, for extra innings.</li> <li><strong>Forfeit:</strong> check the forfeit box to flag the game as a forfeit in the record and standings.</li> <li><strong>Notes:</strong> free text stored on the game record, for anything unusual such as a rain delay or field change.</li> </ul>"
   },
   {
    "id": "correct-a-result",
    "title": "Correct a score or stats",
    "keywords": "fix correct mistake edit resubmit overwrite",
    "body": "<p>To fix either a score or stats, select the same game again and re-submit.</p> <ul> <li><strong>Scores:</strong> the saved values pre-fill. New values overwrite the old ones, and the record stores who submitted and when.</li> <li><strong>Stats:</strong> the grid pre-fills with existing numbers, so edit only what changed. New values overwrite the old ones for that game.</li> </ul> <p>If the game was tracked in Game Tracker, the score and stats may already be saved; check the pre-filled values before re-submitting.</p>"
   },
   {
    "id": "submit-game-stats",
    "title": "Enter stats for one game",
    "keywords": "player stats game by game batting pitching played checkbox",
    "body": "<p>Open <a href=\"submit-stats.html\">Submit stats</a> and stay on the <strong>Game-by-Game</strong> tab.</p> <ol> <li>Pick the game. The list shows your team's completed and upcoming games for the active season.</li> <li>Your roster loads as rows. Check <strong>Played</strong> for everyone who appeared; unchecked players are skipped and none of their fields save.</li> <li>Enter AB, H, R, BB and HR, plus IP and RA for anyone who pitched.</li> <li>Click <strong>Submit Stats</strong>. A success message confirms the save.</li> </ol> <p>If you ended a tracked game in Game Tracker, batting stats are already saved. Use this page when you kept score on paper or need to correct something. Stats power leaderboards, player pages and career records.</p>"
   },
   {
    "id": "stats-fields",
    "title": "What each stat field means",
    "keywords": "at bats hits runs walks home runs innings pitched runs allowed era definitions",
    "body": "<ul> <li><strong>AB (at bats):</strong> trips that end in a hit, out or error. Walks and sacrifice flies are not at bats.</li> <li><strong>H (hits):</strong> total base hits; used for batting average.</li> <li><strong>R (runs):</strong> runs this player scored.</li> <li><strong>BB (walks):</strong> times on base by a walk.</li> <li><strong>HR (home runs):</strong> home runs hit.</li> <li><strong>IP (innings pitched):</strong> pitchers only, as a decimal where .1 means one out. 3.1 is 3 innings plus 1 out.</li> <li><strong>RA (runs allowed):</strong> pitchers only; runs scored while this player pitched.</li> </ul> <p>Pitching records show games, innings, runs allowed and ERA only. Wins, losses and saves are not kept, and strikeouts and walks for pitchers are not tracked consistently.</p>"
   },
   {
    "id": "bulk-csv-upload",
    "title": "Upload stats from a CSV file",
    "keywords": "csv bulk upload multiple games spreadsheet import columns format",
    "body": "<p>For several games at once, use the <strong>CSV Bulk Upload</strong> tab on <a href=\"submit-stats.html\">Submit stats</a>.</p> <ul> <li><strong>Required columns:</strong> player, date, opponent, ab, h, r, bb.</li> <li><strong>Optional columns:</strong> hr, ip, ra (put hr between bb and ip).</li> <li>Player names must match your roster exactly. Dates use MM/DD/YYYY.</li> </ul> <ol> <li>Drag and drop the file or browse for it.</li> <li>Review the preview. Red rows have errors; yellow rows are warnings.</li> <li>Fix the file and re-upload, or submit with only the valid rows.</li> </ol>"
   },
   {
    "id": "post-game-flow",
    "title": "Post-game checklist",
    "keywords": "after the game workflow score and stats separate game tracker",
    "body": "<p>A score and stats are separate submissions. Submitting a score does not submit stats, and submitting stats does not submit the score; do both unless stats came from Game Tracker.</p> <ol> <li>End Game Tracker, which saves batting stats automatically.</li> <li>Open <a href=\"submit-score.html\">Submit scores</a>, enter the final score and submit.</li> <li>If you did not use Game Tracker, enter stats in <a href=\"submit-stats.html\">Submit stats</a> within 24 hours, while the details are fresh.</li> </ol> <p>Installing the site to your home screen makes both pages load fastest at the field.</p>"
   }
  ]
 },
 {
  "id": "calendar",
  "title": "Calendar sync",
  "icon": "calendar",
  "audience": null,
  "intro": "Add your team's games or the full league schedule to Google, Apple or Outlook calendars.",
  "topics": [
   {
    "id": "find-calendar-buttons",
    "title": "Find the calendar buttons",
    "keywords": "calendar export strip season page team page schedule ics subscribe",
    "body": "<p>A row of four calendar buttons sits just above the schedule table on two pages:</p> <ul> <li><strong>Your team's page</strong> (find it under Teams &amp; Players in the header): exports only your team's games.</li> <li><strong>The Season page</strong> (under the Season hub): exports the full league schedule.</li> </ul> <p>Both work the same way. The buttons are Google Calendar, Apple / iPhone, Download .ics and Copy URL. If the row does not appear, refresh the page.</p> <p>Each event includes the date, time, field location and the two teams.</p>"
   },
   {
    "id": "subscribe-calendar",
    "title": "Subscribe so changes sync",
    "keywords": "subscribe live auto update rainout reschedule apple iphone google calendar",
    "body": "<p>Subscribing keeps your calendar current: reschedules and rainouts sync within about an hour. Use Apple / iPhone or Google Calendar for this.</p> <ul> <li><strong>Apple / iPhone (recommended):</strong> opens a popup with a live calendar URL and step-by-step instructions for each app.</li> <li><strong>Google Calendar:</strong> opens Google Calendar in a new tab with the subscription pre-filled. Click Add calendar to confirm; games appear under Other calendars.</li> <li><strong>Copy URL:</strong> copies the same live link to your clipboard to paste into any app that supports subscribed calendars. It also auto-updates.</li> </ul>"
   },
   {
    "id": "download-ics",
    "title": "Download a one-time .ics file",
    "keywords": "ics download snapshot import file",
    "body": "<p>Click <strong>Download .ics</strong> to save a one-time snapshot of the schedule. Open the downloaded file, choose which calendar to add the events to, and confirm.</p> <p>A downloaded file does not update if the schedule changes later. If you want reschedules and rainouts to appear automatically, subscribe instead.</p>"
   },
   {
    "id": "calendar-app-steps",
    "title": "Add the URL in your calendar app",
    "keywords": "iphone ios settings outlook mac calendar google web from url add subscribed calendar",
    "body": "<p>After copying the calendar URL:</p> <ul> <li><strong>iPhone:</strong> Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar. Paste the URL, tap Next, then Save.</li> <li><strong>Google Calendar (web):</strong> on a computer, click the + next to Other calendars, choose From URL, paste the URL and click Add calendar.</li> <li><strong>Outlook:</strong> in Calendar view, click Add calendar, then From Internet. Paste the URL and click OK.</li> <li><strong>Mac Calendar:</strong> File, New Calendar Subscription. Paste the URL and click Subscribe.</li> </ul>"
   },
   {
    "id": "filter-my-team",
    "title": "Show only my team's games",
    "keywords": "filter only my team all teams too many games",
    "body": "<p>If your calendar shows every team's games, you subscribed from the Season page. Remove that calendar and use the buttons on your team's page instead, which export only your team's games. Find your team under Teams &amp; Players in the header (or in the bottom bar on a phone), then use any calendar button above the schedule.</p>"
   }
  ]
 },
 {
  "id": "captains",
  "title": "Captains and team staff",
  "icon": "clipboard",
  "audience": "team-staff",
  "intro": "How captains and team staff handle RSVPs, lineups, fielding, live tracking and team staff for their team.",
  "topics": [
   {
    "id": "captain-tools",
    "title": "Find your captain tools",
    "keywords": "captain tools your tools roster management manage team staff dashboard",
    "body": "<p>Every captain and team staff tool is on <a href=\"me.html#tools\">Me &gt; Your tools</a>. Open Me from the avatar menu at the top right of any page (sign-in also lands you on Me).</p> <ul> <li><strong>Roster and RSVPs</strong> (<a href=\"roster-management.html\">roster-management.html</a>): team RSVPs, batting order and fielding positions.</li> <li><strong>Submit scores</strong> (<a href=\"submit-score.html\">submit-score.html</a>) and <strong>Submit stats</strong> (<a href=\"submit-stats.html\">submit-stats.html</a>).</li> <li><strong>Team staff</strong> (<a href=\"manage-team.html\">manage-team.html</a>): add or remove assistant captains.</li> <li><strong>Edit roster info</strong> (<a href=\"captain-roster-edit.html\">captain-roster-edit.html</a>), <strong>Scouting report</strong> and <strong>Team photos</strong>.</li> </ul> <p>When you finalize a batting order or fielding chart, your team is notified automatically so players know where they are playing.</p>"
   },
   {
    "id": "captain-notifications",
    "title": "Set up captain notifications",
    "keywords": "push notifications alerts rsvp updates link requests reminders install iphone android",
    "body": "<p>Turn on push notifications on <a href=\"me.html#notifications\">Me &gt; Notifications</a>. Push is switched on per device, so enable it on each phone or computer you use. The same tab controls which pushes you get, quiet hours and email preferences.</p> <p>Pushes that matter most for captains:</p> <ul> <li><strong>RSVP updates</strong>: a player responds to a game.</li> <li><strong>Link requests</strong>: a new player wants to link their account to your team.</li> <li><strong>48-hour game reminders</strong>: a prompt to set your lineup before game day.</li> </ul> <p>On iPhone, push requires iOS 16.4 or later and the site must be installed to the home screen first: open it in Safari (not Chrome), tap Share, then Add to Home Screen, then Add. On Android, open it in Chrome, tap the three-dot menu, then Install app or Add to Home Screen. The installed app loads faster and works offline at the field.</p>"
   },
   {
    "id": "manage-rsvps",
    "title": "Check and update team RSVPs",
    "keywords": "rsvp yes maybe no pending attendance minimum players who is coming",
    "body": "<p>Players RSVP In, Maybe or Out from their <a href=\"me.html\">Me Dashboard</a> and get automatic reminders. You see the team picture in <a href=\"roster-management.html\">Roster and RSVPs</a>: a summary at the top shows Yes, Maybe, No and Pending counts for the selected game.</p> <p>Captains and team staff can change any player's status. Tap the status badge to cycle Yes, Maybe, No, Pending. Do this when a player texts you instead of updating the site, so your lineup reflects reality.</p> <p><strong>Minimum players to play:</strong></p> <ul> <li>Summer: 8 (the opponent supplies a catcher).</li> <li>Fall: 7 (the opponent supplies a catcher).</li> </ul> <p>Check RSVPs 3 to 4 days before the game. Reminders go out automatically, but a group chat nudge helps with players still Pending.</p>"
   },
   {
    "id": "batting-order",
    "title": "Build a batting order",
    "keywords": "lineup batting order drag drop copy previous game finalize notify",
    "body": "<p>Build the lineup in <a href=\"roster-management.html\">Roster and RSVPs</a>. Only players with a Yes RSVP appear in the available list; if someone is missing, they are Maybe, No or Pending.</p> <ul> <li><strong>Size:</strong> up to 16 batters in Summer, up to 13 in Fall.</li> <li><strong>Desktop:</strong> drag a player from Available Players into a numbered slot, then drag within the order to rearrange.</li> <li><strong>Phone:</strong> drag does not work. Tap the + button or an empty slot, pick a player, and use the up and down arrows to reorder.</li> <li><strong>Copy from Previous Game</strong> loads your most recent game's order; then adjust for who is available.</li> </ul> <p>Edits save automatically. When the lineup is set, tap <strong>Finalize Batting Order and Notify Team</strong> to push it to every team member. After last-minute changes, finalize again so players get the update. Aim to build the order 1 to 2 days before the game.</p>"
   },
   {
    "id": "fielding-positions",
    "title": "Set fielding positions",
    "keywords": "fielding defense positions innings bench catcher rover apply to all copy inning",
    "body": "<p>Assign positions for all 7 innings in <a href=\"roster-management.html\">Roster and RSVPs</a>. Desktop shows a grid of positions by innings; on a phone you move one inning at a time with Prev and Next.</p> <ul> <li><strong>Positions:</strong> Summer has 9 (P, C, 1B, 2B, SS, 3B, LF, CF, RF). Fall adds a Rover for 10.</li> <li><strong>Apply Inning 1 to All</strong> copies the first inning everywhere (on a phone it reads Apply Inning X to All). Best when players stay put.</li> <li>Each inning's <strong>Copy</strong> button duplicates the previous inning, for small inning-by-inning changes.</li> <li><strong>Bench</strong> slots below the field hold players sitting out. Bench spots equal batting order size minus field positions.</li> </ul> <p><strong>Catcher rule:</strong> in Summer, with 8 or fewer Yes RSVPs the opponent supplies the catcher and the position is locked; at 9 or more you field your own. In Fall the cutoff is 7 or fewer versus 8 or more.</p> <p>Tap <strong>Finalize Fielding and Notify Team</strong> when done, ideally the day before or the morning of the game.</p>"
   },
   {
    "id": "team-staff",
    "title": "Add or remove team staff",
    "keywords": "assistant captain team staff permissions manage team backup",
    "body": "<p>Team staff are assistant captains. They can manage RSVPs, build batting orders, set fielding, use Game Tracker and submit scores and stats. Only the captain can add or remove team staff.</p> <p><strong>To add:</strong> open <a href=\"manage-team.html\">Team staff</a> from <a href=\"me.html#tools\">Me &gt; Your tools</a>, find the person in the Players or Fans list (or search), click <strong>Make Team Staff</strong> and confirm.</p> <p><strong>To remove:</strong> on the same page, find the member with the Team Staff badge and click <strong>Remove Staff</strong>. They go back to a Player or Fan role.</p> <p>Name a backup so someone can run RSVPs, lineups and tracking when you miss a game. Captains themselves can only be assigned or removed by League Staff and Admins; team staff cannot remove a captain.</p>"
   },
   {
    "id": "game-tracker",
    "title": "Track a game live",
    "keywords": "game tracker live play by play scoring runners offline undo end game",
    "body": "<p>Game Tracker records plays as they happen and calculates batting stats automatically. Captains, team staff, League Staff and Admins can track; anyone can watch read-only.</p> <ol> <li>Open Game Tracker, choose your team, then pick the game from the upcoming list.</li> <li>Your batting order loads from <a href=\"roster-management.html\">Roster and RSVPs</a>, so build it there first.</li> <li>Tap the play for the highlighted batter: Single, Double, Triple, HR, Walk, Out, Groundout, Flyout, Strikeout, Error, FC or Sac Fly. Runners advance automatically and the inning flips after 3 outs.</li> <li>Click <strong>End Game</strong>, confirm the final score, and batting stats save to each player's record.</li> </ol> <p><strong>Undo</strong> reverses the last play. If both teams track, play-by-play merges. A presence line shows who is tracking and who is watching. With no signal, plays queue and sync when you reconnect.</p>"
   },
   {
    "id": "captain-timeline",
    "title": "Captain game-week checklist",
    "keywords": "timeline schedule workflow tips best practices troubleshooting offline",
    "body": "<ul> <li><strong>3 to 4 days before:</strong> check RSVPs and nudge Pending players.</li> <li><strong>1 to 2 days before:</strong> build the batting order, starting from Copy from Previous Game.</li> <li><strong>Day before or morning of:</strong> set fielding and finalize both.</li> <li><strong>During the game:</strong> track plays in Game Tracker.</li> <li><strong>Right after:</strong> end Game Tracker to save stats and <a href=\"submit-score.html\">submit the final score</a>.</li> <li><strong>Within 24 hours:</strong> if you did not track live, enter stats in <a href=\"submit-stats.html\">Submit stats</a>.</li> </ul> <p><strong>Troubleshooting:</strong> changes not saving usually means you are offline; Game Tracker and Roster and RSVPs queue changes and sync when you reconnect. If Game Tracker shows no batting order, create one in Roster and RSVPs first.</p>"
   }
  ]
 },
 {
  "id": "game-tracker",
  "title": "Game tracker",
  "icon": "clipboard",
  "audience": "team-staff",
  "intro": "Track a game live, play by play, so batting stats, runners and the score are recorded as the game happens.",
  "topics": [
   {
    "id": "open-tracker",
    "title": "Open the game tracker",
    "keywords": "game-tracker.html permissions who can track captain team staff scorekeeper view only spectator mode editor mode",
    "body": "<p>The game tracker records a game live, at-bat by at-bat. It keeps batting stats as you go, shows runners on a diamond, counts runs as runners cross home, and syncs the score and inning to everyone watching. The easiest setup is someone on the bench (team staff, a subbed-out player or a fan with access) tracking while the game is played.</p><p>Open it from the <strong>Your tools</strong> tab on <a href=\"me.html#tools\">Me</a>, or go straight to <a href=\"game-tracker.html\">game-tracker.html</a>.</p><ul><li><strong>Captains and team staff</strong> can track their own team.</li><li><strong>Scorekeepers, league staff and admins</strong> can track any team, and can track both teams in the same game. Plays from both sides then merge into one play-by-play.</li><li><strong>Players and fans</strong> can only watch. They see a yellow banner saying only team captains and staff can track plays.</li></ul><p>If you can track but only want to watch, click the <strong>Editor Mode</strong> toggle to switch to <strong>Spectator Mode</strong>. Play buttons, lineup editing and score controls are disabled until you click it again.</p>"
   },
   {
    "id": "set-up-game",
    "title": "Set up a game",
    "keywords": "start game tracker select team select game starting pitchers skip",
    "body": "<ol><li>Choose the team you are tracking from the dropdown. Only teams you are allowed to track show games.</li><li>Pick the game from the list of upcoming games. Each card shows the matchup (Away @ Home), the date and a Home or Away badge. The selected card turns green with a <strong>Selected</strong> badge.</li><li>Check the matchup summary and click <strong>Start Game Tracker</strong>. If the captain already set a batting order in Roster Management, a green note says it will be loaded automatically.</li><li>The <strong>Set Starting Pitchers</strong> box opens. Pick a pitcher for your team and for the opponent from the roster dropdowns, then click <strong>Start Tracking</strong>. This step is optional: click <strong>Skip</strong> if you do not know yet. You can set or change pitchers any time during the game.</li></ol>"
   },
   {
    "id": "game-tracker-batting-order",
    "title": "Set the batting order",
    "keywords": "lineup roster management drag and drop edit lineup arrows up now",
    "body": "<p>The recommended way is to set the order before the game in Roster Management:</p><ol><li>Open Roster Management from the <strong>Your tools</strong> tab on <a href=\"me.html#tools\">Me</a>.</li><li>Select your team and the upcoming game.</li><li>Drag and drop players into batting order.</li></ol><p>When you start the game tracker, that order loads automatically.</p><p>You can also change the order during the game. Click <strong>Lineup</strong> or <strong>Edit Lineup</strong> to open the lineup manager, then use the up and down arrows to move a player. The current batter is always marked with a green <strong>Up Now</strong> badge.</p>"
   },
   {
    "id": "change-lineup",
    "title": "Add or remove a player mid-game",
    "keywords": "late arrival injury leaves early substitute sub add player remove player stats kept roster",
    "body": "<p><strong>To remove a player</strong> (injury, leaving early): click the X next to their name in the lineup. They are skipped for the rest of the game and the batter indicator adjusts on its own. Their stats are not deleted: if they went 2-for-3 before leaving, that still counts when the game ends.</p><p><strong>To add a player</strong> (late arrival or sub): click <strong>Edit Lineup</strong>, scroll to the <strong>Add Player</strong> section at the bottom and click the player. New players go to the bottom of the order; use the arrows to move them to the right spot.</p><p>Only players on your team's season roster appear in Add Player. If a sub is not on the roster, ask league staff to add them to the roster first.</p>"
   },
   {
    "id": "record-a-play",
    "title": "Record a play",
    "keywords": "play buttons single double triple home run walk strikeout ground out fly out sac fly confirm play scoreboard now batting stats panel",
    "body": "<p>The green scoreboard header shows the inning (with top or bottom and who is batting), outs, your score and the opponent's score. Below it are the diamond, the <strong>Now Batting</strong> box (number, name, position) and a live stats panel with AB, H, R, BB and AVG for each player.</p><p>When your team is up, tap the result of the at-bat:</p><ul><li><strong>Hits (green):</strong> 1B, 2B, 3B, HR. On a home run the batter and every runner score automatically.</li><li><strong>Outs (red):</strong> K (strikeout, no runner changes), GO (ground out), FO (fly out, adjust for tag-ups), SF (sac fly, runners may tag up and advance), DP (double play).</li><li><strong>Other (blue):</strong> BB (walk; batter takes first, runners only forced if bases are loaded), FC (fielder's choice; batter reaches first).</li></ul><p>After you tap a play you are in adjustment mode, where you can move runners. Nothing is saved until you click <strong>Confirm Play</strong>. The next batter then comes up automatically.</p>"
   },
   {
    "id": "move-runners",
    "title": "Move runners and score runs",
    "keywords": "base runners advance back arrow out x drag and drop home plate thrown out at home caught stealing picked off",
    "body": "<p>In adjustment mode each runner has three controls: the back arrow moves them back a base, the forward arrow moves them up a base, and the red X marks them out (adds one out on most plays). A runner moved past third scores, and the run count (+1 Run, +2 Runs) updates as you go. On desktop you can also drag a runner's name to a base or to home plate.</p><p><strong>Runner thrown out at home on a single:</strong> record 1B, advance the runner home, then tap their name in the scored runners list to un-score them. They return to third; tap X to mark them out.</p><p><strong>Runner caught stealing or picked off:</strong> record the batter's result (such as GO or FO), then X the runner who was caught. If no at-bat happened, you may need to undo and re-record.</p><p><strong>Sac fly with a runner on third:</strong> tap SF, move the runner home, confirm. That is 1 out and 1 run.</p>"
   },
   {
    "id": "fc-or-dp",
    "title": "Record a fielder's choice or double play",
    "keywords": "FC DP fielder's choice double play 6-4-3 runner out batter safe",
    "body": "<p>Ask one question: did the batter reach base safely? If yes, use <strong>FC</strong>. If no, use <strong>DP</strong>.</p><p><strong>Fielder's choice:</strong> the batter goes to first and runners move up. Tap X on each runner who was thrown out; each X adds one out. Example: runners on first and second, batter safe, both runners out. Tap FC, X the first runner, X the second, confirm. The batter stays on first and 2 outs are recorded.</p><p><strong>Double play:</strong> tap DP. Two outs are already counted and the batter does not reach base. Tap X on the runner who was thrown out; this only identifies them and does not add a third out. Confirm. A runner on third scores automatically on a DP. If they did not actually score, tap their name in the scored runners list to un-score them.</p>"
   },
   {
    "id": "pitchers",
    "title": "Set or change pitchers",
    "keywords": "pitching change pitcher bar ERA innings runs allowed",
    "body": "<p>A purple pitcher bar shows the current pitcher for each team. To make a change, pick the new pitcher from that team's dropdown, check the confirmation box and click <strong>Confirm</strong>. The change is logged in the play-by-play (for example, \"Mike Jones replaces John Smith\").</p><p>Every play is credited to the pitcher on the mound for the other team, so keep the pitcher bar current. The league's pitching stats are games, innings, runs allowed and ERA.</p><p>Pitcher choices sync between trackers. If both teams are tracking, either tracker can change either team's pitcher and the other sees it update.</p>"
   },
   {
    "id": "fix-mistakes",
    "title": "Fix a mistake or the score",
    "keywords": "undo last play add run remove run score correction timing play third out",
    "body": "<p>If you recorded the wrong play, click <strong>Undo Last Play</strong>. It fully reverses the last action, including runners, outs and score, and works for plays, pitching changes and manual score changes. Use it instead of fixing the score by hand. It is disabled when no plays have been recorded.</p><p><strong>To add a run</strong> (a missed play or scoring correction), tap + next to your team's score and choose who scored. Runners on base are listed first in green, then the rest of the lineup.</p><p><strong>To remove a run</strong> (for example a timing play on the third out), tap the minus next to your team's score and choose the player whose run should come off.</p><p>Picking the player keeps runs credited to the right person in the final stats.</p>"
   },
   {
    "id": "innings-and-opponent",
    "title": "Change innings and track the opponent",
    "keywords": "three outs side retired half inning back at bat opponent score plus minus",
    "body": "<p>After your team's third out, an amber <strong>3 Outs - Side Retired</strong> banner appears. Click its button to move to the next half-inning.</p><p>While the opponent bats, a green panel shows who is batting with + and minus buttons for their runs. You do not track their individual at-bats: add a run each time they score, and click <strong>Back at Bat</strong> when they make their third out. The opponent score in the header also has + and minus buttons if you need to fix it.</p><p>If the opponent is also using the game tracker, their score updates from their own play-by-play and their plays appear in the combined log.</p>"
   },
   {
    "id": "end-game",
    "title": "End the game",
    "keywords": "end game finalize save stats clear progress start over",
    "body": "<p>When the game is over, click <strong>End Game</strong>. This finalizes the game, saves all batting stats and returns you to the setup screen. The saved results feed season stats and game recaps. You can start tracking another game right away.</p><p><strong>Clear Progress</strong> erases every tracked play so you can start over. It cannot be undone, so use it only if you really mean to wipe the game.</p><p>Do not close or refresh the page mid-game. Your data is auto-saved and the page will warn you, but it is best to end the game properly first.</p>"
   },
   {
    "id": "sync-and-offline",
    "title": "Live sync and offline mode",
    "keywords": "real-time presence notifications play-by-play colors offline back online queue phone mobile",
    "body": "<p>Everyone on the game sees the same score and inning in real time. A presence indicator lists who else is watching or tracking and how recently they were active. When the other team records something, you get a pop-up note for score updates, inning changes and plays (if both teams are tracking).</p><p>The play-by-play log at the bottom lists plays from both teams in order: green for your team, gray for the opponent and purple for pitching changes.</p><p>The tracker is built for phones at the field. If your signal drops you will see <strong>You're offline</strong>. Keep recording: plays are queued on your device and sync automatically, and you will see <strong>Back online</strong> when they do.</p>"
   }
  ]
 },
 {
  "id": "contributors",
  "title": "Contributors",
  "icon": "sparkles",
  "audience": [
   "contributor",
   "photographer",
   "oddsmaker",
   "eulogist",
   "mediaManager",
   "league-staff"
  ],
  "intro": "How eulogists, photographers, oddsmakers and staff create content for the league.",
  "topics": [
   {
    "id": "contributor-access",
    "title": "Open the contributor tools",
    "keywords": "contributor dashboard access role tools",
    "body": "<p>Contributor tools are available to members with a contributor role. Sign in, open <a href=\"me.html\">Me</a> and go to the <strong>Your tools</strong> tab, which shows the tools your role allows. Your role badges appear at the top of the contributor dashboard.</p><p>If you do not see the tools and think you should, contact league staff to have a role assigned.</p>"
   },
   {
    "id": "contributor-roles",
    "title": "Know what each role can do",
    "keywords": "roles eulogist photographer oddsmaker admin staff tabs",
    "body": "<ul><li><strong>Eulogist:</strong> Eulogies tab. Writes team eulogies for the Year in Review page.</li><li><strong>Photographer:</strong> Photos tab. Uploads photos, edits captions and organizes team albums.</li><li><strong>Oddsmaker:</strong> Odds &amp; Previews tab. Sets game odds and writes Peters Previews.</li><li><strong>Admin / League Staff:</strong> all tabs, including Banner Messages.</li></ul>"
   },
   {
    "id": "write-eulogy",
    "title": "Write a team eulogy",
    "keywords": "eulogy eulogies recap year in review champion celebration elimination order round",
    "body": "<p>Eulogies are tributes to teams after they are knocked out of the playoffs. The champion gets a celebration instead. They appear on the <a href=\"recap.html\">Year in Review</a> page.</p><ol><li>Pick a season to load its eulogies.</li><li>Click <strong>Add Eulogy</strong>, or click an existing one to edit it.</li><li>Fill in the fields and click <strong>Save</strong>.</li></ol><ul><li><strong>Team</strong></li><li><strong>Elimination order:</strong> 1 = first team out. Sets the order on the recap page.</li><li><strong>Eliminated in round:</strong> for example \"Losers Round 2\" or \"Semifinals\".</li><li><strong>Champion:</strong> check for the title winner to switch it to a celebration.</li><li><strong>Text:</strong> use a blank line between paragraphs.</li></ul>"
   },
   {
    "id": "manage-photos",
    "title": "Upload and manage photos",
    "keywords": "photos videos upload caption album team folder delete",
    "body": "<p>To add new media, click <strong>Go to Photo Upload</strong> (or open <a href=\"photo-upload.html\">Photo upload</a>). You can upload several photos or videos at once, pick a team album and add captions.</p><p>To edit existing uploads, open the Photos tab, click a photo, change its caption or album, and click <strong>Save Changes</strong>.</p><p>Albums: League Photos (general), plus one for each team: Green, Blue, Orange, Purple, Red, Yellow, Black, White, Gold, Silver, Carolina and Army.</p><p><strong>Delete is permanent.</strong> It removes the file from storage and cannot be undone.</p>"
   },
   {
    "id": "odds-previews",
    "title": "Set odds and write previews",
    "keywords": "odds moneyline peters preview oddsmaker weekend preview game preview locked",
    "body": "<p>Odds and previews appear on the <a href=\"weekend-preview.html\">Weekend Preview</a> and each game's preview page.</p><ol><li>Pick a season. Games list in date order.</li><li>Click a game to open the editor.</li><li>Enter <strong>away</strong> and <strong>home</strong> moneyline odds. Positive (+150) is the underdog; negative (-120) is the favorite.</li><li>Write the <strong>Peters Preview</strong> text: analysis, storylines, predictions.</li><li>Click <strong>Save Preview</strong>.</li></ol><p>A <strong>Preview</strong> badge means the game has a write-up. A lock badge means it was edited by hand and is protected from automatic updates.</p>"
   },
   {
    "id": "banner-messages",
    "title": "Manage home page banners",
    "keywords": "banner messages scrolling home page priority active start end date schedule admin staff",
    "body": "<p>Admin and league staff only. Banners scroll across the home page.</p><ol><li>Click <strong>Add Banner</strong>, or click an existing banner to edit it.</li><li>Fill in the fields and click <strong>Create</strong> or <strong>Save</strong>.</li></ol><ul><li><strong>Message:</strong> the scrolling text.</li><li><strong>Priority:</strong> 1 to 100; lower numbers show first.</li><li><strong>Active:</strong> only active banners show. Uncheck to hide one without deleting it.</li><li><strong>Start/end date (optional):</strong> the banner shows only on or after the start date and stops after the end date.</li></ul><p>Use dates to schedule ahead, such as a \"Game tonight\" banner that runs only on game days.</p>"
   },
   {
    "id": "whatsapp-sharing",
    "title": "Share to WhatsApp",
    "keywords": "whatsapp share group chat message link",
    "body": "<p>Eulogies and game previews have a <strong>Share to WhatsApp</strong> button. It opens WhatsApp with a ready-made message and you pick the chat or group.</p><ul><li><strong>Eulogy:</strong> team name and title, the full text, and a link to Year in Review.</li><li><strong>Game preview:</strong> matchup (Away @ Home), date and time, odds and preview text if entered, and a link to Weekend Preview.</li></ul><p>The message uses whatever is currently in the form, so fill in the fields first. Other buttons: <strong>Refresh</strong> reloads the list from the database; <strong>Cancel</strong> closes the editor without saving.</p>"
   }
  ]
 },
 {
  "id": "league-staff",
  "title": "League staff",
  "icon": "shield",
  "audience": "league-staff",
  "intro": "How league staff edit games, run home page banners, send notifications and import the signup list.",
  "topics": [
   {
    "id": "open-league-staff-admin",
    "title": "Open League Staff Admin",
    "keywords": "access permissions tools dashboard role",
    "body": "<p>League Staff Admin is available only to users with the League Staff or Admin role.</p><ol><li>Sign in.</li><li>Open <a href=\"me.html#tools\">Me, Your tools tab</a>.</li><li>Under League staff, choose <a href=\"league-staff-admin.html\">League Staff Admin</a>.</li></ol><p>The page has tabs for Schedule, Banners, Notifications and Roster Import. The same tools list also links the <a href=\"offseason.html\">Offseason Hub</a>, <a href=\"offseason-roster.html\">Offseason Rosters</a>, the <a href=\"schedule-generator.html\">Schedule Generator</a> and the <a href=\"schedule-workshop.html\">Schedule Workshop</a>. Admins also see the <a href=\"admin-pages.html\">Admin Hub</a>.</p><p>If League staff tools do not appear on your Me page, you do not have the role. Contact an admin if you think you should.</p>"
   },
   {
    "id": "edit-a-scheduled-game",
    "title": "Edit a scheduled game",
    "keywords": "schedule tab reschedule rainout postpone cancel time date status whatsapp manually edited",
    "body": "<ol><li>On the Schedule tab, pick a season from the dropdown to load its games.</li><li>Click a game to open the editor. The Original Schedule box shows the current date, time and matchup for reference.</li><li>Change what you need and click <strong>Save Changes</strong>.</li></ol><p>Fields:</p><ul><li><strong>Game Date</strong> and <strong>Game Time</strong>: the new date and start time.</li><li><strong>Away Team / Home Team</strong>: change only if needed (rare).</li><li><strong>Status</strong>: Scheduled, Postponed, Completed or Cancelled.</li><li><strong>Notes</strong>: optional reason, such as \"Rain delay\" or \"Field change\".</li><li><strong>Mark as Manually Edited</strong>: protects the game from being overwritten by automatic schedule imports. Tick it on every manual change.</li></ul><p>When you make changes, a WhatsApp message preview appears showing exactly what will be shared. Click <strong>Share to WhatsApp</strong> to send it to captains or team groups.</p>"
   },
   {
    "id": "manage-home-page-banners",
    "title": "Manage home page banners",
    "keywords": "banners tab scrolling message announcement priority start end date active",
    "body": "<p>The Banners tab controls the scrolling messages on the home page.</p><ol><li>Click <strong>Add Banner</strong> for a new one, or click an existing banner to edit it.</li><li>Fill in the fields and click <strong>Create</strong> or <strong>Save</strong>.</li></ol><ul><li><strong>Banner Message</strong>: the text that scrolls.</li><li><strong>Priority (1-100)</strong>: lower numbers show first. Use 1-10 for urgent messages and 10-50 for normal announcements.</li><li><strong>Banner is Active</strong>: only active banners appear. Uncheck to hide a banner without deleting it.</li><li><strong>Start Date</strong> (optional): the banner shows on or after this date.</li><li><strong>End Date</strong> (optional): the banner stops showing after this date.</li></ul><p>Use start and end dates to schedule banners ahead, for example a \"Game Tonight\" banner for each game day or a birthday message that appears and disappears on its own.</p>"
   },
   {
    "id": "send-a-push-notification",
    "title": "Send a push notification",
    "keywords": "notifications tab push alert announcement title message priority link test",
    "body": "<p>The Notifications tab sends push notifications to users' phones for important announcements, schedule changes and league updates.</p><ul><li><strong>Title</strong> (required): max 65 characters. Keep it under 50 for the best display on phones.</li><li><strong>Message Body</strong> (required): max 240 characters. Include the key details.</li><li><strong>Priority</strong>: Normal for standard announcements, Urgent for time-sensitive or critical news, Info for low-priority updates.</li><li><strong>Link</strong> (optional): where users land when they tap it. Choose Weekend Preview, Season Schedule, Standings, Playoff Bracket, or a custom URL. Include a link whenever there is an action to take.</li></ul><p>The preview panel shows how the notification will look on a phone and updates as you type. Always click <strong>Send Test to Me</strong> before sending to everyone, then click <strong>Send Notification</strong>.</p>"
   },
   {
    "id": "choose-who-gets-a-notification",
    "title": "Choose who gets a notification",
    "keywords": "target recipients teams captains league-wide chips recipient count",
    "body": "<ul><li><strong>League-wide</strong> (default): leave all team chips unselected to send to everyone with notifications enabled.</li><li><strong>Specific teams</strong>: click team color chips. Only players on those teams receive it.</li><li><strong>Captains only</strong>: click <strong>Message All Captains</strong>. A gold indicator shows this mode is on.</li></ul><p><strong>Clear Selection</strong> resets team targeting.</p><p>The recipient count shows how many users will receive the notification. It counts only users who have push notifications enabled.</p><p>Do not send team-specific news to the whole league.</p>"
   },
   {
    "id": "unsend-an-announcement",
    "title": "Review or unsend an announcement",
    "keywords": "recent announcements recall unsend delete mistake",
    "body": "<p>The Recent Announcements list shows your 10 most recent announcements with title and preview, priority badge, sent time and sender, recipient count, and scope (league-wide or specific teams).</p><p>Click <strong>Unsend</strong> on an announcement to remove it from every user's in-app notification feed. It is marked \"Recalled\" in your history.</p><p>Unsend cannot pull back a push notification that already appeared on someone's phone. Act quickly if you need to unsend.</p>"
   },
   {
    "id": "bulk-delete-notifications",
    "title": "Bulk delete notifications (admin)",
    "keywords": "cleanup delete by type delete by title admin destructive",
    "body": "<p>Admin only. These tools permanently delete notifications from all users' feeds and cannot be undone.</p><ul><li><strong>Delete by Type</strong>: remove all Announcements, all Game Reminders, all Milestones, or ALL notifications.</li><li><strong>Delete by Title</strong>: enter an exact title to delete every notification with that title across all users.</li></ul><p>Double-check before confirming.</p>"
   },
   {
    "id": "import-the-signup-list",
    "title": "Import the rec signup list",
    "keywords": "roster import returning new players missing excel csv fuzzy match offseason",
    "body": "<p>Run the Roster Import tab before the draft meeting so captains know who is returning and who is new.</p><ol><li><strong>Upload</strong> the rec department signup list as Excel (.xlsx, .xls) or CSV. The name column is auto-detected (it looks for \"Name\", \"Player\", \"Full Name\"); change it if wrong. The preview shows how many names were found.</li><li><strong>Analyze</strong>: names are compared against players active in the last 2 seasons.</li><li><strong>Review</strong> the three columns: Returning (95%+ match, auto-matched, with last season and team), Review (60-94% match: pick the right player or mark as new), and New Players (no match).</li><li><strong>Push</strong> once all reviews are resolved.</li></ol><p>Matching handles nicknames (Mike/Michael, Bill/William, Steve/Stephen), small typos, case and extra spaces.</p><p>The Missing Players alert lists players active in the last 2 seasons who are not on the signup list. Use <strong>Copy Names</strong> or <strong>Download List</strong> to follow up with them.</p>"
   },
   {
    "id": "push-import-to-offseason-rosters",
    "title": "Push the import to Offseason Rosters",
    "keywords": "push offseason rosters unassigned pool report audit log",
    "body": "<p>After every Review match is resolved, click <strong>Push to Offseason Rosters</strong>:</p><ul><li>Returning players keep their current team assignments.</li><li>New players go to the Unassigned pool.</li><li>Teams are then filled by dragging players from the Unassigned pool in <a href=\"offseason-roster.html\">Offseason Rosters</a>, or through the snake draft.</li></ul><p>Use <strong>Download Report Only</strong> to export results without pushing.</p><p>Every import action (uploads, matches, confirmations, pushes) is logged with a timestamp, and a full report is saved to Firebase.</p>"
   }
  ]
 },
 {
  "id": "offseason",
  "title": "Offseason",
  "icon": "leaf",
  "audience": "league-staff",
  "intro": "How to build rosters, run the draft, make the schedule and publish a new season.",
  "topics": [
   {
    "id": "offseason-tools-overview",
    "title": "Offseason tools at a glance",
    "keywords": "offseason hub tools overview access permission",
    "body": "<p>The <a href=\"offseason.html\">Offseason Hub</a> is league-staff only. Open it from <a href=\"me.html#tools\">Me, Your tools tab</a>. It links the tools used to prepare a new season:</p><ul><li><strong>Offseason Rosters</strong>: drag-and-drop team building.</li><li><strong>Snake Draft</strong>: live draft room for unassigned players.</li><li><strong>Schedule Generator</strong>: builds a balanced schedule.</li><li><strong>Schedule Balancer</strong>: fine-tunes dates, times, opponents and home/away.</li><li><strong>Schedule Analyzer</strong>: breaks down an uploaded schedule by team.</li><li><strong>Schedule Editor</strong>: edits single games in a published season.</li><li><strong>Season Setup Wizard</strong>: creates and publishes the new season.</li></ul><p>Recommended order: build rosters, run the draft if needed, generate the schedule, fine-tune it, analyze it, test the wizard in sandbox mode, publish, then handle in-season changes in the editor. If you see a Permission Denied screen, contact an admin.</p>"
   },
   {
    "id": "build-offseason-rosters",
    "title": "Build offseason rosters",
    "keywords": "offseason roster management drag drop load from season unassigned unavailable add player create team",
    "body": "<p>Open <a href=\"offseason-roster.html\">Offseason Rosters</a>.</p><ol><li>Pick the most recent season in the <strong>Load from Season</strong> dropdown to pre-populate every team. With no season selected you start from empty rosters.</li><li>Drag a player card to another team's column to move him. The target highlights on hover.</li><li>New players, or imported players without a team, sit in <strong>Unassigned Players</strong> at the bottom. Drag them onto a team.</li><li>Move players who are not returning to <strong>Unavailable</strong>. They leave active rosters but stay in the system.</li><li>Use <strong>+ Add Player</strong> on a team to pick a past player or type a new name. Use <strong>+ Create Team</strong> for an expansion team (name and color).</li><li>Click <strong>Save Changes</strong> so others see your updates.</li></ol><p><strong>Changelog</strong> shows every move, who made it and when. Names of others editing at the same time appear at the top; coordinate to avoid conflicting changes during draft meetings. Finish roster building before the draft meeting.</p>"
   },
   {
    "id": "set-up-the-snake-draft",
    "title": "Set up the snake draft",
    "keywords": "snake draft setup pool teams order timer randomize reverse",
    "body": "<p>The draft pool is the Unassigned Players section of Offseason Rosters. Players must be there before the draft can start. If the pool is empty, move unsigned players into it, or upload a signup list with Roster Import in <a href=\"league-staff-admin.html\">League Staff Admin</a>. Skip the draft if all rosters are already set.</p><ol><li><strong>Draft pool</strong>: check the count of unassigned players, teams and open roster spots. You can preview each player with new/returning status.</li><li><strong>Participating teams</strong>: click a team to include it. Full teams are greyed out. Picks per team default to open spots; adjust if needed.</li><li><strong>Draft order</strong>: drag teams to set the Round 1 order, or use <strong>Randomize</strong> or <strong>Reverse</strong>.</li><li><strong>Pick timer</strong> (optional): 60s, 90s, 2 min or 3 min. When it runs out the pick is skipped. 90 seconds suits most groups.</li></ol><p>Click <strong>Start Draft</strong> to lock the settings and enter the draft room.</p>"
   },
   {
    "id": "run-the-live-draft",
    "title": "Run the live draft",
    "keywords": "draft room board pick skip snake order complete resume",
    "body": "<p>The clock bar shows the team on the clock, round, pick number, players left and the timer.</p><ul><li><strong>Player Pool</strong> (left): sort by name, batting average or BPI, or search. Click a player to confirm the pick. BPI sort shows the highest-value players fast.</li><li><strong>Draft Board</strong> (center): every pick slot by round and team, current slot highlighted.</li><li><strong>Rosters</strong> (right): each team's picks, updating live.</li></ul><p><strong>Skip</strong> passes the current pick; the player stays in the pool.</p><p>Order snakes: Round 1 follows your order, Round 2 reverses it, Round 3 goes back, and so on. The team that picks last in one round picks first in the next.</p><p>Captains can follow on their own devices, in the room or remotely; all views update live. If the page closes mid-draft, it resumes exactly where it left off.</p>"
   },
   {
    "id": "complete-the-draft",
    "title": "Complete the draft",
    "keywords": "complete draft new draft summary changelog",
    "body": "<p>When all picks are made, click <strong>Complete Draft</strong>. This:</p><ul><li>Moves each drafted player from the Unassigned pool onto his new team in Offseason Rosters.</li><li>Adds a draft_completed entry to the roster changelog.</li><li>Shows a summary of each team's picks.</li></ul><p>Then return to <a href=\"offseason-roster.html\">Offseason Rosters</a> to review the full rosters and make manual adjustments. <strong>New Draft</strong> resets draft data so you can run another round.</p>"
   },
   {
    "id": "generate-a-schedule",
    "title": "Generate a schedule",
    "keywords": "schedule generator summer fall balance score restrictions export csv firebase",
    "body": "<p>Open the <a href=\"schedule-generator.html\">Schedule Generator</a>.</p><ol><li><strong>Season type</strong>: Summer is 23 games, Monday-Thursday (plus Friday with 12 teams), doubleheaders at 7:45 and 8:45 PM. Fall is 12 games on Sundays, 8:00 AM-12:00 PM.</li><li><strong>Teams</strong>: Select All or pick teams. An odd number means byes.</li><li><strong>Parameters</strong>: start date, time slots, and restrictions such as \"Team A cannot play Mondays\" or \"Team B cannot play the 8:45 slot\".</li><li><strong>Generate</strong> and read the balance score: 90-100 excellent, 70-89 good, 50-69 fair (regenerate or use the balancer), below 50 poor (regenerate with different parameters).</li></ol><p>Generate 3-5 versions and keep the best score. Below 70, try adding or removing restrictions. <strong>Regenerate</strong> reruns with the same settings. <strong>Download CSV</strong> saves a file (keep it as a backup); <strong>Export to Firebase</strong> saves it for the Season Setup Wizard. Nothing is written to Firebase until you export.</p>"
   },
   {
    "id": "fine-tune-and-analyze-a-schedule",
    "title": "Fine-tune and check a schedule",
    "keywords": "schedule balancer analyzer molski swap home away conflicts workshop",
    "body": "<p>Open both from the <a href=\"offseason.html\">Offseason Hub</a>.</p><p><strong>Balancer</strong>: upload the generator's CSV (drag it on or browse). Click any cell to edit date, time or a team name; use <strong>Swap</strong> to flip home and away. It flags back-to-back games, unusually long or short gaps, and too many straight home or away games. Team summaries show games, home/away split and opponents. Export with <strong>Download CSV</strong> or <strong>Export to Firebase</strong>.</p><p><strong>Analyzer</strong>: upload a CSV or Excel schedule (<strong>Reset</strong> to load another). Each team gets a MOLSKI (Mountainside Overall League Schedule Kindness Index) rating based on opponent spread, time slot variety, rest days and home/away balance, ranked league-wide. Pick a team for opponents, game times, days of week, home/away split and the full game list.</p><p>Always run the Analyzer as the final check before publishing so no team has an unfairly tough or easy draw.</p>"
   },
   {
    "id": "test-the-season-in-sandbox",
    "title": "Test the new season in sandbox",
    "keywords": "season setup wizard sandbox test dry run",
    "body": "<p>Do a full dry run before publishing. Sandbox seasons save to seasons/sandbox-* documents that the live site ignores.</p><ol><li>Open the Season Setup Wizard and click <strong>Test in Sandbox Mode</strong>. A yellow banner confirms it.</li><li>Run the whole wizard with your final schedule. The season ID gets a sandbox- prefix (for example sandbox-2026-summer) and \"Set as Active\" is disabled.</li><li>Check the success screen. Click <strong>Run Another Test</strong> to repeat.</li><li>Wipe the test seasons afterward (see cleanup below).</li></ol><p>The same button toggles sandbox mode on and off mid-session; the season ID preview updates immediately.</p>"
   },
   {
    "id": "publish-the-new-season",
    "title": "Publish the new season",
    "keywords": "season setup wizard create season publish import schedule",
    "body": "<p>Run the Season Setup Wizard without sandbox mode.</p><ol><li><strong>Season details</strong>: name, type (Summer/Fall) and year. The season key previews automatically, for example 2025-summer.</li><li><strong>Teams</strong>: Select All or pick individually.</li><li><strong>Schedule</strong>: upload the final CSV from the generator or balancer, or pull a schedule saved to Firebase. Check the preview table.</li><li><strong>Review</strong> the name, type, teams and game count, then click <strong>Create Season</strong>.</li></ol><p>The season is created in Firebase and is immediately visible on the site. Individual games can be edited later, but name, type and teams are hard to change after publishing, so confirm the schedule is final and the teams are correct. The site's current season, phase (regular, playoffs, offseason) and opening day are set separately in siteConfig/current.</p>"
   },
   {
    "id": "change-games-during-the-season",
    "title": "Change games during the season",
    "keywords": "schedule editor rainout reschedule field whatsapp in-season",
    "body": "<p>For rainouts and reschedules once the season is live (League Staff or Admin only; captains should ask league staff):</p><ol><li>Choose the active season.</li><li>Optionally filter to one team.</li><li>Click the game to load it.</li><li>Change the date, time or field. A live preview shows the message that will be generated.</li><li>Click <strong>Save &amp; Share</strong>, then <strong>Share to WhatsApp</strong> to post the change to the league chat.</li></ol><p>The Schedule tab in <a href=\"league-staff-admin.html\">League Staff Admin</a> does the same job.</p>"
   },
   {
    "id": "wipe-offseason-test-data",
    "title": "Reset rosters, draft or sandbox data",
    "keywords": "wipe cleanup reset test data offseason data tab admin content",
    "body": "<p>All cleanup is on the Offseason Data tab of <a href=\"admin-content.html\">Admin Content</a>. Each section shows current status (whether data exists, team or pick counts, last modified) so you know what is there, and every wipe asks for confirmation.</p><ul><li><strong>Wipe Offseason Roster Data</strong>: deletes offseasonRosters/current with its changelog and presence. Use to restart roster planning.</li><li><strong>Wipe Draft Data</strong>: deletes drafts/current. Use after a test or to redo a draft.</li><li><strong>Wipe Sandbox Seasons</strong>: deletes every season whose ID starts with sandbox-, including its games.</li></ul><p>None of these touch published seasons, player stats or game scores. The schedule generator, balancer and analyzer write nothing until you export. Only the Season Setup Wizard outside sandbox mode writes live data (seasons/{id}).</p>"
   }
  ]
 }
];
