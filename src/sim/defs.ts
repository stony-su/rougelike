// Content schemas. Content files (src/content) are typed data that satisfy these shapes; the
// simulation never imports content directly. It is handed a ContentRegistry when a session is
// created, so tests can run the same engine on fixture content.

export type ZoneId = 'bluefen' | 'unruled';
export type RoomKind = 'combat' | 'arena';

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
  /** Walk at the target until within `range`. `weave` adds a side-to-side sway. */
  | { kind: 'chase'; range: number; weave?: number }
  /** Hold a distance band from the target. */
  | { kind: 'kite'; min: number; max: number }
  /** Stand still. */
  | { kind: 'hold' };

/** The warning drawn on the floor during a wind-up. `track` is how long it follows the target before locking. */
export type TelegraphSpec =
  /** A strip from the enemy toward the target. */
  | { shape: 'lane'; length: number; width: number; track: number }
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
  /** Fire projectiles in a fan toward the target. */
  | { kind: 'volley'; count: number; spread: number; speed: number; damage: number; range: number; radius: number; projectile: string };

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
}

// ---------------------------------------------------------------- registry

export interface ContentRegistry {
  rooms: readonly RoomTemplate[];
  enemies: Readonly<Record<string, EnemyDef>>;
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
  if (d.moves.length === 0) out.push(`${d.id}: has no moves, so it can never threaten a player`);
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
  if (!damaging) out.push(`${d.id}: no move damages a player`);
  return out;
}
