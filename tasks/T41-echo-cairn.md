---
id: T41
title: Echo: the Cairn
status: done
owner: stony-su
milestone: 4
weight: 1
needs: [T22]
files:
  - src/content/enemies/cairn.ts
  - src/render/rig/rigs/cairn.ts
  - src/render/palette/cairn.ts
  - tests/echo-cairn.test.ts
touches: []
---

## What to build

A heavy Echo of three stacked stones (DESIGN.md section 5). It slams the ground in a ring that spreads outward, and lobs its top stone at a marked circle; the stone can be sent back. Three jabs stagger it, and then it launches like a wrecking ball. A rig from the earlier game is already in `src/render/rig/rigs/cairn.ts`: bring it into the look of the Long Echo rather than starting again.

Three files and nothing shared: the record in `src/content/enemies/`, the rig in `src/render/rig/rigs/` (built from the solids in `src/render/rig/solids.ts`, with every state in `ENEMY_STATES`), and its colours in `src/render/palette/`. All three are picked up by themselves.

## Done when

- The ring hurts exactly where the warning was drawn; the thrown stone can be returned by each class; staggered, it launches and wrecks what it meets (tests).
- `validateEnemyDef` finds nothing wrong, and the rig test passes: every state is there and every state moves.
- It looks right in the gallery (`?gallery=cairn`), and every class's bot can beat a wave with it.
