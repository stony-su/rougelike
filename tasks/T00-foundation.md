---
id: T00
title: Foundation: one deterministic session
status: done
owner:
milestone: 0
weight: 8
needs: []
files: []
touches: []
---

## What was built

A fixed 60 Hz simulation that gives the same bits in Node, Chrome and Edge: exact arithmetic only (`src/core/dmath.ts`), integer inputs, one path that changes the game (`stepSession`), a canonical snapshot and hash, and guard tests that keep it that way (`tests/boundary.test.ts`).
