---
id: T43
title: Elites: five traits and their aura
status: open
owner:
milestone: 5
weight: 1.5
needs: [T22]
files:
  - src/sim/elites.ts
  - src/content/elites.ts
  - src/render/extras/eliteAura.ts
  - tests/elites.test.ts
touches:
  - src/sim/flow.ts
---

## What to build

An elite is an ordinary Echo with a danger-coloured aura and one trait (DESIGN.md section 5.1): **Resonant** bursts when bounced, a **Tethered** pair drags each other when one is launched, **Hasty** winds up faster, **Plated** has armour that a wall slam breaks, and **Splitting** falls apart into two smaller ones. The traits fill the table of hooks that T22 provides; the aura is an extra (see `src/render/extras/`).

## Done when

- One test for each trait.
- The aura is plain to see in a browser run, and an elite chamber of the route spawns them.
- Every class's bot clears an elite chamber.
