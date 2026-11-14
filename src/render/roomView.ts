// Draws a room as a sheet of surveyed land: a slab with hatched side faces, a floor ruled with
// contour lines and grid ticks, bathymetric rings fading into the void, and upright stone pillars.
// The floor is drawn once and baked to a texture.
import { Container, Graphics, GraphicsContext, Rectangle, Sprite } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { hashString } from '../core/rng';
import { isFloorTile } from '../sim/room';
import type { Room } from '../sim/types';
import { RIM } from './palette';
import type { ZoneTheme } from './palette';
import type { Sortable } from './depth';
import { makeGround } from './stage';
import type { Stage } from './stage';

/** Ground art is authored in art pixels: world units x TILE (see core/iso). */
const T = TILE;
/** Height of the slab's visible side faces, in pixels at zoom 1. */
const SLAB = TILE * 0.5;
const PILLAR_HEIGHT = 0.95;

// ---------------------------------------------------------------- noise

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

// ---------------------------------------------------------------- marching squares

// Corner bits: 1 = (x, y), 2 = (x+1, y), 4 = (x+1, y+1), 8 = (x, y+1). Edges: 0 top, 1 right, 2 bottom, 3 left.
const CASES: readonly (readonly number[])[] = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
  [2, 3], [2, 0], [0, 1, 2, 3], [2, 1], [1, 3], [1, 0], [0, 3], [],
];

interface Field {
  x0: number;
  y0: number;
  cs: number;
  nx: number;
  ny: number;
  v: Float32Array;
}

function sampleField(x0: number, y0: number, x1: number, y1: number, cs: number, f: (x: number, y: number) => number): Field {
  const nx = Math.ceil((x1 - x0) / cs) + 1;
  const ny = Math.ceil((y1 - y0) / cs) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = f(x0 + i * cs, y0 + j * cs);
  return { x0, y0, cs, nx, ny, v };
}

function traceLevel(
  fld: Field,
  level: number,
  keep: (cx: number, cy: number, i: number, j: number) => boolean,
  emit: (ax: number, ay: number, bx: number, by: number) => void,
): void {
  const { x0, y0, cs, nx, ny, v } = fld;
  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i];
      const b = v[j * nx + i + 1];
      const c = v[(j + 1) * nx + i + 1];
      const d = v[(j + 1) * nx + i];
      const idx = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = x0 + i * cs;
      const y = y0 + j * cs;
      if (!keep(x + cs / 2, y + cs / 2, i, j)) continue;
      px[0] = x + ((level - a) / (b - a || 1e-9)) * cs;
      py[0] = y;
      px[1] = x + cs;
      py[1] = y + ((level - b) / (c - b || 1e-9)) * cs;
      px[2] = x + ((level - d) / (c - d || 1e-9)) * cs;
      py[2] = y + cs;
      px[3] = x;
      py[3] = y + ((level - a) / (d - a || 1e-9)) * cs;
      const e = CASES[idx];
      for (let k = 0; k < e.length; k += 2) emit(px[e[k]], py[e[k]], px[e[k + 1]], py[e[k + 1]]);
    }
  }
}

// ---------------------------------------------------------------- pillars

const pillarContexts = new Map<string, GraphicsContext>();

