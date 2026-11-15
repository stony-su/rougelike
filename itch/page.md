# RESOUND on itch.io

Everything the page needs. `npm run itch` makes the two files to upload in `itch/out/`; the pictures are in `itch/media/`.

## The form

| Field | What to put |
|---|---|
| Title | RESOUND |
| Short description or tagline | A co-op action roguelike where nothing you hit stays hit. Send it back. |
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

> **Nothing you strike ever settles. Send it back.**
>
> RESOUND is an isometric action roguelike for one to three players. Everything in it bounces: enemy shots come back off your blade, arrows bank off walls and skip from one enemy to the next, and a good punch throws an enemy into a wall, or into its friends. A hit that comes off a bounce lands two or three times as hard, and every one of them builds your Combo.
>
> **Three ways to send it back**
>
> - **Swordsman.** Every swing turns enemy shots round. The Whirlwind cuts everything near you, knocks shields open and sends a whole volley home.
> - **Archer.** Arrows ricochet, and the dotted line shows where. The Hook Shot pulls you across the room, over pits and through enemies, and your next three arrows leave at once.
> - **Brawler.** Jabs, a heavy punch you hold and let go, and a Stomp that pops a crowd outward. Line up bodies and walls.
>
> **A run**
>
> Twelve rooms across two zones, made new each time: fights, elites, a camp with a merchant and a healing pool, a gamble, the Carillon half way, and the Toll at the end. After every room you choose one of three upgrades, from 42, and pairs that belong together switch on a synergy. What you earn buys permanent upgrades between runs.
>
> **Playing together**
>
> Up to three players, each on a laptop of their own, on the same Wi-Fi. Download the co-op host below (it needs Node.js on one laptop), start it, and open the address it prints on the others. There is nothing to install on those. A fallen friend can be picked up.
>
> **Controls**
>
> | | Keyboard and mouse | Controller |
> |---|---|---|
> | Move, aim | W A S D, mouse | Left stick, right stick |
> | Attack (hold it) | Left mouse | Right trigger |
> | Special | Right mouse | Left trigger |
> | Dash | Space | A |
> | What you can do | Hold Tab | View |
> | Menu | Esc or P | Start |
>
> The game opens on a page that says how it is played. Chrome or Edge is best. Progress is kept in your browser.
>
> Every picture is drawn in code and every sound is synthesized: there is not one image or audio file in it.

## Before you publish

1. `npm run check`, then `npm run itch`.
2. Upload both zips, set the options above, save as a draft.
3. Open the draft's page and play a room: the page should take the keyboard after one click, the right mouse button should use your special (no browser menu), and **Co-op lobby** should say how to host.
4. Publish when it is as you want it.
