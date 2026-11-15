// The Tunings of the Sword, the Edge (DESIGN.md section 4.2). Three builds of three, and one that
// belongs to none. Mirror Guard sends more back; the Cyclone lives on the Whirlwind; Edge Wave
// makes shots of the Sword's own. The rules that read these numbers are in src/sim/classes/sword.ts
// (the swings and the Whirlwind) and src/sim/projectiles.ts (what a returned shot does).
import type { TuningSet } from '../../sim/mods';

/** Degrees as radians, for the arc a card speaks of in degrees. */
const deg = (d: number): number => (d * 3.141592653589793) / 180;

const set: TuningSet = {
  tunings: [
    // ---- Mirror Guard: send more back
    {
      id: 'clean-return',
      icon: 'fast',
      tone: 'sword',
      name: 'Clean Return',
      owner: 'sword',
      build: 'Mirror Guard',
      rarity: 0,
      maxRank: 3,
      text: [
        'Shots you send back fly 25% faster and go through 1 enemy.',
        'Shots you send back fly 40% faster and go through 2 enemies.',
        'Shots you send back fly 55% faster and go through 3 enemies.',
      ],
      effects: [
        { mod: 'returnSpeed', op: 'mul', v: [1.25, 1.4, 1.55] },
        { mod: 'returnPierce', op: 'add', v: [1, 2, 3] },
      ],
    },
    {
      id: 'wide-guard',
      icon: 'guard',
      tone: 'sword',
      name: 'Wide Guard',
      owner: 'sword',
      build: 'Mirror Guard',
      rarity: 1,
      maxRank: 3,
      text: [
        'Every swing is 20 degrees wider, and the shots it sends back curve toward whoever fired them.',
        'Every swing is 35 degrees wider, and the shots it sends back curve harder toward whoever fired them.',
        'Every swing is 50 degrees wider, and the shots it sends back hunt down whoever fired them.',
      ],
      effects: [
        // half of the widening goes to each side
        { mod: 'arc', op: 'add', v: [deg(10), deg(17.5), deg(25)] },
        { mod: 'returnHoming', op: 'set', v: [2, 3.5, 5] },
      ],
    },
    {
      id: 'second-voice',
      icon: 'split',
      tone: 'sword',
      name: 'Second Voice',
      owner: 'sword',
      build: 'Mirror Guard',
      rarity: 2,
      maxRank: 3,
      text: [
        'A shot you send back splits into 2, each at 70% of its damage.',
        'A shot you send back splits into 3, each at 65% of its damage.',
        'A shot you send back splits into 4, each at 60% of its damage.',
      ],
      effects: [{ mod: 'returnSplit', op: 'set', v: [1, 2, 3] }],
    },
    // ---- the Cyclone: the Whirlwind
    {
      id: 'tempered-spin',
      icon: 'hourglass',
      tone: 'sword',
      name: 'Tempered Spin',
      owner: 'sword',
      build: 'Cyclone',
      rarity: 0,
      maxRank: 3,
      text: [
        'The Whirlwind reaches 0.3 tiles further. After one that hits anything, your next 2 swings do double.',
        'The Whirlwind reaches half a tile further. After one that hits anything, your next 3 swings do double.',
        'The Whirlwind reaches 0.7 tiles further. After one that hits anything, your next 4 swings do double.',
      ],
      effects: [
        { mod: 'whirlReach', op: 'add', v: [0.3, 0.5, 0.7] },
        { mod: 'whirlBuff', op: 'set', v: [2, 3, 4] },
      ],
    },
    {
      id: 'counterweight',
      icon: 'target',
      tone: 'sword',
      name: 'Counterweight',
      owner: 'sword',
      build: 'Cyclone',
      rarity: 1,
      maxRank: 3,
      text: [
        'The Whirlwind and a perfect return stun what they strike for 0.6 seconds and mark it: 20% more damage from everyone for 4 seconds.',
        'The Whirlwind and a perfect return stun what they strike for 0.9 seconds and mark it: 30% more damage from everyone for 4 seconds.',
        'The Whirlwind and a perfect return stun what they strike for 1.2 seconds and mark it: 40% more damage from everyone for 4 seconds.',
      ],
      effects: [
        { mod: 'counterStun', op: 'set', v: [0.6, 0.9, 1.2] },
        { mod: 'counterMark', op: 'set', v: [0.2, 0.3, 0.4] },
      ],
    },
    {
      id: 'encore',
      icon: 'again',
      tone: 'sword',
      name: 'Encore',
      owner: 'sword',
      build: 'Cyclone',
      rarity: 2,
      maxRank: 2,
      text: [
        'A Whirlwind that cuts or sends back 3 things or more is ready again at once, and gives a dash charge back.',
        'A Whirlwind that cuts or sends back 3 things or more is ready again at once, gives a dash charge back, and heals 4.',
      ],
      effects: [
        { mod: 'encoreRefund', op: 'set', v: [1, 1] },
        { mod: 'encoreDash', op: 'set', v: [1, 1] },
        { mod: 'encoreHeal', op: 'set', v: [0, 4] },
      ],
    },
    // ---- Edge Wave: shots of the Sword's own
    {
      id: 'ringing-edge',
      icon: 'crescent',
      tone: 'sword',
      name: 'Ringing Edge',
      owner: 'sword',
      build: 'Edge Wave',
      rarity: 0,
      maxRank: 3,
      text: [
        'Your third swing throws a crescent for 12 that goes through enemies and bounces twice. After a bounce its hits are bounce hits.',
        'Your third swing throws a crescent for 16 that goes through enemies and bounces 3 times. After a bounce its hits are bounce hits.',
        'Your third swing throws a crescent for 20 that goes through enemies and bounces 4 times. After a bounce its hits are bounce hits.',
      ],
      effects: [
        { mod: 'crescent', op: 'set', v: [12, 16, 20] },
        { mod: 'crescentBounces', op: 'set', v: [2, 3, 4] },
      ],
    },
    {
      id: 'tuning-fork',
      icon: 'fork',
      tone: 'sword',
      name: 'Tuning Fork',
      owner: 'sword',
      build: 'Edge Wave',
      rarity: 1,
      maxRank: 3,
      text: [
        'Swing at your own crescents and the shots you have sent back to strike them on again: 40% harder each time, with all their range again, up to 5 times.',
        'Swing at your own crescents and the shots you have sent back to strike them on again: 60% harder each time, with all their range again, up to 5 times.',
        'Swing at your own crescents and the shots you have sent back to strike them on again: 80% harder each time, with all their range again, up to 5 times.',
      ],
      effects: [{ mod: 'refork', op: 'set', v: [0.4, 0.6, 0.8] }],
    },
    {
      id: 'chorus',
      icon: 'ringcut',
      tone: 'sword',
      name: 'Chorus',
      owner: 'sword',
      build: 'Edge Wave',
      rarity: 2,
      maxRank: 3,
      locked: true,
      text: [
        'For every 12 Combo you gain, your next swing is a Ring Cut: all the way round you, for 16, and it sends back everything it meets.',
        'For every 10 Combo you gain, your next swing is a Ring Cut: all the way round you, for 16, and it sends back everything it meets.',
        'For every 8 Combo you gain, your next swing is a Ring Cut: all the way round you, for 16, and it sends back everything it meets.',
      ],
      effects: [{ mod: 'chorusEvery', op: 'set', v: [12, 10, 8] }],
    },
    // ---- belongs to no build
    {
      id: 'bladesong',
      icon: 'blade',
      tone: 'sword',
      name: 'Bladesong',
      owner: 'sword',
      build: 'Wildcard',
      rarity: 1,
      maxRank: 3,
      text: ['Your swings are 2% quicker for every point of Combo.', 'Your swings are 3% quicker for every point of Combo.', 'Your swings are 4% quicker for every point of Combo.'],
      effects: [{ mod: 'swingHaste', op: 'set', v: [0.02, 0.03, 0.04] }],
    },
  ],
  harmonies: [
    {
      id: 'hall-of-mirrors',
      name: 'Hall of Mirrors',
      parents: ['clean-return', 'second-voice'],
      text: 'Every shot of a split return banks once more off a wall.',
      effects: [{ mod: 'hallOfMirrors', op: 'set', v: [1] }],
    },
    {
      id: 'second-spin',
      name: 'Second Spin',
      parents: ['tempered-spin', 'counterweight'],
      text: 'The Whirlwind goes round twice. The second turn reaches further, and what the first threw it strikes in flight: a bounce hit.',
      effects: [{ mod: 'secondSpin', op: 'set', v: [1] }],
    },
    {
      id: 'standing-wave',
      name: 'Standing Wave',
      parents: ['ringing-edge', 'tuning-fork'],
      text: 'A crescent can be struck on without end, and grows a quarter in size and speed each time.',
      effects: [{ mod: 'standingWave', op: 'set', v: [1] }],
    },
  ],
};

export default set;
