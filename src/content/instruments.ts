// The Field Kit: every upgrade in the game, as data.
//
// Heads mount on a stake and change that stake and the lines attached to it.
// Orders are global rule changes. Splices are never drafted: when two named Heads are both
// mounted, the line joining those two stakes gains the Splice.
//
// To add an instrument, add a record. Each is a list of effects bound to hooks (see EffectSpec in
// src/sim/defs.ts), plus optional stat mods, rule flags and Head traits. The text is filled from
// `values`, and effects should use those same arrays, so a description can never drift from what
// the instrument does.
import type { InstrumentDef, SpliceDef } from '../sim/defs';

const head = (d: Omit<InstrumentDef, 'kind'>): InstrumentDef => ({ ...d, kind: 'head' });
const order = (d: Omit<InstrumentDef, 'kind'>): InstrumentDef => ({ ...d, kind: 'order' });

// ---------------------------------------------------------------- Heads

const lampBurn = [5, 8, 11] as const;
const frostSlow = [0.35, 0.45, 0.55] as const;
const frostFreeze = [1, 1.3, 1.6] as const;
const bellDamage = [14, 20, 26] as const;
const lodeRadius = [3, 3.5, 4] as const;
const lodeSpeed = [1.2, 1.6, 2] as const;
const helioDamage = [12, 18, 24] as const;
const vernierBonus = [0.3, 0.45, 0.6] as const;
const barbRoot = [0.7, 1, 1.3] as const;
const markBonus = [0.2, 0.3, 0.4] as const;
const springDamage = [10, 15, 20] as const;
const anchorBonus = [2, 4, 6] as const;

const HEADS: InstrumentDef[] = [
  head({
    id: 'signal_lamp',
    name: 'Signal Lamp',
    rarity: 'common',
    maxRank: 3,
    text: 'Its lines scorch: enemies hit burn for {0} damage per second for {1} s.',
    values: [lampBurn, 3],
    effects: [{ on: 'lineHit', do: { kind: 'status', status: 'burn', power: lampBurn, duration: 3 } }],
    tint: 'lamp',
  }),
  head({
    id: 'frost_gauge',
    name: 'Frost Gauge',
    rarity: 'common',
    maxRank: 3,
    text: 'Its lines chill: enemies hit are slowed {0%} for {1} s. A discharge freezes them for {2} s instead.',
    values: [frostSlow, 2.5, frostFreeze],
    effects: [
      { on: 'lineHit', when: 'unripe', do: { kind: 'status', status: 'chill', power: frostSlow, duration: 2.5 } },
      { on: 'lineHit', when: 'ripe', do: { kind: 'status', status: 'freeze', power: 0, duration: frostFreeze } },
    ],
    tint: 'frost',
  }),
  head({
    id: 'station_bell',
    name: 'Station Bell',
    rarity: 'uncommon',
    maxRank: 3,
    text: 'When one of its lines discharges, a shockwave rings from this stake: {0} tiles, {1} damage.',
    values: [3, bellDamage],
    effects: [{ on: 'discharge', do: { kind: 'shockwave', from: 'stake', radius: 3, damage: bellDamage, knock: 1 } }],
    tint: 'bell',
  }),
  head({
    id: 'lodestone',
    name: 'Lodestone',
    rarity: 'uncommon',
    maxRank: 3,
    text: 'The stake pulls enemies within {0} tiles toward itself.',
    values: [lodeRadius],
    effects: [{ on: 'tick', do: { kind: 'pull', radius: lodeRadius, speed: lodeSpeed } }],
    tint: 'lode',
  }),
  head({
    id: 'heliograph',
    name: 'Heliograph',
    rarity: 'uncommon',
    maxRank: 3,
    text: 'Its lines reflect enemy projectiles; reflected shots deal {0}.',
    values: [helioDamage],
    traits: { reflect: helioDamage },
    tint: 'helio',
  }),
  head({
    id: 'vernier',
    name: 'Vernier',
    rarity: 'common',
    maxRank: 3,
    text: 'Its lines ripen {0%} faster.',
    values: [vernierBonus],
    traits: { ripenBonus: vernierBonus },
    tint: 'vernier',
  }),
  head({
    id: 'barbed_chain',
    name: 'Barbed Chain',
    rarity: 'common',
    maxRank: 3,
    text: 'Enemies that trip its lines are rooted for {0} s (once per enemy per {1} s).',
    values: [barbRoot, 3],
    effects: [{ on: 'lineHit', when: 'trip', do: { kind: 'status', status: 'root', power: 0, duration: barbRoot, immunity: 3 } }],
    tint: 'barb',
  }),
  head({
    id: 'witness_mark',
    name: 'Witness Mark',
    rarity: 'common',
    maxRank: 3,
    text: 'Enemies hit by its lines are Marked for {0} s and take {1%} more from the Rod and Plumb Shot.',
    values: [4, markBonus],
    effects: [{ on: 'lineHit', do: { kind: 'status', status: 'mark', power: markBonus, duration: 4 } }],
    tint: 'mark',
  }),
  head({
    id: 'spring_stake',
    name: 'Spring Stake',
    rarity: 'uncommon',
    maxRank: 3,
    text: 'When this stake lands from a whip or a yank, it bursts: {0} tiles, {1} damage, knockback outward.',
    values: [2, springDamage],
    effects: [{ on: 'land', do: { kind: 'shockwave', from: 'stake', radius: 2, damage: springDamage, knock: 2.5 } }],
    tint: 'spring',
  }),
  head({
    id: 'anchor_pin',
    name: 'Anchor Pin',
    rarity: 'common',
    maxRank: 3,
    text: 'This stake cannot be eaten or shoved and its lines cannot be severed. Its lines deal {0} more.',
    values: [anchorBonus],
    traits: { anchored: true, unseverable: true, lineBonus: anchorBonus },
    tint: 'anchor',
  }),
];

