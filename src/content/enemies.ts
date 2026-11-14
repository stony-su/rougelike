// The Echoes. Each enemy is a record over the shared locomotion styles, telegraph shapes and
// action primitives in src/sim/defs.ts. Adding an enemy means adding a record here (and a rig).
import { PI } from '../core/dmath';
import type { EnemyDef } from '../sim/defs';

const deg = (d: number): number => (d * PI) / 180;

export const THRUM: EnemyDef = {
  id: 'thrum',
  name: 'Thrum',
  hp: 30,
  radius: 0.38,
  speed: 3.4,
  mass: 1,
  threat: 1,
  minChamber: 1,
  zones: ['outer', 'inner'],
  locomotion: { kind: 'chase', range: 2.3, weave: 0.45 },
  moves: [
    {
      id: 'lunge',
      minRange: 0,
      maxRange: 3.1,
      cooldown: 1.6,
      // Squashes flat while the lane tracks its target, then locks for the last moment and goes.
      windup: 0.5,
      telegraph: { shape: 'lane', length: 3.4, width: 0.8, track: 0.34 },
      action: { kind: 'lunge', distance: 3.2, speed: 14, damage: 10, knock: 3 },
      // Skids, open to punishment.
      recovery: 0.6,
    },
  ],
  rig: 'thrum',
  chimes: [2, 4],
};

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
  locomotion: { kind: 'kite', min: 4, max: 7 },
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

export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  [THRUM.id]: THRUM,
  [PIPER.id]: PIPER,
  [BURR.id]: BURR,
};
