---
id: T32
title: Tunings: the Fist (ten, and three Harmonies)
status: done
owner: stony-su
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/fist.ts
  - src/sim/classes/fist.ts
  - tests/tunings-fist.test.ts
touches:
  - src/sim/bodies.ts
  - src/sim/combat.ts
  - src/sim/tuning.ts
  - src/sim/mods.ts
  - src/sim/types.ts
  - src/sim/ai.ts
  - tests/golden.json
  - README.md
---

## What to build

The ten Fist Tunings of DESIGN.md section 4.4 (Billiards, Wall Combo, Shockwave and Heavy Hands) as data in `src/content/tunings/fist.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Pool Shark, Corner Pocket, Earthquake.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## As built

- What a body in flight does depends on what whoever threw it holds, looked up as it flies (`modsOf` in `bodies.ts`).
- A body's place in a chain counts the bodies the thrown one has ploughed through, so Pool Shark's "third body" is the third whichever way the chain ran.
- Rebound Jab sends on any body in flight within a jab's reach, not only one coming toward the player.
- A Thunderclap's burst pops light Echoes; with Earthquake it shoulders heavier ones aside too, and a Tremor's burst pops what it hits.
- Iron Stance's "no stagger" is no knock-back: being hurt never did interrupt a drawn hand.
- Tremor is the Fist's locked Tuning: the Attunement's "Signature: Tremor" opens it.

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