function pillarContext(theme: ZoneTheme, r: number): GraphicsContext {
  const key = `${theme.id}:${r}`;
  const cached = pillarContexts.get(key);
  if (cached) return cached;
  const ctx = new GraphicsContext();
  const n = 6;
  const base: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.PI / 6;
    base.push([projX(Math.cos(a) * r, Math.sin(a) * r), projY(Math.cos(a) * r, Math.sin(a) * r)]);
  }
  const hpx = PILLAR_HEIGHT * TILE;
  // Side faces: draw those whose midpoint is on the camera side (screen y > 0), left to right.
  const faces: Array<{ a: [number, number]; b: [number, number]; mx: number }> = [];
  for (let k = 0; k < n; k++) {
    const a = base[k];
    const b = base[(k + 1) % n];
    const my = (a[1] + b[1]) / 2;
    if (my > -0.5) faces.push({ a, b, mx: (a[0] + b[0]) / 2 });
  }
  faces.sort((p, q) => p.mx - q.mx);
  faces.forEach((f, i) => {
    const t = faces.length <= 1 ? 0.5 : i / (faces.length - 1);
    const col = t < 0.34 ? theme.stoneLeft : t > 0.66 ? theme.stoneRight : mix(theme.stoneLeft, theme.stoneRight, 0.55);
    ctx.poly([f.a[0], f.a[1], f.b[0], f.b[1], f.b[0], f.b[1] - hpx, f.a[0], f.a[1] - hpx]).fill(col);
    if (t > 0.66) {
      // hatch the shadow face
      for (let s = 1; s <= 4; s++) {
        const u = s / 5;
        const x = f.a[0] + (f.b[0] - f.a[0]) * u;
        const y = f.a[1] + (f.b[1] - f.a[1]) * u;
        ctx.moveTo(x, y - hpx * 0.12).lineTo(x, y - hpx * 0.9);
      }
      ctx.stroke({ width: 1.2, color: theme.groundDark, alpha: 0.55 });
    }
  });
  const top: number[] = [];
  for (const p of base) top.push(p[0], p[1] - hpx);
  ctx.poly(top).fill(theme.stoneTop);
  ctx.poly(top).stroke({ width: 1.6, color: RIM, alpha: 0.75, join: 'round' });
  // a cut mark on the cap: every boundary stone carries a reference cross
  ctx.moveTo(-5, -hpx).lineTo(5, -hpx).moveTo(0, -hpx - 3).lineTo(0, -hpx + 3).stroke({ width: 1.4, color: theme.groundDark, alpha: 0.8 });
  pillarContexts.set(key, ctx);
  return ctx;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// ---------------------------------------------------------------- the view

export class RoomView {
  private readonly sprite: Sprite;
  private readonly texture: Texture;
  private readonly props: Sortable[] = [];
  private readonly decal: Graphics;

  constructor(
    private readonly room: Room,
    private readonly theme: ZoneTheme,
    private readonly stage: Stage,
    renderer: Renderer,
  ) {
    const seed = hashString(room.id);
    const art = new Container();
    const voidLines = makeGround();
    const sides = new Container();
    const top = makeGround();
    voidLines.outer.y = SLAB;
    art.addChild(voidLines.outer, sides, top.outer);

    this.drawVoid(voidLines.inner, seed);
    this.drawSides(sides);
    this.drawTop(top.inner, seed);

    // Bake. The frame is the room's projected bounds plus a margin for the void rings.
    const m = 4.5;
    const minX = projX(-m, room.h + m);
    const maxX = projX(room.w + m, -m);
    const minY = projY(-m, -m);
    const maxY = projY(room.w + m, room.h + m) + SLAB;
    const frame = new Rectangle(Math.floor(minX), Math.floor(minY), Math.ceil(maxX - minX), Math.ceil(maxY - minY));
    const res = Math.min(1.5, 4096 / Math.max(frame.width, frame.height));
    this.texture = renderer.generateTexture({ target: art, frame, resolution: res, antialias: true });
    art.destroy({ children: true });
    this.sprite = new Sprite(this.texture);
    this.sprite.position.set(frame.x, frame.y);
    stage.floor.addChild(this.sprite);

    // Pillar shadows on the decal layer, pillars as depth-sorted props.
    this.decal = new Graphics();
    for (const p of room.pillars) {
      this.decal.circle((p.x + 0.22) * T, (p.y + 0.22) * T, p.r * 1.25 * T).fill({ color: 0x000000, alpha: 0.28 });
    }
    stage.decals.addChild(this.decal);
    for (const p of room.pillars) {
      // a fixture's footprint is drawn by the fixture's own view
      if (p.fixture) continue;
      const g = new Graphics(pillarContext(theme, p.r));
      g.position.set(projX(p.x, p.y), projY(p.x, p.y));
      this.props.push(stage.depth.add(g, depthKey(p.x, p.y)));
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
    this.decal.destroy();
    for (const p of this.props) {
      this.stage.depth.remove(p);
      p.view.destroy();
    }
    this.props.length = 0;
  }

  /** Bathymetric rings: the measured land thins out into the void. */
  private drawVoid(g: Container, seed: number): void {
    const room = this.room;
    const gfx = new Graphics();
    const m = 4;
    const tiles: Array<[number, number]> = [];
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (isFloorTile(room, x, y)) tiles.push([x, y]);
    const noise = valueNoise(seed ^ 0x51ed);
    const fld = sampleField(-m, -m, room.w + m, room.h + m, 0.5, (x, y) => {
      let best = 1e9;
      for (const t of tiles) {
        const dx = Math.max(t[0] - x, 0, x - (t[0] + 1));
        const dy = Math.max(t[1] - y, 0, y - (t[1] + 1));
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      return Math.sqrt(best) + (noise(x * 0.45, y * 0.45) - 0.5) * 0.5;
    });
    const rings: Array<[number, number, number]> = [
      [0.75, 0.42, 0.05],
      [1.5, 0.3, 0.045],
      [2.4, 0.2, 0.04],
      [3.4, 0.11, 0.035],
    ];
    for (const [level, alpha, width] of rings) {
      // every other cell is skipped, which reads as a dashed line
      traceLevel(fld, level, (_cx, _cy, i, j) => (i + j) % 3 !== 0, (ax, ay, bx, by) => {
        gfx.moveTo(ax * T, ay * T).lineTo(bx * T, by * T);
      });
      gfx.stroke({ width: width * T, color: this.theme.contour, alpha, cap: 'round' });
    }
    g.addChild(gfx);
  }

  /** The slab's two camera-facing side faces, hatched like a section drawing. */
  private drawSides(parent: Container): void {
    const room = this.room;
    const th = this.theme;
    const g = new Graphics();
    const hatch = new Graphics();
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (!isFloorTile(room, x, y)) continue;
        if (!isFloorTile(room, x + 1, y)) {
          const ax = projX(x + 1, y), ay = projY(x + 1, y);
          const bx = projX(x + 1, y + 1), by = projY(x + 1, y + 1);
          g.poly([ax, ay, bx, by, bx, by + SLAB, ax, ay + SLAB]).fill(th.sideRight);
          for (let s = 0; s < 4; s++) {
            const u = (s + 0.5) / 4;
            hatch.moveTo(ax + (bx - ax) * u, ay + (by - ay) * u + 3).lineTo(ax + (bx - ax) * u, ay + (by - ay) * u + SLAB * 0.8);
          }
        }
        if (!isFloorTile(room, x, y + 1)) {
          const ax = projX(x, y + 1), ay = projY(x, y + 1);
          const bx = projX(x + 1, y + 1), by = projY(x + 1, y + 1);
          g.poly([ax, ay, bx, by, bx, by + SLAB, ax, ay + SLAB]).fill(th.sideLeft);
          for (let s = 0; s < 2; s++) {
            const u = (s + 0.5) / 2;
            hatch.moveTo(ax + (bx - ax) * u, ay + (by - ay) * u + 3).lineTo(ax + (bx - ax) * u, ay + (by - ay) * u + SLAB * 0.55);
          }
        }
      }
    }
    hatch.stroke({ width: 1.1, color: th.contour, alpha: 0.38, cap: 'round' });
    parent.addChild(g, hatch);
  }

