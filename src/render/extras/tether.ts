// The tether between the two of a Tethered pair: a taut danger-coloured line from one to the
// other, so it is plain that launching one will drag its partner along.
import { Graphics } from 'pixi.js';
import { projX, projY } from '../../core/iso';
import { DANGER } from '../palette';
import type { ExtraFactory } from './index';

/** How high above the floor the tether hangs, in tiles. */
const HEIGHT = 0.45;

const tether: ExtraFactory = ({ stage }) => {
  const g = new Graphics();
  stage.lines.addChild(g);
  let drawn = false;
  return {
    room() {
      g.clear();
      drawn = false;
    },
    update(_dt, w, alpha, time) {
      let any = false;
      for (const e of w.enemies) {
        // each pair once: the one with the lower id draws it
        if (e.dead || e.mate <= e.id) continue;
        const m = w.enemies.find((o) => o.id === e.mate);
        if (!m || m.dead) continue;
        if (!any) g.clear();
        any = true;
        const ax = e.px + (e.x - e.px) * alpha;
        const ay = e.py + (e.y - e.py) * alpha;
        const bx = m.px + (m.x - m.px) * alpha;
        const by = m.py + (m.y - m.py) * alpha;
        // it sags a little in the middle, and shivers
        const sag = 0.12 + 0.03 * Math.sin(time * 9 + e.seed * 6);
        g.moveTo(projX(ax, ay), projY(ax, ay, HEIGHT))
          .quadraticCurveTo(projX((ax + bx) / 2, (ay + by) / 2), projY((ax + bx) / 2, (ay + by) / 2, HEIGHT - sag), projX(bx, by), projY(bx, by, HEIGHT))
          .stroke({ width: 2.5, color: DANGER, alpha: 0.85 });
      }
      if (!any && drawn) g.clear();
      drawn = any;
    },
    destroy() {
      g.destroy();
    },
  };
};

export default tether;
