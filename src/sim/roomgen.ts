// Chambers made by rule. From a seed: a shape (a court, a cross, twin lobes, a ring round a
// pit, a cavern), walls drawn round it with every diagonal edge cut at 45 degrees for bank
// shots, then posts, bumpers and pits laid out in mirror so the room reads at a glance, spawn
// marks round the far side, and the start near the bottom corner. The result is an ordinary
// room template, checked by the same validator as a hand-built one; a seed that fails is tried
// again with the next variation.
//
// Everything here is integer and exact arithmetic on the seeded generator, so every laptop
// builds the same chamber from the same seed.
import { Rng } from '../core/rng';
import type { RoomKind, RoomLook, RoomTemplate, ZoneId } from './defs';
import { validateRoomTemplate } from './room';

export type RoomShape = 'court' | 'cross' | 'lobes' | 'ring' | 'cavern';
export const ROOM_SHAPES: readonly RoomShape[] = ['court', 'cross', 'lobes', 'ring', 'cavern'];

export interface RoomSpec {
  zone: ZoneId;
  kind: RoomKind;
  look: RoomLook;
  /** Rough width of the floor in tiles: 16 for a side-chamber, up to 34 for a big fight. */
  size: number;
  shape?: RoomShape;
  name?: string;
  /**
   * A boss's floor: open, with no pits to be cornered against and no posts to hide behind, and
   * four bumpers toward its corners to bank off.
   */
  arena?: boolean;
}

type Grid = string[][];

const at = (g: Grid, x: number, y: number): string => (y < 0 || y >= g.length || x < 0 || x >= g[0].length ? ' ' : g[y][x]);
const isFloor = (g: Grid, x: number, y: number): boolean => at(g, x, y) === '.';

/** The floor of each shape, as a yes-or-no for every cell of a w x h box. */
function mask(shape: RoomShape, w: number, h: number, rng: Rng): boolean[][] {
  const m: boolean[][] = [];
  for (let y = 0; y < h; y++) m.push(new Array<boolean>(w).fill(false));
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  // An eight-sided region: a box with its corners cut by `cut` cells.
  const octagon = (x0: number, y0: number, x1: number, y1: number, cut: number): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = Math.min(x - x0, x1 - x);
        const dy = Math.min(y - y0, y1 - y);
        if (dx + dy >= cut) m[y][x] = true;
      }
    }
  };
  if (shape === 'court' || shape === 'ring') {
    octagon(0, 0, w - 1, h - 1, rng.int(2, 5));
  } else if (shape === 'cross') {
    const armW = Math.floor(w * rng.float(0.42, 0.56));
    const armH = Math.floor(h * rng.float(0.42, 0.56));
    octagon(0, Math.floor((h - armH) / 2), w - 1, Math.floor((h - armH) / 2) + armH - 1, 2);
    octagon(Math.floor((w - armW) / 2), 0, Math.floor((w - armW) / 2) + armW - 1, h - 1, 2);
  } else if (shape === 'lobes') {
    const lw = Math.floor(w * 0.64);
    const lh = Math.floor(h * 0.64);
    const cut = rng.int(3, 5);
    octagon(0, 0, lw - 1, lh - 1, cut);
    octagon(w - lw, h - lh, w - 1, h - 1, cut);
  } else {
    // A cavern: an ellipse roughened by chance, then smoothed until its edge is all curves.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ex = (x - cx) / (w / 2);
        const ey = (y - cy) / (h / 2);
        const d = ex * ex + ey * ey;
        m[y][x] = d < 0.55 || (d < 1 && rng.chance(0.62));
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      const next = m.map((row) => row.slice());
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let n = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i !== 0 || j !== 0) && y + j >= 0 && y + j < h && x + i >= 0 && x + i < w && m[y + j][x + i]) n++;
          next[y][x] = n >= 5 || (m[y][x] && n >= 4);
        }
      }
      for (let y = 0; y < h; y++) m[y] = next[y];
    }
  }
  return m;
}

/** Keep only the largest connected piece of floor. */
function largestPiece(m: boolean[][]): void {
  const h = m.length;
  const w = m[0].length;
  const label: number[][] = m.map((row) => row.map(() => 0));
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y][x] || label[y][x] !== 0) continue;
      next++;
      let size = 0;
      const stack: number[] = [x, y];
      label[y][x] = next;
      while (stack.length) {
        const sy = stack.pop() as number;
        const sx = stack.pop() as number;
        size++;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !m[ny][nx] || label[ny][nx] !== 0) continue;
          label[ny][nx] = next;
          stack.push(nx, ny);
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = next;
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y][x] = label[y][x] === best;
}

/** How far a floor cell is from the nearest thing that is not open floor, in steps (capped). */
function clearance(g: Grid, x: number, y: number, cap: number): number {
  for (let r = 1; r <= cap; r++) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (at(g, x + i, y + j) !== '.') return r - 1;
      }
    }
  }
  return cap;
}

