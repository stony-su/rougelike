---
id: T33
title: Tunings: the common twelve, and three Harmonies
status: done
owner: stony-su
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/common.ts
  - src/sim/rally.ts
  - src/sim/status.ts
  - tests/tunings-common.test.ts
touches:
  - src/sim/player.ts
  - src/sim/combat.ts
  - src/sim/tuning.ts
---

## What to build

The twelve Tunings anyone can take (DESIGN.md section 4.5): the dash family (Third Wind, Afterimage, Ram), the Rally family (Sustain, Overtone, Opening Note), the elements that ride on Returns (Ember, Frost, Storm), and Stout Heart, Tithe and Echo Ward. With them the three common Harmonies: Steam, Perfect Pitch, Cascade.

## Done when

- One test for every Tuning and every Harmony, as for the class Tunings.
- A fresh save can draft from at least 20 Tunings (nine of its class and the twelve here).
