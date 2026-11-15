---
id: T11
title: Camera that follows your own player
status: done
owner: stony-su
milestone: 3
weight: 2
needs: []
files:
  - src/render/camera.ts
touches:
  - src/game/game.ts
  - src/render/stage.ts
  - src/render/backdrop.ts
---

## What to build

Chambers are now bigger than the screen. The camera follows your own player, shows the same amount of world on every screen whatever its size (zoom set by a fixed visible height in tiles), leans a little toward where you aim, and stops at the chamber's edges. A chamber that fits is still framed whole.

## Done when

- In a 34-tile chamber the player stays near the middle of the screen from corner to corner (browser run, read through `debugState`).
- A 1280 by 720 window and a 1920 by 1080 window show the same height of world.
- The small practice court still fits whole.
