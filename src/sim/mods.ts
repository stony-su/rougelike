// What a player's Tunings add up to. Every Tuning is data: a list of changes to the numbers
// below, one value per rank. The rules read these numbers where they used to read constants, so
// a new Tuning that only changes numbers needs no code at all, and one that needs a new rule
// needs one new number here and one place that reads it.
import type { ClassId } from './types';

export interface Mods {
  // ---- anyone
  maxHp: number;
  dashCharges: number;
  /** Dash recharge time is multiplied by this. */
  dashRecharge: number;
  /** Damage bonus for a few seconds after a dash carries you through an attack. */
  afterimage: number;
  /** Impulse a dash gives to Echoes it passes through, and the damage it does them. */
  ram: number;
  ramDamage: number;
  /** Seconds between single points of Rally lost, instead of losing it all at once. 0 = off. */
  sustain: number;
  /** Every this many Rally points, a ring bursts round you and heals. 0 = off. */
  overtoneEvery: number;
  overtoneHeal: number;
  /** Rally the first Return of a chamber starts you at; that Return also crits. 0 = off. */
  openingRally: number;
  /** Returns burn (damage per second), chill (slow 0..1). */
  ember: number;
  frost: number;
  /** Every this many Rally points, lightning from the Echo just struck to two more. 0 = off. */
  stormEvery: number;
  /** How many Echoes that lightning jumps between, and what it does to each. */
  stormChain: number;
  stormDamage: number;
  chimeMul: number;
  /** Killing blows survived per chamber. */
  ward: number;
  reviveSpeed: number;

  // ---- Sword
  returnSpeed: number;
  returnPierce: number;
  /** Radians added to each side of every swing. */
  arc: number;
  returnHoming: number;
  /** Extra shots each return splits into. */
  returnSplit: number;
  riposteWindow: number;
  /** Swings doubled after a landed Riposte. */
  riposteBuff: number;
  counterStun: number;
  counterMark: number;
  /** Share of the Riposte's cooldown given back when it lands (0.5 with no Tuning). */
  encoreRefund: number;
  encoreDash: number;
  /** Damage of the crescent the third swing throws, and its bounces. 0 = none. */
  crescent: number;
  crescentBounces: number;
  /** Extra damage each time one of your own shots is struck again by your swing. 0 = cannot. */
  refork: number;
  /** Every this many Rally points the next swing is a full circle. 0 = off. */
  chorusEvery: number;
  /** Swing speed gained per Rally point. */
  swingHaste: number;

  // ---- Bow
  bounces: number;
  /** Speed multiplier at each bounce. */
  bounceSpeed: number;
  /** Burst damage when an arrow that has bounced twice lands. */
  crescendo: number;
  /** Distance at which an arrow that has bounced bends toward an Echo. 0 = never. */
  seek: number;
  skips: number;
  skipRange: number;
  /** Arrows a killing arrow splits into. */
  splinter: number;
  /** Seconds a skipped arrow roots its target. */
  pin: number;
  stones: number;
  stoneCd: number;
  stoneBoost: number;
  stonePulse: number;
  /** Speed at which a planted Ringstone pulls Echoes toward it. */
  lodestone: number;
  /** Damage multiplier of every fourth arrow of a held volley. 0 = off. */
  heavyMul: number;

  // ---- Fist
  /** Damage a body you launch does to the first Echo it ploughs through. 0 = it caroms off the first. */
  follow: number;
  /** Share of the closing speed a carom passes on (0.6 with no Tuning), and extra links in a chain. */
  caromPass: number;
  caromLinks: number;
  breakImpulse: number;
  breakRefund: number;
  slamMul: number;
  /** Extra seconds a body lies stunned after a wall slam. */
  slamStun: number;
  /** Speed multiplier when a jab strikes a body already in flight. 0 = an ordinary jab. */
  reJab: number;
  /** Extra damage bodies you launch take from everyone while in flight. */
  glassJaw: number;
  thunderclap: number;
  /** Share of damage shrugged off while the hand is drawn back. */
  ironStance: number;
  /** Burst damage at every bounce of a body you launch. */
  tremor: number;
  heavyHands: number;

