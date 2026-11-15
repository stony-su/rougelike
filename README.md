# RESOUND

A co-op isometric action roguelike for the browser, for one to three players on separate laptops. Nothing you strike ever settles: send it back.

Built with TypeScript (strict), PixiJS v8 and Vite. Everything on screen is drawn in code and every sound is synthesized; there are no image, font or audio files.

The full design is in [DESIGN.md](DESIGN.md). The game is being built in milestones; [PROGRESS.md](PROGRESS.md) tracks what is done, what is next and what is kept for later. This file describes what runs today.

**Building it with others?** The work is divided into tasks that never share a file. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to take one; `npm run tasks` shows the board.

## Where the build stands

**A whole run can be played from the first chamber to the Bell**, alone or with up to three laptops on one network, with keyboard and mouse or a controller:

- **Three classes.** The Sword turns enemy shots back with every swing, bats a lunging enemy away, and has a guard (Riposte) that returns whatever lands in it. The Bow's arrows ricochet off walls and skip between enemies, with an aim preview that shows the exact path, and it throws a Ringstone that redirects shots and bodies. The Fist jabs on the press, and if you keep the button held it draws back for a Haymaker that launches its target; its Break pops everything nearby outward.
- **Everything bounces.** Launched enemies slam into walls, carom into each other, ring off bumpers and fall into pits. Bombs can be batted back or shot where they sit. Hits from anything sent back are *Returns*: they build Rally, and Rally makes Returns hit harder.
- **Five Echoes** to bounce: the Thrum lunges, the Piper plays three bolts down three drawn lines, the Burr lobs bombs, the Gong hides behind a shield that only a Return or a blow from behind gets past, and the Cairn slams the floor and throws its own top stone. They do not simply walk at you: they surround, cut off, keep their distance and change ground. The hardest chambers carry **elites** (Resonant, Tethered, Hasty, Plated, Splitting).
- **Traps in the floor** from the second chamber on: plates of spikes, knells that toll in a ring, and pipes that spit thorns down a drawn line. They hurt Echoes too, so a body can be knocked onto them.
- **Two bosses.** The Carillon, a walking frame of bells, holds the sixth chamber; the Toll, the Bell itself, holds the twelfth, in the Crater, and has three phases. Each stands about twice the height of anything else and is seldom doing nothing: the floor fills with warned patterns to read and move through, and every class can send its orbs home.

- **Together.** One laptop hosts; the others open its address. Everyone sees exactly the same game. A downed player crawls and is helped up by a teammate who stands close; an arrow that crosses a teammate's sword swing is banked off the blade, and a body one player launches can be struck again in flight by another (Duets).

- **A run of twelve chambers.** The road is planned from the seed: the Outer Ring, then the Inner Ring, each ending in a camp and its hardest fight. Every chamber is generated (courts, crossings, twin halls, rings round a pit, hollows; two looks; posts, bumpers and pits), and the camera follows you through the big ones. Health, Chimes and Tunings come along from chamber to chamber, clearing the twelfth wins the run, and the whole party going down loses it. Enter (or A on a controller) starts the next.

- **Camps.** Before each boss the road stops at a camp. The **Tuner** sells three Tunings from your own pools, a ration and a fresh shelf, for Chimes; the **Still Pool** gives each player one thing: a third of their health back, or a rank of a Tuning they hold. Everyone shops on their own screen (W S and Enter, the mouse, or a controller), Esc puts the list away to look round and F brings it back, and the party walks on when everyone is ready.

- **Tunings.** After every fight each player is dealt three cards on their own screen and takes one (1, 2 or 3, the arrow keys and Enter, the mouse, or a controller). The twelve Tunings anyone can take are in: more dashes, a dash that rams, Rally that steps down instead of breaking, rings that burst and heal as Rally climbs, Returns that burn, chill or call lightning, more health, a ward against a downing blow. Three pairs of them switch on a Harmony when held together.

