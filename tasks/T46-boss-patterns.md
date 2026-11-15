---
id: T46
title: Bosses that fill their floor: bigger, with more and faster attacks
status: done
owner: stony-su
milestone: 4
weight: 2.5
needs: [T44]
files:
  - src/sim/strikes.ts
  - src/sim/bosses/carillon.ts
  - src/content/enemies/carillon.ts
  - tests/strikes.test.ts
  - tests/boss-carillon.test.ts
touches:
  - src/sim/telegraphs.ts
  - src/sim/types.ts
  - src/sim/defs.ts
  - src/sim/ai.ts
  - src/sim/combat.ts
  - src/sim/bodies.ts
  - src/sim/world.ts
  - src/sim/roomgen.ts
  - src/sim/run.ts
  - src/sim/tuning.ts
  - src/sim/bots.ts
  - src/render/enemyView.ts
  - src/render/telegraphView.ts
  - src/render/fx.ts
  - src/audio/cues.ts
---

## What was built

From play-testing: the boss looked like an elite, and its attacks were too few for the size of its arena.

- **Strikes** (`src/sim/strikes.ts`): a warning that lands by itself when it runs out, as a disc, a ring with a safe middle, a lane or a cone. Bosses lay their patterns out of these, and so will the traps.
- **The Carillon** stands nearly twice as tall and runs a rotation of six warned patterns with only a breath between them (serve, marks, peal, toll, cross, leap), harder and faster below half its health.
- **Its floor** is small and open (no pits, no posts, a bumper toward each corner), so what it does reaches everywhere.
- **Stagger**: a boss cannot be stunned, but three Returns in quick succession stop it for a moment, and it takes half as much again meanwhile. A body launched into a boss hurts it half as much again.
- A bell cracks once per serve however many orbs come home, so the bells take five serves.

## Done when

- The rotation shows every pattern, and something is warned of or in the air for most of the fight (tests).
- Each strike lands exactly where and when it was drawn; a boss that falls takes its pending strikes with it.
- The Sword's and the Bow's bots beat it alone; the Fist's bot punches its orbs home and wears it well down (see the note in the test); a party that stands still loses within a minute.
