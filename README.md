# RESOUND

A co-op isometric action roguelike for the browser, for one to three players on separate laptops. Nothing you strike ever settles: send it back.

Built with TypeScript (strict), PixiJS v8 and Vite. Everything on screen is drawn in code and every sound is synthesized; there are no image, font or audio files.

The full design is in [DESIGN.md](DESIGN.md). The game is being built in milestones; [PROGRESS.md](PROGRESS.md) tracks what is done, what is next and what is kept for later. This file describes what runs today.

**Building it with others?** The work is divided into tasks that never share a file. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to take one; `npm run tasks` shows the board.

## Where the build stands

**Milestones 1 (the Rebound) and 2 (playing together) are done, and the run has its road.** The signature mechanic is in and playable, alone or with up to three laptops on one network, with keyboard and mouse or a controller:

- **Three classes.** The Sword turns enemy shots back with every swing, bats a lunging enemy away, and has a guard (Riposte) that returns whatever lands in it. The Bow's arrows ricochet off walls and skip between enemies, with an aim preview that shows the exact path, and it throws a Ringstone that redirects shots and bodies. The Fist jabs on the press, and if you keep the button held it draws back for a Haymaker that launches its target; its Break pops everything nearby outward.
- **Everything bounces.** Launched enemies slam into walls, carom into each other, ring off bumpers and fall into pits. Bombs can be batted back or shot where they sit. Hits from anything sent back are *Returns*: they build Rally, and Rally makes Returns hit harder.
- **Three Echoes** to bounce: the Thrum lunges, the Piper plays three bolts down three drawn lines, the Burr lobs bombs.

- **Together.** One laptop hosts; the others open its address. Everyone sees exactly the same game. A downed player crawls and is helped up by a teammate who stands close; an arrow that crosses a teammate's sword swing is banked off the blade, and a body one player launches can be struck again in flight by another (Duets).

- **A run of twelve chambers.** The road is planned from the seed: the Outer Ring, then the Inner Ring, each ending in a camp and its hardest fight. Every chamber is generated (courts, crossings, twin halls, rings round a pit, hollows; two looks; posts, bumpers and pits), and the camera follows you through the big ones. Health and Chimes come along from chamber to chamber, a camp gives some health back, clearing the twelfth wins the run, and the whole party going down loses it. Enter (or A on a controller) starts the next.

- **Tunings.** After every fight each player is dealt three cards on their own screen and takes one (1, 2 or 3, the arrow keys and Enter, the mouse, or a controller). The twelve Tunings anyone can take are in: more dashes, a dash that rams, Rally that steps down instead of breaking, rings that burst and heal as Rally climbs, Returns that burn, chill or call lightning, more health, a ward against a downing blow. Three pairs of them switch on a Harmony when held together.

What is not here yet: the Tunings of the three classes, the solo side-chambers (a side-chamber is a short shared fight for now), the camp's shop, the Wager, the two bosses (their chambers are the hardest fights of their zones for now), menus and saving. [PROGRESS.md](PROGRESS.md) lists all of it.

## Install and run

You need Node.js 22.12 or newer.

```bash
npm install        # once
npm run dev        # start the dev server, then open the printed URL (http://localhost:5173)
```

