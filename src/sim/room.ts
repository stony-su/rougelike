// Rooms: instancing a template into a tile grid with its collision shape, and questions about it.
import { dhypot } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import type { Rng } from '../core/rng';
import { isOpen, pushOut } from './cast';
import type { RoomTemplate } from './defs';
import { CIRCLE_BUMPER, CIRCLE_POST, TILE, buildGeo } from './geo';
import type { Circle } from './geo';
import type { DoorSlot, Room } from './types';

export const POST_RADIUS = 0.42;
export const BUMPER_RADIUS = 0.5;

const TILE_OF: Readonly<Record<string, number>> = {
  ' ': TILE.void,
  '#': TILE.wall,
  '~': TILE.pit,
  '7': TILE.diagTL,
  '9': TILE.diagTR,
  '1': TILE.diagBL,
  '3': TILE.diagBR,
};

export function buildRoom(t: RoomTemplate): Room {
  const h = t.map.length;
  const w = t.map.reduce((m, row) => Math.max(m, row.length), 0);
  const tiles = new Uint8Array(w * h);
  const circles: Circle[] = [];
  const marks: Vec2[] = [];
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
      const code = TILE_OF[ch];
      if (code !== undefined) {
        tiles[y * w + x] = code;
        continue;
      }
      // every other symbol stands on floor
      tiles[y * w + x] = TILE.floor;
      const cx = x + 0.5;
      const cy = y + 0.5;
      sx += cx;
      sy += cy;
      n++;
      if (ch === 'o') circles.push({ x: cx, y: cy, r: POST_RADIUS, kind: CIRCLE_POST });
      else if (ch === 'B') circles.push({ x: cx, y: cy, r: BUMPER_RADIUS, kind: CIRCLE_BUMPER });
      else if (ch === 'b') marks.push({ x: cx, y: cy });
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
    look: t.look ?? 'court',
    w,
    h,
    tiles,
    geo: buildGeo(tiles, w, h, circles),
    marks,
    spawnMarks,
    doors,
    start: start ?? { x: cx, y: cy },
    rewardSpot: rewardSpot ?? { x: cx, y: cy },
    cx,
    cy,
  };
}

export const tileAt = (room: Room, tx: number, ty: number): number => (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h ? TILE.void : room.tiles[ty * room.w + tx]);

/** What lies under a point: 'floor', 'pit' or 'solid'. A diagonal tile is solid in one corner and floor in the other half. */
export function groundAt(room: Room, x: number, y: number): 'floor' | 'pit' | 'solid' {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const t = tileAt(room, tx, ty);
  if (t === TILE.floor) return 'floor';
  if (t === TILE.pit) return 'pit';
  const fx = x - tx;
  const fy = y - ty;
  if (t === TILE.diagTL) return fx + fy >= 1 ? 'floor' : 'solid';
  if (t === TILE.diagTR) return fy > fx ? 'floor' : 'solid';
  if (t === TILE.diagBL) return fx > fy ? 'floor' : 'solid';
  if (t === TILE.diagBR) return fx + fy <= 1 ? 'floor' : 'solid';
  return 'solid';
}

/** True when a circle of radius r centred at (x, y) stands on floor, clear of walls, pits, posts and bumpers. */
export function isClear(room: Room, x: number, y: number, r = 0): boolean {
  return groundAt(room, x, y) === 'floor' && isOpen(room.geo, true, x, y, r);
}

