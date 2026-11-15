---
id: T70
title: Balance, by bots playing whole runs
status: open
owner:
milestone: 7
weight: 2
needs: [T30, T31, T32, T33, T44, T45, T50]
files:
  - src/sim/autoplay.ts
  - scripts/balance.mjs
  - tests/balance.test.ts
touches:
  - src/sim/tuning.ts
  - src/sim/bots.ts
  - src/content/enemies/*.ts
  - src/content/tunings/*.ts
---

## What to build

Whole runs played headless, many seeds each, and the numbers adjusted until: each class's expert bot wins alone most of the time; the novice bot wins sometimes; a party that stands still always loses; three experts do not walk through the bosses; the three classes land Returns at rates within 30% of each other; and less than 5% of the game is spent in a whole-chamber freeze.

## Done when

- `tests/balance.test.ts` holds those bands.
