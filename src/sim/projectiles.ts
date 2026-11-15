// Shots: things in flight that hurt whoever is on the other side. A shot bounces off the chamber
// with the same cast everything else uses, can change sides in mid-air, and remembers how it got
// where it is, because a hit from something that bounced or was sent back is a Return.
//
// One function moves a shot for one tick. The aim preview runs that same function on a ghost
// shot with nobody in the room, so the path drawn is, bit for bit, the path flown.
import { datan2, dcos, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { nearestEcho, pushBody } from './bodies';
import { BOMB_TOUCH, detonateBomb } from './bombs';
import { HIT_BUMPER, HIT_POST, SKIN, castCircle, circleTime, newHit } from './cast';
import type { Hit } from './cast';
import { HURT_TAKEN, burstAt, damageEnemy, damagePlayer, hittable, standing, stunEnemy } from './combat';
import { applyMark, applyRoot } from './conditions';
import { reflectFixed, reflectFree } from './geo';
import type { Geo } from './geo';
import { addRally, playerBySlot, rallyMul } from './rally';
import { BODY, BOW, BREAK, DT, DUET, EDGE, HITSTOP, RALLY, REFLECT, RINGSTONE, STRING } from './tuning';
import type { Bomb, BounceKind, Enemy, Player, Projectile, Ringstone, World } from './types';

/** No shot ever flies faster than this, however many bumpers it meets. */
const MAX_SHOT_SPEED = 40;
/** Bounces beyond this many no longer add damage. */
const MAX_BOUNCE_BONUS = 6;

export interface ShotSpec {
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
  life?: number;
  bounces?: number;
  skips?: number;
  pierce?: number;
  /** Its speed is multiplied by this at each bounce off the chamber. */
  quick?: number;
  /** Radians a second it comes round toward the nearest Echo once it has bounced. */
  seek?: number;
  /** The share of its damage it keeps when it is sent back (1 unless said). */
  back?: number;
}

function make(id: number, o: ShotSpec): Projectile {
  const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy) || 1;
  return {
    id,
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
    life: o.life ?? o.range / speed + 0.05,
    range: o.range,
    bounces: o.bounces ?? 0,
    bounced: 0,
    skips: o.skips ?? 0,
    skipped: 0,
    pierce: o.pierce ?? 0,
    returned: false,
    perfect: false,
    boost: 0,
    homing: 0,
    assist: -1,
    turn: 0,
    struck: 0,
    struckAt: -999,
    quick: o.quick ?? 1,
    seek: o.seek ?? 0,
    shard: false,
    tolls: 0,
    back: o.back ?? 1,
    hits: [],
    dead: false,
  };
}

export function spawnProjectile(w: World, o: ShotSpec): Projectile {
  const p = make(w.nextId++, o);
  w.projectiles.push(p);
  w.events.push({ type: 'projectileSpawn', id: p.id, kind: p.kind, x: p.x, y: p.y });
  return p;
}

/** The arrow a Bow player looses along an angle. It leaves from the middle of the player, which is never inside a wall. */
export function arrowSpec(p: Player, angle: number): ShotSpec {
  return {
    kind: 'arrow',
    faction: 'player',
    owner: p.slot,
    x: p.x,
    y: p.y,
    vx: dcos(angle) * BOW.speed,
    vy: dsin(angle) * BOW.speed,
    radius: BOW.radius,
    damage: BOW.damage,
    range: BOW.range,
    life: BOW.life,
    // Skipping Stone: more ricochets, quicker at each; Glance: more skips; Seeking Echo: it comes round
    bounces: BOW.bounces + p.mods.bounces,
    skips: BOW.skips + p.mods.skips,
    quick: p.mods.bounceSpeed,
    seek: p.mods.seek,
  };
}

function end(w: World | null, p: Projectile, hit: boolean, trace: number[] | null): void {
  if (p.dead) return;
  p.dead = true;
  if (trace) trace.push(p.x, p.y);
  else if (w) w.events.push({ type: 'projectileEnd', id: p.id, kind: p.kind, x: p.x, y: p.y, hit });
}

/** Remove a shot early. */
export function destroyProjectile(w: World, p: Projectile): void {
  end(w, p, true, null);
}

