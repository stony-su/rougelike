// The Echoes. Each enemy is a record over the shared locomotion styles, telegraph shapes and
// action primitives in src/sim/defs.ts. Adding an enemy means adding a record here (and a rig).
import type { EnemyDef } from '../sim/defs';

export const THRUM: EnemyDef = {
  id: 'thrum',
  name: 'Thrum',
  hp: 30,
  radius: 0.38,
  speed: 3.4,
  mass: 1,
  threat: 1,
  minChamber: 1,
  zones: ['bluefen', 'unruled'],
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

export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  [THRUM.id]: THRUM,
};
