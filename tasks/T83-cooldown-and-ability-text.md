---
id: T83
title: The special's cooldown under the hero, and what every upgrade does on Tab or on hover
status: open
owner:
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

## Done when

- The ring under the hero fills as the special comes back, and the circle at the bottom left is gone.
- Holding Tab lists every upgrade held with its text; pointing at an icon shows that one.
