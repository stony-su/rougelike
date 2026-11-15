---
id: T51
title: The Wager, and the Brittle Discord
status: open
owner:
milestone: 4
weight: 1
needs: [T20]
files:
  - src/sim/wager.ts
  - src/ui/wagerScreen.ts
  - tests/wager.test.ts
touches:
  - src/sim/session.ts
  - src/sim/run.ts
  - src/game/game.ts
---

## What to build

The risk for reward (DESIGN.md section 7): take the **Brittle** Discord (less health for everyone) through one elite chamber for a rare Tuning and double Chimes, or walk on. The party decides by majority after a 10-second count.

## Done when

- Taking it makes the next chamber an elite one with Brittle on everyone, and pays out when it is cleared; walking on changes nothing; a tie walks on (tests).
