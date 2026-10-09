// js/admin/catalog.js
// Every admin and staff tool, grouped by job, for the /admin/ sidebar and home.
// Hrefs are from the site root. Admin-only tools live in /admin/ (their old
// root files forward); captain tools stay at the root.
//
// role: who sees the link (hasRole; admins pass every check).

export const ADMIN_GROUPS = [
  { id: 'season', label: 'Season setup', icon: 'calendar-days', items: [
    ['admin/season-setup.html', 'Season setup wizard', 'Create a season: teams, schedule, publish', 'league-staff'],
    ['admin/league-staff.html', 'League staff admin', 'Edit games, banners and notifications', 'league-staff'],
    ['offseason.html', 'Offseason hub', 'Rosters, schedule and the draft', 'league-staff'],
    ['offseason-roster.html', 'Offseason rosters', 'Team assignments for next season', 'league-staff'],
    ['draft.html', 'Snake draft', 'Run the live draft', 'league-staff'],
    ['admin/playoff-eligibility.html', 'Playoff eligibility', 'Who has played enough games', 'league-staff'],
    ['playoffs.html', 'Playoff bracket', 'Set, lock and publish the bracket', 'league-staff']
  ] },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', items: [
    ['admin/schedule.html', 'Schedule hub', 'Build, tune, publish, and fix the schedule', 'league-staff'],
    ['admin/schedule-generator.html', 'Schedule generator', 'Build a balanced season schedule', 'league-staff'],
    ['admin/schedule-workshop.html', 'Schedule workshop', 'Balance, analyze and publish a schedule', 'league-staff'],
    ['admin/schedule-editor.html', 'Schedule editor', 'Edit one published game', 'league-staff'],
    ['admin/schedule-rework.html', 'Schedule rework', 'Rework a stretch after rainouts', 'league-staff']
  ] },
  { id: 'stats', label: 'Stats pipeline', icon: 'calculator', items: [
    ['admin/stats.html', 'Stats pipeline', 'Step by step: stats in, review, aggregate, badges', 'admin'],
    ['admin/submit-stats.html', 'Enter stats', 'Stats for any team and game', 'admin'],
    ['admin/game-tracker-review.html', 'Review tracked games', 'Check live-tracked games before they count', 'admin'],
    ['admin/aggregate-stats.html', 'Aggregate stats', 'Rebuild player totals (test, then production)', 'admin'],
    ['admin/badges.html', 'Badge calculator', 'Award player badges after aggregation', 'admin'],
    ['admin/mark-stats-submitted.html', 'Mark stats submitted', 'Clear the to-do for games with no stats', 'admin'],
    ['admin/player-stats-editor.html', 'Player stats editor', 'Fix one player’s game stats', 'admin'],
    ['admin/fix-bulk-stats.html', 'Bulk stats fixes', 'Repair stats across many games', 'admin'],
    ['admin/reconcile.html', 'Reconcile', 'Compare game stats with totals', 'admin'],
    ['admin/recover-game.html', 'Recover a game', 'Restore a deleted or broken game', 'admin'],
    ['admin/spray-intake.html', 'Spray chart intake', 'Hit locations for spray charts', 'admin'],
    ['bwar-explorer.html', 'bWAR explorer', 'Tune bWAR weights', 'league-staff'],
    ['admin/aggregate-stats-legacy.html', 'Legacy aggregator', 'Older seasons', 'admin'],
    ['admin/submit-stats-legacy.html', 'Standard stats form', 'Submit without hit types', 'admin'],
    ['admin/gc-data-cleaner.html', 'GameChanger cleaner', 'Tidy imported GameChanger data', 'admin']
  ] },
  { id: 'rosters', label: 'Rosters', icon: 'users', items: [
    ['admin/rosters.html', 'Roster assignment', 'Bulk-assign players to teams from a CSV', 'league-staff'],
    ['admin/roster-sync.html', 'Roster sync', 'Fix roster IDs and links', 'admin'],
    ['admin/captain-roster-edit.html', 'Edit any roster', 'Roster info for any team', 'admin'],
    ['admin/player-import.html', 'Player import', 'Add players in bulk', 'admin'],
    ['admin/move-player-docs.html', 'Move player docs', 'Merge or move a player’s records', 'admin'],
    ['admin/signup-card-export.html', 'Signup cards', 'Export signup cards', 'league-staff'],
    ['admin/card-export.html', 'Card export', 'Export player trading cards', 'league-staff']
  ] },
  { id: 'users', label: 'Users and roles', icon: 'shield', items: [
    ['admin/user-management.html', 'User management', 'Accounts, profiles and activity', 'admin'],
    ['admin/roles.html', 'Roles', 'Admin, league staff, captain and player roles', 'admin'],
    ['approve-links.html', 'Approve player links', 'Pending account-to-player requests', 'league-staff'],
    ['admin/link-players.html', 'Link players', 'Connect accounts to player records by hand', 'admin'],
    ['admin/view-as.html', 'View As', 'See the site as another user', 'admin']
  ] },
  { id: 'content', label: 'Content', icon: 'megaphone', items: [
    ['admin/content.html', 'Content admin', 'Previews, recaps, eulogies and game details', 'admin'],
    ['admin/commissioner-hub.html', 'Commissioner hub', 'League announcements', 'league-staff'],
    ['admin/countdown.html', 'Opening Day countdown', 'Countdown graphic for the group chat', 'league-staff'],
    ['admin/aceys.html', 'Aceys', 'Record award winners', 'league-staff'],
    ['rule-review.html', 'Rule proposals', 'Review proposed rule changes', 'league-staff'],
    ['captain-questionnaire-review.html', 'Captain questionnaires', 'Read captain responses', 'league-staff'],
    ['admin/features.html', 'Feature requests', 'What members have asked for', 'admin']
  ] },
  { id: 'tools', label: 'Games and tools', icon: 'gamepad', items: [
    ['admin/games.html', 'Daily games admin', 'Grid, Connections and the rest', 'admin'],
    ['admin/wordle.html', 'Wordle admin', 'Puzzles and the word list', 'admin'],
    ['admin/dfs.html', 'DFS generator', 'Weekly salaries and scoring', 'admin'],
    ['contributor.html', 'Contributor dashboard', 'Recaps, previews and photos', 'league-staff']
  ] }
];
