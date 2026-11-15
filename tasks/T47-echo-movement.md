---
id: T47
title: Echoes that surround, flank and reposition
status: done
owner: stony-su
milestone: 5
weight: 2.5
needs: []
files:
  - src/sim/steer.ts
  - tests/steer.test.ts
touches:
  - src/sim/ai.ts
  - src/sim/defs.ts
  - src/sim/types.ts
  - src/sim/tuning.ts
  - src/content/enemies/*.ts
  - src/sim/bots.ts
  - DESIGN.md
---

## What to build

From play-testing: Echoes walk straight at the player, which is tame and predictable.

Give the ordinary Echoes ways of moving that have to be read:

- **Surround**: those that strike up close take places round their target, on different sides from each other, and close in from there; the places drift, so the ring turns.
- **Cut off**: they head for where their target is going, not where it is, so walking backwards in a circle stops working.
- **Skirmish**: those that shoot or throw move to a new spot after every volley, on another side, so the fire comes from changing angles.
- **Rush and hold**: far away they hurry; in place they wait for their turn rather than crowd in.

## Done when

- Several Thrums after one player end up spread round them, not in a file behind them (test).
- An Echo chasing a player who runs in a circle gets closer than one that only follows (test).
- A Piper stands somewhere else after each volley (test).
- Every class's bot still clears a chamber; nothing leaves the floor or sticks on a wall (existing tests).
