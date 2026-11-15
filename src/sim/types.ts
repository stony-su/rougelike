// Simulation state. Plain data only: numbers, strings, booleans, arrays, plain objects and typed
// arrays, plus the seeded generator. No rendering, no DOM, no Maps or Sets. Everything here runs
// headless, is identical on every laptop of a co-op session, and can be snapshotted and hashed.
import type { Vec2 } from '../core/exact';
import type { Rng } from '../core/rng';
import type { ContentRegistry, EnemyDef, RoomKind, RoomLook, ZoneId } from './defs';
import type { RoomFlow } from './flow';
import type { Geo } from './geo';
import type { Mods } from './mods';
import type { NavField } from './nav';

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

export interface DoorSlot {
  x: number;
  y: number;
  /** Which far edge the door stands on: 'north' is the low-y side, 'west' the low-x side. */
  side: 'north' | 'west';
}

/** A room instanced from a template: a tile grid, its collision shape, and the marks the template placed. */
export interface Room {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  look: RoomLook;
  w: number;
  h: number;
  /** Tile codes (see TILE in geo.ts), indexed [y * w + x]. */
  tiles: Uint8Array;
  /** Walls, pit edges, posts and bumpers as segments and circles. */
  geo: Geo;
  /** Flat marks on the floor, decoration only. */
  marks: Vec2[];
  spawnMarks: Vec2[];
  doors: DoorSlot[];
  start: Vec2;
  rewardSpot: Vec2;
  /** Centre of the walkable area. */
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------- players

export type ClassId = 'sword' | 'bow' | 'fist';

/**
 * What a player is doing. 'attack' is a swing, a jab or loosing an arrow; 'charge' and 'release'
 * are the held punch of the Fist; 'special' is a class special in progress (or its recovery);
 * 'guard' is the Riposte of the Sword.
 */
export type PlayerState = 'idle' | 'run' | 'dash' | 'attack' | 'charge' | 'release' | 'special' | 'guard' | 'down';

export interface Player {
  /** Which seat of the session this is: 0, 1 or 2. */
  slot: number;
  classId: ClassId;
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
  /** Which blow of the combo is in progress or was last made: 0, 1 or 2. */
  combo: number;
  /** Seconds left in which another press continues the combo. */
  comboTimer: number;
  /** World angle the current action was aimed along. */
  actAngle: number;
  /** Total duration of the current action, seconds. */
  actDur: number;
  /** True once the hit of the current action has been resolved. */
  actDone: boolean;
  /** Buffered presses: seconds left in which the press still counts. */
  bufAttack: number;
  bufSpecial: number;
  bufDash: number;
  bufInteract: number;
  /** The press counters seen last tick, to tell a new press from an old one. */
  lastPresses: number[];
  /** Buttons held this tick (BTN bits), as last read. */
  held: number;
  /** Per-body hit-stop: ticks this player's own timeline stays frozen. */
  freeze: number;
  /** Run currency. */
  chimes: number;
  /** Seconds until the class special is ready again. */
  specialCd: number;
  /** Rally: 0..20, built by Returns; and seconds since the last Return. */
  rally: number;
  rallyT: number;
  /** Fist: how full the held punch is, 0..1, and the charge the punch in flight was released with. */
  charge: number;
  /** Bow: seconds until the next arrow may leave the string. */
  fireT: number;
  /** Sword: seconds of Riposte guard left, and whether something landed in it. */
  guardT: number;
  guardHit: boolean;
  /** While down: seconds an ally has stood close enough to help this player up. */
  reviveT: number;
  /** The Tunings this player holds, id to rank, and the numbers they add up to (mods.ts). */
  tunings: Record<string, number>;
  mods: Mods;
  /** Afterimage: seconds of the damage bonus left, and whether this dash has already earned it. */
  afterT: number;
  dodged: boolean;
  /** Ram: the Echoes this dash has already knocked aside. */
  dashHit: number[];
  /** Opening Note: true until this player's first Return of the chamber. */
  opening: boolean;
  /** Rally gained since the last Overtone ring, and since the last Storm lightning. */
  overtoneAcc: number;
  stormAcc: number;
  /** Sustain: seconds toward the next point of Rally lost. */
  sustainT: number;
  /** Echo Ward: downing blows it will still turn aside in this chamber. */
  wardLeft: number;
  /** Tithe: the part of a Chime not yet paid into the purse. */
  purseFrac: number;
}

// ---------------------------------------------------------------- enemies

/**
 * 'launched': flying from a blow, helpless, able to slam and carom. 'pit': fallen into a pit and
 * climbing out. The rest is the ordinary attack cycle.
 */
export type EnemyState = 'spawn' | 'idle' | 'move' | 'windup' | 'attack' | 'recover' | 'stun' | 'launched' | 'pit' | 'dead';

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
  /** Velocity from blows. Above the launch speed the body is launched. It slows steadily. */
  lvx: number;
  lvy: number;
  /** The slot of the player whose blow sent it flying, or -1. */
  launchBy: number;
  /** How many caroms lie between the blow and this body: 0 for the body that was struck. */
  links: number;
  /** Seconds before this body may be launched again. */
  launchImmune: number;
  /** Extra damage (a fraction) its next slam or carom deals, from a bumper or a Ringstone. */
  boost: number;
  /** A second player whose blow is also in this flight (a Duet), or -1: they share the Returns it makes. */
  assistBy: number;
  /** The body it last caromed with, and seconds before that pair may carom again. */
  caromWith: number;
  caromLock: number;
  /** Stagger built by jabs, seconds until it fades, and seconds left of being staggered. */
  stagger: number;
  staggerT: number;
  staggered: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** World angle the enemy faces. */
  facing: number;
  state: EnemyState;
  stateTime: number;
  /** Duration of the current state when it has one (wind-up, attack, recover, stun, spawn, pit); otherwise 0. */
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
  /** A flyer knocked out of the air: seconds until it takes off again. */
  groundedT: number;
  /** Seconds its shield stays open after a blow that broke its guard. */
  guardOpen: number;
  /** The phase of the fight a boss is in, from 0. Always 0 for anything else. */
  phase: number;
  /** The id of the other of a Tethered pair of elites, or 0. */
  mate: number;
  /** A Resonant elite's ring: seconds until it lands (0 when none is coming), and where. */
  ringT: number;
  ringX: number;
  ringY: number;
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
  /** Seconds before fire and frost on this body may burst into Steam again. */
  steamT: number;
}