/**
 * Turn an enemy shot into the player's own: it flies along `angle`, faster and far harder, may
 * bank once off a wall, and a perfect one goes through everything.
 */
export function returnShot(w: World, pr: Projectile, p: Player, angle: number, perfect: boolean, homing: number): void {
  // Clean Return: it flies faster still, and goes through what it meets
  const sp = Math.min(MAX_SHOT_SPEED, Math.max(REFLECT.minSpeed, Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) * REFLECT.speedMul) * p.mods.returnSpeed);
  pr.vx = dcos(angle) * sp;
  pr.vy = dsin(angle) * sp;
  pr.faction = 'player';
  pr.owner = p.slot;
  pr.returned = true;
  pr.perfect = perfect;
  pr.damage = Math.max(REFLECT.minDamage, pr.damage * REFLECT.damageMul) * (perfect ? REFLECT.perfectMul : 1) * pr.back;
  pr.bounces = REFLECT.bounces;
  pr.bounced = 0;
  pr.skips = 0;
  pr.skipped = 0;
  pr.pierce = perfect ? 99 : p.mods.returnPierce;
  pr.range = REFLECT.range;
  pr.life = REFLECT.range / sp + 0.1;
  pr.boost = 0;
  pr.homing = homing;
  pr.turn = 0;
  pr.struck = 0;
  pr.struckAt = w.tick;
  pr.hits.length = 0;
  w.events.push({ type: 'reflect', player: p.slot, id: pr.id, x: pr.x, y: pr.y, perfect });
}

/**
 * Second Voice: a shot that has just been sent back, and is flying where it was sent, splits into
 * a fan about that line. Each shot of the fan carries a share of the whole. Hall of Mirrors lets
 * each bank once more. An orb is one thing and stays one.
 */
export function fanOut(w: World, pr: Projectile, p: Player): void {
  const extra = pr.kind === 'orb' ? 0 : p.mods.returnSplit;
  if (extra <= 0) return;
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  const at = datan2(pr.vy, pr.vx);
  pr.damage *= EDGE.splitShare - EDGE.splitStep * extra;
  pr.bounces += p.mods.hallOfMirrors;
  for (let i = 0; i <= extra; i++) {
    const a = at - EDGE.splitFan / 2 + (EDGE.splitFan * i) / extra;
    let shot = pr;
    if (i > 0) {
      shot = { ...pr, id: w.nextId++, hits: [] };
      w.projectiles.push(shot);
      w.events.push({ type: 'projectileSpawn', id: shot.id, kind: shot.kind, x: shot.x, y: shot.y });
    }
    shot.vx = dcos(a) * sp;
    shot.vy = dsin(a) * sp;
  }
}

/**
 * Tuning Fork: the Sword strikes one of its own shots on again, along `angle`. It hits harder for
 * it and has its whole range again. Standing Wave: a crescent also grows, in size and in speed.
 */
export function restrikeShot(w: World, pr: Projectile, p: Player, angle: number): void {
  const grow = p.mods.standingWave > 0 && pr.kind === 'crescent' ? EDGE.waveGrow : 1;
  const sp = Math.min(MAX_SHOT_SPEED, Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) * grow);
  pr.vx = dcos(angle) * sp;
  pr.vy = dsin(angle) * sp;
  pr.radius = Math.min(Math.max(pr.radius, EDGE.waveMaxRadius), pr.radius * grow);
  pr.damage *= 1 + p.mods.refork;
  pr.range = Math.max(pr.range, REFLECT.range);
  pr.life = pr.range / sp + 0.1;
  // struck on by a blade, it is a Return from here on
  pr.returned = true;
  pr.homing = 0;
  pr.struck++;
  pr.struckAt = w.tick;
  pr.hits.length = 0;
  w.events.push({ type: 'reflect', player: p.slot, id: pr.id, x: pr.x, y: pr.y, perfect: false });
}

/**
 * An orb is heavy: whoever strikes it sends it home. It leaves along the blow and then flies for
 * whoever served it, so a swing, an arrow and a punch all return it equally well.
 */
