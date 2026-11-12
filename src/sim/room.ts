// Rooms: instancing a template into a walkable grid, and collision against it.
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/math';
import type { RoomTemplate } from './defs';
import type { DoorSlot, Pillar, Room } from './types';

export const PILLAR_RADIUS = 0.42;

export function buildRoom(t: RoomTemplate): Room {
  const h = t.map.length;
  const w = t.map.reduce((m, row) => Math.max(m, row.length), 0);
  const floor = new Uint8Array(w * h);
  const pillars: Pillar[] = [];
  const stones: Vec2[] = [];
  const spawnMarks: Vec2[] = [];
  const doors: DoorSlot[] = [];
  let start: Vec2 | null = null;
  let rewardSpot: Vec2 | null = null;
  let sx = 0;
  let sy = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    const row = t.map[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ' ';
      if (ch === ' ' || ch === '#') continue;
      floor[y * w + x] = 1;
      const cx = x + 0.5;
      const cy = y + 0.5;
      sx += cx;
      sy += cy;
      n++;
      if (ch === 'o') pillars.push({ x: cx, y: cy, r: PILLAR_RADIUS });
      else if (ch === 'b') stones.push({ x: cx, y: cy });
      else if (ch === 's') spawnMarks.push({ x: cx, y: cy });
      else if (ch === 'P') start = { x: cx, y: cy };
      else if (ch === 'r') rewardSpot = { x: cx, y: cy };
      else if (ch === 'D') doors.push({ x: cx, y: cy, side: y === 0 ? 'north' : 'west' });
    }
  }
  if (n === 0) throw new Error(`Room ${t.id} has no floor`);
  const cx = sx / n;
  const cy = sy / n;
  return {
    id: t.id,
    name: t.name,
    zone: t.zone,
    kind: t.kind,
    w,
    h,
    floor,
    pillars,
    stones,
    spawnMarks,
    doors,
    start: start ?? { x: cx, y: cy },
    rewardSpot: rewardSpot ?? { x: cx, y: cy },
    cx,
    cy,
  };
}

export const isFloorTile = (room: Room, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < room.w && ty < room.h && room.floor[ty * room.w + tx] === 1;

/** True when a circle of radius r centred at (x, y) stands fully on floor and clear of pillars. */
export function isClear(room: Room, x: number, y: number, r = 0): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isFloorTile(room, tx, ty)) continue;
      const qx = Math.max(tx, Math.min(x, tx + 1));
      const qy = Math.max(ty, Math.min(y, ty + 1));
      const dx = x - qx;
      const dy = y - qy;
      if (dx * dx + dy * dy < r * r || (r === 0 && dx === 0 && dy === 0)) return false;
    }
  }
  for (const p of room.pillars) {
    const dx = x - p.x;
    const dy = y - p.y;
    const rr = r + p.r;
    if (dx * dx + dy * dy < rr * rr) return false;
  }
  return true;
}

/**
 * Push a circle out of void tiles and pillars. Mutates pos.
 * Returns true if anything was touched.
 */
export function resolveCircle(room: Room, pos: Vec2, r: number): boolean {
  let touched = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = Math.floor(pos.x - r);
    const x1 = Math.floor(pos.x + r);
    const y0 = Math.floor(pos.y - r);
    const y1 = Math.floor(pos.y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (isFloorTile(room, tx, ty)) continue;
        const qx = Math.max(tx, Math.min(pos.x, tx + 1));
        const qy = Math.max(ty, Math.min(pos.y, ty + 1));
        let dx = pos.x - qx;
        let dy = pos.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.y += (dy / d) * push;
        } else {
          // Centre is inside the void tile: leave through the nearest face that leads to floor.
          const left = pos.x - tx;
          const right = tx + 1 - pos.x;
          const up = pos.y - ty;
          const down = ty + 1 - pos.y;
          const options: Array<[number, number, number, boolean]> = [
            [left + r, -1, 0, isFloorTile(room, tx - 1, ty)],
            [right + r, 1, 0, isFloorTile(room, tx + 1, ty)],
            [up + r, 0, -1, isFloorTile(room, tx, ty - 1)],
            [down + r, 0, 1, isFloorTile(room, tx, ty + 1)],
          ];
          let best: [number, number, number, boolean] | null = null;
          for (const o of options) {
            if (!o[3]) continue;
            if (!best || o[0] < best[0]) best = o;
          }
          if (!best) continue;
          dx = best[1];
          dy = best[2];
          pos.x += dx * best[0];
          pos.y += dy * best[0];
        }
        moved = true;
      }
    }
    for (const p of room.pillars) {
      const dx = pos.x - p.x;
      const dy = pos.y - p.y;
      const rr = r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
        pos.x = p.x + (dx / d) * rr;
        pos.y = p.y + (dy / d) * rr;
      } else {
        pos.x = p.x + rr;
      }
      moved = true;
    }
    if (!moved) break;
    touched = true;
  }
  return touched;
}

/** Snap a point to the nearest spot where a circle of radius r stands clear. Mutates and returns out. */
export function clampToFloor(room: Room, x: number, y: number, r: number, out: Vec2): Vec2 {
  out.x = x;
  out.y = y;
  if (isClear(room, x, y, r)) return out;
  resolveCircle(room, out, r);
  if (isClear(room, out.x, out.y, r * 0.98)) return out;
  // Far outside the room: walk toward the centre until clear.
  const steps = 64;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = x + (room.cx - x) * t;
    const cy = y + (room.cy - y) * t;
    if (isClear(room, cx, cy, r)) {
      out.x = cx;
      out.y = cy;
      return out;
    }
  }
  out.x = room.start.x;
  out.y = room.start.y;
  return out;
}

/** A random clear floor point at least minDist from `from` (if given). */
export function randomFloorPoint(
  room: Room,
  rng: Rng,
  r: number,
  from?: Vec2,
  minDist = 0,
): Vec2 {
  for (let i = 0; i < 80; i++) {
    const x = rng.float(0.5, room.w - 0.5);
    const y = rng.float(0.5, room.h - 0.5);
    if (!isClear(room, x, y, r)) continue;
    if (from && Math.hypot(x - from.x, y - from.y) < minDist) continue;
    return { x, y };
  }
  return { x: room.cx, y: room.cy };
}

/** True when the straight segment between two points stays on floor (sampled). */
export function segmentOnFloor(room: Room, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isFloorTile(room, Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  }
  return true;
}
