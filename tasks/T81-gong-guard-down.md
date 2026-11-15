---
id: T81
title: A Gong's guard stays down longer after its bash
status: open
owner:
milestone: 8
weight: 0.3
needs: []
files:
  - src/content/enemies/gong.ts
touches:
  - src/sim/defs.ts
  - src/sim/ai.ts
  - src/sim/combat.ts
  - tests/echo-gong.test.ts
---

## What to build

After its bash a Gong's shield hangs at its side for a moment and is then up again before most players can use the opening. Make the opening longer.

## Done when

- The guard is down for clearly longer after a bash, and a test holds the time.
