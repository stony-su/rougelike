// A chamber on screen: the floor slab with its pits, the walls that bound it, and the posts and
// bumpers that stand on it.
//
// WALLS BY RULE. A wall may stand tall only where no floor lies behind it on screen; such walls
// are one static drawing under everything that moves. A wall with floor behind it is cut down to
// a kerb, and all kerbs are one static drawing over everything that moves: nothing can stand in
// front of them, so the order is always right. Only free-standing things (posts, bumpers) take
// part in the depth sort.
import { Graphics, GraphicsContext } from 'pixi.js';
import { TILE as PX, depthKey, projX, projY } from '../core/iso';
import { mixColor } from '../core/math';
import { CIRCLE_BUMPER, TILE } from '../sim/geo';
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

    const post = postContext(theme, 0.42);
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
          g.poly(lift([x, y, x + 1, y, x + 1, y + 1, x, y + 1], 0)).fill(theme.pitDeep);
          continue;
        }
        const shape = floorShape(t, x, y);
        if (shape) g.poly(lift(shape, 0)).fill((x + y) % 2 === 0 ? theme.ground : theme.groundDark);
      }
    }
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
        if (farRight) g.moveTo(projX(x, y), projY(x, y)).lineTo(projX(x + 1, y), projY(x + 1, y)).stroke(edge);
        if (farLeft) g.moveTo(projX(x, y), projY(x, y)).lineTo(projX(x, y + 1), projY(x, y + 1)).stroke(edge);
        if (this.tile(x + 1, y) !== TILE.pit) g.moveTo(projX(x + 1, y), projY(x + 1, y)).lineTo(projX(x + 1, y + 1), projY(x + 1, y + 1)).stroke(edge);
        if (this.tile(x, y + 1) !== TILE.pit) g.moveTo(projX(x, y + 1), projY(x, y + 1)).lineTo(projX(x + 1, y + 1), projY(x + 1, y + 1)).stroke(edge);
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
