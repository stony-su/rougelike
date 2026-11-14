// Shots: things in flight that hurt whoever is on the other side. A shot bounces off the chamber
// with the same cast everything else uses, can change sides in mid-air, and remembers how it got
// where it is, because a hit from something that bounced or was sent back is a Return.
//
// One function moves a shot for one tick. The aim preview runs that same function on a ghost
// shot with nobody in the room, so the path drawn is, bit for bit, the path flown.
import { dcos, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { nearestEcho, pushBody } from './bodies';
import { BOMB_TOUCH, detonateBomb } from './bombs';
import { HIT_BUMPER, HIT_POST, SKIN, castCircle, circleTime, newHit } from './cast';
import type { Hit } from './cast';
import { HURT_GUARDED, HURT_TAKEN, damageEnemy, damagePlayer, hittable, standing } from './combat';
import { reflectFixed, reflectFree } from './geo';
import type { Geo } from './geo';
import { addRally, rallyMul } from './rally';
import { BODY, BOW, BREAK, DT, HITSTOP, RALLY, REFLECT, RINGSTONE } from './tuning';
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
    bounces: BOW.bounces,
    skips: BOW.skips,
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
  const sp = Math.min(MAX_SHOT_SPEED, Math.max(REFLECT.minSpeed, Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy) * REFLECT.speedMul));
  pr.vx = dcos(angle) * sp;
  pr.vy = dsin(angle) * sp;
  pr.faction = 'player';
  pr.owner = p.slot;
  pr.returned = true;
  pr.perfect = perfect;
  pr.damage = Math.max(REFLECT.minDamage, pr.damage * REFLECT.damageMul) * (perfect ? REFLECT.perfectMul : 1);
  pr.bounces = REFLECT.bounces;
  pr.bounced = 0;
  pr.skips = 0;
  pr.skipped = 0;
  pr.pierce = perfect ? 99 : 0;
  pr.range = REFLECT.range;
  pr.life = REFLECT.range / sp + 0.1;
  pr.boost = 0;
  pr.homing = homing;
  pr.hits.length = 0;
  w.events.push({ type: 'reflect', player: p.slot, id: pr.id, x: pr.x, y: pr.y, perfect });
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
  // It is a Return if the shot was sent back, or has bounced or skipped on its way here.
  const sent = pr.returned || pr.bounced > 0 || pr.skipped > 0 || pr.boost > 0;
  let amount = pr.damage * (1 + BOW.bounceBonus * Math.min(pr.bounced, MAX_BOUNCE_BONUS)) * (1 + pr.boost);
  for (let i = 0; i < pr.skipped; i++) amount *= BOW.skipMul;
  if (sent) amount *= rallyMul(w, pr.owner);
  pr.boost = 0;
  damageEnemy(w, e, amount, {
    kind: sent ? 'return' : 'direct',
    by: pr.owner,
    dx: ux,
    dy: uy,
    crit: pr.perfect,
    heavy: pr.returned,
    freeze: pr.perfect ? HITSTOP.perfect : HITSTOP.light,
  });
  if (sent) addRally(w, pr.owner, pr.perfect ? RALLY.weight.perfect : pr.returned ? RALLY.weight.sent : RALLY.weight.arrow, e.x, e.y);
  if (!e.dead) pushBody(w, e, ux, uy, pr.returned ? REFLECT.impulse : BOW.impulse, pr.owner);
  pr.hits.push(e.id);
  if (pr.homing === e.id) pr.homing = 0;

  if (pr.pierce > 0) {
    pr.pierce--;
    return;
  }
  if (pr.skips > 0) {
    // skip on to the nearest Echo it has not struck yet
    let next: Enemy | null = null;
    let bd = BOW.skipRange * BOW.skipRange;
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
        w.events.push({ type: 'skip', by: pr.owner, fromX: pr.x, fromY: pr.y, toX: next.x, toY: next.y });
        return;
      }
    }
  }
  end(w, pr, true, null);
}

const NOTHING = 0;
const CHAMBER = 1;
const STONE = 2;
const ENEMY = 3;
const BOMB = 4;
const PLAYER = 5;

/**
 * Move one shot for one tick. With a world, it meets everything in it. Without one (`w` null) it
 * is a ghost that meets only the chamber, and every point where it turns is appended to `trace`.
 */
function advance(w: World | null, geo: Geo, pr: Projectile, dt: number, hit: Hit, v: Vec2, trace: number[] | null): void {
  pr.life -= dt;
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
        pr.vx = (tx / tl) * sp;
        pr.vy = (ty / tl) * sp;
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
      } else {
        for (const pl of w.players) {
          // Swept, so a fast shot cannot skip through someone between ticks. A dash passes clean through.
          if (!standing(pl) || (pl.iframes > 0 && pl.guardT <= 0)) continue;
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
      const target = nearestEcho(w, stone.x, stone.y, RINGSTONE.seek, 0);
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
      pr.boost = Math.max(pr.boost, BODY.stoneBoost);
      pr.bounced++;
      // it will not meet this stone again until it has bounced off something else
      pr.hits.length = 0;
      pr.hits.push(stone.id);
      stone.rungT = 0;
      w.events.push({ type: 'ricochet', id: pr.id, by: pr.owner, x: pr.x, y: pr.y, n: pr.bounced, off: 'stone', nx, ny });
    } else if (what === ENEMY && enemy && w) {
      strike(w, pr, enemy);
    } else if (what === BOMB && bomb && w) {
      detonateBomb(w, bomb, pr.owner);
      end(w, pr, true, null);
    } else if (what === PLAYER && player && w) {
      const res = damagePlayer(w, player, pr.damage, pr.x - pr.vx, pr.y - pr.vy, 1.2);
      if (res === HURT_GUARDED) {
        // A Riposte: the shot goes straight back to whoever fired it.
        let sender: Enemy | null = null;
        for (const e of w.enemies) {
          if (e.id === pr.owner && hittable(e)) {
            sender = e;
            break;
          }
        }
        const bx = sender ? sender.x - pr.x : -pr.vx;
        const by = sender ? sender.y - pr.y : -pr.vy;
        const bl = Math.sqrt(bx * bx + by * by) || 1;
        returnShot(w, pr, player, 0, true, sender ? sender.id : 0);
        const sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
        pr.vx = (bx / bl) * sp;
        pr.vy = (by / bl) * sp;
      } else if (res === HURT_TAKEN) {
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
