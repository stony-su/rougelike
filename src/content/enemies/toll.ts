// The Toll, the Bell at the middle of the Crater and the end of the road. Everything it does is
// in its brain, src/sim/bosses/toll.ts; this is its body.
import type { EnemyDef } from '../../sim/defs';

export const TOLL: EnemyDef = {
  id: 'toll',
  name: 'The Toll',
  hp: 2800,
  radius: 2,
  // it never moves
  speed: 0,
  mass: 99,
  threat: 99,
  minChamber: 12,
  zones: ['crater'],
  locomotion: { kind: 'hold' },
  moves: [],
  rig: 'toll',
  chimes: [50, 60],
  anchored: true,
  boss: true,
  brain: 'toll',
  // the Peal, the Echo, the Silence
  phases: [0.66, 0.33],
  scale: 2.3,
};

export default TOLL;
