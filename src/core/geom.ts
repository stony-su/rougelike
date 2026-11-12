// Plane geometry used by collision and by the line mechanic. All pure functions.

export const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/** Signed area of triangle abc (positive when counter-clockwise in a y-up frame). */
export const triSignedArea = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  0.5 * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

export const triArea = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  Math.abs(triSignedArea(ax, ay, bx, by, cx, cy));

/**
 * Intersection of segments AB and CD. Returns the parameter t along AB in [0, 1],
 * or -1 when they do not intersect (parallel segments count as not intersecting).
 */
export function segSegT(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return -1;
  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
  return t;
}

export const segmentsCross = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean => segSegT(ax, ay, bx, by, cx, cy, dx, dy) >= 0;

/** Parameter in [0, 1] of the point on segment AB closest to P. */
export function closestT(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const t = closestT(px, py, ax, ay, bx, by);
  const qx = ax + (bx - ax) * t;
  const qy = ay + (by - ay) * t;
  const ex = px - qx;
  const ey = py - qy;
  return ex * ex + ey * ey;
}

export const circleTouchesSegment = (
  cx: number, cy: number, r: number,
  ax: number, ay: number, bx: number, by: number,
): boolean => pointSegDist2(cx, cy, ax, ay, bx, by) <= r * r;

export function pointInTri(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** True when a circle overlaps a (possibly degenerate) triangle. */
export function circleTouchesTri(
  px: number, py: number, r: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
  if (pointInTri(px, py, ax, ay, bx, by, cx, cy)) return true;
  const r2 = r * r;
  return (
    pointSegDist2(px, py, ax, ay, bx, by) <= r2 ||
    pointSegDist2(px, py, bx, by, cx, cy) <= r2 ||
    pointSegDist2(px, py, cx, cy, ax, ay) <= r2
  );
}

/** Area of a simple polygon given as [x0, y0, x1, y1, ...]. */
export function polyArea(pts: readonly number[]): number {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (pts[i * 2] as number) * (pts[j * 2 + 1] as number) - (pts[j * 2] as number) * (pts[i * 2 + 1] as number);
  }
  return Math.abs(a) * 0.5;
}

/** Even-odd point-in-polygon for [x0, y0, x1, y1, ...]. */
export function pointInPoly(px: number, py: number, pts: readonly number[]): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2] as number;
    const yi = pts[i * 2 + 1] as number;
    const xj = pts[j * 2] as number;
    const yj = pts[j * 2 + 1] as number;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when point P lies within the circular sector at C facing `angle` with half-width `half` and radius r. */
export function pointInSector(
  px: number, py: number,
  cx: number, cy: number, angle: number, half: number, r: number, pad = 0,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d > r + pad) return false;
  if (d < 1e-6) return true;
  let da = Math.atan2(dy, dx) - angle;
  da = ((da + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  // widen the sector slightly by the target's angular size
  const slack = pad > 0 ? Math.asin(Math.min(1, pad / Math.max(d, pad))) : 0;
  return Math.abs(da) <= half + slack;
}
