---
id: T10
title: Run route: twelve generated chambers over two zones
status: claimed
owner: stony-su
milestone: 3
weight: 4
needs: [T03]
files:
  - src/sim/session.ts
  - src/sim/run.ts
  - src/sim/world.ts
  - src/sim/flow.ts
  - tests/session.test.ts
  - tests/run.test.ts
touches:
  - src/sim/types.ts
  - src/sim/defs.ts
  - src/sim/snapshot.ts
  - src/sim/selftest.ts
  - src/sim/bots.ts
  - src/game/game.ts
  - src/game/driver.ts
  - src/ui/hud.ts
  - src/net/hostCore.ts
  - tests/coop.test.ts
  - tests/lan.test.ts
  - tests/helpers.ts
  - README.md
  - DESIGN.md
---

## What to build

The session plays a run of twelve chambers instead of an endless ladder (DESIGN.md section 7).

- `src/sim/run.ts` plans the route from the seed: the Outer Ring (fights, an elite or a fight, a camp, the mini-boss at chamber 6), then the Inner Ring (the same, with the Wager, and the final boss at chamber 12). The order inside a zone is shuffled within the limits of section 7.
- Every stop has a kind and a spec for the generator (`src/sim/roomgen.ts`): shape, size, look and zone change with the seed, so no two runs look alike.
- The session carries each player's health, Chimes and Tunings from chamber to chamber, ends the run as **won** after the last chamber and as **lost** when the whole party is down, and starts over on command.
- Kinds that are not built yet (camp, wager, boss) are played as the nearest thing that is, and say so in the route, until their own tasks land.

## Done when

- The same seed plans the same route; another seed plans another; every route obeys the limits (tests over many seeds).
- A party of bots walks a whole route headless to "won"; an idle party ends "lost".
- Three pretend laptops stay in step across every change of chamber.
- The pinned hashes are re-pinned and the browser run shows chambers of different shapes.
