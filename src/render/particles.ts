// Pooled particles. They live in world space (tiles, with height) so they fall, bounce and sort
// sensibly on the isometric floor, and are projected each frame. Sprites share a handful of
// generated textures; nothing is allocated while the game runs.
import { Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { ISO_COS, ISO_SIN, TILE, projX, projY } from '../core/iso';
import type { Stage } from './stage';
import type { Textures } from './textures';

export type ParticleLayer = 'glow' | 'crisp';

export interface Emit {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Seconds. */
  life: number;
  /** Size in pixels at birth and at death. */
  size: number;
  sizeEnd?: number;
  color: number;
  alpha?: number;
  /** Downward acceleration in tiles per second squared. */
  gravity?: number;
  /** Fraction of velocity lost per second. */
  drag?: number;
  /** Energy kept when it hits the floor (0 = sticks). */
  bounce?: number;
  layer?: ParticleLayer;
  texture?: 'soft' | 'disc' | 'shard' | 'streak' | 'ring';
  /** Spin in radians per second; streaks ignore it and point along their motion. */
  spin?: number;
  /** Lies flat on the floor: drawn squashed, as a ground mark. */
  flat?: boolean;
}

interface P {
  s: Sprite;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  alpha: number;
  gravity: number;
  drag: number;
  bounce: number;
  spin: number;
  streak: boolean;
  flat: boolean;
  texSize: number;
}

export class Particles {
  private readonly pool: P[] = [];
  private cursor = 0;
  private readonly tex: Record<NonNullable<Emit['texture']>, Texture>;

  constructor(
    private readonly stage: Stage,
    textures: Textures,
    capacity = 700,
  ) {
    this.tex = { soft: textures.soft, disc: textures.disc, shard: textures.shard, streak: textures.streak, ring: textures.ring };
    for (let i = 0; i < capacity; i++) {
      const s = new Sprite(textures.soft);
      s.anchor.set(0.5);
      s.visible = false;
      // Glow particles and crisp particles are split evenly across the two layers up front,
      // then moved between them only when an emit asks for the other layer.
      (i % 2 === 0 ? stage.fxGlow : stage.fxCrisp).addChild(s);
      this.pool.push({
        s,
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        sizeEnd: 1,
        alpha: 1,
        gravity: 0,
        drag: 0,
        bounce: 0,
        spin: 0,
        streak: false,
        flat: false,
        texSize: 64,
      });
    }
  }

  emit(o: Emit): void {
    // Take the next free slot; if the pool is full, recycle the oldest.
    let p: P | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[(this.cursor + i) % this.pool.length];
      if (!c.active) {
        p = c;
        this.cursor = (this.cursor + i + 1) % this.pool.length;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    const layer = o.layer ?? 'glow';
    const parent = layer === 'glow' ? this.stage.fxGlow : this.stage.fxCrisp;
    if (p.s.parent !== parent) parent.addChild(p.s);
    const name = o.texture ?? 'soft';
    const tex = this.tex[name];
    p.s.texture = tex;
    p.texSize = tex.width;
    p.s.tint = o.color;
    p.s.visible = true;
    p.s.rotation = name === 'shard' ? Math.random() * 6.283 : 0;
    p.active = true;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.life = o.life;
    p.maxLife = o.life;
    p.size = o.size;
    p.sizeEnd = o.sizeEnd ?? o.size;
    p.alpha = o.alpha ?? 1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.bounce = o.bounce ?? 0;
    p.spin = o.spin ?? 0;
    p.streak = name === 'streak';
    p.flat = !!o.flat;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.s.visible = false;
        continue;
      }
      p.vz -= p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        if (p.bounce > 0 && p.vz < -0.6) {
          p.vz = -p.vz * p.bounce;
          p.vx *= 0.6;
          p.vy *= 0.6;
        } else {
          p.vz = 0;
          p.vx *= 0.82;
          p.vy *= 0.82;
          p.spin = 0;
        }
      }
      const t = 1 - p.life / p.maxLife;
      const size = p.size + (p.sizeEnd - p.size) * t;
      const sc = size / p.texSize;
      const s = p.s;
      s.position.set(projX(p.x, p.y), projY(p.x, p.y, p.z));
      if (p.streak) {
        // Point along the on-screen velocity and stretch with speed.
        const svx = (p.vx - p.vy) * ISO_COS * TILE;
        const svy = (p.vx + p.vy) * ISO_SIN * TILE - p.vz * TILE;
        s.rotation = Math.atan2(svy, svx);
        const sp = Math.hypot(svx, svy);
        s.scale.set(sc * Math.min(3, 0.6 + sp / 260), sc * 1.4);
      } else if (p.flat) {
        s.scale.set(sc * 1.22, sc * 0.71);
      } else {
        s.scale.set(sc);
        if (p.spin !== 0) s.rotation += p.spin * dt;
      }
      // Quick fade-in, long fade-out.
      const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
      s.alpha = p.alpha * (fade < 0 ? 0 : fade > 1 ? 1 : fade);
    }
  }

  /** Remove everything at once (room change). */
  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.s.visible = false;
    }
  }

  destroy(): void {
    for (const p of this.pool) p.s.destroy();
    this.pool.length = 0;
  }

  // ------------------------------------------------------------ recipes

  /** Ink thrown off a struck body, biased along the blow. */
  ink(x: number, y: number, z: number, dx: number, dy: number, color: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.5;
      const sp = (2.2 + Math.random() * 4.5) * power;
      this.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 1.5 + Math.random() * 3.5,
        life: 0.35 + Math.random() * 0.35,
        size: 5 + Math.random() * 7,
        sizeEnd: 2,
        color,
        gravity: 16,
        drag: 1.5,
        layer: 'crisp',
        texture: 'disc',
      });
    }
  }

  /** A blot left on the floor. */
  blot(x: number, y: number, color: number, size: number): void {
    this.emit({ x, y, z: 0.01, life: 2.6, size, sizeEnd: size * 1.25, color, alpha: 0.55, layer: 'crisp', texture: 'disc', flat: true });
  }

  /** Bright sparks along a direction: the moment of impact. */
  sparks(x: number, y: number, z: number, dx: number, dy: number, color: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.9;
      const sp = (5 + Math.random() * 9) * power;
      this.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: (Math.random() - 0.2) * 4,
        life: 0.12 + Math.random() * 0.16,
        size: 16 + Math.random() * 14,
        sizeEnd: 4,
        color,
        drag: 5,
        gravity: 6,
        layer: 'glow',
        texture: 'streak',
      });
    }
  }

  /** A soft flash of light. */
  flash(x: number, y: number, z: number, color: number, size: number, life = 0.14): void {
    this.emit({ x, y, z, life, size, sizeEnd: size * 1.6, color, alpha: 0.9, layer: 'glow', texture: 'soft' });
  }

  /** Dust kicked up along the floor. */
  dust(x: number, y: number, dx: number, dy: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
      const sp = 0.6 + Math.random() * 1.8;
      this.emit({
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + (Math.random() - 0.5) * 0.3,
        z: 0.05,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 0.3 + Math.random() * 0.7,
        life: 0.35 + Math.random() * 0.3,
        size: 10 + Math.random() * 10,
        sizeEnd: 26,
        color,
        alpha: 0.32,
        drag: 3,
        layer: 'glow',
        texture: 'soft',
      });
    }
  }

  /** Scraps of paper tumbling away. */
  scraps(x: number, y: number, z: number, color: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const sp = (1.5 + Math.random() * 4) * power;
      this.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: 2.5 + Math.random() * 4,
        life: 0.7 + Math.random() * 0.6,
        size: 7 + Math.random() * 7,
        color,
        gravity: 11,
        drag: 1.2,
        bounce: 0.35,
        spin: (Math.random() - 0.5) * 16,
        layer: 'crisp',
        texture: 'shard',
      });
    }
  }

  /** An expanding ring on the floor. */
  ring(x: number, y: number, color: number, fromRadius: number, toRadius: number, life = 0.3, alpha = 0.8): void {
    // The ring texture's stroke sits at 58/64 of its half-size.
    const k = (2 * TILE) / (58 / 64);
    this.emit({ x, y, z: 0.02, life, size: fromRadius * k, sizeEnd: toRadius * k, color, alpha, layer: 'glow', texture: 'ring', flat: true });
  }
}
