# RESOUND: progress

Where the build stands, what is next, and what is kept for later. Updated at every commit.
The design is in [DESIGN.md](DESIGN.md); how to run the game is in [README.md](README.md).

**Overall: about 46% complete.** (Each milestone's share of the whole is given below; the figure is the sum of what is done.)

| # | Milestone | Share | Done | State |
|---|---|---|---|---|
| 0 | Foundation: deterministic simulation, sessions, snapshots | 8% | 100% | Done |
| 1 | The Rebound: three classes, bouncing bodies and shots, Rally, controller | 18% | 100% | Done |
| 2 | Together: host program, lobby, staying in step, repair, revive, Duets | 12% | 100% | Done |
| 3 | Chambers: generated rooms, two looks, shader backdrops, follow camera | 14% | 50% | In progress. Generator and shader backdrop are built and tested; the run does not use the generator yet, and there is no follow camera |
| 4 | A run you can win: route, upgrades, shop, rest, wager, two bosses, screens | 26% | 0% | |
| 5 | Full content: remaining upgrades and Harmonies, more Echoes, elites | 10% | 0% | |
| 6 | Menus, saving, sound | 8% | 30% | Sound engine written; menus and saving not started |
| 7 | Polish and balance | 4% | 0% | |

## To do, in order

### Now: chambers (milestone 3)
- [x] Room generator: five shapes (court, cross, lobes, ring, cavern), walls, cut corners, posts, bumpers, pits (`src/sim/roomgen.ts`, tested over 800 rooms)
- [ ] Use the generator for the chambers of the run (the session still takes the two hand-built rooms in turn)
- [ ] Camera that follows your own player
- [x] GLSL backdrop under the floating chamber, with a ring across it at every bounce (Reedwater water and Stormshelf cloud sea are wired in; the Crater rings are in the shader but have no zone yet)
- [ ] Upgrade engine: the numbers every Tuning changes are written (`src/sim/mods.ts`); the rules do not read them yet, and no Tunings are defined
- [ ] GLSL floor ripples where things bounce

### Then: a run you can win (milestone 4)
- [ ] Twelve-chamber route over two zones, with solo side-chambers
- [ ] Upgrade engine and drafts: class Tunings, common Tunings
- [ ] Camp: the Tuner (shop) and the Still Pool (rest)
- [ ] The Wager (risk for reward), with the Brittle Discord
- [ ] Gong and Cairn; elites
- [ ] Mini-boss: the Carillon. Final boss: the Toll, three phases
- [ ] Title, class select, controls page, pause, results (won and lost), instant restart
- [ ] Permanent progression saved in the browser

### After that (milestones 5 to 7)
- [ ] The rest of the Tunings and the twelve Harmonies
- [ ] The Skirl; side-chamber kinds
- [ ] Settings, rumble, music beds
- [ ] Balance by bots; performance pass

## Done
- [x] Deterministic simulation: identical in Node, Chrome and Edge, bit for bit
- [x] Collision shape, one shared cast, exact wall bounces
- [x] Launched bodies: wall slams, caroms with chains, ring-outs, bumpers, stagger
- [x] Shots that ricochet, skip and change sides; bombs; Ringstones
- [x] Sword, Bow and Fist, each with a special; the held Haymaker
- [x] Rally; the Bow's aim preview (exactly the path flown)
- [x] Thrum, Piper and Burr; pathfinding round pits
- [x] Keyboard and mouse, and controller (ignores a stuck or idle controller)
- [x] Walled practice court; trails; HUD with Rally meter and special dial
- [x] Host program (`npm run host`), lobby, playout buffer, hash checks, repair of a drifted laptop, rejoin
- [x] Three browser pages through the network address stay in one game (scripted check)
- [x] Sound engine, scale and recipes, wired in; M mutes
- [x] Bow hero and Burr as geometric characters; the bowstring; a finished bomb with a countdown ring
- [x] The survey look (contour rings, hexagon pillars) back as a second chamber look, alternating with the court
- [x] Downed players crawl; a teammate revives them by standing close
- [x] Duets: an arrow banked off a teammate's blade, a launched body struck again in flight

## Kept for later (designed, not in this build)
See DESIGN.md section 15.
- Biomes: Glasswood, Cinder Terraces
- Harmonies: Thunderhead, Slipstream, Frostline, Parting Shot, Meteor, Bull Rush
- Discords: Mute, Heavy Air
- Watching a teammate's side-chamber (a waiting panel instead)

## Not verified, and why
- **Three real laptops on Wi-Fi.** Checked instead: three browser pages on one machine through its network address, and a simulated network in tests with lag, jitter, a stall, a drop-out and a corrupted laptop.
- **A real controller in real hands.** Checked instead: the mapping in tests, and a scripted fake controller driving the game in Chrome.
- **How it sounds.** Nobody has listened to the sound.
- **How it feels to play.** Bots clear the court with every class; no person has played this build.
- **Browsers other than Chrome and Edge.**
