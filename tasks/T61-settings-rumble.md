---
id: T61
title: Settings and controller rumble
status: open
owner:
milestone: 6
weight: 1
needs: [T23]
files:
  - src/ui/screens/settings.ts
  - src/game/settings.ts
  - src/game/rumble.ts
touches:
  - src/game/gamepad.ts
  - src/audio/index.ts
---

## What to build

Volume, screen shake and graphics quality, kept in the browser between visits. A controller rumbles on hits, harder for heavier ones, unless switched off here.

## Done when

- Every setting survives a reload and changes what it says it changes.
- A scripted controller run shows rumble being asked for on a hit and not when it is off.
