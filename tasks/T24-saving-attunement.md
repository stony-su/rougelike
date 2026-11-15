---
id: T24
title: Saving and the Attunement (permanent progression)
status: open
owner:
milestone: 6
weight: 2
needs: [T20, T23]
files:
  - src/game/save.ts
  - src/content/attunement.ts
  - src/ui/screens/attunement.ts
  - tests/save.test.ts
touches:
  - src/sim/session.ts
  - src/net/protocol.ts
  - src/net/hostCore.ts
  - src/game/app.ts
---

## What to build

What you keep between runs (DESIGN.md section 8). Resonance is earned for every chamber and boss and spent at the Attunement on more health, starting Chimes, rerolls, a faster dash recharge, the three locked Tunings and a starting Tuning per class. Records are kept per class.

It is saved in the browser's `localStorage`, with a version number, and can be written out and read back as a code (a laptop that joins a host keeps its save under the host's address, so people need a way to carry it). In co-op each player's bonuses are sent once in the lobby and fixed for the run.

## Done when

- A save survives a reload; an old or damaged save is read without losing what can be read (tests).
- Each bonus changes a run in the stated way (tests).
- The screen works by keyboard and by controller.
- A code written on one address restores the save on another.
