// Reactions to simulation events: rings on the floor where things bounce, sparks, shake, the
// sweep of a swing, damage numbers. One exhaustive switch: adding an event type without deciding
// how it looks fails the type-check.
import { Graphics, GraphicsContext } from 'pixi.js';
import { TILE } from '../core/iso';
import { mixColor } from '../core/math';
import { FIST, HAYMAKER, RALLY as RALLY_RULES, SWORD } from '../sim/tuning';
import type { SimEvent } from '../sim/types';
import type { Camera } from './camera';
import type { DamageNumbers } from './damageNumbers';
import { CHIME, DANGER, DANGER_HOT, PLAYER_COLORS, PLAYER_PALE, RALLY, RIM, STATUS } from './palette';
import { TONES } from './palette/tones';
import type { Tone } from './palette/tones';
import type { ZoneTheme } from './palette';
import type { Particles } from './particles';
import type { Stage } from './stage';

const T = TILE;

/** A crescent on the floor showing exactly the arc a blow covers. Built once per shape. */
function arcContext(reach: number, halfArc: number, inner = 0.5): GraphicsContext {
  const ctx = new GraphicsContext();
  const r1 = reach * T;
  const r0 = r1 * inner;
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
  peak: number;
  active: boolean;
}

const colorOf = (slot: number): number => PLAYER_COLORS[slot] ?? RIM;
const paleOf = (slot: number): number => PLAYER_PALE[slot] ?? RIM;

/** The family each kind of burst belongs to. */
const BURST_TONE: Readonly<Record<string, Tone>> = { overtone: TONES.rally, steam: TONES.frost, ward: TONES.body };

export class Fx {
  private readonly arcs: Arc[] = [];
  private readonly swingCtx: GraphicsContext[];
  private readonly jabCtx: GraphicsContext;
  private readonly punchCtx: GraphicsContext;
  private theme: ZoneTheme;
  /** Where this laptop's player stands: shake falls off with distance from here. */
  private focusX = 0;
  private focusY = 0;
  /** Whose hits are felt hardest on this laptop. */
  private localSlot = 0;