  // ---- Harmonies (0 or 1)
  hallOfMirrors: number;
  answerInKind: number;
  standingWave: number;
  trickShot: number;
  chainReaction: number;
  bellTower: number;
  poolShark: number;
  cornerPocket: number;
  earthquake: number;
  steam: number;
  perfectPitch: number;
  cascade: number;
}

export type ModKey = keyof Mods;

/** A player with no Tunings. */
export function baseMods(): Mods {
  return {
    maxHp: 0,
    dashCharges: 0,
    dashRecharge: 1,
    afterimage: 0,
    ram: 0,
    ramDamage: 0,
    sustain: 0,
    overtoneEvery: 0,
    overtoneHeal: 0,
    openingRally: 0,
    ember: 0,
    frost: 0,
    stormEvery: 0,
    stormChain: 0,
    stormDamage: 0,
    chimeMul: 1,
    ward: 0,
    reviveSpeed: 1,
    returnSpeed: 1,
    returnPierce: 0,
    arc: 0,
    returnHoming: 0,
    returnSplit: 0,
    riposteWindow: 0,
    riposteBuff: 0,
    counterStun: 0,
    counterMark: 0,
    encoreRefund: 0.5,
    encoreDash: 0,
    crescent: 0,
    crescentBounces: 0,
    refork: 0,
    chorusEvery: 0,
    swingHaste: 0,
    bounces: 0,
    bounceSpeed: 1,
    crescendo: 0,
    seek: 0,
    skips: 0,
    skipRange: 0,
    splinter: 0,
    pin: 0,
    stones: 1,
    stoneCd: 0,
    stoneBoost: 0,
    stonePulse: 0,
    lodestone: 0,
    heavyMul: 0,
    follow: 0,
    caromPass: 0.6,
    caromLinks: 0,
    breakImpulse: 1,
    breakRefund: 0,
    slamMul: 1,
    slamStun: 0,
    reJab: 0,
    glassJaw: 0,
    thunderclap: 0,
    ironStance: 0,
    tremor: 0,
    heavyHands: 1,
    hallOfMirrors: 0,
    answerInKind: 0,
    standingWave: 0,
    trickShot: 0,
    chainReaction: 0,
    bellTower: 0,
    poolShark: 0,
    cornerPocket: 0,
    earthquake: 0,
    steam: 0,
    perfectPitch: 0,
    cascade: 0,
  };
}

/** One change a Tuning makes: a number set, added to or multiplied, with a value for each rank. */
export interface Effect {
  mod: ModKey;
  op: 'set' | 'add' | 'mul';
  /** The value at rank 1, 2 and 3. A single-rank Tuning lists one. */
  v: readonly number[];
}

/**
 * The families a Tuning can belong to. A family is a look: its cards, its emblems and what it
 * does in play all wear one colour (src/render/palette/tones.ts).
 */
export const TONE_IDS = ['dash', 'rally', 'fire', 'frost', 'storm', 'body', 'sword', 'bow', 'fist'] as const;
export type ToneId = (typeof TONE_IDS)[number];

export interface TuningDef {
  id: string;
  name: string;
  /** Its emblem, by name (src/ui/icons.ts), and the family whose colour it wears. */
  icon: string;
  tone: ToneId;
  /** Whose it is: one class, or 'common' for anyone. */
  owner: ClassId | 'common';
  /** The build it belongs to, for the draft's leanings and the card's label. */
  build: string;
  /** 0 common, 1 uncommon, 2 rare. */
  rarity: number;
  maxRank: number;
  /** Not offered until it has been unlocked at the Attunement. */
  locked?: boolean;
  /** What the card says, with the numbers of each rank. */
  text: readonly string[];
  effects: readonly Effect[];
}

export interface HarmonyDef {
  id: string;
  name: string;
  /** The two Tunings that, held together, switch it on. */
  parents: readonly [string, string];
  text: string;
  effects: readonly Effect[];
}

