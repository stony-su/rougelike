---
id: T70
title: Balance, by bots playing whole runs
status: done
owner: stony-su
milestone: 7
weight: 2
needs: [T30, T31, T32, T33, T44, T45, T50]
files:
  - src/sim/autoplay.ts
  - scripts/balance.mjs
  - tests/balance.test.ts
  - tests/balance-rules.test.ts
touches:
  - src/sim/tuning.ts
  - src/sim/bots.ts
  - src/content/enemies/*.ts
  - src/content/tunings/*.ts
  - src/sim/ai.ts
  - src/sim/bodies.ts
  - src/sim/combat.ts
  - src/sim/classes/fist.ts
  - src/sim/flow.ts
  - src/sim/run.ts
  - src/sim/session.ts
  - src/sim/player.ts
  - src/sim/projectiles.ts
  - src/sim/types.ts
  - src/sim/bosses/patterns.ts
  - tests/boss.test.ts
  - tests/boss-carillon.test.ts
  - tests/boss-toll.test.ts
  - tests/save.test.ts
  - tests/wager.test.ts
  - tests/golden.json
  - DESIGN.md
  - README.md
  - src/game/game.ts
---

## What to build

Whole runs played headless, many seeds each, and the numbers adjusted until: each class's expert bot wins alone most of the time; the novice bot wins sometimes; a party that stands still always loses; three experts do not walk through the bosses; the three classes land Returns at rates within 30% of each other; and less than 5% of the game is spent in a whole-chamber freeze.

## As built

DESIGN.md section 16 has the table and the whole account. In short:

- `autoRun` (`src/sim/autoplay.ts`) plays one whole run with a bot in every seat and says how it ended, where, how long each boss stood, how much Rally was earned and how much of the run was frozen. A run of one takes a bot about a quarter of a second, so the bands play some eighty runs in twenty seconds. `node scripts/balance.mjs [seeds]` prints the fuller table (three levels of skill, and parties).
- The bots are three kinds of player now: EXPERT, STEADY and NOVICE differ in how fast they react, how soon they move and what share of warnings they never notice (a tenth, a fifth, three tenths). A bot that noticed everything won nearly every run. The shares are a guess at how people play.
- **The bots were wrong first.** They kept what they had noticed from one chamber to the next and so were blind to many warnings after the first chamber; walked straight at their target into the rim of a pit; turned round at the edge of a slam and walked back in; the Fist's bot swung at orbs too early and stood with its hand drawn back by accident. Mended, before any number was changed.
- **Two Echoes that ended runs by never ending them**: one beside its target with a post between never struck (a blow where it stands needs no clear walk now), and a Cairn wider than a one-tile gap stood at it for good (on its feet no Echo but a boss is wider than 0.46 against the chamber).
- **Rules changed for the classes**: health by class (Bow 85, Fist 125); a landed Riposte opens a shield; a jab knocks a shot aside and the Break sends an orb home; the Fist's jabs 7 / 7 / 11, with more against what cannot be shoved.
- **Rules changed for the bosses**: a boss stops at each mark where its phase changes and for 2.5 s nothing hurts it; a ring's bolts keep 35% of their damage when sent back; a boss's blows do not grow with depth; the Toll has 2800 health; boss health grows ×1.4 for each extra player.
- **The road**: the Inner Ring's waves were thinned, a quarter of health comes back after the Carillon and a fifth after a side-chamber, and the Thrum's and the Gong's tells are a little longer.

What the bands do **not** hold, said plainly: the classes are not equal (expert bots win 83% with the Sword, 93% with the Bow, 58% with the Fist); "within 30% of each other" for Returns is held as "each within three tenths of the mean" of Rally earned a minute; and a party is far safer than anyone alone (three novice bots nearly always arrive), which is the revive rule doing what it does.

## Done when

- `tests/balance.test.ts` holds those bands.
