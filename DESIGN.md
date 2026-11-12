# SNAPLINE — design document

An isometric action roguelike. You plant three surveyor's stakes and fight with the lines strung between them, walking a living triangle across a land that refuses to be mapped.

Stack: TypeScript (strict), PixiJS v8, Vite. Everything on screen is drawn in code. All sound is synthesized in code.

This document is the specification the game is built from. Numbers are starting values; the balance bots in `src/sim/bots.ts` tune them.

---

## 1. World and tone

The Interior stays solid only where it has been measured. The Survey Office's maps are fading, and wherever a map fades the land under it unravels into ink-beasts called **Errata**. You are **the Chainman**, the Office's last surveyor. You carry the line inward, sheet by sheet, to plant a benchmark at **Point Zero**, where the map is still blank.

Tone: dry, stubborn, quiet. No gods, no underworld, no chosen one. A clerk with a rod, a plumb bob and three stakes, doing the job properly.

Vocabulary used across the game:

| Game term | Meaning |
|---|---|
| Sheet | A room. The HUD title block reads "SHEET 4 OF 12". |
| Errata | Enemies. Killing one "erases" it. |
| Chalk | Run currency, dropped by Errata. |
| Benchmarks | Permanent currency, kept after death. |
| Field Kit | Your upgrades for this run (instruments). |
| Office Ledger | Permanent progression, bought with Benchmarks. |
| Plot | The closed shape between your stakes. |

## 2. Signature mechanic: Running the Line

Damage comes from geometry you draw on the floor, not only from your weapon. It uses one extra key: **E**.

### 2.1 Rules

Units: 1 world unit = 1 tile. The simulation runs at 60 ticks per second.

**Stakes.** You carry 3 stakes (I, II, III). Each is `held`, `flying`, `planted` or `lost`.

**E has one meaning.** If you hold a stake, plant it at your feet. Otherwise, fly your oldest planted stake to you.

- Planting is instant and allowed mid-swing and mid-dash.
- A stake cannot be planted within 0.75 tiles of another; it is pushed out to that distance, then clamped to walkable floor.
- An E press is buffered for 0.25 s if a stake is in flight or the whip lock is running.
- All stakes return to hand when you leave a room. `lost` stakes (eaten) return to hand after 5 s.

**Lines.** Planted stakes link as a ring in plant order. With three stakes that is every pair. A line is *active* when both ends are planted, they are at most **9 tiles** apart (the link range) and the line is not severed. A line longer than the link range is drawn as a faint broken dash and does nothing.

**Trip.** An enemy whose body touches an active line is hit for **12**. Each enemy can be hit by a given line once per **1.0 s**.

**Ripe.** Each line has a clock. It restarts when either end moves or is planted, when the line discharges, and when a sever ends. After **2.5 s** the line turns *ripe*: thick, white-hot, with a snap flash and a chime. The next hit from a ripe line is a *discharge*: **30 damage**, a **0.5 s stun**, and it cancels the enemy's wind-up. The line then restarts its clock.

- A discharge caused by a trip hits only the enemy that tripped it.
- A discharge caused by a whip hits everything the line sweeps.
- After a stun ends an enemy cannot be stunned again for 1.5 s.

**Whip.** When E flies a stake to you, it travels from where it stood to where you stood when you pressed E, in **0.15 s**. Every line attached to that stake sweeps the floor between its old and new position. For each attached line with far end `S`, the swept area is the triangle `(old position, S, new position)`.

- Each enemy touching the swept area is hit once, by the strongest line that covers it. A line that was ripe at take-off spends its discharge on this sweep.
- The hit lands at the moment the moving line passes over the enemy.
- If the total swept area is under **1.5 square tiles**, the whip deals no damage.
- Any stake movement restarts the clocks of the lines attached to it. Mashing E therefore throws ripeness away.
- After the stake lands there is a **0.3 s** whip lock.
- A whip sweep destroys hostile stakes inside it and surfaces burrowing Pegworms under it.

**Plot.** When the ring is closed (every line active) and its area is at least 2 square tiles, the inside is your Plot. Enemies inside are slowed **30%**. Your Rod deals **+25%** to enemies inside the Plot or touching a line. The floor inside the Plot renders bright and crisp: surveyed land.

**Hammer.** The Rod's third swing hammers any of your planted stakes within its arc. Every line attached to that stake turns ripe at once.

