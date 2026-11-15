---
id: T04
title: Shader backdrop under the floating chamber
status: done
owner:
milestone: 3
weight: 3
needs: []
files: []
touches: []
---

## What was built

`src/render/backdrop.ts`: water under the Outer Ring and a cloud sea under the Inner Ring, drawn by a fragment shader at half resolution. Every bounce sends a ring across it, and pits show it through.
