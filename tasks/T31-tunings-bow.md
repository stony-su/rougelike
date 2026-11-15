---
id: T31
title: Tunings: the Bow (ten, and three Harmonies)
status: open
owner:
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/bow.ts
  - src/sim/classes/bow.ts
  - src/sim/stones.ts
  - tests/tunings-bow.test.ts
touches:
  - src/sim/projectiles.ts
  - src/sim/tuning.ts
---

## What to build

The ten Bow Tunings of DESIGN.md section 4.3 (Pinball, Chain, Stonework and Heavy Fourth) as data in `src/content/tunings/bow.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Trick Shot, Chain Reaction, Bell Tower.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