**Dash refund.** Dashing across one of your own active lines refunds the dash charge. At most one refund per dash and one per 2 s.

**Tempo.** With three stakes in rotation, each whip sweeps one line that has aged one whip interval and one that has aged two. Whipping every 1.25–2.5 s therefore always carries exactly one ripe line. Slower carries two. Faster carries none. Speed against power is a real choice rather than a cooldown.

### 2.2 How it changes play

- **Moving.** Your old positions are your weapon, so you orbit packs instead of backing away from them. The triangle rolls along with you.
- **Fighting.** Lines wall off chargers and scythe crowds. The Rod finishes what the lines soften and hammers lines ripe.
- **Deciding.** Every couple of seconds: whip now for 12, or hold for a ripe 30? Stand in the Plot for the slow, or leave to drag the triangle somewhere better?

Hades has nothing like it: there, all damage starts at the character. Here it comes from shapes the player draws on the floor.

### 2.3 Legibility (built with the mechanic, not after it)

- **Sweep preview.** While no stake is held, a low-alpha hatch shows exactly what E would sweep right now. It is drawn from the same pure function that resolves the hit. A test asserts that the preview set equals the hit set.
- **Order.** Stakes carry pennant pips I, II, III. The oldest planted stake pulses. The HUD mirrors the queue.
- **Line state.** Unripe: thin, chalk yellow. Ripe: thick, white-hot, one snap flash on turning. Severed: frayed grey stubs. Out of range: faint broken dash.
- **Targets.** Enemies inside the Plot or inside the pending sweep get a chalk rim highlight.
- **Colour law.** Chalk yellow and white-hot are only ever your geometry. Pink-red is only ever danger. Hostile lines are dashed and animated; yours are solid.

### 2.4 Counterplay

Each enemy attacks one rule (section 5). Only one of your stakes can be `lost` at a time. A second sever on an already-severed line does not extend it.

## 3. Verbs

Player: 100 health, speed 5.4 tiles/s, body radius 0.32. Movement is screen-relative with near-instant acceleration. After taking damage the player is invulnerable for 0.6 s.

| Verb | Input | Detail |
|---|---|---|
| Ranging Rod | LMB | Three-swing combo: 10 / 10 / 16 damage, 120° arc (150° on the third), reach 1.9 (2.2). Swing times 0.29 / 0.29 / 0.47 s, each with wind-up, active and recovery. A small step forward on each swing. The third swing knocks enemies back 3.5 tiles (which can shove them across a line) and hammers stakes. Active swings destroy light enemy projectiles. Dash cancels recovery. |
| Plumb Shot | RMB | A bob on a cord: range 7 tiles, 18 damage, 3 s cooldown. It hooks the first enemy on its path and drags it 3 tiles toward you. If the cursor is within 1 tile of one of your planted stakes, it hooks that stake instead and yanks it to you: a whip of a stake you choose. Dragging an enemy across one of your lines refunds 1.5 s of the cooldown. It also uproots hostile stakes. |
| Dash | Space | 4 tiles in 0.18 s, invulnerable, 2 charges, 1.2 s recharge each. Goes in the movement direction, or toward the cursor when standing still. |
| Stake | E | Plant, or whip (section 2). |
| Interact | F | Shrines, stalls, doors that need confirming. |

Input is buffered for 0.15 s (0.25 s for E), so a press made during recovery fires on the first possible tick.

## 4. Upgrades: the Field Kit

After every combat room you choose **1 of 3** instruments. Upgrades attach to geometry, never to ability slots.

### 4.1 Structure

- **Heads** mount on a stake. A Head changes that stake and every line attached to it. One Head per stake. Heads have three ranks. A drafted Head mounts on the first bare stake.
- **Orders** are global rule changes.
- **Splices** are combinations. They are never drafted. When two specific Heads are both mounted, the line joining those two stakes gains the Splice. A combination is literally one edge of your triangle.

Draft rules:

- The first reward of a run always includes a Head.
- Every offer of three contains at least one Order.
- An offered Head shows which Splice it would complete with what you already carry. Offers are weighted toward Heads that complete one.
- Offering a Head you own offers its next rank.
- Once every stake carries a Head, a new Head is offered as an explicit swap (replacing one refunds 15 Chalk), and at most one Head appears per offer.
- Elite rooms, the mini-boss and the risk event guarantee a rare.

