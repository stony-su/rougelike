// Enemies on screen. Each view owns a rig, a pale halo under its feet, and a depth footprint.
// When the simulation removes an enemy the view lives on briefly as a corpse to play its death.
// A body sent flying tumbles about its middle; one that falls into a pit shrinks away into it.
import { Graphics, GraphicsContext } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, depthKey, projX, projY } from '../core/iso';
import { lerp, mixColor } from '../core/math';
import type { Enemy, SimEvent, World } from '../sim/types';
import type { Sortable } from './depth';
import { DANGER, INK, RIM, STATUS, WHITE } from './palette';
import type { ZoneTheme } from './palette';
import { animInput } from './rig/def';
import type { AnimInput } from './rig/def';
import { rigEntry } from './rig/registry';
import type { RigEntry } from './rig/registry';
import { RigView } from './rig/view';
import type { Stage } from './stage';

const T = TILE;
const DEATH_TIME = 0.42;
const DEATH_FADE = 0.22;
const HURT_POSE = 0.18;
const FLASH_TIME = 0.1;
/** Seconds a body takes to drop out of sight in a pit. */
const FALL_TIME = 0.45;

let haloCtx: GraphicsContext | null = null;
let spawnCtx: GraphicsContext | null = null;

function halo(): GraphicsContext {
  if (!haloCtx) haloCtx = new GraphicsContext().circle(0, 0, T).fill({ color: 0xffffff, alpha: 1 });
  return haloCtx;
}

let badgeCtx: GraphicsContext | null = null;
let markCtx: GraphicsContext | null = null;

/** The pennant an elite flies over its head. */
function badge(): GraphicsContext {
  if (!badgeCtx) badgeCtx = new GraphicsContext().poly([-7, -6, 7, -6, 7, 3, 0, 8, -7, 3]).fill(0xffffff).poly([-7, -6, 7, -6, 7, 3, 0, 8, -7, 3]).stroke({ width: 1.5, color: 0x000000, alpha: 0.6, join: 'round' });
  return badgeCtx;
}

/** The sign over a marked enemy: a surveyor's witness mark. */
function witness(): GraphicsContext {
  if (!markCtx) markCtx = new GraphicsContext().poly([0, -7, 7, 0, 0, 7, -7, 0]).stroke({ width: 2.2, color: 0xffffff, join: 'round' }).circle(0, 0, 1.6).fill(0xffffff);
  return markCtx;
}

function spawnMark(): GraphicsContext {
  if (!spawnCtx) {
    spawnCtx = new GraphicsContext();
    spawnCtx.circle(0, 0, T).stroke({ width: 3, color: 0xffffff, alpha: 1 });
    // a registration cross, like a mark where something is about to be printed
    spawnCtx.moveTo(-T * 1.25, 0).lineTo(-T * 0.7, 0).moveTo(T * 0.7, 0).lineTo(T * 1.25, 0)
      .moveTo(0, -T * 1.25).lineTo(0, -T * 0.7).moveTo(0, T * 0.7).lineTo(0, T * 1.25)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 1, cap: 'round' });
  }
  return spawnCtx;
}

class EnemyView {
  readonly rig: RigView;
  readonly entry: RigEntry;
  readonly sort: Sortable;
  private readonly halo: Graphics;
  private readonly mark: Graphics;
  /** An elite's pennant and a marked enemy's witness mark float over the head; made only when needed. */
  private badge: Graphics | null = null;
  private witness: Graphics | null = null;
  private readonly anim: AnimInput = animInput();
  private facing = 1;
  private away = false;
  private stride = 0;
  private lastX: number;
  private lastY: number;
  /** World position this frame (interpolated). */
  x: number;
  y: number;
  /** Seconds since death, or -1 while alive. */
  deadFor = -1;
  seen = 0;
  /** How far it has tumbled, in radians, while launched. */
  private spin = 0;
  /** 0 on its feet, 1 fully in the air: eased so take-off and landing are not a snap. */
  private air = 0;
  /** Seconds it has been falling into a pit, or -1. */
  private falling = -1;
  /** It died by falling: the corpse sinks instead of bursting. */
  private fell = false;
  /** The slot that launched it, for the colour of its trail. */
  launchedBy = -1;
  flying = false;

  constructor(
    private readonly stage: Stage,
    e: Enemy,
    theme: ZoneTheme,
  ) {
    this.entry = rigEntry(e.def.rig);
    this.rig = new RigView(this.entry.def, { ink: theme.inkWash, inkDark: theme.inkDark });
    this.sort = stage.depth.add(this.rig.root, depthKey(e.x, e.y));
    this.halo = new Graphics(halo());
    this.halo.tint = RIM;
    this.halo.scale.set(this.entry.def.footprint * 1.25);
    this.halo.alpha = 0;
    this.mark = new Graphics(spawnMark());
    this.mark.tint = DANGER;
    stage.decals.addChild(this.halo, this.mark);
    this.x = this.lastX = e.x;
    this.y = this.lastY = e.y;
    this.anim.seed = e.seed;
    this.setFacing(e.facing);
  }

