# RESOUND — design document

A co-op isometric action roguelike for one to three players on separate laptops. Nothing you strike ever settles: send it back.

Stack: TypeScript (strict), PixiJS v8, Vite. Everything on screen is drawn in code, with GLSL shaders for backdrops and floors. All sound is synthesized in code.

This document is the specification the game is built from. Numbers are starting values; the balance bots tune them, and `src/sim/tuning.ts` and `src/content/` are the source of truth once they exist. Distances are in tiles, times in seconds, speeds in tiles per second.

---

## 1. World and tone

**The Long Echo.** A star-bell fell into the heart of the land and never stopped tolling. Since then nothing that is struck comes to rest: blows, arrows and curses keep travelling and come back. The old violence still ricochets through the hills as **Echoes**, creatures made of returning force. **Returners** have learned to live by it. They do not strike so much as send things back. Up to three of them travel inward through the Ringlands to still the Bell.

Tone: bright, percussive, a little wry. No gods, no underworld. The land is loud; the heroes are precise.

Vocabulary: a room is a **chamber**; run currency is **Chimes**; permanent currency is **Resonance**, spent at **the Attunement**; upgrades are **Tunings**; a synergy between two Tunings is a **Harmony**; a co-op bounce between two classes is a **Duet**.

## 2. Signature mechanic: the Rebound

Damage comes from sending things back. Everything is a body in one collision world of walls, posts, bumpers and pits.

### 2.1 Rules

| Rule | Definition |
|---|---|
| **Return** | A hit delivered by something that bounced or was sent back: a reflected projectile, a ricocheted or skipped arrow, a launched Echo striking a wall, post, bumper or another Echo, a batted bomb. Direct hits are modest; Returns deal the damage. |
| **Rally** | Returns build Rally, cap 20. It falls to 0 after 4 s without a Return. Each point is +5% Return damage. Each Return plays the next note of the biome's scale, so a rally climbs. |
| **Rally weights** | An arrow ricochet hit or skip hit: 1. A sword return, a batted bomb (once per blast), a wall slam, a carom link, a ring-out: 2. A perfect return, a full-charge Haymaker: 3. A hit uses the Rally as it stood before that hit, then adds to it. |
| **Reflect** | A sword swing turns back every enemy projectile in its arc during its active frames. The shot changes side, flies where the player is aiming at that moment at 1.3× its speed (at least 16), deals `max(14, 2.2 × damage)`, may bank once off a wall, and gets 14 tiles of new range. |
| **Perfect return** | A reflect made when the shot is within 0.9 of the player's centre (plus 0.15 per tick of the session's input delay): damage ×1.5, pierces everything (and may still bank once and come back through), weight 3. |
| **Bat-away** | A sword swing that hits an Echo during that Echo's own attack frames cancels the attack and launches it along the aim with impulse 14. |
| **Ricochet** | Arrows bounce off walls, posts, bumpers, shields and Ringstones: 2 bounces, +40% damage per bounce made (bounces off bumpers and Ringstones are free and count too, up to 6 bounces of bonus). Total path 30 tiles or 1.6 s. A bounce off a wall is an exact mirror: the speed does not change by a bit. |
| **Skip** | An arrow that hits an Echo skips once to the nearest Echo within 3.5 tiles that it has not struck, homing on it, for 70% of its damage. |
| **Launch** | Launch speed is impulse ÷ mass. Mass: light 1, medium 2.5, heavy 5. A body moving faster than 3 is *launched*: helpless, and able to slam and carom. It slows at 18 per second (7 on slick ground, 40 in mire) and lands when it drops below 3, recovering after 0.35 s; it cannot be launched again for 0.5 s after it gets up (blows meanwhile only nudge it). A blow while it is in flight adds to its flight and passes the credit to whoever struck last. |
| **Wall slam** | A launched body hitting a wall or post at more than 5 takes `0.9 × impact speed` and bounces with 0.7 of its speed. |
| **Carom** | A launched body hitting another Echo at more than 5: both take `0.6 × closing speed × mass factor` (light 1, medium 1.3, heavy 2 for the body doing the hitting). The struck body gains 60% of the closing speed times the ratio of the masses (never more than 1.5× the closing speed) and is launched too if that is enough; one too heavy to fly takes 1 stagger instead. The striker keeps 40% of the closing speed: onward if it is at least as heavy, back the way it came if it is lighter. A chain is at most 4 links; a pair cannot carom again for 0.3 s. |
| **Ring-out** | A launched body whose centre passes over a pit falls in, like a ball into a pocket: light Echoes die; medium, heavy and elite ones take 25% of their maximum health, climb out at the nearest edge after 0.8 s and are stunned 1.0 s. Shots fly over pits. Walkers and dashes cannot enter them, and neither can a body that is only being nudged. |
| **Bumpers** | Terrain posts with restitution 1.15 (exit speed at least 9). Anything that has touched a bumper deals +25% on its next hit. Each touch rings. |
| **Stagger** | Medium and heavy Echoes take 1 stagger per jab (it fades after 2 s). At 3 they are staggered for 2.5 s: guard down, and launch impulses against them count ×3. A returned Cairn stone or a body slammed into them also staggers. |
| **Hit-stop** | Per body: the striker's attack and the struck body freeze for 2 ticks (light), 4 (heavy) or 5 (perfect return, carom above 15). The rest of the chamber keeps moving. A whole-chamber freeze happens only on a boss phase change (12 ticks) or a player going down (8 ticks), at most once every 2 s. |

### 2.2 How it changes play

- **Move** to where things will come back: into the Piper's line of fire with a sword, to the angle that banks an arrow behind a shield, to the side of a pack that lines it up with a wall.
- **Fight** with what the enemy gives you. Every Echo is ammunition for someone.
- **Decide** between the quick direct hit and the set-up Return, and how long to keep a Rally alive.

### 2.3 Legibility

- The Bow's aim preview draws the first two bounces using the simulation's own cast, from the same quantised aim the shot will use.
- Launched bodies and player-owned shots leave a ribbon trail in their owner's colour. An enemy shot is danger-red; the instant it is returned it takes the returning player's colour.
- A charging Fist shows a growing ring; a full charge flashes.
- Every Return shows its damage number in the Rally colour, with the Rally count beside the HUD meter.

## 3. Classes

Health by class: **Sword 100, Bow 85, Fist 125**. The Fist fights at arm's length, where everything lands, and has no blade to turn a shot with; the Bow stands a bowshot off and sees everything coming. (With a hundred each, bots playing whole runs hardly ever lost with the Bow and hardly ever arrived with the Fist: section 16.) All classes: radius 0.32, speed 5.4, hurt invulnerability 0.6 s, input buffer 0.15 s. **Dash**: 4 tiles in 0.18 s, invulnerable 0.22 s, 2 charges, 1.2 s recharge each; a dash stops at walls and pit edges.

### 3.1 Sword — the Edge

