---
id: T84
title: The Fist's stomp: safe through it, and a follow-up
status: done
owner: stony-su
milestone: 8
weight: 1.2
needs: []
files:
  - tests/fist-stomp.test.ts
touches:
  - src/sim/classes/fist.ts
  - src/sim/tuning.ts
  - src/sim/types.ts
  - src/sim/player.ts
  - src/sim/bots.ts
---

## What to build

The Fist cannot be hurt during the stomp or for a moment after it. Attacking right after the stomp dashes the Fist to an Echo the stomp struck and lands a combo on it.

## As built

- **Safe through it.** From the moment the slam begins until 0.35 s after it is over, nothing hurts the Fist (`BREAK.safe`).
- **The follow-up.** The slam remembers which Echoes it struck. For 1.2 s after it, an attack sends the Fist flying to one of them: the one nearest the line of the aim, within nine tiles. The flight is a dash in every way but its cost (no charge is spent), steered at the Echo wherever the slam has thrown it, and nothing can hurt the Fist on the way. Arriving, it lands three blows without another press, keeping up with the Echo between them: 7 and 7, each of which stops the Echo where it is and dazes it, and 14 that throws it along the punch and is a Return. A real dash cancels the run. With nothing struck, or too late, the attack is an ordinary jab.
- It does not wait for the Fist to straighten up: an attack pressed the moment the slam has landed begins the flight at once.
- A boss cannot be thrown, but it is struck, and so it can be flown to: the Fist's way back in to a boss.
- The bot follows a stomp up whenever it has struck something.

## Done when

- Nothing hurts the Fist during the stomp or just after (test).
- Attack pressed after a stomp carries the Fist to a struck Echo and strikes it several times (test); with nothing struck, it is an ordinary jab.
