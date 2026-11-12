// Projectiles on screen: the plumb bob on its cord, and enemy shots.
import { Container, Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { lerp } from '../core/math';
import type { Projectile, SimEvent, World } from '../sim/types';
import type { Sortable } from './depth';
import { CHALK, DANGER, DANGER_HOT, HERO } from './palette';
import type { Stage } from './stage';
import type { Textures } from './textures';

/** Height above the floor at which shots fly, in tiles. */
const FLY_Z = 0.55;
const RETRACT_TIME = 0.14;

let bobCtx: GraphicsContext | null = null;
function bob(): GraphicsContext {
  if (!bobCtx) {
    // A brass plumb bob: an inverted teardrop with a collar.
    bobCtx = new GraphicsContext()
      .poly([0, 9, -5, -1, -4.2, -6, 4.2, -6, 5, -1])
      .fill(0xffffff)
      .rect(-2.2, -9.5, 4.4, 3.5)
      .fill(0xffffff);
  }
  return bobCtx;
}

interface View {
  c: Container;
  sort: Sortable;
  seen: number;
  kind: string;
  glow: Sprite | null;
}

interface Retract {
  x: number;
  y: number;
  t: number;
}

export class ProjectileViews {
  private readonly views = new Map<number, View>();
  private frame = 0;
  private readonly cord: Sprite;
  private readonly cordGlow: Sprite;
  private readonly retractBob: Graphics;
  private retract: Retract | null = null;
  /** Where the cord starts: the player's hand, in camera-space pixels. Set by the game each frame. */
  handX = 0;
  handY = 0;

  constructor(
    private readonly stage: Stage,
    private readonly textures: Textures,
  ) {
    this.cord = new Sprite(Texture.WHITE);
    this.cord.anchor.set(0, 0.5);
    this.cord.tint = HERO.rodPale;
    this.cord.visible = false;
    stage.fxCrisp.addChild(this.cord);
    this.cordGlow = new Sprite(Texture.WHITE);
    this.cordGlow.anchor.set(0, 0.5);
    this.cordGlow.tint = CHALK;
    this.cordGlow.visible = false;
    stage.linesGlow.addChild(this.cordGlow);
    this.retractBob = new Graphics(bob());
    this.retractBob.tint = CHALK;
    this.retractBob.visible = false;
    stage.fxCrisp.addChild(this.retractBob);
  }

  handle(ev: SimEvent): void {
    if (ev.type === 'projectileEnd' && ev.kind === 'plumb') {
      // The bob snaps back to the hand: presentation only.
      this.retract = { x: ev.x, y: ev.y, t: 0 };
    }
  }

  update(w: World, alpha: number, dt: number): void {
    this.frame++;
    let plumbX = 0;
    let plumbY = 0;
    let plumbOut = false;
    for (const p of w.projectiles) {
      if (p.dead) continue;
      let v = this.views.get(p.id);
      if (!v) {
        v = this.make(p);
        this.views.set(p.id, v);
      }
      v.seen = this.frame;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      const sx = projX(x, y);
      const sy = projY(x, y, FLY_Z);
      v.c.position.set(sx, sy);
      v.sort.depth = depthKey(x, y);
      // Point along the on-screen direction of travel.
      v.c.rotation = Math.atan2((p.vx + p.vy) * ISO_SIN, (p.vx - p.vy) * ISO_COS) - (p.kind === 'plumb' ? Math.PI / 2 : 0);
      if (v.glow) v.glow.position.set(sx, sy);
      if (p.kind === 'plumb') {
        plumbOut = true;
        plumbX = sx;
        plumbY = sy;
      }
    }
    for (const [id, v] of this.views) {
      if (v.seen === this.frame) continue;
      this.stage.depth.remove(v.sort);
      v.c.destroy({ children: true });
      v.glow?.destroy();
      this.views.delete(id);
    }

    // The cord: taut to the bob while it flies, then whipping back to the hand.
    if (plumbOut) {
      this.retract = null;
      this.retractBob.visible = false;
      this.layCord(plumbX, plumbY, 1);
    } else if (this.retract) {
      this.retract.t += dt;
      const k = this.retract.t / RETRACT_TIME;
      if (k >= 1) {
        this.retract = null;
        this.cord.visible = false;
        this.cordGlow.visible = false;
        this.retractBob.visible = false;
      } else {
        const e = k * k;
        const bx = lerp(projX(this.retract.x, this.retract.y), this.handX, e);
        const by = lerp(projY(this.retract.x, this.retract.y, FLY_Z), this.handY, e);
        this.retractBob.visible = true;
        this.retractBob.position.set(bx, by);
        this.layCord(bx, by, 1 - k * 0.5);
      }
    } else {
      this.cord.visible = false;
      this.cordGlow.visible = false;
    }
  }

  clear(): void {
    for (const v of this.views.values()) {
      this.stage.depth.remove(v.sort);
      v.c.destroy({ children: true });
      v.glow?.destroy();
    }
    this.views.clear();
    this.retract = null;
    this.cord.visible = false;
    this.cordGlow.visible = false;
    this.retractBob.visible = false;
  }

  private layCord(toX: number, toY: number, alpha: number): void {
    const dx = toX - this.handX;
    const dy = toY - this.handY;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx);
    for (const s of [this.cord, this.cordGlow]) {
      s.visible = true;
      s.position.set(this.handX, this.handY);
      s.rotation = rot;
      s.width = len;
      s.alpha = alpha;
    }
    this.cord.height = 1.6;
    this.cordGlow.height = 5;
  }

  private make(p: Projectile): View {
    const c = new Container();
    let glow: Sprite | null = null;
    if (p.kind === 'plumb') {
      const g = new Graphics(bob());
      g.tint = CHALK;
      c.addChild(g);
      glow = new Sprite(this.textures.soft);
      glow.anchor.set(0.5);
      glow.tint = CHALK;
      glow.scale.set(0.7);
      glow.alpha = 0.7;
    } else {
      // An enemy shot: a hot streak in the danger colour.
      const s = new Sprite(this.textures.streak);
      s.anchor.set(0.75, 0.5);
      s.tint = DANGER_HOT;
      s.scale.set(0.62, 1.5);
      c.addChild(s);
      glow = new Sprite(this.textures.soft);
      glow.anchor.set(0.5);
      glow.tint = DANGER;
      glow.scale.set(0.75);
      glow.alpha = 0.85;
    }
    this.stage.fxGlow.addChild(glow);
    const sort = this.stage.depth.add(c, depthKey(p.x, p.y), 0.2);
    return { c, sort, seen: this.frame, kind: p.kind, glow };
  }
}

export const PROJECTILE_FLY_Z = FLY_Z;
export const PROJECTILE_TILE = TILE;
