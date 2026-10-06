# Component Extraction - Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ROSTER-MANAGEMENT.HTML                          │
│                     (Main Container/Router)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
    ┌───────────────────┐ ┌────────────────┐ ┌──────────────────┐
    │  RSVPSection.jsx  │ │BattingOrder    │ │FieldingPositions │
    │                   │ │Section.jsx     │ │Section.jsx       │
    │  • Game RSVPs     │ │                │ │                  │
    │  • Status cycling │ │• Drag-and-drop │ │• 2D grid         │
    │  • Captain perms  │ │• Player pool   │ │• Bench spots     │
    └───────────────────┘ │• Numbered list │ │• Copy innings    │
                          └────────────────┘ └──────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌──────────────────────┐      ┌──────────────────────┐
        │  DragDropProvider    │      │   PlayerCard.jsx     │
        │                      │      │                      │
        │  • Shared drag state │      │  • Normal size       │
        │  • Drop targets      │      │  • Small size        │
        │  • Event handlers    │      │  • Mobile variant    │
        └──────────────────────┘      │  • Compact variant   │
                                      └──────────────────────┘
                                                │
                                                ▼
                                    ┌──────────────────────┐
                                    │  platform-utils.js   │
                                    │                      │
                                    │  • Screen detection  │
                                    │  • Device type       │
                                    │  • Breakpoints       │
                                    │  • Online status     │
                                    └──────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌──────────┐    ┌──────────┐   ┌──────────┐
            │   RSVP   │    │ Batting  │   │ Fielding │
            │  Button  │    │  Drag    │   │   Drag   │
            └──────────┘    └──────────┘   └──────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
                        ┌──────────────────────┐
                        │   Component State    │
                        │   Update (local)     │
                        └──────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │   Callback to Parent │
                        │   (onRSVPChange,     │
                        │    onBattingOrder,   │
                        │    onFielding)       │
                        └──────────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                Online? │                       │ Offline?
                    Yes │                       │ No
                        ▼                       ▼
            ┌──────────────────┐    ┌──────────────────┐
            │  Firebase Save   │    │  Offline Queue   │
            │  (updateRSVP,    │    │  (queue action)  │
            │   saveBatting,   │    │                  │
            │   saveFielding)  │    │  → Sync later    │
            └──────────────────┘    └──────────────────┘
```

---

## Platform-Specific Rendering

```
┌─────────────────────────────────────────────────────────────────────┐
│                    platform-utils.js detects:                       │
│                                                                     │
│  • Screen width (375px, 768px, 1024px, 1280px+)                   │
│  • Device type (mobile app, mobile web, tablet, desktop)          │
│  • Touch capability                                                │
│  • Online status                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐           ┌──────────────┐          ┌──────────────┐
│   DESKTOP    │           │  MOBILE WEB  │          │  MOBILE APP  │
│  (≥1024px)   │           │  (<768px)    │          │ (React Native)│
└──────────────┘           └──────────────┘          └──────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌──────────────┐           ┌──────────────┐          ┌──────────────┐
│ Tabbed UI    │           │ Stacked UI   │          │ Separate     │
│ with all 3   │           │ Responsive   │          │ Screens with │
│ sections     │           │ components   │          │ Navigation   │
│              │           │              │          │              │
│ • Full grid  │           │ • Cards      │          │ • Native nav │
│ • Drag/drop  │           │ • Simplified │          │ • Deep links │
│ • Horizontal │           │ • Touch opts │          │ • URL params │
│   scroll     │           │ • Inning     │          │              │
│              │           │   carousel   │          │              │
└──────────────┘           └──────────────┘          └──────────────┘
```

---

## Component Hierarchy (React Tree)

```
<RosterManagement>
│
├─ <Header />
│
├─ <TeamSelector />
│
├─ <RSVPSection>
│  │
│  └─ <table>
│     └─ <PlayerCard size="normal" />
│
└─ <DragDropProvider isCaptain={true}>
   │
   ├─ <BattingOrderSection>
   │  │
   │  ├─ <div className="lineup">
   │  │  └─ <PlayerCard size="normal" showStats={true} draggable={true} />
   │  │
   │  └─ <div className="available-players">
   │     └─ <PlayerCard size="normal" showStats={true} draggable={true} />
   │
   └─ <FieldingPositionsSection>
      │
      ├─ <div className="available-players">
      │  └─ <PlayerCard size="small" draggable={true} />
      │
      └─ <table className="fielding-grid">
         ├─ <PlayerCard size="small" draggable={true} /> (positions)
         └─ <PlayerCard size="small" draggable={true} /> (bench)
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    roster-management.html                           │
│                                                                     │
│  STATE:                                                             │
│  • games (from Firebase)                                            │
│  • players (from Firebase)                                          │
│  • rsvps (local + Firebase sync)                                    │
│  • battingOrder (local + Firebase sync)                             │
│  • fieldingPositions (local + Firebase sync)                        │
│  • benchPlayers (local + Firebase sync)                             │
│  • selectedGame (local UI state)                                    │
│  • draggedPlayer (from DragDropProvider)                            │
│  • dropTarget (from DragDropProvider)                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            Props passed to   Props passed to  Props passed to
            RSVPSection       BattingOrder     FieldingPositions
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                            Components render
                                    │
                            User interactions
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              onRSVPChange    onBattingOrder   onFieldingPositions
                  callback        callback         callback
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                            Parent updates state
                                    │
                        Calls saveLineupData()
                                    │
                    ┌───────────────┼───────────────┐
                    │                               │
                Online?                         Offline?
                    │                               │
                    ▼                               ▼
            Firebase save                    Queue in offline-queue.js
            Firestore.update()               → Syncs when back online