export function returnOrb(w: World, pr: Projectile, p: Player, dx: number, dy: number, perfect: boolean): void {
  const home = pr.faction === 'enemy' ? pr.owner : 0;
  returnShot(w, pr, p, 0, perfect, home);
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  pr.vx = (dx / l) * sp;
  pr.vy = (dy / l) * sp;
}

/** Slap an enemy shot away along a unit direction: it becomes the player's, at a share of its damage. */
export function slapShot(w: World, pr: Projectile, p: Player, dx: number, dy: number): void {
  const sp = Math.min(MAX_SHOT_SPEED, Math.max(12, Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy)));
  pr.vx = dx * sp;
  pr.vy = dy * sp;
  pr.faction = 'player';
  pr.owner = p.slot;
  pr.returned = true;
  pr.perfect = false;
  pr.damage *= BREAK.shotMul;
  pr.bounces = 1;
  pr.bounced = 0;
  pr.pierce = 0;
  pr.range = 10;
  pr.life = 10 / sp + 0.1;
  pr.boost = 0;
  pr.homing = 0;
  pr.hits.length = 0;
  w.events.push({ type: 'reflect', player: p.slot, id: pr.id, x: pr.x, y: pr.y, perfect: false });
}

/** A player shot lands on an Echo. */
function strike(w: World, pr: Projectile, e: Enemy): void {
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) || 1;
  const ux = pr.vx / sp;
  const uy = pr.vy / sp;
  // Alley-oop: an arrow that catches a body in flight hurts it more, shoves it on, and glances off.
  const oop = e.state === 'launched' && !pr.returned;
  const launcher = e.launchBy;
  // It is a Return if the shot was sent back, has bounced or skipped on its way here, or two players had a hand in it.
  const sent = pr.returned || pr.bounced > 0 || pr.skipped > 0 || pr.boost > 0 || pr.assist >= 0 || oop;
  // whoever loosed it: what an arrow does when it lands depends on what they hold
  const m = pr.kind === 'arrow' ? (playerBySlot(w, pr.owner)?.mods ?? null) : null;
  let amount = pr.damage * (1 + BOW.bounceBonus * Math.min(pr.bounced, MAX_BOUNCE_BONUS)) * (1 + pr.boost);
  for (let i = 0; i < pr.skipped; i++) amount *= BOW.skipMul;
  // Trick Shot: from its third bounce an arrow always crits
  const trick = m !== null && m.trickShot > 0 && pr.bounced >= STRING.trickFrom;
  if (trick) amount *= STRING.trickMul;
  if (oop) amount *= DUET.oopDamage;
  if (sent) amount *= rallyMul(w, pr.owner);
  pr.boost = 0;
  damageEnemy(w, e, amount, {
    kind: sent ? 'return' : 'direct',
    by: pr.owner,
    dx: ux,
    dy: uy,
    crit: pr.perfect || trick,
    heavy: pr.returned,
    freeze: pr.perfect ? HITSTOP.perfect : HITSTOP.light,
    shot: true,
  });
  if (m) {
    // Crescendo: an arrow that has bounced twice bursts where it lands
    if (m.crescendo > 0 && pr.bounced >= STRING.crescendoFrom) burstAt(w, pr.x, pr.y, STRING.crescendoRadius, m.crescendo, pr.owner, 'crescendo');
    // Pinning Note: an arrow that skipped here holds what it strikes where it stands
    if (m.pin > 0 && pr.skipped > 0 && !e.dead) applyRoot(e, m.pin, STRING.pinRest);
    // Splinter: an arrow that kills breaks into pieces that fly at whatever else is near
    if (m.splinter > 0 && e.dead && !pr.shard) splinter(w, pr, e, m.splinter, m.chainReaction > 0);
  }
  if (sent) addRally(w, pr.owner, pr.perfect ? RALLY.weight.perfect : pr.returned ? RALLY.weight.sent : RALLY.weight.arrow, e.x, e.y);
  let stunned = false;
  if (pr.perfect && !e.dead) {
    // Counterweight: a perfect return stuns what it strikes where it stands, and marks it for everyone
    for (const pl of w.players) {
      if (pl.slot !== pr.owner || pl.mods.counterStun <= 0) continue;
      stunned = stunEnemy(w, e, pl.mods.counterStun) || stunned;
      applyMark(e, pl.mods.counterMark, EDGE.markTime);
    }
  }
  // a Duet counts for the other player too: whoever banked the arrow, or whoever launched the body
  if (pr.assist >= 0 && pr.assist !== pr.owner) addRally(w, pr.assist, RALLY.weight.arrow, e.x, e.y);
  if (oop && launcher >= 0 && launcher !== pr.owner) {
    addRally(w, launcher, RALLY.weight.arrow, e.x, e.y);
    w.events.push({ type: 'duet', kind: 'alleyoop', a: launcher, b: pr.owner, x: e.x, y: e.y });
  }
  if (!e.dead && !stunned) {
    pushBody(w, e, ux, uy, (pr.returned ? REFLECT.impulse : BOW.impulse) + (oop ? DUET.oopArrowImpulse : 0), pr.owner);
    if (oop && launcher >= 0 && launcher !== pr.owner) e.assistBy = launcher;
  }
  pr.hits.push(e.id);
  if (pr.homing === e.id) pr.homing = 0;
  if (oop) {
    // Carom shot: an arrow never stops on a body in flight. It glances off and flies on, a bounce to the good.
    let nx = pr.x - e.x;
    let ny = pr.y - e.y;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nl;
    ny /= nl;
    const into = pr.vx * nx + pr.vy * ny;
    if (into < 0) {
      pr.vx -= 2 * into * nx;
      pr.vy -= 2 * into * ny;
    }
    pr.bounced++;
    w.events.push({ type: 'ricochet', id: pr.id, by: pr.owner, x: pr.x, y: pr.y, n: pr.bounced, off: 'post', nx, ny });
    return;
  }

  if (pr.pierce > 0) {
    pr.pierce--;
    return;
  }
  if (pr.skips > 0) {
    // skip on to the nearest Echo it has not struck yet
    let next: Enemy | null = null;
    // Glance: it reaches further for the next
    const reach = BOW.skipRange + (m ? m.skipRange : 0);
    let bd = reach * reach;
    for (const o of w.enemies) {
      if (!hittable(o) || pr.hits.includes(o.id)) continue;
      const d = (o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y);
      if (d < bd || (d === bd && next !== null && o.id < next.id)) {
        bd = d;
        next = o;
      }
    }
    if (next) {
      const tx = next.x - pr.x;
      const ty = next.y - pr.y;
      const tl = Math.sqrt(tx * tx + ty * ty);
      if (tl > 1e-6) {
        pr.skips--;
        pr.skipped++;
        pr.vx = (tx / tl) * sp;
        pr.vy = (ty / tl) * sp;
        pr.homing = next.id;
        pr.turn = 0;
        w.events.push({ type: 'skip', by: pr.owner, fromX: pr.x, fromY: pr.y, toX: next.x, toY: next.y });
        return;
      }
    }
  }
  end(w, pr, true, null);
}

