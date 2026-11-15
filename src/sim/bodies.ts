// Bodies sent flying. A blow gives an Echo a velocity of its own; above the launch speed the
// Echo is launched: helpless, and able to slam into walls, carom into other Echoes and fall into
// pits. Everything is swept with the one cast the rest of the game uses, so nothing tunnels, and
// every bounce off a wall is an exact mirror.
import type { Vec2 } from '../core/exact';
import { HIT_BUMPER, HIT_POST, SKIN, castCircle, circleTime, newHit, pushOut, slideCircle } from './cast';
import type { Hit } from './cast';
import { damageEnemy, hittable, interruptEnemy, stunEnemy } from './combat';
import { reflectFixed, reflectFree } from './geo';
import { addRally, rallyMul } from './rally';
import { groundAt, nearestFloor } from './room';
import { BODY, HITSTOP, RALLY, RINGSTONE, isLight, massFactor } from './tuning';
import type { BounceKind, Enemy, Ringstone, World } from './types';

/** Scratch space for one pass over the bodies, so the step allocates nothing per body. */
export interface BodyScratch {
  hit: Hit;
  pos: Vec2;
  v: Vec2;
}

export const newBodyScratch = (): BodyScratch => ({ hit: newHit(), pos: { x: 0, y: 0 }, v: { x: 0, y: 0 } });

const speedOf = (e: Enemy): number => Math.sqrt(e.lvx * e.lvx + e.lvy * e.lvy);

/** Nothing flies faster than the fastest launch, whatever sent it. */
function capSpeed(e: Enemy): void {
  const sp = speedOf(e);
  if (sp <= BODY.maxSpeed) return;
  e.lvx *= BODY.maxSpeed / sp;
  e.lvy *= BODY.maxSpeed / sp;
}

function beginLaunch(w: World, e: Enemy, by: number, links: number): void {
  interruptEnemy(w, e);
  e.state = 'launched';
  e.stateTime = 0;
  e.stateDur = 0;
  e.launchBy = by;
  e.assistBy = -1;
  e.links = links;
  w.events.push({ type: 'launch', id: e.id, by, x: e.x, y: e.y, speed: speedOf(e) });
}

/**
 * After a blow changed a body's velocity: cap it, and launch the body if it is now fast enough.
 * A body that has just landed cannot be launched again yet, so it is only nudged.
 */
function settle(w: World, e: Enemy, by: number, links: number): boolean {
  let sp = speedOf(e);
  const cap = e.state !== 'launched' && e.launchImmune > 0 ? BODY.launchSpeed : BODY.maxSpeed;
  if (sp > cap) {
    const k = cap / sp;
    e.lvx *= k;
    e.lvy *= k;
    sp = cap;
  }
  if (sp <= BODY.launchSpeed) return false;
  if (e.state !== 'launched') beginLaunch(w, e, by, links);
  else if (by >= 0) {
    // struck again in flight: the latest hand gets the credit
    e.launchBy = by;
    e.links = links;
  }
  return true;
}

/** Count a Return made by a body in flight: for whoever launched it, and for a second player whose blow is in the same flight. */
function creditBounce(w: World, e: Enemy, x: number, y: number): void {
  addRally(w, e.launchBy, RALLY.weight.sent, x, y);
  if (e.assistBy >= 0 && e.assistBy !== e.launchBy) addRally(w, e.assistBy, RALLY.weight.sent, x, y);
}

/**
 * A body already in flight is struck again by another player: it goes on along a new direction,
 * `speedMul` times as fast, and both players now share whatever it hits. Returns the slot of the
 * player who first launched it if that was someone else (a Duet), or -1.
 */
export function relaunch(w: World, e: Enemy, dx: number, dy: number, speedMul: number, by: number): number {
  const first = e.launchBy;
  const sp = Math.min(BODY.maxSpeed, speedOf(e) * speedMul);
  e.lvx = dx * sp;
  e.lvy = dy * sp;
  e.launchBy = by;
  e.links = 0;
  const duet = first >= 0 && first !== by;
  if (duet) e.assistBy = first;
  w.events.push({ type: 'launch', id: e.id, by, x: e.x, y: e.y, speed: sp });
  return duet ? first : -1;
}

/**
 * Shove a body along a unit direction. The speed gained is the impulse divided by its mass
 * (three times that while it is staggered). Returns true if the body is now in flight.
 */
