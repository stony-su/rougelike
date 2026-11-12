// The game's content, gathered into the registry the simulation is created with.
import type { ContentRegistry } from '../sim/defs';
import { ENEMIES } from './enemies';

export const CONTENT: ContentRegistry = {
  enemies: ENEMIES,
};
