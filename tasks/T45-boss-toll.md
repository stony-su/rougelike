---
id: T45
title: Final boss: the Toll, in three phases
status: done
owner: stony-su
milestone: 4
weight: 3.5
needs: [T22]
files:
  - src/sim/bosses/toll.ts
  - src/content/enemies/toll.ts
  - src/sim/bosses/patterns.ts
  - src/render/rig/rigs/toll.ts
  - src/render/palette/toll.ts
  - tests/boss-toll.test.ts
touches:
  - src/sim/bosses/index.ts
  - src/sim/bosses/carillon.ts
  - src/sim/types.ts
  - src/sim/ai.ts
  - src/sim/combat.ts
  - tests/run.test.ts
  - tests/golden.json
  - DESIGN.md
---

## What to build

The Bell itself, at chamber 12. **Peal**: rings of bolts with gaps, hammer slams, bumpers rising from the floor. **Echo**: it turns the party's own kinds of attack back on them. **Silence**: a closing wall of sound shrinks the arena; direct hits do little, and anything bounced, returned or caromed does full damage and more. Every phase guarantees something for each class to bounce.

The brain goes in `src/sim/bosses/toll.ts` and is listed with one line in `src/sim/bosses/index.ts`. The record, the rig and the colours are files of their own; its floor is the generated boss arena (`roomSpec` in `src/sim/run.ts`), as for the Carillon. See DESIGN.md section 6 ("The Toll as built") for what it does.

## As built

- The pieces both bosses share (a ring of bolts with gaps, an orb that leans, calling Thrums) moved to `src/sim/bosses/patterns.ts`, and the Carillon now uses them.
- An Echo has `takeDirect` and `takeReturn` (1 for nearly everything); the Toll's brain sets them with its phases, and `damageEnemy` applies them.
- The Echo's mirrored attacks and the rising bumpers of the first design are not built (DESIGN.md section 15).

## Done when

- The phases change at their health marks, each with an event and a moment the whole party shares (tests).
- Three bots together still it; a party that stands still loses within a minute (tests).
- The Sword's bot and the Bow's bot, alone and with no Tunings at all, take it into the Silence (tests). Winning alone with what a run gives, and the Fist against bosses, are measured and set in T70.
- No multiplier ever reaches zero, so no class is ever locked out of hurting it.
