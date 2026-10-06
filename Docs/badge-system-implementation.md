# Mountainside Aces Badge System
## 2026 Season Implementation Plan

### Overview

The badge system gamifies individual player achievements throughout the season, giving players collectible recognition for milestones, streaks, and standout performances. Badges will be displayed on individual player pages and in a dedicated Trophy Case section on current-season pages.

### Data Requirements

Badges are calculated from game-by-game statistics collected starting in 2026:

| Stat | Used For |
|------|----------|
| Hits | Hit streaks, multi-hit games, season totals |
| Walks | Patience badges, two-way calculations |
| Runs | Scoring badges, milestone tracking |
| Innings Pitched | Pitching volume badges |
| Runs Allowed | Pitching performance badges |
| Opponent | Rivalry/matchup badges |

---

## Badge Specifications

### Display Rules

- **Tiered badges**: Show highest earned tier only
- **Non-tiered badges**: Show if earned
- **Hidden badges**: Not visible until unlocked (no progress shown)
- **Scope**: Lean towards regular season badges; separate playoff badges where noted

---

## Hitting Badges

### Hit Streak (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Hot Bat | Hit in 3 consecutive games | Bat with spark |
| 🥈 Silver | Hot Streak | Hit in 5 consecutive games | Bat with flame |
| 🥇 Gold | On Fire | Hit in 8+ consecutive games | Bat engulfed in fire |

**Calculation**: Track consecutive games with hits ≥ 1. Reset on game with 0 hits. Track max streak per player.

---

### Multi-Hit Games (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Seeing It Well | 3+ hits in a single game | Baseball with eyes |
| 🥈 Silver | Locked In | 4+ hits in a single game | Crosshairs |
| 🥇 Gold | Unstoppable | 5+ hits in a single game | Wrecking ball |

**Calculation**: Check max hits in any single game.

---

### Season Hits (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Contact Hitter | 15+ hits in a season | Single bat |
| 🥈 Silver | Hit Machine | 25+ hits in a season | Multiple bats |
| 🥇 Gold | Silver Slugger | 35+ hits in a season | Trophy bat |

**Calculation**: Sum of hits across all regular season games.

---

### Season Runs (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Run Scorer | 10+ runs in a season | Single cleat |
| 🥈 Silver | Rally Starter | 18+ runs in a season | Running figure |
| 🥇 Gold | Run Machine | 25+ runs in a season | Speed lines |

**Calculation**: Sum of runs across all regular season games.

---

### Season Walks (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Good Eye | 5+ walks in a season | Single eye |
| 🥈 Silver | Patient Hitter | 10+ walks in a season | Hourglass |
| 🥇 Gold | The Walken | 15+ walks in a season | Sunglasses (Christopher Walken ref) |

**Calculation**: Sum of walks across all regular season games.

---

### Big Games (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Big Day | 2+ runs scored in a single game | Small explosion |
| 🥈 Silver | Crooked Number | 3+ runs scored in a single game | Scoreboard |
| 🥇 Gold | One-Man Rally | 4+ runs scored in a single game | Fireworks |

**Calculation**: Check max runs in any single game.

---

### Non-Tiered Hitting Badges

| Badge Name | Requirement | Icon Suggestion |
|------------|-------------|-----------------|
| Iron Man | At least 1 hit in every regular season game | Chain links |
| Table Setter | More walks than games played | Place setting |

---

## Pitching Badges

### Scoreless Outings (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Clean Inning | 1 scoreless outing (min 1 IP) | Broom |
| 🥈 Silver | Shutdown | 3 scoreless outings | Stop sign |
| 🥇 Gold | Lockdown | 5+ scoreless outings | Padlock |

**Calculation**: Count games where runs_allowed = 0 AND innings_pitched ≥ 1.

---

### Season Innings (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Reliable Arm | 10+ innings pitched in a season | Single arm |
| 🥈 Silver | Workhorse | 20+ innings pitched in a season | Horse |
| 🥇 Gold | Ace | 30+ innings pitched in a season | Ace of spades |

**Calculation**: Sum of innings pitched across all regular season games.

**Note**: Most teams use 1-2 dedicated pitchers in slow pitch softball, so these thresholds reflect primary pitcher workloads.

