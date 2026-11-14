// Ringstones: the bumper a Bow player throws. Planted, it sends arrows, returned shots and
// launched bodies at the nearest Echo (the bouncing itself is in projectiles.ts and bodies.ts).
// Nobody trips on one: it hangs just above the floor.
import { dcos, dsin } from '../core/dmath';
import { SKIN, castCircle, newHit } from './cast';
import { RINGSTONE } from './tuning';
import type { Player, Ringstone, World } from './types';

function retire(w: World, s: Ringstone): void {
  if (s.dead) return;
  s.dead = true;
  w.events.push({ type: 'stoneEnd', id: s.id, x: s.x, y: s.y });
}

/** Throw a Ringstone at the aimed point. It stops short of any wall or post; an older stone of the same player is gone. */
export function throwStone(w: World, p: Player): Ringstone {
  for (const s of w.stones) if (s.owner === p.slot) retire(w, s);
  const reach = Math.max(1.5, Math.min(p.aimDist, RINGSTONE.range));
  const dx = dcos(p.aim) * reach;
  const dy = dsin(p.aim) * reach;
  const hit = newHit();
  let t = 1;
  if (castCircle(w.room.geo, false, p.x, p.y, dx, dy, RINGSTONE.radius, hit)) t = Math.max(0, hit.t - (SKIN * 4) / reach);
  const s: Ringstone = {
    id: w.nextId++,
    owner: p.slot,
    x: p.x,
    y: p.y,
    px: p.x,
    py: p.y,
    toX: p.x + dx * t,
    toY: p.y + dy * t,
    flying: true,
    radius: RINGSTONE.radius,
    life: RINGSTONE.life,
    rungT: 9,
    dead: false,
  };
  w.stones.push(s);
  w.events.push({ type: 'stoneThrow', id: s.id, player: p.slot, x: s.x, y: s.y });
  return s;
}

export function stepStones(w: World, dt: number): void {
  if (w.stones.length === 0) return;
  for (const s of w.stones) {
    if (s.dead) continue;
    s.px = s.x;
    s.py = s.y;
    s.rungT += dt;
    if (s.flying) {
      const dx = s.toX - s.x;
      const dy = s.toY - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = RINGSTONE.speed * dt;
      if (d <= step) {
        s.x = s.toX;
        s.y = s.toY;
        s.flying = false;
        w.events.push({ type: 'stonePlant', id: s.id, player: s.owner, x: s.x, y: s.y });
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
    } else {
      s.life -= dt;
      if (s.life <= 0) retire(w, s);
    }
  }
  if (w.stones.some((s) => s.dead)) w.stones = w.stones.filter((s) => !s.dead);
}
