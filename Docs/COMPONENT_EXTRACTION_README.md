# Roster Management Components - Extraction Documentation

## Overview

The monolithic `roster-management.html` has been refactored into three independent, reusable React components. This enables:

1. **Desktop**: Continue using all three components in a tabbed interface (no changes to user experience)
2. **Mobile Web**: Responsive improvements with conditional rendering
3. **Mobile App**: Separate screens/views with native navigation

---

## Extracted Components

### 1. RSVPSection.jsx
**Purpose**: Manage player RSVPs for upcoming games

**Props**:
```javascript
{
  games: Array,              // Array of game objects
  players: Array,            // Array of player objects
  rsvps: Object,             // RSVP state (playerId-gameId keys)
  onRSVPChange: Function,    // Callback when RSVP changes
  currentUserId: String,     // Current user's ID
  userProfile: Object,       // User profile data
  isCaptain: Boolean,        // Whether user is captain
  isOnline: Boolean          // Connection status (default: true)
}
```

**Features**:
- Horizontal scrolling table for multiple games
- Click-to-cycle RSVP status (none → yes → maybe → no)
- Captains can edit all RSVPs, players can only edit their own
- Visual distinction for current user's row
- Offline indicator when not connected

---

### 2. BattingOrderSection.jsx
**Purpose**: Set batting order via drag-and-drop

**Props**:
```javascript
{
  selectedGame: String,           // Current game ID
  battingOrder: Array,            // Array of player objects (nulls for empty slots)
  availablePlayers: Array,        // Pool of available players
  seasonConfig: Object,           // Season configuration
  onBattingOrderChange: Function, // Callback when order changes
  onPrint: Function,              // Optional print handler
  isCaptain: Boolean,             // Edit permissions
  draggedPlayer: Object,          // Current dragged player
  onDragStart: Function,          // Drag handlers
  onDragEnd: Function,
  dropTarget: Object,
  onDragEnter: Function,
  onDragLeave: Function,
  onDragOver: Function,
  onDrop: Function,
  PlayerCard: Component,          // PlayerCard component reference
  isOnline: Boolean               // Connection status
}
```

**Features**:
- Drag-and-drop from available players pool
- Visual indicators for empty slots
- Numbered positions (1-12 typically)
- Print button for lineup
- Filters out already-assigned players

---

### 3. FieldingPositionsSection.jsx
**Purpose**: Assign defensive positions per inning with bench management

**Props**:
```javascript
{
  selectedGame: String,                 // Current game ID
  fieldingPositions: Object,            // Nested: {inning: {position: player}}
  benchPlayers: Object,                 // Nested: {inning: [players]}
  availablePlayers: Array,              // Pool of available players
  seasonConfig: Object,                 // Season configuration
  onFieldingPositionsChange: Function,  // Callback for fielding changes
  onBenchPlayersChange: Function,       // Callback for bench changes
  onCopyFromPreviousInning: Function,   // Copy handler
  onPrint: Function,                    // Optional print handler
  isCaptain: Boolean,                   // Edit permissions
  catcherDisabled: Boolean,             // Whether catcher is disabled
  draggedPlayer: Object,                // Drag-and-drop state
  onDragStart: Function,
  onDragEnd: Function,
  dropTarget: Object,
  onDragEnter: Function,
  onDragLeave: Function,
  onDragOver: Function,
  onDrop: Function,
  PlayerCard: Component,                // PlayerCard component
  isOnline: Boolean                     // Connection status
}
```

**Features**:
- 2D grid: positions × innings
- Separate bench section
- "Copy from previous inning" buttons
- Catcher position can be disabled based on player count
- Validation to prevent conflicting assignments
- Horizontal scroll for full grid

---

## Shared Utilities

### DragDropProvider.jsx
**Purpose**: Centralized drag-and-drop state management

```javascript
import { DragDropProvider, useDragDrop } from './DragDropProvider.jsx';

function RosterManager() {
  return (
    <DragDropProvider isCaptain={true}>
      <BattingOrderSection {...props} />
      <FieldingPositionsSection {...props} />
    </DragDropProvider>
  );
}
```

