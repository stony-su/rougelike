// Lightning. When a Tuning sends a bolt from one Echo to the next it is drawn as lightning
// should be: a jagged line in the storm's violet with a pale core, redrawn with new kinks a few
// times before it is gone.
import { Graphics } from 'pixi.js';
import { projX, projY } from '../../core/iso';
import { TONES } from '../palette/tones';
import type { ExtraFactory } from './index';

/** Bolts drawn at once. A new one takes over the oldest. */
const POOL = 10;
const LIFE = 0.22;
/** How high above the floor it jumps, in tiles. */
const HEIGHT = 0.6;

interface Arc {
  g: Graphics;
  age: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** The frame it was last drawn with new kinks. */
  drawn: number;
}

const arcs: ExtraFactory = ({ stage }) => {
  const pool: Arc[] = [];
  let next = 0;
  let frame = 0;
  for (let i = 0; i < POOL; i++) {
    const g = new Graphics();
    g.visible = false;
    stage.lines.addChild(g);
    pool.push({ g, age: LIFE, ax: 0, ay: 0, bx: 0, by: 0, drawn: -9 });
  }

  /** A jagged line between two points on the screen, with `kinks` corners thrown off the straight way. */
  const jag = (a: Arc, width: number, color: number, alpha: number, wander: number): void => {
    const x0 = projX(a.ax, a.ay);
    const y0 = projY(a.ax, a.ay, HEIGHT);
    const x1 = projX(a.bx, a.by);
    const y1 = projY(a.bx, a.by, HEIGHT);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const kinks = Math.max(3, Math.round(len / 26));
    a.g.moveTo(x0, y0);
    for (let k = 1; k < kinks; k++) {
      const t = k / kinks;
      const off = (Math.random() - 0.5) * wander;
      a.g.lineTo(x0 + (x1 - x0) * t + (-(y1 - y0) / len) * off, y0 + (y1 - y0) * t + ((x1 - x0) / len) * off);
    }
    a.g.lineTo(x1, y1).stroke({ width, color, alpha, cap: 'round', join: 'round' });
  };

  return {
    room() {
      for (const a of pool) {
        a.age = LIFE;
        a.g.visible = false;
      }
    },
    handle(ev) {
      if (ev.type !== 'bolt') return;
      const a = pool[next];
      next = (next + 1) % POOL;
      a.age = 0;
      a.ax = ev.fromX;
      a.ay = ev.fromY;
      a.bx = ev.toX;
      a.by = ev.toY;
      a.drawn = -9;
      a.g.visible = true;
    },
    update(dt) {
      frame++;
      const tone = TONES.storm;
      for (const a of pool) {
        if (a.age >= LIFE) continue;
        a.age += dt;
        if (a.age >= LIFE) {
          a.g.visible = false;
          continue;
        }
        // new kinks every third frame, so it crackles rather than shivers
        if (frame - a.drawn >= 3) {
          a.drawn = frame;
          a.g.clear();
          jag(a, 5, tone.color, 0.8, 22);
          jag(a, 2, tone.pale, 1, 12);
        }
        a.g.alpha = 1 - a.age / LIFE;
      }
    },
    destroy() {
      for (const a of pool) a.g.destroy();
      pool.length = 0;
    },
  };
};

export default arcs;
