---
id: T35
title: A combo of moves for every basic attack
status: claimed
owner: stony-su
milestone: 5
weight: 1.5
needs: []
files:
  - src/render/rig/rigs/string.ts
touches:
  - src/sim/classes/bow.ts
  - src/sim/types.ts
  - src/render/rig/rigs/edge.ts
  - src/render/rig/rigs/hand.ts
  - src/render/playerView.ts
  - src/render/fx.ts
  - src/audio/cues.ts
  - tests/rig.test.ts
---

## What to build

From play-testing: the basic attacks want combos you can see.

Every class's basic attack is a run of three different moves, each with its own pose, its own arc on screen and its own sound, the third the biggest:

- **Sword**: a cut across, a cut back, and an overhead finisher that steps in.
- **Fist**: a left, a right, and a hook that turns the whole body.
- **Bow**: a quick shot from the hip, a high draw, and a full-draw shot with a recoil. (The arrows are the same arrows; the run restarts after a pause.)

## Done when

- Each class's rig has three different attack poses (the rig test tells them apart), and the game plays them in order.
- The three look different in the gallery and in play (looked at in the real page).
