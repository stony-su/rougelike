// Projectiles on screen. An enemy's shot is a hot streak in the danger colour; a shot that
// belongs to a player wears that player's colour, so the moment one is turned it reads as theirs.
import { Container, Sprite } from 'pixi.js';
import { ISO_COS, ISO_SIN, depthKey, projX, projY } from '../core/iso';
import { lerp } from '../core/math';
import type { Projectile, World } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER, DANGER_HOT, PLAYER_COLORS, RIM, RIPE } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

/** Height above the floor at which shots fly, in tiles. */
const FLY_Z = 0.55;

interface View {
  c: Container;
  streak: Sprite;
  glow: Sprite;
  sort: Sortable;
  seen: number;
  faction: Projectile['faction'];
}

export class ProjectileViews {
  private readonly views = new Map<number, View>();
  private frame = 0;

  constructor(
    private readonly stage: Stage,
    private readonly textures: Textures,
  ) {}

  update(w: World, alpha: number): void {
    this.frame++;
    for (const p of w.projectiles) {
      if (p.dead) continue;
      let v = this.views.get(p.id);
      if (!v) {
        v = this.make(p);
        this.views.set(p.id, v);
      }
      if (v.faction !== p.faction) this.dress(v, p);
      v.seen = this.frame;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      const sx = projX(x, y);
      const sy = projY(x, y, FLY_Z);
      v.c.position.set(sx, sy);
      v.sort.depth = depthKey(x, y);
      // Point along the on-screen direction of travel.
      v.c.rotation = Math.atan2((p.vx + p.vy) * ISO_SIN, (p.vx - p.vy) * ISO_COS);
      v.glow.position.set(sx, sy);
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frame) continue;
      this.drop(v);
      this.views.delete(id);
    }
  }

  clear(): void {
    for (const v of this.views.values()) this.drop(v);
    this.views.clear();
  }

  private drop(v: View): void {
    this.stage.depth.remove(v.sort);
    v.c.destroy({ children: true });
    v.glow.destroy();
  }

  /** Colour a shot by whose it is now. */
  private dress(v: View, p: Projectile): void {
    v.faction = p.faction;
    if (p.faction === 'enemy') {
      v.streak.tint = DANGER_HOT;
      v.glow.tint = DANGER;
    } else {
      v.streak.tint = RIPE;
      v.glow.tint = PLAYER_COLORS[p.owner] ?? RIM;
    }
  }

  private make(p: Projectile): View {
    const c = new Container();
    const streak = new Sprite(this.textures.streak);
    streak.anchor.set(0.75, 0.5);
    streak.scale.set(0.62, 1.5);
    c.addChild(streak);
    const glow = new Sprite(this.textures.soft);
    glow.anchor.set(0.5);
    glow.scale.set(0.75);
    glow.alpha = 0.85;
    this.stage.fxGlow.addChild(glow);
    const sort = this.stage.depth.add(c, depthKey(p.x, p.y), 0.2);
    const v: View = { c, streak, glow, sort, seen: this.frame, faction: p.faction };
    this.dress(v, p);
    return v;
  }
}
