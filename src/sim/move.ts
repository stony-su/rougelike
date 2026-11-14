// How a player gets about on foot. Class kits and the player step share these.
import { dhypot } from '../core/dmath';
import { ddamp } from '../core/exact';
import type { Vec2 } from '../core/exact';
import { newHit, slideCircle } from './cast';
import { PLAYER } from './tuning';
import type { Player, PlayerState, World } from './types';

export function setState(p: Player, s: PlayerState): void {
  if (p.state !== s) {
    p.state = s;
    p.stateTime = 0;
  }
}

/** Move a player by a displacement, sliding along walls, posts and pit edges. */
export function shift(w: World, p: Player, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const pos: Vec2 = { x: p.x, y: p.y };
  slideCircle(w.room.geo, true, pos, p.radius, dx, dy, newHit());
  p.x = pos.x;
  p.y = pos.y;
}

/** Ease the velocity toward a wanted one and move by it. */
export function drive(w: World, p: Player, tx: number, ty: number, rate: number, dt: number): void {
  p.vx = ddamp(p.vx, tx, rate, dt);
  p.vy = ddamp(p.vy, ty, rate, dt);
  const bx = p.x;
  const by = p.y;
  shift(w, p, p.vx * dt, p.vy * dt);
  p.stride += dhypot(p.x - bx, p.y - by);
}

/** Ordinary walking, at a share of full speed. */
export function walk(w: World, p: Player, move: Vec2, mul: number, dt: number): void {
  const moving = move.x !== 0 || move.y !== 0;
  drive(w, p, move.x * PLAYER.speed * mul, move.y * PLAYER.speed * mul, moving ? PLAYER.accel : PLAYER.decel, dt);
  if (!moving && p.vx * p.vx + p.vy * p.vy < 0.0004) {
    p.vx = 0;
    p.vy = 0;
  }
}

/** Back to standing or running, whichever the stick says. */
export function rest(p: Player, move: Vec2): void {
  setState(p, move.x !== 0 || move.y !== 0 ? 'run' : 'idle');
}
