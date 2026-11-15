---
id: T43
title: Elites: five traits and their aura
status: done
owner: stony-su
milestone: 5
weight: 1.5
needs: [T22]
files:
  - src/sim/elites.ts
  - src/render/extras/tether.ts
  - tests/elites.test.ts
touches:
  - src/sim/flow.ts
  - src/sim/ai.ts
  - src/sim/combat.ts
  - src/sim/bodies.ts
  - src/sim/tuning.ts
  - src/sim/types.ts
---

## What to build

An elite is an ordinary Echo with a danger-coloured aura and one trait (DESIGN.md section 5.1): **Resonant** bursts when bounced, a **Tethered** pair drags each other when one is launched, **Hasty** winds up faster, **Plated** has armour that a wall slam breaks, and **Splitting** falls apart into two smaller ones. The traits are a table of small hooks (on spawn, on hit, on launch, on death) in `src/sim/elites.ts`, wired into the few places in `ai.ts`, `flow.ts` and `bodies.ts` where their causes happen. The pennant and the danger-coloured mark under an elite are drawn by the enemy view already; the tether between a pair is an extra (see `src/render/extras/`).

## Done when

- One test for each trait.
- The aura is plain to see in a browser run, and an elite chamber of the route spawns them.
- Every class's bot clears an elite chamber.
