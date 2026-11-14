// Bombs. An Echo lobs one at a warned circle; it flies in an arc, sits on its fuse, and bursts.
// A blow from a player makes it theirs: a sword or a punch sends it flying, an arrow sets it off
// where it sits, and its blast then hurts Echoes only.
import { pushBody } from './bodies';
import { castCircle, circleTime, newHit } from './cast';
import { damageEnemy, damagePlayer, hittable, standing } from './combat';
import { addRally, rallyMul } from './rally';
import { addTelegraph, removeTelegraph } from './telegraphs';
import { BOMB, HITSTOP, RALLY } from './tuning';
import type { Bomb, Enemy, World } from './types';

/** How near a blow must come to a bomb on the floor to strike it. */
export const BOMB_TOUCH = 0.3;

export function throwBomb(w: World, e: Enemy, toX: number, toY: number, o: { damage: number; radius: number; flight: number; fuse: number }): Bomb {
  // The warning belongs to the bomb, not the thrower: it stays if the thrower dies.
  const warn = addTelegraph(w, 'circle', 0, toX, toY, o.flight + o.fuse, { radius: o.radius });
  const b: Bomb = {
    id: w.nextId++,
    owner: e.id,
    by: -1,
    x: e.x,
    y: e.y,
    px: e.x,
    py: e.y,
    fromX: e.x,
    fromY: e.y,
    toX,
    toY,
    vx: 0,
    vy: 0,
    state: 'fly',
    t: 0,
    dur: o.flight,
    fuse: o.fuse,
    radius: o.radius,
    damage: o.damage,
    telegraph: warn.id,
    dead: false,
  };
  w.bombs.push(b);
  w.events.push({ type: 'bombThrow', id: b.id, x: b.x, y: b.y });
  return b;
}

function burst(w: World, b: Bomb): void {
  if (b.dead) return;
  b.dead = true;
  removeTelegraph(w, b.telegraph);
  b.telegraph = 0;
  w.events.push({ type: 'bombBurst', id: b.id, by: b.by, x: b.x, y: b.y, radius: b.radius });
  if (b.by < 0) {
    for (const p of w.players) {
      if (!standing(p)) continue;
      const rr = b.radius + p.radius;
      if ((p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y) <= rr * rr) damagePlayer(w, p, b.damage, b.x, b.y, 2.5);
    }
    return;
  }
  // A player's bomb: one Return, however many it catches.
  const amount = BOMB.damage * rallyMul(w, b.by);
  let caught = false;
  for (const e of w.enemies.slice()) {
    if (!hittable(e)) continue;
    let dx = e.x - b.x;
    let dy = e.y - b.y;
    const rr = b.radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = 1;
      dy = 0;
    }
    caught = true;
    damageEnemy(w, e, amount, { kind: 'return', by: b.by, dx, dy, heavy: true, freeze: HITSTOP.heavy });
    if (!e.dead) pushBody(w, e, dx, dy, BOMB.impulse, b.by);
  }
  if (caught) addRally(w, b.by, RALLY.weight.sent, b.x, b.y);
}

/** Set a bomb off where it is, as the bomb of player `by` (or of the Echoes, if -1). */
export function detonateBomb(w: World, b: Bomb, by: number): void {
  b.by = by;
  burst(w, b);
}

/** Send a bomb on the floor flying along a unit direction. From now on it is the bomb of player `slot`. */
export function batBomb(w: World, b: Bomb, slot: number, dx: number, dy: number, speed: number): void {
  if (b.dead || b.state !== 'fuse') return;
  removeTelegraph(w, b.telegraph);
  b.telegraph = 0;
  b.by = slot;
  b.vx = dx * speed;
  b.vy = dy * speed;
  b.state = 'batted';
  b.t = 0;
  b.dur = BOMB.batFuse;
  w.events.push({ type: 'bombBat', id: b.id, player: slot, x: b.x, y: b.y });
}

export function stepBombs(w: World, dt: number): void {
  if (w.bombs.length === 0) return;
  const hit = newHit();
  for (const b of w.bombs) {
    if (b.dead) continue;
    b.px = b.x;
    b.py = b.y;
    b.t += dt;
    if (b.state === 'fly') {
      const k = Math.min(1, b.t / b.dur);
      b.x = b.fromX + (b.toX - b.fromX) * k;
      b.y = b.fromY + (b.toY - b.fromY) * k;
      if (b.t >= b.dur) {
        b.state = 'fuse';
        b.t = 0;
        b.dur = b.fuse;
        w.events.push({ type: 'bombLand', id: b.id, x: b.x, y: b.y });
      }
    } else if (b.state === 'fuse') {
      if (b.t >= b.dur) burst(w, b);
    } else {
      // Batted: it bursts on the first wall or Echo in its way, or when its time is up.
      const dx = b.vx * dt;
      const dy = b.vy * dt;
      let t = 1;
      let struck = false;
      if (castCircle(w.room.geo, false, b.x, b.y, dx, dy, BOMB.radius, hit)) {
        t = hit.t;
        struck = true;
      }
      for (const e of w.enemies) {
        if (!hittable(e)) continue;
        const te = circleTime(b.x, b.y, dx, dy, e.x, e.y, e.radius + BOMB.radius);
        if (te < 0 || te >= t) continue;
        t = te;
        struck = true;
      }
      b.x += dx * t;
      b.y += dy * t;
      if (struck || b.t >= b.dur) burst(w, b);
    }
  }
  if (w.bombs.some((b) => b.dead)) w.bombs = w.bombs.filter((b) => !b.dead);
}
