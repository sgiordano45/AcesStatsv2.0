# Changes made this session

## my-dashboard.html — home/away label fix
The next game card was showing Away/Home labels inverted when your team is the away team.
Fixed: Away team is now always on the left, Home team always on the right.

```
git add my-dashboard.html
git commit -m "Fix home/away labels on next game card"
git push
```

## card-export.html — bleed fix
The DOM wrapper approach broke the card back layout (height:100% issue).
Fixed: Bleed is now added by compositing onto a larger canvas after capture.
Output is 972×1332px with 36px bleed on each side at 300 DPI.

```
git add card-export.html
git commit -m "Fix bleed: composite approach instead of DOM wrapper"
git push
```

## offseason-roster.html — U30 flag
Added U30 click handler. Right-click any player card to toggle U30 on/off.

```
git add offseason-roster.html
git commit -m "Add U30 flag to offseason-roster player cards"
git push
```

---
Note: There's a display bug in the current Cowork session preventing chat messages from showing.
Start a new session if this persists.
