// The Cairn.
import type { EnemyDef } from '../../sim/defs';

/**
 * Three stacked stones, slow and heavy. Up close it slams the ground in a ring; from a distance
 * it lobs its top stone at a marked circle, where it lies for a moment before it bursts, and
 * whoever strikes it first sends it back. It is too heavy to launch as it stands: three jabs
 * stagger it, and a staggered Cairn flies like a wrecking ball.
 */
export const CAIRN: EnemyDef = {
  id: 'cairn',
  name: 'Cairn',
  hp: 95,
  radius: 0.62,
  speed: 1.7,
  mass: 5,
  threat: 3,
  minChamber: 3,
  zones: ['outer', 'inner'],
  locomotion: { kind: 'chase', range: 1.9 },
  moves: [
    {
      // the rig's first move: the upper stones lift and drop
      id: 'slam',
      minRange: 0,
      maxRange: 2.3,
      cooldown: 3,
      windup: 1.0,
      telegraph: { shape: 'circle', radius: 2.5, at: 'self', track: 0 },
      action: { kind: 'strike', damage: 16, knock: 8 },
      recovery: 0.9,
    },
    {
      // the rig's second move: the top stone is cocked back and thrown
      id: 'lob',
      minRange: 4,
      maxRange: 9,
      cooldown: 4,
      windup: 0.9,
      telegraph: { shape: 'circle', radius: 1.3, at: 'target', track: 0.5 },
      action: { kind: 'lob', damage: 12, radius: 1.3, flight: 0.8, fuse: 0.7 },
      recovery: 1.1,
    },
  ],
  rig: 'cairn',
  chimes: [5, 8],
};

export default CAIRN;
