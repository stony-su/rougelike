// Simulation state. Plain data only: numbers, strings, booleans, arrays, plain objects and typed
// arrays, plus the seeded generator. No rendering, no DOM, no Maps or Sets. Everything here runs
// headless, is identical on every laptop of a co-op session, and can be snapshotted and hashed.
import type { Vec2 } from '../core/exact';
import type { Rng } from '../core/rng';
import type { ContentRegistry, EnemyDef, RoomKind, ZoneId } from './defs';
import type { RoomFlow } from './flow';

// ---------------------------------------------------------------- input

/** Bits of InputFrame.held. */
export const BTN = { attack: 1, special: 2, dash: 4, interact: 8 } as const;
/** Indices into InputFrame.presses. */
export const PRESS = { attack: 0, special: 1, dash: 2, interact: 3 } as const;
export const PRESS_COUNT = 4;

/** Movement angles are sent in 256ths of a turn, aim angles in 65536ths, aim distance in eighths of a tile. */
export const MOVE_STEPS = 256;
export const AIM_STEPS = 65536;
export const AIM_DIST_SCALE = 8;
export const MOVE_MAG_MAX = 15;

/**
 * One tick of one player's intent, as integers, exactly as it travels between laptops.
 * A press is "the counter changed since the last tick", so merging, repeating or delaying
 * messages can neither lose a tap nor count it twice.
 */
export interface InputFrame {
  /** World-space movement direction, 0..255 (256ths of a turn). */
  moveAngle: number;
  /** 0 = standing still; 15 = full speed. */
  moveMag: number;
  /** World-space aim direction from the player, 0..65535. */
  aimAngle: number;
  /** Distance from the player to the aimed point, in eighths of a tile, 0..255. */
  aimDist: number;
  /** Buttons held this tick (BTN bits). */
  held: number;
  /** One wrapping counter (0..255) per button, bumped on every press. */
  presses: number[];
}

export const emptyInput = (): InputFrame => ({ moveAngle: 0, moveMag: 0, aimAngle: 0, aimDist: 0, held: 0, presses: [0, 0, 0, 0] });

// ---------------------------------------------------------------- room

export interface Pillar {
  x: number;
  y: number;
  r: number;
}

export interface DoorSlot {
  x: number;
  y: number;
  /** Which far edge the door stands on: 'north' is row 0, 'west' is column 0. */
  side: 'north' | 'west';
}

