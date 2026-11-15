# RESOUND on itch.io

Everything the page needs. `npm run itch` makes the two files to upload in `itch/out/`; the pictures are in `itch/media/`.

## The form

| Field | What to put |
|---|---|
| Title | RESOUND |
| Short description or tagline | A co-op action roguelike where nothing you hit stays hit. Send it back. (Others: "Bounce shots, arrows and enemies back for double damage. Solo or co-op." / "Nothing you strike ever settles. Send it back.") |
| Classification | Games |
| Kind of project | **HTML** (you have a ZIP or HTML file that will be played in the browser) |
| Release status | Released (or In development, if you mean to go on with it) |
| Pricing | Free, or donations |
| Genre | Action |
| Tags | roguelike, action-roguelike, co-op, isometric, local-multiplayer, controller, singleplayer, procedural-generation, hack-and-slash, top-down |
| AI generation disclosure | Say what is true of how it was made. The code, the drawings (all drawn by code) and the sounds (all synthesized) were written with an AI coding assistant. |

## Uploads

| File | Settings |
|---|---|
| `itch/out/resound-web.zip` | Tick **This file will be played in the browser**. |
| `itch/out/resound-coop.zip` | A download. Tick Windows, macOS and Linux. Name it "Co-op host (needs Node.js)". |

## Embed options

| Option | Value |
|---|---|
| Viewport dimensions | 1280 by 720 |
| Fullscreen button | On |
| Mobile friendly | Off (it needs a keyboard and mouse, or a controller) |
| Automatically start on page load | Off (a click also gives the page the keyboard and lets the sound start) |
| Enable scrollbars | Off |

## Pictures

- Cover: `itch/media/cover.png` (1260 by 1000, the shape itch.io asks for).
- Screenshots, in this order: `party-at-the-carillon.png`, `archer-hook-shot.png`, `brawler.png`, `swordsman.png`, `classes.png`, `how-to-play.png`, `title.png`.

## The words for the page

Paste as it is; make the five headings bold in itch.io's editor.

```
Nothing you strike ever settles. Send it back.

RESOUND is an isometric action roguelike for 1 to 3 players where everything bounces. Cut enemy shots back at whoever fired them, bank arrows off walls, and punch enemies into walls and into each other. Anything that hits after a bounce lands two to three times as hard, and every bounce builds your Combo.

THREE WAYS TO FIGHT
• Swordsman: every swing turns enemy shots around. Whirlwind spins through a crowd, knocks shields open and sends a whole volley home.
• Archer: arrows ricochet off walls and skip between enemies, and a dotted line shows exactly where they will go. Hook Shot pulls you across the room, over pits and through enemies, and your next three arrows fire instantly.
• Brawler: quick jabs, a heavy punch you charge and release, and a Stomp that blasts a crowd apart. Line up bodies and walls.

EVERY RUN IS DIFFERENT
• 12 rooms across two zones, generated fresh each run, with pits, bumpers and traps.
• Five kinds of enemy, and elites with a twist of their own.
• Camps with a merchant and a healing pool, and a gamble: take on a curse for a rare reward.
• Two bosses: the Carillon halfway, and the Toll at the end.
• Pick one of three upgrades after every room, and pair the right ones to switch on synergies.
• Earn Stars on every run to buy permanent upgrades.

PLAY TOGETHER
Up to three players, each on their own laptop on the same Wi-Fi. Download the co-op host below (one laptop needs Node.js), start it, and everyone else opens the address it shows in their browser. Fallen teammates can be picked back up.

CONTROLS
Keyboard and mouse, or a controller.
• Move: WASD / left stick
• Aim: mouse / right stick
• Attack: left click / right trigger (hold to keep firing or to charge a punch)
• Special: right click / left trigger
• Dash: Space / A
• See what your abilities do: hold Tab / View
• Menu: Esc / Start
• Mute: M

NOTES
• Plays best in Chrome or Edge.
• Your progress is saved in your browser.
• Every picture is drawn in code and every sound is synthesized: there is not a single image or audio file in the game.
```

## Before you publish

1. `npm run check`, then `npm run itch`.
2. Upload both zips, set the options above, save as a draft.
3. Open the draft's page and play a room: the page should take the keyboard after one click, the right mouse button should use your special (no browser menu), and **Co-op lobby** should say how to host.
4. Publish when it is as you want it.
