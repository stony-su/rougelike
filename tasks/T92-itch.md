---
id: T92
title: A build for itch.io
status: done
owner: stony-su
milestone: 8
weight: 0.6
needs: []
files:
  - scripts/itch.mjs
  - itch/page.md
touches:
  - package.json
  - .gitignore
  - README.md
  - src/game/connection.ts
  - src/ui/screens/hosting.ts
---

## What to build

The game ready to be put on itch.io: a zip that plays in the browser there, a way for players who found it there to play together, and the words and pictures for the page.

## Done when

- One command makes what is uploaded.
- The page plays when served from a folder that is not the top of a site, with no host behind it.
- The co-op download starts a host on a computer that has only Node.js.

## As built

`npm run itch` makes `itch/out/resound-web.zip` (the page: `index.html` at the top, every path relative, 17 files, about 340 kB) and `itch/out/resound-coop.zip` (the same page with the host program as one file, `ws` built into it, and `start-host.bat` / `start-host.sh` / `README.txt`). The zips are written by the script itself: the zip tool Windows has writes paths with backslashes, which itch.io cannot read.

Checked: both zips open with another program's unzipper and have the layout itch.io asks for; the page was played from a subfolder of a plain file server; the co-op folder, unpacked outside the repository, started its host and served the game.

On a page that no host served, the game no longer asks for one when the page is on https (a host is plain http on one's own network), so itch.io's log stays clean, and **Co-op lobby** says to use the download.

`itch/page.md` has the form's fields, the embed options, the words for the page and a list to go through before publishing. `itch/media/` has a cover and seven screenshots taken from the packaged page.

Not done by this task: the upload itself, which needs the account.
