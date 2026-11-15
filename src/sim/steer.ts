// How Echoes get about. An Echo that only walks at its target is tame: it can be led in a circle
// for ever. So each way of moving here asks something of the player:
//
//   chase      walks at where its target is going, not where it is, so walking away in a circle
//              is cut off.
//   surround   takes a place on a ring round its target, on a different side from its fellows,
//              and comes at that place round the ring rather than through the middle. The places
//              drift, so the ring turns. A pack ends up all round you.
//   kite       keeps a distance.
//   skirmish   keeps a distance, and after every attack moves to another spot at that distance,
//              some way round its target: the fire keeps coming from a new side.
//   hold       stands.
//
// Far from its target every Echo hurries. When the straight way is blocked by a wall or a pit it
// follows the walking field of its target round the obstacle (nav.ts).
import { PI, TAU, datan2, dcos, dhypot, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { castCircle, newHit } from './cast';
import { navFor, navStep } from './nav';
import { isClear } from './room';
import { STEER } from './tuning';
import type { Enemy, Player, World } from './types';

/** An angle brought into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a;
  while (r > PI) r -= TAU;
  while (r <= -PI) r += TAU;
  return r;
}

const grounded = (e: Enemy): boolean => !e.dead && e.state !== 'spawn' && e.state !== 'launched' && e.state !== 'pit';

/** Where its target will be by the time it could get there: a little way along the target's own motion. */
function ahead(p: Player, dist: number, speed: number, out: Vec2): void {
  const t = Math.min(STEER.leadMost, dist / Math.max(1, speed * STEER.leadPace));
  out.x = p.x + p.vx * t;
  out.y = p.y + p.vy * t;
}

/** The place on its ring a surrounder is making for, kept apart from the places of its fellows. */
function ownPlace(w: World, e: Enemy, drift: number, dt: number): void {
  let fellows = 1;
  for (const o of w.enemies) if (o !== e && grounded(o) && o.target === e.target && o.def.locomotion.kind === 'surround') fellows++;
  const apart = Math.min(STEER.apartMost, TAU / Math.max(2, fellows));
  for (const o of w.enemies) {
    if (o === e || !grounded(o) || o.target !== e.target || o.def.locomotion.kind !== 'surround') continue;
    const d = wrapAngle(e.slot - o.slot);
    const gap = Math.abs(d);
    if (gap >= apart) continue;
    // two on the same spot part by their ids, so they never dither
    const side = gap > 1e-9 ? (d > 0 ? 1 : -1) : e.id > o.id ? 1 : -1;
    e.slot += side * (apart - gap) * STEER.partRate * dt;
  }
  // the whole ring turns slowly, one way or the other by the Echo
  e.slot = wrapAngle(e.slot + drift * (e.seed < 0.5 ? -1 : 1) * dt);
}

/** Choose a skirmisher's next spot: at its distance, some way round its target from where it stands. */
function nextSpot(w: World, e: Enemy, p: Player, min: number, max: number, turn: number): void {
  const here = datan2(e.y - p.y, e.x - p.x);
  const first = w.rng.chance(0.5) ? 1 : -1;
  const r = w.rng.float(min + (max - min) * 0.25, max);
  const by = turn * w.rng.float(0.6, 1.3);
  e.spotT = STEER.spotPatience;
  e.spotR = r;
  // one way round, then the other; if neither spot is open floor, stay on this side
  for (const side of [first, -first]) {
    const a = here + side * by;
    if (isClear(w.room, p.x + dcos(a) * r, p.y + dsin(a) * r, e.radius + 0.2)) {
      e.slot = wrapAngle(a);
      return;
    }
  }
  e.slot = here;
}

const hit = newHit();

/**
 * The velocity an Echo wants this tick, into `out`. `dist` is how far its target is, `clear`
 * whether it could walk straight up to them, `speed` what it can do on its feet right now.
 */
export function steer(w: World, e: Enemy, p: Player, dist: number, clear: boolean, speed: number, dt: number, out: Vec2): void {
  const loc = e.def.locomotion;
  out.x = 0;
  out.y = 0;
  if (loc.kind === 'hold') return;
  // far off, it hurries
  const pace = dist > STEER.rushBeyond ? speed * STEER.rush : speed;
  let gx: number;
  let gy: number;
  let stopWithin = 0.05;

  if (loc.kind === 'chase') {
    if (dist <= loc.range) return;
    ahead(p, dist, speed, out);
    gx = out.x;
    gy = out.y;
  } else if (loc.kind === 'surround') {
    ownPlace(w, e, loc.drift ?? 0, dt);
    ahead(p, dist, speed, out);
    const cx = out.x;
    const cy = out.y;
    // round the ring toward its place, never straight through the middle
    const here = datan2(e.y - cy, e.x - cx);
    const turn = wrapAngle(e.slot - here);
    const a = here + Math.max(-STEER.roundStep, Math.min(STEER.roundStep, turn));
    gx = cx + dcos(a) * loc.ring;
    gy = cy + dsin(a) * loc.ring;
    stopWithin = 0.25;
  } else if (loc.kind === 'kite') {
    const ux = (p.x - e.x) / dist;
    const uy = (p.y - e.y) / dist;
    if (dist < loc.min) {
      out.x = -ux * speed;
      out.y = -uy * speed;
    } else if (dist > loc.max) {
      out.x = ux * pace;
      out.y = uy * pace;
    } else {
      // inside the band: drift sideways so it is not a sitting target
      const side = (e.seed < 0.5 ? -1 : 1) * speed * 0.4;
      out.x = -uy * side;
      out.y = ux * side;
    }
    return;
  } else {
    // skirmish
    e.spotT -= dt;
    const crowded = dist < loc.min * STEER.tooClose;
    if (e.spotT <= 0 || crowded) nextSpot(w, e, p, crowded ? loc.max * 0.8 : loc.min, loc.max, loc.turn);
    gx = p.x + dcos(e.slot) * e.spotR;
    gy = p.y + dsin(e.slot) * e.spotR;
    stopWithin = 0.3;
    // a spot it cannot walk to is no spot: give up on it soon
    if (castCircle(w.room.geo, true, e.x, e.y, gx - e.x, gy - e.y, e.radius * 0.9, hit)) e.spotT = Math.min(e.spotT, STEER.blockedPatience);
  }

  const dx = gx - e.x;
  const dy = gy - e.y;
  const d = dhypot(dx, dy);
  out.x = 0;
  out.y = 0;
  if (d <= stopWithin) return;
  if (!clear && loc.kind !== 'skirmish') {
    // something is in the way of its target: follow that player's walking field round it
    const field = navFor(w, w.players.indexOf(p));
    if (field && navStep(w.room, field, e.x, e.y, out)) {
      out.x *= pace;
      out.y *= pace;
      return;
    }
  }
  // ease into its place rather than overshoot it
  const k = Math.min(1, d / 0.6);
  out.x = (dx / d) * pace * k;
  out.y = (dy / d) * pace * k;
  if (loc.kind === 'chase' && loc.weave) {
    const sway = dsin(w.time * 2.6 + e.seed * TAU) * loc.weave * speed;
    out.x += (-dy / d) * sway;
    out.y += (dx / d) * sway;
  }
}
