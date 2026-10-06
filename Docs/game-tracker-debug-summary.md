# Game Tracker Debug Session Summary - Feb 3, 2026

## Session Overview
Debugging game tracker reset/sync issues, adding features for viewers, and fixing metadata persistence problems.

## Issues Fixed This Session

### 1. Presence Indicator Not Showing Names
- **Problem**: Blue bar showed but no tracker/viewer names
- **Fix**: Added `role` parameter to `updatePresence()` function
- **File**: `firebase-game-sync.js`

### 2. Game Reset Not Clearing Metadata
- **Problem**: When clearing game, metadata (inning, score) persisted
- **Fix**: 
  - `clearGameState()` now fully replaces document (was using merge:true)
  - Added `clearGameMetadata()` function
  - Call both when user chooses "start fresh"
- **File**: `firebase-game-sync.js`, `game-tracker.html`

### 3. Stale Metadata After Previous Clear
- **Problem**: Loading game with `cleared: true` gameState but stale metadata scores
- **Fix**: Added early metadata check in `startGame()` to detect and clear stale data
- **File**: `game-tracker.html` (around line 1195-1210)

### 4. Over-Aggressive Reset During Normal Gameplay  
- **Problem**: Game kept resetting scores/pitchers during play
- **Root Cause**: `clearedAt` flag persisted and triggered reset logic
- **Fix**: 
  - Removed `clearedAt` from metadata (it persists and causes issues)
  - Simplified cleared detection - just log it, don't auto-reset
  - Removed `!data.clearedAt` check that blocked pitcher syncing
- **File**: `firebase-game-sync.js`, `game-tracker.html`

### 5. Opponent Score Being Overwritten to 0
- **Problem**: When White saves, it was overwriting Orange's score
- **Fix**: Only save OUR team's score in `saveGameState()`, not both
- **File**: `game-tracker.html` (line ~199-209)

### 6. Spectator Controls Not Protected
- **Problem**: Viewers could click "Back at Bat" and advance inning buttons
- **Fix**: Wrapped all game-modifying buttons in `userCanTrack` checks
- **File**: `game-tracker.html`

## Features Added This Session

### 1. Merged Play-by-Play (Both Teams)
- Shows plays from both teams chronologically
- Team color coding with emojis (🟠 Orange, ⚪ White, etc.)
- Inning formatted as "Top 1st", "Bot 2nd", etc.
- Left border accent (green = your team, gray = opponent)
- **File**: `game-tracker.html` - `MergedPlayByPlay` component (~line 2761)

### 2. ReadOnlyDiamond Component (NEW - NEEDS DEBUG)
- **Purpose**: Show opponent's base runners when they're batting
- **Location**: `game-tracker.html` (~line 2956)
- **Usage**: In opponent batting section (~line 3280)
- **Shows**: Diamond, base runners, outs indicator
- **Condition**: Only shows if `opponentGameState?.isTracking` is true

### 3. Viewer Experience Updates
- Viewers see diamond when your team bats
- Viewers see ReadOnlyDiamond when opponent bats (IF opponent tracking)
- Viewers see score without +/- buttons
- "Waiting for tracker..." messages instead of action buttons

## Current Bug to Debug

**ReadOnlyDiamond not showing in spectator mode**

Possible issues to check:
1. Is `opponentGameState` being populated correctly?
2. Is `opponentGameState.isTracking` returning true when it should?
3. Is the condition `!gameState.isYourTeamBatting && !inningOver` being met?
4. Console logs to add for debugging

## Key Code Locations

### game-tracker.html
- `opponentGameState` state: line ~543
- `opponentGameState` mapping (subscription): line ~840-850
- `ReadOnlyDiamond` component: line ~2956
- Opponent batting section with ReadOnlyDiamond: line ~3269-3340
- `userCanTrack` state: line ~545
- `spectatorMode` state: line ~550

### firebase-game-sync.js
- `canUserTrackTeam()`: line ~232 (includes scorekeeper role)
- `clearGameState()`: line ~336
- `clearGameMetadata()`: line ~368
- `updatePresence()`: line ~185 (has role parameter)

## State Variables to Check
```javascript
// In console, check:
opponentGameState  // Should have: bases, outs, isTracking, playHistory
opponentGameState?.isTracking  // Should be true if opponent has plays
gameState.isYourTeamBatting  // Should be false when opponent batting
userCanTrack  // Should be false in spectator mode
spectatorMode  // Should be true when toggled
```

## Test Scenarios
1. Login as White captain, toggle spectator mode
2. Have Orange actively tracking with plays recorded
3. When Orange is batting, should see ReadOnlyDiamond
4. Check console for `opponentGameState` values

## Files Modified This Session
1. `game-tracker.html` - Major updates
2. `firebase-game-sync.js` - Presence role, clear functions, metadata fixes

## Git Commands for Deployment
```bash
git add game-tracker.html firebase-game-sync.js
git commit -m "Add ReadOnlyDiamond and viewer experience improvements"
git push
```