export function pushBody(w: World, e: Enemy, dx: number, dy: number, impulse: number, by: number): boolean {
  if (!hittable(e) || impulse <= 0) return false;
  let dv = impulse / e.def.mass;
  if (e.staggered > 0) dv *= BODY.staggerLaunchMul;
  e.lvx += dx * dv;
  e.lvy += dy * dv;
  return settle(w, e, by, 0);
}

/**
 * Add stagger to a medium or heavy body. At the threshold it is staggered: stunned, its guard
 * down, and far easier to launch.
 */
export function addStagger(w: World, e: Enemy, n: number): void {
  if (!hittable(e) || isLight(e.def.mass) || e.staggered > 0) return;
  // fresh from one daze it keeps its feet for a moment, or a quick pair of hands could hold it down for ever
  if (e.stunImmune > 0 && e.state !== 'stun') return;
  e.stagger += n;
  e.staggerT = BODY.staggerFade;
  if (e.stagger < BODY.staggerAt) return;
  e.stagger = 0;
  e.staggerT = 0;
  e.staggered = BODY.staggerTime;
  w.events.push({ type: 'stagger', id: e.id, x: e.x, y: e.y });
  stunEnemy(w, e, BODY.staggerTime, true);
}

/** Lose speed steadily, as a sliding body does. */
function slow(e: Enemy, dv: number): void {
  const sp = speedOf(e);
  if (sp <= dv) {
    e.lvx = 0;
    e.lvy = 0;
    return;
  }
  const k = (sp - dv) / sp;
  e.lvx *= k;
  e.lvy *= k;
}

/** A hit that came from being bounced: it uses the Rally of whoever launched the body, then adds to it. */
function bounceDamage(w: World, e: Enemy, amount: number, kind: 'slam' | 'carom', by: number, dx: number, dy: number, big: boolean): void {
  damageEnemy(w, e, amount, { kind, by, dx, dy, heavy: big, freeze: big ? HITSTOP.heavy : HITSTOP.light });
}

function bounceOffChamber(w: World, e: Enemy, s: BodyScratch): void {
  const h = s.hit;
  const into = -(e.lvx * h.nx + e.lvy * h.ny);
  if (h.ntype >= 0) reflectFixed(e.lvx, e.lvy, h.ntype, s.v);
  else reflectFree(e.lvx, e.lvy, h.nx, h.ny, s.v);
  const bumper = h.kind === HIT_BUMPER;
  const off: BounceKind = bumper ? 'bumper' : h.kind === HIT_POST ? 'post' : 'wall';
  let k = bumper ? BODY.bumperRestitution : BODY.wallRestitution;
  if (bumper) {
    // a bumper always kicks
    const out = Math.sqrt(s.v.x * s.v.x + s.v.y * s.v.y) * k;
    if (out > 1e-9 && out < BODY.bumperMinExit) k *= BODY.bumperMinExit / out;
  }
  e.lvx = s.v.x * k;
  e.lvy = s.v.y * k;
  capSpeed(e);
  w.events.push({ type: 'wallSlam', id: e.id, by: e.launchBy, x: e.x, y: e.y, speed: into, off, nx: h.nx, ny: h.ny });
  if (into > BODY.slamSpeed) {
    const by = e.launchBy;
    const amount = BODY.slamDamage * into * (1 + e.boost) * rallyMul(w, by);
    e.boost = 0;
    bounceDamage(w, e, amount, 'slam', by, -h.nx, -h.ny, into > 12);
    creditBounce(w, e, e.x, e.y);
  }
  if (bumper) e.boost = Math.max(e.boost, BODY.bumperBoost);
}

