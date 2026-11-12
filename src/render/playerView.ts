// The Chainman on screen: rig, ground shadow, trailing survey chain, dash afterimages.
import { Graphics, GraphicsContext } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { damp, lerp } from '../core/math';
import { DASH, PLAYER } from '../sim/tuning';
import type { PlayerState } from '../sim/types';
import type { SimEvent, World } from '../sim/types';
import type { Sortable } from './depth';
import { CHALK, DANGER_HOT, HERO } from './palette';
import { animInput } from './rig/def';
import { CHAINMAN, chainmanAnimator } from './rig/chainman';
import { RigView } from './rig/view';
import type { Stage } from './stage';

const CHAIN_LINKS = 7;
const GHOSTS = 4;

interface Ghost {
  rig: RigView;
  sort: Sortable;
  life: number;
}

export class PlayerView {
  readonly rig = new RigView(CHAINMAN);
  private readonly anim = animInput();
  private readonly sort: Sortable;
  private readonly shadow: Graphics;
  private readonly links: Array<{ x: number; y: number; g: Graphics }> = [];
  private readonly ghosts: Ghost[] = [];
  private facing = 1;
  private away = false;
  private ghostTimer = 0;
  private ghostsLeft = 0;
  private squash = 0;
  /** A short gesture played over idle or run: planting a stake, hauling one in. */
  private gesture: { state: 'plant' | 'whip'; t: number; dur: number } | null = null;
  private lastState: PlayerState = 'idle';
  /** Interpolated world position this frame. */
  x = 0;
  y = 0;
  /** The tip of the rod in camera-space pixels: the Plumb Shot's cord starts here. */
  handX = 0;
  handY = 0;

  constructor(private readonly stage: Stage) {
    this.sort = stage.depth.add(this.rig.root, 0, 0);

    this.shadow = new Graphics().circle(0, 0, PLAYER.radius * 1.15 * TILE).fill({ color: 0x000000, alpha: 0.34 });
    stage.decals.addChild(this.shadow);

    const linkCtx = new GraphicsContext().circle(0, 0, 0.075 * TILE).stroke({ width: 0.03 * TILE, color: 0xffffff });
    for (let i = 0; i < CHAIN_LINKS; i++) {
      const g = new Graphics(linkCtx);
      g.tint = CHALK;
      g.alpha = 0.55 - i * 0.05;
      stage.decals.addChild(g);
      this.links.push({ x: 0, y: 0, g });
    }

    for (let i = 0; i < GHOSTS; i++) {
      const rig = new RigView(CHAINMAN);
      rig.setFlash(1, HERO.rim);
      // Flattened to one texture so the afterimage fades as a single silhouette
      // instead of showing every overlapping part.
      rig.root.cacheAsTexture({ antialias: true, resolution: 1.5 });
      rig.root.visible = false;
      this.ghosts.push({ rig, sort: stage.depth.add(rig.root, 0, -0.5), life: 0 });
    }
  }

  /** Place everything exactly, with no smoothing (room entry, teleports). */
  snap(w: World): void {
    const p = w.player;
    this.x = p.x;
    this.y = p.y;
    for (const l of this.links) {
      l.x = p.x;
      l.y = p.y;
    }
  }

  /** Play a short gesture over idle or run. */
  playGesture(state: 'plant' | 'whip', dur: number): void {
    this.gesture = { state, t: 0, dur };
  }

  get state(): PlayerState {
    return this.lastState;
  }

  handle(ev: SimEvent): void {
    if (ev.type === 'dash') {
      this.ghostsLeft = GHOSTS;
      this.ghostTimer = 0;
      this.squash = 1;
    } else if (ev.type === 'dashEnd') {
      this.squash = -0.6;
    } else if (ev.type === 'playerHurt') {
      this.squash = -0.8;
    }
  }