### 4.2 Heads (10)

"Its lines" means the lines attached to the stake that carries the Head. A line whose two ends carry different Heads gets both effects. Values are rank 1 / 2 / 3.

| Head | Effect |
|---|---|
| Signal Lamp | Its lines scorch: enemies hit burn for 5 / 8 / 11 damage per second for 3 s. |
| Frost Gauge | Its lines chill: enemies hit are slowed 35 / 45 / 55% for 2.5 s. A discharge freezes them for 1.0 / 1.3 / 1.6 s instead. |
| Station Bell | When one of its lines discharges, a shockwave rings from this stake: 3 tiles, 14 / 20 / 26 damage. |
| Lodestone | The stake pulls enemies within 3.0 / 3.5 / 4.0 tiles toward itself. |
| Heliograph | Its lines reflect enemy projectiles; reflected shots deal 12 / 18 / 24. |
| Vernier | Its lines ripen 30 / 45 / 60% faster. |
| Barbed Chain | Enemies that trip its lines are rooted for 0.7 / 1.0 / 1.3 s (once per enemy per 3 s). |
| Witness Mark | Enemies hit by its lines are Marked for 4 s and take +20 / 30 / 40% from the Rod and Plumb Shot. |
| Spring Stake | When this stake lands from a whip or a yank, it bursts: 2 tiles, 10 / 15 / 20 damage, knockback outward. |
| Anchor Pin | This stake cannot be eaten or shoved and its lines cannot be severed. Its lines deal +2 / 4 / 6. |

### 4.3 Orders (18)

| Order | Effect |
|---|---|
| Quickchalk (2 ranks) | All lines ripen 20 / 35% faster. |
| Homestead | For 4 s after each whip, while you stand in your Plot you take 30% less damage and swing 25% faster. |
| Slingshot | Dashing across one of your ripe lines spends it: the dash travels 2 tiles further and deals the discharge to everything it passes through. |
| Fine Tolerance | Whips from a Plot smaller than 8 square tiles deal +50%. |
| Long Stride | Sustained movement builds up to +25% speed over 3 s. Lost when hit. |
| Surveyor's Eye | Rod hits on enemies in your Plot or on a line are critical (×1.75), replacing the base +25%. |
| Chalk Dust | A whip leaves its swept ground dusted for 3 s: enemies there are slowed 30% and take +15% line damage. |
| Double Entry | Every third whip sweeps twice; the second sweep deals half damage. |
| Datum | Standing still in your Plot for 0.8 s grants a shield that absorbs 15 damage (10 s cooldown). |
| Tally Stick | Each trip grants 1 Chalk (up to 12 per room). Picking up Chalk heals 1 (up to 10 per room). |
| Hammer Drill | The hammer also rings its lines: every enemy touching them takes a line hit at once. |
| Spare Cord | Plumb Shot holds 2 charges and drags 1.5 tiles further. |
| Third Wind | +1 dash charge. |
| Iron Pins | Severed lines mend twice as fast. An eaten stake returns in 2.5 s. |
| Fourth Stake (rare, locked) | Carry four stakes. They link as a ring in plant order: four lines, one four-sided Plot. |
| Backsight (locked) | Plumb Shot on your own stake swaps places with it instead of yanking it. Its lines sweep. |
| Foresight (locked) | The lines from you to your two newest stakes are live: they trip enemies for 8. |
| Offset (locked) | Plumb Shot fired at open ground sends your oldest stake to the impact point, sweeping as it goes. |

"Locked" Orders enter the pool once bought in the Office Ledger.

### 4.4 Splices (8)

| Splice | Heads | Effect on the shared line |
|---|---|---|
| Steamline | Signal Lamp + Frost Gauge | A hit leaves a steam wall along the line for 4 s. It blocks enemy projectiles and scalds for 10 per second. |
| Tolling Furnace | Station Bell + Signal Lamp | The Bell's shockwave ignites every enemy in the Plot. |
| Glacier Haul | Lodestone + Frost Gauge | Enemies chilled by the line slide to the Lodestone and freeze for 1 s on arrival. |
| Sun Dog | Heliograph + Signal Lamp | When the line turns ripe it fires a beam along itself to the walls: 16 damage, ignites. |
| Resonance | Station Bell + Vernier | When the line discharges, your other lines turn ripe at once. |
| Snare | Barbed Chain + Lodestone | Enemies pulled within 1 tile of the Lodestone are rooted for 1.2 s and take 8. |
| Dead Reckoning | Witness Mark + Vernier | When the line turns ripe it lashes the nearest Marked enemy within 6 tiles with a discharge. |
| Recoil | Spring Stake + Anchor Pin | The Spring burst also fires at the Anchor Pin, and both bursts knock enemies toward each other. |

