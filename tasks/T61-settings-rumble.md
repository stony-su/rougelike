---
id: T61
title: Settings and controller rumble
status: done
owner: stony-su
milestone: 6
weight: 1
needs: [T23]
files:
  - src/ui/screens/settings.ts
  - src/game/settings.ts
  - src/game/rumble.ts
  - tests/settings.test.ts
touches:
  - src/game/app.ts
  - src/game/game.ts
  - src/game/input.ts
  - src/ui/screen.ts
  - scripts/shot.mjs
  - README.md
---

## What to build

Volume, screen shake and graphics quality, kept in the browser between visits. A controller rumbles on hits, harder for heavier ones, unless switched off here.

## As built

- Volume, sound on or off (the M key is the same switch), screen shake (off, half, full), the picture (Light: three quarters of the pixels and a backdrop that stands still; Plain: one for one; Sharp: every pixel the screen has, up to two for one) and controller rumble.
- Kept in `localStorage` under one key with a version; whatever is read back is cleaned first, so a damaged entry costs only itself (tests).
- Rumble is worked out from the event alone (`buzzFor`), so it is tested without a controller; the scripted controller of `scripts/shot.mjs` writes down what the page asks it to play.
- Checked in the browser: a hit asked the scripted controller to rumble, and with rumble off nothing was asked.

## Done when

- Every setting survives a reload and changes what it says it changes.
- A scripted controller run shows rumble being asked for on a hit and not when it is off.
