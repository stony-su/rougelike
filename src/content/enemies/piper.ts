// The Piper.
import { PI } from '../../core/dmath';
import type { EnemyDef } from '../../sim/defs';

const deg = (d: number): number => (d * PI) / 180;

/** Keeps its distance and plays three bolts down three drawn lines. Every one of them can be sent back. */
export const PIPER: EnemyDef = {
  id: 'piper',
  name: 'Piper',
  hp: 26,
  radius: 0.36,
  speed: 2.6,
  mass: 1,
  threat: 2,
  minChamber: 1,
  zones: ['outer', 'inner'],
  locomotion: { kind: 'kite', min: 5, max: 7 },
  moves: [
    {
      id: 'volley',
      minRange: 2.5,
      maxRange: 10,
      cooldown: 2.4,
      windup: 0.7,
      // The lines follow the target, then lock; the bolts fly exactly along them.
      telegraph: { shape: 'lane', length: 12, width: 0.32, track: 0.45, count: 3, spread: deg(14) },
      action: { kind: 'volley', count: 3, spread: deg(14), speed: 9, damage: 8, range: 12, radius: 0.16, projectile: 'bolt' },
      recovery: 0.9,
    },
  ],
  rig: 'piper',
  chimes: [3, 5],
};

export default PIPER;
