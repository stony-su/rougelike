---
id: T89
title: Plain words through the whole game
status: done
owner: stony-su
milestone: 8
weight: 1.5
needs: []
files:
  - src/ui/words.ts
touches:
  - src/ui/**
  - src/game/**
  - src/content/tunings/*.ts
  - src/content/attunement.ts
  - src/render/palette/tones.ts
  - README.md
  - DESIGN.md
---

## What to build

Rally, Tuning, Harmony, the Tuner, the Still Pool, Chimes, Attunement, Resonance: the words fit the theme and sound like random words to someone new. Replace them, on every screen, with words that say what the thing is.

## Done when

- A glossary of the new words is in one file, and no screen shows an old one.

## As built

Every string a player reads was gone through (143 of them changed): Rally is Combo, a Return is a bounce hit, Tunings and Harmonies are upgrades and synergies, Chimes are Coins, the Tuner and the Still Pool are the Merchant and the Healing Pool, the Attunement and Resonance are Permanent upgrades and Stars, a chamber is a room, an Echo is an enemy, the Break and the Haymaker are the Stomp and the Heavy Punch, the Wager and a Discord are the Gamble and a Curse, and the classes are the Swordsman, the Archer and the Brawler. Names of single upgrades (Tuning Fork, Echo Ward, Clean Return and the like) and of the bosses were left as they are.

The code, the tests and DESIGN.md keep the names the design was written in; the table that joins the two is at the top of README.md, and DESIGN.md section 17 says the same in a paragraph. The class cards were shortened to fit their new words at 1280 by 720.