/** The Echo nearest a point within `range`, other than `not`. Lowest id on a tie. */
export function nearestEcho(w: World, x: number, y: number, range: number, not: number): Enemy | null {
  let best: Enemy | null = null;
  let bd = range * range;
  for (const o of w.enemies) {
    if (o.id === not || !hittable(o)) continue;
    const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
    if (d < bd || (d === bd && best !== null && o.id < best.id)) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** A Ringstone sends a body at the nearest other Echo, and whatever it hits next is hit harder. */
function bounceOffStone(w: World, e: Enemy, st: Ringstone, s: BodyScratch): void {
  let nx = e.x - st.x;
  let ny = e.y - st.y;
  const l = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= l;
  ny /= l;
  const into = -(e.lvx * nx + e.lvy * ny);
  const sp = speedOf(e);
  const target = nearestEcho(w, st.x, st.y, RINGSTONE.seek, e.id);
  let aimed = false;
  if (target) {
    const tx = target.x - e.x;
    const ty = target.y - e.y;
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl > 1e-6) {
      e.lvx = (tx / tl) * sp;
      e.lvy = (ty / tl) * sp;
      aimed = true;
    }
  }
  if (!aimed) {
    reflectFree(e.lvx, e.lvy, nx, ny, s.v);
    e.lvx = s.v.x;
    e.lvy = s.v.y;
  }
  e.boost = Math.max(e.boost, BODY.stoneBoost);
  // sent on its way, it passes the stone rather than meeting it again
  e.caromWith = st.id;
  e.caromLock = BODY.pairLock;
  st.rungT = 0;
  w.events.push({ type: 'wallSlam', id: e.id, by: e.launchBy, x: e.x, y: e.y, speed: into, off: 'stone', nx, ny });
}

/** One body flying into another: both are hurt, and part of the motion passes on. */
function carom(w: World, e: Enemy, o: Enemy): void {
  let nx = o.x - e.x;
  let ny = o.y - e.y;
  const l = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= l;
  ny /= l;
  const on = o.lvx * nx + o.lvy * ny;
  const en = e.lvx * nx + e.lvy * ny;
  const vn = en - on;
  const by = e.launchBy;
  const amount = BODY.caromDamage * vn * massFactor(e.def.mass) * (1 + e.boost) * rallyMul(w, by);
  e.boost = 0;
  const big = vn > HITSTOP.caromBig;

  // The striker keeps a share of the closing speed: onward if it is the heavier, back if the lighter.
  const keep = (e.def.mass >= o.def.mass ? BODY.caromKeep : -BODY.caromKeep) * vn;
  e.lvx += (on + keep - en) * nx;
  e.lvy += (on + keep - en) * ny;
  // a light body met head-on by a faster one is thrown back hard, but no harder than anything else flies
  capSpeed(e);
  // The struck body takes its share, weighted by the masses.
  let gain = BODY.caromPass * vn * (e.def.mass / o.def.mass);
  if (o.staggered > 0) gain *= BODY.staggerLaunchMul;
  gain = Math.min(gain, BODY.caromMaxGain * vn);
  o.lvx += nx * gain;
  o.lvy += ny * gain;

  e.caromWith = o.id;
  o.caromWith = e.id;
  e.caromLock = BODY.pairLock;
  o.caromLock = BODY.pairLock;
  const cx = e.x + nx * e.radius;
  const cy = e.y + ny * e.radius;
  w.events.push({ type: 'carom', a: e.id, b: o.id, by, x: cx, y: cy, speed: vn, links: e.links + 1 });

  bounceDamage(w, o, amount, 'carom', by, nx, ny, big);
  bounceDamage(w, e, amount, 'carom', by, -nx, -ny, big);
  creditBounce(w, e, cx, cy);
  if (!o.dead && !settle(w, o, by, e.links + 1)) {
    // too heavy to fly from that: it staggers instead
    addStagger(w, o, 1);
  }
}

/** A launched body, moved for one tick: it bounces off the chamber, Ringstones and other bodies. */
function fly(w: World, e: Enemy, dt: number, s: BodyScratch): void {
  const geo = w.room.geo;
  let rem = 1;
  for (let iter = 0; iter < 4 && rem > 1e-6 && !e.dead; iter++) {
    const dx = e.lvx * dt * rem;
    const dy = e.lvy * dt * rem;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) break;

    // The earliest of: the chamber itself, a Ringstone, another body. On a tie, in that order.
    let t = 1;
    let what = 0;
    let stone: Ringstone | null = null;
    let other: Enemy | null = null;
    if (castCircle(geo, false, e.x, e.y, dx, dy, e.radius, s.hit)) {
      t = s.hit.t;
      what = 1;
    }
    for (const st of w.stones) {
      if (st.dead || st.flying || (e.caromLock > 0 && e.caromWith === st.id)) continue;
      const ts = circleTime(e.x, e.y, dx, dy, st.x, st.y, st.radius + e.radius);
      if (ts < 0 || ts >= t) continue;
      t = ts;
      what = 2;
      stone = st;
    }
    if (e.links < BODY.maxLinks) {
      for (const o of w.enemies) {
        if (o === e || !hittable(o) || o.airborne) continue;
        if ((e.caromLock > 0 && e.caromWith === o.id) || (o.caromLock > 0 && o.caromWith === e.id)) continue;
        const tb = circleTime(e.x, e.y, dx, dy, o.x, o.y, e.radius + o.radius);
        if (tb < 0 || tb > t) continue;
        if (tb === t && (what !== 3 || (other !== null && o.id > other.id))) continue;
        // only a hard enough meeting is a carom; softer ones pass
        let nx = o.x - (e.x + dx * tb);
        let ny = o.y - (e.y + dy * tb);
        const l = Math.sqrt(nx * nx + ny * ny);
        if (l < 1e-9) continue;
        nx /= l;
        ny /= l;
        if ((e.lvx - o.lvx) * nx + (e.lvy - o.lvy) * ny <= BODY.caromSpeed) continue;
        t = tb;
        what = 3;
        other = o;
      }
    }

    const tc = what === 0 ? 1 : Math.max(0, t - SKIN / len);
    e.x += dx * tc;
    e.y += dy * tc;
    if (what === 0) break;
    rem *= 1 - t;
    if (what === 1) bounceOffChamber(w, e, s);
    else if (what === 2 && stone) bounceOffStone(w, e, stone, s);
    else if (other) carom(w, e, other);
  }
}

