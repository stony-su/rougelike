---
id: T63
title: Edge markers for teammates and threats off screen
status: done
owner: stony-su
milestone: 5
weight: 0.5
needs: [T11]
files:
  - src/render/extras/edgeMarkers.ts
touches: []
---

## What to build

With a camera that follows you, things happen off screen. Small markers at the screen's edge point to teammates (in their colour) and to threats (an Echo winding up a shot, a shot coming in, a bomb circle) in the danger colour. One extra, in one file: see `src/render/extras/README.md`.

## As built

- One extra, `src/render/extras/edgeMarkers.ts`: a pool of ten chevrons on the overlay, each on a dark disc so that it reads over a floor full of warnings. A teammate off screen gets one in their own colour with a ring round it (it beats while they are down); an Echo winding up something it shoots or throws gets one in the danger colour; so does a shot that is flying toward this laptop's player and will pass within two and a half tiles. Each sits 34 px inside the edge, on the line from the middle of the screen to what it points at.
- A bomb's circle off screen gets none: it cannot hurt anyone who is not walking toward it, and the marker for whoever threw it has already said so.
- Looked at in the stress scene (`?debug&team=sword,bow,fist&stress=10&stop=9`, this laptop's player walked into a corner): two teammates' markers and one for an Echo taking aim, all at the edge they were beyond, and none for anything on screen.

## Done when

- A browser run in a big chamber shows a marker for a teammate off screen and for a Piper winding up off screen, and none for things on screen.