  update(w: World, alpha: number, dt: number, time: number): void {
    const p = w.player;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    this.x = x;
    this.y = y;
    const sx = projX(x, y);
    const sy = projY(x, y);
    this.rig.root.position.set(sx, sy);
    this.sort.depth = depthKey(x, y);
    this.shadow.position.set(x * TILE, y * TILE);

    // Facing: toward the cursor, or along the dash while dashing.
    let fx = Math.cos(p.aim);
    let fy = Math.sin(p.aim);
    if (p.state === 'dash') {
      fx = p.dashDirX;
      fy = p.dashDirY;
    } else if (p.state === 'swing' || p.state === 'shot') {
      fx = Math.cos(p.actAngle);
      fy = Math.sin(p.actAngle);
    }
    const scrX = (fx - fy) * ISO_COS;
    const scrY = (fx + fy) * ISO_SIN;
    if (Math.abs(scrX) > 0.08) this.facing = scrX < 0 ? -1 : 1;
    if (scrY < -0.18) this.away = true;
    else if (scrY > -0.08) this.away = false;
    this.rig.setFacing(this.facing, this.away);

    // Animation input
    const a = this.anim;
    const speed = Math.hypot(p.vx, p.vy);
    const mvScrX = (p.vx - p.vy) * ISO_COS;
    a.time = time;
    a.stride = p.stride;
    a.speed = speed / PLAYER.speed;
    a.forward = mvScrX * this.facing >= -0.2 ? 1 : -1;
    a.aim = Math.atan2(scrY, scrX * this.facing);
    a.away = this.away;
    a.variant = 0;
    if (this.gesture) {
      this.gesture.t += dt;
      if (this.gesture.t >= this.gesture.dur || p.state === 'swing' || p.state === 'shot' || p.state === 'dash' || p.state === 'dead') this.gesture = null;
    }
    const flinching = p.hurtT < 0.22 && (p.state === 'idle' || p.state === 'run');
    if (p.state === 'dead') {
      a.state = 'dead';
      a.t = p.stateTime;
      a.phase = Math.min(1, p.stateTime / 0.7);
    } else if (flinching) {
      a.state = 'hurt';
      a.t = p.hurtT;
      a.phase = Math.min(1, p.hurtT / 0.22);
    } else if (p.state === 'swing' || p.state === 'shot') {
      a.state = p.state;
      a.t = p.stateTime;
      a.phase = p.actDur > 0 ? Math.min(1, p.stateTime / p.actDur) : 0;
      a.variant = p.combo;
    } else if (p.state === 'dash') {
      a.state = 'dash';
      a.t = p.stateTime;
      a.phase = Math.min(1, p.stateTime / DASH.time);
    } else if (this.gesture) {
      a.state = this.gesture.state;
      a.t = this.gesture.t;
      a.phase = Math.min(1, this.gesture.t / this.gesture.dur);
    } else {
      a.state = p.state;
      a.t = p.stateTime;
      a.phase = 0;
    }
    this.lastState = p.state;
    this.rig.beginPose();
    const rate = chainmanAnimator(this.rig, a);
    this.rig.applyPose(dt, rate);

    // Hurt: a danger-coloured flash, then blink while invulnerable.
    const hurtFlash = Math.max(0, 1 - p.hurtT / 0.12);
    this.rig.setFlash(hurtFlash, DANGER_HOT);
    const blinking = p.state !== 'dead' && p.hurtT < PLAYER.hurtIframes && p.hurtT > 0.12;
    this.rig.root.alpha = blinking && Math.floor(time * 22) % 2 === 0 ? 0.45 : 1;

    // The tip of the rod, where the cord of the Plumb Shot starts.
    const rod = this.rig.node('rod');
    if (rod && this.rig.root.parent) {
      const lp = this.rig.root.parent.toLocal(rod.toGlobal({ x: 0, y: -62 }));
      this.handX = lp.x;
      this.handY = lp.y;
    } else {
      this.handX = sx;
      this.handY = sy - 60;
    }

    // Squash and stretch around the dash: stretch on launch, squash on landing.
    this.squash = damp(this.squash, 0, 12, dt);
    const st = this.squash;
    this.rig.setSquash(1 + st * 0.16, 1 - st * 0.12);

    this.updateChain(x, y, dt);
    this.updateGhosts(sx, sy, x, y, dt, p.state === 'dash');
  }

  destroy(): void {
    this.stage.depth.remove(this.sort);
    this.rig.destroy();
    this.shadow.destroy();
    for (const l of this.links) l.g.destroy();
    for (const g of this.ghosts) {
      this.stage.depth.remove(g.sort);
      g.rig.destroy();
    }
  }

  private updateChain(x: number, y: number, dt: number): void {
    // The first link trails the heels; each later link is dragged by the one before it.
    let tx = x;
    let ty = y;
    const gap = 0.17;
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const dx = l.x - tx;
      const dy = l.y - ty;
      const d = Math.hypot(dx, dy);
      const want = i === 0 ? 0.3 : gap;
      if (d > want) {
        const k = want / d;
        // dragged taut, with a little lag so it snakes
        const nx = tx + dx * k;
        const ny = ty + dy * k;
        l.x = damp(l.x, nx, 30, dt);
        l.y = damp(l.y, ny, 30, dt);
      }
      l.g.position.set(l.x * TILE, l.y * TILE);
      tx = l.x;
      ty = l.y;
    }
  }

  private updateGhosts(sx: number, sy: number, x: number, y: number, dt: number, dashing: boolean): void {
    if (dashing && this.ghostsLeft > 0) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = DASH.time / GHOSTS;
        const g = this.ghosts[GHOSTS - this.ghostsLeft];
        this.ghostsLeft--;
        g.rig.copyPose(this.rig);
        g.rig.root.updateCacheTexture();
        g.rig.root.position.set(sx, sy);
        g.rig.root.visible = true;
        g.sort.depth = depthKey(x, y);
        g.life = 1;
      }
    }
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt / 0.24;
      if (g.life <= 0) {
        g.rig.root.visible = false;
        continue;
      }
      g.rig.root.alpha = g.life * 0.42;
    }
  }
}
