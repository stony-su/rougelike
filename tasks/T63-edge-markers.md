---
id: T63
title: Edge markers for teammates and threats off screen
status: open
owner:
milestone: 5
weight: 0.5
needs: [T11]
files:
  - src/render/extras/edgeMarkers.ts
touches: []
---

## What to build

With a camera that follows you, things happen off screen. Small markers at the screen's edge point to teammates (in their colour) and to threats (an Echo winding up a shot, a shot coming in, a bomb circle) in the danger colour. One extra, in one file: see `src/render/extras/README.md`.

## Done when

- A browser run in a big chamber shows a marker for a teammate off screen and for a Piper winding up off screen, and none for things on screen.
