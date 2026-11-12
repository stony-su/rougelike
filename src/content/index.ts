// The game's content, gathered into the registry the simulation is created with.
import type { ContentRegistry } from '../sim/defs';
import { ENEMIES } from './enemies';
import { INSTRUMENTS, SPLICES } from './instruments';
import { ROOM_TEMPLATES } from './rooms';

export const CONTENT: ContentRegistry = {
  rooms: ROOM_TEMPLATES,
  enemies: ENEMIES,
  instruments: INSTRUMENTS,
  splices: SPLICES,
};
