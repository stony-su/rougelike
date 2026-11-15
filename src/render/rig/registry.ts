// Every rig in the game, with its animator. Tests walk this to prove that each rig has each
// required animation state and that each state really moves; the gallery walks it to show them.
//
// Nothing is listed here by hand: every file in `rigs/` is one rig (its default export) and is
// picked up by itself, under the id its definition carries. Adding a rig means adding a file.
import type { RigEntry } from './def';

export type { RigEntry } from './def';

const found = import.meta.glob<RigEntry>('./rigs/*.ts', { eager: true, import: 'default' });

export const RIGS: Record<string, RigEntry> = {};
for (const path of Object.keys(found).sort()) {
  const entry = found[path];
  if (RIGS[entry.def.id]) throw new Error(`Two rigs are called ${entry.def.id}`);
  RIGS[entry.def.id] = entry;
}

export function rigEntry(id: string): RigEntry {
  const r = RIGS[id];
  if (!r) throw new Error(`Unknown rig: ${id}`);
  return r;
}

/** The rig each class wears. */
export const HERO_RIG: Readonly<Record<'sword' | 'bow' | 'fist', string>> = { sword: 'edge', bow: 'string', fist: 'hand' };
