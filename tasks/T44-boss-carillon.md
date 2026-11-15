---
id: T44
title: Mini-boss: the Carillon
status: done
owner: stony-su
milestone: 4
weight: 2.5
needs: [T22]
files:
  - src/sim/bosses/carillon.ts
  - src/content/enemies/carillon.ts
  - src/render/rig/rigs/carillon.ts
  - src/render/palette/carillon.ts
  - tests/boss-carillon.test.ts
touches:
  - src/sim/bosses/index.ts
  - src/sim/defs.ts
  - src/sim/types.ts
  - src/sim/ai.ts
  - src/sim/projectiles.ts
  - src/sim/classes/sword.ts
  - src/sim/classes/fist.ts
  - src/sim/session.ts
  - src/net/protocol.ts
  - src/main.ts
  - src/render/enemyView.ts
  - src/render/projectileView.ts
  - src/render/roomView.ts
  - src/render/fx.ts
  - src/audio/cues.ts
  - src/ui/bossBar.ts
  - README.md
---

## What to build

A walking frame of bells, at chamber 6. It serves heavy ringing orbs that every class can return with a basic attack; a bell cracks when its own orb comes back to it; the tempo rises with the number of cracked bells (not with the number of returns, so three players do not triple it); between volleys it slams the ground and calls Thrums.

The brain goes in `src/sim/bosses/carillon.ts` and is listed with one line in `src/sim/bosses/index.ts` (the only shared line of the task). The record, the rig and the colours are files of their own; its arena is a generated court. See DESIGN.md section 6.1 for the attack tables.

## Done when

- Each class's bot beats it alone; a party that stands still loses; three bots do not end it in a few seconds (tests).
- The tempo follows cracked bells, not returns.
- A snapshot taken in the middle of the fight restores it.