Pool: 28 drafted instruments (10 Heads, 18 Orders) plus 8 Splices.

Build archetypes that fall out of this: a static **Fortress** (Homestead, Datum, Station Bell, Anchor Pin), a restless **Leapfrog** (Quickchalk, Slingshot, Long Stride, Spring Stake), a Plumb-dragging **Angler** (Spare Cord, Lodestone, Witness Mark, Backsight), a **Surveyor** who fights with the Rod inside small Plots (Surveyor's Eye, Fine Tolerance, Hammer Drill).

### 4.5 How instruments are implemented

Every instrument is data: stat modifiers plus a list of effects bound to hooks. The hooks are `onPlant`, `onLand`, `onLineHit`, `onRipen`, `onDischarge`, `onWhip`, `plotTick` and `onDashCross`. Each effect names an effect kind (for example `applyStatus`, `shockwave`, `pull`, `burst`, `beam`) with parameters. A new instrument that reuses existing effect kinds needs no engine change.

## 5. Enemies

Six Errata. Each one attacks a specific rule of the mechanic. Every attack has a wind-up shown twice: by a floor telegraph in danger pink-red, and by a part of the rig moving. All enemies fade in over 0.75 s inside a spawn mark and cannot act or be hurt during it.

Health grows 9% per sheet and damage 5% per sheet.

| Enemy | Stats | Behavior and telegraph | Interaction with the lines |
|---|---|---|---|
| **Smudge** | 34 hp, speed 3.4, threat 1 | Squat ink teardrop on two legs. Chases. Squashes flat for 0.5 s with a lane telegraph, then lunges 3.2 tiles for 10. Skids for 0.6 s afterwards, open to punishment. | A discharge cancels the lunge. |
| **Hachure** | 28 hp, speed 2.6, threat 2 | A fan of quills on a stalk. Keeps 5–7 tiles away. Shows three aim lines for 0.7 s (they track, then lock), then fires three quills for 8 each. | Will not stand in a Plot. Enclosing it cancels the volley and makes it flee. |
| **Pegworm** | 46 hp, speed 3.0 (4.2 burrowed), threat 2, from sheet 2 | Segmented borer. Burrows toward your nearest planted stake as a moving bulge in the floor. The stake shakes inside a danger ring for 1.5 s, then is eaten (`lost` for 5 s). Surfaces to chew for 1.2 s. With no stakes to eat, it bites for 9. | Untouchable while burrowed, except that a whip over its bulge surfaces it and stuns it for 1.5 s. |
| **Shearwing** | 30 hp, threat 2, from sheet 3 | A scissor-bird shaped like a pair of dividers. Perches at the edge. Shows a dotted flight path for 0.8 s, then crosses the room at 16 tiles/s for 12. Perches for 1.2 s after. | Severs every unripe line it crosses for 3 s. A ripe line discharges on it instead and grounds it for 2 s. |
| **Drift Cairn** | 90 hp, speed 1.7, heavy, threat 3, from sheet 3 | Three stacked stones. Walks slowly. Expanding ring for 1.0 s, then a 2.5-tile slam for 16. At range it lobs its top stone at a telegraphed circle for 12. | The slam shoves your stakes 3 tiles outward. The shoved lines sweep, and they hit its own allies. |
| **Claimjumper** | 52 hp, speed 3.0, threat 3, from sheet 5 | A gaunt figure with a black pennant. Keeps its distance. Raises the pennant for 0.8 s, then plants a hostile stake (up to three). Jabs for 10 if cornered. | Its stakes link dashed red lines that deal 10 when you cross them. Three of them flash for 1 s and snap shut for 18. Your whips, Rod and Plumb Shot destroy its stakes. |

### 5.1 Elites

Elites are marked by a pennant glyph and a danger-coloured aura.

- **Chained pair.** Two enemies of one kind with +80% health, joined by a hostile chain. The chain deals 10 when you cross it and severs your unripe lines where it crosses them. It breaks when either dies.
- **Single-trait elites.** +60% health, +15% damage, one trait:
  - *Hasty*: wind-ups 30% shorter, 25% faster.
  - *Sealed*: unripe line hits do nothing; only discharges, the Rod and the Plumb Shot hurt it.
  - *Covetous*: hitting it with the Rod yanks your nearest stake 2 tiles toward it (its lines sweep).
  - *Inked*: takes a quarter damage until a discharge breaks its armour.

### 5.2 Waves

A combat room runs 2 waves (3 from sheet 4). Each wave spends a threat budget of `3 + 0.9 × sheet`. Pegworm and Shearwing never appear together before sheet 5. No more than one Drift Cairn per wave before sheet 8. Each zone has one elite room.

## 6. Bosses

Bosses cannot be stunned, knocked back or dragged. They build **stagger** instead: three discharges within 6 s open a 1.5 s stagger window in which they stop attacking and take +50%.

### 6.1 Mini-boss: the Counterclaim (sheet 6)

A giant three-legged theodolite: a boxy transit head with one lens on a tall tripod, drawn as drafting line-work. Its three feet are hostile stakes. The dashed red triangle between them is its own Plot. 520 health.

- **Step.** It lifts its oldest foot and plants it near you: a landing circle shows for 0.6 s, then a stomp (1.2 tiles, 14). The two lines attached to the moving foot sweep, exactly like your whip, previewed in red hatch. Being swept costs 12.
- **Snap.** Every third step the triangle's interior flashes for 1 s, then snaps shut for 20.
- **Sight.** The lens charges for 0.9 s along a thin aim line that tracks and then locks, then fires a beam for 16.
- **Legs.** Each foot has 80 integrity. Whips and discharges deal double to integrity. Breaking a leg topples it for 4 s: its triangle goes dark and its head takes double damage. Then it stands again with legs restored.
- **Second half** (below 50%): faster steps, the Sight fires a three-beam fan, it snaps every second step, and it calls two Smudges each time it stands back up.

### 6.2 Final boss: the Blank (sheet 12)

A mass of unprinted paper rooted at Point Zero, built from nine folding panels with creases as joints. A registration mark is its eye. It refolds into a new silhouette for each phase. 1100 health.

**Phase 1, the Fold (100–66%).** A tall folded colossus. It takes 30% damage unless it stands inside your Plot (then full, and discharges deal +50%). So you must build the triangle around it and keep it standing.

- *Paper darts*: three fans of five darts, aim lines for 0.6 s, 9 each.
- *Crease*: two or three long line telegraphs through your position for 0.9 s, then the floor folds along them for 14. A crease severs unripe lines it crosses for 2 s.
- *Page slam*: a 100° cone, 5 tiles, 1.0 s telegraph, 18 and knockback.
- *Spill*: ink drops fall on telegraphed circles and become two or three Smudges.

**Phase 2, the Spread (66–33%).** It unfolds into a wide low sheet. The arena edge is hatched for 1.5 s and then insets one ring of tiles, twice in this phase. Stakes left outside return to hand. It now fights with your own mechanic: it plants three hostile stakes around you, their lines ripen after 2.5 s, and it whips its oldest stake to a new spot near you, previewed in red hatch for 0.6 s (16, or 28 if ripe). Destroying one of its stakes deals 25 to the Blank and counts toward stagger. It takes 50% damage outside your Plot.

**Phase 3, the Crumple (33–0%).** It crumples into a tight spiked core and the registration mark blinks. All damage is ×0.4, except that a discharge deals ×3 and marks the core for 3 s, during which everything deals full damage. Attacks: a rotating four-arm dart spiral, expanding ink rings to dash through, four creases in a star.

No multiplier ever reaches zero. On death the paper unfolds flat and contour lines print across the arena: the land is measured.

## 7. Run structure

**Twelve sheets.**

- **Zone 1, the Bluefen** (sheets 1–6): a bag of four combat rooms (one of them the elite room) and one non-combat room (shop or risk event), then the Counterclaim.
- **Zone 2, the Unruled** (sheets 7–12): a bag of three combat rooms (one elite), the rest stop and the other non-combat room, then the Blank.

The order is drawn at random each run. When two or more rooms remain in the bag, two doors open after a room, each flying a pennant that shows the type of room behind it, and you choose. The first sheet is always combat. The rest stop is never the first room of its zone.

Room layouts are picked at random without repeats from typed templates: at least six combat layouts for the Bluefen and five for the Unruled, plus the special rooms and two boss arenas. Rooms fit on one screen (at most 16 × 16 tiles) and contain a few round pillars.

**Every room ends in a choice.**

| Room | Choice |
|---|---|
| Combat | Draft 1 of 3 instruments. |
| Elite combat | Draft 1 of 3 with a guaranteed rare, plus 30 Chalk. |
| Mini-boss | Rare draft, heal 25%, 5 Benchmarks. |
| Shop, **the Tally Tent** | Three instruments (40–90 Chalk), a 30-health ration (40 Chalk), free Head swaps between stakes, one reroll (20 Chalk). |
| Rest, **the Trig Pillar** | Heal 35%, or rank up one Head (or +10 maximum health if you carry none). |
| Risk event, **the Disputed Claim** | A rival's stake stands in the room. Pull it to accept one handicap for an elite fight: *Short Chain* (link range halved), *Slack Line* (lines never ripen) or *Two Stakes*. Winning pays a rare draft and double Chalk. Or walk past. |

**Chalk** drops from Errata (2–6 each) and pays 10 + 2 × sheet for clearing a room.

**First-run tutorial.** On a fresh save, sheet 0 is a harmless room with paper targets that teaches plant, trip, whip, ripe and hammer. It can be replayed from the pause menu.

## 8. Permanent progression: the Office Ledger

**Benchmarks** are earned per run and kept after death: 1 per sheet cleared, 5 for the Counterclaim, 10 for the Blank. The Ledger is opened from the title screen.

| Entry | Cost | Effect |
|---|---|---|
| Field Rations I–III | 5 / 10 / 18 | +10 maximum health each |
| Petty Cash I–II | 4 / 9 | Start with +30 Chalk each |
| Second Opinion I–II | 6 / 12 | +1 draft reroll per run each |
| Issued Kit | 12 | Start each run with a Head of your choice |
| Quick Laces | 8 | Dash recharges 15% faster |
| Surveyor's Luck | 6 | +20% Chalk |
| Requisitions (4) | 6 each | Unlock Fourth Stake, Backsight, Foresight, Offset |
| Long Chain | 10 | Alternate chain: 12-tile links, lines ripen in 3.5 s |
| Short Chain | 10 | Alternate chain: 6-tile links, lines ripen in 1.5 s |

Chains change the base rule and are chosen on the title screen. Records are kept too: runs, wins, deepest sheet, fastest win, Errata erased.

Saved in `localStorage` under `snapline.save.v1`, with a schema version and a safe fallback if the data is missing or damaged.

## 9. Art direction: luminous drafting

**The style.** A technical drawing come alive. Flat polygons with crisp pale rims on dark paper. Floors ruled with contour lines. Hatching for shadow. A UI of stamped ledger forms. The whole screen reads as one map sheet: a neatline border, registration marks in the corners, and a title block that carries the HUD.

**Why this style.** Rulers, diamonds, circles, contour lines and hatching are native vector primitives, so the style is what code-drawn graphics do best instead of an imitation of painted art. The signature mechanic is lines on a floor, so the world is made of the same material as the mechanic. And glowing chalk on dark paper suits additive blending exactly.

### 9.1 Palette

| Role | Colour |
|---|---|
| Bluefen ground / dark / void | `#0E2A47` / `#0A1F36` / `#061426` |
| Bluefen contour / bright / highlight | `#2F6F9F` / `#6FB4E0` / `#BFE9FF` |
| Unruled ground / dark | `#1E1A1C` / `#151214` |
| Unruled graphite / sepia / amber | `#5A5458` / `#8A6B4F` / `#F2A65A` |
| Paper (boss, UI) | `#E9E2D0` |
| **Player chalk / ripe** | `#FFD75E` / `#FFF6D8` |
| Chainman coat / shade / dark | `#D9CDB4` / `#9C8F78` / `#26303C` |
| Errata ink wash (Bluefen / Unruled) | `#3A4466` / `#4A3F4F` |
| Errata ink dark / rim | `#1B2033` / `#E8E4D8` |
| **Danger / danger hot** | `#FF3B5C` / `#FFC2CC` |
| UI ink | `#1B2033` |

**Colour law** (enforced in `render/palette.ts`): chalk yellow and white-hot are only ever the player's geometry. Pink-red is only ever danger: telegraphs, hostile lines, damage taken. The environment never draws thin lines in either hue.

### 9.2 Zones

- **The Bluefen.** A cyanotype marsh: Prussian-blue ground, pale contour lines that pool around sunken boundary stones, reed marks, survey-grid ticks. Cool and wet.
- **The Unruled.** An unfinished pencil draft: charcoal paper, graphite and sepia construction lines that stop mid-stroke, half-erased hills, eraser smudges, amber lamplight. Warm and dry.
- **Point Zero.** The Blank's arena: the drawing thins out toward a pale, empty centre.

### 9.3 Characters

Every rig uses one part recipe: a flat base fill, a darker shade facet, a pale rim on the lit edge, and a few hatch strokes on the shade side.

- **The Chainman.** Wide-brimmed hat, long pale duster coat with tails, satchel, banded ranging rod, a coil of survey chain that trails behind. Light in value so the hero reads on dark ground.
- **Errata.** Mid-value ink washes with a pale rim, one bright mark for an eye, and a pale halo under their feet instead of a dark shadow.
- **Bosses.** The Counterclaim is drafting line-work on a tripod. The Blank is the only large pale thing in the game.

Rigs have two body facings, toward and away from the camera, mirrored for left and right. The weapon arm follows the aim independently of the legs.

### 9.4 Glow, lighting and atmosphere

- Two additive layers, each under one half-resolution blur: a ground layer (lines, Plot edges, telegraph edges) and an effects layer (sparks, halos, flashes).
- The floor is baked to one texture per room.
- The floor inside the Plot brightens; contour lines near ripe lines brighten.
- A soft vignette and paper grain over the world.

### 9.5 Lettering and UI

All titles, labels, stamps and numbers use a single-stroke drafting alphabet drawn in code as polylines, in capitals, the way technical drawings are lettered. The HUD is the sheet's title block: sheet number and name, health as a graduated levelling staff, dash pips, the stake queue with Heads, Plumb Shot cooldown, Chalk. Draft cards are requisition forms. The title screen is a map cartouche.

### 9.6 Animation and feel

- Rigs are animated only by transforming parts: position, rotation, scale, squash and stretch.
- The player and every enemy have idle, move, wind-up, attack, recovery, hit and death states. Death scatters the rig's own parts as ink and paper.
- Secondary motion: coat tails, the trailing chain and quills follow with lag.
- Hit-stop on impact (35 ms light, 70 ms heavy, 90 ms discharge), trauma-based screen shake, damage numbers, ink and chalk particles.
- Room transitions are an ink wipe; menus slide and stamp.

## 10. Audio

Synthesized with WebAudio; no audio files. A chalk-line snap for the whip, a thunk for planting, a small bell when a line turns ripe and a bright snap when it discharges, a twang for the Plumb Shot, paper and ink for enemies, a pencil tick and a stamp for menus. Each zone has a quiet generative bed, and bosses add a pulse. **M** mutes.

## 11. Controls and screens

| Input | Action |
|---|---|
| W A S D / arrow keys | Move |
| Mouse | Aim |
| Left mouse | Ranging Rod |
| Right mouse | Plumb Shot |
| Space / Shift | Dash |
| E / Q | Stake: plant, or whip the oldest |
| F | Interact |
| Tab (hold) | Show Field Kit |
| Esc / P | Pause |
| R | Restart (on the death and victory screens; from the pause menu during a run) |
| M | Mute |

Screens: title (start, Office Ledger, controls, chain choice), HUD, draft, shop, rest, event, pause (resume, restart, controls, volume), death (cause, statistics, Benchmarks earned), victory. Restart never reloads the page. The game pauses when the window loses focus.

## 12. Technical design

### 12.1 Architecture

```
src/
  main.ts          boot: Pixi application, game, loop
  core/            math, seeded rng, easing, geometry, isometric projection (pure)
  sim/             the game as pure logic: world state, step, lines, player, combat, AI, bosses, rooms, run, kit, bots
  content/         typed data: enemies, elites, instruments, splices, rooms, zones, events, shop, ledger
  render/          Pixi: stage and layers, camera, room view, line/Plot/telegraph views, rigs, animators, particles, palette
  ui/              Pixi: HUD, screens, transitions, tweens, stroke lettering
  audio/           WebAudio synth and ambient beds
  game/            state machine, fixed-step loop, input, save, debug hooks
tests/             vitest suites (no browser)
scripts/           browser verification through the installed Chrome
```

**Hard rule.** `src/core`, `src/sim` and `src/content` never import `pixi.js` and never touch `window` or `document`. A test enforces this. Everything that decides an outcome lives there, so the whole game can be simulated headless.

**Simulation.** A fixed 60 Hz step over plain data. All randomness comes from a seeded generator, so a seed and an input stream reproduce a run exactly. The simulation emits events (`hit`, `death`, `plant`, `whip`, `ripen`, `discharge`, `telegraph`, …) that the renderer and the audio consume; they never write back.

**Rendering.** The renderer reads simulation state each frame and interpolates between the last two ticks. Hit-stop freezes the simulation, never the renderer.

**Projection.** True isometric, 30° axes: `sx = (x − y)·cos30·U`, `sy = (x + y)·sin30·U − z·U`, where `U` is pixels per tile. Ground-plane layers carry this transform, so floor art, lines, Plots and telegraphs are authored in world units and match the simulation exactly. Upright things (rigs, stakes, props) are placed at their projected foot point and depth-sorted by `x + y`.

**Layer stack**, bottom to top: backdrop, baked floor, ground decals, ground glow (additive, blurred), depth-sorted entities, effects glow (additive, blurred), crisp effects and damage numbers, vignette and grain, UI.

### 12.2 Data-driven content

- **Enemy**: a typed record with stats, a locomotion style, a list of moves (selection rule, wind-up, telegraph, action, recovery) built from shared action primitives, a rig id and palette roles.
- **Instrument**: a typed record with stat modifiers and hook-bound effects (section 4.5).
- **Room**: an ASCII tile template with spawn marks, pillars, doors and decoration, tagged with zone and kind.

Adding an enemy, an instrument or a room means adding a record. The README explains each.

### 12.3 Testing

- Unit tests for geometry, projection and every line rule.
- Content validation: unique ids, Splice parents exist, at least 20 instruments, every rig has every animation state, every run plan has 12 sheets.
- Scripted bots play through the same simulation: an idle bot must lose; a melee-only novice usually dies before the Blank; a skilled bot with human reaction delay and aim error wins some seeds; active whip play must clear rooms at least 1.5× faster than camping or mashing E; dash spam must stay under 30% invulnerable uptime.
- Browser checks with the installed Chrome: console errors, screenshots of every screen and room type, an animation gallery (`?gallery=1`) showing every rig in every state, sampled frame times.

### 12.4 Engine conventions (PixiJS v8)

- `const app = new Application(); await app.init({...}); document.body.appendChild(app.canvas)`.
- Graphics are shape-then-style: `g.rect(...).fill(...)`, `g.moveTo(...).lineTo(...).stroke({ width, color })`. Never `beginFill` or `lineStyle`.
- Build each shape once as a `GraphicsContext` and share it; animate transforms, `tint` and `alpha` only. Never clear and rebuild Graphics every frame.
- Rig parts are white shapes coloured by `tint`, so hit flashes, status tints and elite recolours cost nothing.
- Filters go on whole layers with a fixed `filterArea`, never on single objects.
- Blend modes are strings (`'add'`, `'multiply'`).
- The ticker callback receives the `Ticker`; use `ticker.deltaMS`.
- Lines are stretched sprites; particles are pooled sprites sharing generated textures.

## 13. Milestones

| # | Scope |
|---|---|
| 0 | This document, repository, scaffold, API spike |
| a | Isometric rendering, camera, baked floor, the Chainman rig, movement, dash, input |
| b | Rod, Plumb Shot, damage, the Smudge with every animation state, telegraphs, hit-stop, shake, particles, damage numbers, first sounds |
| c | The lines module and its rule tests, then stakes, whip, Plot, preview; rooms, waves, doors, transitions; drafting; the tutorial |
| d | All six enemies and elites; the full Field Kit; shop, rest and event rooms; the Unruled; all layouts; bots |
| e | The Counterclaim and the Blank; title, pause, death, victory, restart; the Office Ledger and saving |
| f | Polish: animation, feel, readability, audio mix, performance, balance, bug hunt, README |
