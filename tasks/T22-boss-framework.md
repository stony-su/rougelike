---
id: T22
title: Boss framework and Echo traits
status: open
owner:
milestone: 4
weight: 2
needs: [T10]
files:
  - src/sim/boss.ts
  - src/sim/bosses/index.ts
  - src/sim/ai.ts
  - src/sim/combat.ts
  - src/ui/bossBar.ts
  - tests/boss.test.ts
touches:
  - src/sim/defs.ts
  - src/sim/types.ts
  - src/sim/flow.ts
  - src/sim/run.ts
  - src/sim/bodies.ts
  - src/ui/hud.ts
  - src/render/fx.ts
  - src/audio/cues.ts
  - tests/fixtures.ts
---

## What to build

The hooks that let each boss and each special Echo be built in files of its own.

- **Traits on `EnemyDef`**: `shield` (a frontal arc that blows clang off; a full Haymaker or a Riposte opens it for a moment), `flying` (out of reach of ground blows until grounded), and `anchored` (cannot be launched, but takes the damage of bodies launched into it).
- **Boss brains**: `src/sim/boss.ts` defines the interface (`start`, `step`, phases); `src/sim/bosses/index.ts` lists the brains, one line each; an Echo whose definition names a brain is run by it instead of the ordinary attack cycle. A change of phase is an event and a moment the whole party shares.
- **Boss chambers**: no waves; cleared when the boss falls; boss health is multiplied by 1 + 0.6 for each extra player.
- **Elite hook**: an elite's trait id is looked up in a table of small hooks (on spawn, on hit, on launch, on death) that T43 fills.
- A boss bar at the top of the HUD.

## Done when

- A two-phase boss made for the tests changes phase at its health mark, cannot be launched, is hurt by a body launched into it, and its death clears the chamber.
- Shield: a blow from the front does nothing and rings; a blow or a returned shot from behind lands; a full Haymaker opens the guard.
- Flying: a ground blow passes under it; an arrow grounds it; grounded, it can be launched.
- A snapshot taken in the middle of a boss fight restores it.
