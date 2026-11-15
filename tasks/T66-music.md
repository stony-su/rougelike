---
id: T66
title: Music beds and sound levels
status: claimed
owner: June Lee
milestone: 6
weight: 1
needs: []
files:
  - src/audio/beds.ts
  - src/audio/music.ts
  - src/audio/levels.ts
  - src/audio/measure.ts
  - src/game/soundboard.ts
  - tests/audio.test.ts
touches:
  - src/audio/index.ts
  - src/audio/engine.ts
  - src/main.ts
---

## What to build

A quiet bed for each zone and a pulse for bosses, made in code like every other sound (DESIGN.md section 11). Every cue's loudness is measured so that nothing drowns anything else. A soundboard page (`?sounds`) plays each cue by name, so a person can listen through them.

## Done when

- A test renders each cue offline and finds its peak and average level inside the agreed band.
- A bed loops without a click (the last sample meets the first).
