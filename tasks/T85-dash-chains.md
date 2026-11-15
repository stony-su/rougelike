---
id: T85
title: Dash into attack for everyone; dash into heavy into jab for the Fist
status: done
owner: stony-su
milestone: 8
weight: 1
needs: []
files:
  - tests/dash-chains.test.ts
touches:
  - src/sim/player.ts
  - src/sim/classes/sword.ts
  - src/sim/classes/bow.ts
  - src/sim/classes/fist.ts
  - src/sim/tuning.ts
  - src/sim/types.ts
---

## What to build

An attack pressed during a dash comes out as the dash ends, without the pause between them, and carries the dash into it. For the Fist a dash can go straight into the heavy punch and from that into jabs.

## As built

- **An attack asked for in a dash is kept** until the dash is over, however early in the dash it was pressed (a press used to wait 0.15 s and no longer), and it begins on the very tick the dash ends: there is no tick of standing between the two.
- **It is a dash attack**: for 0.22 s after a dash, the first blow has half its wind-up already behind it, steps forward 2.2 times as far, and lands 1.3 times as hard. For the Bow the arrow leaves at once, whatever the string's own rest, and flies 1.3 times as fast and as hard.
- **The Fist: dash, heavy, jab.** With the button held through a dash, the Fist lands with the hand part drawn (0.45 of the hold, where a punch needs 0.25): letting go at once is a punch, holding on a moment a full one. And a jab asked for at any moment of the heavy punch waits for it to land and then cuts the rest of its recovery short.

## Done when

- An attack buffered in a dash begins on the tick the dash ends and is a dash attack (test, each class).
- The Fist chains dash, heavy and jab with no idle tick between them (test).