**Provides**:
- `draggedPlayer`: Currently dragged player object
- `dropTarget`: Current drop target metadata
- `handleDragStart`, `handleDragEnd`, `handleDragOver`, etc.

---

### platform-utils.js
**Purpose**: Detect device type, screen size, app context

```javascript
import { 
  getPlatformContext, 
  usePlatformContext,
  getFieldingViewMode,
  BREAKPOINTS 
} from './platform-utils.js';

const platform = getPlatformContext();
// {
//   isMobileApp: false,
//   isMobileWeb: true,
//   isTablet: false,
//   isDesktop: false,
//   width: 375,
//   isOnline: true,
//   isTouchDevice: true
// }

// Reactive hook
function MyComponent() {
  const platform = usePlatformContext();
  
  return platform.isMobileWeb ? (
    <MobileLayout />
  ) : (
    <DesktopLayout />
  );
}
```

**Functions**:
- `getPlatformContext()`: One-time detection
- `usePlatformContext()`: React hook with resize listener
- `getFieldingViewMode(width)`: Returns 'inning-by-inning' | 'condensed-grid' | 'full-grid'
- `getRecommendedInningColumns(width)`: Returns 1, 3, or 7
- `prefersReducedMotion()`: Accessibility check
- `getSafeAreaInsets()`: For notched devices

---

## Integration Examples

### Desktop (Existing Tabbed Interface)

```javascript
// roster-management.html (modified)

import { RSVPSection } from './RSVPSection.jsx';
import { BattingOrderSection } from './BattingOrderSection.jsx';
import { FieldingPositionsSection } from './FieldingPositionsSection.jsx';
import { DragDropProvider } from './DragDropProvider.jsx';

function RosterManagement() {
  const [activeTab, setActiveTab] = useState('rsvp');
  // ... existing state ...
  
  return (
    <div>
      {/* Tab Navigation */}
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      
      {/* RSVP Tab */}
      {activeTab === 'rsvp' && (
        <RSVPSection
          games={games}
          players={players}
          rsvps={rsvps}
          onRSVPChange={handleRSVPChange}
          currentUserId={currentUser.uid}
          userProfile={userProfile}
          isCaptain={isCaptain}
        />
      )}
      
      {/* Batting/Fielding Tabs */}
      {activeTab === 'lineup' && (
        <DragDropProvider isCaptain={isCaptain}>
          <BattingOrderSection {...battingProps} />
          <FieldingPositionsSection {...fieldingProps} />
        </DragDropProvider>
      )}
    </div>
  );
}
```

---

### Mobile Web (Responsive)

```javascript
import { usePlatformContext } from './platform-utils.js';

function RosterManagement() {
  const platform = usePlatformContext();
  
  if (platform.isMobileWeb) {
    return (
      <>
        {/* Stack vertically, make RSVPs card-based */}
        <RSVPSection {...props} />
        
        {/* Replace drag with buttons on mobile */}
        <MobileBattingOrder {...props} />
        
        {/* Show inning-by-inning carousel */}
        <MobileFieldingView {...props} />
      </>
    );
  }
  
  // Desktop: original tabbed interface
  return <TabbedInterface />;
}
```

---

### Mobile App (Separate Screens)

```javascript
// App.jsx with React Navigation or similar

import { getPlatformContext } from './platform-utils.js';

const platform = getPlatformContext();
const view = new URLSearchParams(window.location.search).get('view');

if (platform.isMobileApp) {
  // Route to single view
  switch(view) {
    case 'rsvp':
      return <RSVPSection {...props} />;
    case 'batting':
      return <BattingOrderSection {...props} />;
    case 'fielding':
      return <FieldingPositionsSection {...props} />;
    default:
      return <ViewSelector />; // Let user choose which section
  }
}

// Deep linking examples:
// aces://roster/rsvp?gameId=123
// aces://roster/batting?gameId=123
// aces://roster/fielding?gameId=123
```

