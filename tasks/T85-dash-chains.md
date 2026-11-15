---
id: T85
title: Dash into attack for everyone; dash into heavy into jab for the Fist
status: open
owner:
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

## Done when

- An attack buffered in a dash begins on the tick the dash ends and is a dash attack (test, each class).
- The Fist chains dash, heavy and jab with no idle tick between them (test).
