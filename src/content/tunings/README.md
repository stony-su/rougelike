# Tunings

One file per owner: `sword.ts`, `bow.ts`, `fist.ts` for the classes, and `common.ts` for the Tunings anyone can take. Each file's default export is a `TuningSet` (see `src/sim/mods.ts`): the Tunings of that owner, and the Harmonies between them. A file put here is picked up by itself.

A Tuning is data: a list of changes to the numbers in `src/sim/mods.ts`, with one value for each rank.

```ts
{
  id: 'stout-heart',            // lower-case words joined by hyphens
  name: 'Stout Heart',
  owner: 'common',              // or 'sword', 'bow', 'fist': the same as the file
  build: 'Body',                // the build it belongs to; a class's fourth Tuning is 'Wildcard'
  rarity: 0,                    // 0 common, 1 uncommon, 2 rare
  maxRank: 3,
  text: ['+15 maximum health, healed at once.', '+30 ...', '+45 ...'],   // what the card says, rank by rank
  effects: [{ mod: 'maxHp', op: 'add', v: [15, 30, 45] }],               // 'set', 'add' or 'mul'
}
```

The data alone changes nothing in play. Each number has a rule somewhere in `src/sim` that reads it (`p.mods.maxHp`, `p.mods.ember`, ...), and a Tuning is finished when:

1. its number is read by a rule (add a number to `Mods` and `baseMods` if it needs a new one),
2. a test plays the same moment without it and with it and shows the difference the card promises (`tests/tunings-common.test.ts` is the pattern), and
3. the words on the card match the rule, rank by rank.

A Harmony names two parents and switches on by itself while a player holds both. Its effect is usually one number set to 1 (`steam`, `cascade`), read by a rule like any other.

`DESIGN.md` section 4 has every Tuning and Harmony with its numbers.
