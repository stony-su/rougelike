// Reading and writing the integer input frames that travel between laptops. Bots write frames
// with these helpers; the player step reads them. The device layer (keyboard, mouse, gamepad)
// writes the same integers from the browser.
import { TAU, datan2, dcos, dhypot, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { AIM_DIST_SCALE, AIM_STEPS, MOVE_MAG_MAX, MOVE_STEPS } from './types';
import type { InputFrame } from './types';

/** An angle in radians as a whole number of `steps`ths of a turn, in 0..steps-1. */
export function quantAngle(rad: number, steps: number): number {
  const turns = rad / TAU;
  const k = Math.round((turns - Math.floor(turns)) * steps);
  return k >= steps ? 0 : k;
}

export const angleOf = (q: number, steps: number): number => (q / steps) * TAU;

/** Unit vectors for the 256 movement directions. The four axis directions are exact. */
const MOVE_X = new Float64Array(MOVE_STEPS);
const MOVE_Y = new Float64Array(MOVE_STEPS);
for (let i = 0; i < MOVE_STEPS; i++) {
  const quarter = MOVE_STEPS / 4;
  if (i % quarter === 0) {
    const q = i / quarter;
    MOVE_X[i] = q === 0 ? 1 : q === 2 ? -1 : 0;
    MOVE_Y[i] = q === 1 ? 1 : q === 3 ? -1 : 0;
  } else {
    MOVE_X[i] = dcos(angleOf(i, MOVE_STEPS));
    MOVE_Y[i] = dsin(angleOf(i, MOVE_STEPS));
  }
}

/** Set the movement direction from a world-space vector; `amount` is 0..1 of full speed. */
export function setMove(f: InputFrame, dx: number, dy: number, amount = 1): void {
  if ((dx === 0 && dy === 0) || amount <= 0) {
    f.moveMag = 0;
    return;
  }
  f.moveAngle = quantAngle(datan2(dy, dx), MOVE_STEPS);
  const m = Math.round(amount * MOVE_MAG_MAX);
  f.moveMag = m < 1 ? 1 : m > MOVE_MAG_MAX ? MOVE_MAG_MAX : m;
}

/** Aim from one world point at another. */
export function setAim(f: InputFrame, fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const d = dhypot(dx, dy);
  if (d > 1e-6) f.aimAngle = quantAngle(datan2(dy, dx), AIM_STEPS);
  const q = Math.round(d * AIM_DIST_SCALE);
  f.aimDist = q > 255 ? 255 : q;
}

/** Tap a button (PRESS index). */
export function press(f: InputFrame, index: number): void {
  f.presses[index] = (f.presses[index] + 1) & 255;
}

/** Hold or release a button (BTN bit). */
export function hold(f: InputFrame, bit: number, on: boolean): void {
  f.held = on ? f.held | bit : f.held & ~bit;
}

/** The movement of a frame as a world-space vector of length 0..1. */
export function moveInto(f: InputFrame, out: Vec2): void {
  if (f.moveMag === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const m = f.moveMag / MOVE_MAG_MAX;
  const i = f.moveAngle & (MOVE_STEPS - 1);
  out.x = MOVE_X[i] * m;
  out.y = MOVE_Y[i] * m;
}

export const aimAngleOf = (f: InputFrame): number => angleOf(f.aimAngle, AIM_STEPS);
export const aimDistOf = (f: InputFrame): number => f.aimDist / AIM_DIST_SCALE;

export function copyInput(from: InputFrame, to: InputFrame): void {
  to.moveAngle = from.moveAngle;
  to.moveMag = from.moveMag;
  to.aimAngle = from.aimAngle;
  to.aimDist = from.aimDist;
  to.held = from.held;
  for (let i = 0; i < from.presses.length; i++) to.presses[i] = from.presses[i];
}
