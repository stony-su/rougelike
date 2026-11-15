// A player on screen: the rig of their class in their own colour, a ground shadow, a ring that
// says whose character this is, dash afterimages, and the things only a view can draw because
// they join two moving parts (a drawn-back fist's glow, the string of a bow).
import { Graphics } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { damp, lerp } from '../core/math';
import { DASH, HAYMAKER, PLAYER, REVIVE, SPECIAL_COOLDOWN, WHIRL } from '../sim/tuning';
import type { Player, SimEvent } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER_HOT, PLAYER_COLORS, PLAYER_PALE, RIM } from './palette';
import { animInput } from './rig/def';
import { ARM_LENGTH } from './rig/hero';
import { HERO_RIG, rigEntry } from './rig/registry';
import { WHIRL_COILED, WHIRL_ROUND } from './rig/rigs/edge';
import { STRING_ANCHORS, stringDraw } from './rig/rigs/string';
import type { RigEntry } from './rig/registry';
import { RigView } from './rig/view';
import type { Stage } from './stage';

/** The radius of the ring under a player's feet, in tiles. */
const RING = PLAYER.radius * 1.5;
const GHOSTS = 4;

interface Ghost {
  rig: RigView;
  sort: Sortable;
  life: number;
}

export class PlayerView {
  readonly rig: RigView;
  private readonly entry: RigEntry;
  private readonly anim = animInput();
  private readonly sort: Sortable;
  private readonly shadow: Graphics;
  private readonly ring: Graphics;
  /** The part of the ring that is lit: all of it when the special is ready, and as much as has come back while it is not. */
  private readonly ready: Graphics;
  private readyStep = -1;
  private readyPop = 0;
  /** The ring a drawing-back fist grows on the floor. */
  private readonly charge: Graphics;
  private readonly ghosts: Ghost[] = [];
  private readonly color: number;
  private readonly pale: number;
  private readonly pt = { x: 0, y: 0 };
  private facing = 1;
  private away = false;
  private ghostTimer = 0;
  private ghostsLeft = 0;
  private squash = 0;
  /** Seconds since the hand came fully back (drives the flash), or -1. */
  private fullFor = -1;
  /** Interpolated world position this frame. */
  x = 0;
  y = 0;
  seen = 0;

  constructor(
    private readonly stage: Stage,
    readonly slot: number,
    readonly classId: Player['classId'],
  ) {
    this.color = PLAYER_COLORS[slot] ?? RIM;
    this.pale = PLAYER_PALE[slot] ?? RIM;
    this.entry = rigEntry(HERO_RIG[classId]);
    // each hero wears the colour of their seat as a sash and on the weapon
    this.rig = new RigView(this.entry.def, { accent: this.color });
    this.sort = stage.depth.add(this.rig.root, 0, 0);
    this.shadow = new Graphics().circle(0, 0, PLAYER.radius * 1.15 * TILE).fill({ color: 0x000000, alpha: 0.34 });
    this.ring = new Graphics().circle(0, 0, RING * TILE).stroke({ width: 0.07 * TILE, color: 0xffffff });
    this.ring.tint = this.color;
    this.ring.alpha = 0.85;
    this.ready = new Graphics();
    this.ready.tint = this.pale;
    this.charge = new Graphics().circle(0, 0, TILE).stroke({ width: 0.06 * TILE, color: 0xffffff });
    this.charge.tint = this.pale;
    this.charge.visible = false;
    stage.decals.addChild(this.shadow, this.ring, this.ready, this.charge);

    for (let i = 0; i < GHOSTS; i++) {
      const rig = new RigView(this.entry.def);
      rig.setFlash(1, this.color);
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
    } else if (ev.type === 'chargeFull' && ev.player === this.slot) {
      this.fullFor = 0;
    } else if (ev.type === 'haymaker' && ev.player === this.slot) {
      this.squash = 0.9;
    } else if (ev.type === 'whirl' && ev.player === this.slot) {
      this.squash = 0.7;
    }
  }

