---
id: T90
title: A tutorial at the start
status: done
owner: stony-su
milestone: 8
weight: 1.5
needs: []
files:
  - src/ui/screens/controls.ts
touches:
  - src/game/app.ts
  - src/ui/screens/title.ts
---

## What to build

Before a first run, a short tutorial: how to move, the basic attack and the special of the class chosen, the dash, and how bouncing things builds the combo and what the combo does. It can be opened again from the title.

## Done when

- A new save is shown the tutorial before its first run, and not again unless asked.
- Looked at in the real page.

## As built

A page, not a played lesson: **How to play** is the first of three pages of the screen that already held the controls. Eight lines with a small picture each: attack (what each class's does), special, dash, bounce hits, Combo (with its real numbers), upgrades and synergies, Coins and camps, and falling. A browser that has not played before is shown it once over the title (it remembers under its own key in the browser's storage, apart from the save); after that it is the third entry of the title, and the pause menu's Controls opens the same screen at the page of the device in hand.

Not built: a room that walks a new player through the moves with their hands on the keys.
