// The traps in the floor, drawn so that each can be told from plain ground before it does
// anything: a plate is a dark square studded with holes, and its spikes are bright while they
// are up; a knell wears a ring on the floor that tightens as its toll comes round; a thorn pipe
// carries a short barrel that turns with its aim.
import { Graphics } from 'pixi.js';
import { TILE, projX, projY } from '../../core/iso';
import type { Trap } from '../../sim/types';
import { DANGER, DANGER_HOT, RIM } from '../palette';
import type { ExtraFactory } from './index';

/** How high the top of a post is, in tiles: where a knell's cap and a pipe's barrel are drawn. */
const TOP = 0.95;

interface View {
  id: number;
  /** On the ground plane: the plate, or the ring round a knell. */
  ground: Graphics;
  /** Upright, over the post: a knell's cap, a pipe's barrel. */
  cap: Graphics;
  state: string;
  /** Seconds since its last strike, for the spikes that stay up a moment. */
  since: number;
}

const traps: ExtraFactory = ({ stage }) => {
  let views: View[] = [];
  let deep = RIM;

  const drop = (): void => {
    for (const v of views) {
      v.ground.destroy();
      v.cap.destroy();
    }
    views = [];
  };

  const make = (t: Trap): View => {
    const ground = new Graphics();
    ground.position.set(t.x * TILE, t.y * TILE);
    const cap = new Graphics();
    cap.position.set(projX(t.x, t.y), projY(t.x, t.y, TOP));
    stage.decals.addChild(ground);
    stage.fxCrisp.addChild(cap);
    const h = TILE / 2;
    if (t.kind === 'spikes') {
      // a plate: a dark square, a rim, and the holes the spikes come out of
      ground.rect(-h + 3, -h + 3, TILE - 6, TILE - 6).fill({ color: 0x000000, alpha: 0.4 });
      ground.rect(-h + 3, -h + 3, TILE - 6, TILE - 6).stroke({ width: 2, color: deep, alpha: 0.9 });
      for (const [x, y] of [
        [-0.25, -0.25],
        [0.25, -0.25],
        [0, 0],
        [-0.25, 0.25],
        [0.25, 0.25],
      ]) {
        ground.circle(x * TILE, y * TILE, 4).fill({ color: 0x000000, alpha: 0.55 });
      }
    } else if (t.kind === 'knell') {
      cap.poly([0, -16, 9, -4, 0, 4, -9, -4]).fill(DANGER);
      cap.poly([0, -16, 9, -4, 0, 4, -9, -4]).stroke({ width: 1.5, color: RIM, alpha: 0.9 });
    } else {
      cap.roundRect(0, -4, 22, 8, 3).fill(DANGER);
      cap.circle(0, 0, 7).fill(RIM);
    }
    return { id: t.id, ground, cap, state: '', since: 9 };
  };

  return {
    room(_room, theme) {
      drop();
      deep = theme.accent;
    },
    handle(ev) {
      if (ev.type !== 'trapStrike') return;
      for (const v of views) if (v.id === ev.id) v.since = 0;
    },
    update(dt, w, _alpha, time) {
      if (views.length !== w.traps.length || (w.traps.length > 0 && views[0].id !== w.traps[0].id)) {
        drop();
        views = w.traps.map(make);
      }
      w.traps.forEach((t, i) => {
        const v = views[i];
        v.since += dt;
        if (t.kind === 'spikes') {
          // the spikes themselves: bright diamonds on the plate while they are up, dim holes otherwise
          const up = v.since < 0.35;
          const key = up ? 'up' : t.state;
          if (key !== v.state) {
            v.state = key;
            v.cap.clear();
            if (up) {
              for (const [x, y] of [
                [-0.25, -0.25],
                [0.25, -0.25],
                [0, 0],
                [-0.25, 0.25],
                [0.25, 0.25],
              ]) {
                const sx = projX(x, y);
                const sy = projY(x, y, 0) + TOP * TILE;
                v.cap.poly([sx, sy - 26, sx + 5, sy - 2, sx - 5, sy - 2]).fill(DANGER_HOT);
              }
            }
          }
          v.ground.alpha = t.state === 'warn' ? 0.75 + 0.25 * Math.sin(time * 40) : 0.85;
        } else if (t.kind === 'knell') {
          // a ring on the floor that tightens and brightens as the toll comes round
          const soon = t.state === 'warn' ? 1 : Math.max(0, 1 - t.t / 1.6);
          v.ground.clear();
          v.ground.circle(0, 0, (0.75 + 0.5 * (1 - soon)) * TILE).stroke({ width: 2, color: DANGER, alpha: 0.25 + 0.6 * soon });
          v.cap.scale.set(1 + 0.25 * soon * (0.5 + 0.5 * Math.sin(time * 18)));
        } else {
          // the barrel points where it aims, flattened as everything on the floor is
          v.cap.rotation = Math.atan2((Math.cos(t.angle) + Math.sin(t.angle)) * 0.5, (Math.cos(t.angle) - Math.sin(t.angle)) * 0.866);
          v.cap.alpha = t.state === 'warn' ? 1 : 0.7;
        }
      });
    },
    destroy() {
      drop();
    },
  };
};

export default traps;