/** Splinter: pieces of an arrow that has just killed, one for each of the nearest other Echoes. */
function splinter(w: World, pr: Projectile, from: Enemy, pieces: number, keeps: boolean): void {
  const near = w.enemies
    .filter((o) => o.id !== from.id && hittable(o) && (o.x - from.x) * (o.x - from.x) + (o.y - from.y) * (o.y - from.y) <= STRING.splinterRange * STRING.splinterRange)
    .sort((a, b) => (a.x - from.x) * (a.x - from.x) + (a.y - from.y) * (a.y - from.y) - ((b.x - from.x) * (b.x - from.x) + (b.y - from.y) * (b.y - from.y)) || a.id - b.id);
  const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) || BOW.speed;
  for (const o of near.slice(0, pieces)) {
    const tx = o.x - from.x;
    const ty = o.y - from.y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    // Chain Reaction: a piece keeps the skips and ricochets the arrow still had
    const piece = spawnProjectile(w, {
      kind: 'arrow',
      faction: 'player',
      owner: pr.owner,
      x: from.x,
      y: from.y,
      vx: (tx / tl) * sp,
      vy: (ty / tl) * sp,
      radius: pr.radius,
      damage: pr.damage * STRING.splinterShare,
      range: STRING.splinterRange * 2,
      bounces: keeps ? pr.bounces : 0,
      skips: keeps ? pr.skips : 0,
      quick: pr.quick,
      seek: pr.seek,
    });
    piece.shard = true;
    piece.homing = o.id;
    piece.hits.push(from.id);
  }
}

