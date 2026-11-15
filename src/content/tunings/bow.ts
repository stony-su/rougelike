// The Tunings of the Bow, the String (DESIGN.md section 4.3). Three builds of three, and one that
// belongs to none. Pinball plays the walls; Chain plays the crowd; the Line plays the Hook Shot.
// The rules that read these numbers are in src/sim/projectiles.ts (what an arrow does on its way
// and when it lands), and src/sim/classes/bow.ts (the string and the Hook Shot).
import type { TuningSet } from '../../sim/mods';

const set: TuningSet = {
  tunings: [
    // ---- Pinball: the walls
    {
      id: 'skipping-stone',
      icon: 'arrow',
      tone: 'bow',
      name: 'Skipping Stone',
      owner: 'bow',
      build: 'Pinball',
      rarity: 0,
      maxRank: 3,
      text: [
        'Your arrows bounce once more, and fly 8% faster off every wall.',
        'Your arrows bounce twice more, and fly 8% faster off every wall.',
        'Your arrows bounce 3 times more, and fly 8% faster off every wall.',
      ],
      effects: [
        { mod: 'bounces', op: 'add', v: [1, 2, 3] },
        { mod: 'bounceSpeed', op: 'set', v: [1.08, 1.08, 1.08] },
      ],
    },
    {
      id: 'crescendo',
      icon: 'burst',
      tone: 'bow',
      name: 'Crescendo',
      owner: 'bow',
      build: 'Pinball',
      rarity: 1,
      maxRank: 3,
      text: [
        'An arrow that has bounced twice bursts where it lands, for 6 to everything near.',
        'An arrow that has bounced twice bursts where it lands, for 9 to everything near.',
        'An arrow that has bounced twice bursts where it lands, for 12 to everything near.',
      ],
      effects: [{ mod: 'crescendo', op: 'set', v: [6, 9, 12] }],
    },
    {
      id: 'seeking-echo',
      icon: 'homing',
      tone: 'bow',
      name: 'Seeking Echo',
      owner: 'bow',
      build: 'Pinball',
      rarity: 2,
      maxRank: 3,
      text: [
        'Once it has bounced, an arrow bends toward the nearest Echo.',
        'Once it has bounced, an arrow bends harder toward the nearest Echo.',
        'Once it has bounced, an arrow hunts down the nearest Echo.',
      ],
      effects: [{ mod: 'seek', op: 'set', v: [1.5, 2.5, 3.5] }],
    },
    // ---- Chain: the crowd
    {
      id: 'glance',
      icon: 'chain',
      tone: 'bow',
      name: 'Glance',
      owner: 'bow',
      build: 'Chain',
      rarity: 0,
      maxRank: 3,
      text: [
        'Your arrows skip to one more Echo, from a tile further off.',
        'Your arrows skip to 2 more Echoes, from a tile and a half further off.',
        'Your arrows skip to 3 more Echoes, from 2 tiles further off.',
      ],
      effects: [
        { mod: 'skips', op: 'add', v: [1, 2, 3] },
        { mod: 'skipRange', op: 'add', v: [1, 1.5, 2] },
      ],
    },
    {
      id: 'splinter',
      icon: 'shards',
      tone: 'bow',
      name: 'Splinter',
      owner: 'bow',
      build: 'Chain',
      rarity: 1,
      maxRank: 3,
      text: [
        'An arrow that kills breaks into 2, which fly at other Echoes near for 60% each.',
        'An arrow that kills breaks into 3, which fly at other Echoes near for 60% each.',
        'An arrow that kills breaks into 4, which fly at other Echoes near for 60% each.',
      ],
      effects: [{ mod: 'splinter', op: 'set', v: [2, 3, 4] }],
    },
    {
      id: 'pinning-note',
      icon: 'pin',
      tone: 'bow',
      name: 'Pinning Note',
      owner: 'bow',
      build: 'Chain',
      rarity: 1,
      maxRank: 3,
      text: [
        'An arrow that has skipped roots what it strikes for half a second.',
        'An arrow that has skipped roots what it strikes for 0.8 seconds.',
        'An arrow that has skipped roots what it strikes for 1.1 seconds.',
      ],
      effects: [{ mod: 'pin', op: 'set', v: [0.5, 0.8, 1.1] }],
    },
    // ---- the Line: the Hook Shot
    {
      id: 'long-line',
      icon: 'hook',
      tone: 'bow',
      name: 'Long Line',
      owner: 'bow',
      build: 'Line',
      rarity: 0,
      maxRank: 3,
      text: [
        'The Hook Shot reaches 2 tiles further, and is ready 10% sooner.',
        'The Hook Shot reaches 3 tiles further, and is ready 20% sooner.',
        'The Hook Shot reaches 4 tiles further, and is ready 30% sooner.',
      ],
      effects: [
        { mod: 'hookRange', op: 'add', v: [2, 3, 4] },
        { mod: 'hookCd', op: 'set', v: [0.1, 0.2, 0.3] },
      ],
    },
    {
      id: 'barbed-line',
      icon: 'barb',
      tone: 'bow',
      name: 'Barbed Line',
      owner: 'bow',
      build: 'Line',
      rarity: 1,
      maxRank: 3,
      text: [
        'What the Hook Shot passes takes 14, not 6, and is thrown 30% harder.',
        'What the Hook Shot passes takes 20, not 6, and is thrown 60% harder.',
        'What the Hook Shot passes takes 26, not 6, and is thrown 90% harder.',
      ],
      effects: [
        { mod: 'hookDamage', op: 'add', v: [8, 14, 20] },
        { mod: 'hookImpulse', op: 'mul', v: [1.3, 1.6, 1.9] },
      ],
    },
    {
      id: 'full-quiver',
      icon: 'quiver',
      tone: 'bow',
      name: 'Full Quiver',
      owner: 'bow',
      build: 'Line',
      rarity: 2,
      maxRank: 3,
      locked: true,
      text: [
        'After a Hook Shot 4 arrows leave at once, not 3, and each has 1 more ricochet.',
        'After a Hook Shot 5 arrows leave at once, not 3, and each has 1 more ricochet.',
        'After a Hook Shot 6 arrows leave at once, not 3, and each has 1 more ricochet.',
      ],
      effects: [
        { mod: 'quiver', op: 'add', v: [1, 2, 3] },
        { mod: 'quiverBounces', op: 'set', v: [1, 1, 1] },
      ],
    },
    // ---- belongs to no build
    {
      id: 'heavy-fourth',
      icon: 'heavy',
      tone: 'bow',
      name: 'Heavy Fourth',
      owner: 'bow',
      build: 'Wildcard',
      rarity: 1,
      maxRank: 3,
      text: [
        'Every fourth arrow of a held volley is a heavy one: double damage, through 1 Echo, and one more bounce.',
        'Every fourth arrow of a held volley is a heavy one: two and a half times the damage, through 2 Echoes, and one more bounce.',
        'Every fourth arrow of a held volley is a heavy one: three times the damage, through 3 Echoes, and one more bounce.',
      ],
      effects: [
        { mod: 'heavyMul', op: 'set', v: [2, 2.5, 3] },
        { mod: 'heavyPierce', op: 'set', v: [1, 2, 3] },
      ],
    },
  ],
  harmonies: [
    {
      id: 'trick-shot',
      name: 'Trick Shot',
      parents: ['skipping-stone', 'seeking-echo'],
      text: 'From its third bounce on, an arrow always crits for double.',
      effects: [{ mod: 'trickShot', op: 'set', v: [1] }],
    },
    {
      id: 'chain-reaction',
      name: 'Chain Reaction',
      parents: ['glance', 'splinter'],
      text: 'The pieces of a split arrow keep the skips and bounces it still had.',
      effects: [{ mod: 'chainReaction', op: 'set', v: [1] }],
    },
    {
      id: 'slingshot',
      name: 'Slingshot',
      parents: ['long-line', 'barbed-line'],
      text: 'For 1.2 seconds after it lands you, the Hook Shot can be fired once more for nothing.',
      effects: [{ mod: 'slingshot', op: 'set', v: [1] }],
    },
  ],
};

export default set;
