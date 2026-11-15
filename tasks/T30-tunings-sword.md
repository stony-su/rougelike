---
id: T30
title: Tunings: the Sword (ten, and three Harmonies)
status: done
owner: stony-su
milestone: 5
weight: 2.5
needs: [T20]
files:
  - src/content/tunings/sword.ts
  - src/sim/classes/sword.ts
  - tests/tunings-sword.test.ts
touches:
  - src/sim/projectiles.ts
  - src/sim/tuning.ts
  - src/sim/mods.ts
  - src/sim/types.ts
  - src/sim/player.ts
  - src/sim/combat.ts
  - src/sim/ai.ts
  - src/sim/rally.ts
  - src/sim/session.ts
  - src/sim/world.ts
  - src/ui/icons.ts
  - src/render/projectileView.ts
  - src/render/fx.ts
  - src/game/app.ts
  - src/main.ts
  - tests/draft.test.ts
  - tests/golden.json
  - README.md
---

## What to build

The ten Sword Tunings of DESIGN.md section 4.2 (Mirror Guard, Duelist, Edge Wave and Bladesong) as data in `src/content/tunings/sword.ts`, the rules that read their numbers, and the three Harmonies kept in this build: Hall of Mirrors, Answer in Kind, Standing Wave.

Each Tuning is a list of changes to the numbers in `src/sim/mods.ts`; the numbers it needs are already there. The work is the rule that reads each number, in the class's own file. Where a rule has to live in a shared file (listed under "touches"), keep the change inside the one function it concerns.

## As built

- The rules are where the thing they change is: a returned shot in `projectiles.ts` (`returnShot`, `fanOut`, `restrikeShot`, and the turn of a shot that hunts its sender), a landed Riposte in `combat.ts` (`landRiposte`), the swing itself in `classes/sword.ts`.
- A Counterweight stun holds the Echo where it stands, so the shot that stuns it does not also shove it.
- A shot that hunts its sender turns at its own rate, and as tightly as it must when close, so it never circles what it is after.
- Twenty new emblems in `src/ui/icons.ts`, shared with the Bow and the Fist, so that no two Tunings of a class wear the same one.
- `?tunings=ringing-edge:3,chorus` in the address begins a run alone holding those, to look at what a Tuning does. Such a run earns nothing for the Attunement.
- Chorus is the Sword's locked Tuning: the Attunement's "Signature: Chorus" opens it.

## Done when

- One test for every Tuning and every Harmony: the same scripted moment played without it and with it differs in the way the card says.
- The class's bot still clears a chamber, with and without Tunings.
- The words on every card match what the rule does, rank by rank.
