---
id: T86
title: Three specials to choose from for the Sword and for the Bow
status: open
owner:
milestone: 8
weight: 3
needs: []
files:
  - src/sim/specials.ts
  - src/content/specials.ts
  - tests/specials.test.ts
touches:
  - src/sim/classes/sword.ts
  - src/sim/classes/bow.ts
  - src/sim/session.ts
  - src/sim/types.ts
  - src/sim/tuning.ts
  - src/sim/bots.ts
  - src/net/protocol.ts
  - src/ui/screens/classSelect.ts
  - src/game/app.ts
  - src/sim/draft.ts
---

## What to build

For each of the Sword and the Bow, three specials to choose from on the class card: a regular one, a unique one, and one that belongs to the bounce. The choice travels with the player into a co-op game. Upgrades that only work with one special are offered only to players who chose it.

## Done when

- Each special changes an outcome (one test each).
- The choice is made on the class card, is kept between visits, and reaches the other laptops.
- A bot uses whichever special its seat has.
