// The Tunings anyone can take, whatever their class (DESIGN.md section 4.5). Each is a list of
// changes to the numbers in src/sim/mods.ts, one value per rank; the rules that read those
// numbers are in src/sim (player.ts for the dash, rally.ts for Rally, combat.ts for the rest).
import type { TuningSet } from '../../sim/mods';

const set: TuningSet = {
  tunings: [
    // ---- the dash
    {
      id: 'third-wind',
      name: 'Third Wind',
      owner: 'common',
      build: 'Dash',
      rarity: 0,
      maxRank: 2,
      text: ['One more dash charge.', 'One more dash charge, and charges come back 20% faster.'],
      effects: [
        { mod: 'dashCharges', op: 'add', v: [1, 1] },
        { mod: 'dashRecharge', op: 'mul', v: [1, 0.8] },
      ],
    },
    {
      id: 'afterimage',
      name: 'Afterimage',
      owner: 'common',
      build: 'Dash',
      rarity: 1,
      maxRank: 3,
      text: ['Dash through an attack: +30% damage for 3 seconds.', 'Dash through an attack: +45% damage for 3 seconds.', 'Dash through an attack: +60% damage for 3 seconds.'],
      effects: [{ mod: 'afterimage', op: 'set', v: [0.3, 0.45, 0.6] }],
    },
    {
      id: 'ram',
      name: 'Ram',
      owner: 'common',
      build: 'Dash',
      rarity: 0,
      maxRank: 3,
      text: ['Your dash knocks Echoes aside for 6 damage.', 'Your dash knocks Echoes aside, harder, for 9 damage.', 'Your dash knocks Echoes aside, harder still, for 12 damage.'],
      effects: [
        { mod: 'ram', op: 'set', v: [7, 8, 9] },
        { mod: 'ramDamage', op: 'set', v: [6, 9, 12] },
      ],
    },
    // ---- Rally
    {
      id: 'sustain',
      name: 'Sustain',
      owner: 'common',
      build: 'Rally',
      rarity: 1,
      maxRank: 2,
      text: ['Rally steps down a point every half second instead of falling to nothing.', 'Rally steps down a point every 0.8 seconds instead of falling to nothing.'],
      effects: [{ mod: 'sustain', op: 'set', v: [0.5, 0.8] }],
    },
    {
      id: 'overtone',
      name: 'Overtone',
      owner: 'common',
      build: 'Rally',
      rarity: 1,
      maxRank: 3,
      text: [
        'Every 12 Rally gained: a ring bursts round you for 15 and heals 2.',
        'Every 10 Rally gained: a ring bursts round you for 15 and heals 3.',
        'Every 8 Rally gained: a ring bursts round you for 15 and heals 4.',
      ],
      effects: [
        { mod: 'overtoneEvery', op: 'set', v: [12, 10, 8] },
        { mod: 'overtoneHeal', op: 'set', v: [2, 3, 4] },
      ],
    },
    {
      id: 'opening-note',
      name: 'Opening Note',
      owner: 'common',
      build: 'Rally',
      rarity: 0,
      maxRank: 3,
      text: [
        'Your first Return in a chamber hits double and sets Rally to 4.',
        'Your first Return in a chamber hits double and sets Rally to 6.',
        'Your first Return in a chamber hits double and sets Rally to 8.',
      ],
      effects: [{ mod: 'openingRally', op: 'set', v: [4, 6, 8] }],
    },
    // ---- the elements, which ride on Returns
    {
      id: 'ember-return',
      name: 'Ember Return',
      owner: 'common',
      build: 'Elements',
      rarity: 0,
      maxRank: 3,
      text: ['Returns burn: 4 damage a second for 3 seconds.', 'Returns burn: 6 damage a second for 3 seconds.', 'Returns burn: 8 damage a second for 3 seconds.'],
      effects: [{ mod: 'ember', op: 'set', v: [4, 6, 8] }],
    },
    {
      id: 'frost-return',
      name: 'Frost Return',
      owner: 'common',
      build: 'Elements',
      rarity: 0,
      maxRank: 3,
      text: ['Returns chill: 25% slower for 3 seconds.', 'Returns chill: 35% slower for 3 seconds.', 'Returns chill: 45% slower for 3 seconds.'],
      effects: [{ mod: 'frost', op: 'set', v: [0.25, 0.35, 0.45] }],
    },
    {
      id: 'storm-return',
      name: 'Storm Return',
      owner: 'common',
      build: 'Elements',
      rarity: 1,
      maxRank: 3,
      text: [
        'Every 8 Rally gained: lightning jumps between 2 Echoes for 8.',
        'Every 6 Rally gained: lightning jumps between 3 Echoes for 10.',
        'Every 5 Rally gained: lightning jumps between 4 Echoes for 12.',
      ],
      effects: [
        { mod: 'stormEvery', op: 'set', v: [8, 6, 5] },
        { mod: 'stormChain', op: 'set', v: [2, 3, 4] },
        { mod: 'stormDamage', op: 'set', v: [8, 10, 12] },
      ],
    },
    // ---- body, purse, team
    {
      id: 'stout-heart',
      name: 'Stout Heart',
      owner: 'common',
      build: 'Body',
      rarity: 0,
      maxRank: 3,
      text: ['+15 maximum health, healed at once.', '+30 maximum health, healed at once.', '+45 maximum health, healed at once.'],
      effects: [{ mod: 'maxHp', op: 'add', v: [15, 30, 45] }],
    },
    {
      id: 'tithe',
      name: 'Tithe',
      owner: 'common',
      build: 'Body',
      rarity: 0,
      maxRank: 3,
      text: ['Your share of Chimes is 20% bigger.', 'Your share of Chimes is 35% bigger.', 'Your share of Chimes is 50% bigger.'],
      effects: [{ mod: 'chimeMul', op: 'set', v: [1.2, 1.35, 1.5] }],
    },
    {
      id: 'echo-ward',
      name: 'Echo Ward',
      owner: 'common',
      build: 'Body',
      rarity: 2,
      maxRank: 3,
      text: [
        'Once a chamber, a blow that would down you leaves you at 1 health and bursts for 15.',
        'Once a chamber, survive a downing blow with a burst. You help allies up 30% faster.',
        'Once a chamber, survive a downing blow with a burst. You help allies up 60% faster.',
      ],
      effects: [
        { mod: 'ward', op: 'set', v: [1, 1, 1] },
        { mod: 'reviveSpeed', op: 'set', v: [1, 1.3, 1.6] },
      ],
    },
  ],
  harmonies: [
    { id: 'steam', name: 'Steam', parents: ['ember-return', 'frost-return'], text: 'An Echo both burning and chilled bursts for 25 and is staggered.', effects: [{ mod: 'steam', op: 'set', v: [1] }] },
    {
      id: 'perfect-pitch',
      name: 'Perfect Pitch',
      parents: ['sustain', 'opening-note'],
      text: 'At full Rally every Return hits half as hard again.',
      effects: [{ mod: 'perfectPitch', op: 'set', v: [1] }],
    },
    { id: 'cascade', name: 'Cascade', parents: ['overtone', 'storm-return'], text: 'Overtone rings strike everything they touch with lightning.', effects: [{ mod: 'cascade', op: 'set', v: [1] }] },
  ],
};

export default set;
