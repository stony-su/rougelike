---
id: T86
title: A new special for the Sword and for the Bow
status: done
owner: stony-su
milestone: 8
weight: 3
needs: []
files:
  - src/render/extras/whirlwind.ts
  - src/render/extras/hookLine.ts
touches:
  - src/sim/classes/sword.ts
  - src/sim/classes/bow.ts
  - src/sim/classes/kit.ts
  - src/sim/types.ts
  - src/sim/tuning.ts
  - src/sim/mods.ts
  - src/sim/player.ts
  - src/sim/combat.ts
  - src/sim/ai.ts
  - src/sim/projectiles.ts
  - src/sim/bodies.ts
  - src/sim/world.ts
  - src/sim/bots.ts
  - src/content/tunings/sword.ts
  - src/content/tunings/bow.ts
  - src/content/attunement.ts
  - src/audio/cues.ts
  - src/audio/index.ts
  - src/audio/recipes.ts
  - src/audio/levels.ts
  - src/render/fx.ts
  - src/render/playerView.ts
  - src/render/objectView.ts
  - src/render/rig/rigs/edge.ts
  - src/render/rig/rigs/string.ts
  - src/ui/words.ts
  - src/ui/icons.ts
  - src/ui/screens/controls.ts
  - src/game/gamepad.ts
  - src/game/input.ts
---

## What to build

One new special each for the Sword and for the Bow, chosen by the player from three that were put to them (a regular one, a unique one, and one that belongs to the bounce): the **Whirlwind** for the Sword, in place of the Riposte, and the **Hook Shot** for the Bow, in place of the Ringstone. The three upgrades each class had for its old special, and the synergy between them, are rebuilt round the new one.

## Done when

- Each special changes an outcome (tests), and each rebuilt upgrade does what its card says (one test each).
- A bot uses the special of its class.
- Both are seen working in the real page.

## As built

**The Whirlwind** (Sword, 6 s). One turn of the blade: everything within 2.6 tiles is cut for 16 and thrown outward, a raised shield is knocked open, every enemy shot in the circle goes home to whoever fired it (a bomb on the floor is batted back at its thrower), and nothing hurts the Sword while the blade goes round. A cut asked for meanwhile follows the moment the blade has come round. Its upgrades: *Tempered Spin* (further reach; doubled swings after a Whirlwind that met anything), *Counterweight* (what it throws lies dazed where it comes down, and is marked), *Encore* (three things cut or sent back and it is ready again at once), and the synergy *Second Spin* (it goes round twice, wider the second time, striking in flight what the first turn threw: a Return).

**The Hook Shot** (Bow, 7 s). A line fired at the aimed point, up to 9 tiles, stopping at the first wall. The Bow is pulled along it, over pits and through enemies, which are struck for 6 and knocked off the line; nothing hurts it on the way. The next three arrows after landing leave at once. A dash cannot cut the Bow loose from its line (there may be a pit under it). Its upgrades: *Long Line* (further, and ready sooner), *Barbed Line* (what it passes takes more and is thrown harder), *Full Quiver* (more arrows at once, each with another ricochet; the one unlocked between runs), and the synergy *Slingshot* (for a moment after landing the line can be fired once more for nothing).

The Riposte and the Ringstone are gone from the game, with everything that only they used (the guard state, the stones in the chamber, their sounds and views). The sounds they shared with other things were kept under plainer names.

A controller now aims as far as the longest line reaches, and with its aiming stick at rest aims a full line ahead of the feet.
