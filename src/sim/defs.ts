// Content schemas. Content files (src/content) are typed data that satisfy these shapes; the
// simulation never imports content directly. It is handed a ContentRegistry when a world is
// created, so tests can run the same engine on fixture content.

export type ZoneId = 'bluefen' | 'unruled';
export type RoomKind = 'combat' | 'tutorial' | 'shop' | 'rest' | 'event' | 'miniboss' | 'boss';

export interface RoomTemplate {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  /** ASCII tile map; see the legend in src/content/rooms.ts. */
  map: readonly string[];
}

// ---------------------------------------------------------------- enemies

/** How an enemy moves when it is not attacking. */
export type LocomotionSpec =
  /** Walk at the player until within `range`. `weave` adds a side-to-side sway. */
  | { kind: 'chase'; range: number; weave?: number }
  /** Hold a distance band from the player. */
  | { kind: 'kite'; min: number; max: number }
  /** Stand still. */
  | { kind: 'hold' };

/** The warning drawn on the floor during a wind-up. `track` is how long it follows the player before locking. */
export type TelegraphSpec =
  /** A strip from the enemy toward the target. */
  | { shape: 'lane'; length: number; width: number; track: number }
  /** A disc around the enemy, or at the targeted point. */
  | { shape: 'circle'; radius: number; at: 'self' | 'target'; track: number }
  /** A wedge from the enemy toward the target. */
  | { shape: 'cone'; radius: number; halfArc: number; track: number };

/** What happens when the wind-up ends. These are the shared action primitives every enemy is built from. */
export type ActionSpec =
  /** Dash along the lane; hurts the player on contact. */
  | { kind: 'lunge'; distance: number; speed: number; damage: number; knock: number }
  /** Hurt everything inside the telegraph, at once. */
  | { kind: 'strike'; damage: number; knock: number }
  /** Fire projectiles in a fan toward the target. */
  | { kind: 'volley'; count: number; spread: number; speed: number; damage: number; range: number; radius: number; projectile: string };

export interface MoveSpec {
  id: string;
  /** The move may start when the player's distance is within this band. */
  minRange: number;
  maxRange: number;
  cooldown: number;
  /** Seconds of telegraphed wind-up. Never below 0.35 for a damaging move (tested). */
  windup: number;
  telegraph: TelegraphSpec;
  action: ActionSpec;
  /** Seconds the enemy is open after the action. */
  recovery: number;
  /** Relative chance when several moves are possible. Default 1. */
  weight?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  radius: number;
  speed: number;
  /** Knockback and drags are divided by mass. 1 is ordinary; 3 or more cannot be dragged. */
  mass: number;
  /** Cost against a wave's threat budget. */
  threat: number;
  /** First sheet (1-based) this enemy may appear on. */
  minSheet: number;
  zones: readonly ZoneId[];
  locomotion: LocomotionSpec;
  moves: readonly MoveSpec[];
  /** Rig id in the render registry. */
  rig: string;
  /** Chalk dropped on death: [min, max]. */
  chalk: readonly [number, number];
  /** It takes the player's tools away (eats stakes, cuts lines). Two kinds of disruptor never share an early wave. */
  disruptor?: boolean;
}

// ---------------------------------------------------------------- instruments (upgrades)

export type Rarity = 'common' | 'uncommon' | 'rare';

/** A number, or one value per rank (rank 1 first). */
export type Ranked = number | readonly number[];

export const ranked = (v: Ranked, rank: number): number =>
  typeof v === 'number' ? v : v[Math.max(0, Math.min(v.length - 1, rank - 1))];

/** Moments the kit can react to. */
export type HookName =
  /** A stake was planted from the hand. */
  | 'plant'
  /** A relocated stake landed. */
  | 'land'
  /** A line hit an enemy, by trip or by sweep. */
  | 'lineHit'
  /** A line turned ripe. */
  | 'ripen'
  /** A ripe line discharged. */
  | 'discharge'
  /** A stake took off (whip, yank, offset, swap). */
  | 'whip'
  /** The Rod hammered a stake. */
  | 'hammer'
  /** The player dashed across one of their own lines. */
  | 'dashCross'
  /** Every simulation tick. */
  | 'tick'
  /** The player took damage. */
  | 'hurt'
  /** The player picked up Chalk. */
  | 'chalk';

