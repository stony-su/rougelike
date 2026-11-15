---
id: T52
title: Side-chamber kinds: Proving, Cache, Echo Duel
status: open
owner:
milestone: 5
weight: 1.5
needs: [T21]
files:
  - src/sim/sides.ts
  - tests/sides.test.ts
touches:
  - src/sim/fork.ts
  - src/sim/flow.ts
---

## What to build

What a solo side-chamber holds (DESIGN.md section 7). At the fork each player picks one of their own two ways on. **Proving** is a trial of your class (return bolts, bank shots at targets behind cover, or carom pins) and pays a class Tuning. **Cache** is Chimes among bumpers and hazards against a clock, and pays Chimes and health. **Echo Duel** is one elite alone, which enrages at 75 seconds, and pays a rare Tuning.

## Done when

- For each kind, one test in which a bot completes it and one in which the clock runs out; the payouts are as written.
