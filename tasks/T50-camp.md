---
id: T50
title: Camp: the Tuner (shop) and the Still Pool (rest)
status: open
owner:
milestone: 4
weight: 2
needs: [T20]
files:
  - src/sim/camp.ts
  - src/ui/campScreen.ts
  - src/content/rooms/camp.ts
  - tests/camp.test.ts
touches:
  - src/sim/session.ts
  - src/sim/run.ts
  - src/game/game.ts
---

## What to build

A quiet chamber the party shares (DESIGN.md section 7). The **Tuner** sells three Tunings from your own pools, a ration and a restock, for Chimes. The **Still Pool** heals 35% or raises one Tuning by a rank, once for each player. Everyone shops on their own screen while the chamber stays live, and the way on opens when everyone is ready.

## Done when

- Buying takes the Chimes and gives the Tuning; nobody can spend what they do not have; the Pool works once per player per camp (tests).
- Two players buying in the same tick get the same result on every laptop.
- The camp works in the browser by keyboard and by controller.
