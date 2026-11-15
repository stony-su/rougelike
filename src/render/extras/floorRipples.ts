// The world answers the play: everything that bounces leaves a ring spreading over the floor, in
// the colour of whoever sent it. The rings lie on the ground plane, so they are drawn as the
// flat ellipses the isometric view makes of circles.
import { Sprite } from 'pixi.js';
import { TILE } from '../../core/iso';
import { PLAYER_COLORS, RIM } from '../palette';
import type { ExtraFactory } from './index';

/** Rings alive at once. A new bounce takes over the oldest. */
const POOL = 28;
/** The radius of the ring inside its texture, in the texture's own pixels (see Textures.ring). */
const RING_RADIUS = 58;

interface Ring {
  sprite: Sprite;
  age: number;
  life: number;
  /** How far it spreads, in tiles. */
  reach: number;
}

const floorRipples: ExtraFactory = ({ stage, textures }) => {
  const rings: Ring[] = [];
  let next = 0;
  for (let i = 0; i < POOL; i++) {
    const sprite = new Sprite(textures.ring);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.visible = false;
    stage.decals.addChild(sprite);
    rings.push({ sprite, age: 0, life: 0, reach: 0 });
  }

  /** `strength` 0..1: a glancing ricochet is a small quick ring, a wall slam a wide slow one. */
  const drop = (x: number, y: number, by: number, strength: number): void => {
    const k = Math.max(0.15, Math.min(1, strength));
    const r = rings[next];
    next = (next + 1) % POOL;
    r.age = 0;
    r.life = 0.35 + 0.4 * k;
    r.reach = 0.7 + 1.9 * k;
    r.sprite.position.set(x * TILE, y * TILE);
    r.sprite.tint = PLAYER_COLORS[by] ?? RIM;
    r.sprite.visible = true;
  };

  return {
    room() {
      for (const r of rings) {
        r.life = 0;
        r.sprite.visible = false;
      }
    },
    handle(ev) {
      switch (ev.type) {
        case 'ricochet':
          drop(ev.x, ev.y, ev.by, 0.3 + 0.15 * ev.n);
          break;
        case 'reflect':
          drop(ev.x, ev.y, ev.player, ev.perfect ? 1 : 0.55);
          break;
        case 'wallSlam':
          drop(ev.x, ev.y, ev.by, ev.speed / 20);
          break;
        case 'carom':
          drop(ev.x, ev.y, ev.by, ev.speed / 18);
          break;
        case 'breakSlam':
          drop(ev.x, ev.y, ev.player, 1);
          break;
        case 'whirl':
          drop(ev.x, ev.y, ev.player, 0.9);
          break;
        case 'bombBurst':
          drop(ev.x, ev.y, ev.by, 0.9);
          break;
        default:
          break;
      }
    },
    update(dt) {
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) {
          r.life = 0;
          r.sprite.visible = false;
          continue;
        }
        // fast at first, then easing out, like a ring on water
        const spread = 1 - (1 - k) * (1 - k);
        r.sprite.scale.set(((0.2 + spread * r.reach) * TILE) / RING_RADIUS);
        r.sprite.alpha = (1 - k) * 0.75;
      }
    },
    destroy() {
      for (const r of rings) r.sprite.destroy();
      rings.length = 0;
    },
  };
};

export default floorRipples;
