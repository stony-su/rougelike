// Finding the way round pits and walls. Each player has a field over the tile grid: the number
// of steps from every tile to the tile that player stands on. An Echo with a clear straight line
// to its target ignores the field; one without follows it downhill.
//
// A field is a pure function of the room and one tile, rebuilt whenever its player steps onto
// another tile, so it never needs to travel in a snapshot.
import { TILE } from './geo';
import type { Room, World } from './types';

export interface NavField {
  /** The tile the field leads to. */
  tx: number;
  ty: number;
  /** Steps to that tile, indexed [y * w + x]. NAV_FAR means no way there. */
  dist: Uint8Array;
}

export const NAV_FAR = 255;

/** The eight neighbours, orthogonal ones first so ties prefer straight moves. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** Tiles a walker can stand in the middle of: plain floor without a post or a bumper on it. */
function walkableTiles(room: Room): Uint8Array {
  const ok = new Uint8Array(room.w * room.h);
  for (let i = 0; i < ok.length; i++) ok[i] = room.tiles[i] === TILE.floor ? 1 : 0;
  for (const c of room.geo.circles) {
    const tx = Math.floor(c.x);
    const ty = Math.floor(c.y);
    if (tx >= 0 && ty >= 0 && tx < room.w && ty < room.h) ok[ty * room.w + tx] = 0;
  }
  return ok;
}

export function buildNav(room: Room, tx: number, ty: number): NavField {
  const { w, h } = room;
  const ok = walkableTiles(room);
  const dist = new Uint8Array(w * h).fill(NAV_FAR);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const seed = (x: number, y: number, d: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!ok[i] || dist[i] !== NAV_FAR) return;
    dist[i] = d;
    queue[tail++] = i;
  };
  seed(tx, ty, 0);
  // Standing on a slanted tile or beside a post: start from the tiles around instead.
  if (tail === 0) for (const [dx, dy] of STEPS) seed(tx + dx, ty + dy, 1);
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const d = dist[i];
    if (d >= NAV_FAR - 1) continue;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!ok[j] || dist[j] !== NAV_FAR) continue;
      // no cutting a corner between two blocked tiles
      if (dx !== 0 && dy !== 0 && (!ok[y * w + nx] || !ok[ny * w + x])) continue;
      dist[j] = d + 1;
      queue[tail++] = j;
    }
  }
  return { tx, ty, dist };
}

/** The field for the player in seat `index` of this world, rebuilt if that player has changed tile. */
export function navFor(w: World, index: number): NavField | null {
  const p = w.players[index];
  if (!p) return null;
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  const have = w.nav[index];
  if (have && have.tx === tx && have.ty === ty) return have;
  const made = buildNav(w.room, tx, ty);
  w.nav[index] = made;
  return made;
}

/**
 * Which way to walk from (x, y) to follow a field downhill. Writes a unit direction into `out`
 * and returns true, or returns false when the field knows no way from here.
 */
export function navStep(room: Room, f: NavField, x: number, y: number, out: { x: number; y: number }): boolean {
  const { w, h } = room;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const at = (cx: number, cy: number): number => (cx < 0 || cy < 0 || cx >= w || cy >= h ? NAV_FAR : f.dist[cy * w + cx]);
  const here = at(tx, ty);
  let best = here;
  let bx = 0;
  let by = 0;
  for (const [dx, dy] of STEPS) {
    const d = at(tx + dx, ty + dy);
    if (d >= best) continue;
    if (dx !== 0 && dy !== 0 && (at(tx + dx, ty) === NAV_FAR || at(tx, ty + dy) === NAV_FAR)) continue;
    best = d;
    bx = dx;
    by = dy;
  }
  if (best === NAV_FAR || (bx === 0 && by === 0)) return false;
  // head for the middle of the next tile
  const gx = tx + bx + 0.5 - x;
  const gy = ty + by + 0.5 - y;
  const l = Math.sqrt(gx * gx + gy * gy);
  if (l < 1e-6) return false;
  out.x = gx / l;
  out.y = gy / l;
  return true;
}
