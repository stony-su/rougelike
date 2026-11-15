---
id: T24
title: Saving and the Attunement (permanent progression)
status: done
owner: stony-su
milestone: 6
weight: 2
needs: [T20, T23]
files:
  - src/game/save.ts
  - src/game/codeBox.ts
  - src/sim/boons.ts
  - src/content/attunement.ts
  - src/ui/screens/attunement.ts
  - tests/save.test.ts
touches:
  - src/sim/session.ts
  - src/sim/types.ts
  - src/sim/player.ts
  - src/sim/world.ts
  - src/sim/camp.ts
  - src/net/protocol.ts
  - src/net/hostCore.ts
  - src/net/clientCore.ts
  - src/game/app.ts
  - src/game/coop.ts
  - src/game/connection.ts
  - src/game/game.ts
  - src/ui/screen.ts
  - src/ui/screens/results.ts
  - src/ui/draftScreen.ts
  - tests/protocol.test.ts
  - tests/golden.json
  - README.md
---

## What to build

What you keep between runs (DESIGN.md section 8). Resonance is earned for every chamber and boss and spent at the Attunement on more health, starting Chimes, rerolls, a faster dash recharge, the three locked Tunings and a starting Tuning per class. Records are kept per class.

It is saved in the browser's `localStorage`, with a version number, and can be written out and read back as a code (a laptop that joins a host keeps its save under the host's address, so people need a way to carry it). In co-op each player's bonuses are sent once in the lobby and fixed for the run.

## As built

- What a player brings to a run is a `Boons` (`src/sim/boons.ts`) in the session's description, so it travels with it and every laptop plays the same game. The session holds every claim to what the Attunement can really give, and to Tunings the class may hold.
- A run is written into the save when it ends, or when it is left from the menu, once. The practice ladder and a run begun partway down the road by a development address earn nothing.
- The entries that unlock a locked Tuning or issue a class one of its own are in the data, and are offered only when those Tunings exist (T30, T31, T32).
- A code is the save as text with a check on it; a box of real text over the game lets it be copied out and pasted in, since a plain http page may not use the clipboard itself.
- Other cards are asked for with R, or X on a controller.

## Done when

- A save survives a reload; an old or damaged save is read without losing what can be read (tests).
- Each bonus changes a run in the stated way (tests).
- The screen works by keyboard and by controller.
- A code written on one address restores the save on another.