export type StatusName = 'burn' | 'chill' | 'freeze' | 'root' | 'mark';

/**
 * What an instrument does at a hook. These are the engine's effect kinds; an instrument is a list
 * of them with numbers. A new instrument built from existing kinds needs no engine change.
 */
export type EffectSpec =
  /** Put a condition on the enemy the line just hit. */
  | { kind: 'status'; status: StatusName; power: Ranked; duration: Ranked; immunity?: number }
  /** Damage everything around a point. `from` picks the point. */
  | { kind: 'shockwave'; from: 'stake' | 'player' | 'otherStake'; radius: Ranked; damage: Ranked; knock?: number; inward?: boolean }
  /** Each tick, drag enemies near this stake toward it. */
  | { kind: 'pull'; radius: Ranked; speed: Ranked }
  /** Each tick, root and hurt enemies that come within reach of this stake. */
  | { kind: 'snare'; atHead: string; radius: number; root: number; damage: number; cooldown: number }
  /** Leave a lingering area on the ground: along the line that hit, or over the ground a whip swept. */
  | { kind: 'zone'; shape: 'line' | 'sweep'; zone: string; duration: number; slow?: number; lineBonus?: number; dps?: number; blocks?: boolean; width?: number }
  /** Fire a beam along the line, out to the walls. */
  | { kind: 'beam'; damage: Ranked; burn?: number; burnTime?: number }
  /** The player's other lines turn ripe. */
  | { kind: 'ripenOthers' }
  /** Spend the ripe line on the nearest Marked enemy in range. */
  | { kind: 'lash'; range: number }
  /** Burn every enemy standing in the Plot. */
  | { kind: 'burnPlot'; dps: number; duration: number }
  /** Slide the chilled enemy to the stake that carries a named Head, then freeze it. */
  | { kind: 'haul'; toHead: string; freeze: number }
  /** Every enemy touching the hammered stake's lines takes a line hit. */
  | { kind: 'ringLines' }
  /** A dash across a ripe line spends it: the dash goes further and the discharge lands on everything it passes. */
  | { kind: 'slingshot'; extra: number }
  /** Every Nth whip sweeps a second time at reduced damage. */
  | { kind: 'echoSweep'; every: number; scale: number; delay: number }
  /** A timed buff on the player, active while standing in the Plot. */
  | { kind: 'plotBuff'; duration: number; damageTaken: number; swingSpeed: number }
  /** Standing still in the Plot grants a shield. */
  | { kind: 'plotShield'; still: number; amount: number; cooldown: number }
  /** Speed builds with sustained movement; a hit resets it. Bind to both 'tick' and 'hurt'. */
  | { kind: 'stride'; max: number; buildTime: number }
  /** Grant Chalk, up to a cap per room. */
  | { kind: 'grantChalk'; amount: number; cap: number }
  /** Heal, up to a cap per room. */
  | { kind: 'heal'; amount: number; cap: number };

export interface EffectBinding {
  on: HookName;
  /** For line hooks: only when the hit was a discharge, an ordinary hit, a trip, or a sweep. */
  when?: 'ripe' | 'unripe' | 'trip' | 'sweep';
  do: EffectSpec;
}

