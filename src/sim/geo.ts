// A chamber's collision shape, built once from its tile grid.
//
// Solid boundaries become long straight segments whose normals come from a fixed set of eight
// directions (four axes, four diagonals), so a bounce off a wall is a sign flip or a swap of the
// two velocity components: exact, and readable for bank shots. Posts and bumpers are circles.
// There are two sets of segments: `fly` (walls only: what a shot or a launched body hits) and
// `walk` (walls and pit edges: what someone on foot cannot cross).

/** Tile codes. A diagonal tile is solid in one corner (named like a numeric keypad) and floor in the opposite half. */
export const TILE = {
  void: 0,
  floor: 1,
  wall: 2,
  pit: 3,
  diagTL: 4,
  diagTR: 5,
  diagBL: 6,
  diagBR: 7,
} as const;

/** Normal types: 0..3 are +x, -x, +y, -y; 4..7 are the diagonals (+x+y), (-x+y), (+x-y), (-x-y). */
export const NORMALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071067811865476, 0.7071067811865476],
  [-0.7071067811865476, 0.7071067811865476],
  [0.7071067811865476, -0.7071067811865476],
  [-0.7071067811865476, -0.7071067811865476],
];

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Unit normal, pointing into open space. */
  nx: number;
  ny: number;
  /** Index into NORMALS. */
  ntype: number;
}

export const CIRCLE_POST = 0;
export const CIRCLE_BUMPER = 1;

export interface Circle {
  x: number;
  y: number;
  r: number;
  /** CIRCLE_POST or CIRCLE_BUMPER. */
  kind: number;
}

export interface Geo {
  w: number;
  h: number;
  fly: Segment[];
  walk: Segment[];
  circles: Circle[];
}

const EDGE_TOP = 0;
const EDGE_RIGHT = 1;
const EDGE_BOTTOM = 2;
const EDGE_LEFT = 3;

/** Is this tile solid along one of its own edges? `pits` says whether a pit counts as solid (it does on foot). */
function solidAt(tile: number, edge: number, pits: boolean): boolean {
  switch (tile) {
    case TILE.floor:
      return false;
    case TILE.pit:
      return pits;
    case TILE.diagTL:
      return edge === EDGE_TOP || edge === EDGE_LEFT;
    case TILE.diagTR:
      return edge === EDGE_TOP || edge === EDGE_RIGHT;
    case TILE.diagBL:
      return edge === EDGE_BOTTOM || edge === EDGE_LEFT;
    case TILE.diagBR:
      return edge === EDGE_BOTTOM || edge === EDGE_RIGHT;
    default:
      return true;
  }
}

function seg(ax: number, ay: number, bx: number, by: number, ntype: number): Segment {
  return { ax, ay, bx, by, nx: NORMALS[ntype][0], ny: NORMALS[ntype][1], ntype };
}

/** Join segments that lie end to end on one line with one normal, so a body sliding along a wall never meets a seam. */
function merge(list: Segment[]): Segment[] {
  const out: Segment[] = [];
  const used = new Array<boolean>(list.length).fill(false);
  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const s = { ...list[i] };
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < list.length; j++) {
        if (used[j]) continue;
        const t = list[j];
        if (t.ntype !== s.ntype) continue;
        if (t.ax === s.bx && t.ay === s.by) {
          s.bx = t.bx;
          s.by = t.by;
        } else if (t.bx === s.ax && t.by === s.ay) {
          s.ax = t.ax;
          s.ay = t.ay;
        } else continue;
        used[j] = true;
        grew = true;
      }
    }
    out.push(s);
  }
  return out;
}

function boundary(tiles: Uint8Array, w: number, h: number, pits: boolean): Segment[] {
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? TILE.void : tiles[y * w + x]);
  const list: Segment[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = at(x, y);
      // Each shared edge is visited once, from the tile above or to the left of it.
      // The edge between this tile (below) and the one above: a horizontal segment at y.
      const up = at(x, y - 1);
      const mineTop = solidAt(t, EDGE_TOP, pits);
      const theirsBottom = solidAt(up, EDGE_BOTTOM, pits);
      if (mineTop !== theirsBottom) list.push(mineTop ? seg(x, y, x + 1, y, 3) : seg(x, y, x + 1, y, 2));
      // The edge between this tile (right) and the one to its left: a vertical segment at x.
      const left = at(x - 1, y);
      const mineLeft = solidAt(t, EDGE_LEFT, pits);
      const theirsRight = solidAt(left, EDGE_RIGHT, pits);
      if (mineLeft !== theirsRight) list.push(mineLeft ? seg(x, y, x, y + 1, 1) : seg(x, y, x, y + 1, 0));
      // The outer rim of the grid, so nothing can leave it.
      if (y === h - 1 && !solidAt(t, EDGE_BOTTOM, pits)) list.push(seg(x, y + 1, x + 1, y + 1, 3));
      if (x === w - 1 && !solidAt(t, EDGE_RIGHT, pits)) list.push(seg(x + 1, y, x + 1, y + 1, 1));
      // A diagonal tile's own slanted face.
      if (t === TILE.diagTL) list.push(seg(x + 1, y, x, y + 1, 4));
      else if (t === TILE.diagTR) list.push(seg(x, y, x + 1, y + 1, 5));
      else if (t === TILE.diagBL) list.push(seg(x, y, x + 1, y + 1, 6));
      else if (t === TILE.diagBR) list.push(seg(x + 1, y, x, y + 1, 7));
    }
  }
  return merge(list);
}

export function buildGeo(tiles: Uint8Array, w: number, h: number, circles: Circle[]): Geo {
  return { w, h, fly: boundary(tiles, w, h, false), walk: boundary(tiles, w, h, true), circles: circles.map((c) => ({ ...c })) };
}

/**
 * Mirror a velocity in a wall with one of the eight fixed normals. Exact: only sign flips and
 * swaps, so the speed is preserved to the last bit.
 */
export function reflectFixed(vx: number, vy: number, ntype: number, out: { x: number; y: number }): void {
  if (ntype === 0 || ntype === 1) {
    out.x = -vx;
    out.y = vy;
  } else if (ntype === 2 || ntype === 3) {
    out.x = vx;
    out.y = -vy;
  } else if (ntype === 4 || ntype === 7) {
    out.x = -vy;
    out.y = -vx;
  } else {
    out.x = vy;
    out.y = vx;
  }
}

/** Mirror a velocity in a surface with any unit normal (a post, a corner). */
export function reflectFree(vx: number, vy: number, nx: number, ny: number, out: { x: number; y: number }): void {
  const d = 2 * (vx * nx + vy * ny);
  out.x = vx - d * nx;
  out.y = vy - d * ny;
}
