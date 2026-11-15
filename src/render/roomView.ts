// A chamber on screen: the floor slab with its pits, the walls that bound it, and the posts and
// bumpers that stand on it.
//
// TWO LOOKS, whatever the colours. The court: a quiet checker and round posts. The survey:
// contour rings traced over a height field (a tilted, gently rolling plain with a mound at every
// pillar), like a map of ripples, and hexagonal pillars. Both are made by code from the room's
// own tiles.
//
// WALLS BY RULE. A wall may stand tall only where no floor lies behind it on screen; such walls
// are one static drawing under everything that moves. A wall with floor behind it is cut down to
// a kerb, and all kerbs are one static drawing over everything that moves: nothing can stand in
// front of them, so the order is always right. Only free-standing things (posts, bumpers) take
// part in the depth sort.
import { Graphics, GraphicsContext } from 'pixi.js';
import { TILE as PX, depthKey, projX, projY } from '../core/iso';
import { mixColor } from '../core/math';
import { hashString } from '../core/rng';
import { CIRCLE_BUMPER, TILE } from '../sim/geo';
import { groundAt } from '../sim/room';
import type { Room, SimEvent } from '../sim/types';
import type { Sortable } from './depth';
import type { ZoneTheme } from './palette';
import type { Stage } from './stage';

/** Heights in tiles. */
const TALL = 1.25;
const KERB = 0.28;
const SLAB = 0.95;
const POST_H = 0.95;
const BUMPER_H = 0.5;

type Pts = number[];

/** The solid part of a tile as a ground polygon, or null if the tile has none. */
function solidShape(tile: number, x: number, y: number): Pts | null {
  switch (tile) {
    case TILE.wall:
      return [x, y, x + 1, y, x + 1, y + 1, x, y + 1];
    case TILE.diagTL:
      return [x, y, x + 1, y, x, y + 1];
    case TILE.diagTR:
      return [x, y, x + 1, y, x + 1, y + 1];
    case TILE.diagBL:
      return [x, y, x + 1, y + 1, x, y + 1];
    case TILE.diagBR:
      return [x + 1, y, x + 1, y + 1, x, y + 1];
    default:
      return null;
  }
}

/** The floor part of a tile as a ground polygon, or null. */
function floorShape(tile: number, x: number, y: number): Pts | null {
  switch (tile) {
    case TILE.floor:
      return [x, y, x + 1, y, x + 1, y + 1, x, y + 1];
    case TILE.diagTL:
      return [x + 1, y, x + 1, y + 1, x, y + 1];
    case TILE.diagTR:
      return [x, y, x + 1, y + 1, x, y + 1];
    case TILE.diagBL:
      return [x, y, x + 1, y, x + 1, y + 1];
    case TILE.diagBR:
      return [x, y, x + 1, y, x, y + 1];
    default:
      return null;
  }
}

/** Ground points lifted to height z and projected to the screen. */
function lift(pts: Pts, z: number): Pts {
  const out: Pts = [];
  for (let i = 0; i < pts.length; i += 2) out.push(projX(pts[i], pts[i + 1]), projY(pts[i], pts[i + 1], z));
  return out;
}

function postContext(theme: ZoneTheme, r: number): GraphicsContext {
  const w = r * PX * 1.22;
  const hh = w * 0.5;
  const h = POST_H * PX;
  return new GraphicsContext()
    .ellipse(0, 0, w, hh)
    .fill(theme.wallRight)
    .rect(-w, -h, w * 2, h)
    .fill(theme.wallLeft)
    .rect(0, -h, w, h)
    .fill(theme.wallRight)
    .ellipse(0, -h, w, hh)
    .fill(theme.wallTop)
    .ellipse(0, -h, w * 0.55, hh * 0.55)
    .stroke({ width: 2, color: theme.highlight, alpha: 0.35 })
    .moveTo(-w, -h)
    .arc(0, -h, w, Math.PI, Math.PI * 2)
    .stroke({ width: 2, color: theme.highlight, alpha: 0.7 });
}