/** Numbers the kit adds to or multiplies into the base rules. */
export interface KitMods {
  /** Every line ripens this much faster (0.2 = 20% faster). */
  ripenBonus?: Ranked;
  /** Added stakes carried. */
  stakes?: Ranked;
  /** Added dash charges. */
  dashCharges?: Ranked;
  /** Multiplies dash recharge time. */
  dashRecharge?: Ranked;
  /** Added Plumb Shot charges. */
  plumbCharges?: Ranked;
  /** Added Plumb Shot drag distance, tiles. */
  plumbDrag?: Ranked;
  /** Multiplies how long a severed line stays cut. */
  severTime?: Ranked;
  /** Multiplies how long an eaten stake stays lost. */
  lostTime?: Ranked;
  /** Replaces the Rod's bonus against surveyed enemies (0.75 = +75%). */
  rodSurveyed?: Ranked;
  /** Whips from a Plot smaller than `whipSmallArea` deal this much more (0.5 = +50%). */
  whipSmallBonus?: Ranked;
  whipSmallArea?: number;
  /** Damage of the live lines from the player to the newest stakes (with the liveLines flag). */
  liveLineDamage?: number;
}

/** Switches that change how a rule works. */
export type KitFlag =
  /** Plumb Shot on an own stake swaps places with it. */
  | 'plumbSwap'
  /** Plumb Shot at open ground sends the oldest stake there. */
  | 'plumbOffset'
  /** The lines from the player to the two newest stakes trip enemies. */
  | 'liveLines';

/** What a Head changes about its own stake and the lines attached to it. */
export interface HeadTraits {
  /** Cannot be eaten or shoved. */
  anchored?: boolean;
  /** Its lines cannot be severed. */
  unseverable?: boolean;
  /** Added damage on its lines. */
  lineBonus?: Ranked;
  /** Its lines ripen this much faster (0.3 = 30% faster). */
  ripenBonus?: Ranked;
  /** Its lines reflect enemy projectiles for this much damage. */
  reflect?: Ranked;
}

export interface InstrumentDef {
  id: string;
  name: string;
  /** Heads mount on a stake; Orders are global. */
  kind: 'head' | 'order';
  rarity: Rarity;
  maxRank: number;
  /** Must be bought in the Office Ledger before it can be offered. */
  locked?: boolean;
  /** Description with {0}, {1}... filled from `values` at the current rank, so text and effect cannot drift apart. */
  text: string;
  values?: readonly Ranked[];
  mods?: KitMods;
  flags?: readonly KitFlag[];
  traits?: HeadTraits;
  /** For a Head, effects apply to its own stake and the lines attached to it. */
  effects?: readonly EffectBinding[];
  /** Colour role for the Head on its stake and its lines (a palette key). */
  tint?: string;
}

export interface SpliceDef {
  id: string;
  name: string;
  /** The two Head ids that must both be mounted. Its effects apply to the line joining those stakes. */
  heads: readonly [string, string];
  text: string;
  values?: readonly Ranked[];
  effects: readonly EffectBinding[];
}

const fmt = (n: number, percent: boolean): string => {
  const v = percent ? n * 100 : n;
  const r = Math.round(v * 100) / 100;
  return percent ? `${r}%` : String(r);
};

/**
 * Fill the placeholders in an instrument's text with its values at a rank.
 * {0} prints value 0 as it is; {0%} prints it as a percentage (0.3 becomes 30%).
 */
export function describe(def: { text: string; values?: readonly Ranked[] }, rank: number): string {
  return def.text.replace(/\{(\d+)(%?)\}/g, (_m, i: string, pct: string) => {
    const v = def.values?.[Number(i)];
    if (v === undefined) return '?';
    return fmt(ranked(v, rank), pct === '%');
  });
}

/** Like describe, but shows every rank: "5 / 8 / 11". For cards that preview what ranking up gives. */
export function describeAllRanks(def: InstrumentDef): string {
  return def.text.replace(/\{(\d+)(%?)\}/g, (_m, i: string, pct: string) => {
    const v = def.values?.[Number(i)];
    if (v === undefined) return '?';
    if (typeof v === 'number') return fmt(v, pct === '%');
    return v
      .slice(0, def.maxRank)
      .map((n) => fmt(n, pct === '%'))
      .join(' / ');
  });
}

// ---------------------------------------------------------------- registry

