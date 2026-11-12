// Simulation state. Plain data only: no rendering, no DOM. Everything here can run headless.
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/math';
import type { EnemyDef, RoomKind, ZoneId } from './defs';

// ---------------------------------------------------------------- input

/** One tick of player intent, already converted to world space by the input layer (or produced by a bot). */
export interface InputFrame {
  /** Unit world-space movement direction, or (0, 0). */
  moveX: number;
  moveY: number;
  /** Cursor position on the ground plane, world units. */
  aimX: number;
  aimY: number;
  attackHeld: boolean;
  attackPressed: boolean;
  specialPressed: boolean;
  dashPressed: boolean;
  stakePressed: boolean;
  interactPressed: boolean;
}

export const emptyInput = (): InputFrame => ({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  attackHeld: false,
  attackPressed: false,
  specialPressed: false,
  dashPressed: false,
  stakePressed: false,
  interactPressed: false,
});

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

// ---------------------------------------------------------------- player

export type PlayerState = 'idle' | 'run' | 'dash' | 'swing' | 'shot' | 'dead';

export interface Player {
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
  /** World-space angle from the player to the cursor. */
  aim: number;
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
  /** World angle the current swing or shot was aimed along. */
  actAngle: number;
  /** Total duration of the current swing or shot, seconds. */
  actDur: number;
  /** True once the current swing's hit has been resolved. */
  actDone: boolean;
  /** Seconds until the Plumb Shot is ready again. */
  plumbCooldown: number;
  /** Buffered presses: seconds left in which the press still counts. */
  bufAttack: number;
  bufSpecial: number;
  bufDash: number;
  bufStake: number;
}

// ---------------------------------------------------------------- enemies

export type EnemyState = 'spawn' | 'idle' | 'move' | 'windup' | 'attack' | 'recover' | 'stun' | 'dead';

export interface Enemy {
  id: number;
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
  /** True while the attack's hit has already landed on the player this activation. */
  hitDone: boolean;
  /** Direction of the last hit taken, for the death scatter. */
  lastHitX: number;
  lastHitY: number;
  /** Forced movement (a Plumb Shot drag): remaining time and velocity. */
  dragT: number;
  dragVX: number;
  dragVY: number;
  /** Per-kind scratch numbers owned by the action primitives. */
  mem: number[];
  dead: boolean;
}

// ---------------------------------------------------------------- projectiles and telegraphs

export interface Projectile {
  id: number;
  /** Visual and behaviour kind: 'quill', 'plumb', ... */
  kind: string;
  faction: 'player' | 'enemy';
  /** Enemy id of the shooter, or 0. */
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
  /** Light projectiles are destroyed by a Rod swing. */
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

export type HitKind = 'rod' | 'plumb' | 'line' | 'discharge' | 'burst' | 'burn' | 'other';

/** Things that happened this tick, with everything presentation needs to react. Value snapshots only. */
export type SimEvent =
  | { type: 'dash'; x: number; y: number; dx: number; dy: number }
  | { type: 'dashEnd'; x: number; y: number }
  | { type: 'dashCharge'; charges: number }
  | { type: 'swing'; n: number; x: number; y: number; angle: number; reach: number; halfArc: number }
  | { type: 'hit'; target: number; x: number; y: number; amount: number; kind: HitKind; heavy: boolean; crit: boolean; dx: number; dy: number; killed: boolean }
  | { type: 'deflect'; x: number; y: number }
  | { type: 'plumbFire'; x: number; y: number; angle: number }
  | { type: 'plumbHook'; x: number; y: number; target: number }
  | { type: 'plumbMiss'; x: number; y: number }
  | { type: 'playerHurt'; amount: number; x: number; y: number; dx: number; dy: number }
  | { type: 'playerDeath'; x: number; y: number }
  | { type: 'enemySpawn'; id: number; kind: string; x: number; y: number }
  | { type: 'enemyWindup'; id: number; kind: string; move: string; x: number; y: number }
  | { type: 'enemyAttack'; id: number; kind: string; move: string; x: number; y: number }
  | { type: 'enemyStun'; id: number; x: number; y: number }
  | { type: 'enemyDeath'; id: number; kind: string; x: number; y: number; dx: number; dy: number; elite: string | null }
  | { type: 'slam'; x: number; y: number; radius: number }
  | { type: 'projectileSpawn'; id: number; kind: string; x: number; y: number }
  | { type: 'projectileEnd'; id: number; kind: string; x: number; y: number; hit: boolean }
  | { type: 'waveStart'; wave: number }
  | { type: 'refused'; what: string };

export type SimEventType = SimEvent['type'];

// ---------------------------------------------------------------- world

export interface World {
  tick: number;
  /** Simulated seconds; does not advance during hit-stop. */
  time: number;
  rng: Rng;
  room: Room;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  telegraphs: Telegraph[];
  /** Appended to by the step; the consumer clears it after reading. */
  events: SimEvent[];
  /** Seconds of freeze left; the step does nothing but count this down. */
  hitstop: number;
  /** Source of ids for enemies, projectiles and telegraphs. */
  nextId: number;
  /** How deep into the run this room is (1-based sheet number); scales enemy health and damage. */
  sheet: number;
  /** Totals for the end-of-run screens and for tests. */
  stats: {
    kills: number;
    damageDealt: number;
    damageTaken: number;
    rodDamage: number;
    lineDamage: number;
  };
}
