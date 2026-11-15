// The Tunings of the Bow, the String (DESIGN.md section 4.3). Three builds of three, and one that
// belongs to none. Pinball plays the walls; Chain plays the crowd; Stonework plays the Ringstone.
// The rules that read these numbers are in src/sim/projectiles.ts (what an arrow does on its way
// and when it lands), src/sim/stones.ts (the stones themselves) and src/sim/classes/bow.ts.
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
    // ---- Stonework: the Ringstone
    {
      id: 'twin-stones',
      icon: 'stones',
      tone: 'bow',
      name: 'Twin Stones',
      owner: 'bow',
      build: 'Stonework',
      rarity: 0,
      maxRank: 2,
      text: ['Two Ringstones may stand at once, and each stands twice as long.', 'Two Ringstones may stand at once, each stands twice as long, and the next is ready 25% sooner.'],
      effects: [
        { mod: 'stones', op: 'set', v: [2, 2] },
        { mod: 'stoneLife', op: 'set', v: [2, 2] },
        { mod: 'stoneCd', op: 'set', v: [0, 0.25] },
      ],
    },
    {
      id: 'resonant-stone',
      icon: 'pulse',
      tone: 'bow',
      name: 'Resonant Stone',
      owner: 'bow',
      build: 'Stonework',
      rarity: 1,
      maxRank: 3,
      text: [
        'What a Ringstone sends on lands 80% harder, not 50%, and a struck stone pulses for 8 round itself.',
        'What a Ringstone sends on lands 110% harder, not 50%, and a struck stone pulses for 12 round itself.',
        'What a Ringstone sends on lands 140% harder, not 50%, and a struck stone pulses for 16 round itself.',
      ],
      effects: [
        { mod: 'stoneBoost', op: 'set', v: [0.8, 1.1, 1.4] },
        { mod: 'stonePulse', op: 'set', v: [8, 12, 16] },
      ],
    },
    {
      id: 'lodestone',
      icon: 'magnet',
      tone: 'bow',
      name: 'Lodestone',
      owner: 'bow',
      build: 'Stonework',
      rarity: 2,
      maxRank: 3,
      locked: true,
      text: [
        'A planted Ringstone draws in the Echoes within 3 tiles of it.',
        'A planted Ringstone draws in the Echoes within 3 and a half tiles of it, faster.',
        'A planted Ringstone draws in the Echoes within 4 tiles of it, faster still.',
      ],
      effects: [{ mod: 'lodestone', op: 'set', v: [1.5, 2, 2.5] }],
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
      id: 'bell-tower',
      name: 'Bell Tower',
      parents: ['twin-stones', 'resonant-stone'],
      text: 'An arrow that hits one stone with the other in sight goes between them up to 4 times, pulsing at each, before it flies at an Echo.',
      effects: [{ mod: 'bellTower', op: 'set', v: [1] }],
    },
  ],
};

export default set;