---

### Low-Run Games (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Bend Don't Break | Allow 2 or fewer runs in a game (min 2 IP) | Flexible branch |
| 🥈 Silver | Quality Outing | 3 games allowing 2 or fewer runs (min 2 IP each) | Star |
| 🥇 Gold | Consistent Arm | 5+ games allowing 2 or fewer runs (min 2 IP each) | Shield |

**Calculation**: Count games where runs_allowed ≤ 2 AND innings_pitched ≥ 2.

---

### Non-Tiered Pitching Badges

| Badge Name | Requirement | Icon Suggestion |
|------------|-------------|-----------------|
| Ironclad | Allow 0 runs across 3+ innings in a single game | Fortress |
| Staff Ace | Lowest runs allowed per inning among qualifying pitchers (min 10 IP) | Crown |

---

## Two-Way Player Badges (Tiered)

| Tier | Badge Name | Requirement | Icon Suggestion |
|------|------------|-------------|-----------------|
| 🥉 Bronze | Dual Threat | 10+ hits AND 10+ innings pitched | Split circle |
| 🥈 Silver | Two-Way Player | 15+ hits AND 15+ innings pitched | Yin-yang |
| 🥇 Gold | Shohei | 20+ hits AND 20+ IP with 2+ scoreless outings | Japanese rising sun |

**Calculation**: Combine hitting and pitching season totals.

**Note**: These thresholds require being both a productive hitter and a primary pitcher—a rare combination.

---

## Rivalry/Opponent Badges

| Badge Name | Requirement | Icon Suggestion |
|------------|-------------|-----------------|
| Giant Slayer | Hold a top-3 team to their lowest run total of the season | Slingshot |
| Nemesis | Face the same opponent 3+ times while pitching | Mask |
| Kryptonite | Allow 2 or fewer runs against the same opponent twice | Green crystal |

**Calculation**: Requires tracking opponent per game and cross-referencing run totals.

---

## Milestone/Moment Badges

| Badge Name | Requirement | Icon Suggestion |
|------------|-------------|-----------------|
| Opening Day Hero | Get a hit in the first game of the season | Calendar |
| First Blood | Score the first run of the entire season | Drop of blood |
| Last Laugh | Score the final run of the regular season | Laughing face |
| Playoff Performer | Get a hit in every playoff game | Playoff bracket |
| Postseason Ace | Pitch a scoreless outing in the playoffs | Playoff trophy |

---

## Hidden Badges 🔒

These badges are not displayed until earned. No progress indicators shown.

| Badge Name | Requirement | Reveal Text |
|------------|-------------|-------------|
| Perfect 10 | Exactly 10 hits, 10 runs, and 10 walks in a season | "Perfectly balanced, as all things should be" |
| The Streak Lives | Hit in the final game to extend a hit streak to 6+ | "Kept it alive when it mattered most" |
| Invisible Man | 5+ walks with 0 hits in a game | "They couldn't find the zone" |
| Zero to Hero | Score 3+ runs after being hitless through half the season | "A tale of redemption" |
| The Architect | Score a run in 10 different games | "Building something special" |
| Quiet Storm | Lead the team in runs without leading in hits | "Doing damage without the headlines" |
| Closer | Pitch scoreless final innings in 3+ games | "Lights out" |
| Déjà Vu | Same stat line (hits/walks/runs) in 3 different games | "Haven't we been here before?" |
| Lucky 7 | Exactly 7 hits against the same opponent across all matchups | "They just can't figure you out" |

---

## Implementation Notes

### Data Sources (Confirmed 2025 Structure)

**Batting Data** — `playerStats/{playerId}/games/{gameDocId}`
```javascript
{
  gameId: "6-15-2025_team_vs_opponent",
  gameDocId: "2025-fall_6-15-2025_team_vs_opponent",
  playerId: "player_legacy_id",
  playerName: "John Smith",
  seasonId: "2025-fall",
  teamId: "team_name",
  gameDate: Timestamp,
  gameDateFormatted: "6/15/2025",
  opponent: "Opponent Team",
  isHome: true,
  gameType: "Regular" | "Playoff",
  isPlayoff: false,
  atBats: 4,
  hits: 2,
  runs: 1,
  walks: 1,
  // Additional fields (may be 0 for 2025 partial data)
  doubles: 0,
  triples: 0,
  homeRuns: 0,
  rbi: 0
}
```

