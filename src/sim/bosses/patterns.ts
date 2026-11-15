// The pieces boss patterns are made of, shared by every brain: a ring of bolts with gaps, an orb
// that leans toward whoever is nearest, the player furthest away, and the small clock test a
// pattern uses to do each of its steps exactly once.
import { TAU, dcos, dhypot, dsin } from '../../core/dmath';
import { nearestPlayer, spawnEnemy } from '../ai';
import { standing } from '../combat';
import { spawnProjectile } from '../projectiles';
import type { Enemy, Player, Projectile, World } from '../types';

/** True on the one tick a pattern's clock `t` (this tick included) passes `at`. */
export const passes = (t: number, dt: number, at: number): boolean => t - dt < at && t >= at;

export interface RingSpec {
  /** How many places round the ring, and how many gaps are left in it, evenly spread. */
  places: number;
  gaps: number;
  /** How many places wide each gap is. */
  gapWidth: number;
  speed: number;
  damage: number;
  range: number;
}

/** A ring of bolts spreading from a boss, with its first gap at place `gapAt`. */
export function ringOfBolts(w: World, e: Enemy, spec: RingSpec, gapAt: number): void {
  const apart = Math.max(1, Math.floor(spec.places / Math.max(1, spec.gaps)));
  for (let i = 0; i < spec.places; i++) {
    const from = (((i - gapAt) % apart) + apart) % apart;
    if (spec.gaps > 0 && from < spec.gapWidth) continue;
    const a = (i / spec.places) * TAU;
    spawnProjectile(w, {
      kind: 'bolt',
      faction: 'enemy',
      owner: e.id,
      x: e.x,
      y: e.y,
      vx: dcos(a) * spec.speed,
      vy: dsin(a) * spec.speed,
      radius: 0.16,
      damage: spec.damage * e.damageMul,
      range: spec.range,
    });
  }
  w.events.push({ type: 'shockwave', x: e.x, y: e.y, radius: e.radius + 1.2 });
}

/** The standing player furthest from a boss, so that nobody is ever simply out of its reach. */
export function furthest(w: World, e: Enemy): Player | null {
  let best: Player | null = null;
  let bd = -1;
  for (const p of w.players) {
    if (!standing(p)) continue;
    const d = (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y);
    if (d > bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** An orb still on its way to a player: it leans toward the nearest one by `lean` of its heading a second, at `speed`. */
export function leanOrb(w: World, pr: Projectile, speed: number, lean: number, dt: number): void {
  let ux = pr.vx;
  let uy = pr.vy;
  const l = dhypot(ux, uy) || 1;
  ux /= l;
  uy /= l;
  const p = nearestPlayer(w, pr.x, pr.y);
  if (p) {
    const tx = p.x - pr.x;
    const ty = p.y - pr.y;
    const tl = dhypot(tx, ty);
    if (tl > 1e-6) {
      ux += (tx / tl) * lean * dt;
      uy += (ty / tl) * lean * dt;
      const nl = dhypot(ux, uy) || 1;
      ux /= nl;
      uy /= nl;
    }
  }
  pr.vx = ux * speed;
  pr.vy = uy * speed;
}

/** Call Thrums to the chamber's spawn marks: `count` of them, but never more than `most` alive at once. */
export function callThrums(w: World, count: number, most: number): void {
  const thrum = w.content.enemies.thrum;
  const marks = w.room.spawnMarks;
  if (!thrum || marks.length === 0) return;
  let alive = 0;
  for (const o of w.enemies) if (!o.dead && o.defId === thrum.id) alive++;
  const call = Math.min(count, most - alive);
  const from = w.rng.int(0, marks.length - 1);
  for (let i = 0; i < call; i++) {
    const m = marks[(from + i) % marks.length];
    spawnEnemy(w, thrum, m.x, m.y);
  }
}
