// Every gameplay number lives here so balance passes touch one file.
// Distances are in tiles, times in seconds, speeds in tiles per second.

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

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
  stakeBuffer: 0.25,
};

export const DASH = {
  distance: 4,
  time: 0.18,
  iframes: 0.22,
  charges: 2,
  recharge: 1.2,
  /** Fraction of run speed kept when the dash ends, so it flows back into movement. */
  exitSpeed: 0.85,
  refundCooldown: 2.0,
};

export const ROD = {
  damage: [10, 10, 16] as const,
  /** Half-angle of each swing's arc, radians. */
  halfArc: [(60 * Math.PI) / 180, (60 * Math.PI) / 180, (75 * Math.PI) / 180] as const,
  reach: [1.9, 1.9, 2.2] as const,
  windup: [0.07, 0.07, 0.13] as const,
  active: [0.08, 0.08, 0.1] as const,
  recovery: [0.14, 0.14, 0.24] as const,
  /** After a swing's active frames, how long the next press still continues the combo. */
  comboWindow: 0.45,
  step: [0.35, 0.35, 0.55] as const,
  moveMul: 0.35,
  /** Light hits nudge (the next swing must still reach); the third sends them flying. */
  knockback: [0.5, 0.5, 3.5] as const,
  hitstop: [0.035, 0.035, 0.07] as const,
  /** Bonus against enemies inside the Plot or touching a line. */
  surveyedBonus: 0.25,
  hammerReach: 2.3,
};

export const PLUMB = {
  range: 7,
  speed: 28,
  radius: 0.25,
  damage: 18,
  cooldown: 3,
  drag: 3,
  dragTime: 0.25,
  stakeCatchRadius: 0.6,
  stakeCursorRadius: 1.0,
  lineRefund: 1.5,
  castTime: 0.12,
  recovery: 0.16,
};

export const LINES = {
  stakes: 3,
  linkRange: 9,
  damage: 12,
  ripeTime: 2.5,
  ripeDamage: 30,
  stun: 0.5,
  stunImmunity: 1.5,
  tripLockout: 1.0,
  whipTime: 0.15,
  whipLock: 0.3,
  minSweepArea: 1.5,
  minPlotArea: 2,
  plotSlow: 0.3,
  minSpacing: 0.75,
  lostTime: 5,
  severTime: 3,
  hostileDamage: 10,
  hostileLockout: 0.8,
};

export const FEEL = {
  hitstopDischarge: 0.09,
  hitstopHurt: 0.06,
  hitstopKill: 0.05,
};

export const SCALING = {
  hpPerSheet: 0.09,
  damagePerSheet: 0.05,
};
