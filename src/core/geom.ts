// Plane geometry used by collision. Pure functions built from exact arithmetic and core/dmath,
// so the simulation may use them.
import { PI, dcos, dsin } from './dmath';

export const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/**
 * Intersection of segments AB and CD. Returns the parameter t along AB in [0, 1],
 * or -1 when they do not intersect (parallel segments count as not intersecting).
 */
export function segSegT(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
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

export const circleTouchesSegment = (cx: number, cy: number, r: number, ax: number, ay: number, bx: number, by: number): boolean => pointSegDist2(cx, cy, ax, ay, bx, by) <= r * r;

/**
 * True when a circle of radius `pad` centred at P touches the circular sector at C that faces
 * `angle` with half-width `half` and radius r. Worked with dot and cross products, so there is
 * no inverse trigonometry: off the arc by an angle phi, the pad reaches in when sin(phi) <= pad / d.
 */
export function pointInSector(px: number, py: number, cx: number, cy: number, angle: number, half: number, r: number, pad = 0): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  const reach = r + pad;
  if (d2 > reach * reach) return false;
  if (d2 <= pad * pad || d2 < 1e-12 || half >= PI) return true;
  const d = Math.sqrt(d2);
  const fx = dcos(angle);
  const fy = dsin(angle);
  const cosT = (dx * fx + dy * fy) / d;
  const sinT = Math.abs(dx * fy - dy * fx) / d;
  const ch = dcos(half);
  if (cosT >= ch) return true;
  if (pad <= 0) return false;
  const sh = dsin(half);
  const sinPhi = sinT * ch - cosT * sh;
  const cosPhi = cosT * ch + sinT * sh;
  return cosPhi > 0 && sinPhi <= pad / d;
}