// ---------------------------------------------------------------- Orders

const quickBonus = [0.2, 0.35] as const;

const ORDERS: InstrumentDef[] = [
  order({
    id: 'quickchalk',
    name: 'Quickchalk',
    rarity: 'common',
    maxRank: 2,
    text: 'All lines ripen {0%} faster.',
    values: [quickBonus],
    mods: { ripenBonus: quickBonus },
  }),
  order({
    id: 'homestead',
    name: 'Homestead',
    rarity: 'uncommon',
    maxRank: 1,
    text: 'For {0} s after each whip, while you stand in your Plot you take {1%} less damage and swing {2%} faster.',
    values: [4, 0.3, 0.25],
    effects: [{ on: 'whip', do: { kind: 'plotBuff', duration: 4, damageTaken: 0.3, swingSpeed: 0.25 } }],
  }),
  order({
    id: 'slingshot',
    name: 'Slingshot',
    rarity: 'uncommon',
    maxRank: 1,
    text: 'Dashing across one of your ripe lines spends it: the dash travels {0} tiles further and deals the discharge to everything it passes through.',
    values: [2],
    effects: [{ on: 'dashCross', when: 'ripe', do: { kind: 'slingshot', extra: 2 } }],
  }),
  order({
    id: 'fine_tolerance',
    name: 'Fine Tolerance',
    rarity: 'common',
    maxRank: 1,
    text: 'Whips from a Plot smaller than {0} square tiles deal {1%} more.',
    values: [8, 0.5],
    mods: { whipSmallArea: 8, whipSmallBonus: 0.5 },
  }),
  order({
    id: 'long_stride',
    name: 'Long Stride',
    rarity: 'common',
    maxRank: 1,
    text: 'Sustained movement builds up to {0%} more speed over {1} s. Lost when hit.',
    values: [0.25, 3],
    effects: [
      { on: 'tick', do: { kind: 'stride', max: 0.25, buildTime: 3 } },
      { on: 'hurt', do: { kind: 'stride', max: 0.25, buildTime: 3 } },
    ],
  }),
  order({
    id: 'surveyors_eye',
    name: "Surveyor's Eye",
    rarity: 'uncommon',
    maxRank: 1,
    text: 'Rod hits on enemies in your Plot or on a line are critical: {0%} more damage instead of 25%.',
    values: [0.75],
    mods: { rodSurveyed: 0.75 },
  }),
  order({
    id: 'chalk_dust',
    name: 'Chalk Dust',
    rarity: 'common',
    maxRank: 1,
    text: 'A whip leaves its swept ground dusted for {0} s: enemies there are slowed {1%} and take {2%} more line damage.',
    values: [3, 0.3, 0.15],
    effects: [{ on: 'whip', do: { kind: 'zone', shape: 'sweep', zone: 'dust', duration: 3, slow: 0.3, lineBonus: 0.15 } }],
  }),
  order({
    id: 'double_entry',
    name: 'Double Entry',
    rarity: 'uncommon',
    maxRank: 1,
    text: 'Every third whip sweeps twice; the second sweep deals {0%} damage.',
    values: [0.5],
    effects: [{ on: 'whip', do: { kind: 'echoSweep', every: 3, scale: 0.5, delay: 0.14 } }],
  }),
  order({
    id: 'datum',
    name: 'Datum',
    rarity: 'common',
    maxRank: 1,
    text: 'Standing still in your Plot for {0} s grants a shield that absorbs {1} damage ({2} s cooldown).',
    values: [0.8, 15, 10],
    effects: [{ on: 'tick', do: { kind: 'plotShield', still: 0.8, amount: 15, cooldown: 10 } }],
  }),
  order({
    id: 'tally_stick',
    name: 'Tally Stick',
    rarity: 'common',
    maxRank: 1,
    text: 'Each trip grants {0} Chalk (up to {1} per sheet). Picking up Chalk heals {2} (up to {3} per sheet).',
    values: [1, 12, 1, 10],
    effects: [
      { on: 'lineHit', when: 'trip', do: { kind: 'grantChalk', amount: 1, cap: 12 } },
      { on: 'chalk', do: { kind: 'heal', amount: 1, cap: 10 } },
    ],
  }),
  order({
    id: 'hammer_drill',
    name: 'Hammer Drill',
    rarity: 'common',
    maxRank: 1,
    text: 'The hammer also rings its lines: every enemy touching them takes a line hit at once.',
    effects: [{ on: 'hammer', do: { kind: 'ringLines' } }],
  }),
  order({
    id: 'spare_cord',
    name: 'Spare Cord',
    rarity: 'common',
    maxRank: 1,
    text: 'Plumb Shot holds one more charge and drags {0} tiles further.',
    values: [1.5],
    mods: { plumbCharges: 1, plumbDrag: 1.5 },
  }),
  order({
    id: 'third_wind',
    name: 'Third Wind',
    rarity: 'uncommon',
    maxRank: 1,
    text: 'One more dash charge.',
    mods: { dashCharges: 1 },
  }),
  order({
    id: 'iron_pins',
    name: 'Iron Pins',
    rarity: 'common',
    maxRank: 1,
    text: 'Severed lines mend twice as fast. An eaten stake returns in half the time.',
    mods: { severTime: 0.5, lostTime: 0.5 },
  }),
  order({
    id: 'fourth_stake',
    name: 'Fourth Stake',
    rarity: 'rare',
    maxRank: 1,
    locked: true,
    text: 'Carry four stakes. They link as a ring in plant order: four lines, one four-sided Plot.',
    mods: { stakes: 1 },
  }),
  order({
    id: 'backsight',
    name: 'Backsight',
    rarity: 'rare',
    maxRank: 1,
    locked: true,
    text: 'Plumb Shot on your own stake swaps places with it instead of yanking it. Its lines sweep.',
    flags: ['plumbSwap'],
  }),
  order({
    id: 'foresight',
    name: 'Foresight',
    rarity: 'rare',
    maxRank: 1,
    locked: true,
    text: 'The lines from you to your two newest stakes are live: they trip enemies for {0}.',
    values: [8],
    mods: { liveLineDamage: 8 },
    flags: ['liveLines'],
  }),
  order({
    id: 'offset',
    name: 'Offset',
    rarity: 'rare',
    maxRank: 1,
    locked: true,
    text: 'Plumb Shot fired at open ground sends your oldest stake to the impact point, sweeping as it goes.',
    flags: ['plumbOffset'],
  }),
];

