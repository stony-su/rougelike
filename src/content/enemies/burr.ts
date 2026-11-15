// The Burr.
import type { EnemyDef } from '../../sim/defs';

/** Lobs a bomb at a marked circle. The bomb sits on its fuse, and whoever strikes it first owns it. */
export const BURR: EnemyDef = {
  id: 'burr',
  name: 'Burr',
  hp: 28,
  radius: 0.36,
  speed: 2.8,
  mass: 1,
  threat: 2,
  minChamber: 2,
  zones: ['outer', 'inner'],
  locomotion: { kind: 'skirmish', min: 4, max: 7, turn: 0.9 },
  moves: [
    {
      id: 'lob',
      minRange: 2,
      maxRange: 9,
      cooldown: 3.2,
      windup: 0.6,
      telegraph: { shape: 'circle', radius: 1.6, at: 'target', track: 0.4 },
      action: { kind: 'lob', damage: 14, radius: 1.6, flight: 0.7, fuse: 1.3 },
      recovery: 0.7,
    },
  ],
  rig: 'burr',
  chimes: [3, 5],
};

export default BURR;