**Pitching Data** — `pitchingStats/{playerId}/games/{gameDocId}`
```javascript
{
  gameId: "6-15-2025_team_vs_opponent",
  gameDocId: "2025-fall_6-15-2025_team_vs_opponent",
  playerId: "player_legacy_id",
  playerName: "John Smith",
  seasonId: "2025-fall",
  teamId: "team_name",
  gameDate: Timestamp,
  opponent: "Opponent Team",
  isHome: true,
  gameType: "Regular" | "Playoff",
  isPlayoff: false,
  inningsPitched: 3.0,
  runsAllowed: 2
}
```

### Badge Calculator Module

The `badge-calculator.js` module provides:

```javascript
import { BadgeCalculator, BADGE_DEFINITIONS } from './badge-calculator.js';

// Initialize with Firestore functions
const calculator = new BadgeCalculator(db, {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  testMode: false  // Set true to use playerBadges_test collection
});

// Calculate all badges for a season
const results = await calculator.calculateAllBadges('2025-fall');

// Save results to Firestore
await calculator.saveBadgeResults(results);
```

### Calculated Badge Storage

**Season Summary** — `playerBadges/season_{seasonId}`
```javascript
{
  seasonId: "2025-fall",
  calculatedAt: Timestamp,
  isPartialData: true,
  summary: {
    total: 47,
    gold: 12,
    silver: 18,
    bronze: 14,
    hidden: 3
  },
  leaderboard: [
    { playerId, playerName, teamId, badgeCount, gold, silver, bronze },
    // ... top 20 players
  ]
}
```

**Player Badges** — `playerBadges/{seasonId}_{playerId}`
```javascript
{
  playerId: "john_smith",
  playerName: "John Smith",
  teamId: "crushers",
  seasonId: "2025-fall",
  earned: {
    hitStreak: {
      badgeId: "hitStreak",
      tier: "gold",
      name: "On Fire",
      icon: "🔥",
      category: "hitting",
      value: 9,
      description: "Hit in 8+ consecutive games"
    },
    seasonHits: {
      badgeId: "seasonHits",
      tier: "silver",
      name: "Hit Machine",
      icon: "🏆",
      value: 28
    },
    // ... other earned badges
  },
  progress: {
    hitStreak: { current: 3, max: 9 }
  },
  calculatedAt: "2025-01-06T..."
}
```

### Calculation Triggers

Badges should be recalculated:
1. After each game's stats are entered
2. On-demand via admin tool for corrections
3. End-of-season final calculation for milestone badges

### Display Locations

1. **Player Page** (`player.html`)
   - Badge showcase section below stats
   - Show earned badges with icons
   - Tiered badges show highest tier only

2. **Trophy Case** (`current-season-team.html` or new `trophy-case.html`)
   - Team-wide badge summary
   - League-wide badge leaders
   - Display format TBD

3. **Badge Detail Modal**
   - Click badge to see full requirements
   - Show progress toward next tier (for tiered badges)
   - Hidden badges show "???" until earned

### Visual Design

- Badge icons: ~40px circular or shield-shaped
- Tier indicators: Bronze/Silver/Gold border or background tint
- Consistent with Mountainside Aces style guide (forest green/teal palette)
- Subtle animation on earn (confetti, glow, etc.)

---

## Future Considerations

- **Career badges**: Multi-season achievements (e.g., "100 Career Hits")
- **Team badges**: Collective achievements (e.g., "Every starter got a hit")
- **Leaderboards**: Most badges earned, rarest badges
- **Badge notifications**: Push notification when badge earned
- **Social sharing**: Share badge to social media
- **Historical backfill**: If game-by-game data becomes available for past seasons

---

## Open Questions

- [ ] Final icon designs and visual treatment
- [ ] Trophy Case page layout and organization
- [ ] Badge notification implementation (in-app vs push)
- [ ] Admin tools for badge management/corrections
- [ ] Threshold adjustments after seeing 2026 data

---

*Document created: December 2024*
*Target implementation: 2026 Season*
