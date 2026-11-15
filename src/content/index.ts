// The game's content, gathered into the registry the simulation is created with.
//
// Nothing is listed here by hand. Every file in `enemies/` and `rooms/` is one record (its
// default export), every file in `tunings/` is the Tunings of one owner, and all of them are
// picked up by themselves, so adding one means adding a file and touching nothing that anyone
// else is working on. Files are taken in the order of their
// names, so every laptop builds the same registry.
import type { ContentRegistry, EnemyDef, RoomTemplate } from '../sim/defs';
import { BRAINS } from '../sim/bosses';
import type { TuningSet } from '../sim/mods';

function gathered<T>(found: Record<string, T>): T[] {
  return Object.keys(found)
    .sort()
    .map((path) => found[path]);
}

const enemies = gathered(import.meta.glob<EnemyDef>('./enemies/*.ts', { eager: true, import: 'default' }));
const rooms = gathered(import.meta.glob<RoomTemplate>('./rooms/*.ts', { eager: true, import: 'default' }));

const tunings = gathered(import.meta.glob<TuningSet>('./tunings/*.ts', { eager: true, import: 'default' }));

export const CONTENT: ContentRegistry = {
  rooms,
  enemies: Object.fromEntries(enemies.map((d) => [d.id, d])),
  tunings: Object.fromEntries(tunings.flatMap((set) => set.tunings).map((t) => [t.id, t])),
  harmonies: tunings.flatMap((set) => set.harmonies),
  brains: BRAINS,
};
