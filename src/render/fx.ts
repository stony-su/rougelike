// Reactions to simulation events: sparks, splashes, shake, the sweep of a swing, damage numbers.
// One exhaustive switch: adding an event type without deciding how it looks fails the type-check.
import { Graphics, GraphicsContext } from 'pixi.js';
import { TILE } from '../core/iso';
import { SWORD } from '../sim/tuning';
import type { SimEvent } from '../sim/types';
import type { Camera } from './camera';
import type { DamageNumbers } from './damageNumbers';
import { CHIME, DANGER, DANGER_HOT, HERO, PLAYER_COLORS, RIM, RIPE } from './palette';
import type { ZoneTheme } from './palette';
import type { Particles } from './particles';
import type { Stage } from './stage';

const T = TILE;

/** A crescent on the floor showing exactly the arc a swing covers. Built once per swing shape. */
function arcContext(reach: number, halfArc: number): GraphicsContext {
  const ctx = new GraphicsContext();
  const r1 = reach * T;
  const r0 = r1 * 0.5;
  const n = 14;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -halfArc + (i / n) * halfArc * 2;
    pts.push(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  for (let i = n; i >= 0; i--) {
    const a = -halfArc + (i / n) * halfArc * 2;
    // the inner edge bows outward in the middle, giving a blade-like crescent
    const k = 1 - Math.abs(i / n - 0.5) * 2;
    const r = r0 + (r1 - r0) * 0.55 * k;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.poly(pts).fill({ color: 0xffffff, alpha: 1 });
  return ctx;
}

interface Arc {
  g: Graphics;
  t: number;
  life: number;
  dir: number;
  active: boolean;
}

const colorOf = (slot: number): number => PLAYER_COLORS[slot] ?? RIM;

export class Fx {
  private readonly arcs: Arc[] = [];
  private readonly arcCtx: GraphicsContext[];
  private theme: ZoneTheme;
  /** Where this laptop's player stands: shake falls off with distance from here. */
  private focusX = 0;
  private focusY = 0;
  /** Whose hits are numbered loudest on this laptop. */
  private localSlot = 0;

  constructor(
    stage: Stage,
    private readonly particles: Particles,
    private readonly camera: Camera,
    private readonly numbers: DamageNumbers,
    theme: ZoneTheme,
  ) {
    this.theme = theme;
    this.arcCtx = [0, 1, 2].map((i) => arcContext(SWORD.reach[i], SWORD.halfArc[i]));
    for (let i = 0; i < 8; i++) {
      const g = new Graphics(this.arcCtx[0]);
      g.visible = false;
      stage.decals.addChild(g);
      this.arcs.push({ g, t: 0, life: 0.16, dir: 1, active: false });
    }
  }

  setTheme(theme: ZoneTheme): void {
    this.theme = theme;
  }

  /** Tell the effects where this laptop's own player is, and which seat is theirs. */
  setFocus(x: number, y: number, slot: number): void {
    this.focusX = x;
    this.focusY = y;
    this.localSlot = slot;
  }

  /** Shake for something that happened at (x, y): full strength nearby, none far away. */
  private shake(x: number, y: number, amount: number): void {
    const d = Math.hypot(x - this.focusX, y - this.focusY);
    const k = d < 4 ? 1 : d > 14 ? 0 : 1 - (d - 4) / 10;
    if (k > 0) this.camera.shake(amount * k);
  }

  handle(ev: SimEvent): void {
    const ps = this.particles;
    switch (ev.type) {
      case 'dash':
        ps.dust(ev.x, ev.y, -ev.dx, -ev.dy, this.theme.highlight, 7);
        ps.ring(ev.x, ev.y, colorOf(ev.player), 0.2, 0.9, 0.22, 0.45);
        break;
      case 'dashEnd':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 4);
        break;
      case 'dashCharge':
        break;
      case 'swing': {
        const arc = this.arcs.find((a) => !a.active) ?? this.arcs[0];
        arc.g.context = this.arcCtx[ev.n];
        arc.g.tint = colorOf(ev.player);
        arc.g.position.set(ev.x * T, ev.y * T);
        arc.g.rotation = ev.angle;
        arc.g.visible = true;
        arc.g.alpha = 0;
        arc.t = -SWORD.windup[ev.n];
        arc.life = ev.n === 2 ? 0.2 : 0.14;
        arc.dir = ev.n === 1 ? -1 : 1;
        arc.active = true;
        break;
      }
      case 'hit': {
        const z = 0.5;
        const power = ev.heavy ? 1.5 : 1;
        const returned = ev.kind === 'return' || ev.kind === 'carom' || ev.kind === 'slam';
        const tint = ev.by >= 0 ? colorOf(ev.by) : RIM;
        ps.sparks(ev.x, ev.y, z, ev.dx, ev.dy, returned ? tint : RIM, ev.heavy || returned ? 9 : 5, power);
        ps.ink(ev.x, ev.y, z, ev.dx, ev.dy, this.theme.inkWash, ev.heavy ? 8 : 4, power);
        ps.flash(ev.x, ev.y, z, returned ? tint : RIM, ev.heavy || returned ? 90 : 56);
        this.numbers.spawn(ev.x, ev.y, ev.amount, returned ? tint : HERO.rim, ev.heavy || returned);
        this.shake(ev.x, ev.y, ev.by === this.localSlot ? (ev.heavy || returned ? 0.26 : 0.1) : 0.05);
        if (ev.heavy && ev.by === this.localSlot) this.camera.kick(0.02);
        break;
      }
      case 'deflect':
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, colorOf(ev.player), 6, 0.8);
        ps.flash(ev.x, ev.y, 0.5, RIM, 46);
        break;
      case 'playerHurt':
        ps.sparks(ev.x, ev.y, 0.6, ev.dx, ev.dy, DANGER_HOT, 10, 1.2);
        ps.flash(ev.x, ev.y, 0.6, DANGER, 130, 0.2);
        ps.scraps(ev.x, ev.y, 0.7, HERO.coat, 4, 0.8);
        this.numbers.spawn(ev.x, ev.y, ev.amount, DANGER, true);
        if (ev.player === this.localSlot) {
          this.camera.shake(0.5);
          this.camera.kick(0.035);
        }
        break;
      case 'playerDown':
        ps.scraps(ev.x, ev.y, 0.7, HERO.coat, 16, 1.4);
        ps.scraps(ev.x, ev.y, 0.9, HERO.hat, 6, 1.2);
        ps.flash(ev.x, ev.y, 0.6, DANGER, 220, 0.4);
        ps.ring(ev.x, ev.y, DANGER, 0.3, 3.2, 0.6, 0.8);
        this.shake(ev.x, ev.y, 0.9);
        break;
      case 'enemySpawn':
        ps.ring(ev.x, ev.y, DANGER, 1.1, 0.3, 0.6, 0.5);
        break;
      case 'enemyWindup':
        ps.flash(ev.x, ev.y, 0.4, DANGER, 44, 0.16);
        break;
      case 'enemyAttack':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.inkWash, 4);
        break;
      case 'enemyStun':
        ps.ring(ev.x, ev.y, RIPE, 0.2, 0.9, 0.25, 0.8);
        break;
      case 'enemyDeath':
        ps.ink(ev.x, ev.y, 0.4, ev.dx, ev.dy, this.theme.inkWash, 16, 1.25);
        ps.ink(ev.x, ev.y, 0.4, -ev.dx, -ev.dy, this.theme.inkDark, 7, 0.7);
        ps.blot(ev.x, ev.y, this.theme.inkDark, 46);
        ps.scraps(ev.x, ev.y, 0.5, RIM, 5, 1);
        ps.flash(ev.x, ev.y, 0.4, RIM, 110, 0.18);
        ps.ring(ev.x, ev.y, RIM, 0.2, 1.3, 0.28, 0.5);
        this.shake(ev.x, ev.y, 0.22);
        break;
      case 'slam':
        ps.ring(ev.x, ev.y, DANGER, ev.radius * 0.4, ev.radius * 1.15, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 10);
        this.shake(ev.x, ev.y, 0.4);
        break;
      case 'projectileSpawn':
        ps.flash(ev.x, ev.y, 0.5, DANGER, 40, 0.1);
        break;
      case 'projectileEnd':
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, DANGER_HOT, ev.hit ? 5 : 2, 0.6);
        break;
      case 'waveStart':
        break;
      case 'refused':
        break;
      case 'shockwave':
        ps.ring(ev.x, ev.y, RIPE, ev.radius * 0.2, ev.radius, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
        this.shake(ev.x, ev.y, 0.2);
        break;
      case 'chime':
        ps.sparks(ev.x, ev.y, 0.6, 0, -1, CHIME, 3, 0.5);
        break;
      case 'armorBreak':
        ps.scraps(ev.x, ev.y, 0.5, RIM, 10, 1.2);
        ps.ring(ev.x, ev.y, RIPE, 0.2, 1.2, 0.3, 1);
        this.shake(ev.x, ev.y, 0.25);
        break;
      case 'roomClear':
        ps.ring(ev.x, ev.y, CHIME, 0.3, 4.5, 0.7, 0.7);
        ps.ring(ev.x, ev.y, RIPE, 0.2, 2.2, 0.5, 0.8);
        break;
      default: {
        // Adding a simulation event without deciding how it looks is a compile error here.
        const unhandled: never = ev;
        void unhandled;
      }
    }
  }

  update(dt: number): void {
    for (const a of this.arcs) {
      if (!a.active) continue;
      a.t += dt;
      if (a.t < 0) continue; // still in the wind-up
      const k = a.t / a.life;
      if (k >= 1) {
        a.active = false;
        a.g.visible = false;
        continue;
      }
      a.g.alpha = (1 - k) * 0.5;
      const s = 0.9 + 0.14 * k;
      a.g.scale.set(s, s * a.dir);
    }
  }

  clear(): void {
    for (const a of this.arcs) {
      a.active = false;
      a.g.visible = false;
    }
  }
}
