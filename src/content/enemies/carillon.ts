// The Carillon, mini-boss of the Outer Ring. Its brain is src/sim/bosses/carillon.ts; the three
// moves below are the ones the brain calls on, in this order.
import type { EnemyDef } from '../../sim/defs';

export const CARILLON: EnemyDef = {
  id: 'carillon',
  name: 'The Carillon',
  hp: 520,
  radius: 0.9,
  speed: 1.6,
  mass: 50,
  threat: 99,
  minChamber: 6,
  zones: ['outer'],
  locomotion: { kind: 'hold' },
  moves: [
    {
      // a line from the ringing bell to its target, then an orb down it. Anyone can send the orb back.
      id: 'serve',
      minRange: 0,
      maxRange: 99,
      cooldown: 0.1,
      windup: 0.8,
      telegraph: { shape: 'lane', length: 14, width: 0.9, track: 0.55 },
      action: { kind: 'volley', count: 1, spread: 0, speed: 7, damage: 14, range: 70, radius: 0.45, projectile: 'orb', bounces: 3 },
      recovery: 0.35,
    },
    {
      id: 'slam',
      minRange: 0,
      maxRange: 3.2,
      cooldown: 3.5,
      windup: 0.9,
      telegraph: { shape: 'circle', radius: 3.2, at: 'self', track: 0 },
      action: { kind: 'strike', damage: 18, knock: 9 },
      recovery: 0.8,
    },
    {
      // the slam of its second phase
      id: 'slam-wide',
      minRange: 0,
      maxRange: 3.8,
      cooldown: 3.2,
      windup: 0.9,
      telegraph: { shape: 'circle', radius: 3.8, at: 'self', track: 0 },
      action: { kind: 'strike', damage: 18, knock: 9 },
      recovery: 0.8,
    },
  ],
  rig: 'carillon',
  chimes: [30, 40],
  anchored: true,
  boss: true,
  brain: 'carillon',
  phases: [0.4],
  pips: 5,
};

export default CARILLON;