// ---------------------------------------------------------------- things in flight

export interface Projectile {
  id: number;
  /** Visual and behaviour kind: 'bolt', 'arrow', ... */
  kind: string;
  faction: 'player' | 'enemy';
  /** Whose it is now: an enemy id for enemy shots, a player slot for player shots. */
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  /** Damage before bounces, skips and Rally are counted. */
  damage: number;
  /** Seconds left before it expires. */
  life: number;
  /** Distance left before it expires. */
  range: number;
  /** Ricochets left, and made so far. */
  bounces: number;
  bounced: number;
  /** Skips from one enemy to another left, and made so far. */
  skips: number;
  skipped: number;
  /** Enemies it may still pass through. */
  pierce: number;
  /** It was an enemy shot and a player sent it back; `perfect` if at the last moment. */
  returned: boolean;
  perfect: boolean;
  /** Extra damage (a fraction) its next hit deals, from a bumper or a Ringstone. */
  boost: number;
  /** The enemy it is flying home to (a Riposte), or 0. */
  homing: number;
  /** A second player who sent it on its way (an arrow banked off a blade), or -1: they share its Returns. */
  assist: number;
  /** Ids of what it has struck since it last bounced off the chamber, so a skip or a pierce never strikes twice. */
  hits: number[];
  dead: boolean;
}

