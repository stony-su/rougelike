---
id: T40
title: Echo: the Gong
status: done
owner: stony-su
milestone: 4
weight: 1
needs: [T22]
files:
  - src/content/enemies/gong.ts
  - src/render/rig/rigs/gong.ts
  - src/render/palette/gong.ts
  - tests/echo-gong.test.ts
touches: []
---

## What to build

A medium Echo that carries a broad gong as a shield: blows from the front clang off it, and it answers with a shield bash, warned by a cone (DESIGN.md sections 3.4 and 5). Each class has its own way round: the Sword ripostes the bash or returns shots into its back, the Bow banks off a wall (or off the gong) into its back, the Fist opens the guard with a full Haymaker or caroms another body into it.

Three files and nothing shared: the record in `src/content/enemies/`, the rig in `src/render/rig/rigs/` (built from the solids in `src/render/rig/solids.ts`, with every state in `ENEMY_STATES`), and its colours in `src/render/palette/`. All three are picked up by themselves.

## Done when

- A blow or an arrow from the front does nothing and rings; an arrow banked into its back hurts; a full Haymaker opens the guard (tests).
- `validateEnemyDef` finds nothing wrong, and the rig test passes: every state is there and every state moves.
- It looks right in the gallery (`?gallery=gong`), and every class's bot can beat a wave with it.
