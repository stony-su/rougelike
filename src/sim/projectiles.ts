// Projectiles: enemy shots, and the player's plumb bob.
import { circleTouchesSegment } from '../core/geom';
import { damageEnemy, damagePlayer } from './combat';
import { breakHostileNear, relocateStake } from './lines';
import { isFloorTile } from './room';
import { PLUMB } from './tuning';
import type { Projectile, World } from './types';

export function spawnProjectile(
  w: World,
  o: {
    kind: string;
    faction: 'player' | 'enemy';
    owner?: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    damage: number;
    range: number;
    light?: boolean;
    targetStake?: number;
  },
): Projectile {
  const speed = Math.hypot(o.vx, o.vy) || 1;
  const p: Projectile = {
    id: w.nextId++,
    kind: o.kind,
    faction: o.faction,
    owner: o.owner ?? 0,
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
    targetStake: o.targetStake ?? -1,
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

/** Remove a projectile early (deflected by the Rod, reflected, blocked). */
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
  const pl = w.player;
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
    p.range -= Math.hypot(p.vx, p.vy) * dt;

    if (p.faction === 'enemy') {
      // Swept test, so a fast shot cannot skip through the player between ticks.
      if (pl.state !== 'dead' && circleTouchesSegment(pl.x, pl.y, pl.radius + p.radius, p.px, p.py, p.x, p.y)) {
        if (pl.iframes <= 0) {
          damagePlayer(w, p.damage, p.px, p.py, 1.2);
          end(w, p, true);
        }
      }
    } else if (p.kind === 'plumb') {
      // First enemy along the path is hooked.
      let best = null as null | { e: (typeof w.enemies)[number]; d: number };
      for (const e of w.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        if (!circleTouchesSegment(e.x, e.y, e.radius + p.radius, p.px, p.py, p.x, p.y)) continue;
        const d = Math.hypot(e.x - p.px, e.y - p.py);
        if (!best || d < best.d) best = { e, d };
      }
      if (best) {
        const e = best.e;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        p.x = e.x;
        p.y = e.y;
        w.events.push({ type: 'plumbHook', x: e.x, y: e.y, target: e.id });
        const killed = damageEnemy(w, e, p.damage, { kind: 'plumb', dx: p.vx / sp, dy: p.vy / sp });
        if (!killed && e.def.mass < 3) {
          // Drag toward the player, stopping short of standing on top of them.
          const dx = pl.x - e.x;
          const dy = pl.y - e.y;
          const dist = Math.hypot(dx, dy);
          const pull = Math.max(0, Math.min(PLUMB.drag / e.def.mass, dist - (pl.radius + e.radius + 0.35)));
          if (pull > 0.05) {
            e.dragT = PLUMB.dragTime;
            e.dragVX = (dx / dist) * (pull / PLUMB.dragTime);
            e.dragVY = (dy / dist) * (pull / PLUMB.dragTime);
          }
        }
        end(w, p, true);
      }
      // Otherwise it may catch what it was cast at: one of the player's own stakes, yanked home.
      if (!p.dead && p.targetStake >= 0) {
        const st = w.lines.stakes[p.targetStake];
        if (st && st.state === 'planted' && circleTouchesSegment(st.x, st.y, PLUMB.stakeCatchRadius, p.px, p.py, p.x, p.y)) {
          p.x = st.x;
          p.y = st.y;
          w.events.push({ type: 'plumbHook', x: st.x, y: st.y, target: 0 });
          relocateStake(w, st.id, pl.x, pl.y, 'yank');
          end(w, p, true);
        }
      }
      // It uproots hostile stakes it touches.
      if (!p.dead && breakHostileNear(w, p.x, p.y, 0.45) > 0) {
        w.events.push({ type: 'plumbHook', x: p.x, y: p.y, target: 0 });
        end(w, p, true);
      }
    }

    if (p.dead) {
      anyDead = true;
      continue;
    }
    if (p.life <= 0 || p.range <= 0) {
      if (p.kind === 'plumb') w.events.push({ type: 'plumbMiss', x: p.x, y: p.y });
      end(w, p, false);
    } else if (hitsPillar(w, p)) {
      if (p.kind === 'plumb') w.events.push({ type: 'plumbMiss', x: p.x, y: p.y });
      end(w, p, true);
    } else if (p.faction === 'enemy' && !isFloorTile(w.room, Math.floor(p.x), Math.floor(p.y))) {
      // Enemy shots die a little way past the edge of the sheet.
      const cx = Math.max(0, Math.min(w.room.w, p.x));
      const cy = Math.max(0, Math.min(w.room.h, p.y));
      if (Math.hypot(p.x - cx, p.y - cy) > 1.5) end(w, p, false);
    }
    if (p.dead) anyDead = true;
  }
  if (anyDead) w.projectiles = w.projectiles.filter((p) => !p.dead);
}