  /** The walkable surface: wash, contour lines, grid ticks, boundary stones, neatline. */
  private drawTop(g: Container, seed: number): void {
    const room = this.room;
    const th = this.theme;
    const base = new Graphics();
    // Fill in horizontal runs with a hair of overlap so no seams show between tiles.
    const o = 0.012;
    for (let y = 0; y < room.h; y++) {
      let x = 0;
      while (x < room.w) {
        if (!isFloorTile(room, x, y)) {
          x++;
          continue;
        }
        let x2 = x;
        while (isFloorTile(room, x2 + 1, y)) x2++;
        base.rect((x - o) * T, (y - o) * T, (x2 - x + 1 + o * 2) * T, (1 + o * 2) * T);
        x = x2 + 1;
      }
    }
    base.fill(th.ground);
    g.addChild(base);

    // A soft darker wash toward the edges gives the sheet some body.
    const wash = new Graphics();
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (!isFloorTile(room, x, y)) continue;
        let edge = 0;
        for (let r = 1; r <= 2; r++) {
          if (!isFloorTile(room, x + r, y) || !isFloorTile(room, x - r, y) || !isFloorTile(room, x, y + r) || !isFloorTile(room, x, y - r)) {
            edge = r === 1 ? 1 : Math.max(edge, 0.5);
            if (r === 1) break;
          }
        }
        if (edge > 0) wash.rect((x - o) * T, (y - o) * T, (1 + o * 2) * T, (1 + o * 2) * T).fill({ color: th.groundDark, alpha: 0.5 * edge });
      }
    }
    g.addChild(wash);

    // Height field: mounds at pillars and stones on a gently tilted, noisy plain.
    const noise = valueNoise(seed);
    const height = (x: number, y: number): number => {
      let hgt = 0.22 * (x / room.w) + 0.16 * (y / room.h) + noise(x * 0.33, y * 0.33) * 0.62 + noise(x * 0.9, y * 0.9) * 0.12;
      for (const p of room.pillars) {
        const d2 = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
        hgt += 1.05 * Math.exp(-d2 / (2 * 1.5 * 1.5));
      }
      for (const s of room.stones) {
        const d2 = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
        hgt += 0.6 * Math.exp(-d2 / (2 * 1.0 * 1.0));
      }
      return hgt;
    };
    const cs = 0.25;
    const fld = sampleField(0, 0, room.w, room.h, cs, height);
    const onFloor = (cx: number, cy: number): boolean => isFloorTile(room, Math.floor(cx), Math.floor(cy));
    const minor = new Graphics();
    const major = new Graphics();
    const step = 0.11;
    for (let k = 1; k < 26; k++) {
      const level = k * step;
      const target = k % 4 === 0 ? major : minor;
      traceLevel(fld, level, onFloor, (ax, ay, bx, by) => {
        target.moveTo(ax * T, ay * T).lineTo(bx * T, by * T);
      });
    }
    minor.stroke({ width: 0.03 * T, color: th.contour, alpha: 0.6, cap: 'round' });
    major.stroke({ width: 0.05 * T, color: th.contourBright, alpha: 0.62, cap: 'round' });
    g.addChild(minor, major);

    // Survey grid ticks at tile corners that are fully inside the floor.
    const ticks = new Graphics();
    for (let y = 1; y < room.h; y++) {
      for (let x = 1; x < room.w; x++) {
        if (!isFloorTile(room, x, y) || !isFloorTile(room, x - 1, y) || !isFloorTile(room, x, y - 1) || !isFloorTile(room, x - 1, y - 1)) continue;
        const s = (x + y) % 4 === 0 ? 0.11 : 0.06;
        ticks.moveTo((x - s) * T, y * T).lineTo((x + s) * T, y * T).moveTo(x * T, (y - s) * T).lineTo(x * T, (y + s) * T);
      }
    }
    ticks.stroke({ width: 0.022 * T, color: th.highlight, alpha: 0.3 });
    g.addChild(ticks);

    // Boundary stones: flat benchmark glyphs.
    const marks = new Graphics();
    for (const st of room.stones) {
      const mx = st.x * T;
      const my = st.y * T;
      marks.circle(mx, my, 0.2 * T).stroke({ width: 0.035 * T, color: th.highlight, alpha: 0.85 });
      marks.circle(mx, my, 0.34 * T).stroke({ width: 0.02 * T, color: th.highlight, alpha: 0.4 });
      marks.circle(mx, my, 0.055 * T).fill({ color: th.highlight, alpha: 0.95 });
      marks
        .moveTo(mx - 0.48 * T, my).lineTo(mx - 0.26 * T, my)
        .moveTo(mx + 0.26 * T, my).lineTo(mx + 0.48 * T, my)
        .moveTo(mx, my - 0.48 * T).lineTo(mx, my - 0.26 * T)
        .moveTo(mx, my + 0.26 * T).lineTo(mx, my + 0.48 * T)
        .stroke({ width: 0.025 * T, color: th.highlight, alpha: 0.6 });
    }
    g.addChild(marks);

    // Neatline: the edge of the measured land.
    const edge = new Graphics();
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        if (!isFloorTile(room, x, y)) continue;
        if (!isFloorTile(room, x, y - 1)) edge.moveTo(x * T, y * T).lineTo((x + 1) * T, y * T);
        if (!isFloorTile(room, x, y + 1)) edge.moveTo(x * T, (y + 1) * T).lineTo((x + 1) * T, (y + 1) * T);
        if (!isFloorTile(room, x - 1, y)) edge.moveTo(x * T, y * T).lineTo(x * T, (y + 1) * T);
        if (!isFloorTile(room, x + 1, y)) edge.moveTo((x + 1) * T, y * T).lineTo((x + 1) * T, (y + 1) * T);
      }
    }
    edge.stroke({ width: 0.05 * T, color: th.highlight, alpha: 0.8, cap: 'square' });
    g.addChild(edge);
  }
}

export const SLAB_HEIGHT = SLAB;
export const ISO_TILE_W = ISO_COS * TILE * 2;
export const ISO_TILE_H = ISO_SIN * TILE * 2;