const NOTHING = 0;
const CHAMBER = 1;
const STONE = 2;
const ENEMY = 3;
const BOMB = 4;
const PLAYER = 5;
const ORB = 6;

/**
 * Move one shot for one tick. With a world, it meets everything in it. Without one (`w` null) it
 * is a ghost that meets only the chamber, and every point where it turns is appended to `trace`.
 */
function advance(w: World | null, geo: Geo, pr: Projectile, dt: number, hit: Hit, v: Vec2, trace: number[] | null): void {
  pr.life -= dt;
  // Seeking Echo: once it has bounced, an arrow comes round toward the nearest Echo it has not struck
  if (w && pr.seek > 0 && pr.bounced > 0 && pr.homing === 0 && pr.faction === 'player') {
    let best: Enemy | null = null;
    let bd = STRING.seekRange * STRING.seekRange;
    for (const e of w.enemies) {
      if (!hittable(e) || pr.hits.includes(e.id)) continue;
      const d = (e.x - pr.x) * (e.x - pr.x) + (e.y - pr.y) * (e.y - pr.y);
      if (d < bd || (d === bd && best !== null && e.id < best.id)) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      pr.homing = best.id;
      pr.turn = pr.seek;
    }
  }
  if (w && pr.homing !== 0) {
    // steer for the Echo it is flying home to
    let target: Enemy | null = null;
    for (const e of w.enemies) {
      if (e.id === pr.homing) {
        target = e;
        break;
      }
    }
    if (target && hittable(target)) {
      const tx = target.x - pr.x;
      const ty = target.y - pr.y;
      const tl = Math.sqrt(tx * tx + ty * ty);
      if (tl > 1e-6) {
        const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
        const ux = tx / tl;
        const uy = ty / tl;
        // near its mark it turns as tightly as it must, so it never circles what it is after
        const step = Math.max(pr.turn, (2 * sp) / tl) * dt;
        const dot = sp > 1e-9 ? (pr.vx * ux + pr.vy * uy) / sp : 1;
        if (pr.turn <= 0 || dot >= dcos(step)) {
          pr.vx = ux * sp;
          pr.vy = uy * sp;
        } else {
          // it comes round at its own rate, the shorter way
          const c = dcos(step);
          const s = dsin(step) * (pr.vx * uy - pr.vy * ux >= 0 ? 1 : -1);
          const nx = pr.vx * c - pr.vy * s;
          pr.vy = pr.vx * s + pr.vy * c;
          pr.vx = nx;
        }
      }
    } else {
      pr.homing = 0;
    }
  }

  let rem = dt;
  for (let iter = 0; iter < 5 && rem > 1e-9 && !pr.dead; iter++) {
    const dx = pr.vx * rem;
    const dy = pr.vy * rem;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-12) break;

    // The earliest thing in the way. The chamber wins a tie, then the lower id.
    let t = 1;
    let what = NOTHING;
    let stone: Ringstone | null = null;
    let enemy: Enemy | null = null;
    let bomb: Bomb | null = null;
    let player: Player | null = null;
    let orb: Projectile | null = null;
    if (castCircle(geo, false, pr.x, pr.y, dx, dy, pr.radius, hit)) {
      t = hit.t;
      what = CHAMBER;
    }
    if (w) {
      if (pr.faction === 'player') {
        for (const st of w.stones) {
          if (st.dead || st.flying || pr.hits.includes(st.id)) continue;
          const ts = circleTime(pr.x, pr.y, dx, dy, st.x, st.y, st.radius + pr.radius);
          if (ts < 0 || ts >= t) continue;
          t = ts;
          what = STONE;
          stone = st;
        }
        for (const e of w.enemies) {
          if (!hittable(e) || pr.hits.includes(e.id)) continue;
          const te = circleTime(pr.x, pr.y, dx, dy, e.x, e.y, e.radius + pr.radius);
          if (te < 0 || te > t) continue;
          if (te === t && (what !== ENEMY || (enemy !== null && e.id > enemy.id))) continue;
          t = te;
          what = ENEMY;
          enemy = e;
        }
        for (const b of w.bombs) {
          if (b.dead || b.state !== 'fuse') continue;
          const tb = circleTime(pr.x, pr.y, dx, dy, b.x, b.y, BOMB_TOUCH + pr.radius);
          if (tb < 0 || tb >= t) continue;
          t = tb;
          what = BOMB;
          bomb = b;
        }
        // an arrow can meet an orb in the air (a shot already sent back flies on past)
        if (!pr.returned) {
          for (const o of w.projectiles) {
            if (o.dead || o.faction !== 'enemy' || o.kind !== 'orb') continue;
            const to = circleTime(pr.x, pr.y, dx, dy, o.x, o.y, o.radius + pr.radius);
            if (to < 0 || to >= t) continue;
            t = to;
            what = ORB;
            orb = o;
          }
        }
      } else {
        for (const pl of w.players) {
          // Swept, so a fast shot cannot skip through someone between ticks. A dash passes clean through.
          if (!standing(pl) || pl.iframes > 0) continue;
          const tp = circleTime(pr.x, pr.y, dx, dy, pl.x, pl.y, pl.radius + pr.radius);
          if (tp < 0 || tp >= t) continue;
          t = tp;
          what = PLAYER;
          player = pl;
        }
      }
    }

    // Stop a hair short of anything solid, so the next move does not start inside it.
    const solid = what === CHAMBER || what === STONE;
    const tc = what === NOTHING ? 1 : solid ? Math.max(0, t - SKIN / len) : t;
    pr.x += dx * tc;
    pr.y += dy * tc;
    pr.range -= len * tc;
    if (what === NOTHING) break;
    rem *= 1 - t;

    if (what === ORB && orb && w) {
      // The arrow sends the orb home, and is spent.
      for (const pl of w.players) if (pl.slot === pr.owner) returnOrb(w, orb, pl, pr.vx, pr.vy, false);
      end(w, pr, true, trace);
      break;
    }

    if (what === CHAMBER) {
      const bumper = hit.kind === HIT_BUMPER;
      if (!bumper && pr.bounces <= 0) {
        end(w, pr, true, trace);
        break;
      }
      if (hit.ntype >= 0) reflectFixed(pr.vx, pr.vy, hit.ntype, v);
      else reflectFree(pr.vx, pr.vy, hit.nx, hit.ny, v);
      if (bumper) {
        // a bumper costs no bounce, kicks the shot faster, and makes its next hit land harder
        const sp = Math.sqrt(v.x * v.x + v.y * v.y);
        const k = Math.min(BODY.bumperRestitution, MAX_SHOT_SPEED / (sp || 1));
        v.x *= k;
        v.y *= k;
        pr.boost = Math.max(pr.boost, BODY.bumperBoost);
      } else {
        pr.bounces--;
        if (pr.quick !== 1) {
          // Skipping Stone: quicker off every wall
          const sp = Math.sqrt(v.x * v.x + v.y * v.y);
          const k = Math.min(pr.quick, MAX_SHOT_SPEED / (sp || 1));
          v.x *= k;
          v.y *= k;
        }
      }
      pr.vx = v.x;
      pr.vy = v.y;
      pr.bounced++;
      pr.hits.length = 0;
      if (trace) trace.push(pr.x, pr.y);
      else if (w) {
        const off: BounceKind = bumper ? 'bumper' : hit.kind === HIT_POST ? 'post' : 'wall';
        w.events.push({ type: 'ricochet', id: pr.id, by: pr.faction === 'player' ? pr.owner : -1, x: pr.x, y: pr.y, n: pr.bounced, off, nx: hit.nx, ny: hit.ny });
      }
    } else if (what === STONE && stone && w) {
      // A Ringstone sends the shot at the nearest Echo, harder, and it costs no bounce.
      let nx = pr.x - stone.x;
      let ny = pr.y - stone.y;
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl;
      ny /= nl;
      const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
      // whoever planted it: what a stone does to a shot depends on what they hold
      const sm = playerBySlot(w, stone.owner)?.mods ?? null;
      // Bell Tower: with the other stone in sight, the shot goes to it, a few times, before it is let go
      let tower: Ringstone | null = null;
      if (sm && sm.bellTower > 0 && pr.tolls < STRING.towerMost) {
        for (const other of w.stones) {
          if (other === stone || other.dead || other.flying || other.owner !== stone.owner) continue;
          if (!castCircle(geo, false, stone.x, stone.y, other.x - stone.x, other.y - stone.y, pr.radius, hit)) tower = other;
        }
      }
      const target = tower ?? nearestEcho(w, stone.x, stone.y, RINGSTONE.seek, 0);
      if (tower) pr.tolls++;
      let aimed = false;
      if (target) {
        const tx = target.x - pr.x;
        const ty = target.y - pr.y;
        const tl = Math.sqrt(tx * tx + ty * ty);
        if (tl > 1e-6) {
          pr.vx = (tx / tl) * sp;
          pr.vy = (ty / tl) * sp;
          aimed = true;
        }
      }
      if (!aimed) {
        reflectFree(pr.vx, pr.vy, nx, ny, v);
        pr.vx = v.x;
        pr.vy = v.y;
      }
      // Resonant Stone: it sends things on harder still, and pulses when it is struck
      pr.boost = Math.max(pr.boost, BODY.stoneBoost, sm ? sm.stoneBoost : 0);
      pr.bounced++;
      pr.range = Math.max(pr.range, STRING.stoneRange);
      pr.life = Math.max(pr.life, STRING.stoneLife);
      pr.homing = 0;
      // it will not meet this stone again until it has bounced off something else
      pr.hits.length = 0;
      pr.hits.push(stone.id);
      stone.rungT = 0;
      if (sm && sm.stonePulse > 0) burstAt(w, stone.x, stone.y, STRING.pulseRadius, sm.stonePulse, stone.owner, 'stone');
      w.events.push({ type: 'ricochet', id: pr.id, by: pr.owner, x: pr.x, y: pr.y, n: pr.bounced, off: 'stone', nx, ny });
    } else if (what === ENEMY && enemy && w) {
      strike(w, pr, enemy);
    } else if (what === BOMB && bomb && w) {
      detonateBomb(w, bomb, pr.owner);
      end(w, pr, true, null);
    } else if (what === PLAYER && player && w) {
      const res = damagePlayer(w, player, pr.damage, pr.x - pr.vx, pr.y - pr.vy, 1.2);
      if (res === HURT_TAKEN) {
        end(w, pr, true, null);
      } else {
        break;
      }
    }
  }
  if (!pr.dead && (pr.life <= 0 || pr.range <= 0)) end(w, pr, false, trace);
}

