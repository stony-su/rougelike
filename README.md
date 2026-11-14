# RESOUND

A co-op isometric action roguelike for the browser, for one to three players on separate laptops. Nothing you strike ever settles: send it back.

Built with TypeScript (strict), PixiJS v8 and Vite. Everything on screen is drawn in code; there are no image, font or audio files.

The full design is in [DESIGN.md](DESIGN.md). The game is being built in milestones (DESIGN.md, section 14); this file describes what runs today.

## Where the build stands

**Milestone 0 (foundation) is done.** The simulation supports several players in one world, is driven only by integer inputs through a single deterministic session, and computes the same bits on every engine (checked in Node, Chrome and Edge). What you can play right now is a practice court: one character with a three-swing combo and a dash against waves that get deeper each time they are cleared. The three classes, the bounce rules, generated chambers, co-op over the network and everything else in DESIGN.md come in the milestones after it.

## Install and run

You need Node.js 22.12 or newer.

```bash
npm install        # once
npm run dev        # start the dev server, then open the printed URL (http://localhost:5173)
```

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally (dist/ must be served, not opened from file://)
```

```bash
npm run typecheck  # TypeScript, strict; also compiles the simulation without any DOM types
npm test           # headless logic tests (vitest)
npm run check      # typecheck, tests and a production build in one go
npm run selftest   # with `npm run preview` running: the pinned game in installed Chrome and Edge
```

## Controls (so far)

| Input | Action |
|---|---|
| W A S D or arrow keys | Move |
| Mouse | Aim |
| Left mouse (or J) | Attack: three-swing combo |
| Space or Shift | Dash |
| Esc or P | Pause |

## Project layout

```
src/
  main.ts      boot
  core/        deterministic math, seeded random numbers, geometry, isometric projection
  sim/         the game as pure logic on a fixed 60 Hz step: session, world, players, enemies
  content/     typed data: rooms, enemies
  net/         the relay core that turns inputs into one bundle per tick, and its transports
  render/      PixiJS: layers, camera, room art, rigs, effects
  ui/          lettering, widgets, the HUD
  game/        the shell: input devices, the frame, wiring
tests/         vitest suites (no browser needed)
scripts/       browser checks driven through your installed Chrome or Edge
```

Rules that hold the code together, each enforced by a test (`tests/boundary.test.ts`):

1. `src/core`, `src/sim`, `src/content` and `src/net` never import PixiJS and never touch the DOM. The whole game can be simulated headless.
2. **The simulation uses exact arithmetic only.** Trigonometry and exponentials come from `src/core/dmath.ts`, which is built from `+ − × ÷` and `sqrt` and whose results are pinned bit for bit; the engine's own `Math.sin` and friends are banned from everything the simulation can reach. This is what lets several laptops run the same game in step.
3. **One path changes the game.** Only `stepSession` (`src/sim/session.ts`) changes state, one tick per bundle of inputs and commands. The shell and the renderer read state and send inputs; they never call the modules that mutate a world.
4. The simulation keeps no module-level mutable state, and its state is plain data that can be snapshotted and hashed (`src/sim/snapshot.ts`).
5. Colours live in `src/render/palette.ts`. Shapes are built once and animated by transforms; filters sit on whole layers, never on single objects.

## Development tools

- `?debug` in the URL shows frame timing and exposes `window.__resound` for scripted checks.
- `?seed=123` fixes the random seed.
- `?autopilot=sword` lets a bot play your seat; `?bots=2` adds two bot-played seats so three players share the court.
- `?stress=40` keeps forty enemies alive and nobody can be hurt (for frame-time checks).
- `?gallery=thrum` (or `all`) shows every animation state of a rig as a filmstrip; add `&away`, `&silhouette` or `&live`.
- `?selftest` plays a pinned three-player game headless in the page and prints its hashes.
- `npm run shot -- --url "http://localhost:5173/?debug=1" --out name` takes a screenshot through your installed Chrome or Edge (no browser download) and reports console errors. A `--steps file.json` script can hold keys, move the mouse and take several shots; see the header of `scripts/shot.mjs`.