  /** Where the tip of the weapon hand is this frame, in world-layer pixels (for trails and sparks). */
  hand(out: { x: number; y: number }): void {
    this.rig.point('armNear', 0, ARM_LENGTH, out);
    out.x += this.rig.root.x;
    out.y += this.rig.root.y;
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
    this.ready.position.set(x * TILE, y * TILE);
    this.drawSpecial(p, dt);

    // Facing: along the aim; along the dash while dashing; along the blow while it is being struck.
    const busy = p.state === 'attack' || p.state === 'release';
    const committed = busy && p.classId !== 'bow';
    let fx = Math.cos(committed ? p.actAngle : p.aim);
    let fy = Math.sin(committed ? p.actAngle : p.aim);
    if (p.state === 'dash') {
      fx = p.dashDirX;
      fy = p.dashDirY;
    }
    // The Whirlwind: the Sword turns all the way round with its blade, once for each turn of it.
    const whirling = p.classId === 'sword' && p.state === 'special';
    const turns = whirling ? Math.max(1, Math.round((p.actDur - WHIRL.windup - WHIRL.recovery) / WHIRL.spin)) : 0;
    const round = whirling ? (p.stateTime - WHIRL.windup) / WHIRL.spin : -1;
    if (round >= 0 && round < turns) {
      fx = Math.cos(p.actAngle + round * Math.PI * 2);
      fy = Math.sin(p.actAngle + round * Math.PI * 2);
    }
    const scrX = (fx - fy) * ISO_COS;
    const scrY = (fx + fy) * ISO_SIN;
    if (Math.abs(scrX) > 0.08) this.facing = scrX < 0 ? -1 : 1;
    if (scrY < -0.18) this.away = true;
    else if (scrY > -0.08) this.away = false;
    this.rig.setFacing(this.facing, this.away);

    // What the animator is told. The legs always follow the feet; the state is for the arms.
    const a = this.anim;
    const speed = Math.hypot(p.vx, p.vy);
    const mvScrX = (p.vx - p.vy) * ISO_COS;
    a.time = time;
    a.stride = p.stride;
    a.speed = p.state === 'dash' ? 1 : speed / PLAYER.speed;
    a.forward = mvScrX * this.facing >= -0.2 ? 1 : -1;
    a.aim = Math.atan2(scrY, scrX * this.facing);
    a.away = this.away;
    a.variant = 0;
    a.t = p.stateTime;
    a.phase = 0;
    const flinching = p.hurtT < 0.22 && (p.state === 'idle' || p.state === 'run');
    if (p.state === 'down') {
      a.state = 'down';
    } else if (flinching) {
      a.state = 'hurt';
      a.t = p.hurtT;
      a.phase = Math.min(1, p.hurtT / 0.22);
    } else if (whirling) {
      // told to the rig in its three parts: coiling, going round (however many turns), settling
      a.state = 'special';
      const spun = WHIRL.spin * turns;
      const t = p.stateTime;
      if (t < WHIRL.windup) a.phase = (t / WHIRL.windup) * WHIRL_COILED;
      else if (t < WHIRL.windup + spun) a.phase = WHIRL_COILED + ((t - WHIRL.windup) / spun) * (WHIRL_ROUND - WHIRL_COILED);
      else a.phase = Math.min(1, WHIRL_ROUND + ((t - WHIRL.windup - spun) / WHIRL.recovery) * (1 - WHIRL_ROUND));
    } else if (p.state === 'attack' || p.state === 'release' || p.state === 'special') {
      a.state = p.state;
      a.phase = p.actDur > 0 ? Math.min(1, p.stateTime / p.actDur) : 0;
      a.variant = p.state === 'attack' ? p.combo : 0;
    } else if (p.state === 'charge') {
      a.state = 'charge';
      a.phase = Math.min(1, p.charge / HAYMAKER.full);
    } else if (p.state === 'dash') {
      a.state = 'dash';
      a.phase = Math.min(1, p.stateTime / DASH.time);
    } else {
      a.state = p.state;
    }
    this.rig.beginPose();
    const rate = this.entry.animator(this.rig, a);
    this.rig.applyPose(dt, rate);

    // Hurt: a danger-coloured flash, then blink while invulnerable.
    const hurtFlash = Math.max(0, 1 - p.hurtT / 0.12);
    this.rig.setFlash(hurtFlash, DANGER_HOT);
    const blinking = p.state !== 'down' && p.hurtT < PLAYER.hurtIframes && p.hurtT > 0.12;
    this.rig.root.alpha = blinking && Math.floor(time * 22) % 2 === 0 ? 0.45 : 1;
    this.ring.alpha = p.state === 'down' ? 0.3 : p.specialCd > 0 ? 0.35 : 0.85;
    this.ready.visible = p.state !== 'down';

    // Squash and stretch around the dash: stretch on launch, squash on landing.
    this.squash = damp(this.squash, 0, 12, dt);
    const st = this.squash;
    this.rig.setSquash(1 + st * 0.16, 1 - st * 0.12);

    this.drawOver(p, time, dt);
    this.updateGhosts(sx, sy, x, y, dt, p.state === 'dash');
  }