/** A thrown bomb. It flies in an arc, sits on its fuse, and bursts; a blow from a player makes it theirs. */
export interface Bomb {
  id: number;
  /** The enemy that threw it. */
  owner: number;
  /** The player slot that batted it, or -1 while it still belongs to the enemy. */
  by: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Where it was thrown from and where it lands. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Velocity once batted. */
  vx: number;
  vy: number;
  /** 'fly': in its arc, out of reach. 'fuse': on the floor. 'batted': sent flying by a player. */
  state: 'fly' | 'fuse' | 'batted';
  /** Seconds in the current state, and how long that state lasts. */
  t: number;
  dur: number;
  /** Seconds of fuse once it lands. */
  fuse: number;
  /** Blast radius and the damage it does to players while it is still the enemy's. */
  radius: number;
  damage: number;
  /** Id of the warning circle on the floor, or 0. */
  telegraph: number;
  dead: boolean;
}

/** The Ringstone of the Bow: a bumper a player plants for a while. */
export interface Ringstone {
  id: number;
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** While thrown: where it will come down. */
  toX: number;
  toY: number;
  flying: boolean;
  radius: number;
  /** Seconds left once planted. */
  life: number;
  /** Seconds since something last bounced off it (drives the pulse). */
  rungT: number;
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
  /** Lanes only: how many lanes fan out, and the total angle they span. One lane spans nothing. */
  count: number;
  spread: number;
  /** Circles only: everyone closer to the middle than this is safe, so the warning is a ring. 0 for a disc. */
  inner: number;
  /**
   * A strike (strikes.ts): when the warning runs out, every player it covers takes this much
   * damage and is shoved this hard from its middle. 0 for a warning whose owner acts for itself.
   */
  damage: number;
  knock: number;
  /** True once its strike has landed. */
  struck: boolean;
  /** Seconds elapsed and total. */
  t: number;
  dur: number;
  /** Follows its owner's position (and facing, for lanes and cones) until this many seconds have passed, then locks. */
  trackUntil: number;
  dead: boolean;
}

// ---------------------------------------------------------------- events

/** How a hit was delivered. 'return', 'slam', 'carom' and 'ringout' are Returns: they came from something sent back. */
export type HitKind = 'direct' | 'return' | 'slam' | 'carom' | 'ringout' | 'burst' | 'burn' | 'other';

/** What a shot or a body bounced off. */
export type BounceKind = 'wall' | 'post' | 'bumper' | 'stone';

/**
 * Things that happened this tick, with everything presentation needs to react. Value snapshots
 * only. `player` is always a slot; `by` is the slot that dealt a hit, or -1.
 */