| | |
|---|---|
| Attack | Three-swing combo. Damage 9 / 9 / 14. Wind-up 0.07 / 0.07 / 0.12, active 0.09 / 0.09 / 0.11, recovery 0.14 / 0.14 / 0.24. Reach 2.0 / 2.0 / 2.3, half-arc 60° / 60° / 75°, forward step 0.35 / 0.35 / 0.55. Launch impulse 3 / 3 / 9 (the third sends a light Echo about 2 tiles). Every swing reflects and can bat away (section 2.1). |
| Special: **Riposte** | Cooldown 5 s. A guard for 0.4 s (plus the session's input delay), moving at 40% speed. Anything that would hurt the player in the window does no damage: a projectile comes back at its sender as a perfect return; a melee attacker is launched away with impulse 16 and stunned 0.6 s, and if it carries a shield the shield is down for as long as one broken open (a Gong: 2.5 s). A landed Riposte refunds half its cooldown and grants 0.3 s of invulnerability. A whiff has 0.2 s of recovery. |

### 3.2 Bow — the String

| | |
|---|---|
| Attack | Arrows: damage 8, speed 24, radius 0.12. The first fires on press; holding fires every 0.36 s. Move speed while firing 75%. Ricochet and skip per section 2.1. A direct hit with no bounce is not a Return. |
| Special: **Ringstone** | Cooldown 8 s. Thrown to the aim point (at most 9 tiles; it stops at walls). A bumper of radius 0.4 that lasts 8 s; one at a time. An arrow or a returned shot that hits it is redirected at the nearest Echo within 10 tiles with +50% damage (this bounce is free: it does not use up a ricochet). A launched body bounces off it toward the nearest Echo and its next carom deals +50%. |

### 3.3 Fist — the Hand

| | |
|---|---|
| Attack | Jabs fire on press. Damage 7 / 7 / 11. Wind-up 0.04 / 0.04 / 0.07, active 0.07, recovery 0.10 / 0.10 / 0.18. Reach 1.5, half-arc 50°. Impulse 2 / 2 / 8.5 (the third slaps a light Echo about 2 tiles). Each jab adds 1 stagger. A jab knocks aside any enemy shot in its arc: it flies off along the punch as the player's own at 60% damage (less than a blade makes of it), and an orb is sent home. A body that cannot be shoved (a boss) takes the whole of the jab instead: ×2.5. |
| **Haymaker** | Keep holding attack through a jab's recovery (or hold from rest) to charge: minimum 0.25 s, full 0.8 s, moving at 60% speed. Release: a 1.2-tile lunge, then the first Echo in a 60° cone of reach 1.8 takes `14 + 12 × charge` and is launched with impulse `14 + 12 × charge`. Recovery 0.22 s. A full-charge Haymaker counts as a Return of weight 3 and breaks a Gong's guard; on a body that cannot be thrown (a boss) it does ×3. |
| Special: **Break** | Cooldown 7 s. Wind-up 0.15 s. Radius 2.6, damage 10. Echoes are popped outward with impulse 11; heavies take 2 stagger instead. Enemy projectiles in the radius are slapped outward as the player's own at 60% damage; an orb is sent home, as by any other blow. |

### 3.4 What every class bounces off every Echo

| Echo | Sword | Bow | Fist |
|---|---|---|---|
| Thrum | Bat its lunge away mid-leap | Skip arrows through the pack | The cue ball |
| Piper | Return its three bolts | Bank around its cover | Break slaps its bolts away; launch it into its friends |
| Gong | Riposte its bash; return shots into its back | Ricochet off the gong itself, or a wall, into its back | A full Haymaker breaks its guard; carom others into its back |
| Cairn | Return its lobbed stone (30, and it staggers) | Bank shots while it lumbers | Three jabs stagger it, then it launches as a wrecking ball |
| Burr | Bat the bomb back | Shoot the bomb where it sits | Punch the bomb back |
| Skirl | Bat it out of its pass | Arrows and returns ground it | Grounded, it launches |

### 3.5 Duets

Built into the rules, no upgrade needed; each counts as a Return for both players.

- **Bank off the blade.** An ally's arrow that passes through a sword swing is re-aimed along the sword's aim with +60% damage, +1 ricochet and 1 pierce.
- **Alley-oop.** A launched Echo struck in flight by a sword or an arrow is re-launched (sword: ×1.4 speed along the aim; arrow: +6 impulse) and takes +50% from that hit.
- **Carom shot.** Arrows never stop on a body in flight: they always ricochet onward.
- **Stone play.** Anyone's returned shots and launched bodies use a Ringstone.

## 4. Tunings and Harmonies

### 4.1 Structure

- After each fight, elite, solo side-chamber, the Carillon and an accepted Wager, every player drafts 1 of 3 on their own screen: at least one from their class, at least one common.
- **The first draft of a run shows one Tuning from each of the class's three builds.**
- Later offers are weighted: rarity (common 10, uncommon 6, rare 2.5), ×2.5 for a Tuning that would complete a Harmony, ×1.5 for a Tuning in a build the player has started, ×1.3 for a rank-up.
- Most Tunings have three ranks; a few have fewer (noted). A Tuning held at full rank is never offered.
- A **Harmony** switches on by itself while a player holds both parents. Cards say which Harmony a Tuning would complete.
- Elites, the Carillon, the Echo Duel and the Wager guarantee a rare or uncommon offer.
- One Tuning per class is locked behind the Attunement (marked ⚿). A fresh save drafts from 9 + 12 = 21.
- Every Tuning and Harmony is a typed record over shared effect primitives; none is special-cased in the engine. Each has a test that proves it changes an outcome and never gets worse with rank.

### 4.2 Sword — the Edge

| Build | Tuning | Ranks I / II / III |
|---|---|---|
| Mirror Guard | **Clean Return** (common) | Returned shots +25 / 40 / 55% speed and pierce 1 / 2 / 3 |
| | **Wide Guard** (uncommon) | Swing arc +20° / 35° / 50°; returns home on their sender, turning 2 / 3.5 / 5 rad/s |
| | **Second Voice** (rare) | Each return splits into 2 / 3 / 4 in a 20° fan at 70 / 65 / 60% damage each |
| Duelist | **Tempered Riposte** (common) | Riposte window +0.10 / 0.15 / 0.20 s; after a landed Riposte the next 2 / 3 / 4 swings deal double |
| | **Counterweight** (uncommon) | Perfect returns and Ripostes stun 0.6 / 0.9 / 1.2 s and mark the target: +20 / 30 / 40% damage from everyone for 4 s |
| | **Encore** (rare, 2 ranks) | A landed Riposte refunds its whole cooldown and a dash charge / and heals 4 |
| Edge Wave | **Ringing Edge** (common) | The third swing throws a crescent: 12 / 16 / 20 damage, speed 14, 2 / 3 / 4 ricochets; it counts as a Return after its first bounce |
| | **Tuning Fork** (uncommon) | Your crescents and returned shots can be struck again by your swings: +40 / 60 / 80% damage each time, range renewed, at most 5 times |
| | **Chorus** ⚿ (rare) | Every 12 / 10 / 8 Rally points gained, your next swing is a Ring Cut: full circle, reach 2.6, 16 damage, reflects everything around |
| Wildcard | **Bladesong** (uncommon) | +2 / 3 / 4% swing speed per Rally point (at most +40 / 60 / 80%) |

Harmonies: **Hall of Mirrors** (Clean Return + Second Voice): split returns each bank one more time off a wall. **Standing Wave** (Ringing Edge + Tuning Fork): no limit on re-strikes, and a crescent grows 25% in size and speed each time. **Answer in Kind** (Tempered Riposte + Counterweight): a landed Riposte bursts (radius 2.5, 12 damage, impulse 10). **Thunderhead** (Ringing Edge + Storm Return): a crescent chains lightning (6) to 2 Echoes within 3 tiles of each Echo it passes. **Slipstream** (Encore + Afterimage): dashing through an enemy projectile returns it at its sender.

### 4.3 Bow — the String

| Build | Tuning | Ranks I / II / III |
|---|---|---|
| Pinball | **Skipping Stone** (common) | +1 / 2 / 3 ricochets; +8% speed per bounce |
| | **Crescendo** (uncommon) | From its second bounce an arrow bursts where it lands: radius 1.2, 6 / 9 / 12 |
| | **Seeking Echo** (rare) | After its first bounce an arrow turns toward the nearest Echo at 1.5 / 2.5 / 3.5 rad/s |
| Chain | **Glance** (common) | +1 / 2 / 3 skips; skip reach +1 / 1.5 / 2 tiles |
| | **Splinter** (uncommon) | An arrow that kills splits into 2 / 3 / 4 arrows at 60% damage toward other Echoes within 6 tiles |
| | **Pinning Note** (uncommon) | Skipped arrows root their targets 0.5 / 0.8 / 1.1 s (once per Echo per 3 s) |
| Stonework | **Twin Stones** (common, 2 ranks) | Carry 2 Ringstones / and the cooldown is 25% shorter |
| | **Resonant Stone** (uncommon) | Redirect bonus +80 / 110 / 140% instead of +50%; a struck stone pulses: radius 1.8, 8 / 12 / 16 |
| | **Lodestone** ⚿ (rare) | Ringstones pull Echoes within 3 / 3.5 / 4 tiles at 1.5 / 2 / 2.5 |
| Wildcard | **Heavy Fourth** (uncommon) | Every fourth arrow of a held volley: +100 / 150 / 200% damage, pierces 1 / 2 / 3, +1 ricochet |

Harmonies: **Trick Shot** (Skipping Stone + Seeking Echo): an arrow's third bounce and later always crit (×2). **Chain Reaction** (Glance + Splinter): split arrows keep their remaining skips and ricochets. **Bell Tower** (Twin Stones + Resonant Stone): an arrow that hits one Ringstone with the other in sight bounces between them up to 4 times, pulsing each time, then seeks an Echo. **Frostline** (Pinning Note + Frost Return): rooted targets are frozen 1.2 s instead, and frozen targets take double from wall slams and caroms. **Parting Shot** (Heavy Fourth + Afterimage): a dash makes the next arrow heavy at once, with +1 ricochet.

### 4.4 Fist — the Hand

| Build | Tuning | Ranks I / II / III |
|---|---|---|
| Billiards | **Follow Through** (common) | A launched body ploughs through the first 1 / 1 / 2 Echoes it meets, hitting each, before it caroms; launch speed +10 / 20 / 20% |
| | **Carom Master** (uncommon) | Caroms pass on 80 / 100 / 100% of the momentum; chains run 1 / 2 / 3 links longer |
| | **Break Shot** (common) | Break impulse +30 / 50 / 70%; its cooldown is 1 / 2 / 3 s shorter when it hits 3 or more |
| Wall Combo | **Wall Hammer** (common) | Wall-slam damage +50 / 90 / 130%; a slam above 10 stuns 0.5 / 0.8 / 1.1 s |
| | **Rebound Jab** (uncommon) | Punching a body that is flying toward you re-launches it: +50 / 75 / 100% damage and +2 speed each time, at most 3 times per body |
| | **Glass Jaw** (uncommon) | Bodies you launch take +15 / 25 / 35% damage from everyone until they land |
| Shockwave | **Thunderclap** (common) | A full Haymaker bursts on impact: radius 2, 10 / 15 / 20, pops light Echoes (impulse 6) |
| | **Iron Stance** (uncommon) | While charging: 30 / 45 / 60% less damage and no stagger; at rank III the charge is 15% faster |
| | **Tremor** ⚿ (rare) | Launched bodies burst at every bounce: radius 1.4, 5 / 8 / 11 |
| Wildcard | **Heavy Hands** (rare) | Carom damage ×1.25 / 1.5 / 1.75 for each mass class the hitting body is above light; heavies hit for double on top |

Harmonies: **Pool Shark** (Follow Through + Carom Master): the third body struck in one chain bursts (radius 2, 20). **Corner Pocket** (Wall Hammer + Rebound Jab): a wall slam within 0.5 s of your punch sends the body straight back to you at 80% speed, once per launch. **Earthquake** (Thunderclap + Tremor): bursts pop what they hit (impulse 6) and may set off one more burst. **Meteor** (Heavy Hands + Ember Return): launched bodies burn (6 per second), set alight what they hit, and leave a fire trail for 2 s (4 per second). **Bull Rush** (Iron Stance + Ram): dashing while charging keeps the charge and launches what you pass (impulse 12).

### 4.5 Common Tunings

| Family | Tuning | Ranks I / II / III |
|---|---|---|
| Dash | **Third Wind** (common, 2 ranks) | +1 dash charge / and recharge 20% faster |
| | **Afterimage** (uncommon) | A dash that takes you through an attack grants +30 / 45 / 60% damage for 3 s |
| | **Ram** (common) | Dashing knocks Echoes aside: 6 / 9 / 12 damage, impulse 7 / 8 / 9 |
| Rally | **Sustain** (uncommon, 2 ranks) | Rally steps down 1 point every 0.5 s / 0.8 s instead of falling to zero |
| | **Overtone** (uncommon) | Every 12 / 10 / 8 Rally points gained: a ring bursts (radius 2.5, 15) and heals 2 / 3 / 4 |
| | **Opening Note** (common) | Your first Return in a chamber crits (×2) and sets Rally to 4 / 6 / 8 |
| Elements | **Ember Return** (common) | Returns burn: 4 / 6 / 8 per second for 3 s |
| | **Frost Return** (common) | Returns chill: 25 / 35 / 45% slower for 3 s |
| | **Storm Return** (uncommon) | Every 8 / 6 / 5 Rally points gained: lightning chains to 2 / 3 / 4 Echoes within 5 tiles for 8 / 10 / 12 |
| Body, purse, team | **Stout Heart** (common) | +15 / 30 / 45 maximum health, healed at once |
| | **Tithe** (common) | Your share of Chimes +20 / 35 / 50% |
| | **Echo Ward** (rare) | Once per chamber a blow that would down you leaves you at 1 health, invulnerable 1 s, with a burst (radius 2.5, 15) / and you revive allies 30% / 60% faster |

Harmonies: **Steam** (Ember Return + Frost Return): a target that is both burning and chilled bursts (radius 1.5, 25), is staggered 0.8 s, and loses both. **Perfect Pitch** (Sustain + Opening Note): at full Rally every Return crits (×1.5). **Cascade** (Overtone + Storm Return): Overtone rings also strike every Echo they touch with Storm lightning.

Totals: 42 Tunings (30 class, 12 common) and 18 Harmonies.

## 5. Echoes

Every attack has a wind-up shown twice: a floor telegraph in danger pink-red, and the rig moving. Echoes fade in over 0.75 s inside a spawn mark and can neither act nor be hurt during it.

Health grows 6% per chamber and damage 4% per chamber (a boss's health and blows are its own, and do not grow). In co-op, ordinary Echo health is ×(1 + 0.5 × extra players) and the wave budget ×(1 + 1 × extra players).

Two rules keep every Echo in the game. A blow struck where the Echo stands (a slam, a bash) needs no clear walk to its target: asked for one, an Echo with a wall at its shoulder or a post between it and its target never struck, and whoever was waiting for that blow waited for ever. And on its own feet no Echo but a boss is wider than 0.46 against the chamber, whatever its size to a blow: the walking field leads through gaps one tile wide, and a Cairn wider than the gap stood at it for good.

| Echo | Stats | Behaviour and tell |
|---|---|---|
| **Thrum** | 30 hp, speed 3.4, radius 0.38, light, threat 1, from chamber 1 | Chases. Squashes flat for 0.6 s behind a lane telegraph (3.4 × 0.8, tracks 0.3 s then locks), lunges 3.2 at speed 14 for 8. Skids 0.6 s. |
| **Piper** | 26 hp, speed 2.6, radius 0.36, light, threat 2, from chamber 1 | Keeps 5–7 tiles away. Three aim lines for 0.7 s (track 0.45 s, then lock), then three bolts in a 14° spread: speed 9, 8 each, range 12, radius 0.16. Recovers 0.9 s; cooldown 2.4 s. |
| **Burr** | 28 hp, speed 2.8, radius 0.36, light, threat 2, from chamber 2 | Keeps 4–7 tiles away. Wind-up 0.6 s; lobs a bomb at a marked circle (radius 1.6) that lands after 0.7 s and bursts after a 1.3 s fuse for 14. A bomb struck by a player becomes that player's: a sword or a punch sends it flying (speed 14 / 16, bursting on contact or after 0.8 s), an arrow sets it off where it sits; its blast then hurts Echoes only (18, radius 1.6, weight 2) and pops them outward with impulse 7. A bomb still in its arc cannot be struck. Cooldown 3.2 s. |
| **Gong** | 60 hp, speed 2.4, radius 0.45, medium, threat 3, from chamber 3 | Carries a gong: hits from within ±70° of its facing clang off (arrows ricochet off it; swings and jabs do nothing). It turns at 150° per second. Hits from the side or behind, Returns arriving from behind, caroms, a full Haymaker and a Riposte all get through; a full Haymaker, a landed Riposte or 3 stagger drops the guard for 2.5 s. Bash: cone telegraph (radius 2.2, half-arc 50°) for 0.6 s, then a 2-tile lunge at speed 10 for 14; guard down for the 0.8 s recovery and 1.2 s more (two seconds in all: at 0.8 the opening was over before most players had turned to use it). |
| **Cairn** | 95 hp, speed 1.7, radius 0.62, heavy, threat 3, from chamber 3 | Three stacked stones. Slam: an expanding ring telegraph (radius 2.5) for 1.0 s, then 16 and a shove; recovers 0.9 s. Lob (at 4–9 tiles): wind-up 0.9 s, circle telegraph (radius 1.3); the top stone flies at speed 8 for 12 and can be returned for 30 and a stagger; recovers 1.1 s; cooldown 4 s. |
| **Skirl** | 28 hp, speed 5.0 flying, radius 0.4, light, threat 2, from chamber 4 | Flies above reach of swings and jabs. Perches at the rim, shows a dotted lane across the chamber for 0.8 s, then crosses at speed 16 for 12, low enough to be batted. An arrow or a returned shot grounds it for 2 s (a light body that can be launched). Perches 1.2 s after a pass. |

### 5.1 Elites

Marked by a pennant and a danger-coloured aura. +60% health, +15% damage, one trait:

- **Resonant.** Each time it is bounced (slam or carom) it rings: a danger ring (radius 2, 0.5 s telegraph) for 10.
- **Tethered pair.** Two of a kind (+80% health each) on a tether 4 tiles long: launch one and the other is dragged at half speed. When one dies the other is 30% faster.
- **Hasty.** Wind-ups 30% shorter, 25% faster.
- **Plated.** Takes 25% damage until a wall slam or carom above 10 breaks the plate.
- **Splitting.** On death it splits into two smaller copies with 40% of its health.

### 5.2 Waves

A fight is 2 waves (3 from chamber 5). Each wave spends a threat budget of `3.3 + 0.5 × chamber` (an elite's chamber a quarter more, a side-chamber a fifth less). At most one Cairn per wave before chamber 8; Burr and Skirl do not appear together before chamber 6. **Waves fit the party**: with a Sword in the chamber every wave includes at least one Echo that shoots or throws; with a Fist, at least two light bodies. Each zone's elite fight carries its elites in the last wave.

### 5.3 How Echoes move

An Echo that only walks at its target can be led in a circle for ever, so none of them only does that (`src/sim/steer.ts`):

- **Cutting off.** Every Echo that closes in heads for where its target is going (up to 0.6 s ahead), not where it is.
- **Surrounding** (Thrum, Gong). Each takes a place on a ring round its target, on a different side from its fellows, and comes at that place round the ring rather than through the middle. A Thrum pack's ring turns slowly, so the gaps move.
- **Skirmishing** (Piper, Burr). They keep their distance, and after every attack move to another spot at that distance, about a radian round their target; if their target comes close they move off at once.
- **Hurrying.** Beyond 7 tiles every Echo moves 30% faster, so the far side of a big chamber is no refuge.
- When the straight way to its target is blocked by a wall or a pit, an Echo follows that player's walking field round it.

## 6. Bosses

Bosses cannot be launched, stunned or dragged, but take carom damage (×3) from bodies launched into them. Health is ×(1 + 1.4 × extra players). Three Returns on a boss within 6 s stagger it for 1.5 s: it stops attacking and takes +50%.

**A boss is met in every phase.** At each mark of its health where its phase changes it stops: what a blow has over is lost, and for 2.5 s its voice is changing and whatever meets it rings off. However hard a party hits, no phase is skipped. And a bolt of a boss's ring keeps only 35% of its damage when it is sent back: a ring is a dozen bolts and more at once, a blade turns every one in its arc, and at full weight that outdid everything else a party could do.

**A boss fills its floor.** Its chamber is small and open (no pits, no posts, a bumper toward each corner), it stands about twice the height of anything else, and it is seldom doing nothing: it runs through a rotation of patterns, each drawn on the floor before it lands, with less than a second between them. The patterns are built from *strikes* (`src/sim/strikes.ts`): warnings that land by themselves as a disc, a ring with a safe middle, a lane or a cone. After a stagger a boss cannot be staggered again for 9 s.

**The Carillon as built.** 1150 health; phase 2 below half. Rotation: *Serve* (a fan of 3 orbs, 5 in phase 2; any basic attack sends one home, and the first to arrive cracks a bell for 60, the rest knock for 22 while the frame rings for 3 s) · *Marks* (a circle of radius 1.7 under every player, 3 times, 5 in phase 2) · *Peal* (3 rings of bolts, 4 in phase 2, with gaps that walk round) · *Toll* (a slam of radius 4.2 round the frame and then a ring out to 8, or the other way about) · *Cross* (four strips through the frame, then the four between them) · *Leap* (it comes down on whoever is furthest, and peals as it lands). A cracked bell calls Thrums. The table below is the first design, kept for reference.

**The Toll as built.** 2800 health; it never moves, and the breath between its patterns shortens from 0.9 s to 0.5 s as the phases go by. Its patterns: *Rings* (3 rings of 20 bolts with two gaps that walk round; 4 rings in the Echo; 24 bolts with one gap in the Silence) · *Hammers* (a circle of radius 2 under every player, 4 times, for 15; in the Echo 5 times, and each leaves a ring that spreads from where it fell half a second later) · *Spokes* (six strips through the bell, then the six between them; in the Echo the first six a third time) · *Orbs* (a fan of 3, then 5; in the Silence one slow orb straight at each player; any basic attack sends one home for 55) · *Sweep* (a strip that goes round the bell in 14 steps like the hand of a clock; the Echo has a second hand opposite). Thrums are called every 12, 10 and 6 s. In **the Echo** (below 66%) Returns do ×1.25. In **the Silence** (below 33%) plain blows do ×0.4 and Returns ×1.5, and a wall of sound closes from 11 tiles out to 6 over 40 s; whoever stands outside it is struck for 6 every 0.8 s. The mirrored attacks of the first design (one for each class present) and bumpers that rise are not built: the Echo doubles the Bell's own patterns instead, and the four bumpers stand from the start. The tables in 6.2 are the first design, kept for reference.

### 6.1 Mini-boss: the Carillon (chamber 6)

A walking frame of five bells in a round court (radius 9) with four bell-posts (bumpers) near the rim. 520 health. Direct damage always counts in full; cracking bells is the fast way.

| Attack | Tell | Effect | What comes back |
|---|---|---|---|
| **Serve** (every 6 s, 1 s faster per cracked bell, never under 2.5 s) | A line from the ringing bell to its target for 0.8 s | An orb: speed 7 (+1 per cracked bell), radius 0.45, 14 damage, light homing, 3 wall bounces. Two orbs half a second apart with 2 or 3 players. | **Every class returns an orb with a basic attack** (a swing, an arrow, a punch). A returned orb that reaches the Carillon cracks that bell: 70 damage and a 1.2 s stagger. |
| **Slam** (a player within 3 tiles) | Ring telegraph (radius 3.2) for 0.9 s | 18 and a shove | — |
| **Peal** (after each cracked bell) | The frame shakes for 0.8 s | Calls 2 + players Thrums (at most 5 alive) and a ring of 10 slow bolts (speed 5) with two gaps | Bolts for the Sword; Thrums for the Fist; bell-posts as bank surfaces for the Bow |

Below 40% health it serves two orbs in a row and the slam radius is 3.8. Reward: a rare draft, 25% healing, 5 Resonance.

### 6.2 Final boss: the Toll (chamber 12)

The Bell itself, immobile at the centre of the Crater (a round court, radius 11). 1100 health.

**Phase 1, the Peal (100–66%).** Four bumpers rise at radius 6 and stay for the fight.

| Attack | Tell | Effect |
|---|---|---|
| Ring of bolts | The Bell flashes for 0.7 s; rays show the two 40° gaps | 16 bolts outward, speed 6, 9 each |
| Hammer | A circle (radius 2.0) under each player for 1.0 s (tracks 0.6 s, then locks) | 18 and a shove |
| Call | — | 3 Thrums every 12 s (at most 4 + players alive) |

**Phase 2, the Echo (66–33%).** It turns the party's own kinds of attack back on them: one mirrored attack for each class present (alone: your class and one other). Returns deal ×1.25.

| Attack | Tell | Effect |
|---|---|---|
| Return volley (mirrors the Sword) | Five aim lines for 0.6 s | A fan of five fast piercing bolts, speed 12, 10 each |
| Ricochet shot (mirrors the Bow) | The first two bounces drawn in red for 0.7 s | Three bolts that bounce off walls three times, 9 each |
| Launch (mirrors the Fist) | A ring on a Thrum for 0.9 s, then a lane for 0.7 s | A Thrum hurled at a player for 14; it can be batted, shot or punched back |
| Ring of bolts | As before | 20 bolts, one gap that rotates |

**Phase 3, the Silence (33–0%).** A wall of sound closes from radius 11 to 6 over 40 s behind a hatched danger band; touching it costs 6 every half second and pushes inward. Direct hits deal ×0.4; Returns deal ×1.5.

| Attack | Tell | Effect |
|---|---|---|
| Tolls | A line to each player for 0.8 s, every 5 s | A slow heavy orb (speed 5, radius 0.5, 16) that every class returns with a basic attack for 60 |
| Trickle | — | One Thrum every 6 s (at most 3 + players alive) |
| Ring of bolts | As before | 24 bolts, one gap |

**Every phase gives every class something to bounce**: bolts and orbs to return, bumpers and the arena wall to bank off, and Thrums on a timer. No multiplier ever reaches zero. On death the tolling stops and the land settles.

## 7. Run structure

**Twelve chambers per player**: nine shared, three solo.

- **Zone 1, the Outer Ring** (biomes Reedwater and Glasswood), chambers 1–6: Fight · Fight · **Solo** · Elite *or* Fight · Camp · **the Carillon**.
- **Zone 2, the Inner Ring** (biomes Cinder Terraces and Stormshelf), chambers 7–12: **Solo** · Elite *or* Fight · the Wager · **Solo** · Camp · **the Toll** (in the Crater).

**Shuffle.** Each run draws the order within limits: zone 1's solo chamber falls at 3 or 4; zone 2's at 7 or 8, and at 10; no two solo chambers are adjacent and none is directly before a boss; the camp is always the chamber before the boss; the opening chamber of zone 1 is always a fight. Chamber layouts are generated (section 9).

**Doors.** "Elite *or* Fight" is two doors: the one not taken is gone. The elite pays a rare draft and 30 extra Chimes. Doors and the Wager are decided by majority after a 10 s count shown on every screen; ties are broken by the session's seeded generator.

**Solo side-chambers** last 60–90 s and run at the same time for everyone. At the fork gate each player picks one of two ways on, drawn per player from:

| Kind | What it is | Pays |
|---|---|---|
| **Proving** | A class trial. Sword: stand among Pipers and return 12 bolts. Bow: 8 banked hits on targets behind cover. Fist: carom 8 bodies. A 75 s clock. | A class Tuning draft; a second pick from the same three if finished under 45 s |
| **Cache** | Chimes fall among bumpers and hazards for 60 s. No Echoes. | The Chimes gathered and 20% healing |
| **Echo Duel** | One elite, alone. It enrages (+40% speed and damage) at 75 s. | A rare draft |

A player who finishes early watches a teammate's chamber or waits at the threshold. When everyone is done, or 20 s after the last-but-one finishes, the party meets in the next shared chamber.

**Rewards.**

| Chamber | Reward |
|---|---|
| Fight | Draft 1 of 3; Chimes `10 + 2 × chamber` |
| Elite fight | Draft with a guaranteed rare; 30 extra Chimes |
| The Carillon | Rare draft, heal 25%, 5 Resonance |
| A side-chamber | Its draft, and heal 20% |
| Camp: **the Tuner** | Three Tunings from your own pools (common 40, uncommon 60, rare 90 Chimes), a ration (+30 health, 40 Chimes), a restock (20 Chimes, +10 each time) |
| Camp: **the Still Pool** | Once per camp: heal 35%, or rank up one Tuning, or +10 maximum health if nothing can rank up |
| **The Wager** | Accept a Discord for an elite fight: **Mute** (no Rally), **Heavy Air** (shots and bodies lose speed twice as fast) or **Brittle** (−30% maximum health for the chamber). Two of the three are offered. Winning pays a rare draft and double Chimes. Or walk on. |

Echoes drop 2–6 Chimes each. Chimes picked up by anyone are paid to every player's own purse.

### 7.1 Co-op rules

- **Nothing one player does stops the others.** After a clear each player's reward stands in the chamber and opens only on their screen; the chamber stays live. Doors open when everyone has chosen; a "choosing" tag marks who has not; the highlighted card is taken after 30 s. Shopping and resting work the same way.
- **Menus do not pause.** Esc opens your own menu. "Pause for everyone" is a separate action that names who paused; anyone can lift it. Alone, the menu pauses.
- **Downed.** At zero health a player is downed: they can crawl at 30% speed, an ally within 1.5 tiles revives them in 2 s to 35% health, and anyone still down is revived at 25% when the chamber is cleared. The run is lost when every player is down at once. Alone, going down anywhere ends the run. Down in a solo side-chamber in co-op: rejoin at 30% health with no prize.
- **A player who drops out** becomes an untargetable ghost after 5 s and stops counting toward wave scaling, votes and "everyone down". Rejoining from the same laptop restores them. If the host program stops, the session ends.
- **Restart.** After a win or a loss the party readies up on the results screen and a new run starts with the same connections and a new seed. Alone: one key, at once, no page reload.

## 8. Permanent progression: the Attunement

**Resonance** is earned per run and kept: 1 per chamber cleared, 5 for the Carillon, 10 for the Toll.

| Entry | Cost | Effect |
|---|---|---|
| Vitality I–III | 5 / 10 / 18 | +10 maximum health each |
| Purse I–II | 4 / 9 | Start with +30 Chimes each |
| Second Opinion I–II | 6 / 12 | +1 draft reroll per run each |
| Quick Step | 8 | Dash recharges 15% faster |
| Fortune | 6 | +20% Chimes |
| Signature Tunings (3) | 6 each | Unlock Chorus, Lodestone, Tremor |
| Issued Tuning (3) | 10 each | Start each run as that class with a chosen class Tuning at rank I |

Records: runs, wins and fastest win per class, deepest chamber, Echoes sent back. Saved per browser in `localStorage` under `resound.save.v1`, with a schema version, a safe fallback for missing or damaged data, and an export/import code (a joined laptop's save belongs to the host's address). In co-op each player's bonuses are read once in the lobby and fixed for the run.

## 9. Chambers, terrain and biomes

**Generated chambers, 22–36 tiles across**, on a tile grid.

| Shape | Description |
|---|---|
| Court | A rounded rectangle or octagon with posts and bumpers in a pattern |
| Ring | An annulus around a central pit |
| Twin | Two lobes joined by a neck |
| Cross | Four arms around a hub |
| Steps | L and Z outlines (flat: no height levels) |
| Islands | Two or three pads joined by bridges over pits |
| Cavern | An organic outline built from overlapping discs, edges chamfered |

**Terrain.** Walls (bound every arena; axis-aligned and 45° runs of at least 2 tiles, so banks are predictable), posts (round, radius 0.42), **bumpers** (round, radius 0.5), **pits**, slick ground, mire. Boss arenas are round courts.

**Generator guarantees**, tested over 2,000 seeds per shape: every floor tile is reachable from the start without crossing a pit; at least 220 floor tiles and a clear circle of radius 4; every floor tile within 6 tiles of a wall, post or bumper; doors only on far rims (the north and west sides), at least 4 tiles apart; spawn marks at least 5 tiles from the start; the reward spot on open floor; at most 200 depth-sorted pieces.

**Wall classes** (computed by the generator, section 12.5): *tall* where no floor lies in the wall's screen shadow; *near kerb* where the whole chamber is behind it; *sorted kerb* everywhere else.

**Biomes.** Each chamber takes one biome of its zone, with seeded variation of hue and terrain mix.

| Biome | Look | Terrain bias | Backdrop shader | Scale |
|---|---|---|---|---|
| **Reedwater** | Jade wetland, flagstones, reeds | Pits as ponds, mire | Dark water with drifting ripples and reflected light | Major pentatonic |
| **Glasswood** | Violet crystal forest, polished facets | Many bumpers (singing crystals), slick floors | Parallax crystal shards and light shafts | Lydian |
| **Cinder Terraces** | Basalt over lava, embers | Lava pits, basalt posts | Slow domain-warped lava flow far below | Minor pentatonic |
| **Stormshelf** | Slate over a cloud sea | Open pits (sky), few walls inside | Rolling cloud layers with distant lightning | Dorian |
| **The Crater** | Black and gold, the Bell | Round court, four bumpers | Standing-wave rings that pulse with the boss | Whole tone |

### 9.1 Traps

Nothing in an empty floor makes a player move, so the floor is not empty (`src/sim/traps.ts`). Every trap warns before it strikes, strikes exactly what its warning covered, and hurts whatever is there, Echoes included, so a trap is also something to throw an Echo into.

| Trap | What it does |
|---|---|
| **Spike plate** | Rises 0.55 s after anything steps on it: 12 to a player, 14 to an Echo. Spent for 1.4 s. A body in flight that comes down on it is spiked at once for 18, and that is a Return for whoever launched it. |
| **Knell** | A post that tolls every 5.2 s: a ring of radius 2.3, warned for 0.9 s, that deals 10 and a shove to players and 8 and a shove to Echoes. It is a post like any other for banking off. |
| **Thorn pipe** | A post that turns toward the nearest player within 12 tiles it can see, draws a line for 0.7 s (following them for the first 0.45 s) and spits a bolt down it: speed 11, 8 damage. A sword sends the bolt back. |

Traps sleep once the chamber is cleared. The generator lays them with the rest of the terrain, mirrored like it, never within 5 tiles of where the party walks in: none in the first chamber, in a camp or under a boss; otherwise `1 + chamber / 4` features (a row of three plates, a knell, or a pipe), one more in an elite's chamber and one only in a side-chamber. Damage to players grows 4% per chamber, as an Echo's does.

## 10. Art direction: sound made visible

**The style.** Vivid biome colour on deep backgrounds. Flat-shaded code-drawn rigs with a crisp pale rim and a two-tone shade (no hatching). The recurring motif is the ring and the ripple: every bounce drops an expanding ring on the floor, the backdrop takes a pulse from big moments, and a perfect return or a boss phase sends one ring across the whole screen. Chambers float over a living shader backdrop; pits are holes that show it.

**Why.** The mechanic is bouncing, and a bounce is an event in time; rings and ripples show time passing outward from a point. Shaders are the natural tool for ripples, water, lava and cloud, and code-drawn flat rigs stay readable over them.

### 10.1 Palette

| Role | Colour |
|---|---|
| Player 1 / 2 / 3 | amber `#FFC24A` / cyan `#4AD8FF` / lime `#B6F25A` |
| **Danger / danger hot** | `#FF3B5C` / `#FFC2CC` |
| Chimes | `#FFE9A8` |
| Interface glass / brass / text / soft text / good | `#0E1420` (82%) / `#C9A45A` / `#F2EAD8` / `#9AA3B5` / `#7FE0A0` |
| Rim on every rig | `#F1ECDD` |

| Biome | Backdrop | Ground / dark | Wall top / face | Accent / highlight | Echo wash / dark |
|---|---|---|---|---|---|
| Reedwater | `#06202A` | `#1D4A3F` / `#143830` | `#5F9A7A` / `#2F6654` | `#9BE3B0` / `#E6FFF0` | `#6A5FB0` / `#2A2450` |
| Glasswood | `#150C2A` | `#2A1D4A` / `#1E1436` | `#8A6FD0` / `#4A3A86` | `#C9A8FF` / `#F3E6FF` | `#3F9AA5` / `#173F45` |
| Cinder Terraces | `#1A0A06` | `#2A2422` / `#1C1817` | `#6A5A52` / `#3A302C` | `#FFB35C` / `#FFE9C9` | `#7F9FC0` / `#2C3D52` |
| Stormshelf | `#0A1220` | `#28344A` / `#1C2536` | `#7F93B5` / `#44536F` | `#8FD8FF` / `#EAF6FF` | `#A05F7A` / `#472434` |
| The Crater | `#07060A` | `#1A1714` / `#100E0C` | `#8A733A` / `#4A3D20` | `#FFD27A` / `#FFF3D0` | `#C9C2AE` / `#4E4A40` |

**Colour law** (enforced in `render/palette.ts`): the three player colours belong to players and what they have sent back; pink-red belongs to danger only (telegraphs, enemy shots, damage taken); biomes never use either as a thin bright line.

### 10.2 Characters

One part recipe for every rig: a flat fill, a darker shade over the lower portion, a pale rim on top-facing edges. Rigs have two body facings (toward and away), mirrored for left and right; arms follow the aim independently of the legs.

- **The Edge** (Sword): a long coat, a tuning-fork blade held low. **The String** (Bow): hooded, light, a recurve bow with a bright string. **The Hand** (Fist): broad, bare-armed, wrapped gauntlets like drumheads. Each wears their player colour as a sash and on the weapon.
- **Echoes**: mid-value washes with a pale rim, one bright eye that turns danger-red through wind-up and attack, a pale mark under their feet.
- **Bosses**: the Carillon is a bell-frame on legs; the Toll is the largest, palest, most golden thing in the game.

Animation states. Heroes: idle, run, dash, attack (per class: three swings; loose; three jabs), charge, release, special, guard, hurt, downed, revive. Echoes: spawn, idle, move, wind-up, attack, recover, hurt, stun, **launched** (tumbling), **slam**, **ring-out**, dead.

### 10.3 Lettering and interface

Letters are chunky and rounded with a dark outline, drawn in code by the existing layout engine with a heavy round pen. Panels are dark glass with a brass edge and ring motifs. Cards carry a Tuning's build colour, its ranks as pips, its text, and the Harmony it would complete. **The HUD has no controls legend.**

HUD: own health, dash pips, special cooldown, Rally meter with the scale's notes, Chimes; the chamber title (number, biome, kind) and wave count; teammate frames (colour, class, health, downed or choosing); boss bar; edge markers for teammates and off-screen threats.

### 10.4 GLSL

- **Backdrops**: one fragment shader per biome on a custom-shader mesh, rendered at about a third of the resolution and scaled up; uniforms for time, palette, camera parallax, a global pulse and up to 16 ripples.
- **Floors**: generated per chamber by a shader (noise, Voronoi cells, edge darkening from a distance field) and baked to textures in ground space.
- **Title**: the Bell over standing-wave rings.
- Shared GLSL library: hash, value noise, fBm, Voronoi, domain warp, ring and ripple functions.

### 10.5 Feel

Rigs animate only by transforming parts. Per-body hit-stop, trauma-based screen shake (each laptop shakes only for what its own player is near), ribbon trails, damage numbers, ring ripples, particles in the biome's colours. Transitions are a ring that closes and reopens. Input never waits on animation: jabs and arrows fire on press.

## 11. Audio

Synthesized with WebAudio; no audio files. Every Return plays the next note of the biome's scale, climbing with Rally; a perfect return rings a chord; a broken Rally plays a soft falling tone. Sword: bell and steel. Bow: plucked string. Fist: drum and palm. Echoes: breath, reed and stone. Each biome has a quiet generative bed; bosses add a pulse. **M** mutes.

## 12. Controls and screens

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Move / aim | W A S D / mouse | Left stick / right stick; idle right stick aims along movement; aim snaps to a target within 12° |
| Attack (hold: Fist charges, Bow keeps firing) | Left mouse | Right trigger |
| Special | Right mouse | Left trigger |
| Dash | Space | A |
| Interact | F | X |
| Menu / pause | Esc | Start |
| Mute | M | — |

Prompts show the glyphs of the device last used. Hits rumble.

Screens: title (Play alone, Co-op lobby, Attunement, **Controls**, Settings), class select with a "how it fights" card, the lobby (a practice court with targets), HUD, draft, the Tuner, the Still Pool, the Wager, waiting and spectating, menu and pause, results (win or loss, statistics, Resonance earned), the Attunement, settings (volume, shake, graphics quality). The Controls screen has a keyboard-and-mouse page and a controller page drawn in code, and is also reachable from the menu during a run.

## 13. Technical design

### 13.1 Architecture

```
src/
  core/      math, deterministic math (dmath), seeded rng, easing, geometry, isometric projection
  sim/       the game as pure logic: session, snapshot, world, geometry and casts, bodies, projectiles,
             classes, Rally, Tunings, AI and navigation, bosses, room generation, flow, run, bots
  content/   typed data: classes, Tunings, Harmonies, Echoes, elites, biomes, chamber recipes, Attunement
  net/       protocol, relay core (lobby, tick sequencing, commands, log), input codec, transports, playout buffer
  render/    Pixi: stage and layers, shaders, camera, chamber view, rigs, trails, effects, palette
  ui/        Pixi: lettering, widgets, HUD, screens
  audio/     WebAudio synth, scales, beds
  game/      title, lobby and play shell, session view, input devices, save, debug tools
server/      the host program: static files, WebSocket relay, referee simulation, snapshots, desync log
tests/       vitest suites (no browser)
scripts/     browser verification through the installed Chrome
```

**Hard rules**, each enforced by a test:

- `src/core`, `src/sim`, `src/content` and the relay core never import `pixi.js` and never touch `window` or `document`.
- **The simulation uses exact arithmetic only.** Walking the import graph from `src/sim`, `src/content` and the relay core, the only `Math` members allowed are `abs`, `sign`, `floor`, `ceil`, `round`, `trunc`, `min`, `max`, `sqrt`, `imul`, `fround`, `clz32` and the constants; no `**`, no `Math.random`, no `Date`, no `performance`. Trigonometry and exponentials come from `core/dmath.ts`, which is built from `+ − × ÷` and `sqrt` and pinned bit for bit.
- **No module-level mutable state in the simulation.**
- **One mutation path.** Only `stepSession` changes session state. `src/game`, `src/ui` and `src/render` import from the simulation only its types, read-only selectors and command builders.
- Sort comparators in the simulation end with an integer id tie-break.
- `crypto.subtle`, `crypto.randomUUID`, the clipboard, audio worklets and keyboard lock are not used (joined laptops are not secure contexts).

### 13.2 The session

`Session { config, tick, paused, route, players[], worlds[] }` is a tree of plain data: numbers, strings, booleans, arrays, plain objects and typed arrays; no Maps, Sets or class instances; definitions are referenced by id. `stepSession(session, bundle)` advances every world by one tick from one input bundle and applies commands. There is one world per place the players are: one shared world, or one per player during a fork. Drafts, purchases, votes, readiness, pause and restart are commands, validated in the step and ignored identically when stale. Room transitions, the downed timer and the end of a run are counted in ticks.

`config` is fixed for the run: seed, roster (name, class, colour), build id, each player's Attunement bonuses and unlocks, the measured input delay, development options.

### 13.3 Inputs

An input is integers: held-button bits, one small press counter per button, movement as an angle and a magnitude, aim as an angle (16 bits) and a distance. A press is "the counter changed", so merging, repeating or delaying messages can neither lose nor double it. Bots, solo play and tests use the same codec.

### 13.4 Co-op

Deterministic lockstep, sequenced by the host program (`npm run host`): it serves the built game, relays over WebSocket at `/relay`, and runs the same simulation headless as referee.

- **Clock.** Each time the host wakes it closes every tick that is due (60 per second by a steady clock), bundling each player's latest held state, their press counters and queued commands. It waits for nobody; a silent player's held state is cleared after 250 ms.
- **Playout.** Clients step bundles through an adaptive buffer (2–8 ticks by measured jitter), never dropping one. When behind they run extra ticks with effects muted; when hidden they keep stepping from the socket without drawing. Alone, the same relay core runs in the page with no delay.
- **Hash and repair.** One canonical encoder (raw float bits, sorted keys, ids for definitions) yields both the state hash (FNV-1a) and snapshots. Clients report a hash every 30 ticks; the referee snapshots the session every 600. A client that disagrees or reconnects loads the latest snapshot and replays the log after it. A mismatch is written to disk with its log; `server/replay.ts` finds the first tick and field that diverged.
- **Timing windows** (Riposte, perfect return) are widened by the measured input delay. Target: at most 100 ms input delay at the 95th percentile on Wi-Fi, shown in a debug overlay with round-trip time, buffer depth and resync count.

### 13.5 Geometry and bodies

`sim/geo.ts` builds a chamber's collision shape once: solid boundaries from the tile grid merged into long segments with normals from a fixed set of eight; posts and bumpers as circles; pits. `sim/cast.ts` has one swept-circle cast returning the earliest hit (time, normal, kind, id) under a total order, used by walking, dashing, projectiles, launched bodies and the aim preview. `sim/bodies.ts` moves launched bodies with the rules of section 2.1, swept so nothing tunnels. Ground Echoes path with one flow field per player (`sim/nav.ts`).

### 13.6 Rendering

- **Projection.** True isometric, 30° axes: `sx = (x − y)·cos30·U`, `sy = (x + y)·sin30·U − z·U`, `U` = 64 pixels per tile. Ground-plane layers carry this transform.
- **Layers**, bottom to top: backdrop (shader, screen space) · ring-out layer · baked floor chunks and ground decals (ripples, telegraph fills) · tall walls · preview and trail lines (additive, one blurred glow layer) · depth-sorted actors, posts and sorted kerbs · near kerbs · effects glow · crisp effects and damage numbers · overlay (screen pulse, vignette) · interface.
- **Walls.** Tall walls are one static drawing under the actors; near kerbs one static drawing over them; only the remainder is depth-sorted.
- **Floor bake.** Ground space, 16×16-tile chunks of at most 2,048 px, texel density `min(2, 1.25 × zoom × resolution)`, no multisampling (`RenderTexture` and `renderer.render`), driven by a tile-data texture and a CPU distance field. The two most recent worlds stay baked; chunks are re-baked after a lost context.
- **Camera.** Follows the local player (or the watched one). Zoom is normalised so every screen shows 26 units of `x + y`. A small lead along the aim direction. Clamped to the chamber. Actors outside the view are culled.
- **Budgets.** At most 64 trails, 24 floor ripples, 16 backdrop ripples, 1,500 particles with per-kind shares, about 200 sorted pieces. One blurred glow layer. Antialiasing chosen at start-up by pixel density (on at one pixel for one, off at two); render scale steps down automatically when frames run long (`src/game/quality.ts`: a span of 72 frames with more than an eighth of them past 20 ms costs 15% of the pixels each way, down to half; a step back up is tried after eight good spans, and twice as long after each one that does not hold). Measured on integrated graphics in the stress scene: 16.7 ms a frame at one pixel for one, and at two for one once the scale has settled near one and a half.
- **Rigs.** Part order may change per frame; a helper reports where a part ended up; one dynamic drawing per rig (bowstring, charge glow); upper body and legs animate separately; bosses have several depth footprints.

### 13.7 PixiJS v8 conventions

- `await app.init({...})`; `app.canvas`. Graphics are shape-then-style. Shapes are built once as shared `GraphicsContext`s in white and coloured by `tint`.
- Custom shaders: `Mesh` + `Shader.from({ gl: { vertex, fragment }, resources })`; attributes `aPosition`, `aUV`; uniforms `uProjectionMatrix`, `uWorldTransformMatrix`, `uTransformMatrix`; uniform arrays as `{ type: 'vec4<f32>', size: n }`; textures passed as `texture.source`; output premultiplied.
- Filters only on untransformed wrapper layers with a fixed `filterArea`, and only in `render/stage.ts`.
- Bakes use `RenderTexture.create({ antialias: false })` and `renderer.render({ container, target, transform })`.

### 13.8 Testing

- Unit tests: `dmath` pinned bit for bit; geometry, casts and body physics properties (speed preserved on exact bounces, no tunnelling, momentum bookkeeping); every Rebound rule; every Tuning and Harmony; every Echo; the route; the generator.
- Determinism: recorded sessions reproduce committed hashes in Node and in the installed browsers; snapshot round-trips continue identically.
- A virtual LAN: the relay core and three clients in separate module instances with different cadences, latency, jitter, stalls and a drop-out; equal hashes at every tick and no unplanned resync.
- Bots: whole runs played with nobody watching, alone with each class and as a party (`src/sim/autoplay.ts`, `tests/balance.test.ts`; section 16 has what they found and what was changed for it).
- Browser: the production build through the installed Chrome; three pages against the host program through the LAN address; screenshots of every biome, shape, class, Echo, boss and screen; frame times against thresholds.

## 14. Milestones

| # | Scope |
|---|---|
| 0 | Foundation: this document, removal of the old mechanic and theme, deterministic math and guards, players as a list, integer inputs, the session, snapshot and hash, the loopback sequencer |
| 1 | The Rebound: one walled arena; casts and bodies; Sword, Bow and Fist; Rally; aim preview; keyboard and controller; rig extensions and simple hero rigs; Thrum, Piper, Burr; trails; first sounds |
| 2 | Together: the host program, lobby, playout buffer, hashes and repair, scaling, shared Chimes, downed and revive, Duets, latency overlay |
| 3 | Chambers: the generator, walls by rule, follow camera, one biome end to end, new lettering and interface kit, quality settings, the room atlas |
| 4 | A run you can win: the route, forks, Camp, Wager, drafts and votes, half the Tunings, Gong and Cairn, the Carillon and the Toll, a second biome and the Crater, HUD, title to results |
| 5 | Full content: the rest of the Tunings and the twelve Harmonies, the Skirl, elites, side-chamber kinds, balance (scope as cut in section 15) |
| 6 | Screens, meta, sound: title, class select, controls page, settings, menu, results, the Attunement, the audio engine, rumble |
| 7 | Polish: final art passes, feel, shaders, performance, bug hunt, balance, README |

**Never below:** five Echoes, 20 draftable Tunings on a fresh save, a multi-phase final boss, working three-laptop co-op.

## 15. Scope of this build, and what is kept for later

The sections above describe the whole game. To get to a finished, winnable run sooner, this build is cut down as below. Nothing has been deleted from the design: everything listed under "kept for later" stays specified in its own section, ready to be built.

| | In this build | Kept for later (already designed above) |
|---|---|---|
| **Biomes** (section 9) | Three: **Reedwater** (the Outer Ring), **Stormshelf** (the Inner Ring), **the Crater** (the final chamber) | **Glasswood** (violet crystal forest, many bumpers) and **Cinder Terraces** (basalt over lava), with their palettes, props, backdrops and scales |
| **Harmonies** (section 4) | Twelve: one for each build, and the common three. Sword: Hall of Mirrors, Answer in Kind, Standing Wave. Bow: Trick Shot, Chain Reaction, Bell Tower. Fist: Pool Shark, Corner Pocket, Earthquake. Common: Steam, Perfect Pitch, Cascade | The six that cross a class build with a common Tuning: **Thunderhead**, **Slipstream** (Sword), **Frostline**, **Parting Shot** (Bow), **Meteor**, **Bull Rush** (Fist) |
| **Discords** (section 7, the Wager) | One: **Brittle** (−30% maximum health for the chamber). The Wager offers it or nothing | **Mute** (no Rally) and **Heavy Air** (shots and bodies lose speed twice as fast) |
| **The Toll** (section 6.2) | Three phases over five patterns, as written under "The Toll as built" in section 6 | The Echo's **mirrored attacks** (a return volley, a ricochet shot and a hurled Thrum, one for each class present) and the bumpers that rise from the floor |
| **Forks** (section 7) | At each of the three side-chambers every player has a chamber of their own, all at once, and the party meets in the next one. Whoever is done first is shown who the road waits for; the last has 20 s once the others are done; nobody is apart for more than 90 s | **Watching a teammate's chamber** while you wait, and choosing between two ways on at the fork gate |
| **Route** (section 7) | The Outer Ring opens with a fight; then a fight, a side-chamber and an elite in any order; the camp; the Carillon. The Inner Ring is always side-chamber, the Wager, the elite it is a wager on, side-chamber, camp, the Toll. The party walks on three seconds after a chamber is cleared | The choice of **two doors** (elite or fight), the wider shuffle of the Inner Ring, and walking out through a door |

**Art direction, as built.** Characters, props and effects are **geometric and algorithmic**: built by code from a few solids (discs, capsules, wedges, rings, star and polygon shapes made by loops) and from GLSL, not from hand-traced outlines. A character is a handful of parameters to a builder, so a new one costs lines, not pages. The rigs drawn by hand before this decision (the Edge, the Hand, the Thrum, the Piper, the Cairn) stay as they are.

**Chamber looks.** Two floor-and-pillar looks are mixed between chambers, whatever the biome's colours: the **court** (a quiet checker with round posts) and the **survey** (contour rings like a map of ripples, with hexagonal basalt pillars). The survey look is the one from the earliest version of this project, brought back because it worked.

**How the work is run.** Forward only: each piece is built, put through the type-check, the tests and a production build, run once in the browser, and committed. No review rounds and no polish passes until the run can be won; what was not checked is written down in PROGRESS.md. The work is divided into the tasks in `tasks/`, each with the files it may change, so that several people can build at once (CONTRIBUTING.md).

## 16. Balance, as bots found it

The numbers above were set by playing whole runs with nobody watching: a bot in every seat, taking its own cards, voting at the Wager and shopping at the camps (`src/sim/autoplay.ts`). `tests/balance.test.ts` holds the bands, and `node scripts/balance.mjs` prints the table behind them.

**Who the bots are.** Three kinds of player (`src/sim/bots.ts`). An **expert** reacts in 0.2 s, stays under a warning to go on fighting until it must move, and overlooks one warning or shot in ten. A **steady** player reacts in 0.3 s, moves earlier, and overlooks one in five. A **novice** reacts in 0.35 s, backs away the moment a warning is seen, and overlooks three in ten. All of them dash and use their special. A bot that overlooked nothing won nearly every run and said nothing; the shares are a guess at how people play, and the table is only as good as the guess. The bots also play each class plainly: the Bow banks a shot only round a shield or at a boss gone deaf to plain blows, and the Fist does not line up caroms on purpose. A person who does will do better than they do.

**The table** (40 roads alone, 20 as a party; the same seeds every time):

| Party | Wins | Where the others fell | The Carillon stood | The Toll stood |
|---|---|---|---|---|
| Expert Sword | 83% | chamber 9 | 19–45 s | 18–74 s |
| Expert Bow | 93% | the Toll | 20–46 s | 31–79 s |
| Expert Fist | 58% | the Toll, chamber 9 | 22–54 s | 32–79 s |
| Steady Sword / Bow / Fist | 68% / 65% / 43% | chamber 9, the Toll | | |
| Novice Sword / Bow / Fist | 35% / 55% / 30% | chamber 9, the Toll | | |
| Three experts | 20 of 20 | | 23–62 s | 27–52 s |
| Sword and Fist | 20 of 20 | | 22–50 s | 25–53 s |
| Three novices | 19 of 20 | chamber 9 | 19–39 s | 22–40 s |
| Three who stand still | 0 of 4 | chamber 1, in half a minute | | |

Rally is earned at 45 to 62 points a minute by the three classes alone (each within three tenths of their mean), and no run spends as much as a fiftieth of itself with the whole chamber frozen.

**What that says, honestly.** Every class reaches the end alone in expert hands more often than not; the Fist is the hardest of the three and the Bow the easiest, at every level of skill. Chamber 9, the elite of the Inner Ring, is where a lone run most often ends, and the Toll after it. A party is far safer than anyone alone, whoever is in it, because the fallen are picked up: three novices nearly always arrive. That is what the revive rule does, and it was left as it is; co-op was made harder only in what it faces (waves and boss health grow faster with the party than they did).

**What the runs changed** (each has a test in `tests/balance-rules.test.ts`):

- **Health by class** (Bow 85, Fist 125), and the Fist's jabs to 7 / 7 / 11, with ×2.5 on a body that cannot be shoved and ×3 for a full Haymaker.
- **A landed Riposte opens a shield.** Before, a Gong whose bash was sent back was on guard again before the blade could reach it, and a lone Sword had no way through one.
- **A jab knocks a shot aside, and the Break sends an orb home.** The Fist had no answer to a ring of bolts but to be somewhere else, and met a fan of orbs one at a time.
- **Boss phases cannot be skipped**, and **ring bolts are light when sent back**. A built Sword felled the Toll in ten seconds, most of it bolts returned a dozen at a stroke.
- **A boss's blows do not grow with depth**; the Toll's health went from 2200 to 2800, and boss health in co-op from ×(1 + 0.6 × extra) to ×(1 + 1.4 × extra). Three experts used to fell it in twenty seconds.
- **The Inner Ring was thinned**: the wave budget went from `3 + 0.9 × chamber` to `3.3 + 0.5 × chamber`, and health per chamber from 8% to 6%. Chamber 9 took a lone melee class over a minute and half its health.
- **Healing on the road**: a quarter after the Carillon, a fifth after a side-chamber.
- **Softer tells on the two commonest blows**: the Thrum's lunge (0.6 s, locked for the last 0.3, for 8) and the Gong's bash (0.6 s).
- **Two Echoes that could never be reached or never struck** (the rules under section 5): found as runs that never ended.

And the bots themselves were wrong in ways that had hidden all of this: they kept what they had noticed from one chamber to the next, where ids and the clock start again, and so were blind to many warnings after the first chamber; they walked straight at their target into the rim of a pit; they stepped out from under a slam and turned round at once to walk back in; the Fist's bot swung at orbs before they were in reach, and stood with its hand drawn back by accident. Until those were mended the numbers said only that the bots were bad.

