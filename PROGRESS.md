# RESOUND: progress

<!-- Written by "npm run progress" from the files in tasks/. Do not edit it by hand: change the task files and run that again. -->

Where the build stands and what is left. The design is in [DESIGN.md](DESIGN.md), how to run the game is in [README.md](README.md), and how to take one of the tasks below is in [CONTRIBUTING.md](CONTRIBUTING.md).

**Overall: about 87% complete.** 30 of 40 tasks are done, 0 in progress, 7 ready to take, 3 waiting on others. Each task counts for its share of the whole game.

| # | Milestone | Share | Done |
|---|---|---|---|
| 0 | Foundation: deterministic simulation, sessions, snapshots | 7.2% | 100% |
| 1 | The Rebound: three classes, bouncing bodies and shots, Rally, controller | 16.3% | 100% |
| 2 | Together: host program, lobby, staying in step, repair, revive, Duets | 10.9% | 100% |
| 3 | Chambers: generated rooms, shader backdrops, the route, follow camera | 12.2% | 100% |
| 4 | A run you can win: upgrades, side-chambers, camp, wager, two bosses, screens | 24.9% | 89% |
| 5 | Full content: every Tuning and Harmony, more Echoes, elites | 20.4% | 76% |
| 6 | Menus, saving, sound | 4.5% | 60% |
| 7 | Polish and balance | 3.6% | 0% |

## In progress

Nothing at the moment.

## To do: ready to take

- [T21](tasks/T21-side-chambers.md) **Solo side-chambers: each player their own way, then together again** (2.7% of the game)
- [T32](tasks/T32-tunings-fist.md) **Tunings: the Fist (ten, and three Harmonies)** (2.3% of the game)
- [T42](tasks/T42-echo-skirl.md) **Echo: the Skirl** (0.9% of the game)
- [T62](tasks/T62-title-shader.md) **Shader title screen and class cards** (0.9% of the game)
- [T63](tasks/T63-edge-markers.md) **Edge markers for teammates and threats off screen** (0.5% of the game)
- [T66](tasks/T66-music.md) **Music beds and sound levels** (0.9% of the game)
- [T71](tasks/T71-performance.md) **Performance pass** (0.9% of the game)

## To do: waiting on other tasks

- [T52](tasks/T52-side-kinds.md) **Side-chamber kinds: Proving, Cache, Echo Duel** (1.4%): needs T21
- [T70](tasks/T70-balance.md) **Balance, by bots playing whole runs** (1.8%): needs T32
- [T72](tasks/T72-final-check.md) **Final check: a run won and a run lost, and the last README** (0.9%): needs T70, T71

## Done

- [T00](tasks/T00-foundation.md) Foundation: one deterministic session
- [T01](tasks/T01-rebound.md) The Rebound: three classes, bouncing bodies and shots, Rally
- [T02](tasks/T02-together.md) Together: host program, lobby, staying in step
- [T03](tasks/T03-room-generator.md) Room generator: five shapes with terrain
- [T04](tasks/T04-shader-backdrop.md) Shader backdrop under the floating chamber
- [T10](tasks/T10-run-route.md) Run route: twelve generated chambers over two zones
- [T11](tasks/T11-follow-camera.md) Camera that follows your own player
- [T20](tasks/T20-upgrade-engine.md) Upgrade engine: Tunings on players, a draft after every fight
- [T22](tasks/T22-boss-framework.md) Boss framework and Echo traits
- [T23](tasks/T23-app-shell.md) App shell: title, class select, pause, results, instant restart
- [T24](tasks/T24-saving-attunement.md) Saving and the Attunement (permanent progression)
- [T30](tasks/T30-tunings-sword.md) Tunings: the Sword (ten, and three Harmonies)
- [T31](tasks/T31-tunings-bow.md) Tunings: the Bow (ten, and three Harmonies)
- [T33](tasks/T33-tunings-common.md) Tunings: the common twelve, and three Harmonies
- [T34](tasks/T34-tuning-looks.md) Tunings you can tell apart at a glance
- [T35](tasks/T35-attack-combos.md) A combo of moves for every basic attack
- [T40](tasks/T40-echo-gong.md) Echo: the Gong
- [T41](tasks/T41-echo-cairn.md) Echo: the Cairn
- [T43](tasks/T43-elites.md) Elites: five traits and their aura
- [T44](tasks/T44-boss-carillon.md) Mini-boss: the Carillon
- [T45](tasks/T45-boss-toll.md) Final boss: the Toll, in three phases
- [T46](tasks/T46-boss-patterns.md) Bosses that fill their floor: bigger, with more and faster attacks
- [T47](tasks/T47-echo-movement.md) Echoes that surround, flank and reposition
- [T48](tasks/T48-traps.md) Traps in the floor
- [T50](tasks/T50-camp.md) Camp: the Tuner (shop) and the Still Pool (rest)
- [T51](tasks/T51-wager.md) The Wager, and the Brittle Discord
- [T60](tasks/T60-controls-page.md) Controls page: keyboard and controller
- [T61](tasks/T61-settings-rumble.md) Settings and controller rumble
- [T64](tasks/T64-floor-ripples.md) Floor ripples where things bounce
- [T65](tasks/T65-crater.md) The Crater: the third biome, for the last chamber

## Future plans: designed, kept for later

These are written up in DESIGN.md section 15 and are not tasks of this build. To bring one in, add a task file for it.

- **Biomes:** Glasswood (violet crystal forest, many bumpers) and the Cinder Terraces (basalt over lava).
- **Harmonies:** Thunderhead, Slipstream, Frostline, Parting Shot, Meteor, Bull Rush.
- **Discords:** Mute (no Rally) and Heavy Air (shots and bodies lose speed sooner).
- **Watching a teammate's side-chamber** while you wait (this build shows a waiting panel).

## Not verified, and why

- **Three real laptops on Wi-Fi.** Checked instead: three browser pages on one machine through its network address, and a pretend network in tests with lag, jitter, a stall, a drop-out and a corrupted laptop.
- **A real controller in real hands.** Checked instead: the mapping in tests, and a scripted controller driving the game in Chrome.
- **How it sounds.** Nobody has listened to the sound.
- **How it feels to play.** Bots clear chambers with every class; no person has played this build.
- **Browsers other than Chrome and Edge.**
- **The checks on GitHub** (`.github/workflows/check.yml`) have not run yet: nothing has been pushed since they were written.