/** What one file of src/content/tunings holds: the Tunings of one owner, and the Harmonies between them. */
export interface TuningSet {
  tunings: readonly TuningDef[];
  harmonies: readonly HarmonyDef[];
}

/** The numbers a set of Tunings adds up to. */
export function computeMods(tunings: Readonly<Record<string, number>>, defs: Readonly<Record<string, TuningDef>>, harmonies: readonly HarmonyDef[]): Mods {
  const m = baseMods();
  const apply = (e: Effect, rank: number): void => {
    const v = e.v[Math.min(rank, e.v.length) - 1];
    if (e.op === 'set') m[e.mod] = v;
    else if (e.op === 'add') m[e.mod] += v;
    else m[e.mod] *= v;
  };
  // in a fixed order, so every laptop adds them up the same way
  for (const id of Object.keys(tunings).sort()) {
    const rank = tunings[id];
    const def = defs[id];
    if (!def || rank <= 0) continue;
    for (const e of def.effects) apply(e, rank);
  }
  for (const h of harmonies) {
    if ((tunings[h.parents[0]] ?? 0) > 0 && (tunings[h.parents[1]] ?? 0) > 0) for (const e of h.effects) apply(e, 1);
  }
  return m;
}

/** The Harmonies a set of Tunings has switched on. */
export function activeHarmonies(tunings: Readonly<Record<string, number>>, harmonies: readonly HarmonyDef[]): HarmonyDef[] {
  return harmonies.filter((h) => (tunings[h.parents[0]] ?? 0) > 0 && (tunings[h.parents[1]] ?? 0) > 0);
}

/** Problems in the Tunings and Harmonies, as human-readable strings. Used by the content tests. */
export function validateTunings(defs: Readonly<Record<string, TuningDef>>, harmonies: readonly HarmonyDef[]): string[] {
  const out: string[] = [];
  const base = baseMods();
  for (const key of Object.keys(defs)) {
    const t = defs[key];
    if (key !== t.id) out.push(`${key}: filed under another id (${t.id})`);
    if (!/^[a-z]+(-[a-z]+)*$/.test(t.id)) out.push(`${t.id}: ids are lower-case words joined by hyphens`);
    if (!Number.isInteger(t.maxRank) || t.maxRank < 1 || t.maxRank > 3) out.push(`${t.id}: maxRank is 1, 2 or 3`);
    if (t.text.length !== t.maxRank) out.push(`${t.id}: needs one line of text for each rank`);
    if (t.rarity !== 0 && t.rarity !== 1 && t.rarity !== 2) out.push(`${t.id}: rarity is 0, 1 or 2`);
    if (t.effects.length === 0) out.push(`${t.id}: changes nothing`);
    if (!t.icon) out.push(`${t.id}: has no emblem`);
    if (!TONE_IDS.includes(t.tone)) out.push(`${t.id}: ${String(t.tone)} is not a family`);
    for (const e of t.effects) {
      if (!(e.mod in base)) out.push(`${t.id}: there is no number called ${String(e.mod)}`);
      if (e.v.length !== t.maxRank && e.v.length !== 1) out.push(`${t.id}: ${String(e.mod)} needs one value for each rank`);
    }
  }
  const seen: string[] = [];
  for (const h of harmonies) {
    if (seen.includes(h.id)) out.push(`${h.id}: two Harmonies share this id`);
    seen.push(h.id);
    const a = defs[h.parents[0]];
    const b = defs[h.parents[1]];
    if (!a || !b) out.push(`${h.id}: a parent does not exist`);
    else if (a === b) out.push(`${h.id}: needs two different parents`);
    else if (a.owner !== b.owner && a.owner !== 'common' && b.owner !== 'common') out.push(`${h.id}: its parents belong to two classes, so nobody could hold both`);
    if (h.effects.length === 0) out.push(`${h.id}: changes nothing`);
    for (const e of h.effects) if (!(e.mod in base)) out.push(`${h.id}: there is no number called ${String(e.mod)}`);
  }
  return out;
}