export interface ContentRegistry {
  rooms: readonly RoomTemplate[];
  enemies: Readonly<Record<string, EnemyDef>>;
  instruments: Readonly<Record<string, InstrumentDef>>;
  splices: readonly SpliceDef[];
}

export function validateInstruments(reg: ContentRegistry): string[] {
  const out: string[] = [];
  for (const [key, d] of Object.entries(reg.instruments)) {
    if (key !== d.id) out.push(`${key}: registry key does not match id ${d.id}`);
    if (d.maxRank < 1 || d.maxRank > 3) out.push(`${d.id}: maxRank must be 1 to 3`);
    if (!d.text) out.push(`${d.id}: missing text`);
    const used = [...d.text.matchAll(/\{(\d+)%?\}/g)].map((m) => Number(m[1]));
    for (const i of used) if (d.values?.[i] === undefined) out.push(`${d.id}: text uses {${i}} but has no such value`);
    for (const v of d.values ?? []) {
      if (typeof v !== 'number' && v.length < d.maxRank) out.push(`${d.id}: a ranked value has fewer entries than maxRank`);
    }
    if (d.kind === 'order' && d.traits) out.push(`${d.id}: only Heads have traits`);
    const does = (d.effects?.length ?? 0) + Object.keys(d.mods ?? {}).length + (d.flags?.length ?? 0) + Object.keys(d.traits ?? {}).length;
    if (does === 0) out.push(`${d.id}: does nothing (no effects, mods, flags or traits)`);
  }
  const seen = new Set<string>();
  for (const sp of reg.splices) {
    if (seen.has(sp.id)) out.push(`${sp.id}: duplicate splice id`);
    seen.add(sp.id);
    for (const h of sp.heads) {
      const head = reg.instruments[h];
      if (!head) out.push(`${sp.id}: unknown head ${h}`);
      else if (head.kind !== 'head') out.push(`${sp.id}: ${h} is not a Head`);
    }
    if (sp.heads[0] === sp.heads[1]) out.push(`${sp.id}: needs two different Heads`);
    if (sp.effects.length === 0) out.push(`${sp.id}: does nothing`);
  }
  return out;
}

/** Problems in an enemy definition, as human-readable strings. Used by content tests. */
export function validateEnemyDef(d: EnemyDef): string[] {
  const out: string[] = [];
  const pos = (v: number, what: string): void => {
    if (!Number.isFinite(v) || v <= 0) out.push(`${d.id}: ${what} must be a positive number`);
  };
  pos(d.hp, 'hp');
  pos(d.radius, 'radius');
  pos(d.mass, 'mass');
  pos(d.threat, 'threat');
  if (!Number.isFinite(d.speed) || d.speed < 0) out.push(`${d.id}: speed must be zero or more`);
  if (d.zones.length === 0) out.push(`${d.id}: appears in no zone`);
  if (d.moves.length === 0) out.push(`${d.id}: has no moves, so it can never threaten the player`);
  let damaging = false;
  const ids = new Set<string>();
  for (const m of d.moves) {
    if (ids.has(m.id)) out.push(`${d.id}: duplicate move id ${m.id}`);
    ids.add(m.id);
    if (m.maxRange <= m.minRange) out.push(`${d.id}/${m.id}: maxRange must exceed minRange`);
    pos(m.cooldown, `${m.id} cooldown`);
    pos(m.recovery, `${m.id} recovery`);
    if (m.action.damage > 0) {
      damaging = true;
      if (m.windup < 0.35) out.push(`${d.id}/${m.id}: a damaging move needs at least 0.35 s of telegraph`);
    }
    if (m.action.kind === 'lunge' && m.telegraph.shape !== 'lane') out.push(`${d.id}/${m.id}: a lunge must be telegraphed by a lane`);
    if (m.action.kind === 'lunge' && m.telegraph.shape === 'lane' && m.telegraph.length + 0.01 < m.action.distance) {
      out.push(`${d.id}/${m.id}: the lane is shorter than the lunge it warns about`);
    }
  }
  if (!damaging) out.push(`${d.id}: no move damages the player`);
  return out;
}
