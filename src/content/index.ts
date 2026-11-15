// The game's content, gathered into the registry the simulation is created with.
//
// Nothing is listed here by hand. Every file in `enemies/` and `rooms/` is one record (its
// default export) and is picked up by itself, so adding an enemy or a room means adding a file
// and touching nothing that anyone else is working on. Files are taken in the order of their
// names, so every laptop builds the same registry.
import type { ContentRegistry, EnemyDef, RoomTemplate } from '../sim/defs';

function gathered<T>(found: Record<string, T>): T[] {
  return Object.keys(found)
    .sort()
    .map((path) => found[path]);
}

const enemies = gathered(import.meta.glob<EnemyDef>('./enemies/*.ts', { eager: true, import: 'default' }));
const rooms = gathered(import.meta.glob<RoomTemplate>('./rooms/*.ts', { eager: true, import: 'default' }));

export const CONTENT: ContentRegistry = {
  rooms,
  enemies: Object.fromEntries(enemies.map((d) => [d.id, d])),
};