/** A hexagonal pillar: six faces, the ones toward the camera shaded from lit to dark, a rimmed cap. */
function hexContext(theme: ZoneTheme, r: number): GraphicsContext {
  const ctx = new GraphicsContext();
  const n = 6;
  const base: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 6;
    base.push([projX(Math.cos(a) * r, Math.sin(a) * r), projY(Math.cos(a) * r, Math.sin(a) * r)]);
  }
  const h = POST_H * PX;
  const faces: Array<{ a: [number, number]; b: [number, number]; mx: number }> = [];
  for (let k = 0; k < n; k++) {
    const a = base[k];
    const b = base[(k + 1) % n];
    if ((a[1] + b[1]) / 2 > -0.5) faces.push({ a, b, mx: (a[0] + b[0]) / 2 });
  }
  faces.sort((p, q) => p.mx - q.mx);
  faces.forEach((f, i) => {
    const t = faces.length <= 1 ? 0.5 : i / (faces.length - 1);
    const col = t < 0.34 ? theme.wallLeft : t > 0.66 ? theme.wallRight : mixColor(theme.wallLeft, theme.wallRight, 0.55);
    ctx.poly([f.a[0], f.a[1], f.b[0], f.b[1], f.b[0], f.b[1] - h, f.a[0], f.a[1] - h]).fill(col);
  });
  const top: number[] = [];
  for (const p of base) top.push(p[0], p[1] - h);
  ctx.poly(top).fill(theme.wallTop);
  ctx.poly(top).stroke({ width: 1.8, color: theme.highlight, alpha: 0.75, join: 'round' });
  // a ring cut into the cap
  ctx.ellipse(0, -h, r * PX * 0.5, r * PX * 0.25).stroke({ width: 1.6, color: theme.highlight, alpha: 0.4 });
  return ctx;
}

/** Smooth noise from a seed, for the lie of the land. */
function valueNoise(seed: number): (x: number, y: number) => number {
  const h = (ix: number, iy: number): number => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

// Marching squares. Corner bits: 1 = (x, y), 2 = (x+1, y), 4 = (x+1, y+1), 8 = (x, y+1).
// Edges: 0 top, 1 right, 2 bottom, 3 left.
const CASES: readonly (readonly number[])[] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [2, 0], [0, 1, 2, 3], [2, 1], [1, 3], [1, 0], [0, 3], []];

function bumperContext(theme: ZoneTheme, r: number): GraphicsContext {
  const w = r * PX * 1.22;
  const hh = w * 0.5;
  const h = BUMPER_H * PX;
  return new GraphicsContext()
    .ellipse(0, 0, w * 1.06, hh * 1.06)
    .fill(mixColor(theme.bumper, 0x000000, 0.45))
    .rect(-w, -h, w * 2, h)
    .fill(theme.bumper)
    .rect(0, -h, w, h)
    .fill(mixColor(theme.bumper, 0x000000, 0.25))
    .ellipse(0, -h, w, hh)
    .fill(mixColor(theme.bumper, theme.bumperHot, 0.35))
    .ellipse(0, -h, w * 0.7, hh * 0.7)
    .stroke({ width: 3, color: theme.bumperHot, alpha: 0.9 })
    .ellipse(0, -h, w * 0.3, hh * 0.3)
    .fill(theme.bumperHot);
}

interface BumperView {
  x: number;
  y: number;
  g: Graphics;
  glow: Graphics;
  pulse: number;
}

export class RoomView {
  private readonly floor = new Graphics();
  private readonly back = new Graphics();
  private readonly front = new Graphics();
  private readonly shadows = new Graphics();
  private readonly sorted: Sortable[] = [];
  private readonly bumpers: BumperView[] = [];

  constructor(
    private readonly room: Room,
    private readonly theme: ZoneTheme,
    private readonly stage: Stage,
  ) {
    this.drawFloor();
    this.drawWalls();
    stage.floor.addChild(this.floor);
    this.sorted.push(stage.depth.add(this.back, -1e6), stage.depth.add(this.front, 1e6));
    stage.decals.addChild(this.shadows);

    const post = room.look === 'survey' ? hexContext(theme, 0.47) : postContext(theme, 0.42);
    const bumper = bumperContext(theme, 0.5);
    for (const c of room.geo.circles) {
      const isBumper = c.kind === CIRCLE_BUMPER;
      this.shadows.circle((c.x + 0.2) * PX, (c.y + 0.2) * PX, c.r * 1.3 * PX).fill({ color: 0x000000, alpha: 0.28 });
      const g = new Graphics(isBumper ? bumper : post);
      g.position.set(projX(c.x, c.y), projY(c.x, c.y));
      this.sorted.push(stage.depth.add(g, depthKey(c.x, c.y)));
      if (isBumper) {
        // a soft halo that swells when something rings the bumper
        const glow = new Graphics().ellipse(0, -BUMPER_H * PX, c.r * PX * 1.5, c.r * PX * 0.75).fill({ color: theme.bumperHot, alpha: 0.55 });
        glow.position.copyFrom(g.position);
        glow.alpha = 0.25;
        stage.fxGlow.addChild(glow);
        this.bumpers.push({ x: c.x, y: c.y, g, glow, pulse: 0 });
      }
    }
  }

