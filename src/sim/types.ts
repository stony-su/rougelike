// Simulation state. Plain data only: no rendering, no DOM. Everything here can run headless.
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/math';
import type { RoomKind, ZoneId } from '../content/rooms';

/** One tick of player intent, already converted to world space by the input layer. */
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

export type PlayerState = 'idle' | 'run' | 'dash' | 'swing' | 'shot' | 'dead';

export interface Player {
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
  vx: number;
  vy: number;
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
  /** Total distance travelled on foot; drives the stride animation. */
  stride: number;
  /** Buffered presses: seconds left in which the press still counts. */
  bufAttack: number;
  bufSpecial: number;
  bufDash: number;
  bufStake: number;
}

export type SimEvent =
  | { type: 'dash'; x: number; y: number; dx: number; dy: number }
  | { type: 'dashEnd'; x: number; y: number }
  | { type: 'dashCharge'; charges: number };

export interface World {
  tick: number;
  /** Simulated seconds; does not advance during hit-stop. */
  time: number;
  rng: Rng;
  room: Room;
  player: Player;
  /** Appended to by the step; the consumer clears it after reading. */
  events: SimEvent[];
  /** Seconds of freeze left; the step does nothing but count this down. */
  hitstop: number;
}
