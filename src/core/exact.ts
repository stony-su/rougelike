// Helpers the simulation may use. Everything here is built from exact arithmetic and core/dmath,
// so every machine computes the same bits (the simulation runs in lockstep on several laptops).
// Rendering has its own, freer helpers in core/math.ts; the simulation must not import those.
import { dexp, dhypot, wrapAngle } from './dmath';

export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Move a toward b by at most maxDelta. */
export const approach = (a: number, b: number, maxDelta: number): number => (a < b ? Math.min(a + maxDelta, b) : Math.max(a - maxDelta, b));

/** Frame-rate independent exponential approach: after dt seconds, a has closed the gap to b at rate lambda. */
export const ddamp = (a: number, b: number, lambda: number, dt: number): number => b + (a - b) * dexp(-lambda * dt);

/** The signed shortest turn from one angle to another, in (-PI, PI]. */
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);

export const ddampAngle = (a: number, b: number, lambda: number, dt: number): number => a + angleDiff(a, b) * (1 - dexp(-lambda * dt));

/** Normalise (x, y) into out; returns the original length. A zero vector stays zero. */
export function normInto(x: number, y: number, out: Vec2): number {
  const l = dhypot(x, y);
  if (l > 1e-12) {
    out.x = x / l;
    out.y = y / l;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return l;
}
