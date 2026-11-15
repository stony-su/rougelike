---
id: T32
title: Tunings: the Fist (ten, and three Harmonies)
status: open
owner:
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/fist.ts
  - src/sim/classes/fist.ts
  - tests/tunings-fist.test.ts
touches:
  - src/sim/bodies.ts
  - src/sim/tuning.ts
---

## What to build

The ten Fist Tunings of DESIGN.md section 4.4 (Billiards, Wall Combo, Shockwave and Heavy Hands) as data in `src/content/tunings/fist.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Pool Shark, Corner Pocket, Earthquake.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