export function stepProjectiles(w: World, dt: number): void {
  const hit = newHit();
  const v: Vec2 = { x: 0, y: 0 };
  let anyDead = false;
  // Iterate over the shots that exist now: anything loosed during the step flies next tick.
  const n = w.projectiles.length;
  for (let i = 0; i < n; i++) {
    const p = w.projectiles[i];
    if (!p.dead) {
      p.px = p.x;
      p.py = p.y;
      advance(w, w.room.geo, p, dt, hit, v, null);
    }
    if (p.dead) anyDead = true;
  }
  if (anyDead) w.projectiles = w.projectiles.filter((p) => !p.dead);
}

/**
 * The path an arrow loosed right now along `angle` would take off the chamber alone, as a flat
 * list of points: where it starts, each place it turns, and where it stops. It is traced until it
 * has turned more than `turns` times or ends.
 */
export function previewArrow(w: World, p: Player, angle: number, turns: number, out: number[]): void {
  const ghost = make(0, arrowSpec(p, angle));
  const hit = newHit();
  const v: Vec2 = { x: 0, y: 0 };
  out.length = 0;
  out.push(ghost.x, ghost.y);
  for (let tick = 0; tick < 240 && !ghost.dead && ghost.bounced <= turns; tick++) advance(null, w.room.geo, ghost, DT, hit, v, out);
  if (!ghost.dead && ghost.bounced <= turns) out.push(ghost.x, ghost.y);
}