- **The Wager.** When the chamber before the Inner Ring's elite is cleared, the party is asked whether it will carry a Discord into the elite's chamber: Brittle, which cuts everyone's health by 30% for the fight. More than half must say yes (1 or 2, the arrow keys and Enter, the mouse, or a controller; ten seconds). Win it and the chamber pays double Chimes and a second card, a rare one.

- **The Attunement.** Every run earns Resonance, win or lose: 1 for each chamber cleared, 5 for the Carillon, 10 for the Toll. It is kept in the browser and spent on the title's Attunement screen: more health, Chimes to begin with, the right to ask for other cards, a quicker dash, more Chimes. Your records as each class are kept there too. In co-op everyone brings their own. Because a browser keeps a save for one address only (and a laptop that joins a host is on the host's address), the same screen writes the save out as a code and reads one back.

- **The Sword's own Tunings.** Ten of them in three builds, drafted alongside the common ones: *Mirror Guard* sends more back (faster returns that go through Echoes, a wider swing whose returns hunt their sender, returns that split into a fan); the *Duelist* lives on the Riposte (a longer guard and doubled swings after it lands, a stun and a mark, a Riposte that is ready again at once); *Edge Wave* makes shots of the Sword's own (a crescent off the third swing, shots you can strike on again, and a Ring Cut all the way round once enough Rally is gained). Three Harmonies join them. The first draft of a run shows one card from each build.

- **The Bow's own Tunings.** Ten in three builds: *Pinball* plays the walls (more ricochets and quicker off each, arrows that burst where they land after two bounces, arrows that bend toward an Echo once they have bounced); *Chain* plays the crowd (more skips from further off, a killing arrow that breaks into pieces, skipped arrows that root what they strike); *Stonework* plays the Ringstone (two stones at once, stones that send things on harder and pulse, stones that draw Echoes in). Heavy Fourth makes every fourth arrow of a held volley a heavy one. Three Harmonies join them.

- **The Fist's own Tunings.** Ten in three builds: *Billiards* makes one body hit many (bodies that plough through the first Echo they meet, caroms that pass on all their motion, a Break that throws harder); *Wall Combo* keeps one body in the air (harder wall slams that stun, a jab that sends a flying body on again, bodies that take more while they fly); *Shockwave* makes every impact a burst (a Haymaker that bursts, a braced stance while the hand is drawn back, bodies that burst at every bounce). Heavy Hands makes heavy bodies hit far harder. Three Harmonies join them.

That makes 42 Tunings and 12 Harmonies; a fresh save drafts from 21 as any class, and the Attunement opens one more for each class and can issue each class one to begin with.

What is not here yet: the solo side-chambers (a side-chamber is a short shared fight for now). [PROGRESS.md](PROGRESS.md) lists all of it.

## Install and run

You need Node.js 22.12 or newer.

```bash
npm install        # once
npm run dev        # start the dev server, then open the printed URL (http://localhost:5173)
```

The game opens on its title. **Play alone**, then choose the Sword, the Bow or the Fist (each card shows how that class fights). In a run, **Esc** (or Start on a controller) opens your menu, which stops the game while you are alone; when a run ends, its numbers come up and **Enter** starts the next at once. Every screen works with the keyboard, the mouse or a controller.

**Controls** (on the title, and in your menu) shows both sets on two pages. In short: move with W A S D, aim with the mouse, attack with the left button (hold it: the Bow keeps loosing, the Fist draws back a Haymaker), special with the right, dash with Space, F to interact, Esc for your menu, M for sound. On a controller: left stick, right stick, right trigger, left trigger, A, X, Start.

**Settings** holds the volume, sound on or off, how much the screen shakes, how sharp the picture is (Light is the quickest on a slow laptop) and whether a controller rumbles. They are kept in the browser between visits.

An address can skip the title: `http://localhost:5173/?class=bow` begins a run as the Bow, and `?team=fist,sword,bow` puts you in the first seat with bots in the others.

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
- On the title, choose **Co-op lobby**. In the lobby, press **1**, **2** or **3** to choose a class and **Enter** when ready. When everyone is ready, **Enter** starts the game. When a run ends, the next begins once everyone has chosen **Go again**.

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
