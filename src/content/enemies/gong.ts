// The Gong.
import { PI } from '../../core/dmath';
import type { EnemyDef } from '../../sim/defs';

const deg = (d: number): number => (d * PI) / 180;

/**
 * Walks at you behind a broad gong: blows and shots that meet it from the front ring off and do
 * nothing. Every class has a way round. Its bash is the opening: the gong is thrust out and then
 * hangs at its side while it recovers. A full Haymaker opens the guard by force, a Riposte sends
 * the bash back, a shot banked off a wall arrives from behind, and a body caromed into it does
 * not care which way it faces.
 */
export const GONG: EnemyDef = {
  id: 'gong',
  name: 'Gong',
  hp: 60,
  radius: 0.45,
  speed: 2.4,
  mass: 2.5,
  threat: 3,
  minChamber: 3,
  zones: ['outer', 'inner'],
  locomotion: { kind: 'chase', range: 1.7 },
  moves: [
    {
      id: 'bash',
      minRange: 0,
      maxRange: 2.1,
      cooldown: 2.8,
      windup: 0.55,
      // the cone follows its target for a moment, then locks; everyone inside it is struck
      telegraph: { shape: 'cone', radius: 2.2, halfArc: deg(50), track: 0.3 },
      action: { kind: 'strike', damage: 14, knock: 7 },
      // guard down: this is when to hit it
      recovery: 0.8,
    },
  ],
  rig: 'gong',
  chimes: [4, 7],
  shield: { arc: deg(70), open: 2.5 },
};

export default GONG;
