# Mountainside Aces - Feature Gaps & Opportunities

*Last Updated: January 14, 2026*

---

## 📋 Table of Contents

1. [Social & Community Features](#1-social--community-features)
2. [Game Day Experience](#2-game-day-experience)
3. [Statistics & Analytics](#3-statistics--analytics)
4. [Playoff & Championship](#4-playoff--championship)
5. [Player Experience & Engagement](#5-player-experience--engagement)
6. [Team Management](#6-team-management)
7. [Fan & Family Experience](#7-fan--family-experience)
8. [Administrative & League Operations](#8-administrative--league-operations)
9. [Page Design Improvements](#-page-design-improvements)
10. [Mobile-Specific Gaps](#-mobile-specific-gaps)
11. [Notification Opportunities](#-notification-opportunities)
12. [Quick Wins](#-quick-wins-low-effort-high-impact)
13. [Recommended Priority Features](#-recommended-priority-new-features)

---

## 1. Social & Community Features

### Missing

| Feature | Description |
|---------|-------------|
| Activity Feed / Timeline | No central place to see recent league activity (games played, milestones hit, photos uploaded, etc.) |
| Comments/Reactions | Players can't comment on games, photos, or achievements |
| Player Shoutouts | No way for teammates to give kudos after a great game |
| Team Chat/Messaging | No in-app communication between team members |
| Social Sharing Cards | Auto-generated shareable images for milestones, game results, awards |

### Potential New Pages

- `activity.html` - League activity feed
- `shoutouts.html` - Weekly/game-based player recognition

---

## 2. Game Day Experience

### Missing

| Feature | Description |
|---------|-------------|
| Live Scoreboard Widget | Embeddable component showing all games in progress |
| Game Recap Page (per game) | Post-game summary with box score, highlights, key plays |
| Play-by-Play Log | Game Tracker exists but no persistent game log view for spectators |
| Weather Integration on Game Pages | OpenWeatherMap data exists but not prominently displayed |
| Field Directions/Maps | No integration with game locations (address → map link) |

### Completed

| Feature | Status | Notes |
|---------|--------|-------|
| vsOpponent Stats on Key Players | ✅ **LIVE** | Shows season & career batting avg vs opponent (2026+ data) |

### Future Enhancements (game-preview & weekend-preview)

| Enhancement | Page | Effort | Notes |
|-------------|------|--------|-------|
| "Last Meeting" mini box score | game-preview | Medium | Query last game between teams, show score & date |
| Hot streak badge (🔥) | Both | Medium | Query last 3 games, show if 3+ game hit streak |
| Series record on game cards | weekend-preview | Low | "White leads series 12-8 all-time" |
| "Game of the Week" highlight | weekend-preview | Low | Feature one marquee matchup |
| Home record badge | weekend-preview | Low | "4-0 at home" indicator |

### Improvements

- `game-preview.html` could show field map/directions
- Add "Watch Live" indicator when a game is being tracked in real-time

---

## 3. Statistics & Analytics

### Missing

| Feature | Description |
|---------|-------------|
| Stat Trends Over Time | Individual player trend charts (batting avg by month, hot/cold streaks) |
| Advanced Metrics Dashboard | ACES BPI/WAR explained with visualizations |
| Splits Page | Stats vs left/right, home/away, by opponent, by month |
| Spray Charts | Visual representation of where hits go (if data is collected) |
| League-Wide Trends | Is offense up this season? Average runs per game over time? |
| Personal Records Section | On player page, show career highs (most hits in a game, longest streak, etc.) |

### Potential New Pages

- `splits.html` - Detailed statistical splits
- `trends.html` - League-wide statistical trends

---

## 4. Playoff & Championship

### Missing

| Feature | Description |
|---------|-------------|
| Playoff History Timeline | Visual history of all playoff brackets/champions |
| Championship Trophy Case | Dedicated page celebrating past champions with photos |
| Playoff Predictions Leaderboard | If users can create brackets, track who's most accurate |
| Elimination Tracker | Real-time "Eliminated" / "Clinched" badges during playoff week |

### Improvements

- `playoffs.html` could have a "Past Champions" quick-link section
- Add confetti animation when viewing the champion's page after they win

---

## 5. Player Experience & Engagement

### Missing

| Feature | Description | Status |
|---------|-------------|--------|
| Onboarding Wizard | New users don't have guided setup flow | ✅ **LIVE** (`mountainside-aces-signup-guide.html`) |
| Player of the Week/Month | Automated recognition based on stats | ❌ |
| Achievement Unlocked Notifications | Pop-up when earning a badge | ❌ |
| Personal Dashboard | Personalized homepage showing YOUR upcoming games, YOUR stats, YOUR team | ✅ **LIVE** (`my-dashboard.html`) |
| "My Season" Summary | End-of-season personalized recap (like Spotify Wrapped) | ✅ **LIVE** (`aces-wrapped.html`) |

### New Pages

- ~~`my-dashboard.html` - Personalized home for logged-in users~~ ✅ **COMPLETE**
- ~~`my-season-recap.html` - Personal season summary generator~~ ✅ **COMPLETE** (as `aces-wrapped.html`)
- ~~Onboarding guide~~ ✅ **COMPLETE** (as `mountainside-aces-signup-guide.html`)

---

## ~~6. Team Management~~ ✅ NOT NEEDED

*This section has been removed - features either already exist or are not needed for this league.*

| Feature | Status | Notes |
|---------|--------|-------|
| Team Calendar Export | ✅ **LIVE** | Available in `current-season.html` |
| Carpool Coordination | ❌ Not needed | League handles externally |
| Equipment/Responsibilities Tracker | ❌ Not needed | League handles externally |
| Post-Game Check-in | ❌ Not needed | RSVP system sufficient |
| Practice Scheduling | ❌ Not needed | No formal practices |

---

## 7. Fan & Family Experience

### Missing

| Feature | Description |
|---------|-------------|
| Fan Mode Dashboard | Simplified view for family members who just want to see their person's games/stats |
| Game Alerts Subscription | Subscribe to alerts for specific games without full account |
| Public Game Schedule Widget | Embeddable schedule for team websites/social |
| Live Score Text Alerts | SMS notifications (beyond push) |

### Improvements

- `profile-fan.html` exists but could be the hub for fan-specific features

---

## 8. Administrative & League Operations

### Status

| Feature | Status | Notes |
|---------|--------|-------|
| Umpire Schedule/Assignment | ❌ Not needed | Handled offline |
| Rain Delay/Cancellation Workflow | ❌ Not needed | Handled via `league-schedule-editor.html` |
| Season Setup Wizard | ✅ **LIVE** | `season-setup-wizard.html` - 5-step guided setup |
| Stats Import Tool | ✅ **LIVE** | CSV bulk upload in `submit-stats.html` + game-specific in `admin-submit-stats.html` |
| Audit Log | ✅ **LIVE** | All submissions track `submittedBy`, `submittedByName`, `lastModified` |

---

## 🎨 Page Design Improvements

### Homepage (`index.html`)

| Issue | Suggestion |
|-------|------------|
| ~~News banner requires scrolling to read~~ | ✅ Pause-on-hover exists |
| ~~No personalization for logged-in users~~ | ✅ My Aces section + My Dashboard page |
| Cards are generic | Add live data to cards (e.g., "🏆 Awards - 47 winners this season") |
| ~~No quick stats summary~~ | ✅ "This Week" module added |

### Player Page (`player.html`)

| Issue | Suggestion |
|-------|------------|
| Photo upload button hidden until login | Show grayed-out placeholder with "Sign in to add photo" |
| No quick navigation between seasons | Add season tabs or dropdown near top |
| Badge section not visible | Placeholder for 2026 badges exists but no preview/teaser |
| No "Similar Players" recommendation | Add "Players with similar stats" links |
| Career high-water marks not highlighted | Add "Career Bests" mini-section |

### Team Page (`team.html`)

| Issue | Suggestion |
|-------|------------|
| No team record/standings context | Add "3rd place • 2 GB" badge |
| Roster photos not prominent | Add photo grid view option |
| No "Next Game" card | Add prominent upcoming game with countdown |
| No team history/championships | Add "🏆 x2 Champions" badge if applicable |

### Weekend Preview (`weekend-preview.html`)

| Issue | Suggestion |
|-------|------------|
| Game cards could be more visual | Add team logos/colors to card headers |
| Weather not always visible | Make weather badge more prominent |
| No "Game of the Week" highlight | Feature one marquee matchup |
| Betting odds exist but buried | Add visual odds comparison if relevant |

### Roster Management (`roster-management.html`)

| Issue | Suggestion |
|-------|------------|
| Dense interface | Add collapsible sections |
| RSVP status requires scan | Add summary bar: "8 Yes • 2 Maybe • 3 No Response" |
| Drag-and-drop can be finicky on mobile | Add number input for batting order position |
| No "Last game's lineup" quick-load | Add "Use previous lineup" button |

### Profile Page (`profile.html`)

| Issue | Suggestion |
|-------|------------|
| Very long page | Add tabs or accordion sections |
| Notification settings buried | Move to more prominent position |
| No profile completeness indicator | Add "Profile 60% complete - Add your jersey number" |
| No quick-link to own player page | Add "View My Stats →" button |

### Playoffs Page (`playoffs.html`)

| Issue | Suggestion |
|-------|------------|
| Dark theme inconsistent with site | Option to match main site theme |
| No mobile-optimized bracket view | Add vertical/list view for mobile |
| No game links from bracket | Clicking matchup should link to game preview/recap |
| No historical brackets | Add "View past playoff brackets" link |

---

## 📱 Mobile-Specific Gaps

| Gap | Suggestion |
|-----|------------|
| No bottom navigation bar | Add fixed bottom nav for key actions on mobile |
| Pull-to-refresh not implemented | Add on schedule/stats pages |
| No "Add to Home Screen" prompt | Show PWA install banner |
| Game tracker keyboard overlap | Input fields obscured on some devices |
| Horizontal scroll tables hard to use | Add "freeze first column" on stat tables |

---

## 🔔 Notification Opportunities

Beyond what's planned:

| Notification Type | Description |
|-------------------|-------------|
| Streak alerts | "John has hit in 4 straight games!" |
| Close game alerts | "Tied game in the 7th!" |
| RSVP reminders | "3 teammates haven't responded" |
| Birthday alerts | Team notifications for player birthdays |
| Season countdown | "Season starts in 7 days!" |

---

## 📊 Quick Wins (Low Effort, High Impact)

| Quick Win | Status |
|-----------|--------|
| Add "Export to Calendar" links on schedule pages | ✅ **LIVE** |
| Show team record in header on team pages | ❌ |
| Add "Copy shareable link" button on player/game pages | ❌ |
| Implement dark mode toggle | ❌ |
| Add search shortcut (CMD+K / Ctrl+K) for power users | ❌ |
| Add loading skeletons instead of just spinners | ❌ |
| Add "Back to Top" floating button on long pages | ❌ |
| Add "Last updated" timestamp on stats pages | ❌ |

---

## 🎯 Recommended Priority New Features

| Priority | Feature | Why | Status |
|----------|---------|-----|--------|
| 1 | **Personal Dashboard** | Logged-in users need a personalized home | ✅ **LIVE** |
| 2 | Calendar Export | Most-requested feature for rec leagues | ✅ **LIVE** |
| 3 | Activity Feed | Drives engagement and return visits | ❌ |
| 4 | Game Recaps | Commemorates games with box scores | ❌ |
| 5 | Player Trends/Splits | Power users love deep stats | ❌ |
| 6 | Game/Weekend Preview Enhancements | Better matchup context and insights | ✅ **LIVE** (vsOpponent) |

---

## ✅ Recently Completed

| Feature | Completion Date | Notes |
|---------|-----------------|-------|
| My Dashboard (`my-dashboard.html`) | Jan 14, 2026 | Personal hub with games, RSVPs, stats, action items |
| Captain Action Items | Jan 14, 2026 | Submit scores/stats reminders on dashboard |
| Dashboard Navigation | Jan 14, 2026 | Added to nav menu, index.html, profile.html |
| Aces Shop Integration | Jan 14, 2026 | Added to nav and My Aces section |
| statsSubmitted Flag | Jan 14, 2026 | Tracks which games have stats submitted |
| Season Setup Wizard | Jan 14, 2026 | 5-step wizard for creating new seasons |
| Game Preview vsOpponent Stats | Jan 14, 2026 | Key players show season & career stats vs opponent (activates with 2026+ data) |
| This Week Module | Jan 14, 2026 | Homepage widget showing upcoming games for the week |
| Aces Wrapped (`aces-wrapped.html`) | Previously | Season recap like Spotify Wrapped |
| Sign-Up Guide (`mountainside-aces-signup-guide.html`) | Previously | Onboarding wizard for new users |
| Calendar Export | Previously | Add to Google/Apple Calendar in `current-season.html` |
| Stats Bulk Import | Previously | CSV upload in `submit-stats.html` |
| League Schedule Editor | Previously | Rain delays, cancellations, schedule changes |
| Audit Trail | Previously | All submissions track who/when |

---

*This document should be updated as features are completed or priorities change.*
