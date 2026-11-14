// One swept-circle cast against a chamber's collision shape, used by everything that moves:
// people on foot, dashes, shots, launched bodies and the aim preview. Because the preview and
// the shot run the same function on the same numbers, what is drawn is what happens.
//
// Only exact arithmetic and square roots are used, and the earliest hit is chosen under a total
// order (time, then kind, then index), so the answer never depends on the order things are stored in.
import type { Vec2 } from '../core/exact';
import { CIRCLE_BUMPER } from './geo';
import type { Geo, Segment } from './geo';

export const HIT_WALL = 0;
export const HIT_CORNER = 1;
export const HIT_POST = 2;
export const HIT_BUMPER = 3;

/** Bodies stop this far short of what they hit, so they never start the next move already inside it. */
export const SKIN = 1 / 1024;

export interface Hit {
  /** Fraction of the move at which contact happens, 0..1. */
  t: number;
  /** Unit normal of the surface at the contact, pointing back toward the mover. */
  nx: number;
  ny: number;
  /** Index into geo NORMALS for a wall face, or -1 for a corner or a circle (use the normal itself). */
  ntype: number;
  kind: number;
  /** Which segment or circle. */
  index: number;
}

export const newHit = (): Hit => ({ t: 1, nx: 0, ny: 0, ntype: -1, kind: HIT_WALL, index: -1 });

function better(t: number, kind: number, index: number, best: Hit, found: boolean): boolean {
  if (!found) return true;
  if (t !== best.t) return t < best.t;
  if (kind !== best.kind) return kind < best.kind;
  return index < best.index;
}

/**
 * Time in [0, 1] at which a point moving from (x, y) by (dx, dy) first comes within `rad` of
 * (cx, cy), or -1. Something already inside counts as time 0, but only while it is still closing.
 */
export function circleTime(x: number, y: number, dx: number, dy: number, cx: number, cy: number, rad: number): number {
  const ox = x - cx;
  const oy = y - cy;
  const b = ox * dx + oy * dy;
  // moving away or sideways: no new contact
  if (b >= 0) return -1;
  const c = ox * ox + oy * oy - rad * rad;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Sweep a circle of radius r from (x, y) by (dx, dy). Returns true and fills `out` with the
 * earliest contact, or returns false if the way is clear. `walk` chooses what counts as solid:
 * on foot, pit edges do; in the air, only walls. Posts and bumpers always do.
 */
export function castCircle(geo: Geo, walk: boolean, x: number, y: number, dx: number, dy: number, r: number, out: Hit): boolean {
  if (dx === 0 && dy === 0) return false;
  let found = false;
  const segs: Segment[] = walk ? geo.walk : geo.fly;
  const minX = (dx < 0 ? x + dx : x) - r;
  const maxX = (dx > 0 ? x + dx : x) + r;
  const minY = (dy < 0 ? y + dy : y) - r;
  const maxY = (dy > 0 ? y + dy : y) + r;

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if ((s.ax < minX && s.bx < minX) || (s.ax > maxX && s.bx > maxX) || (s.ay < minY && s.by < minY) || (s.ay > maxY && s.by > maxY)) continue;
    // The face: only from the front, and only when moving into it.
    const dn = dx * s.nx + dy * s.ny;
    const dist = (x - s.ax) * s.nx + (y - s.ay) * s.ny;
    if (dn < 0 && dist >= 0) {
      const t = dist <= r ? 0 : (r - dist) / dn;
      if (t <= 1) {
        const ex = s.bx - s.ax;
        const ey = s.by - s.ay;
        const along = (x + dx * t - s.ax) * ex + (y + dy * t - s.ay) * ey;
        if (along >= 0 && along <= ex * ex + ey * ey && better(t, HIT_WALL, i, out, found)) {
          found = true;
          out.t = t;
          out.nx = s.nx;
          out.ny = s.ny;
          out.ntype = s.ntype;
          out.kind = HIT_WALL;
          out.index = i;
        }
      }
    }
    // The two ends, which matter at outward corners.
    for (let e = 0; e < 2; e++) {
      const vx = e === 0 ? s.ax : s.bx;
      const vy = e === 0 ? s.ay : s.by;
      const t = circleTime(x, y, dx, dy, vx, vy, r);
      if (t < 0 || !better(t, HIT_CORNER, i * 2 + e, out, found)) continue;
      const px = x + dx * t - vx;
      const py = y + dy * t - vy;
      const l = Math.sqrt(px * px + py * py);
      if (l < 1e-12) continue;
      found = true;
      out.t = t;
      out.nx = px / l;
      out.ny = py / l;
      out.ntype = -1;
      out.kind = HIT_CORNER;
      out.index = i * 2 + e;
    }
  }

  for (let i = 0; i < geo.circles.length; i++) {
    const c = geo.circles[i];
    const rad = c.r + r;
    if (c.x + rad < minX - r || c.x - rad > maxX + r || c.y + rad < minY - r || c.y - rad > maxY + r) continue;
    const t = circleTime(x, y, dx, dy, c.x, c.y, rad);
    const kind = c.kind === CIRCLE_BUMPER ? HIT_BUMPER : HIT_POST;
    if (t < 0 || !better(t, kind, i, out, found)) continue;
    const px = x + dx * t - c.x;
    const py = y + dy * t - c.y;
    const l = Math.sqrt(px * px + py * py);
    if (l < 1e-12) continue;
    found = true;
    out.t = t;
    out.nx = px / l;
    out.ny = py / l;
    out.ntype = -1;
    out.kind = kind;
    out.index = i;
  }
  return found;
}

