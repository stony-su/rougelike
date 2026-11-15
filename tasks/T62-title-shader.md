---
id: T62
title: Shader title screen and class cards
status: open
owner:
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

## Done when

- The title holds 60 frames a second at half resolution on integrated graphics.
- The screens have been looked at in screenshots.
