---
id: T87
title: The camp as a place: a merchant, and a pool to walk into
status: open
owner:
milestone: 8
weight: 2
needs: []
files:
  - src/render/extras/camp.ts
  - src/render/palette/camp.ts
touches:
  - src/sim/camp.ts
  - src/sim/session.ts
  - src/sim/roomgen.ts
  - src/game/campFlow.ts
  - src/ui/campScreen.ts
  - tests/camp.test.ts
---

## What to build

The camp is a chamber with a merchant standing at a stall and a pool of water. Walking into the pool heals, once. Walking up to the merchant opens the shop. The tuning fork is gone.

## Done when

- Walking into the pool heals once and not again (test).
- The shop opens beside the merchant and closes on walking away.
- Looked at in the real page.