/**
 * Move a circle by (dx, dy), sliding along whatever it meets. Mutates pos. Returns true if it
 * touched anything. This is how everything on foot moves.
 */
export function slideCircle(geo: Geo, walk: boolean, pos: Vec2, r: number, dx: number, dy: number, hit: Hit): boolean {
  let touched = false;
  for (let iter = 0; iter < 4; iter++) {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) break;
    if (!castCircle(geo, walk, pos.x, pos.y, dx, dy, r, hit)) {
      pos.x += dx;
      pos.y += dy;
      return touched;
    }
    touched = true;
    // up to the contact, less a skin
    const t = Math.max(0, hit.t - SKIN / len);
    pos.x += dx * t;
    pos.y += dy * t;
    // what is left of the move, with the part going into the surface removed
    const rest = 1 - hit.t;
    let rx = dx * rest;
    let ry = dy * rest;
    const into = rx * hit.nx + ry * hit.ny;
    if (into < 0) {
      rx -= into * hit.nx;
      ry -= into * hit.ny;
    }
    dx = rx;
    dy = ry;
  }
  return touched;
}

/**
 * Push a circle out of anything it overlaps (a spawn point too near a wall, a body shoved by
 * another). Mutates pos. Returns true if it moved.
 */
export function pushOut(geo: Geo, walk: boolean, pos: Vec2, r: number): boolean {
  let moved = false;
  const segs = walk ? geo.walk : geo.fly;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const l2 = ex * ex + ey * ey;
      let u = ((pos.x - s.ax) * ex + (pos.y - s.ay) * ey) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = s.ax + ex * u;
      const qy = s.ay + ey * u;
      const px = pos.x - qx;
      const py = pos.y - qy;
      const d2 = px * px + py * py;
      if (d2 >= r * r) continue;
      const front = (pos.x - s.ax) * s.nx + (pos.y - s.ay) * s.ny;
      if (front < 0 && u > 0 && u < 1) {
        // behind the face: come back out through it
        pos.x += s.nx * (r - front);
        pos.y += s.ny * (r - front);
      } else if (d2 > 1e-18) {
        const d = Math.sqrt(d2);
        pos.x = qx + (px / d) * r;
        pos.y = qy + (py / d) * r;
      } else {
        pos.x = qx + s.nx * r;
        pos.y = qy + s.ny * r;
      }
      any = true;
    }
    for (let i = 0; i < geo.circles.length; i++) {
      const c = geo.circles[i];
      const px = pos.x - c.x;
      const py = pos.y - c.y;
      const rad = c.r + r;
      const d2 = px * px + py * py;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-18) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (px / d) * rad;
        pos.y = c.y + (py / d) * rad;
      } else {
        pos.x = c.x + rad;
      }
      any = true;
    }
    if (!any) break;
    moved = true;
  }
  return moved;
}

/** True when a circle at (x, y) overlaps nothing solid. */
export function isOpen(geo: Geo, walk: boolean, x: number, y: number, r: number): boolean {
  const segs = walk ? geo.walk : geo.fly;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    let u = ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = x - (s.ax + ex * u);
    const py = y - (s.ay + ey * u);
    if (px * px + py * py < r * r) return false;
  }
  for (const c of geo.circles) {
    const px = x - c.x;
    const py = y - c.y;
    const rad = c.r + r;
    if (px * px + py * py < rad * rad) return false;
  }
  return true;
}
