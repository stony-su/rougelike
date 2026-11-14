// Every gameplay number lives here so balance passes touch one file.
// Distances are in tiles, times in seconds, speeds in tiles per second. DESIGN.md has the prose.
import { PI } from '../core/dmath';

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

const deg = (d: number): number => (d * PI) / 180;

export const PLAYER = {
  radius: 0.32,
  maxHp: 100,
  speed: 5.4,
  /** Exponential approach rates for velocity: starting to move, and stopping. */
  accel: 34,
  decel: 26,
  hurtIframes: 0.6,
  /** Input presses made slightly too early still count for this long. */
  buffer: 0.15,
};

export const DASH = {
  distance: 4,
  time: 0.18,
  iframes: 0.22,
  charges: 2,
  recharge: 1.2,
  /** Fraction of run speed kept when the dash ends, so it flows back into movement. */
  exitSpeed: 0.85,
};

/** The Sword's three-swing combo. */
export const SWORD = {
  damage: [9, 9, 14] as const,
  /** Half-angle of each swing's arc, radians. */
  halfArc: [deg(60), deg(60), deg(75)] as const,
  reach: [2.0, 2.0, 2.3] as const,
  windup: [0.07, 0.07, 0.12] as const,
  active: [0.09, 0.09, 0.11] as const,
  recovery: [0.14, 0.14, 0.24] as const,
  /** After a swing's active frames, how long the next press still continues the combo. */
  comboWindow: 0.45,
  step: [0.35, 0.35, 0.55] as const,
  moveMul: 0.35,
  /** Light hits nudge (the next swing must still reach); the third sends them flying. */
  knockback: [0.5, 0.5, 3.0] as const,
  /** Hit-stop on the striker and the struck, in ticks. */
  freeze: [2, 2, 4] as const,
};

/** Knockback is applied as a velocity that decays at this exponential rate. */
export const KNOCK_DECAY = 9;
/** Seconds after a stun ends during which the same enemy cannot be stunned again. */
export const STUN_IMMUNITY = 1.5;

/** Whole-chamber freezes, in ticks, and how often one may happen. */
export const FREEZE = {
  playerDown: 8,
  bossPhase: 12,
  /** Ticks between whole-chamber freezes. */
  spacing: 120,
  /** Per-body freeze on the player when hurt. */
  hurt: 3,
};

export const SCALING = {
  hpPerChamber: 0.08,
  damagePerChamber: 0.04,
  /** Per extra player: ordinary enemy health, and the threat budget of a wave. */
  coopHp: 0.35,
  coopBudget: 0.55,
};
