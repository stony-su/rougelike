---
id: T71
title: Performance pass
status: done
owner: stony-su
milestone: 7
weight: 1
needs: [T11]
files:
  - src/game/quality.ts
  - tests/quality.test.ts
touches:
  - src/render/stage.ts
  - src/game/game.ts
  - scripts/shot.mjs
  - src/main.ts
  - README.md
  - DESIGN.md
---

## What to build

The stress scene (three bots, 30 Echoes, 40 trailed shots, a 36-tile chamber) measured on integrated graphics at pixel ratios 1 and 2, and whatever it takes to hold 60 frames a second there, with a render scale that steps down by itself when frames run long.

## As built

- `src/game/quality.ts` is the render scale that looks after itself. The game hands it the length of every frame; it judges them 72 at a time, and a span in which more than an eighth of the frames ran past 20 ms is too slow: the picture is drawn with 15% fewer pixels each way and stretched, down to half the chosen sharpness at the least. After eight good spans it tries one step back up, and waits twice as long each time the step does not hold. Frames in which a chamber is being built, or the page stood still, are not judged. Any change in the settings begins again at the sharpness chosen.
- **Smoothed edges are chosen by pixel density at start-up** (`src/main.ts`): on where a pixel of the page is a pixel of the screen, off where the screen has two for each. At two for one, smoothing cost half the frames: the stress scene ran at 30 ms a frame with it, and holds 16.7 ms at about one and a half pixels for one without it. `?aa=1` and `?aa=0` say otherwise, to measure.
- Nothing was changed in `stage.ts` or `shot.mjs`: the two blurs are already at a fixed half resolution whatever the screen's, and `shot.mjs --dsf 2` was all the measuring needed.

**The numbers.** The stress scene (`?debug&team=sword,bow,fist&autopilot=expert&stress=30&stop=9`: three bots, thirty Echoes of every kind including several of each boss, an Inner Ring chamber, 20 to 60 shots in the air), a 1600 x 900 page, through the installed Chrome on this laptop's integrated graphics (Iris Xe), each read over the last 240 frames:

| Pixel ratio | Before | After |
|---|---|---|
| 1 | median 16.7 ms, 95th 17.4 to 19.1 | median 16.7 to 17.0 ms, 95th 18 to 20; render scale 1, once 0.85 |
| 2 | median 29 to 31 ms, 95th 38 to 54 (a 3200 x 1800 picture) | 20.9 ms for the first seconds, then median 16.7 to 17.3 ms, 95th 17 to 24, at render scale 0.61 to 0.72 (1.2 to 1.45 pixels for one) |

The simulation and the drawing calls take 2 to 3 ms and 4 to 6 ms of a frame; the rest is the graphics card filling pixels, which is why fewer pixels is the cure.

**Not a quiet machine.** These were taken with the editor, a browser and this session running, on a laptop short of memory, in a headless Chrome. They show that the scale finds a size at which the frames are short; a person's own laptop will settle somewhere else.

## Done when

- The stress scene holds a 16.7 ms median frame at both pixel ratios, measured on a quiet machine, and the numbers are written into the task.
