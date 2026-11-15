---
id: T91
title: Upgrades you can see working
status: open
owner:
milestone: 8
weight: 1.5
needs: []
files:
  - src/render/extras/upgradeFx.ts
touches:
  - src/render/fx.ts
  - src/render/playerView.ts
  - src/render/projectileView.ts
  - src/render/enemyView.ts
---

## What to build

When an upgrade does something, it should show: a burn burns, a chill frosts, a mark sits on its target, a buffed swing glows, a bolt of lightning is drawn. Go through every upgrade and give its effect a sign.

## Done when

- Every upgrade either changes what is drawn when it acts or is listed with the reason it needs no sign.
