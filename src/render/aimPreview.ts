// The Bow's aim preview: the path an arrow loosed now would take, through its first two bounces.
// It is traced by the simulation's own shot code from the same quantised aim the next input
// carries, so the line drawn is the line flown.
import { Graphics } from 'pixi.js';
import { TILE } from '../core/iso';
import { previewArrow } from '../sim/preview';
import type { Player, World } from '../sim/types';
import { PLAYER_COLORS, PLAYER_PALE, RIM } from './palette';
import type { Stage } from './stage';

const T = TILE;
/** How much of the last leg is drawn, in tiles: enough to show which way it leaves the second bounce. */
const TAIL = 3.5;
const DASH = 0.34;
const GAP = 0.22;

export class AimPreview {
  private readonly g = new Graphics();
  private readonly path: number[] = [];

  constructor(stage: Stage) {
    stage.decals.addChild(this.g);
  }

  /**
   * Draw the preview for a Bow player, aiming along `angle` (radians). Nothing is drawn for the
   * other classes, for a player who is down, or while the chamber has nothing to shoot at.
   */
  update(w: World, p: Player | undefined, angle: number, time: number): void {
    const g = this.g;
    g.clear();
    if (!p || p.classId !== 'bow' || p.state === 'down' || p.state === 'dash') return;
    previewArrow(w, p, angle, 2, this.path);
    const pts = this.path;
    const legs = pts.length / 2 - 1;
    if (legs < 1) return;
    const color = PLAYER_COLORS[p.slot] ?? RIM;
    const pale = PLAYER_PALE[p.slot] ?? RIM;
    // dashes that drift along the path, so its direction reads at a glance
    let travelled = (time * 1.6) % (DASH + GAP);
    for (let i = 0; i < legs; i++) {
      const ax = pts[i * 2];
      const ay = pts[i * 2 + 1];
      let bx = pts[i * 2 + 2];
      let by = pts[i * 2 + 3];
      let len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const last = i === legs - 1;
      // the leg after the second bounce is only hinted at
      if (i >= 2 && len > TAIL) {
        len = TAIL;
        bx = ax + ux * len;
        by = ay + uy * len;
      }
      // each bounce dims the line a little; the first leg starts clear of the archer
      const alpha = i === 0 ? 0.85 : i === 1 ? 0.6 : 0.38;
      let d = i === 0 ? 0.55 - travelled : -travelled;
      while (d < len) {
        const from = Math.max(d, i === 0 ? 0.55 : 0);
        const to = Math.min(d + DASH, len);
        if (to > from) {
          g.moveTo((ax + ux * from) * T, (ay + uy * from) * T)
            .lineTo((ax + ux * to) * T, (ay + uy * to) * T)
            .stroke({ width: 3, color, alpha, cap: 'round' });
        }
        d += DASH + GAP;
      }
      travelled = (travelled + len) % (DASH + GAP);
      if (!last || i < 2) {
        // a ring where it turns
        g.circle(bx * T, by * T, 5).stroke({ width: 2, color: pale, alpha: alpha * 0.9 });
      }
    }
  }

  clear(): void {
    this.g.clear();
  }

  destroy(): void {
    this.g.destroy();
  }
}
