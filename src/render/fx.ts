// Reactions to simulation events: sparks, ink, shake, the sweep of the Rod, damage numbers.
// One exhaustive switch: adding an event type without deciding how it looks fails the type-check.
import { Graphics, GraphicsContext } from 'pixi.js';
import { TILE } from '../core/iso';
import { ROD } from '../sim/tuning';
import type { SimEvent } from '../sim/types';
import type { Camera } from './camera';
import type { DamageNumbers } from './damageNumbers';
import { CHALK, DANGER, DANGER_HOT, HERO, RIM, RIPE } from './palette';
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

export class Fx {
  private readonly arcs: Arc[] = [];
  private readonly arcCtx: GraphicsContext[];
  private theme: ZoneTheme;

  constructor(
    stage: Stage,
    private readonly particles: Particles,
    private readonly camera: Camera,
    private readonly numbers: DamageNumbers,
    theme: ZoneTheme,
  ) {
    this.theme = theme;
    this.arcCtx = [0, 1, 2].map((i) => arcContext(ROD.reach[i], ROD.halfArc[i]));
    for (let i = 0; i < 4; i++) {
      const g = new Graphics(this.arcCtx[0]);
      g.visible = false;
      g.tint = HERO.rim;
      stage.decals.addChild(g);
      this.arcs.push({ g, t: 0, life: 0.16, dir: 1, active: false });
    }
  }

  setTheme(theme: ZoneTheme): void {
    this.theme = theme;
  }

