// A player on screen: rig, ground shadow, a ring in their own colour, dash afterimages.
import { Graphics } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { damp, lerp } from '../core/math';
import { DASH, PLAYER } from '../sim/tuning';
import type { Player, SimEvent } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER_HOT, HERO, PLAYER_COLORS, RIM } from './palette';
import { animInput } from './rig/def';
import { CHAINMAN, chainmanAnimator } from './rig/chainman';
import { RigView } from './rig/view';
import type { Stage } from './stage';

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
  private readonly ring: Graphics;
  private readonly ghosts: Ghost[] = [];
  private facing = 1;
  private away = false;
  private ghostTimer = 0;
  private ghostsLeft = 0;
  private squash = 0;
  /** Interpolated world position this frame. */
  x = 0;
  y = 0;
  seen = 0;

  constructor(
    private readonly stage: Stage,
    readonly slot: number,
  ) {
    this.sort = stage.depth.add(this.rig.root, 0, 0);
    this.shadow = new Graphics().circle(0, 0, PLAYER.radius * 1.15 * TILE).fill({ color: 0x000000, alpha: 0.34 });
    // the ring says whose character this is, in co-op and alone
    this.ring = new Graphics().circle(0, 0, PLAYER.radius * 1.5 * TILE).stroke({ width: 0.07 * TILE, color: 0xffffff });
    this.ring.tint = PLAYER_COLORS[slot] ?? RIM;
    this.ring.alpha = 0.85;
    stage.decals.addChild(this.shadow, this.ring);

    for (let i = 0; i < GHOSTS; i++) {
      const rig = new RigView(CHAINMAN);
      rig.setFlash(1, PLAYER_COLORS[slot] ?? HERO.rim);
      // Flattened to one texture so the afterimage fades as a single silhouette
      // instead of showing every overlapping part.
      rig.root.cacheAsTexture({ antialias: true, resolution: 1.5 });
      rig.root.visible = false;
      this.ghosts.push({ rig, sort: stage.depth.add(rig.root, 0, -0.5), life: 0 });
    }
  }

  handle(ev: SimEvent): void {
    if (ev.type === 'dash' && ev.player === this.slot) {
      this.ghostsLeft = GHOSTS;
      this.ghostTimer = 0;
      this.squash = 1;
    } else if (ev.type === 'dashEnd' && ev.player === this.slot) {
      this.squash = -0.6;
    } else if (ev.type === 'playerHurt' && ev.player === this.slot) {
      this.squash = -0.8;
    }
  }

  update(p: Player, alpha: number, dt: number, time: number): void {
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    this.x = x;
    this.y = y;
    const sx = projX(x, y);
    const sy = projY(x, y);
    this.rig.root.position.set(sx, sy);
    this.sort.depth = depthKey(x, y);
    this.shadow.position.set(x * TILE, y * TILE);
    this.ring.position.set(x * TILE, y * TILE);

    // Facing: along the aim, or along the dash while dashing.
    let fx = Math.cos(p.aim);
    let fy = Math.sin(p.aim);
    if (p.state === 'dash') {
      fx = p.dashDirX;
      fy = p.dashDirY;
    } else if (p.state === 'swing') {
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
    const flinching = p.hurtT < 0.22 && (p.state === 'idle' || p.state === 'run');
    if (p.state === 'down') {
      a.state = 'dead';
      a.t = p.stateTime;
      a.phase = Math.min(1, p.stateTime / 0.7);
    } else if (flinching) {
      a.state = 'hurt';
      a.t = p.hurtT;
      a.phase = Math.min(1, p.hurtT / 0.22);
    } else if (p.state === 'swing') {
      a.state = 'swing';
      a.t = p.stateTime;
      a.phase = p.actDur > 0 ? Math.min(1, p.stateTime / p.actDur) : 0;
      a.variant = p.combo;
    } else if (p.state === 'dash') {
      a.state = 'dash';
      a.t = p.stateTime;
      a.phase = Math.min(1, p.stateTime / DASH.time);
    } else {
      a.state = p.state;
      a.t = p.stateTime;
      a.phase = 0;
    }
    this.rig.beginPose();
    const rate = chainmanAnimator(this.rig, a);
    this.rig.applyPose(dt, rate);

    // Hurt: a danger-coloured flash, then blink while invulnerable.
    const hurtFlash = Math.max(0, 1 - p.hurtT / 0.12);
    this.rig.setFlash(hurtFlash, DANGER_HOT);
    const blinking = p.state !== 'down' && p.hurtT < PLAYER.hurtIframes && p.hurtT > 0.12;
    this.rig.root.alpha = blinking && Math.floor(time * 22) % 2 === 0 ? 0.45 : 1;
    this.ring.alpha = p.state === 'down' ? 0.3 : 0.85;

    // Squash and stretch around the dash: stretch on launch, squash on landing.
    this.squash = damp(this.squash, 0, 12, dt);
    const st = this.squash;
    this.rig.setSquash(1 + st * 0.16, 1 - st * 0.12);

    this.updateGhosts(sx, sy, x, y, dt, p.state === 'dash');
  }

  destroy(): void {
    this.stage.depth.remove(this.sort);
    this.rig.destroy();
    this.shadow.destroy();
    this.ring.destroy();
    for (const g of this.ghosts) {
      this.stage.depth.remove(g.sort);
      g.rig.destroy();
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

/** One view per player in the world being watched; views come and go with the players. */
export class PlayerViews {
  private readonly views = new Map<number, PlayerView>();
  private frame = 0;

  constructor(private readonly stage: Stage) {}

  get(slot: number): PlayerView | undefined {
    return this.views.get(slot);
  }

  handle(ev: SimEvent): void {
    for (const v of this.views.values()) v.handle(ev);
  }

  update(players: readonly Player[], alpha: number, dt: number, time: number): void {
    this.frame++;
    for (const p of players) {
      let v = this.views.get(p.slot);
      if (!v) {
        v = new PlayerView(this.stage, p.slot);
        this.views.set(p.slot, v);
      }
      v.seen = this.frame;
      v.update(p, alpha, dt, time);
    }
    for (const [slot, v] of this.views) {
      if (v.seen === this.frame) continue;
      v.destroy();
      this.views.delete(slot);
    }
  }

  clear(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }
}