function attempt(seed: string, spec: RoomSpec, shape: RoomShape): RoomTemplate {
  const rng = new Rng(seed);
  const size = Math.max(14, Math.min(34, Math.round(spec.size)));
  const w = size + rng.int(-1, 2);
  const h = Math.max(12, Math.round(size * rng.float(0.72, 0.95)));
  const m = mask(shape, w, h, rng);
  largestPiece(m);

  // The grid, with a border two cells deep so that walls and their corners always fit.
  const gw = w + 4;
  const gh = h + 4;
  const g: Grid = [];
  for (let y = 0; y < gh; y++) g.push(new Array<string>(gw).fill(' '));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y][x]) g[y + 2][x + 2] = '.';

  // Walls: every cell that touches floor, corners included.
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (g[y][x] !== ' ') continue;
      let touches = false;
      for (let j = -1; j <= 1 && !touches; j++) for (let i = -1; i <= 1 && !touches; i++) touches = isFloor(g, x + i, y + j);
      if (touches) g[y][x] = '#';
    }
  }
  // Cut the corners: a wall cell with floor on two adjoining sides and wall on the other two
  // becomes a 45 degree face. Along a stepped edge these join into one long bank wall.
  const cuts: Array<[number, number, string]> = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (g[y][x] !== '#') continue;
      const r = isFloor(g, x + 1, y);
      const l = isFloor(g, x - 1, y);
      const d = isFloor(g, x, y + 1);
      const u = isFloor(g, x, y - 1);
      const wall = (dx: number, dy: number): boolean => at(g, x + dx, y + dy) === '#';
      if (r && d && !l && !u && wall(-1, 0) && wall(0, -1)) cuts.push([x, y, '7']);
      else if (l && d && !r && !u && wall(1, 0) && wall(0, -1)) cuts.push([x, y, '9']);
      else if (r && u && !l && !d && wall(-1, 0) && wall(0, 1)) cuts.push([x, y, '1']);
      else if (l && u && !r && !d && wall(1, 0) && wall(0, 1)) cuts.push([x, y, '3']);
    }
  }
  for (const [x, y, ch] of cuts) g[y][x] = ch;

  const cx = Math.floor(gw / 2);
  const cy = Math.floor(gh / 2);
  /** Place a feature and its mirror images, if every one of them has room. */
  const mirrored = (x: number, y: number, ch: string, need: number, mode: number): boolean => {
    const spots: Array<[number, number]> = [[x, y]];
    if (mode === 1 || mode === 3) spots.push([gw - 1 - x, y]);
    if (mode === 2 || mode === 3) spots.push([x, gh - 1 - y]);
    if (mode === 3) spots.push([gw - 1 - x, gh - 1 - y]);
    if (mode === 4) spots.push([gw - 1 - x, gh - 1 - y]);
    for (const [sx, sy] of spots) if (at(g, sx, sy) !== '.' || clearance(g, sx, sy, need) < need) return false;
    for (const [sx, sy] of spots) g[sy][sx] = ch;
    return true;
  };

  // A ring is a court with a pit in the middle; other shapes may get smaller pits.
  if (shape === 'ring') {
    const rx = Math.max(2, Math.floor(w * rng.float(0.14, 0.2)));
    const ry = Math.max(2, Math.floor(h * rng.float(0.14, 0.2)));
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const ex = (x - cx) / (rx + 0.5);
        const ey = (y - cy) / (ry + 0.5);
        if (ex * ex + ey * ey <= 1 && at(g, x, y) === '.') g[y][x] = '~';
      }
    }
  }
  const mode = spec.arena ? 3 : rng.pick([1, 2, 3, 3, 4]);
  const pits = shape === 'ring' || spec.arena ? 0 : rng.int(0, 2);
  for (let i = 0, tries = 0; i < pits && tries < 60; tries++) {
    const x = rng.int(4, gw - 5);
    const y = rng.int(4, gh - 5);
    // a pit is a 2 x 2 hole; all four cells and their mirrors must be open
    const cells: Array<[number, number]> = [
      [x, y],
      [x + 1, y],
      [x, y + 1],
      [x + 1, y + 1],
    ];
    if (!cells.every(([px, py]) => at(g, px, py) === '.' && clearance(g, px, py, 3) >= 3)) continue;
    const before = g.map((row) => row.slice());
    let ok = true;
    for (const [px, py] of cells) ok = mirrored(px, py, '~', 0, mode) && ok;
    if (!ok) for (let yy = 0; yy < gh; yy++) g[yy] = before[yy];
    else i++;
  }
  // Posts and bumpers: enough that nowhere on a big floor is far from something to bounce off.
  const area = m.reduce((n, row) => n + row.filter(Boolean).length, 0);
  const posts = spec.arena ? 0 : Math.max(2, Math.round(area / rng.float(70, 110)));
  const bumpers = spec.arena ? 0 : Math.max(1, Math.round(area / rng.float(170, 260)));
  if (spec.arena) {
    // one bumper toward each corner, mirrored both ways: the nearest spot to the corner that has room
    for (let inset = 3; inset < Math.min(cx, cy) - 2; inset++) if (mirrored(2 + inset, 2 + inset, 'B', 2, 3)) break;
  }
  for (let placed = 0, tries = 0; placed < posts && tries < 200; tries++) {
    if (mirrored(rng.int(3, gw - 4), rng.int(3, gh - 4), 'o', 2, mode)) placed += mode === 3 ? 4 : mode === 0 ? 1 : 2;
  }
  for (let placed = 0, tries = 0; placed < bumpers && tries < 200; tries++) {
    if (mirrored(rng.int(3, gw - 4), rng.int(3, gh - 4), 'B', 2, mode)) placed += mode === 3 ? 4 : mode === 0 ? 1 : 2;
  }

  // The start: the open floor cell nearest the bottom corner. The focus: open floor nearest the middle.
  const open: Array<[number, number]> = [];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (g[y][x] === '.' && clearance(g, x, y, 1) >= 1) open.push([x, y]);
  if (open.length < 30) throw new Error('too little open floor');
  const pickBy = (score: (x: number, y: number) => number): [number, number] => {
    let best = open[0];
    let bs = -Infinity;
    for (const c of open) {
      if (g[c[1]][c[0]] !== '.') continue;
      const s = score(c[0], c[1]);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  };
  const start = pickBy((x, y) => x + y - Math.abs(x - y) * 0.35);
  g[start[1]][start[0]] = 'P';
  const focus = pickBy((x, y) => -((x - cx) * (x - cx) + (y - cy) * (y - cy)));
  g[focus[1]][focus[0]] = 'r';

  // Spawn marks: spread round the floor, well away from the start and from each other.
  const marks: Array<[number, number]> = [];
  const want = Math.max(5, Math.min(10, Math.round(area / 55)));
  // a small room cannot keep its marks as far apart as a big one
  const far = size < 20 ? 5 : 7;
  const apart = size < 20 ? 3 : 4;
  for (let tries = 0; marks.length < want && tries < 400; tries++) {
    const c = open[rng.int(0, open.length - 1)];
    if (g[c[1]][c[0]] !== '.') continue;
    const fromStart = (c[0] - start[0]) * (c[0] - start[0]) + (c[1] - start[1]) * (c[1] - start[1]);
    if (fromStart < far * far) continue;
    if (marks.some((mk) => (mk[0] - c[0]) * (mk[0] - c[0]) + (mk[1] - c[1]) * (mk[1] - c[1]) < apart * apart)) continue;
    if (clearance(g, c[0], c[1], 2) < 2) continue;
    marks.push(c);
    g[c[1]][c[0]] = 's';
  }

  return {
    id: `gen-${shape}-${seed}`,
    name: spec.name ?? NAMES[shape],
    zone: spec.zone,
    kind: spec.kind,
    look: spec.look,
    map: g.map((row) => row.join('')),
  };
}

