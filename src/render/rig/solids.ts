// Geometric solids for characters: discs, capsules, regular polygons, stars, arcs. A character
// built from these is a handful of numbers, not a traced outline; the shapes are made by loops.
// Everything returns a flat list of points (x0, y0, x1, y1, ...) for def.ts's block() and flat().

/** A regular polygon with `n` corners, its first corner at angle `rot`. */
export function ngon(cx: number, cy: number, r: number, n: number, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** A star: `n` points reaching `outer`, the valleys between them at `inner`. */
export function star(cx: number, cy: number, outer: number, inner: number, n: number, rot = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** A capsule from (x0, y0) to (x1, y1): a thick line with round ends. `r1` lets it taper. */
export function capsule(x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0, steps = 5): number[] {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a + Math.PI / 2 + (i / steps) * Math.PI;
    pts.push(x0 + Math.cos(t) * r0, y0 + Math.sin(t) * r0);
  }
  for (let i = 0; i <= steps; i++) {
    const t = a - Math.PI / 2 + (i / steps) * Math.PI;
    pts.push(x1 + Math.cos(t) * r1, y1 + Math.sin(t) * r1);
  }
  return pts;
}

/** A band along an arc of a circle: a bow limb, a crescent, a collar. Angles in radians. */
export function arcBand(cx: number, cy: number, r: number, from: number, to: number, width: number, steps = 12, taper = 0): number[] {
  // out along the outer edge, back along the inner; thinner toward the ends when tapered
  const half = (k: number): number => (width / 2) * (1 - taper * Math.abs(k - 0.5) * 2);
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const a = from + (to - from) * k;
    pts.push(cx + Math.cos(a) * (r + half(k)), cy + Math.sin(a) * (r + half(k)));
  }
  for (let i = steps; i >= 0; i--) {
    const k = i / steps;
    const a = from + (to - from) * k;
    pts.push(cx + Math.cos(a) * (r - half(k)), cy + Math.sin(a) * (r - half(k)));
  }
  return pts;
}

/** A point on a circle, for placing things round a body by a loop. */
export const onCircle = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

/** A trapezoid standing on its base: `top` and `bottom` are half-widths. */
export function trapezoid(cx: number, yTop: number, yBottom: number, top: number, bottom: number): number[] {
  return [cx - top, yTop, cx + top, yTop, cx + bottom, yBottom, cx - bottom, yBottom];
}
