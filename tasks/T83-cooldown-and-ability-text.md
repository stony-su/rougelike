---
id: T83
title: The special's cooldown under the hero, and what every upgrade does on Tab or on hover
status: done
owner: stony-su
milestone: 8
weight: 1.2
needs: []
files:
  - src/render/extras/specialRing.ts
  - src/ui/abilityPanel.ts
touches:
  - src/ui/hud.ts
  - src/game/game.ts
  - src/game/input.ts
  - src/render/playerView.ts
---

## What to build

Show the special's cooldown on the ring under the hero, where the eyes already are, instead of in a circle at the bottom left. And show what each upgrade a player holds does: while Tab is held, and when the mouse is over its icon.

## As built

- **The ring under the hero is the special's clock** (`src/render/playerView.ts`). While the special is away the ring is dim and a pale arc grows round it from the top; when the arc closes the ring is at full brightness again and beats once. Every player's ring does this, so in co-op a glance says whose special is ready. The dial at the bottom left is gone; the special's name stays there, in the player's colour when it is ready.
- **What the kit does, in words** (`src/ui/abilityPanel.ts`). Pointing at an emblem in the row along the bottom shows that upgrade's name, rank and text in a box above it. Holding **Tab** (the View button on a controller) shows all of it over the fight: the class's attack, special and dash, every upgrade held at the rank it is at, and the pairs that are switched on. Neither stops the game. The controls page names the key.
- The words each class uses for itself are in one file now (`src/ui/words.ts`), read by the class cards, the heads-up display and the sheet.

## Done when

- The ring under the hero fills as the special comes back, and the circle at the bottom left is gone.
- Holding Tab lists every upgrade held with its text; pointing at an icon shows that one.
