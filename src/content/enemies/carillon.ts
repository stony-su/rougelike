// The Carillon, mini-boss of the Outer Ring. Everything it does is in its brain,
// src/sim/bosses/carillon.ts; this is its body.
import type { EnemyDef } from '../../sim/defs';

export const CARILLON: EnemyDef = {
  id: 'carillon',
  name: 'The Carillon',
  hp: 1150,
  radius: 1.5,
  speed: 1.9,
  mass: 50,
  threat: 99,
  minChamber: 6,
  zones: ['outer'],
  locomotion: { kind: 'hold' },
  // every pattern is its brain's own: it uses none of the shared moves
  moves: [],
  rig: 'carillon',
  chimes: [30, 40],
  anchored: true,
  boss: true,
  brain: 'carillon',
  phases: [0.5],
  pips: 5,
  scale: 1.9,
};

export default CARILLON;