  update(e: Enemy, alpha: number, dt: number, time: number): void {
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    this.stride += moved;
    // In flight it tumbles forward, a full turn about every three tiles.
    this.flying = e.state === 'launched';
    this.launchedBy = e.launchBy;
    if (this.flying && e.freeze === 0) this.spin += moved * 2.1 * (e.lvx - e.lvy >= 0 ? 1 : -1);
    this.air += ((this.flying ? 1 : 0) - this.air) * Math.min(1, dt * 14);
    if (!this.flying && this.air < 0.02) this.spin = 0;
    this.falling = e.state === 'pit' ? (this.falling < 0 ? 0 : this.falling + dt) : -1;
    this.lastX = x;
    this.lastY = y;
    this.place(x, y);
    this.setFacing(this.flying ? Math.atan2(e.lvy, e.lvx) : e.facing);

    const a = this.anim;
    const flinching = e.hurtT < HURT_POSE && (e.state === 'idle' || e.state === 'move' || e.state === 'recover');
    a.state = flinching ? 'hurt' : e.state;
    a.t = flinching ? e.hurtT : e.stateTime;
    a.phase = e.stateDur > 0 ? Math.min(1, e.stateTime / e.stateDur) : 0;
    a.time = time;
    a.stride = this.stride;
    a.speed = Math.hypot(e.vx, e.vy) / Math.max(0.1, e.def.speed);
    a.away = this.away;
    this.pose(dt);

    // The body itself warns: the eye turns danger-red through the wind-up and the attack.
    const threatening = e.state === 'windup' || e.state === 'attack';
    this.rig.setRole('eye', threatening ? DANGER : WHITE);
    this.rig.setFlash(Math.max(0, 1 - e.hurtT / FLASH_TIME));

    // Conditions wash the whole body: ice over chill over burn; unbroken armour reads as heavier ink.
    const st = e.status;
    let wash = WHITE;
    if (st.frozenT > 0) wash = STATUS.frost;
    else if (st.chillT > 0) wash = mixColor(WHITE, STATUS.frost, 0.55);
    else if (st.burnT > 0) wash = mixColor(WHITE, STATUS.burn, 0.45 + 0.2 * Math.sin(time * 22 + e.seed * 9));
    else if (e.armor < 1) wash = mixColor(WHITE, INK, 0.45);
    else if (e.staggered > 0 && e.state === 'stun') wash = mixColor(WHITE, STATUS.stagger, 0.35 + 0.25 * Math.sin(time * 14));
    this.rig.setWash(wash);

    // The mark under its feet: pale by default, danger-red for an elite, the barb's colour while rooted.
    const elite = e.elite !== null;
    const rooted = st.rootT > 0;
    this.halo.tint = rooted ? STATUS.root : elite ? DANGER : RIM;
    const haloAlpha = rooted ? 0.5 : elite ? 0.3 + 0.08 * Math.sin(time * 5 + e.seed * 6) : 0.16;
    this.halo.scale.set(this.entry.def.footprint * (elite ? 1.7 : 1.25));

    if (e.state === 'spawn') {
      const k = a.phase;
      this.rig.root.alpha = Math.min(1, k * 1.6);
      this.mark.visible = true;
      this.mark.alpha = (1 - k) * 0.9;
      this.mark.scale.set(this.entry.def.footprint * (1.9 - 0.9 * k));
      this.mark.rotation = k * 1.2;
      this.halo.alpha = haloAlpha * k;
    } else if (this.falling >= 0) {
      this.mark.visible = false;
      this.halo.alpha = 0;
      this.sink(this.falling);
    } else {
      this.rig.root.alpha = 1;
      this.rig.root.scale.set(1);
      this.mark.visible = false;
      this.halo.alpha = haloAlpha * (1 - this.air * 0.6);
    }

    // Signs over the head.
    const top = this.rig.root.y - this.entry.def.height - 14 + Math.sin(time * 3 + e.seed * 6) * 2;
    if (elite && !this.badge) {
      this.badge = new Graphics(badge());
      this.badge.tint = DANGER;
      this.stage.fxCrisp.addChild(this.badge);
    }
    if (this.badge) this.badge.position.set(this.rig.root.x, top);
    if (st.markT > 0 && !this.witness) {
      this.witness = new Graphics(witness());
      this.witness.tint = STATUS.mark;
      this.stage.fxCrisp.addChild(this.witness);
    }
    if (this.witness) {
      this.witness.visible = st.markT > 0;
      this.witness.position.set(this.rig.root.x + (this.badge ? 18 : 0), top);
      this.witness.rotation = time * 1.5;
    }
  }

  /** It is going into a pit and will not come out. */
  ringOut(): void {
    this.fell = true;
  }

  /** Shrink and drop out of sight, `t` seconds into the fall. */
  private sink(t: number): void {
    const k = Math.min(1, t / FALL_TIME);
    this.rig.root.scale.set(1 - 0.75 * k * k);
    this.rig.root.alpha = 1 - k * k;
    this.rig.root.y += k * k * T * 0.7;
    this.rig.root.rotation = this.spin + k * 2.4;
  }

