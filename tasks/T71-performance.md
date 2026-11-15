---
id: T71
title: Performance pass
status: open
owner:
milestone: 7
weight: 1
needs: [T11]
files:
  - src/game/quality.ts
touches:
  - src/render/stage.ts
  - src/game/game.ts
  - scripts/shot.mjs
---

## What to build

The stress scene (three bots, 30 Echoes, 40 trailed shots, a 36-tile chamber) measured on integrated graphics at pixel ratios 1 and 2, and whatever it takes to hold 60 frames a second there, with a render scale that steps down by itself when frames run long.

## Done when

- The stress scene holds a 16.7 ms median frame at both pixel ratios, measured on a quiet machine, and the numbers are written into the task.
