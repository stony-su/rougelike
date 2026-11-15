# Working on RESOUND together

Several people build this game at the same time, each on their own laptop. Three rules keep them out of each other's way:

1. **Claim a task before you start.** The board in `tasks/` says who has what. A task has one owner.
2. **One branch per task**, named after it: `task/T31-tunings-bow`.
3. **Change only the files your task lists.** No two tasks in progress list the same file, so two branches do not meet in one.

The rest of this page is how to do that.

## Set up

```
git clone https://github.com/stony-su/rougelike.git
cd rougelike
npm install
npm run check        # layout, types, every test, production build: all should pass
npm run dev          # the game alone, at http://localhost:5173
```

Node 22 or newer, and Chrome or Edge. [README.md](README.md) explains how to run and play; [DESIGN.md](DESIGN.md) is the design.

## Take a task

```
git switch main
git pull
npm run tasks                       # the board: in progress, ready to take, waiting, done
npm run tasks -- show T31           # read the task: what to build, when it is done, its files
npm run tasks -- claim T31          # writes your name into the task and commits that
git push                            # the claim is yours once this push succeeds
git switch -c task/T31-tunings-bow
```

The claim is a commit on `main` that changes one file, the task's own. That is what makes it safe:

- If the push is refused, somebody pushed before you. Run `git pull --rebase` and push again.
- If that pull stops with a conflict **in the task's file**, somebody claimed the same task a moment before you. Run `git rebase --skip` to drop your claim, and pick another task.

The board will not let you claim a task whose files belong to a task already in progress, or one that needs an unfinished task first. "Ready to take" on the board is the list of what is free right now.

## Build it

Work inside the files the task lists under `files`. They are yours alone until the task is done.

Sooner or later you need to change a file that is not on your list. Stop and look at whose it is:

| The file is... | Do this |
|---|---|
| new, and only your task needs it | Add it to `files` in your task and carry on. |
| shared (types, numbers, a list that many things add to) | Add it to `touches`, and keep the change small: add lines, do not move or rewrite what is there. See "Shared files" below. |
| in the `files` of a task somebody else has in progress | Do not edit it. Ask its owner to make the change, or wait until their task is merged. |
| more than a few lines of a shared file | Make that change a small task of its own, hand it in first, and build on it once it is merged. |

Commit as you go, and bring `main` into your branch often (`git fetch`, then `git rebase origin/main`, at least once a day). Small steps meet `main` gently; one big one at the end does not.

## Hand it in

```
npm run check                       # layout, types, every test, production build
npm run tasks -- scope              # did this branch change only its task's files?
npm run tasks -- done T31           # marks the task done; commit it with the last of the work
git push -u origin task/T31-tunings-bow
```

Then open a pull request into `main`. A task is done when everything under "Done when" in its file is true. If part of it could not be checked (it needs a person's ears, or three real laptops), say so in the pull request rather than leaving it out.

Whoever merges runs `npm run progress` on `main` afterwards and commits `PROGRESS.md`. Task branches leave that file alone.

## Where new things go

Most new things are a file of their own that the game picks up by itself. Nothing lists them by hand, so adding one never touches a file somebody else is in.

| You are adding... | It goes in... | Picked up by |
|---|---|---|
| an enemy | `src/content/enemies/<id>.ts` (default export: the record) | `src/content/index.ts` |
| its rig | `src/render/rig/rigs/<id>.ts` (default export: the rig entry) | `src/render/rig/registry.ts` |
| its colours | `src/render/palette/<id>.ts` | whoever imports it |
| a hand-built chamber | `src/content/rooms/<id>.ts` | `src/content/index.ts` |
| something drawn over the chamber (markers, auras, rings) | `src/render/extras/<name>.ts` | `src/render/extras/index.ts` |
| tests | `tests/<what>.test.ts`, a new file for each task | vitest |

The file name is the id: `gong.ts` holds the enemy whose `id` is `gong`. A test checks this.

## Shared files

A few files are used by nearly everything. Tasks list them under `touches`, and the rule there is: **add, do not rearrange.**

- **`src/sim/types.ts`, `src/sim/defs.ts`, `src/sim/tuning.ts`, `src/sim/mods.ts`**: put a new field or a new number at the end of its group. A new kind of event also needs a case in `src/render/fx.ts` and in `src/audio/cues.ts`; the type-check tells you where.
- **`tests/golden.json`** pins the result of a fixed game, so it changes whenever the rules do. After a deliberate change to the rules run `npm run repin`. If it conflicts when you bring in `main`, take either side and run `npm run repin` again.
- **`PROGRESS.md`** is written from the board by `npm run progress`. Never edit it by hand.
- **`package.json`**: a new dependency is a decision for everyone. Ask first.
- **`README.md` and `DESIGN.md`**: put what they should say in your pull request, unless your task lists them.

## Layout of the code is not yours to choose

`npm run format` lays the code out (Prettier, pinned to one version, settings in `.prettierrc.json`), and `npm run check` fails if a file is laid out any other way. So your editor may format on save, and everybody's files still come out identical. Do not change the settings, and do not format with anything else.

## Rules the tests enforce

`tests/boundary.test.ts` and `tests/workspace.test.ts` hold the lines that keep the game working on several laptops at once. The ones people trip over:

- **The simulation (`src/sim`, `src/core`, `src/content`, `src/net`) must give the same bits on every machine.** No `Math.sin` and friends (use `src/core/dmath.ts`), no `Math.random` (use the seeded generator in the world), no clock, no `**`, no module-level `let`.
- **Only the session step changes the game.** Drawing, sound and menus read the world and send inputs and commands; they never call the parts of `src/sim` that change it.
- **Colour literals live in the palette** (`src/render/palette.ts` or a file in `src/render/palette/`).
- **Filters go on whole layers**, in `src/render/stage.ts` only.
- **Nothing unfinished is shipped**: no stubs and no notes-to-self in `src`.
- **Nothing that needs https**: laptops join the host over plain `http`.

## Several sessions on one computer

Each task needs its own folder, or the sessions overwrite each other's files. Use a worktree per task:

```
git worktree add ../rougelike-T31 -b task/T31-tunings-bow
cd ../rougelike-T31
npm ci
```

Give each its own ports: `npm run dev -- --port 5174`, `npm run host -- --port 5181`.

## If you work with Claude Code

[CLAUDE.md](CLAUDE.md) gives every session these same rules. Tell it which task is yours; it will stay inside that task's files and check the board before it starts.
