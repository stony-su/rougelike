// Small, allocation-light math helpers shared by the simulation and the renderer.

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number): number => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Frame-rate independent exponential approach: higher lambda = snappier. */
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Move a toward b by at most maxDelta. */
export const approach = (a: number, b: number, maxDelta: number): number => (a < b ? Math.min(a + maxDelta, b) : Math.max(a - maxDelta, b));

export const len = (x: number, y: number): number => Math.hypot(x, y);
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

/** Normalise (x, y) into out. Returns the original length. */
export function normInto(x: number, y: number, out: Vec2): number {
  const l = Math.hypot(x, y);
  if (l > 1e-9) {
    out.x = x / l;
    out.y = y / l;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return l;
}

export const wrapAngle = (a: number): number => {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
};
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);
export const lerpAngle = (a: number, b: number, t: number): number => a + angleDiff(a, b) * t;
export const dampAngle = (a: number, b: number, lambda: number, dt: number): number => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Linear blend of two 0xRRGGBB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const c = clamp01(t);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * c) << 16) | (Math.round(ag + (bg - ag) * c) << 8) | Math.round(ab + (bb - ab) * c);
}

/** Multiply a 0xRRGGBB colour's brightness. */
export function scaleColor(a: number, k: number): number {
  const r = clamp(Math.round(((a >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((a >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((a & 255) * k), 0, 255);
  return (r << 16) | (g << 8) | b;
}