/** A launched body over a pit falls in. Light ones are gone; heavier ones lose health and climb out. */
function ringOut(w: World, e: Enemy): void {
  const by = e.launchBy;
  const dies = isLight(e.def.mass) && !e.elite;
  e.lvx = 0;
  e.lvy = 0;
  w.events.push({ type: 'ringOut', id: e.id, by, x: e.x, y: e.y, killed: dies });
  damageEnemy(w, e, dies ? e.hp : e.maxHp * BODY.ringOutShare, { kind: 'ringout', by, dx: 0, dy: 1, heavy: true });
  creditBounce(w, e, e.x, e.y);
  if (e.dead) return;
  interruptEnemy(w, e);
  e.state = 'pit';
  e.stateTime = 0;
  e.stateDur = BODY.pitTime;
  e.links = 0;
  e.launchBy = -1;
  e.boost = 0;
}

/** A body that fell into a pit comes back up at the nearest edge, dazed. */
export function climbOut(w: World, e: Enemy, s: BodyScratch): void {
  nearestFloor(w.room, e.x, e.y, e.radius, s.pos);
  e.x = e.px = s.pos.x;
  e.y = e.py = s.pos.y;
  e.state = 'idle';
  e.stateTime = 0;
  e.stateDur = 0;
  w.events.push({ type: 'climbOut', id: e.id, x: e.x, y: e.y });
  stunEnemy(w, e, BODY.pitStun, true);
}

function land(w: World, e: Enemy, s: BodyScratch): void {
  e.state = 'recover';
  e.stateTime = 0;
  e.stateDur = BODY.landRecover;
  e.move = -1;
  e.launchImmune = BODY.landRecover + BODY.launchImmune;
  e.links = 0;
  e.launchBy = -1;
  e.assistBy = -1;
  e.boost = 0;
  // In flight only walls stop a body; on its feet again it must also stand clear of pit edges.
  s.pos.x = e.x;
  s.pos.y = e.y;
  if (pushOut(w.room.geo, !e.airborne, s.pos, e.radius)) {
    e.x = s.pos.x;
    e.y = s.pos.y;
  }
  w.events.push({ type: 'land', id: e.id, x: e.x, y: e.y });
}

/** Move one body for one tick: on its own feet plus whatever shove it still carries, or in flight. */
export function stepBody(w: World, e: Enemy, dt: number, s: BodyScratch): void {
  if (e.launchImmune > 0) e.launchImmune -= dt;
  if (e.caromLock > 0) e.caromLock -= dt;
  if (e.staggerT > 0) {
    e.staggerT -= dt;
    if (e.staggerT <= 0) e.stagger = 0;
  }
  if (e.staggered > 0) e.staggered -= dt;

  if (e.state === 'launched') {
    fly(w, e, dt, s);
    if (e.dead) return;
    if (groundAt(w.room, e.x, e.y) === 'pit') {
      ringOut(w, e);
      return;
    }
    slow(e, BODY.friction * dt);
    if (speedOf(e) < BODY.launchSpeed) land(w, e, s);
    return;
  }

  // Rooted or frozen: its own legs do nothing, but blows still move it.
  const held = e.status.rootT > 0 || e.status.frozenT > 0;
  const mx = (held ? 0 : e.vx) + e.lvx;
  const my = (held ? 0 : e.vy) + e.lvy;
  if (mx !== 0 || my !== 0) {
    s.pos.x = e.x;
    s.pos.y = e.y;
    slideCircle(w.room.geo, !e.airborne, s.pos, e.radius, mx * dt, my * dt, s.hit);
    e.x = s.pos.x;
    e.y = s.pos.y;
  }
  if (e.lvx !== 0 || e.lvy !== 0) slow(e, BODY.friction * dt);
}
