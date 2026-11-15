---
id: T20
title: Upgrade engine: Tunings on players, a draft after every fight
status: claimed
owner: stony-su
milestone: 4
weight: 4
needs: [T10]
files:
  - src/sim/mods.ts
  - src/sim/draft.ts
  - src/sim/session.ts
  - src/sim/player.ts
  - src/ui/cards.ts
  - src/ui/draftScreen.ts
  - src/content/tunings/README.md
  - tests/draft.test.ts
touches:
  - src/sim/types.ts
  - src/sim/defs.ts
  - src/sim/world.ts
  - src/sim/snapshot.ts
  - src/sim/combat.ts
  - src/sim/projectiles.ts
  - src/sim/bodies.ts
  - src/content/index.ts
  - src/game/game.ts
  - src/game/input.ts
  - src/ui/hud.ts
  - tests/helpers.ts
---

## What to build

Tunings exist in play (DESIGN.md section 4.1).

- Every player carries `tunings` (id to rank) and the numbers they add up to (`src/sim/mods.ts`, already written). The rules read those numbers where they read constants today.
- `src/content/tunings/` holds the Tunings as data, one file per owner (sword, bow, fist, common), picked up by itself like enemies and rooms.
- After a cleared fight every player is offered three Tunings on their own screen: at least one of their class and at least one common. The first draft shows one from each of the class's three builds. Later offers lean toward builds already begun and toward a Tuning that would complete a Harmony.
- Picking is a command, so every laptop agrees. The chamber stays live while people choose; the highlighted card is taken after 30 seconds; the way on opens when everyone has chosen.
- The cards are drawn in code and work with keyboard, mouse and controller.

## Done when

- Offers are the same for the same seed, never contain a Tuning at its top rank or a locked one, and obey the class and common rule (tests).
- A pick raises the rank and changes the numbers; a pick of a card that was not offered, or a second pick, is ignored the same way on every laptop.
- A snapshot taken in the middle of a draft restores it; three pretend laptops stay in step through a draft.
- In the browser a card can be chosen by keyboard, by mouse and by controller.
