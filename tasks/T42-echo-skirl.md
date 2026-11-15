---
id: T42
title: Echo: the Skirl
status: open
owner:
milestone: 5
weight: 1
needs: [T22]
files:
  - src/content/enemies/skirl.ts
  - src/render/rig/rigs/skirl.ts
  - src/render/palette/skirl.ts
  - tests/echo-skirl.test.ts
touches: []
---

## What to build

A light flying Echo (DESIGN.md section 5): it shows a dotted flight line, then crosses the room along it. Ground blows pass under it until an arrow or a returned shot brings it down; once grounded it can be launched like anything else.

Three files and nothing shared: the record in `src/content/enemies/`, the rig in `src/render/rig/rigs/` (built from the solids in `src/render/rig/solids.ts`, with every state in `ENEMY_STATES`), and its colours in `src/render/palette/`. All three are picked up by themselves.

## Done when

- Its pass follows the drawn line; it is out of reach until grounded; a Sword can bat it out of its pass (tests).
- `validateEnemyDef` finds nothing wrong, and the rig test passes: every state is there and every state moves.
- It looks right in the gallery (`?gallery=skirl`), and every class's bot can beat a wave with it.
