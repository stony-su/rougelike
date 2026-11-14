// Ribbon trails. Anything a player has sent on its way leaves one in that player's colour: an
// arrow, a returned shot, a batted bomb, a launched body. A trail is a short history of points
// drawn as one tapering ribbon; the corner of a bounce is put in exactly, so a ricochet reads as
// a crisp angle rather than a cut corner.
import { Graphics } from 'pixi.js';
import { projX, projY } from '../core/iso';
import type { Stage } from './stage';

const MAX_TRAILS = 64;
const MAX_POINTS = 18;

interface Trail {
  id: number;
  /** Screen points, oldest first, with the time each was laid. */
  xs: number[];
  ys: number[];
  ts: number[];
  color: number;
  pale: number;
  width: number;
  life: number;
  /** Time it was last fed; a trail nobody feeds fades out on its own. */
  touched: number;
}

export class Trails {
  private readonly trails = new Map<number, Trail>();
  private readonly glow = new Graphics();
  private readonly core = new Graphics();
  private time = 0;

  constructor(stage: Stage) {
    stage.fxGlow.addChild(this.glow);
    this.core.blendMode = 'add';
    stage.fxCrisp.addChildAt(this.core, 0);
  }

  /**
   * Feed a trail this frame. `width` is in pixels at zoom 1, `life` how long a point lasts.
   * A new id starts a new trail.
   */
  touch(id: number, x: number, y: number, z: number, color: number, pale: number, width: number, life: number): void {
    let t = this.trails.get(id);
    if (!t) {
      if (this.trails.size >= MAX_TRAILS) return;
      t = { id, xs: [], ys: [], ts: [], color, pale, width, life, touched: this.time };
      this.trails.set(id, t);
    }
    t.color = color;
    t.pale = pale;
    t.width = width;
    t.life = life;
    t.touched = this.time;
    this.push(t, projX(x, y), projY(x, y, z));
  }

  /** Put the exact point of a bounce into a trail, if it has one. */
  corner(id: number, x: number, y: number, z: number): void {
    const t = this.trails.get(id);
    if (t) this.push(t, projX(x, y), projY(x, y, z));
  }

  private push(t: Trail, sx: number, sy: number): void {
    const n = t.xs.length;
    if (n > 0 && Math.abs(t.xs[n - 1] - sx) + Math.abs(t.ys[n - 1] - sy) < 0.5) return;
    t.xs.push(sx);
    t.ys.push(sy);
    t.ts.push(this.time);
    if (t.xs.length > MAX_POINTS) {
      t.xs.shift();
      t.ys.shift();
      t.ts.shift();
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.glow.clear();
    this.core.clear();
    for (const [id, t] of this.trails) {
      // drop points that have outlived the trail
      while (t.ts.length > 0 && this.time - t.ts[0] > t.life) {
        t.xs.shift();
        t.ys.shift();
        t.ts.shift();
      }
      if (t.xs.length < 2) {
        if (this.time - t.touched > t.life) this.trails.delete(id);
        continue;
      }
      this.ribbon(this.glow, t, t.width, t.color, 0.75);
      this.ribbon(this.core, t, t.width * 0.34, t.pale, 0.8);
    }
  }

  /** One tapering ribbon along a trail: full width at the newest point, nothing at the oldest. */
  private ribbon(g: Graphics, t: Trail, width: number, color: number, alpha: number): void {
    const n = t.xs.length;
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < n; i++) {
      const ax = t.xs[Math.max(0, i - 1)];
      const ay = t.ys[Math.max(0, i - 1)];
      const bx = t.xs[Math.min(n - 1, i + 1)];
      const by = t.ys[Math.min(n - 1, i + 1)];
      let nx = -(by - ay);
      let ny = bx - ax;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const age = (this.time - t.ts[i]) / t.life;
      const w = (width / 2) * Math.max(0, 1 - age);
      left.push(t.xs[i] + nx * w, t.ys[i] + ny * w);
      right.push(t.xs[i] - nx * w, t.ys[i] - ny * w);
    }
    const pts = left;
    for (let i = n - 1; i >= 0; i--) pts.push(right[i * 2], right[i * 2 + 1]);
    g.poly(pts).fill({ color, alpha });
  }

  clear(): void {
    this.trails.clear();
    this.glow.clear();
    this.core.clear();
  }

  destroy(): void {
    this.glow.destroy();
    this.core.destroy();
  }

  get count(): number {
    return this.trails.size;
  }
}
