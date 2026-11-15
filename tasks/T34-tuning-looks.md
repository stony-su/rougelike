---
id: T34
title: Tunings you can tell apart at a glance
status: done
owner: stony-su
milestone: 5
weight: 1.5
needs: [T20]
files:
  - src/ui/icons.ts
  - src/ui/cards.ts
  - src/render/palette/tones.ts
touches:
  - src/sim/mods.ts
  - src/content/tunings/*.ts
  - src/ui/draftScreen.ts
  - src/ui/hud.ts
  - src/render/fx.ts
  - src/game/game.ts
---

## What to build

From play-testing: the cards are all words. Give every Tuning a look that says what it is before it is read.

- An **emblem** for each Tuning, drawn in code from simple shapes (a dash streak, a heart, a flame, a snowflake, a bolt, a ring, a coin, a ward, an arrow, a fist, a blade).
- A **tone** for each family, as a colour and a pattern on the card: dash, body, Rally, fire, frost, lightning, and one for each class.
- **Rarity** in the frame itself: plain, brass with studs, and gold that shimmers.
- The same tones in play: fire, frost and lightning look like themselves on the Echoes they touch.
- The Tunings a player holds shown as small emblems on the HUD.

## Done when

- Every Tuning in the game has an emblem and a tone (test), and no two families share a colour.
- The draft has been looked at in the real page: the three cards differ at a glance.
