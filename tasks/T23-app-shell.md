---
id: T23
title: App shell: title, class select, pause, results, instant restart
status: open
owner:
milestone: 4
weight: 3
needs: [T10]
files:
  - src/main.ts
  - src/game/app.ts
  - src/game/game.ts
  - src/game/coop.ts
  - src/ui/screens/index.ts
  - src/ui/screens/title.ts
  - src/ui/screens/classSelect.ts
  - src/ui/screens/pause.ts
  - src/ui/screens/results.ts
  - src/ui/widgets.ts
  - src/ui/lobby.ts
touches:
  - src/sim/session.ts
  - src/ui/hud.ts
  - src/game/input.ts
  - index.html
  - README.md
---

## What to build

The game from the first screen to the last (DESIGN.md section 12).

- Title: Play alone, Co-op lobby, Attunement, Controls, Settings. Then class select, the run, and a results screen for a run won and a run lost, with what happened in it. One key starts again at once.
- `src/game/app.ts` owns which screen is up. Each screen is one file in `src/ui/screens/`, picked up by itself, with one small interface (enter, update, act on menu input, leave), so a new screen touches nobody else's file.
- Every screen works with keyboard, mouse and controller, and shows the prompts of the device last used.
- Esc opens your own menu. In co-op that does not stop the game; "pause for everyone" is a separate item that names who paused and that anyone can lift.
- The HUD carries no controls legend.

## Done when

- In the browser, by keyboard and again by a scripted controller: title, class, the run starts; Esc, the pause menu, back to the game.
- Going down shows the lost screen with the run's numbers, and one key starts a new run at once; clearing the last chamber shows the won screen.
- In co-op the party readies up on the results screen and a new run starts on the same connections.