/** Snap a point to the nearest spot where a circle of radius r stands clear. Mutates and returns out. */
export function clampToFloor(room: Room, x: number, y: number, r: number, out: Vec2): Vec2 {
  out.x = x;
  out.y = y;
  if (isClear(room, x, y, r)) return out;
  if (groundAt(room, x, y) === 'floor') {
    pushOut(room.geo, true, out, r);
    if (isClear(room, out.x, out.y, r * 0.98)) return out;
  }
  // Inside something or far outside: walk toward the centre until clear.
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

/**
 * The clear floor spot nearest a point, for a body climbing out of a pit. Looks at tile centres
 * in growing squares around the point; the first square that holds one decides, plus one more
 * square in case a diagonal neighbour is nearer.
 */
export function nearestFloor(room: Room, x: number, y: number, r: number, out: Vec2): Vec2 {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  let best = Infinity;
  let last = -1;
  for (let ring = 0; ring <= 12; ring++) {
    if (last >= 0 && ring > last + 1) break;
    for (let j = -ring; j <= ring; j++) {
      for (let i = -ring; i <= ring; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const cx = tx + i + 0.5;
        const cy = ty + j + 0.5;
        if (!isClear(room, cx, cy, r)) continue;
        const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
        if (d < best) {
          best = d;
          out.x = cx;
          out.y = cy;
          if (last < 0) last = ring;
        }
      }
    }
  }
  if (last < 0) {
    out.x = room.start.x;
    out.y = room.start.y;
  }
  return out;
}

/** A random clear floor point at least minDist from `from` (if given). */
export function randomFloorPoint(room: Room, rng: Rng, r: number, from?: Vec2, minDist = 0): Vec2 {
  for (let i = 0; i < 120; i++) {
    const x = rng.float(0.5, room.w - 0.5);
    const y = rng.float(0.5, room.h - 0.5);
    if (!isClear(room, x, y, r)) continue;
    if (from && dhypot(x - from.x, y - from.y) < minDist) continue;
    return { x, y };
  }
  return { x: room.start.x, y: room.start.y };
}

/** Problems in a room template, as human-readable strings. Used by content tests. */
export function validateRoomTemplate(t: RoomTemplate): string[] {
  const out: string[] = [];
  const h = t.map.length;
  const w = t.map.reduce((m, row) => Math.max(m, row.length), 0);
  if (w > 40 || h > 40) out.push(`${t.id}: larger than 40 x 40 (${w} x ${h})`);
  const at = (x: number, y: number): string => (y < 0 || y >= h ? ' ' : t.map[y][x] ?? ' ');
  /** Somewhere a walker's centre can be. Diagonal tiles count: half of each is floor. */
  const walkable = (x: number, y: number): boolean => !' #~oB'.includes(at(x, y));
  const count = (ch: string): Array<[number, number]> => {
    const found: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === ch) found.push([x, y]);
    return found;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (!' #~7913.oBbsPDr'.includes(c)) out.push(`${t.id}: unknown symbol "${c}" at ${x},${y}`);
    }
  }
  const starts = count('P');
  const focus = count('r');
  const marks = count('s');
  const posts = [...count('o'), ...count('B')];
  if (starts.length !== 1) out.push(`${t.id}: needs exactly one P, has ${starts.length}`);
  if (focus.length !== 1) out.push(`${t.id}: needs exactly one r, has ${focus.length}`);
  for (const [x, y] of count('D')) if (x !== 0 && y !== 0) out.push(`${t.id}: door at ${x},${y} is not on a far edge (row 0 or column 0)`);

  // the arena must be closed: nothing but wall may touch the void or the rim of the grid
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // a door is a gap in a far wall, so it alone may stand on the rim
      if (at(x, y) === ' ' || at(x, y) === '#' || at(x, y) === 'D') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(x + dx, y + dy) === ' ') out.push(`${t.id}: tile at ${x},${y} is open to the void`);
      }
    }
  }

  // every walkable tile must be reachable from P on foot
  if (starts.length === 1) {
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [starts[0]];
    seen.add(starts[0][1] * 64 + starts[0][0]);
    while (stack.length) {
      const [x, y] = stack.pop() as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walkable(nx, ny)) continue;
        const key = ny * 64 + nx;
        if (seen.has(key)) continue;
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (walkable(x, y) && !seen.has(y * 64 + x)) out.push(`${t.id}: floor at ${x},${y} cannot be reached from P`);
      }
    }
  }

  if (marks.length < 4) out.push(`${t.id}: a fight needs at least four spawn marks, has ${marks.length}`);
  for (const [x, y] of marks) {
    if (starts.length === 1 && dhypot(x - starts[0][0], y - starts[0][1]) < 4) out.push(`${t.id}: spawn mark at ${x},${y} is too close to P`);
    for (const [px, py] of posts) {
      if (dhypot(x - px, y - py) < 1.6) out.push(`${t.id}: spawn mark at ${x},${y} is tucked against the post at ${px},${py}`);
    }
  }
  return out;
}