  handle(ev: SimEvent): void {
    const ps = this.particles;
    switch (ev.type) {
      case 'dash':
        ps.dust(ev.x, ev.y, -ev.dx, -ev.dy, this.theme.highlight, 7);
        ps.ring(ev.x, ev.y, this.theme.highlight, 0.2, 0.9, 0.22, 0.45);
        break;
      case 'dashEnd':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 4);
        break;
      case 'dashCharge':
        break;
      case 'swing': {
        const arc = this.arcs.find((a) => !a.active) ?? this.arcs[0];
        arc.g.context = this.arcCtx[ev.n];
        arc.g.position.set(ev.x * T, ev.y * T);
        arc.g.rotation = ev.angle;
        arc.g.visible = true;
        arc.g.alpha = 0;
        arc.t = -ROD.windup[ev.n];
        arc.life = ev.n === 2 ? 0.2 : 0.14;
        arc.dir = ev.n === 1 ? -1 : 1;
        arc.active = true;
        break;
      }
      case 'hit': {
        const z = 0.5;
        const power = ev.heavy ? 1.5 : 1;
        const ripe = ev.kind === 'discharge';
        ps.sparks(ev.x, ev.y, z, ev.dx, ev.dy, ripe ? RIPE : ev.kind === 'line' ? CHALK : RIM, ev.heavy || ripe ? 9 : 5, power);
        ps.ink(ev.x, ev.y, z, ev.dx, ev.dy, this.theme.inkWash, ev.heavy ? 8 : 4, power);
        ps.flash(ev.x, ev.y, z, ripe ? RIPE : RIM, ev.heavy || ripe ? 90 : 56);
        this.numbers.spawn(ev.x, ev.y, ev.amount, ripe ? RIPE : ev.kind === 'line' ? CHALK : HERO.rim, ev.heavy || ripe);
        this.camera.shake(ev.heavy || ripe ? 0.26 : 0.1);
        if (ev.heavy) this.camera.kick(0.02);
        break;
      }
      case 'deflect':
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, RIM, 6, 0.8);
        ps.flash(ev.x, ev.y, 0.5, RIM, 46);
        break;
      case 'plumbFire':
        ps.dust(ev.x, ev.y, -Math.cos(ev.angle), -Math.sin(ev.angle), CHALK, 3);
        break;
      case 'plumbHook':
        ps.ring(ev.x, ev.y, CHALK, 0.15, 0.7, 0.2, 0.9);
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, CHALK, 6, 0.7);
        break;
      case 'plumbMiss':
        ps.dust(ev.x, ev.y, 0, 0, CHALK, 3);
        break;
      case 'playerHurt':
        ps.sparks(ev.x, ev.y, 0.6, ev.dx, ev.dy, DANGER_HOT, 10, 1.2);
        ps.flash(ev.x, ev.y, 0.6, DANGER, 130, 0.2);
        ps.scraps(ev.x, ev.y, 0.7, HERO.coat, 4, 0.8);
        this.numbers.spawn(ev.x, ev.y, ev.amount, DANGER, true);
        this.camera.shake(0.5);
        this.camera.kick(0.035);
        break;
      case 'playerDeath':
        ps.scraps(ev.x, ev.y, 0.7, HERO.coat, 16, 1.4);
        ps.scraps(ev.x, ev.y, 0.9, HERO.hat, 6, 1.2);
        ps.flash(ev.x, ev.y, 0.6, DANGER, 220, 0.4);
        ps.ring(ev.x, ev.y, DANGER, 0.3, 3.2, 0.6, 0.8);
        this.camera.shake(0.9);
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
        this.camera.shake(0.22);
        break;
      case 'slam':
        ps.ring(ev.x, ev.y, DANGER, ev.radius * 0.4, ev.radius * 1.15, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 10);
        this.camera.shake(0.4);
        break;
      case 'projectileSpawn':
        if (ev.kind !== 'plumb') ps.flash(ev.x, ev.y, 0.5, DANGER, 40, 0.1);
        break;
      case 'projectileEnd':
        if (ev.kind !== 'plumb') ps.sparks(ev.x, ev.y, 0.5, 0, 0, DANGER_HOT, ev.hit ? 5 : 2, 0.6);
        break;
      case 'waveStart':
        break;
      case 'refused':
        break;
      case 'stakePlant':
        ps.dust(ev.x, ev.y, 0, 0, CHALK, 5);
        ps.ring(ev.x, ev.y, CHALK, 0.1, 0.75, 0.25, 0.8);
        this.camera.shake(0.06);
        break;
      case 'whip':
        if (ev.live) {
          this.camera.shake(0.14);
          this.camera.kick(0.012);
        }
        break;
      case 'stakeLand':
        ps.dust(ev.x, ev.y, 0, 0, CHALK, 6);
        ps.ring(ev.x, ev.y, CHALK, 0.15, 0.9, 0.22, 0.9);
        ps.sparks(ev.x, ev.y, 0.2, 0, 0, CHALK, 5, 0.6);
        break;
      case 'stakeLost':
        ps.ring(ev.x, ev.y, DANGER, 0.2, 1.3, 0.4, 0.9);
        ps.scraps(ev.x, ev.y, 0.4, HERO.rodPale, 6, 0.9);
        this.camera.shake(0.25);
        break;
      case 'stakeReturn':
        break;
      case 'lineRipe': {
        // a snap of light runs the length of the line
        for (let i = 0; i <= 4; i++) {
          const k = i / 4;
          ps.flash(ev.ax + (ev.bx - ev.ax) * k, ev.ay + (ev.by - ev.ay) * k, 0.05, RIPE, 46, 0.22);
        }
        break;
      }
      case 'lineDischarge': {
        for (let i = 0; i <= 5; i++) {
          const k = i / 5;
          const x = ev.ax + (ev.bx - ev.ax) * k;
          const y = ev.ay + (ev.by - ev.ay) * k;
          ps.flash(x, y, 0.05, RIPE, 70, 0.2);
          ps.sparks(x, y, 0.1, 0, 0, RIPE, 2, 0.7);
        }
        this.camera.shake(0.2);
        break;
      }
      case 'lineSever':
        ps.sparks(ev.x, ev.y, 0.1, 0, 0, DANGER_HOT, 8, 0.8);
        ps.ring(ev.x, ev.y, DANGER, 0.1, 0.8, 0.25, 0.8);
        break;
      case 'lineMend':
        break;
      case 'hammer':
        ps.ring(ev.x, ev.y, RIPE, 0.15, 1.4, 0.3, 1);
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, RIPE, 12, 1);
        ps.flash(ev.x, ev.y, 0.4, RIPE, 120, 0.2);
        this.camera.shake(0.22);
        break;
      case 'dashRefund':
        ps.ring(ev.x, ev.y, CHALK, 0.2, 1.1, 0.25, 0.9);
        break;
      case 'plotChange':
        break;
      case 'enemySurface':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 10);
        ps.ring(ev.x, ev.y, RIPE, 0.2, 1.2, 0.3, 0.8);
        break;
      case 'hostilePlant':
        ps.ring(ev.x, ev.y, DANGER, 0.9, 0.2, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, DANGER, 4);
        break;
      case 'hostileBreak':
        ps.scraps(ev.x, ev.y, 0.4, DANGER, 5, 0.8);
        ps.sparks(ev.x, ev.y, 0.3, 0, 0, DANGER_HOT, 6, 0.7);
        break;
      case 'hostileCross':
        ps.sparks(ev.x, ev.y, 0.4, 0, 0, DANGER_HOT, 8, 1);
        break;
      case 'shockwave':
        ps.ring(ev.x, ev.y, RIPE, ev.radius * 0.2, ev.radius, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, CHALK, 8);
        this.camera.shake(0.2);
        break;
      case 'beam': {
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          ps.flash(ev.ax + (ev.bx - ev.ax) * k, ev.ay + (ev.by - ev.ay) * k, 0.1, RIPE, 60, 0.22);
        }
        this.camera.shake(0.25);
        break;
      }
      case 'zone':
        break;
      case 'shield':
        ps.ring(ev.x, ev.y, ev.on ? RIPE : RIM, ev.on ? 1.2 : 0.3, ev.on ? 0.5 : 1.3, 0.3, 0.9);
        break;
      case 'chalk':
        ps.sparks(ev.x, ev.y, 0.6, 0, -1, RIM, 3, 0.5);
        break;
      case 'teleport':
        ps.ring(ev.x, ev.y, CHALK, 0.2, 1.4, 0.3, 0.9);
        ps.flash(ev.x, ev.y, 0.5, CHALK, 120, 0.2);
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
