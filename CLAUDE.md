# RESOUND

A co-op isometric action roguelike in the browser: TypeScript (strict), PixiJS v8, Vite. Everything is drawn and synthesized in code; there are no asset files. `DESIGN.md` is the design, `README.md` is how to run it, `CONTRIBUTING.md` is how several people work on it at once, `PROGRESS.md` is where it stands.

## Before you change anything

Several people build this at the same time, each with their own session. The work is divided into tasks in `tasks/`, and every task lists the files it may change. Two tasks in progress never list the same file; that is what keeps branches from colliding.

1. Run `npm run tasks` and find the task of the person you are working for (their git name is the owner). If they have none, help them pick one from "Ready to take" and claim it: `npm run tasks -- claim T31`.
2. Work on that task, on its branch (`task/T31-some-words`), inside the files it lists under `files` and `touches`.
3. If the work needs a file that is not listed, follow the table in `CONTRIBUTING.md` ("Build it"). If the file belongs to a task somebody else has in progress, say so and stop; do not edit it.
4. If you are asked for something that is no task on the board, say which tasks own the files it would change before you start, and offer to add a task file for it.
5. Before you call the work finished: `npm run check`, then `npm run tasks -- scope`.
6. Never edit `PROGRESS.md` by hand; it is written by `npm run progress`, on `main` only.
7. Push, and open or merge pull requests, only when your user asks you to.

## Commands

```
npm run dev            the game alone (http://localhost:5173)
npm run host           build, then serve the game and the co-op relay on this network
npm run check          layout, types, every test, production build: the gate for every change
npm run format         lay the code out (the only formatter; do not use another)
npm run repin          pin the hashes of the fixed game again, after a deliberate change to the rules
npm run tasks          the task board (claim, done, release, scope, check)
npm run progress       write PROGRESS.md from the board
npx vitest run tests/<file>.test.ts     one test file
npm run look -- --query "debug&class=bow" --out name     build, then drive the real page in Chrome and take screenshots (.verify/)
```

## Shape of the code

- `src/core` exact arithmetic (`dmath.ts`), seeded generator, isometric projection.
- `src/sim` the game itself, headless and deterministic. `session.ts` owns the run; `stepSession` is the only thing that changes anything. One world per chamber (`world.ts`); bodies, shots, classes, enemies and waves each have a file.
- `src/content` data: enemies, hand-built rooms, upgrades. One file per thing, picked up by itself.
- `src/net` and `server/` co-op: lockstep over a relay on the host's laptop, with a referee and repair.
- `src/render` drawing with PixiJS: layers (`stage.ts`), rigs animated by transforms (`rig/`), the shader backdrop, effects, and `extras/` (one file per small piece of presentation).
- `src/ui`, `src/audio`, `src/game` interface, synthesized sound, and the shell that ties input, the driver and the views together.
- `tests/` rule tests, pretend-network tests, and the guards (`boundary.test.ts`, `workspace.test.ts`).

## Rules the tests enforce

- The simulation gives the same bits on every machine: in `src/sim`, `src/core`, `src/content` and `src/net` use `src/core/dmath.ts` instead of `Math.sin`, `cos`, `atan2`, `exp`, `pow`, `hypot` and `**`; the world's seeded generator instead of `Math.random`; no clock; no module-level `let`. The word "window" is refused there too, so name a span of time something else.
- Presentation (`src/render`, `src/ui`, `src/audio`, `src/game`) reads the world and never calls the parts of `src/sim` that change it. `src/sim/preview.ts` is the read-only way in.
- Colour literals only in `src/render/palette.ts` and `src/render/palette/`. Filters only in `src/render/stage.ts`.
- No stubs and no notes-to-self in `src` (the words are refused): finish it or leave it out.
- No browser feature that needs https.
- One thing per file in `src/content/enemies`, `src/content/rooms`, `src/render/rig/rigs` and `src/render/extras`, named after its file.

## Habits that have saved time here

- A change to the rules moves `tests/golden.json`. That is expected: run `npm run repin` and say in the commit why the game changed.
- Characters and props are built from the solids in `src/render/rig/solids.ts` and from shaders, not from hand-traced outlines.
- Check a visual change in the real page with `npm run look` before saying it works. It serves its own build on a free port, so it needs no dev server and does not disturb anyone else's.
- This machine may have a dev server on port 5173 that belongs to the user. Leave it running; use another port.