  /**
   * The special coming back, on the ring under the feet, where the eyes already are. While it is
   * away the ring is dim and a bright arc grows round it from the top; when the arc closes the
   * whole ring is lit again, with a beat to say so.
   */
  private drawSpecial(p: Player, dt: number): void {
    const total = SPECIAL_COOLDOWN[p.classId];
    const k = p.specialCd <= 0 ? 1 : Math.max(0, Math.min(1, 1 - p.specialCd / total));
    const step = Math.round(k * 60);
    if (step !== this.readyStep) {
      if (this.readyStep >= 0 && this.readyStep < 60 && step === 60) this.readyPop = 1;
      this.readyStep = step;
      const g = this.ready;
      g.clear();
      // nothing to draw when it is ready: the ring itself is at full brightness then
      if (step > 0 && step < 60) {
        const from = -Math.PI / 2;
        g.moveTo(Math.cos(from) * RING * TILE, Math.sin(from) * RING * TILE)
          .arc(0, 0, RING * TILE, from, from + (step / 60) * Math.PI * 2)
          .stroke({ width: 0.11 * TILE, color: 0xffffff, cap: 'round' });
      }
    }
    this.readyPop = damp(this.readyPop, 0, 7, dt);
    this.ready.alpha = 0.95;
    this.ring.scale.set(1 + this.readyPop * 0.45);
  }

  /** What joins moving parts, redrawn every frame over the rig and on the floor. */
  private drawOver(p: Player, time: number, dt: number): void {
    const g = this.rig.over;
    g.clear();
    const pt = this.pt;
    if (p.state === 'down') {
      // Down: a ring over the head fills as a teammate stands by.
      const k = Math.min(1, p.reviveT / REVIVE.time);
      g.circle(0, -74, 11).stroke({ width: 3, color: this.color, alpha: 0.35 + 0.2 * Math.sin(time * 5) });
      if (k > 0)
        g.moveTo(0, -85)
          .arc(0, -74, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
          .stroke({ width: 4, color: this.pale, alpha: 1, cap: 'round' });
    }
    if (p.state === 'charge') {
      // The hand glows as it draws back, and a ring on the floor closes on the feet; both flash when full.
      const k = Math.min(1, p.charge / HAYMAKER.full);
      const ready = p.charge >= HAYMAKER.min;
      if (this.fullFor >= 0) this.fullFor += dt;
      const flash = this.fullFor >= 0 ? Math.max(0, 1 - this.fullFor / 0.25) : 0;
      const pulse = k >= 1 ? 0.5 + 0.5 * Math.sin(time * 18) : 0;
      this.rig.point('armNear', 0, ARM_LENGTH, pt);
      g.circle(pt.x, pt.y, 4 + 9 * k + 5 * flash).fill({ color: this.pale, alpha: (ready ? 0.35 : 0.15) + 0.35 * k });
      g.circle(pt.x, pt.y, 2 + 4 * k + 2 * pulse).fill({ color: 0xffffff, alpha: 0.5 + 0.5 * k });
      this.charge.visible = true;
      this.charge.position.set(this.x * TILE, this.y * TILE);
      this.charge.scale.set(1.55 - 1.0 * k + 0.25 * flash);
      this.charge.alpha = (ready ? 0.55 : 0.25) + 0.45 * Math.max(pulse, flash);
    } else {
      this.charge.visible = false;
      this.fullFor = -1;
    }
    if (p.classId === 'bow' && p.state !== 'down') {
      // The string joins the two tips of the bow, and is pulled to the hand that draws it.
      const top = this.pt;
      this.rig.point(STRING_ANCHORS.part, STRING_ANCHORS.top[0], STRING_ANCHORS.top[1], top);
      const tx = top.x;
      const ty = top.y;
      this.rig.point(STRING_ANCHORS.part, STRING_ANCHORS.bottom[0], STRING_ANCHORS.bottom[1], top);
      const bx = top.x;
      const by = top.y;
      const d = stringDraw(this.anim);
      this.rig.point('armNear', 0, ARM_LENGTH, top);
      const mx = (tx + bx) / 2 + (top.x - (tx + bx) / 2) * d;
      const my = (ty + by) / 2 + (top.y - (ty + by) / 2) * d;
      g.moveTo(tx, ty).lineTo(mx, my).lineTo(bx, by).stroke({ width: 1.6, color: this.pale, alpha: 0.95, join: 'round' });
    }
  }

  destroy(): void {
    this.stage.depth.remove(this.sort);
    this.rig.destroy();
    this.shadow.destroy();
    this.ring.destroy();
    this.ready.destroy();
    this.charge.destroy();
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
      if (v && v.classId !== p.classId) {
        v.destroy();
        v = undefined;
      }
      if (!v) {
        v = new PlayerView(this.stage, p.slot, p.classId);
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