---

## Migration Path

### Phase 1: Extract Components ✅ COMPLETE
- [x] Create RSVPSection.jsx
- [x] Create BattingOrderSection.jsx
- [x] Create FieldingPositionsSection.jsx
- [x] Create DragDropProvider.jsx
- [x] Create platform-utils.js

### Phase 2: Update roster-management.html
- [ ] Import new components
- [ ] Replace inline JSX with component imports
- [ ] Test that desktop experience is unchanged
- [ ] Verify all drag-and-drop still works

### Phase 3: Mobile Web Enhancements
- [ ] Create mobile-specific versions of components
- [ ] Implement responsive breakpoints
- [ ] Add touch-friendly controls for batting order
- [ ] Build inning-by-inning carousel for fielding

### Phase 4: Mobile App Preparation
- [ ] Add routing logic for single-view mode
- [ ] Test with mock ReactNativeWebView
- [ ] Implement deep linking
- [ ] Test offline functionality per component

---

## Data Flow

### RSVP Changes
```
User clicks RSVP button
  ↓
RSVPSection calls onRSVPChange({playerId, gameId, status, playerName})
  ↓
Parent component updates state
  ↓
If offline: Queue via offline-queue.js
If online: Save to Firebase via updateRSVP()
```

### Batting Order Changes
```
User drags player to position
  ↓
BattingOrderSection updates local battingOrder array
  ↓
Calls onBattingOrderChange(newArray)
  ↓
Parent calls saveLineupData('batting', data)
  ↓
Queue offline or save to Firebase
```

### Fielding Position Changes
```
User drags player to position cell
  ↓
FieldingPositionsSection updates fieldingPositions object
  ↓
Calls onFieldingPositionsChange(newPositions)
  ↓
Parent calls saveLineupData('fielding', data, inning)
  ↓
Queue offline or save to Firebase
```

---

## Testing Checklist

### Desktop
- [ ] All three sections render correctly in tabs
- [ ] Drag-and-drop works for batting order
- [ ] Drag-and-drop works for fielding grid
- [ ] RSVP cycling works
- [ ] Print buttons work
- [ ] Offline queue integration works

### Mobile Web
- [ ] Components render responsively < 768px
- [ ] Tables scroll horizontally
- [ ] Touch drag-and-drop works
- [ ] No layout breaking on small screens

### Mobile App
- [ ] Single-view mode works via URL params
- [ ] Components function in isolation
- [ ] Deep linking works
- [ ] Native navigation integrates

---

## File Structure

```
/roster-components/
├── RSVPSection.jsx                 # RSVP management
├── BattingOrderSection.jsx         # Batting order
├── FieldingPositionsSection.jsx    # Defensive positions
├── DragDropProvider.jsx            # Shared drag-and-drop state
├── platform-utils.js               # Platform detection
└── README.md                       # This file

/existing-files/ (unchanged)
├── roster-management.html          # Will import components
├── firebase-roster.js              # Backend functions
├── offline-queue.js                # Offline support
└── mobile-enhancements.css         # Mobile styles
```

---

## Benefits of This Architecture

1. **Reusability**: Same components work across desktop, mobile web, and mobile app
2. **Testability**: Each component can be tested in isolation
3. **Maintainability**: Changes to one section don't affect others
4. **Flexibility**: Easy to create platform-specific variants
5. **Performance**: Can lazy-load components as needed
6. **Offline Support**: Consistent offline behavior across all sections

---

## Next Steps

1. **Integrate into roster-management.html**: Replace inline JSX with imports
2. **Test desktop thoroughly**: Ensure no regression
3. **Build mobile variants**: Create InningByInningView, MobileBattingOrder
4. **Add routing logic**: URL param support for mobile app
5. **Document component APIs**: Add PropTypes or TypeScript definitions

---

## Questions?

See the individual component files for detailed implementation notes and inline comments.
