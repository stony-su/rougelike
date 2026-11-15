// What stands in a camp: the Still Pool, rings spreading on its water where the chamber's focus
// is, and the Tuner's stall beyond it: a great tuning fork on the chamber's one post, humming,
// with a lamp hung from it and a cloth laid out in front for the shelf. All of it shapes made by
// loops: rings, capsules and diamonds.
import { Container, Graphics } from 'pixi.js';
import { TILE, projX, projY } from '../../core/iso';
import type { World } from '../../sim/types';
import { RIM } from '../palette';
import { CAMP_LOOK } from '../palette/camp';
import type { Sortable } from '../depth';
import type { ExtraFactory } from './index';

/** How high the top of a post is, in tiles: the fork stands on it. */
const TOP = 0.95;
/** The Still Pool's radius, in tiles. */
const POOL = 1.7;

const camp: ExtraFactory = ({ stage }) => {
  let built = false;
  let rim = RIM;
  const pool = new Graphics();
  const rings = new Graphics();
  const cloth = new Graphics();
  const stall = new Container();
  const fork = new Graphics();
  const lamp = new Graphics();
  const halo = new Graphics();
  let sorted: Sortable | null = null;

  const drop = (): void => {
    if (!built) return;
    built = false;
    for (const g of [pool, rings, cloth, halo]) g.parent?.removeChild(g);
    if (sorted) stage.depth.remove(sorted);
    sorted = null;
  };

  const build = (w: World): void => {
    built = true;
    const at = w.room.rewardSpot;
    // the pool: a stone rim round still water, on the ground plane
    pool.clear();
    pool.circle(0, 0, POOL * TILE).fill(rim);
    pool.circle(0, 0, (POOL - 0.16) * TILE).fill(CAMP_LOOK.waterDeep);
    pool.circle(0, 0, (POOL - 0.5) * TILE).fill({ color: CAMP_LOOK.water, alpha: 0.85 });
    pool.position.set(at.x * TILE, at.y * TILE);
    rings.position.set(at.x * TILE, at.y * TILE);
    stage.decals.addChild(pool, rings);

    // the stall stands on the chamber's post, beyond the pool
    const post = w.room.geo.circles[0] ?? { x: at.x - 4, y: at.y - 4 };
    // a cloth before it, with three places for the shelf
    cloth.clear();
    const cx = (post.x + 1.35) * TILE;
    const cy = (post.y + 1.35) * TILE;
    cloth.roundRect(-1.25 * TILE, -0.55 * TILE, 2.5 * TILE, 1.1 * TILE, 10).fill({ color: CAMP_LOOK.cloth, alpha: 0.9 });
    cloth.roundRect(-1.25 * TILE, -0.55 * TILE, 2.5 * TILE, 1.1 * TILE, 10).stroke({ width: 3, color: CAMP_LOOK.clothEdge, alpha: 0.8 });
    for (const k of [-0.75, 0, 0.75]) cloth.poly([k * TILE, -14, k * TILE + 14, 0, k * TILE, 14, k * TILE - 14, 0]).fill({ color: CAMP_LOOK.brassHot, alpha: 0.85 });
    cloth.position.set(cx, cy);
    cloth.rotation = -Math.PI / 4;
    stage.decals.addChild(cloth);

    // the fork: a stem on the post, a yoke, two prongs; a lamp on an arm to one side
    const up = (z: number): number => -z * TILE;
    fork.clear();
    const stem = { width: 13, color: CAMP_LOOK.brassShade, cap: 'round' as const };
    const face = { width: 7, color: CAMP_LOOK.brass, cap: 'round' as const };
    for (const pen of [stem, face]) {
      fork
        .moveTo(0, up(TOP))
        .lineTo(0, up(1.6))
        .moveTo(-22, up(3.5))
        .lineTo(-22, up(2.0))
        .quadraticCurveTo(-22, up(1.6), 0, up(1.6))
        .quadraticCurveTo(22, up(1.6), 22, up(2.0))
        .lineTo(22, up(3.5))
        .stroke(pen);
    }
    fork.moveTo(0, up(1.3)).lineTo(34, up(1.5)).lineTo(34, up(1.36)).stroke({ width: 3, color: CAMP_LOOK.brassShade, cap: 'round' });
    lamp.clear();
    lamp.poly([34, up(1.36), 42, up(1.2), 34, up(1.04), 26, up(1.2)]).fill(CAMP_LOOK.lamp);
    lamp.poly([34, up(1.36), 42, up(1.2), 34, up(1.04), 26, up(1.2)]).stroke({ width: 1.5, color: CAMP_LOOK.brassShade, alpha: 0.9 });
    stall.removeChildren();
    stall.addChild(fork, lamp);
    stall.position.set(projX(post.x, post.y), projY(post.x, post.y, 0));
    // just in front of the post it stands on
    sorted = stage.depth.add(stall, post.x + post.y, 0.02);

    halo.clear();
    halo.circle(0, 0, 46).fill({ color: CAMP_LOOK.lamp, alpha: 0.5 });
    halo.position.set(stall.x + 34, stall.y + up(1.2));
    stage.fxGlow.addChild(halo);
  };

  return {
    room(_room, theme) {
      drop();
      rim = theme.wallTop;
    },
    update(_dt, w, _alpha, time) {
      const here = w.flow.kind === 'camp';
      if (here !== built) {
        if (here) build(w);
        else drop();
      }
      if (!built) return;
      // rings on the water: three, each spreading and fading as the next begins
      rings.clear();
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.28 + i / 3) % 1;
        rings.circle(0, 0, (0.15 + k * (POOL - 0.7)) * TILE).stroke({ width: 3, color: CAMP_LOOK.ring, alpha: 0.55 * (1 - k) });
      }
      // the fork hums, and the lamp breathes
      fork.scale.x = 1 + 0.012 * Math.sin(time * 46);
      halo.alpha = 0.7 + 0.3 * Math.sin(time * 2.1);
    },
    destroy() {
      drop();
      for (const g of [pool, rings, cloth, halo, fork, lamp]) g.destroy();
      stall.destroy();
    },
  };
};

export default camp;