  constructor(
    stage: Stage,
    private readonly particles: Particles,
    private readonly camera: Camera,
    private readonly numbers: DamageNumbers,
    theme: ZoneTheme,
  ) {
    this.theme = theme;
    this.swingCtx = [0, 1, 2].map((i) => arcContext(SWORD.reach[i], SWORD.halfArc[i]));
    this.jabCtx = arcContext(FIST.reach, FIST.halfArc, 0.62);
    this.punchCtx = arcContext(HAYMAKER.reach + HAYMAKER.lunge * 0.5, HAYMAKER.halfArc, 0.2);
    for (let i = 0; i < 12; i++) {
      const g = new Graphics(this.swingCtx[0]);
      g.visible = false;
      stage.decals.addChild(g);
      this.arcs.push({ g, t: 0, life: 0.16, dir: 1, peak: 0.5, active: false });
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

  private arc(ctx: GraphicsContext, slot: number, x: number, y: number, angle: number, delay: number, life: number, dir: number, peak: number): void {
    const arc = this.arcs.find((a) => !a.active) ?? this.arcs[0];
    arc.g.context = ctx;
    arc.g.tint = colorOf(slot);
    arc.g.position.set(x * T, y * T);
    arc.g.rotation = angle;
    arc.g.visible = true;
    arc.g.alpha = 0;
    arc.t = -delay;
    arc.life = life;
    arc.dir = dir;
    arc.peak = peak;
    arc.active = true;
  }

  /** A ring on the floor where something bounced: the mark this whole game leaves. */
  private ripple(x: number, y: number, color: number, size: number): void {
    const ps = this.particles;
    ps.ring(x, y, color, 0.08, size, 0.34, 0.85);
    ps.ring(x, y, RIM, 0.04, size * 0.55, 0.22, 0.5);
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
      case 'specialReady':
      case 'waveStart':
      case 'refused':
      case 'rallyBreak':
      case 'bombThrow':
        // told by the HUD, a sound, or the thing itself
        break;
      case 'swing':
        if (ev.halfArc > 3) {
          // a Ring Cut goes all the way round: two rings thrown out from the blade to its reach
          ps.ring(ev.x, ev.y, colorOf(ev.player), ev.reach * 0.35, ev.reach, 0.2, 0.95);
          ps.ring(ev.x, ev.y, paleOf(ev.player), ev.reach * 0.15, ev.reach * 0.92, 0.26, 0.8);
          ps.flash(ev.x, ev.y, 0.3, paleOf(ev.player), 150, 0.14);
          if (ev.player === this.localSlot) this.camera.kick(0.014);
          break;
        }
        this.arc(this.swingCtx[ev.n] ?? this.swingCtx[0], ev.player, ev.x, ev.y, ev.angle, SWORD.windup[ev.n] ?? 0.07, ev.n === 2 ? 0.2 : 0.14, ev.n === 1 ? -1 : 1, ev.n === 2 ? 0.75 : 0.5);
        if (ev.n === 2) {
          // the finisher comes down on the floor in front: a second, wider arc, and the ground answers
          this.arc(this.swingCtx[2], ev.player, ev.x, ev.y, ev.angle, (SWORD.windup[2] ?? 0.12) + 0.04, 0.24, -1, 0.4);
          const fx = ev.x + Math.cos(ev.angle) * ev.reach * 0.7;
          const fy = ev.y + Math.sin(ev.angle) * ev.reach * 0.7;
          ps.ring(fx, fy, paleOf(ev.player), 0.2, 1.3, 0.3, 0.7);
          ps.dust(fx, fy, Math.cos(ev.angle), Math.sin(ev.angle), this.theme.highlight, 8);
          if (ev.player === this.localSlot) this.camera.kick(0.012);
        }
        break;
      case 'jab':
        this.arc(this.jabCtx, ev.player, ev.x, ev.y, ev.angle, FIST.windup[ev.n] ?? 0.04, ev.n === 2 ? 0.16 : 0.1, ev.n === 1 ? -1 : 1, ev.n === 2 ? 0.55 : 0.4);
        break;
      case 'loose': {
        const mx = ev.x + Math.cos(ev.angle) * 0.5;
        const my = ev.y + Math.sin(ev.angle) * 0.5;
        ps.flash(mx, my, 0.7, paleOf(ev.player), ev.n === 2 ? 70 : 34, ev.n === 2 ? 0.12 : 0.08);
        if (ev.n === 2) {
          // the full-draw shot of a run: the string's snap can be seen
          ps.ring(mx, my, paleOf(ev.player), 0.1, 0.8, 0.2, 0.8);
          ps.sparks(mx, my, 0.7, Math.cos(ev.angle), Math.sin(ev.angle), paleOf(ev.player), 5, 1.4);
          if (ev.player === this.localSlot) this.camera.kick(0.006);
        }
        break;
      }
      case 'chargeFull':
        ps.ring(ev.x, ev.y, paleOf(ev.player), 1.3, 0.45, 0.2, 0.9);
        ps.flash(ev.x, ev.y, 0.7, paleOf(ev.player), 80, 0.12);
        break;
      case 'haymaker':
        this.arc(this.punchCtx, ev.player, ev.x, ev.y, ev.angle, 0, 0.2, 1, 0.45 + 0.35 * ev.charge);
        ps.dust(ev.x, ev.y, -Math.cos(ev.angle), -Math.sin(ev.angle), this.theme.highlight, 6 + Math.round(8 * ev.charge));
        if (ev.player === this.localSlot) this.camera.kick(0.012 + 0.02 * ev.charge);
        break;
      case 'breakSlam':
        ps.ring(ev.x, ev.y, colorOf(ev.player), 0.3, ev.radius, 0.28, 0.9);
        ps.ring(ev.x, ev.y, paleOf(ev.player), 0.2, ev.radius * 0.7, 0.2, 0.7);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 14);
        this.shake(ev.x, ev.y, 0.5);
        break;
      case 'whirl':
        // the cut lands all the way round at once: two rings thrown out to its reach, and the floor answers
        ps.ring(ev.x, ev.y, colorOf(ev.player), ev.radius * 0.3, ev.radius, 0.24, 0.95);
        ps.ring(ev.x, ev.y, paleOf(ev.player), ev.radius * 0.12, ev.radius * 0.9, 0.3, 0.7);
        ps.flash(ev.x, ev.y, 0.3, paleOf(ev.player), 150, 0.14);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 10);
        this.shake(ev.x, ev.y, 0.3);
        if (ev.player === this.localSlot) this.camera.kick(0.016);
        break;
      case 'reflect':
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, paleOf(ev.player), ev.perfect ? 14 : 7, ev.perfect ? 1.5 : 0.9);
        ps.flash(ev.x, ev.y, 0.5, paleOf(ev.player), ev.perfect ? 130 : 60, 0.12);
        this.ripple(ev.x, ev.y, colorOf(ev.player), ev.perfect ? 1.6 : 0.8);
        if (ev.perfect) {
          this.shake(ev.x, ev.y, 0.4);
          if (ev.player === this.localSlot) this.camera.kick(0.035);
        }
        break;
      case 'ricochet': {
        const color = ev.by >= 0 ? colorOf(ev.by) : DANGER;
        this.ripple(ev.x, ev.y, ev.off === 'bumper' ? this.theme.bumperHot : color, 0.5 + Math.min(4, ev.n) * 0.14);
        ps.sparks(ev.x, ev.y, 0.5, ev.nx, ev.ny, ev.by >= 0 ? paleOf(ev.by) : DANGER_HOT, 4, 0.7);
        break;
      }
      case 'skip':
        ps.sparks(ev.fromX, ev.fromY, 0.5, ev.toX - ev.fromX, ev.toY - ev.fromY, paleOf(ev.by), 4, 0.8);
        break;
      case 'launch':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 5);
        ps.ring(ev.x, ev.y, colorOf(ev.by), 0.25, 0.4 + Math.min(1, ev.speed / 26) * 0.9, 0.24, 0.7);
        if (ev.by === this.localSlot) this.shake(ev.x, ev.y, Math.min(0.4, ev.speed * 0.014));
        break;
      case 'wallSlam': {
        const hard = Math.min(1, ev.speed / 22);
        const color = ev.off === 'bumper' ? this.theme.bumperHot : colorOf(ev.by);
        this.ripple(ev.x, ev.y, color, 0.5 + hard * 1.3);
        if (ev.speed > 4) {
          ps.sparks(ev.x, ev.y, 0.5, ev.nx, ev.ny, RIM, 4 + Math.round(hard * 10), 0.8 + hard);
          ps.dust(ev.x, ev.y, ev.nx, ev.ny, this.theme.highlight, 3 + Math.round(hard * 6));
          this.shake(ev.x, ev.y, 0.1 + hard * 0.45);
        }
        break;
      }
      case 'carom': {
        const hard = Math.min(1, ev.speed / 22);
        this.ripple(ev.x, ev.y, colorOf(ev.by), 0.7 + hard * 1.2);
        ps.flash(ev.x, ev.y, 0.5, paleOf(ev.by), 70 + hard * 90, 0.14);
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, paleOf(ev.by), 6 + Math.round(hard * 10), 1 + hard);
        this.shake(ev.x, ev.y, 0.18 + hard * 0.4);
        break;
      }
      case 'ringOut':
        // the ring closes on where it fell
        ps.ring(ev.x, ev.y, colorOf(ev.by), 1.5, 0.15, 0.4, 0.9);
        ps.ring(ev.x, ev.y, this.theme.accent, 1.0, 0.1, 0.5, 0.6);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
        this.shake(ev.x, ev.y, 0.3);
        break;
      case 'climbOut':
      case 'land':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 5);
        break;
      case 'stagger':
        ps.ring(ev.x, ev.y, STATUS.stagger, 0.3, 1.4, 0.35, 0.9);
        ps.sparks(ev.x, ev.y, 0.9, 0, 0, STATUS.stagger, 9, 1.1);
        this.shake(ev.x, ev.y, 0.2);
        break;
      case 'rally': {
        // the higher the Rally, the whiter and wider the note
        const k = ev.value / RALLY_RULES.cap;
        ps.ring(ev.x, ev.y, mixColor(RALLY.low, RALLY.high, k), 0.15, 0.6 + k * 1.2, 0.4, 0.55 + k * 0.4);
        break;
      }
      case 'duet': {
        // two colours, one bounce: a ring in each
        ps.ring(ev.x, ev.y, colorOf(ev.a), 0.2, 1.5, 0.4, 0.9);
        ps.ring(ev.x, ev.y, colorOf(ev.b), 0.1, 1.1, 0.32, 0.9);
        ps.sparks(ev.x, ev.y, 0.6, 0, 0, paleOf(ev.b), 10, 1.2);
        ps.flash(ev.x, ev.y, 0.6, paleOf(ev.a), 90, 0.14);
        break;
      }
      case 'revive':
        ps.ring(ev.x, ev.y, colorOf(ev.player), 0.3, 2.2, 0.5, 0.9);
        ps.ring(ev.x, ev.y, paleOf(ev.by), 1.6, 0.3, 0.35, 0.7);
        ps.sparks(ev.x, ev.y, 0.8, 0, -1, paleOf(ev.player), 12, 1.1);
        ps.flash(ev.x, ev.y, 0.7, paleOf(ev.player), 140, 0.2);
        break;
      case 'hook': {
        // the line leaves the Bow and bites where it is made fast
        const d = Math.hypot(ev.toX - ev.x, ev.toY - ev.y) || 1;
        ps.flash(ev.x, ev.y, 0.7, paleOf(ev.player), 60, 0.1);
        ps.dust(ev.x, ev.y, -(ev.toX - ev.x) / d, -(ev.toY - ev.y) / d, this.theme.highlight, 5);
        ps.sparks(ev.toX, ev.toY, 0.4, -(ev.toX - ev.x) / d, -(ev.toY - ev.y) / d, paleOf(ev.player), 6, 1);
        ps.ring(ev.toX, ev.toY, colorOf(ev.player), 0.5, 0.15, 0.2, 0.9);
        break;
      }
      case 'hookLand':
        this.ripple(ev.x, ev.y, colorOf(ev.player), 1.1);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
        ps.flash(ev.x, ev.y, 0.5, paleOf(ev.player), 90, 0.12);
        if (ev.player === this.localSlot) this.camera.kick(0.014);
        break;
      case 'bombLand':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 5);
        ps.ring(ev.x, ev.y, DANGER, 0.2, 0.5, 0.2, 0.6);
        break;
      case 'bombBat':
        ps.sparks(ev.x, ev.y, 0.3, 0, 0, paleOf(ev.player), 8, 1);
        ps.flash(ev.x, ev.y, 0.3, paleOf(ev.player), 70, 0.1);
        break;
      case 'bombBurst': {
        const color = ev.by >= 0 ? colorOf(ev.by) : DANGER;
        const pale = ev.by >= 0 ? paleOf(ev.by) : DANGER_HOT;
        ps.flash(ev.x, ev.y, 0.4, pale, 260, 0.2);
        ps.ring(ev.x, ev.y, color, ev.radius * 0.3, ev.radius, 0.3, 1);
        ps.ring(ev.x, ev.y, pale, ev.radius * 0.15, ev.radius * 0.75, 0.22, 0.8);
        ps.sparks(ev.x, ev.y, 0.4, 0, 0, pale, 16, 1.6);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 12);
        this.shake(ev.x, ev.y, 0.6);
        break;
      }
      case 'hit': {
        const z = 0.5;
        const power = ev.heavy ? 1.5 : 1;
        // A Return (anything that came back, or was bounced) is told apart at a glance.
        const returned = ev.kind === 'return' || ev.kind === 'carom' || ev.kind === 'slam' || ev.kind === 'ringout';
        const tint = ev.by >= 0 ? colorOf(ev.by) : RIM;
        ps.sparks(ev.x, ev.y, z, ev.dx, ev.dy, returned ? tint : RIM, ev.heavy || returned ? 9 : 5, power);
        ps.ink(ev.x, ev.y, z, ev.dx, ev.dy, this.theme.inkWash, ev.heavy ? 8 : 4, power);
        ps.flash(ev.x, ev.y, z, returned ? tint : RIM, ev.crit ? 130 : ev.heavy || returned ? 90 : 56);
        this.numbers.spawn(ev.x, ev.y, ev.amount, returned ? (ev.by >= 0 ? paleOf(ev.by) : RALLY.low) : RIM, ev.heavy || returned);
        this.shake(ev.x, ev.y, ev.by === this.localSlot ? (ev.crit ? 0.4 : ev.heavy || returned ? 0.24 : 0.09) : 0.05);
        if ((ev.heavy || ev.crit) && ev.by === this.localSlot) this.camera.kick(ev.crit ? 0.03 : 0.018);
        break;
      }
      case 'playerHurt':
        ps.sparks(ev.x, ev.y, 0.6, ev.dx, ev.dy, DANGER_HOT, 10, 1.2);
        ps.flash(ev.x, ev.y, 0.6, DANGER, 130, 0.2);
        ps.scraps(ev.x, ev.y, 0.7, colorOf(ev.player), 4, 0.8);
        this.numbers.spawn(ev.x, ev.y, ev.amount, DANGER, true);
        if (ev.player === this.localSlot) {
          this.camera.shake(0.5);
          this.camera.kick(0.035);
        }
        break;
      case 'playerDown':
        ps.scraps(ev.x, ev.y, 0.7, colorOf(ev.player), 16, 1.4);
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
        ps.ring(ev.x, ev.y, RIM, 0.2, 0.9, 0.25, 0.8);
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
        break;
      case 'projectileEnd':
        ps.sparks(ev.x, ev.y, 0.5, 0, 0, RIM, ev.hit ? 4 : 2, 0.5);
        break;
      case 'shockwave':
        ps.ring(ev.x, ev.y, RIM, ev.radius * 0.2, ev.radius, 0.3, 0.9);
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
        this.shake(ev.x, ev.y, 0.2);
        break;
      case 'chime':
        ps.sparks(ev.x, ev.y, 0.6, 0, -1, CHIME, 3, 0.5);
        break;
      case 'armorBreak':
        ps.scraps(ev.x, ev.y, 0.5, RIM, 10, 1.2);
        ps.ring(ev.x, ev.y, RIM, 0.2, 1.2, 0.3, 1);
        this.shake(ev.x, ev.y, 0.25);
        break;
      case 'roomClear':
        ps.ring(ev.x, ev.y, CHIME, 0.3, 4.5, 0.7, 0.7);
        ps.ring(ev.x, ev.y, RIM, 0.2, 2.2, 0.5, 0.8);
        break;
      case 'tuning':
        ps.ring(ev.x, ev.y, colorOf(ev.player), 0.3, 2.4, 0.6, 0.9);
        ps.sparks(ev.x, ev.y, 0.8, 0, -1, paleOf(ev.player), 12, 1.1);
        break;
      case 'burst': {
        // a burst wears the colour of the family that made it
        const tone = BURST_TONE[ev.what];
        const color = tone ? tone.color : ev.by >= 0 ? colorOf(ev.by) : RIM;
        const pale = tone ? tone.pale : ev.by >= 0 ? paleOf(ev.by) : RIM;
        ps.flash(ev.x, ev.y, 0.3, pale, 160, 0.16);
        ps.ring(ev.x, ev.y, color, ev.radius * 0.25, ev.radius, 0.32, 0.95);
        ps.ring(ev.x, ev.y, pale, ev.radius * 0.1, ev.radius * 0.7, 0.22, 0.7);
        this.shake(ev.x, ev.y, 0.25);
        break;
      }
      case 'bolt': {
        // a broken line of sparks from one Echo to the next
        const pale = TONES.storm.pale;
        for (let i = 1; i <= 5; i++) {
          const k = i / 5;
          ps.sparks(ev.fromX + (ev.toX - ev.fromX) * k, ev.fromY + (ev.toY - ev.fromY) * k, 0.6, 0, 0, pale, 2, 0.35);
        }
        ps.flash(ev.toX, ev.toY, 0.5, pale, 90, 0.12);
        break;
      }
      case 'heal':
        ps.sparks(ev.x, ev.y, 0.7, 0, -1, CHIME, 6, 0.8);
        break;
      case 'ward':
        ps.flash(ev.x, ev.y, 0.5, paleOf(ev.player), 220, 0.22);
        ps.ring(ev.x, ev.y, RIM, 0.3, 1.6, 0.4, 1);
        this.shake(ev.x, ev.y, 0.4);
        break;
      case 'afterimage':
        ps.ring(ev.x, ev.y, paleOf(ev.player), 0.2, 1.3, 0.3, 0.8);
        break;
      case 'clang':
        ps.sparks(ev.x, ev.y, 0.7, 0, 0, RIM, 8, 1.2);
        ps.ring(ev.x, ev.y, RIM, 0.2, 0.9, 0.2, 0.8);
        break;
      case 'grounded':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 10);
        ps.ring(ev.x, ev.y, RIM, 0.2, 1.3, 0.3, 0.8);
        this.shake(ev.x, ev.y, 0.2);
        break;
      case 'takeoff':
        ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 6);
        break;
      case 'trapWarn':
        // the warning on the floor says it; the trap itself is drawn by its own extra
        break;
      case 'trapStrike':
        if (ev.kind === 'spikes') {
          ps.sparks(ev.x, ev.y, 0.3, 0, -1, DANGER_HOT, 6, 1.2);
          this.shake(ev.x, ev.y, 0.12);
        } else if (ev.kind === 'knell') {
          ps.ring(ev.x, ev.y, DANGER, 0.5, 2.5, 0.35, 0.9);
          ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
          this.shake(ev.x, ev.y, 0.25);
        } else {
          ps.flash(ev.x, ev.y, 0.8, DANGER_HOT, 90, 0.12);
        }
        break;
      case 'strike':
        // the warning itself flashes where it lands; this is the dust and the jolt
        if (ev.shape === 'circle') {
          ps.ring(ev.x, ev.y, DANGER, Math.max(ev.inner, ev.radius * 0.4), ev.radius * 1.08, 0.3, 0.9);
          ps.dust(ev.x, ev.y, 0, 0, this.theme.highlight, 8);
        } else {
          const reach = ev.shape === 'lane' ? ev.length : ev.radius;
          for (let i = 1; i <= 4; i++) ps.dust(ev.x + Math.cos(ev.angle) * reach * (i / 4), ev.y + Math.sin(ev.angle) * reach * (i / 4), 0, 0, this.theme.highlight, 4);
        }
        this.shake(ev.x, ev.y, 0.3);
        break;
      case 'bellCrack':
        ps.flash(ev.x, ev.y, 0.9, CHIME, 300, 0.25);
        ps.ring(ev.x, ev.y, CHIME, 0.4, 5, 0.6, 0.9);
        ps.scraps(ev.x, ev.y, 0.9, CHIME, 14, 1.6);
        this.shake(ev.x, ev.y, 0.5);
        break;
      case 'bossPhase':
        ps.flash(ev.x, ev.y, 0.6, DANGER_HOT, 420, 0.3);
        ps.ring(ev.x, ev.y, DANGER, 0.5, 9, 0.8, 0.9);
        ps.ring(ev.x, ev.y, RIM, 0.3, 5, 0.6, 0.8);
        this.shake(ev.x, ev.y, 0.8);
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
      a.g.alpha = (1 - k) * a.peak;
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
