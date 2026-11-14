// Shots on screen. An enemy shot is a hot streak in the danger colour; a shot that belongs to a
// player wears that player's colour, so the instant one is turned it reads as theirs. Arrows are
// long and thin, a returned shot is fat and bright, and a perfect return is brightest of all.
import { Container, Sprite } from 'pixi.js';
import { ISO_COS, ISO_SIN, depthKey, projX, projY } from '../core/iso';
import { lerp } from '../core/math';
import type { Projectile, World } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER, DANGER_HOT, PLAYER_COLORS, PLAYER_PALE, RIM, WHITE } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

/** Height above the floor at which shots fly, in tiles. */
export const FLY_Z = 0.55;

interface View {
  c: Container;
  streak: Sprite;
  glow: Sprite;
  sort: Sortable;
  seen: number;
  /** What it was dressed as: changes when a shot changes sides. */
  dress: string;
  x: number;
  y: number;
  owner: number;
  mine: boolean;
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
      const dress = `${p.faction}/${p.owner}/${p.perfect ? 'p' : p.returned ? 'r' : p.kind}`;
      if (v.dress !== dress) this.dress(v, p, dress);
      v.seen = this.frame;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      v.x = x;
      v.y = y;
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

  /** Call for each shot a player owns this frame, with where it is and whose it is. */
  eachOwned(fn: (id: number, x: number, y: number, owner: number) => void): void {
    for (const [id, v] of this.views) if (v.mine) fn(id, v.x, v.y, v.owner);
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

  /** Shape and colour a shot by what it is and whose it is now. */
  private dress(v: View, p: Projectile, dress: string): void {
    v.dress = dress;
    v.owner = p.owner;
    v.mine = p.faction === 'player';
    if (p.faction === 'enemy') {
      v.streak.tint = DANGER_HOT;
      v.streak.scale.set(0.62, 1.5);
      v.glow.tint = DANGER;
      v.glow.scale.set(0.75);
      return;
    }
    const color = PLAYER_COLORS[p.owner] ?? RIM;
    const pale = PLAYER_PALE[p.owner] ?? RIM;
    v.glow.tint = color;
    if (p.perfect) {
      v.streak.tint = WHITE;
      v.streak.scale.set(1.15, 2.4);
      v.glow.scale.set(1.5);
    } else if (p.returned) {
      v.streak.tint = pale;
      v.streak.scale.set(0.85, 1.9);
      v.glow.scale.set(1.05);
    } else {
      // an arrow: long and thin
      v.streak.tint = pale;
      v.streak.scale.set(0.95, 0.75);
      v.glow.scale.set(0.5);
    }
  }

  private make(p: Projectile): View {
    const c = new Container();
    const streak = new Sprite(this.textures.streak);
    streak.anchor.set(0.75, 0.5);
    c.addChild(streak);
    const glow = new Sprite(this.textures.soft);
    glow.anchor.set(0.5);
    glow.alpha = 0.85;
    this.stage.fxGlow.addChild(glow);
    const sort = this.stage.depth.add(c, depthKey(p.x, p.y), 0.2);
    return { c, streak, glow, sort, seen: this.frame, dress: '', x: p.x, y: p.y, owner: p.owner, mine: false };
  }
}