  /** Bumpers answer when something bounces off them. */
  handle(ev: SimEvent): void {
    if ((ev.type !== 'ricochet' && ev.type !== 'wallSlam') || ev.off !== 'bumper') return;
    let best: BumperView | null = null;
    let bd = 4;
    for (const b of this.bumpers) {
      const d = (b.x - ev.x) * (b.x - ev.x) + (b.y - ev.y) * (b.y - ev.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) best.pulse = 1;
  }

  update(dt: number, time: number): void {
    for (const b of this.bumpers) {
      b.pulse = Math.max(0, b.pulse - dt * 3.2);
      const k = b.pulse * b.pulse;
      b.g.scale.set(1 + k * 0.16, 1 - k * 0.12);
      b.glow.alpha = 0.22 + 0.08 * Math.sin(time * 2.4 + b.x) + k * 0.75;
      b.glow.scale.set(1 + k * 0.6);
    }
  }

  destroy(): void {
    for (const s of this.sorted) this.stage.depth.remove(s);
    for (const b of this.bumpers) b.glow.destroy();
    this.floor.destroy();
    this.back.destroy();
    this.front.destroy();
    this.shadows.destroy();
  }

  private tile(x: number, y: number): number {
    const r = this.room;
    return x < 0 || y < 0 || x >= r.w || y >= r.h ? TILE.void : r.tiles[y * r.w + x];
  }

  /** Somewhere a body can be: floor, a pit, or the floor half of a cut tile. */
  private open(x: number, y: number): boolean {
    const t = this.tile(x, y);
    return t !== TILE.void && t !== TILE.wall;
  }

  private drawFloor(): void {
    const { room, theme } = this;
    const g = this.floor;
    // floor tiles, as a quiet checker
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const t = this.tile(x, y);
        if (t === TILE.pit) {
          // a hole: what lies below shows through, in shadow
          g.poly(lift([x, y, x + 1, y, x + 1, y + 1, x, y + 1], 0)).fill({ color: theme.pitDeep, alpha: 0.45 });
          continue;
        }
        const shape = floorShape(t, x, y);
        // the court is a checker; the survey ground is one tone, and its pattern is drawn over it
        if (shape) g.poly(lift(shape, 0)).fill(room.look === 'survey' || (x + y) % 2 === 0 ? theme.ground : theme.groundDark);
      }
    }
    if (room.look === 'survey') this.drawContours(g);
    // Pits: the far walls of the hole catch the light, in two bands; the near lip gets a pale edge.
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (this.tile(x, y) !== TILE.pit) continue;
        const farRight = this.tile(x, y - 1) !== TILE.pit;
        const farLeft = this.tile(x - 1, y) !== TILE.pit;
        if (farRight) {
          g.poly(lift([x, y, x + 1, y, x + 1, y + 0.62, x, y + 0.62], 0)).fill(mixColor(theme.pitWall, theme.pitDeep, 0.5));
          g.poly(lift([x, y, x + 1, y, x + 1, y + 0.3, x, y + 0.3], 0)).fill(theme.pitWall);
        }
        if (farLeft) {
          g.poly(lift([x, y, x + 0.62, y, x + 0.62, y + 1, x, y + 1], 0)).fill(mixColor(theme.pitWall, theme.pitDeep, 0.62));
          g.poly(lift([x, y, x + 0.3, y, x + 0.3, y + 1, x, y + 1], 0)).fill(mixColor(theme.pitWall, 0x000000, 0.15));
        }
        const edge = { width: 2, color: theme.accent, alpha: 0.5 };
        if (farRight)
          g.moveTo(projX(x, y), projY(x, y))
            .lineTo(projX(x + 1, y), projY(x + 1, y))
            .stroke(edge);
        if (farLeft)
          g.moveTo(projX(x, y), projY(x, y))
            .lineTo(projX(x, y + 1), projY(x, y + 1))
            .stroke(edge);
        if (this.tile(x + 1, y) !== TILE.pit)
          g.moveTo(projX(x + 1, y), projY(x + 1, y))
            .lineTo(projX(x + 1, y + 1), projY(x + 1, y + 1))
            .stroke(edge);
        if (this.tile(x, y + 1) !== TILE.pit)
          g.moveTo(projX(x, y + 1), projY(x, y + 1))
            .lineTo(projX(x + 1, y + 1), projY(x + 1, y + 1))
            .stroke(edge);
      }
    }
    // A soft dark band where the floor meets a far wall, so walls sit on the floor.
    const shade = { color: 0x000000, alpha: 0.22 };
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (this.tile(x, y) !== TILE.floor) continue;
        if (this.tile(x, y - 1) === TILE.wall) g.poly(lift([x, y, x + 1, y, x + 1, y + 0.2, x, y + 0.2], 0)).fill(shade);
        if (this.tile(x - 1, y) === TILE.wall) g.poly(lift([x, y, x + 0.2, y, x + 0.2, y + 1, x, y + 1], 0)).fill(shade);
      }
    }
    // marks on the floor: rings, in keeping with everything else that rings here
    const ringAt = (wx: number, wy: number, r: number, alpha: number): void => {
      const n = 28;
      const pts: Pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(wx + Math.cos(a) * r, wy + Math.sin(a) * r);
      }
      g.poly(lift(pts, 0)).stroke({ width: 2, color: theme.contour, alpha });
    };
    for (const m of room.marks) ringAt(m.x, m.y, 0.36, 0.9);
    for (const m of room.spawnMarks) {
      ringAt(m.x, m.y, 0.55, 0.8);
      ringAt(m.x, m.y, 0.3, 0.5);
    }
    ringAt(room.rewardSpot.x, room.rewardSpot.y, 1.15, 0.9);
    ringAt(room.rewardSpot.x, room.rewardSpot.y, 0.8, 0.6);
    ringAt(room.rewardSpot.x, room.rewardSpot.y, 0.45, 0.9);
  }

  /**
   * Contour rings over the floor: the land is a tilted, gently rolling plain with a mound at
   * every pillar and bumper, and a line is traced at each step of height. Every fourth line is
   * drawn brighter, as on a map.
   */
  private drawContours(g: Graphics): void {
    const { room, theme } = this;
    const noise = valueNoise(hashString(room.id));
    const height = (x: number, y: number): number => {
      let hgt = 0.22 * (x / room.w) + 0.16 * (y / room.h) + noise(x * 0.33, y * 0.33) * 0.62 + noise(x * 0.9, y * 0.9) * 0.12;
      for (const c of room.geo.circles) {
        const d2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        hgt += 1.05 * Math.exp(-d2 / (2 * 1.5 * 1.5));
      }
      return hgt;
    };
    // The grid the lines are traced on. A finer one makes smoother rings and many more pieces to build:
    // at a quarter of a tile a big chamber took a second to draw, and that second was a frozen screen.
    const cs = 0.4;
    const nx = Math.ceil(room.w / cs) + 1;
    const ny = Math.ceil(room.h / cs) + 1;
    const v = new Float32Array(nx * ny);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const hgt = height(i * cs, j * cs);
        v[j * nx + i] = hgt;
        if (hgt < lo) lo = hgt;
        if (hgt > hi) hi = hgt;
      }
    }
    const step = 0.105;
    const px = [0, 0, 0, 0];
    const py = [0, 0, 0, 0];
    let index = 0;
    for (let level = Math.ceil(lo / step) * step; level < hi; level += step, index++) {
      let any = false;
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = v[j * nx + i];
          const b = v[j * nx + i + 1];
          const c = v[(j + 1) * nx + i + 1];
          const d = v[(j + 1) * nx + i];
          const idx = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * cs;
          const y = j * cs;
          // only on the floor: not over pits, not under walls
          if (groundAt(room, x + cs / 2, y + cs / 2) !== 'floor') continue;
          px[0] = x + ((level - a) / (b - a || 1e-9)) * cs;
          py[0] = y;
          px[1] = x + cs;
          py[1] = y + ((level - b) / (c - b || 1e-9)) * cs;
          px[2] = x + ((level - d) / (c - d || 1e-9)) * cs;
          py[2] = y + cs;
          px[3] = x;
          py[3] = y + ((level - a) / (d - a || 1e-9)) * cs;
          const e = CASES[idx];
          for (let k = 0; k < e.length; k += 2) {
            g.moveTo(projX(px[e[k]], py[e[k]]), projY(px[e[k]], py[e[k]])).lineTo(projX(px[e[k + 1]], py[e[k + 1]]), projY(px[e[k + 1]], py[e[k + 1]]));
            any = true;
          }
        }
      }
      const major = index % 4 === 0;
      if (any) g.stroke({ width: major ? 2 : 1.3, color: major ? theme.accent : theme.contour, alpha: major ? 0.38 : 0.7 });
    }
  }

  /** One solid shape as a prism: the faces that look at the camera, then the top. */
  private prism(g: Graphics, shape: Pts, height: number): void {
    const { theme } = this;
    const n = shape.length / 2;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += shape[i * 2] * shape[j * 2 + 1] - shape[j * 2] * shape[i * 2 + 1];
    }
    const orient = area >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = shape[i * 2];
      const ay = shape[i * 2 + 1];
      const bx = shape[j * 2];
      const by = shape[j * 2 + 1];
      // outward normal of this edge
      const nx = (by - ay) * orient;
      const ny = -(bx - ax) * orient;
      if (nx + ny <= 1e-6) continue;
      // A face square to the camera is the brightest; the two side faces differ so corners read.
      const color = nx > 1e-6 && ny > 1e-6 ? mixColor(theme.wallLeft, theme.wallTop, 0.3) : ny > nx ? theme.wallLeft : theme.wallRight;
      const mx = (ax + bx) / 2 + nx * 0.01;
      const my = (ay + by) / 2 + ny * 0.01;
      const beyond = this.tile(Math.floor(mx), Math.floor(my));
      g.poly([projX(ax, ay), projY(ax, ay, height), projX(bx, by), projY(bx, by, height), projX(bx, by), projY(bx, by, 0), projX(ax, ay), projY(ax, ay, 0)]).fill(color);
      if (beyond === TILE.void) {
        // the chamber ends here: the slab under it shows
        const side = ny > nx ? theme.sideLeft : theme.sideRight;
        g.poly([projX(ax, ay), projY(ax, ay, 0), projX(bx, by), projY(bx, by, 0), projX(bx, by), projY(bx, by, -SLAB), projX(ax, ay), projY(ax, ay, -SLAB)]).fill(side);
      }
    }
    const top = lift(shape, height);
    g.poly(top).fill(theme.wallTop);
    // a pale rim along the top edges that face the camera
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nx = (shape[j * 2 + 1] - shape[i * 2 + 1]) * orient;
      const ny = -(shape[j * 2] - shape[i * 2]) * orient;
      if (nx + ny <= 1e-6) continue;
      g.moveTo(top[i * 2], top[i * 2 + 1])
        .lineTo(top[j * 2], top[j * 2 + 1])
        .stroke({ width: 2, color: theme.highlight, alpha: height > 0.6 ? 0.55 : 0.35 });
    }
  }

  private drawWalls(): void {
    const { room, theme } = this;
    // Far to near, so each prism covers what is behind it.
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) cells.push([x, y]);
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[1] - b[1]);
    for (const [x, y] of cells) {
      const shape = solidShape(this.tile(x, y), x, y);
      if (!shape) continue;
      // Tall only if nothing a body can stand on lies behind it on screen.
      const hides = this.open(x - 1, y - 1) || this.open(x - 2, y - 2);
      // Rock with nothing open anywhere near it is not worth a prism.
      let near = false;
      for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2 && !near; i++) near = this.open(x + i, y + j);
      if (!near) continue;
      if (hides) this.prism(this.front, shape, KERB);
      else this.prism(this.back, shape, TALL);
    }
    // Doors: a gate standing in the far wall, marked with a ring.
    for (const d of room.doors) {
      const x = Math.floor(d.x);
      const y = Math.floor(d.y);
      const north = d.side === 'north';
      const ax = x;
      const ay = y;
      const bx = north ? x + 1 : x;
      const by = north ? y : y + 1;
      const g = this.back;
      g.poly([projX(ax, ay), projY(ax, ay, TALL), projX(bx, by), projY(bx, by, TALL), projX(bx, by), projY(bx, by, 0), projX(ax, ay), projY(ax, ay, 0)]).fill(theme.pitDeep);
      const cx = (projX(ax, ay) + projX(bx, by)) / 2;
      const cy = (projY(ax, ay, TALL * 0.55) + projY(bx, by, TALL * 0.55)) / 2;
      g.ellipse(cx, cy, 13, 17).stroke({ width: 3, color: theme.accent, alpha: 0.85 });
      g.ellipse(cx, cy, 5, 7).fill({ color: theme.highlight, alpha: 0.8 });
    }
  }
}
