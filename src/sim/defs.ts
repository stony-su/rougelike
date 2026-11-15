// Content schemas. Content files (src/content) are typed data that satisfy these shapes; the
// simulation never imports content directly. It is handed a ContentRegistry when a session is
// created, so tests can run the same engine on fixture content.

import type { BossBrain } from './boss';
import type { HarmonyDef, TuningDef } from './mods';

/** The two halves of a run: the Outer Ring and the Inner Ring. */
export type ZoneId = 'outer' | 'inner';
export type RoomKind = 'combat' | 'arena';
/**
 * How a chamber is dressed, whatever its colours. 'court': a quiet checker with round posts.
 * 'survey': contour rings like a map of ripples, with hexagonal pillars.
 */
export type RoomLook = 'court' | 'survey';

export interface RoomTemplate {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  /** Omitted, a court. */
  look?: RoomLook;
  /** ASCII tile map; see the legend in src/content/rooms/README.md. */
  map: readonly string[];
}

// ---------------------------------------------------------------- enemies

/** How an enemy moves when it is not attacking. */
export type LocomotionSpec =
  /** Walk at the target until within `range`. `weave` adds a side-to-side sway. */
  | { kind: 'chase'; range: number; weave?: number }
  /** Hold a distance band from the target. */
  | { kind: 'kite'; min: number; max: number }
  /** Stand still. */
  | { kind: 'hold' };

/** The warning drawn on the floor during a wind-up. `track` is how long it follows the target before locking. */
export type TelegraphSpec =
  /** A strip from the enemy toward the target; `count` strips fanned over `spread` radians when given. */
  | { shape: 'lane'; length: number; width: number; track: number; count?: number; spread?: number }
  /** A disc around the enemy, or at the targeted point. */
  | { shape: 'circle'; radius: number; at: 'self' | 'target'; track: number }
  /** A wedge from the enemy toward the target. */
  | { shape: 'cone'; radius: number; halfArc: number; track: number };

/** What happens when the wind-up ends. These are the shared action primitives every enemy is built from. */
export type ActionSpec =
  /** Dash along the lane; hurts players on contact. */
  | { kind: 'lunge'; distance: number; speed: number; damage: number; knock: number }
  /** Hurt everyone inside the telegraph, at once. */
  | { kind: 'strike'; damage: number; knock: number }
  /**
   * Fire projectiles in a fan toward the target. `bounces` lets each bank off the chamber that
   * many times. A projectile called 'orb' is heavy: any basic attack sends it home to its sender.
   */
  | { kind: 'volley'; count: number; spread: number; speed: number; damage: number; range: number; radius: number; projectile: string; bounces?: number }
  /** Throw a bomb at the warned circle: it lands after `flight` seconds and bursts `fuse` seconds later. */
  | { kind: 'lob'; damage: number; radius: number; flight: number; fuse: number };

export interface MoveSpec {
  id: string;
  /** The move may start when the target's distance is within this band. */
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
  /** Launches and knockback are divided by mass. Light 1, medium 2.5, heavy 5. */
  mass: number;
  /** Cost against a wave's threat budget. */
  threat: number;
  /** First chamber (1-based) this enemy may appear in. */
  minChamber: number;
  zones: readonly ZoneId[];
  locomotion: LocomotionSpec;
  moves: readonly MoveSpec[];
  /** Rig id in the render registry. */
  rig: string;
  /** Chimes dropped on death: [min, max]. */
  chimes: readonly [number, number];
  /**
   * A shield held in front. While the Echo is on guard (not attacking, recovering, stunned or
   * staggered), blows and shots that meet it within `arc` radians either side of where it faces
   * do nothing. A blow that breaks guards (a full Haymaker) opens it for `open` seconds.
   */
  shield?: { arc: number; open: number };
  /**
   * It flies. Ground blows pass under it, except while it swoops in its own attack; anything
   * shot or sent back at it knocks it out of the air for `grounded` seconds.
   */
  flying?: { grounded: number };
  /** It cannot be launched, shoved or staggered. Bodies launched into it still hurt it. */
  anchored?: boolean;
  /** A boss: it cannot be stunned, its health is shown across the top of the screen, and waves never include it. */
  boss?: boolean;
  /** The brain that runs it instead of the ordinary attack cycle (boss.ts), by the name it is listed under. */
  brain?: string;
  /** The shares of its health, from high to low, at which the fight changes. */
  phases?: readonly number[];
  /** Things on it that the party can break (bells, say): shown as pips by its health, with `mem[0]` of them gone. */
  pips?: number;
}

// ---------------------------------------------------------------- registry

export interface ContentRegistry {
  rooms: readonly RoomTemplate[];
  enemies: Readonly<Record<string, EnemyDef>>;
  /** Every Tuning by id, and the Harmonies between them (mods.ts has the shapes). */
  tunings: Readonly<Record<string, TuningDef>>;
  harmonies: readonly HarmonyDef[];
  /** The brains of the bosses, by the name an Echo's definition gives (boss.ts). */
  brains: Readonly<Record<string, BossBrain>>;
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
  if (d.moves.length === 0 && !d.brain) out.push(`${d.id}: has no moves, so it can never threaten a player`);
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
    if (m.action.kind === 'lob' && (m.telegraph.shape !== 'circle' || m.telegraph.at !== 'target' || m.telegraph.radius !== m.action.radius)) {
      out.push(`${d.id}/${m.id}: a lob must be telegraphed by a circle at the target, as wide as its blast`);
    }
    if (m.action.kind === 'volley' && m.telegraph.shape === 'lane' && ((m.telegraph.count ?? 1) !== m.action.count || (m.telegraph.spread ?? 0) !== m.action.spread)) {
      out.push(`${d.id}/${m.id}: the lanes drawn do not match the shots fired`);
    }
    if (m.action.kind === 'lunge' && m.telegraph.shape === 'lane' && m.telegraph.length + 0.01 < m.action.distance) {
      out.push(`${d.id}/${m.id}: the lane is shorter than the lunge it warns about`);
    }
  }
  if (!damaging && !d.brain) out.push(`${d.id}: no move damages a player`);
  if (d.shield && (d.shield.arc <= 0 || d.shield.open <= 0)) out.push(`${d.id}: a shield needs an arc and a time it stays open`);
  if (d.flying && d.flying.grounded <= 0) out.push(`${d.id}: a flyer needs a time it stays down`);
  if (d.boss && d.threat < 50) out.push(`${d.id}: a boss must cost 50 threat or more, so that no wave ever buys one`);
  if (d.phases && d.phases.some((m, i) => m <= 0 || m >= 1 || (i > 0 && m >= (d.phases as readonly number[])[i - 1])))
    out.push(`${d.id}: phases are shares of health between 0 and 1, from high to low`);
  return out;
}
