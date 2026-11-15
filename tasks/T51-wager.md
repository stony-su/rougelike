---
id: T51
title: The Wager, and the Brittle Discord
status: done
owner: stony-su
milestone: 4
weight: 1
needs: [T20]
files:
  - src/sim/wager.ts
  - src/ui/wagerScreen.ts
  - src/game/wagerFlow.ts
  - tests/wager.test.ts
touches:
  - src/sim/session.ts
  - src/sim/flow.ts
  - src/sim/draft.ts
  - src/sim/bots.ts
  - src/sim/preview.ts
  - src/game/game.ts
  - tests/boundary.test.ts
  - tests/golden.json
  - README.md
---

## What to build

The risk for reward (DESIGN.md section 7): take the **Brittle** Discord (less health for everyone) through one elite chamber for a rare Tuning and double Chimes, or walk on. The party decides by majority after a 10-second count.

## As built

- The Wager is put to the party in the chamber before the elite's, once its cards are taken. Everyone has ten seconds; the table closes as soon as everyone has answered.
- More than half must say yes. A tie walks on, and so does silence.
- Taken: in the elite's chamber everyone's greatest health is 30% less until the last blow, every Chime the chamber drops is doubled, and its card is followed by a second, rare one.
- Bots take it when they have at least 60% of their health.

## Done when

- Taking it makes the next chamber an elite one with Brittle on everyone, and pays out when it is cleared; walking on changes nothing; a tie walks on (tests).
