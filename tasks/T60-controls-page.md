---
id: T60
title: Controls page: keyboard and controller
status: done
owner: stony-su
milestone: 4
weight: 1
needs: [T23]
files:
  - src/ui/screens/controls.ts
  - src/ui/glyphs.ts
touches: []
---

## What to build

Two pages drawn in code, one for keyboard and mouse and one for a controller, reached from the start menu and from the pause menu (DESIGN.md section 12). The page of the device last used comes up first. Keys and buttons are drawn from simple shapes.

## As built

- Each line of a page is a small drawing, the name of the action, and a sentence about it. The drawings are in `src/ui/glyphs.ts`: key caps, the four movement keys, a mouse with one button lit, a stick, a trigger, the face buttons with one lit, the d-pad and Start.
- Looked at in screenshots at 1280 by 720 and at 1920 by 1080; left and right turn the page with either device, and a tab can be clicked.

## Done when

- Both pages have been looked at in screenshots at 1280 by 720 and 1920 by 1080: nothing overlaps and nothing is cut off.
- Either device turns the page and leaves it.
