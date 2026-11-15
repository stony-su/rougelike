---
id: T50
title: Camp: the Tuner (shop) and the Still Pool (rest)
status: done
owner: stony-su
milestone: 4
weight: 2
needs: [T20]
files:
  - src/sim/camp.ts
  - src/ui/campScreen.ts
  - src/game/campFlow.ts
  - src/game/cardInfo.ts
  - src/render/extras/camp.ts
  - src/render/palette/camp.ts
  - tests/camp.test.ts
touches:
  - src/sim/session.ts
  - src/sim/run.ts
  - src/sim/roomgen.ts
  - src/sim/bots.ts
  - src/sim/preview.ts
  - src/net/protocol.ts
  - src/game/game.ts
  - src/game/driver.ts
  - src/game/input.ts
  - src/ui/cards.ts
  - tests/run.test.ts
  - tests/boundary.test.ts
  - tests/golden.json
  - README.md
---

## What to build

A quiet chamber the party shares (DESIGN.md section 7). The **Tuner** sells three Tunings from your own pools, a ration and a restock, for Chimes. The **Still Pool** heals 35% or raises one Tuning by a rank, once for each player. Everyone shops on their own screen while the chamber stays live, and the way on opens when everyone is ready.

## As built

- The camp's floor is generated like any other (a bare court with one post for the stall), not a hand-built room.
- The automatic 35% on walking in is gone: the Still Pool gives it, when asked.
- A camp is left when everyone is ready. Once the first player is, the others have 30 seconds; alone it is left at once.
- The list can be put away (Esc or B) to look round, and Interact brings it back.
- Bots rest, eat if they are still hurt, buy the best Tuning they can pay for, and walk on.

## Done when

- Buying takes the Chimes and gives the Tuning; nobody can spend what they do not have; the Pool works once per player per camp (tests).
- Two players buying in the same tick get the same result on every laptop.
- The camp works in the browser by keyboard and by controller.
