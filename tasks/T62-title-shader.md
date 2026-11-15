---
id: T62
title: Shader title screen and class cards
status: done
owner: stony-su
milestone: 6
weight: 1
needs: [T23]
files:
  - src/render/titleBackdrop.ts
  - src/ui/classCards.ts
touches:
  - src/ui/screens/title.ts
  - src/ui/screens/classSelect.ts
---

## What to build

A fragment-shader backdrop for the title (rings spreading from a bell), and on the class screen a short "how it fights" card for each class with its rig playing the moves.

## As built

Both screens were built with the app shell (T23), and neither of the two files named above was needed:

- **The title** is drawn over the Crater's standing rings: the same fragment shader the last chamber uses (`src/render/backdrop.ts`, behind the menus as `MenuBackdrop` in `src/game/app.ts`), at half resolution, tolling by itself every few seconds and when something is chosen.
- **The class screen** (`src/ui/screens/classSelect.ts`) has a card for each class with its Returner going through its moves while the card is pointed at, and a few lines on how it attacks, what its special does and how it plays. This task added each class's health to its card (they are no longer equally sturdy), and the lines for what a jab, the Break and a Riposte now do.
- **Measured** on this laptop's integrated graphics, a 1600 x 900 page: 16.7 ms a frame on both screens at one pixel for one. At two pixels for one (a 3200 x 1800 picture) the title takes 19 ms and the class screen 25 ms: the render scale of T71 works inside a game and not on the menus, so on such a screen the menus run at 40 to 50 frames a second at full sharpness. Not mended here.

## Done when

- The title holds 60 frames a second at half resolution on integrated graphics.
- The screens have been looked at in screenshots.
