---
id: T48
title: Traps in the floor
status: done
owner: stony-su
milestone: 5
weight: 2.5
needs: [T46]
files:
  - src/sim/traps.ts
  - src/render/trapView.ts
  - tests/traps.test.ts
touches:
  - src/sim/types.ts
  - src/sim/defs.ts
  - src/sim/room.ts
  - src/sim/geo.ts
  - src/sim/roomgen.ts
  - src/sim/world.ts
  - src/sim/run.ts
  - src/sim/tuning.ts
  - src/sim/bots.ts
  - src/render/roomView.ts
  - src/render/fx.ts
  - src/audio/cues.ts
  - src/game/game.ts
  - DESIGN.md
---

## What to build

From play-testing: nothing in the floor makes the player move, so every fight is walking backwards in a circle.

Traps in the chambers, as in the games this one admires, that hurt whoever is on them, Echoes included:

- **Spike plates** that rise a moment after anything steps on them. A body launched onto one is spiked, and that counts for whoever launched it.
- **Knell posts** that toll every few seconds: a ring round the post, warned, that hurts and shoves outward whatever stands in it.
- **Thorn pipes** that turn toward the nearest player and spit a bolt down a warned line. The Sword can send it back.

The generator lays them out with the rest of the terrain, more of them deeper into the run, none in the first chamber, and never where the party walks in.

## Done when

- Each trap warns before it strikes and strikes what the warning covered (tests).
- Echoes are hurt by traps, and a launched body thrown onto spikes is a Return for whoever threw it (test).
- Generated chambers from the third on have traps; the first has none; every chamber still passes the room checks (test over many seeds).
- Bots step off plates and out of rings (existing clears still pass).
