// What stands in a camp: the Healing Pool, rings spreading on its water where the chamber's focus
// is, and the Merchant's stall beyond it: a striped awning on two poles over the chamber's one
// post, which is its counter, with wares on it, a lamp hung from the awning and a cloth laid out
// in front for the shelf. All of it shapes made by loops: rings, bands and diamonds.
import { Container, Graphics } from 'pixi.js';
import { TILE, projX, projY } from '../../core/iso';
import type { World } from '../../sim/types';
import { RIM } from '../palette';
import { CAMP_LOOK } from '../palette/camp';
import type { Sortable } from '../depth';
import type { ExtraFactory } from './index';

/** How high the top of a post is, in tiles: it is the stall's counter. */
const TOP = 0.95;
/** The stall: how far its poles stand to either side (pixels), how high the awning hangs and how high it rises (tiles), and its stripes. */
const STALL = { pole: 40, eave: 2.15, ridge: 2.75, stripes: 6 };
/** The Still Pool's radius, in tiles. */
const POOL = 1.7;

const camp: ExtraFactory = ({ stage }) => {
  let built = false;
  let rim = RIM;
  const pool = new Graphics();
  const rings = new Graphics();
  const cloth = new Graphics();
  const stall = new Container();
  const booth = new Graphics();
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

    // the stall: two poles, a striped awning with a scalloped edge, and wares on the counter
    const up = (z: number): number => -z * TILE;
    booth.clear();
    for (const side of [-1, 1]) {
      booth
        .moveTo(side * STALL.pole, 0)
        .lineTo(side * STALL.pole, up(STALL.eave))
        .stroke({ width: 7, color: CAMP_LOOK.brassShade, cap: 'round' });
      booth
        .moveTo(side * STALL.pole - 2, 0)
        .lineTo(side * STALL.pole - 2, up(STALL.eave))
        .stroke({ width: 2.5, color: CAMP_LOOK.brass, cap: 'round' });
    }
    const eave = STALL.pole + 12;
    const ridge = STALL.pole - 4;
    for (let i = 0; i < STALL.stripes; i++) {
      const a = i / STALL.stripes;
      const b = (i + 1) / STALL.stripes;
      const color = i % 2 === 0 ? CAMP_LOOK.cloth : CAMP_LOOK.clothEdge;
      // one band of the awning, wider at the eave than at the ridge
      booth.poly([-eave + a * eave * 2, up(STALL.eave), -eave + b * eave * 2, up(STALL.eave), -ridge + b * ridge * 2, up(STALL.ridge), -ridge + a * ridge * 2, up(STALL.ridge)]).fill(color);
      // and its scallop, hanging below
      const mid = -eave + (a + b) * eave;
      booth.poly([-eave + a * eave * 2, up(STALL.eave), -eave + b * eave * 2, up(STALL.eave), mid, up(STALL.eave) + 11]).fill(color);
    }
    booth.moveTo(-ridge, up(STALL.ridge)).lineTo(ridge, up(STALL.ridge)).stroke({ width: 3, color: CAMP_LOOK.brassHot, cap: 'round' });
    // wares on the counter: three bright things in a row
    for (const k of [-14, 0, 14]) booth.poly([k, up(TOP) - 16, k + 6, up(TOP) - 9, k, up(TOP) - 2, k - 6, up(TOP) - 9]).fill(CAMP_LOOK.brassHot);
    // the lamp, on a cord from the eave
    const hang = STALL.pole - 12;
    booth
      .moveTo(hang, up(STALL.eave))
      .lineTo(hang, up(STALL.eave - 0.32))
      .stroke({ width: 2, color: CAMP_LOOK.brassShade });
    lamp.clear();
    const ly = up(STALL.eave - 0.5);
    lamp.poly([hang, ly - 9, hang + 8, ly, hang, ly + 9, hang - 8, ly]).fill(CAMP_LOOK.lamp);
    lamp.poly([hang, ly - 9, hang + 8, ly, hang, ly + 9, hang - 8, ly]).stroke({ width: 1.5, color: CAMP_LOOK.brassShade, alpha: 0.9 });
    stall.removeChildren();
    stall.addChild(booth, lamp);
    stall.position.set(projX(post.x, post.y), projY(post.x, post.y, 0));
    // just in front of the post it stands on
    sorted = stage.depth.add(stall, post.x + post.y, 0.02);

    halo.clear();
    halo.circle(0, 0, 46).fill({ color: CAMP_LOOK.lamp, alpha: 0.5 });
    halo.position.set(stall.x + hang, stall.y + ly);
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
      // the lamp breathes
      halo.alpha = 0.7 + 0.3 * Math.sin(time * 2.1);
    },
    destroy() {
      drop();
      for (const g of [pool, rings, cloth, halo, booth, lamp]) g.destroy();
      stall.destroy();
    },
  };
};

export default camp;
