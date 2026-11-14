// Projectiles: things in flight that hurt whoever is on the other side.
import { dhypot } from '../core/dmath';
import { circleTouchesSegment, closestT } from '../core/geom';
import { damageEnemy, damagePlayer, standing } from './combat';
import { isFloorTile } from './room';
import type { Enemy, Projectile, World } from './types';

export function spawnProjectile(
  w: World,
  o: {
    kind: string;
    faction: 'player' | 'enemy';
    /** An enemy id for enemy shots, a player slot for player shots. */
    owner: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    damage: number;
    range: number;
    light?: boolean;
  },
): Projectile {
  const speed = dhypot(o.vx, o.vy) || 1;
  const p: Projectile = {
    id: w.nextId++,
    kind: o.kind,
    faction: o.faction,
    owner: o.owner,
    x: o.x,
    y: o.y,
    px: o.x,
    py: o.y,
    vx: o.vx,
    vy: o.vy,
    radius: o.radius,
    damage: o.damage,
    life: o.range / speed + 0.05,
    range: o.range,
    light: o.light ?? false,
    dead: false,
  };
  w.projectiles.push(p);
  w.events.push({ type: 'projectileSpawn', id: p.id, kind: p.kind, x: p.x, y: p.y });
  return p;
}

function end(w: World, p: Projectile, hit: boolean): void {
  if (p.dead) return;
  p.dead = true;
  w.events.push({ type: 'projectileEnd', id: p.id, kind: p.kind, x: p.x, y: p.y, hit });
}

/** Remove a projectile early (struck out of the air, blocked). */
export function destroyProjectile(w: World, p: Projectile): void {
  end(w, p, true);
}

function hitsPillar(w: World, p: Projectile): boolean {
  for (const c of w.room.pillars) {
    if (circleTouchesSegment(c.x, c.y, c.r + p.radius, p.px, p.py, p.x, p.y)) return true;
  }
  return false;
}

export function stepProjectiles(w: World, dt: number): void {
  let anyDead = false;
  for (const p of w.projectiles) {
    if (p.dead) {
      anyDead = true;
      continue;
    }
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.range -= dhypot(p.vx, p.vy) * dt;

    if (p.faction === 'enemy') {
      // Swept test, so a fast shot cannot skip through a player between ticks.
      for (const pl of w.players) {
        if (!standing(pl) || pl.iframes > 0) continue;
        if (!circleTouchesSegment(pl.x, pl.y, pl.radius + p.radius, p.px, p.py, p.x, p.y)) continue;
        damagePlayer(w, pl, p.damage, p.px, p.py, 1.2);
        end(w, p, true);
        break;
      }
    } else {
      // The first enemy along the path is struck: nearest along the segment, lowest id on a tie.
      let best: Enemy | null = null;
      let bestT = Infinity;
      for (const e of w.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        if (!circleTouchesSegment(e.x, e.y, e.radius + p.radius, p.px, p.py, p.x, p.y)) continue;
        const t = closestT(e.x, e.y, p.px, p.py, p.x, p.y);
        if (t < bestT || (t === bestT && best !== null && e.id < best.id)) {
          best = e;
          bestT = t;
        }
      }
      if (best) {
        const sp = dhypot(p.vx, p.vy) || 1;
        damageEnemy(w, best, p.damage, { kind: 'return', by: p.owner, dx: p.vx / sp, dy: p.vy / sp, knock: 0.4, freeze: 2 });
        end(w, p, true);
      }
    }

    if (p.dead) {
      anyDead = true;
      continue;
    }
    if (p.life <= 0 || p.range <= 0) {
      end(w, p, false);
    } else if (hitsPillar(w, p)) {
      end(w, p, true);
    } else if (!isFloorTile(w.room, Math.floor(p.x), Math.floor(p.y))) {
      // Shots die a little way past the edge of the floor.
      const cx = Math.max(0, Math.min(w.room.w, p.x));
      const cy = Math.max(0, Math.min(w.room.h, p.y));
      if (dhypot(p.x - cx, p.y - cy) > 1.5) end(w, p, false);
    }
    if (p.dead) anyDead = true;
  }
  if (anyDead) w.projectiles = w.projectiles.filter((p) => !p.dead);
}
