---
id: T84
title: The Fist's stomp: safe through it, and a follow-up
status: open
owner:
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

## Done when

- Nothing hurts the Fist during the stomp or just after (test).
- Attack pressed after a stomp carries the Fist to a struck Echo and strikes it several times (test); with nothing struck, it is an ordinary jab.
