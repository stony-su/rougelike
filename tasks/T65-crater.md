---
id: T65
title: The Crater: the third biome, for the last chamber
status: open
owner:
milestone: 4
weight: 1
needs: [T10]
files:
  - src/render/palette/crater.ts
  - src/render/backdrop.ts
touches:
  - src/sim/defs.ts
  - src/render/palette.ts
  - src/sim/run.ts
  - src/audio/scale.ts
---

## What to build

Black and gold, for the chamber of the Bell (DESIGN.md sections 9 and 10). `ZoneId` gains `crater`; the palette gets its theme; the backdrop uses its third style, the standing rings, which is already in the shader; the last chamber of the route is set there.

## Done when

- The last chamber has been looked at in a screenshot.
- Everything keyed by zone has the new zone (the type-check proves it).
