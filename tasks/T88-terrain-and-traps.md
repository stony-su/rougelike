---
id: T88
title: More terrain and more traps
status: open
owner:
milestone: 8
weight: 2
needs: []
files:
  - tests/terrain.test.ts
touches:
  - src/sim/roomgen.ts
  - src/sim/traps.ts
  - src/sim/geo.ts
  - src/sim/room.ts
  - src/render/roomView.ts
  - src/render/extras/traps.ts
  - tests/roomgen.test.ts
  - tests/traps.test.ts
---

## What to build

Generated rooms feel alike. Give the generator more to build with: new kinds of ground and obstacle, and new traps, so that two rooms of the same shape play differently.

## Done when

- At least three new pieces of terrain or trap appear in generated rooms, each with a rule test.
- The generator still keeps every room connected and fair over many seeds.