  /** The simulation has removed this enemy: play the death where it fell. */
  die(ev: Extract<SimEvent, { type: 'enemyDeath' }>): void {
    this.deadFor = 0;
    this.flying = false;
    this.air = this.fell ? this.air : 0;
    this.place(ev.x, ev.y);
    this.mark.visible = false;
    this.rig.setRole('eye', WHITE);
    this.rig.setWash(WHITE);
    this.rig.setFlash(1);
    this.dropSigns();
  }

  /** Returns false when the corpse is finished and can be destroyed. */
  updateCorpse(dt: number, time: number): boolean {
    this.deadFor += dt;
    if (this.fell) {
      // gone down the pit: no burst, just the fall
      this.place(this.x, this.y);
      this.sink(this.deadFor);
      this.halo.alpha = 0;
      return this.deadFor < FALL_TIME;
    }
    const a = this.anim;
    a.state = 'dead';
    a.t = this.deadFor;
    a.phase = Math.min(1, this.deadFor / DEATH_TIME);
    a.time = time;
    this.pose(dt);
    this.rig.setFlash(Math.max(0, 1 - this.deadFor / 0.12));
    const fade = this.deadFor <= DEATH_TIME ? 1 : Math.max(0, 1 - (this.deadFor - DEATH_TIME) / DEATH_FADE);
    this.rig.root.alpha = fade;
    this.halo.alpha = Math.min(this.halo.alpha, 0.3 * fade);
    return this.deadFor < DEATH_TIME + DEATH_FADE;
  }

  destroy(): void {
    this.stage.depth.remove(this.sort);
    this.rig.destroy();
    this.halo.destroy();
    this.mark.destroy();
    this.dropSigns();
  }

  private dropSigns(): void {
    this.badge?.destroy();
    this.badge = null;
    this.witness?.destroy();
    this.witness = null;
  }

  private pose(dt: number): void {
    this.rig.beginPose();
    const rate = this.entry.animator(this.rig, this.anim);
    this.rig.applyPose(dt, rate);
  }

  private place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    // A tumbling body turns about its middle and rides a little above the floor.
    const mid = this.entry.def.height * 0.45;
    const lift = this.air * (mid + 9);
    this.rig.root.pivot.set(0, -mid * this.air);
    this.rig.root.position.set(projX(x, y), projY(x, y) - lift);
    this.rig.root.rotation = this.spin * this.air;
    this.sort.depth = depthKey(x, y);
    this.halo.position.set(x * T, y * T);
    this.mark.position.set(x * T, y * T);
  }

  private setFacing(worldAngle: number): void {
    const fx = Math.cos(worldAngle);
    const fy = Math.sin(worldAngle);
    const sx = (fx - fy) * ISO_COS;
    const sy = (fx + fy) * ISO_SIN;
    if (Math.abs(sx) > 0.1) this.facing = sx < 0 ? -1 : 1;
    if (sy < -0.2) this.away = true;
    else if (sy > -0.08) this.away = false;
    this.rig.setFacing(this.facing, this.away);
  }
}

export class EnemyViews {
  private readonly live = new Map<number, EnemyView>();
  private readonly corpses: EnemyView[] = [];
  private frame = 0;

  constructor(
    private readonly stage: Stage,
    private theme: ZoneTheme,
  ) {}

  setTheme(theme: ZoneTheme): void {
    this.theme = theme;
  }

  /** Interpolated position of a live enemy's view, for effects that follow it. */
  position(id: number): { x: number; y: number; height: number } | null {
    const v = this.live.get(id);
    return v ? { x: v.x, y: v.y, height: v.entry.def.height } : null;
  }

  /** Call for each launched body this frame with where it is and who sent it. */
  eachFlying(fn: (id: number, x: number, y: number, by: number) => void): void {
    for (const [id, v] of this.live) if (v.flying) fn(id, v.x, v.y, v.launchedBy);
  }

  handle(ev: SimEvent): void {
    if (ev.type === 'ringOut' && ev.killed) this.live.get(ev.id)?.ringOut();
    if (ev.type !== 'enemyDeath') return;
    const v = this.live.get(ev.id);
    if (!v) return;
    this.live.delete(ev.id);
    v.die(ev);
    this.corpses.push(v);
  }

  update(w: World, alpha: number, dt: number, time: number): void {
    this.frame++;
    for (const e of w.enemies) {
      if (e.dead) continue;
      let v = this.live.get(e.id);
      if (!v) {
        v = new EnemyView(this.stage, e, this.theme);
        this.live.set(e.id, v);
      }
      v.seen = this.frame;
      v.update(e, alpha, dt, time);
    }
    // Anything the simulation dropped without a death event (room change) just goes.
    for (const [id, v] of this.live) {
      if (v.seen !== this.frame) {
        v.destroy();
        this.live.delete(id);
      }
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (!this.corpses[i].updateCorpse(dt, time)) {
        this.corpses[i].destroy();
        this.corpses.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const v of this.live.values()) v.destroy();
    for (const v of this.corpses) v.destroy();
    this.live.clear();
    this.corpses.length = 0;
  }

  get count(): number {
    return this.live.size + this.corpses.length;
  }
}