// ---------------------------------------------------------------- Splices

export const SPLICES: readonly SpliceDef[] = [
  {
    id: 'steamline',
    name: 'Steamline',
    heads: ['signal_lamp', 'frost_gauge'],
    text: 'A hit leaves a steam wall along the line for {0} s. It blocks enemy projectiles and scalds for {1} per second.',
    values: [4, 10],
    effects: [{ on: 'lineHit', do: { kind: 'zone', shape: 'line', zone: 'steam', duration: 4, dps: 10, blocks: true, width: 0.6 } }],
  },
  {
    id: 'tolling_furnace',
    name: 'Tolling Furnace',
    heads: ['station_bell', 'signal_lamp'],
    text: "When the line discharges, the Bell's toll ignites every enemy in the Plot: {0} per second for {1} s.",
    values: [8, 3],
    effects: [{ on: 'discharge', do: { kind: 'burnPlot', dps: 8, duration: 3 } }],
  },
  {
    id: 'glacier_haul',
    name: 'Glacier Haul',
    heads: ['lodestone', 'frost_gauge'],
    text: 'Enemies hit by the line slide to the Lodestone and freeze for {0} s on arrival.',
    values: [1],
    effects: [{ on: 'lineHit', do: { kind: 'haul', toHead: 'lodestone', freeze: 1 } }],
  },
  {
    id: 'sun_dog',
    name: 'Sun Dog',
    heads: ['heliograph', 'signal_lamp'],
    text: 'When the line turns ripe it fires a beam along itself to the walls: {0} damage, and it ignites.',
    values: [16],
    effects: [{ on: 'ripen', do: { kind: 'beam', damage: 16, burn: 6, burnTime: 3 } }],
  },
  {
    id: 'resonance',
    name: 'Resonance',
    heads: ['station_bell', 'vernier'],
    text: 'When the line discharges, your other lines turn ripe at once.',
    effects: [{ on: 'discharge', do: { kind: 'ripenOthers' } }],
  },
  {
    id: 'snare',
    name: 'Snare',
    heads: ['barbed_chain', 'lodestone'],
    text: 'Enemies pulled within {0} tile of the Lodestone are rooted for {1} s and take {2}.',
    values: [1, 1.2, 8],
    effects: [{ on: 'tick', do: { kind: 'snare', atHead: 'lodestone', radius: 1, root: 1.2, damage: 8, cooldown: 4 } }],
  },
  {
    id: 'dead_reckoning',
    name: 'Dead Reckoning',
    heads: ['witness_mark', 'vernier'],
    text: 'When the line turns ripe it lashes the nearest Marked enemy within {0} tiles with a discharge.',
    values: [6],
    effects: [{ on: 'ripen', do: { kind: 'lash', range: 6 } }],
  },
  {
    id: 'recoil',
    name: 'Recoil',
    heads: ['spring_stake', 'anchor_pin'],
    text: 'When the Spring Stake lands, a second burst fires at the Anchor Pin: {0} tiles, {1} damage, pulling enemies toward it.',
    values: [2, 12],
    effects: [{ on: 'land', do: { kind: 'shockwave', from: 'otherStake', radius: 2, damage: 12, knock: 2.5, inward: true } }],
  },
];

export const INSTRUMENTS: Readonly<Record<string, InstrumentDef>> = Object.fromEntries([...HEADS, ...ORDERS].map((d) => [d.id, d]));