export type SimEvent =
  | { type: 'dash'; player: number; x: number; y: number; dx: number; dy: number }
  | { type: 'dashEnd'; player: number; x: number; y: number }
  | { type: 'dashCharge'; player: number; charges: number }
  | { type: 'swing'; player: number; n: number; x: number; y: number; angle: number; reach: number; halfArc: number }
  | { type: 'jab'; player: number; n: number; x: number; y: number; angle: number; reach: number; halfArc: number }
  | { type: 'loose'; player: number; x: number; y: number; angle: number }
  | { type: 'chargeFull'; player: number; x: number; y: number }
  | { type: 'haymaker'; player: number; x: number; y: number; angle: number; charge: number }
  | { type: 'breakSlam'; player: number; x: number; y: number; radius: number }
  | { type: 'guard'; player: number; x: number; y: number }
  | { type: 'riposte'; player: number; x: number; y: number }
  | { type: 'specialReady'; player: number }
  | { type: 'reflect'; player: number; id: number; x: number; y: number; perfect: boolean }
  | { type: 'ricochet'; id: number; by: number; x: number; y: number; n: number; off: BounceKind; nx: number; ny: number }
  | { type: 'skip'; by: number; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'launch'; id: number; by: number; x: number; y: number; speed: number }
  | { type: 'wallSlam'; id: number; by: number; x: number; y: number; speed: number; off: BounceKind; nx: number; ny: number }
  | { type: 'carom'; a: number; b: number; by: number; x: number; y: number; speed: number; links: number }
  | { type: 'ringOut'; id: number; by: number; x: number; y: number; killed: boolean }
  | { type: 'climbOut'; id: number; x: number; y: number }
  | { type: 'land'; id: number; x: number; y: number }
  | { type: 'stagger'; id: number; x: number; y: number }
  | { type: 'rally'; player: number; value: number; weight: number; x: number; y: number }
  | { type: 'rallyBreak'; player: number; value: number }
  /** Two players made a bounce between them: `a` set it up, `b` finished it. */
  | { type: 'duet'; kind: 'bank' | 'alleyoop'; a: number; b: number; x: number; y: number }
  | { type: 'revive'; player: number; by: number; x: number; y: number }
  | { type: 'stoneThrow'; id: number; player: number; x: number; y: number }
  | { type: 'stonePlant'; id: number; player: number; x: number; y: number }
  | { type: 'stoneEnd'; id: number; x: number; y: number }
  | { type: 'bombThrow'; id: number; x: number; y: number }
  | { type: 'bombLand'; id: number; x: number; y: number }
  | { type: 'bombBat'; id: number; player: number; x: number; y: number }
  | { type: 'bombBurst'; id: number; by: number; x: number; y: number; radius: number }
  | { type: 'hit'; target: number; by: number; x: number; y: number; amount: number; kind: HitKind; heavy: boolean; crit: boolean; dx: number; dy: number; killed: boolean }
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
  | { type: 'roomClear'; x: number; y: number }
  /** A player took a Tuning, which is now at `rank`. */
  | { type: 'tuning'; player: number; id: string; rank: number; x: number; y: number }
  /** A ring of force from a Tuning (`what` names it): everything inside was hurt once. */
  | { type: 'burst'; by: number; x: number; y: number; radius: number; what: string }
  | { type: 'bolt'; by: number; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'heal'; player: number; amount: number; x: number; y: number }
  /** An Echo Ward turned a downing blow aside. */
  | { type: 'ward'; player: number; x: number; y: number }
  /** A dash carried a player through an attack (Afterimage). */
  | { type: 'afterimage'; player: number; x: number; y: number }
  /** A blow rang off a shield and did nothing. */
  | { type: 'clang'; id: number; by: number; x: number; y: number }
  /** A flyer was knocked out of the air, and later took off again. */
  | { type: 'grounded'; id: number; x: number; y: number }
  | { type: 'takeoff'; id: number; x: number; y: number }
  | { type: 'bossPhase'; id: number; kind: string; phase: number; x: number; y: number }
  /** A strike landed: a warning that carried its own blow (strikes.ts). */
  | { type: 'strike'; shape: TelegraphShape; x: number; y: number; angle: number; radius: number; inner: number; length: number; width: number }
  /** An orb came home and cracked a bell of the Carillon: its `n`th. */
  | { type: 'bellCrack'; id: number; n: number; x: number; y: number };

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
  bombs: Bomb[];
  stones: Ringstone[];
  telegraphs: Telegraph[];
  /** Appended to by the step; presentation clears it after reading. Never part of a snapshot. */
  events: SimEvent[];
  /** Whole-chamber freeze, in ticks, for moments the party shares. Ordinary hits freeze only the bodies involved. */
  freeze: number;
  /** The earliest tick at which another whole-chamber freeze may start. */
  freezeAllowedAt: number;
  /** Source of ids for enemies, projectiles, bombs, stones and telegraphs. */
  nextId: number;
  /** How deep into the run this chamber is (1-based); scales enemy health and damage. */
  chamber: number;
  /** Ticks between a press and its effect, as measured in the lobby (0 alone). Widens timing windows. */
  inputDelay: number;
  /** The content this world runs on. A pointer, re-linked after a snapshot is loaded. */
  content: ContentRegistry;
  /** Waves and pickups of this chamber. */
  flow: RoomFlow;
  /**
   * One walking-distance field per player seat, rebuilt whenever that player steps onto another
   * tile. Derived purely from the room and the tile, so it is never part of a snapshot.
   */
  nav: Array<NavField | null>;
  /** Enemies that died this tick, for drops. Cleared by the flow step. */
  deaths: Array<{ x: number; y: number; defId: string; elite: string | null; mate: number; maxHp: number }>;
  /** Totals for the results screen and for tests. */
  stats: {
    kills: number;
    damageDealt: number;
    damageTaken: number;
    /** Returns landed, and the highest Rally anyone reached. */
    returns: number;
    bestRally: number;
  };
}