Alone, press **1**, **2** or **3** to play as the Sword, the Bow or the Fist (the run starts again). The class can also be given in the address: `http://localhost:5173/?class=bow`, and `?team=fist,sword,bow` puts you in the first seat with bots in the others.

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally (dist/ must be served, not opened from file://)
```

## Playing together (1 to 3 laptops on the same network)

On the laptop that will host:

```bash
npm run host       # builds the game, starts the host, and prints two addresses
```

- On the host laptop, open the first address it prints (`http://localhost:5180`).
- On each other laptop, open the second (`http://<the host's address>:5180`) in Chrome or Edge. Nothing needs installing there.
- In the lobby, press **1**, **2** or **3** to choose a class and **Enter** when ready. When everyone is ready, **Enter** starts the game.

If the other laptops cannot connect: Windows asks once whether to allow Node.js on your network, and the answer must be yes for private networks; and guest or public Wi-Fi often keeps laptops from seeing each other (a home network or a phone hotspot does not). Leave the host's window open while you play: closing it ends the game for everyone. A laptop that drops out keeps its seat and rejoins by reloading the page. `npm run host -- --port 5200` uses another port.

To try it alone, open the host's address in two or three browser windows: each window is a player.

```bash
npm run typecheck  # TypeScript, strict; also compiles the simulation without any DOM types
npm test           # headless logic tests (vitest)
npm run check      # typecheck, tests and a production build in one go
npm run selftest   # with `npm run preview` running: the pinned game in installed Chrome and Edge
```

## Controls

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Move | W A S D or arrow keys | Left stick |
| Aim | Mouse | Right stick (with the stick at rest, aim follows your movement and leans toward a nearby enemy) |
| Attack. Hold it: the Fist draws back for a Haymaker, the Bow keeps loosing | Left mouse (or J) | Right trigger (or RB) |
| Special: Riposte / Ringstone / Break | Right mouse (or K) | Left trigger (or LB) |
| Dash | Space or Shift | A |
| Pause | Esc or P | Start |
| Mute | M | |

Whichever device you touched last is the one in use. A controller is read through the browser's Gamepad API in its standard layout; press any button on it once so the browser reports it.

## Project layout

```
src/
  main.ts      boot
  core/        deterministic math, seeded random numbers, geometry, isometric projection
  sim/         the game as pure logic on a fixed 60 Hz step: session, world, classes, bodies, shots, enemies
  content/     typed data, one file per thing and picked up by itself: enemies/, rooms/
  net/         co-op without sockets: the wire format, the host's and a laptop's logic, the playout buffer
server/        the host program: a web server and WebSockets round src/net
  render/      PixiJS: layers, camera, room art, rigs (rig/rigs/, one file each), trails, effects, extras/
  audio/       synthesized sound: the scale, the recipes, what each event sounds like
  ui/          lettering, widgets, the HUD
  game/        the shell: input devices, the frame, wiring, development pages
tests/         vitest suites (no browser needed)
scripts/       the task board, and browser checks driven through your installed Chrome or Edge
tasks/         the task board: one file per task, with its owner and the files it may change
```

Rules that hold the code together, each enforced by a test (`tests/boundary.test.ts`):

1. `src/core`, `src/sim`, `src/content` and `src/net` never import PixiJS and never touch the DOM. The whole game can be simulated headless.
2. **The simulation uses exact arithmetic only.** Trigonometry and exponentials come from `src/core/dmath.ts`, which is built from `+ − × ÷` and `sqrt` and whose results are pinned bit for bit; the engine's own `Math.sin` and friends are banned from everything the simulation can reach. This is what lets several laptops run the same game in step.
3. **One path changes the game.** Only `stepSession` (`src/sim/session.ts`) changes state, one tick per bundle of inputs and commands. The shell and the renderer read state and send inputs; they never call the modules that mutate a world.
4. The simulation keeps no module-level mutable state, and its state is plain data that can be snapshotted and hashed (`src/sim/snapshot.ts`).
5. Colours live in `src/render/palette.ts` (and one file per character or place in `src/render/palette/`). Shapes are built once and animated by transforms; filters sit on whole layers, never on single objects.
6. Enemies, rooms, rigs and extras are one file each, named after what they hold, and nothing lists them by hand (`tests/workspace.test.ts`). The layout of the code is Prettier's (`npm run format`).

Two more that are worth knowing when reading the code:

- **One cast.** Walking, dashing, shots, launched bodies and the Bow's aim preview all move through `src/sim/cast.ts` against the same collision shape (`src/sim/geo.ts`). Walls have one of eight fixed directions, so a bounce off a wall is an exact mirror, and the aim preview is traced by the very code that flies the arrow.
- **Walls by rule.** A wall is drawn tall only where no floor lies behind it on screen; elsewhere it is a kerb. Nothing ever has to be sorted against a wall (`src/render/roomView.ts`).

## Development tools

- `?debug` in the URL shows frame timing and exposes `window.__resound` for scripted checks.
- `?seed=123` fixes the random seed.
- `?class=bow` chooses your class; `?team=sword,bow,fist` fills up to three seats (yours first, bots in the rest).
- `?autopilot=expert` (or `novice`) lets a bot play your seat.
- `?stress=40` keeps forty enemies alive and nobody can be hurt (for frame-time checks).
- `?practice` plays the endless practice ladder in the two hand-built rooms instead of a run.
- `?stop=6` begins the run at that chamber (6 is the Carillon's), to get to a part of the road without walking it.
- `?gallery=edge` (or any rig id, or `all`) shows every animation state of a rig as a filmstrip; add `&away`, `&silhouette` or `&live`.
- `?selftest` plays a pinned three-player game headless in the page and prints its hashes.
- `npm run coop-check -- --port 5180` (with `npm run host` running and nobody in the lobby): three browser pages join through the network address, fight, one is frozen and one reloaded, and the host must not have had to repair anyone.
- `npm run look -- --query "debug&class=bow" --out name` builds the game, serves that build on a free port for as long as the check takes, and runs the next tool against it. Nothing else has to be running.
- `npm run shot -- --url "http://localhost:5173/?debug=1" --out name` takes a screenshot through your installed Chrome or Edge (no browser download) and reports console errors. A `--steps file.json` script can hold keys, move the mouse, run script in the page and take several shots; with `--pad` it also drives a scripted fake controller. See the header of `scripts/shot.mjs`.
