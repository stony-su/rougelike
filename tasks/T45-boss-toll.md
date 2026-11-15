---
id: T45
title: Final boss: the Toll, in three phases
status: open
owner:
milestone: 4
weight: 3.5
needs: [T22]
files:
  - src/sim/bosses/toll.ts
  - src/content/enemies/toll.ts
  - src/content/rooms/toll-hall.ts
  - src/render/rig/rigs/toll.ts
  - src/render/palette/toll.ts
  - tests/boss-toll.test.ts
touches:
  - src/sim/bosses/index.ts
---

## What to build

The Bell itself, at chamber 12. **Peal**: rings of bolts with gaps, hammer slams, bumpers rising from the floor. **Echo**: it turns the party's own kinds of attack back on them. **Silence**: a closing wall of sound shrinks the arena; direct hits do little, and anything bounced, returned or caromed does full damage and more. Every phase guarantees something for each class to bounce.

The brain goes in `src/sim/bosses/toll.ts` and is listed with one line in `src/sim/bosses/index.ts` (the only shared line of the task). The record, the arena, the rig and the colours are files of their own. See DESIGN.md section 6.2 for the attack tables.

## Done when

- The phases change at their health marks, each with an event and a moment the whole party shares (tests).
- Each class's bot can win alone; a party that stands still loses.
- No multiplier ever reaches zero, so no class is ever locked out of hurting it.
