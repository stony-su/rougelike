# SNAPLINE

An isometric action roguelike for the browser. You plant three surveyor's stakes and fight with the lines strung between them, walking a living triangle across a land that refuses to be mapped.

Built with TypeScript (strict), PixiJS v8 and Vite. Everything on screen is drawn in code; there are no image, font or audio files.

The full design is in [DESIGN.md](DESIGN.md).

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
```

## Controls

| Input | Action |
|---|---|
| W A S D or arrow keys | Move |
| Mouse | Aim |
| Left mouse (or J) | Ranging Rod: three-swing combo |
| Right mouse (or K) | Plumb Shot |
| Space or Shift | Dash |
| E or Q | Stake: plant one, or whip the oldest one to you |
| F | Interact |
| Tab (hold) | Show your Field Kit |
| Esc or P | Pause |
| R | Restart (death and victory screens; pause menu during a run) |
| M | Mute |

## Project layout

```
src/
  main.ts      boot
  core/        math, seeded random numbers, easing, geometry, isometric projection
  sim/         the game as pure logic on a fixed 60 Hz step
  content/     typed data: rooms, enemies, upgrades
  render/      PixiJS: layers, camera, room art, rigs, effects
  game/        the frame loop, input, wiring
tests/         vitest suites (no browser needed)
scripts/       browser checks driven through your installed Chrome
```

Three rules hold the code together, and tests enforce them:

1. `src/core`, `src/sim` and `src/content` never import PixiJS, never touch the DOM, and take all randomness from a seeded generator. The whole game can be simulated headless.
2. Colours live in `src/render/palette.ts`. Chalk yellow and white-hot belong to the player's geometry; pink-red belongs to danger.
3. Shapes are built once and animated by transforms; filters sit on whole layers, never on single objects.

## Development tools

- `?debug` in the URL shows frame timing and exposes `window.__snapline` for scripted checks.
- `?seed=123` fixes the random seed.
- `npm run shot -- --url "http://localhost:5173/?debug=1" --out name` takes a screenshot through your installed Chrome or Edge (no browser download) and reports console errors. A `--steps file.json` script can hold keys, move the mouse and take several shots; see the header of `scripts/shot.mjs`.
