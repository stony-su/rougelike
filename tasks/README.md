# The task board

One file per task. Each says what to build, when it is done, who has it, and **which files it may change**. Two people never hold the same file at the same time, so two branches never meet in one.

How to take a task and hand it in is in [CONTRIBUTING.md](../CONTRIBUTING.md). This page is only about the files in this folder.

```
npm run tasks                  the board
npm run tasks -- show T31      one task in full
npm run tasks -- claim T31     take it
npm run tasks -- done T31      finished
npm run tasks -- release T31   give it back
npm run tasks -- scope         did my branch change only my task's files?
npm run tasks -- check         is the board in order?
```

## The fields at the top of a task

| Field | Meaning |
|---|---|
| `id`, `title` | `T31`, and what it is in a few words. The file is named `T31-some-words.md`, and the branch `task/T31-some-words`. |
| `status` | `open` (free), `claimed` (someone is building it), `review` (built, waiting to be merged), `done`. |
| `owner` | Who has it. Empty while it is open. |
| `milestone`, `weight` | Which milestone it belongs to, and its share of the whole game. All the weights add up to 100. |
| `progress` | Optional, a percentage: how far a claimed task has come. It counts toward the total. |
| `needs` | Tasks that must be done first. |
| `files` | Files and folders that are **this task's alone** while it is in progress. `*` stands for part of a name, `**` for everything below a folder. |
| `touches` | Shared files the task has to change a little: a line in a list, a field in a type. Others may touch them too, so these changes stay small. |

Below the fields, two headings: **What to build** and **Done when**.

## What the board promises

- A task can be claimed by one person only: the claim is a commit to this folder on `main`, and a second claim of the same task does not merge.
- A task cannot be claimed while another task in progress owns one of its files, or while a task it needs is not done.
- `npm run tasks -- scope` fails if a branch changed a file its task does not list.
- The tests run `npm run tasks -- check`, so a board that breaks these rules does not pass.

## Adding a task

Copy a file, give it the next free number, and fill it in. Keep `files` narrow: if two tasks need the same file, either one `needs` the other, or the shared part becomes a small task of its own that both need. Then `npm run tasks -- check`.

`notes.md` holds the future plans and the list of what has not been verified; `milestones.json` names the milestones. `PROGRESS.md` at the top of the repository is written from all of these by `npm run progress`.
