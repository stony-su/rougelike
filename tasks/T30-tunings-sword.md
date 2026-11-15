---
id: T30
title: Tunings: the Sword (ten, and three Harmonies)
status: open
owner:
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/sword.ts
  - src/sim/classes/sword.ts
  - tests/tunings-sword.test.ts
touches:
  - src/sim/projectiles.ts
  - src/sim/tuning.ts
---

## What to build

The ten Sword Tunings of DESIGN.md section 4.2 (Mirror Guard, Duelist, Edge Wave and Bladesong) as data in `src/content/tunings/sword.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Hall of Mirrors, Answer in Kind, Standing Wave.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
