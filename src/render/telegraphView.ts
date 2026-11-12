// Draws the simulation's telegraphs on the floor in the danger colour.
// Each shape is built once; a faint outline shows the full area and an inner fill grows to meet
// it as the wind-up runs out, so the player can read both where and when.
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { TILE } from '../core/iso';
import type { Telegraph, World } from '../sim/types';
import { DANGER, DANGER_HOT } from './palette';
import type { Stage } from './stage';

const T = TILE;

interface Shapes {
  outline: GraphicsContext;
  fill: GraphicsContext;
}

const cache = new Map<string, Shapes>();

function shapesFor(t: Telegraph): Shapes {
  const key = `${t.shape}:${t.radius}:${t.length}:${t.width}:${t.halfArc}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const outline = new GraphicsContext();
  const fill = new GraphicsContext();
  const stroke = { width: 3, color: 0xffffff, alpha: 1, join: 'round' as const };
  if (t.shape === 'circle') {
    const r = t.radius * T;
    outline.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.1 }).circle(0, 0, r).stroke(stroke);
    fill.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.3 });
  } else if (t.shape === 'lane') {
    const l = t.length * T;
    const hw = (t.width * T) / 2;
    outline.rect(0, -hw, l, hw * 2).fill({ color: 0xffffff, alpha: 0.1 }).rect(0, -hw, l, hw * 2).stroke(stroke);
    // chevrons along the lane show its direction
    for (let x = l * 0.25; x < l; x += l * 0.25) {
      outline.moveTo(x - hw * 0.5, -hw * 0.6).lineTo(x, 0).lineTo(x - hw * 0.5, hw * 0.6);
    }
    outline.stroke({ width: 2, color: 0xffffff, alpha: 0.55, join: 'round', cap: 'round' });
    fill.rect(0, -hw, l, hw * 2).fill({ color: 0xffffff, alpha: 0.3 });
  } else {
    const r = t.radius * T;
    const wedge = (g: GraphicsContext): GraphicsContext => g.moveTo(0, 0).arc(0, 0, r, -t.halfArc, t.halfArc).closePath();
    wedge(outline).fill({ color: 0xffffff, alpha: 0.1 });
    wedge(outline).stroke(stroke);
    wedge(fill).fill({ color: 0xffffff, alpha: 0.3 });
  }
  const s = { outline, fill };
  cache.set(key, s);
  return s;
}

interface View {
  c: Container;
  outline: Graphics;
  fill: Graphics;
  shape: Telegraph['shape'];
  seen: number;
}

export class TelegraphViews {
  private readonly views = new Map<number, View>();
  private frame = 0;

  constructor(private readonly stage: Stage) {}

  update(w: World): void {
    this.frame++;
    for (const t of w.telegraphs) {
      let v = this.views.get(t.id);
      if (!v) {
        const s = shapesFor(t);
        const c = new Container();
        const outline = new Graphics(s.outline);
        const fill = new Graphics(s.fill);
        outline.tint = DANGER;
        fill.tint = DANGER;
        c.addChild(outline, fill);
        this.stage.decals.addChild(c);
        v = { c, outline, fill, shape: t.shape, seen: this.frame };
        this.views.set(t.id, v);
      }
      v.seen = this.frame;
      v.c.position.set(t.x * T, t.y * T);
      v.c.rotation = t.shape === 'circle' ? 0 : t.angle;
      const k = Math.min(1, t.t / t.dur);
      if (t.t < t.dur) {
        // The fill grows to meet the outline exactly when the attack lands.
        const e = k * k;
        if (t.shape === 'lane') v.fill.scale.set(e, 1);
        else v.fill.scale.set(e);
        v.fill.tint = DANGER;
        v.fill.alpha = 0.55 + 0.45 * k;
        // The outline pulses faster as time runs out.
        v.outline.alpha = 0.55 + 0.45 * Math.abs(Math.sin(t.t * (7 + 14 * k)));
        v.c.alpha = Math.min(1, t.t / 0.06);
      } else {
        // The hit: a hot flash that fades.
        const f = Math.max(0, 1 - (t.t - t.dur) / 0.12);
        v.fill.scale.set(1);
        v.fill.tint = DANGER_HOT;
        v.fill.alpha = 1;
        v.outline.alpha = 1;
        v.c.alpha = f;
      }
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frame) continue;
      v.c.destroy({ children: true });
      this.views.delete(id);
    }
  }

  clear(): void {
    for (const v of this.views.values()) v.c.destroy({ children: true });
    this.views.clear();
  }
}