/** A room instanced from a template: walkable grid plus the marks the template placed. */
export interface Room {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  w: number;
  h: number;
  /** 1 = walkable, indexed [y * w + x]. */
  floor: Uint8Array;
  pillars: Pillar[];
  stones: Vec2[];
  spawnMarks: Vec2[];
  doors: DoorSlot[];
  start: Vec2;
  rewardSpot: Vec2;
  /** Centre of the walkable area. */
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------- players

export type PlayerState = 'idle' | 'run' | 'dash' | 'swing' | 'down';

export interface Player {
  /** Which seat of the session this is: 0, 1 or 2. */
  slot: number;
  classId: string;
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Knockback velocity; decays on its own. */
  kx: number;
  ky: number;
  radius: number;
  /** World-space aim angle in radians, and how far away the aimed point is. */
  aim: number;
  aimDist: number;
  /** Last non-zero movement direction (unit, world space). */
  moveDirX: number;
  moveDirY: number;
  hp: number;
  maxHp: number;
  state: PlayerState;
  /** Seconds spent in the current state. */
  stateTime: number;
  dashCharges: number;
  dashMaxCharges: number;
  /** Seconds accumulated toward the next dash charge. */
  dashRecharge: number;
  dashTimeLeft: number;
  dashDirX: number;
  dashDirY: number;
  /** Seconds of invulnerability left. */
  iframes: number;
  /** Seconds since the player was last hurt (drives the flinch). Large when not hurt. */
  hurtT: number;
  /** Total distance travelled on foot; drives the stride animation. */
  stride: number;
  /** Which swing of the combo is in progress or was last made: 0, 1 or 2. */
  combo: number;
  /** Seconds left in which another press continues the combo. */
  comboTimer: number;
  /** World angle the current action was aimed along. */
  actAngle: number;
  /** Total duration of the current action, seconds. */
  actDur: number;
  /** True once the current action's hit has been resolved. */
  actDone: boolean;
  /** Buffered presses: seconds left in which the press still counts. */
  bufAttack: number;
  bufSpecial: number;
  bufDash: number;
  bufInteract: number;
  /** The press counters seen last tick, to tell a new press from an old one. */
  lastPresses: number[];
  /** Per-body hit-stop: ticks this player's own timeline stays frozen. */
  freeze: number;
  /** Run currency. */
  chimes: number;
}

// ---------------------------------------------------------------- enemies

export type EnemyState = 'spawn' | 'idle' | 'move' | 'windup' | 'attack' | 'recover' | 'stun' | 'dead';

export interface Enemy {
  id: number;
  /** Which definition this is; `def` is the same thing looked up, re-linked after a snapshot is loaded. */
  defId: string;
  def: EnemyDef;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Self-propelled velocity. */
  vx: number;
  vy: number;
  /** Knockback velocity; decays on its own. */
  kx: number;
  ky: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** World angle the enemy faces. */
  facing: number;
  state: EnemyState;
  stateTime: number;
  /** Duration of the current state when it has one (wind-up, attack, recover, stun, spawn); otherwise 0. */
  stateDur: number;
  /** Index into def.moves of the move being performed, or -1. */
  move: number;
  /** Seconds until each move may be chosen again. */
  cooldowns: number[];
  /** Seconds until the next decision. */
  thinkT: number;
  /** The player (slot) this enemy is after. */
  target: number;
  /** The point the current attack is aimed at, locked during the wind-up. */
  aimX: number;
  aimY: number;
  /** Id of this enemy's active telegraph, or 0. */
  telegraph: number;
  /** Seconds since last hurt (drives the flinch). */
  hurtT: number;
  /** Seconds of stun immunity left after a stun. */
  stunImmune: number;
  /** Multipliers from depth scaling and elite traits. */
  damageMul: number;
  speedMul: number;
  windupMul: number;
  /** Elite trait id, or null. */
  elite: string | null;
  /** Stable 0..1 number so crowds do not animate in unison. */
  seed: number;
  /** Bit per player slot: set once this activation's hit has landed on that player. */
  hitDone: number;
  /** Direction of the last hit taken, for the death scatter. */
  lastHitX: number;
  lastHitY: number;
  /** Per-kind scratch numbers owned by the action primitives. */
  mem: number[];
  /** Damage multiplier from armour: 1 is none. */
  armor: number;
  /** In the air: out of reach of ground attacks. */
  airborne: boolean;
  /** Per-body hit-stop: ticks this enemy stays frozen. */
  freeze: number;
  status: EnemyStatus;
  dead: boolean;
}

/** Timed conditions on an enemy. */
export interface EnemyStatus {
  /** Burn: damage per second, and seconds left. */
  burnDps: number;
  burnT: number;
  /** Burn damage accumulated but not yet dealt (dealt in half-second ticks). */
  burnAcc: number;
  /** Chill: movement slow 0..1, and seconds left. */
  chillSlow: number;
  chillT: number;
  /** Frozen solid (a stun that shows as ice). Seconds left. */
  frozenT: number;
  /** Rooted: cannot move, can still act. Seconds left. */
  rootT: number;
  /** Marked: takes this much more damage from everyone. Seconds left. */
  markBonus: number;
  markT: number;
  /** Seconds before another root may be applied. */
  rootImmune: number;
}

// ---------------------------------------------------------------- projectiles and telegraphs

export interface Projectile {
  id: number;
  /** Visual and behaviour kind: 'bolt', ... */
  kind: string;
  faction: 'player' | 'enemy';
  /** Who made it: an enemy id for enemy shots, a player slot for player shots. */
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  /** Seconds left before it expires. */
  life: number;
  /** Distance left before it expires. */
  range: number;
  /** Light projectiles are knocked out of the air by a swing. */
  light: boolean;
  dead: boolean;
}

export type TelegraphShape = 'circle' | 'lane' | 'cone';

/**
 * A warning on the floor. What is drawn is exactly what will hit: actions test the same shape
 * with `telegraphCovers` when the wind-up ends.
 */
export interface Telegraph {
  id: number;
  /** Enemy id that owns it (it dies with its owner), or 0. */
  owner: number;
  shape: TelegraphShape;
  x: number;
  y: number;
  /** Direction for lanes and cones. */
  angle: number;
  /** Circle and cone radius. */
  radius: number;
  /** Lane length and full width. */
  length: number;
  width: number;
  /** Cone half-angle. */
  halfArc: number;
  /** Seconds elapsed and total. */
  t: number;
  dur: number;
  /** Follows its owner's position (and facing, for lanes and cones) until this many seconds have passed, then locks. */
  trackUntil: number;
  dead: boolean;
}

// ---------------------------------------------------------------- events

export type HitKind = 'direct' | 'return' | 'slam' | 'carom' | 'burst' | 'burn' | 'other';

/**
 * Things that happened this tick, with everything presentation needs to react. Value snapshots
 * only. `player` is always a slot; `by` is the slot that dealt a hit, or -1.
 */
export type SimEvent =
  | { type: 'dash'; player: number; x: number; y: number; dx: number; dy: number }
  | { type: 'dashEnd'; player: number; x: number; y: number }
  | { type: 'dashCharge'; player: number; charges: number }
  | { type: 'swing'; player: number; n: number; x: number; y: number; angle: number; reach: number; halfArc: number }
  | { type: 'hit'; target: number; by: number; x: number; y: number; amount: number; kind: HitKind; heavy: boolean; crit: boolean; dx: number; dy: number; killed: boolean }
  | { type: 'deflect'; player: number; x: number; y: number }
  | { type: 'playerHurt'; player: number; amount: number; x: number; y: number; dx: number; dy: number }
  | { type: 'playerDown'; player: number; x: number; y: number }
  | { type: 'enemySpawn'; id: number; kind: string; x: number; y: number }
  | { type: 'enemyWindup'; id: number; kind: string; move: string; x: number; y: number }
  | { type: 'enemyAttack'; id: number; kind: string; move: string; x: number; y: number }
  | { type: 'enemyStun'; id: number; x: number; y: number }
  | { type: 'enemyDeath'; id: number; kind: string; x: number; y: number; dx: number; dy: number; elite: string | null }
  | { type: 'slam'; x: number; y: number; radius: number }
  | { type: 'projectileSpawn'; id: number; kind: string; x: number; y: number }
  | { type: 'projectileEnd'; id: number; kind: string; x: number; y: number; hit: boolean }
  | { type: 'waveStart'; wave: number }
  | { type: 'refused'; player: number; what: string }
  | { type: 'shockwave'; x: number; y: number; radius: number }
  | { type: 'chime'; amount: number; x: number; y: number }
  | { type: 'armorBreak'; id: number; x: number; y: number }
  | { type: 'roomClear'; x: number; y: number };

export type SimEventType = SimEvent['type'];

// ---------------------------------------------------------------- world

export interface World {
  tick: number;
  /** Simulated seconds; does not advance during a whole-chamber freeze. */
  time: number;
  rng: Rng;
  room: Room;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  telegraphs: Telegraph[];
  /** Appended to by the step; presentation clears it after reading. Never part of a snapshot. */
  events: SimEvent[];
  /** Whole-chamber freeze, in ticks, for moments the party shares. Ordinary hits freeze only the bodies involved. */
  freeze: number;
  /** The earliest tick at which another whole-chamber freeze may start. */
  freezeAllowedAt: number;
  /** Source of ids for enemies, projectiles and telegraphs. */
  nextId: number;
  /** How deep into the run this chamber is (1-based); scales enemy health and damage. */
  chamber: number;
  /** The content this world runs on. A pointer, re-linked after a snapshot is loaded. */
  content: ContentRegistry;
  /** Waves and pickups of this chamber. */
  flow: RoomFlow;
  /** Enemies that died this tick, for drops. Cleared by the flow step. */
  deaths: Array<{ x: number; y: number; defId: string; elite: string | null }>;
  /** Totals for the results screen and for tests. */
  stats: {
    kills: number;
    damageDealt: number;
    damageTaken: number;
  };
}
