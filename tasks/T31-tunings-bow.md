---
id: T31
title: Tunings: the Bow (ten, and three Harmonies)
status: done
owner: stony-su
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
  - src/sim/stones.ts
  - src/sim/bodies.ts
  - src/sim/tuning.ts
  - src/sim/mods.ts
  - src/sim/types.ts
  - src/sim/player.ts
  - src/ui/icons.ts
  - tests/golden.json
  - README.md
---

## What to build

The ten Bow Tunings of DESIGN.md section 4.3 (Pinball, Chain, Stonework and Heavy Fourth) as data in `src/content/tunings/bow.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Trick Shot, Chain Reaction, Bell Tower.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## As built

- What an arrow does when it lands depends on what whoever loosed it holds, looked up at that moment (`strike` in `projectiles.ts`); what a Ringstone does to a shot or a body depends on what whoever planted it holds.
- Twin Stones lets two stand at once and makes each stand twice as long (a stone lasts as long as the wait for the next, so two could not otherwise overlap).
- Seeking Echo bends the arrow after its first bounce; the aim preview still shows the path off the chamber alone.
- The heavy arrow of Heavy Fourth is the same size as any other, so the preview stays exact.
- Lodestone is the Bow's locked Tuning: the Attunement's "Signature: Lodestone" opens it.
- Every Tuning in the game now wears an emblem of its own (the guard in `tests/workspace.test.ts` holds for all 32).

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