```

---

## File Dependencies

```
RSVPSection.jsx
  ├─ React (from CDN)
  └─ lucide-react icons (from window.lucide)

BattingOrderSection.jsx
  ├─ React (from CDN)
  ├─ lucide-react icons
  └─ PlayerCard.jsx

FieldingPositionsSection.jsx
  ├─ React (from CDN)
  ├─ lucide-react icons
  └─ PlayerCard.jsx

PlayerCard.jsx
  ├─ React (from CDN)
  └─ lucide-react icons

DragDropProvider.jsx
  └─ React (from CDN)

platform-utils.js
  └─ No dependencies (vanilla JS)

roster-management.html
  ├─ React 18 (CDN)
  ├─ React DOM 18 (CDN)
  ├─ Babel Standalone (CDN)
  ├─ lucide-react (CDN)
  ├─ firebase-auth.js
  ├─ firebase-data.js
  ├─ firebase-roster.js
  ├─ offline-queue.js
  ├─ RSVPSection.jsx (imported)
  ├─ BattingOrderSection.jsx (imported)
  ├─ FieldingPositionsSection.jsx (imported)
  ├─ DragDropProvider.jsx (imported)
  ├─ PlayerCard.jsx (imported)
  └─ platform-utils.js (imported)
```

---

## Mobile App Future Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    React Native Mobile App                          │
│                 (iOS / Android via Expo/RN)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │  RSVP Screen │ │ Batting Screen│ │Fielding Screen│
            │              │ │               │ │              │
            │  WebView or  │ │  WebView or   │ │  WebView or  │
            │  Native Port │ │  Native Port  │ │  Native Port │
            └──────────────┘ └──────────────┘ └──────────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                            React Navigation
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            Deep Links      Tab Navigation    Stack Navigation
            (aces://...)    (Bottom tabs)     (Screen stack)

Strategy Options:
1. WebView: Embed existing components in WebView (fastest)
2. Native: Port components to React Native (best UX)
3. Hybrid: WebView for complex (fielding), native for simple (RSVP)
```

---

## Offline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    User Action (RSVP/Lineup)                        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            navigator.onLine?
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                     YES│                       │NO
                        ▼                       ▼
                ┌──────────────┐        ┌──────────────┐
                │  Firebase    │        │  Queue via   │
                │  Save        │        │  offline-    │
                │  Immediate   │        │  queue.js    │
                └──────────────┘        └──────────────┘
                        │                       │
                        ▼                       ▼
                  Update UI               Update UI
                  Show success            Show "offline"
                                          indicator
                                                │
                                                │
                                        When back online:
                                                │
                                                ▼
                                        ┌──────────────┐
                                        │  Process     │
                                        │  Queue       │
                                        │  (FIFO)      │
                                        └──────────────┘
                                                │
                                                ▼
                                        Firebase saves
                                                │
                                                ▼
                                        Show notification:
                                        "Synced X items"
```

---

## Key Architectural Benefits

1. **Separation of Concerns**: Each component handles one responsibility
2. **Reusability**: Components work in any React context
3. **Testability**: Can test components independently
4. **Maintainability**: Changes isolated to specific components
5. **Scalability**: Easy to add mobile variants
6. **Performance**: Can lazy load or code-split components
7. **Flexibility**: Mix and match components for different UIs

---

**This architecture supports:**
- ✅ Current desktop experience (no changes)
- ✅ Future mobile web improvements (responsive)
- ✅ Future mobile app (separate screens or WebView)
- ✅ Offline functionality (queue-based sync)
- ✅ Progressive enhancement (add features incrementally)