const NAMES: Record<RoomShape, string> = { court: 'Court', cross: 'Crossing', lobes: 'Twin Halls', ring: 'Ring', cavern: 'Hollow' };

/** A generated chamber. The same seed and spec always give the same room. */
export function generateRoom(seed: string, spec: RoomSpec): RoomTemplate {
  const pick = new Rng(`${seed}/shape`);
  for (let i = 0; i < 24; i++) {
    // a small room has no space for anything but a court
    const shape = spec.size < 20 ? 'court' : (spec.shape ?? pick.pick(ROOM_SHAPES));
    try {
      const t = attempt(`${seed}/${i}`, spec, shape);
      if (validateRoomTemplate(t).length === 0) return t;
    } catch {
      // not enough floor came of that seed: try the next variation
    }
  }
  // Nothing passed (it has not happened in thousands of seeds): a plain court always does.
  const size = Math.max(14, Math.min(30, Math.round(spec.size)));
  const rows: string[] = [];
  for (let y = 0; y < size - 2; y++) {
    let row = '';
    for (let x = 0; x < size + 2; x++) {
      const edge = x === 0 || y === 0 || x === size + 1 || y === size - 3;
      row += edge ? '#' : '.';
    }
    rows.push(row);
  }
  const put = (x: number, y: number, ch: string): void => {
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  };
  put(size - 1, size - 5, 'P');
  put(Math.floor(size / 2), Math.floor(size / 2) - 2, 'r');
  for (const [x, y] of [
    [2, 2],
    [size - 1, 2],
    [2, size - 6],
    [Math.floor(size / 2), 2],
    [2, Math.floor(size / 2) - 2],
  ])
    put(x, y, 's');
  return { id: `gen-plain-${seed}`, name: 'Court', zone: spec.zone, kind: spec.kind, look: spec.look, map: rows };
}
