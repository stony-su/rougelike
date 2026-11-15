// The Hook Shot's line: from the Bow's hand to where it is made fast, taut and bright, with a
// barb at its end. While the line flies it runs out from the Bow to its mark; while the Bow is
// pulled it shortens; once the Bow has landed it is gone in a blink.
import { Graphics } from 'pixi.js';
import { projX, projY } from '../../core/iso';
import { HOOK } from '../../sim/tuning';
import { PLAYER_COLORS, RIM, WHITE } from '../palette';
import type { ExtraFactory } from './index';

/** How high above the floor the line runs, in tiles: the height of a hand. */
const HEIGHT = 0.55;
/** Seconds the line takes to fade once the Bow has let go of it. */
const FADE = 0.12;
/** The barb at the end of the line, in pixels: how long it is, and how wide. */
const BARB = { long: 13, wide: 6 };

interface Line {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 1 while the Bow is on it; falling to 0 after. */
  fade: number;
  live: boolean;
}

const hookLine: ExtraFactory = ({ stage }) => {
  const g = new Graphics();
  stage.lines.addChild(g);
  const lines = new Map<number, Line>();
  let drawn = false;

  return {
    room() {
      g.clear();
      lines.clear();
      drawn = false;
    },
    update(dt, w, alpha) {
      for (const l of lines.values()) l.live = false;
      for (const p of w.players) {
        if (p.classId !== 'bow' || p.state !== 'special') continue;
        let l = lines.get(p.slot);
        if (!l) {
          l = { ax: 0, ay: 0, bx: 0, by: 0, fade: 0, live: false };
          lines.set(p.slot, l);
        }
        l.ax = p.px + (p.x - p.px) * alpha;
        l.ay = p.py + (p.y - p.py) * alpha;
        // while it flies the line runs out from the Bow to its mark
        const out = Math.min(1, (p.stateTime + alpha / 60) / HOOK.windup);
        l.bx = l.ax + (p.hookX - l.ax) * out;
        l.by = l.ay + (p.hookY - l.ay) * out;
        l.fade = 1;
        l.live = true;
      }
      let any = false;
      for (const [slot, l] of lines) {
        if (!l.live) l.fade -= dt / FADE;
        if (l.fade <= 0) continue;
        if (!any) g.clear();
        any = true;
        const color = PLAYER_COLORS[slot] ?? RIM;
        const sx = projX(l.ax, l.ay);
        const sy = projY(l.ax, l.ay, HEIGHT);
        const ex = projX(l.bx, l.by);
        const ey = projY(l.bx, l.by, HEIGHT);
        g.moveTo(sx, sy)
          .lineTo(ex, ey)
          .stroke({ width: 5, color, alpha: 0.45 * l.fade, cap: 'round' });
        g.moveTo(sx, sy)
          .lineTo(ex, ey)
          .stroke({ width: 1.8, color: WHITE, alpha: 0.95 * l.fade, cap: 'round' });
        // the barb, turned along the line
        const d = Math.hypot(ex - sx, ey - sy);
        if (d < 1) continue;
        const ux = (ex - sx) / d;
        const uy = (ey - sy) / d;
        g.poly([
          ex + ux * BARB.long * 0.5,
          ey + uy * BARB.long * 0.5,
          ex - ux * BARB.long * 0.5 - uy * BARB.wide,
          ey - uy * BARB.long * 0.5 + ux * BARB.wide,
          ex - ux * BARB.long * 0.2,
          ey - uy * BARB.long * 0.2,
          ex - ux * BARB.long * 0.5 + uy * BARB.wide,
          ey - uy * BARB.long * 0.5 - ux * BARB.wide,
        ]).fill({ color: WHITE, alpha: l.fade });
      }
      if (!any && drawn) g.clear();
      drawn = any;
    },
    destroy() {
      g.destroy();
      lines.clear();
    },
  };
};

export default hookLine;
