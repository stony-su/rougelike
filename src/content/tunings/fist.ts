// The Tunings of the Fist, the Hand (DESIGN.md section 4.4). Three builds of three, and one that
// belongs to none. Billiards makes one body hit many; Wall Combo keeps one body in the air;
// Shockwave makes every impact a burst. The rules that read these numbers are in
// src/sim/bodies.ts (a body in flight), src/sim/classes/fist.ts (the punches) and
// src/sim/combat.ts (what is taken by a body in flight, and by a braced player).
import type { TuningSet } from '../../sim/mods';

const set: TuningSet = {
  tunings: [
    // ---- Billiards: one body, many hits
    {
      id: 'follow-through',
      icon: 'through',
      tone: 'fist',
      name: 'Follow Through',
      owner: 'fist',
      build: 'Billiards',
      rarity: 0,
      maxRank: 3,
      text: [
        'A body you send flying goes 10% faster, and ploughs through the first Echo it meets before it caroms.',
        'A body you send flying goes 20% faster, and ploughs through the first Echo it meets before it caroms.',
        'A body you send flying goes 20% faster, and ploughs through the first 2 Echoes it meets before it caroms.',
      ],
      effects: [
        { mod: 'launchMul', op: 'set', v: [1.1, 1.2, 1.2] },
        { mod: 'follow', op: 'set', v: [1, 1, 2] },
      ],
    },
    {
      id: 'carom-master',
      icon: 'carom',
      tone: 'fist',
      name: 'Carom Master',
      owner: 'fist',
      build: 'Billiards',
      rarity: 1,
      maxRank: 3,
      text: [
        'A carom passes on 80% of the motion, not 60%, and a chain runs one body longer.',
        'A carom passes on all of the motion, and a chain runs 2 bodies longer.',
        'A carom passes on all of the motion, and a chain runs 3 bodies longer.',
      ],
      effects: [
        { mod: 'caromPass', op: 'set', v: [0.8, 1, 1] },
        { mod: 'caromLinks', op: 'add', v: [1, 2, 3] },
      ],
    },
    {
      id: 'break-shot',
      icon: 'breakout',
      tone: 'fist',
      name: 'Break Shot',
      owner: 'fist',
      build: 'Billiards',
      rarity: 0,
      maxRank: 3,
      text: [
        'The Break throws things 30% harder, and is ready a second sooner when it hits 3 or more.',
        'The Break throws things 50% harder, and is ready 2 seconds sooner when it hits 3 or more.',
        'The Break throws things 70% harder, and is ready 3 seconds sooner when it hits 3 or more.',
      ],
      effects: [
        { mod: 'breakImpulse', op: 'mul', v: [1.3, 1.5, 1.7] },
        { mod: 'breakRefund', op: 'set', v: [1, 2, 3] },
      ],
    },
    // ---- Wall Combo: one body, kept in the air
    {
      id: 'wall-hammer',
      icon: 'wall',
      tone: 'fist',
      name: 'Wall Hammer',
      owner: 'fist',
      build: 'Wall Combo',
      rarity: 0,
      maxRank: 3,
      text: [
        'A body you send into a wall takes 50% more from the slam, and a hard slam leaves it stunned for half a second where it lands.',
        'A body you send into a wall takes 90% more from the slam, and a hard slam leaves it stunned for 0.8 seconds where it lands.',
        'A body you send into a wall takes 130% more from the slam, and a hard slam leaves it stunned for 1.1 seconds where it lands.',
      ],
      effects: [
        { mod: 'slamMul', op: 'set', v: [1.5, 1.9, 2.3] },
        { mod: 'slamStun', op: 'set', v: [0.5, 0.8, 1.1] },
      ],
    },
    {
      id: 'rebound-jab',
      icon: 'rebound',
      tone: 'fist',
      name: 'Rebound Jab',
      owner: 'fist',
      build: 'Wall Combo',
      rarity: 1,
      maxRank: 3,
      text: [
        'Jab a body in flight to send it on again where you aim: 50% harder, and faster, up to 3 times. It counts as a Return.',
        'Jab a body in flight to send it on again where you aim: 75% harder, and faster, up to 3 times. It counts as a Return.',
        'Jab a body in flight to send it on again where you aim: twice as hard, and faster, up to 3 times. It counts as a Return.',
      ],
      effects: [{ mod: 'reJab', op: 'set', v: [0.5, 0.75, 1] }],
    },
    {
      id: 'glass-jaw',
      icon: 'crack',
      tone: 'fist',
      name: 'Glass Jaw',
      owner: 'fist',
      build: 'Wall Combo',
      rarity: 1,
      maxRank: 3,
      text: [
        'A body you have sent flying takes 15% more from everyone until it lands.',
        'A body you have sent flying takes 25% more from everyone until it lands.',
        'A body you have sent flying takes 35% more from everyone until it lands.',
      ],
      effects: [{ mod: 'glassJaw', op: 'set', v: [0.15, 0.25, 0.35] }],
    },
    // ---- Shockwave: every impact a burst
    {
      id: 'thunderclap',
      icon: 'clap',
      tone: 'fist',
      name: 'Thunderclap',
      owner: 'fist',
      build: 'Shockwave',
      rarity: 0,
      maxRank: 3,
      text: [
        'A full Haymaker bursts where it lands for 10, and pops the light Echoes round it away.',
        'A full Haymaker bursts where it lands for 15, and pops the light Echoes round it away.',
        'A full Haymaker bursts where it lands for 20, and pops the light Echoes round it away.',
      ],
      effects: [{ mod: 'thunderclap', op: 'set', v: [10, 15, 20] }],
    },
    {
      id: 'iron-stance',
      icon: 'stance',
      tone: 'fist',
      name: 'Iron Stance',
      owner: 'fist',
      build: 'Shockwave',
      rarity: 1,
      maxRank: 3,
      text: [
        'While the hand is drawn back you take 30% less and are not knocked about.',
        'While the hand is drawn back you take 45% less and are not knocked about.',
        'While the hand is drawn back you take 60% less and are not knocked about, and it draws back 15% faster.',
      ],
      effects: [
        { mod: 'ironStance', op: 'set', v: [0.3, 0.45, 0.6] },
        { mod: 'chargeHaste', op: 'set', v: [1, 1, 1.15] },
      ],
    },
    {
      id: 'tremor',
      icon: 'quake',
      tone: 'fist',
      name: 'Tremor',
      owner: 'fist',
      build: 'Shockwave',
      rarity: 2,
      maxRank: 3,
      locked: true,
      text: [
        'A body you have sent flying bursts for 5 every time it bounces off the chamber.',
        'A body you have sent flying bursts for 8 every time it bounces off the chamber.',
        'A body you have sent flying bursts for 11 every time it bounces off the chamber.',
      ],
      effects: [{ mod: 'tremor', op: 'set', v: [5, 8, 11] }],
    },
    // ---- belongs to no build
    {
      id: 'heavy-hands',
      icon: 'fist',
      tone: 'fist',
      name: 'Heavy Hands',
      owner: 'fist',
      build: 'Wildcard',
      rarity: 2,
      maxRank: 3,
      text: [
        'The heavier the body you throw, the harder it hits what it caroms into: 25% more for a middling one, and a heavy one hits more than 3 times as hard.',
        'The heavier the body you throw, the harder it hits what it caroms into: 50% more for a middling one, and a heavy one hits more than 4 times as hard.',
        'The heavier the body you throw, the harder it hits what it caroms into: 75% more for a middling one, and a heavy one hits 6 times as hard.',
      ],
      effects: [{ mod: 'heavyHands', op: 'set', v: [1.25, 1.5, 1.75] }],
    },
  ],
  harmonies: [
    {
      id: 'pool-shark',
      name: 'Pool Shark',
      parents: ['follow-through', 'carom-master'],
      text: 'The third body of a chain bursts for 20 where it is struck.',
      effects: [{ mod: 'poolShark', op: 'set', v: [1] }],
    },
    {
      id: 'corner-pocket',
      name: 'Corner Pocket',
      parents: ['wall-hammer', 'rebound-jab'],
      text: 'A body that slams into a wall straight after your punch comes flying back to you, once for each punch.',
      effects: [{ mod: 'cornerPocket', op: 'set', v: [1] }],
    },
    {
      id: 'earthquake',
      name: 'Earthquake',
      parents: ['thunderclap', 'tremor'],
      text: 'The bursts of Thunderclap and Tremor throw back everything they hit.',
      effects: [{ mod: 'earthquake', op: 'set', v: [1] }],
    },
  ],
};

export default set;
