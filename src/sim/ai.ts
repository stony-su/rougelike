// Enemy behaviour: one small state machine driven entirely by an EnemyDef.
//
//   spawn -> idle/move -> windup (telegraphed) -> attack -> recover -> idle/move ...
//                              \-> stun (cancels the attack)
//
// Locomotion styles, telegraph shapes and action kinds are the shared primitives every enemy is
// assembled from. Nothing in this file names a particular enemy. Each enemy is after one player
// at a time (its target), chosen by distance with a little stickiness.
import { datan2, dcos, dhypot, dsin } from '../core/dmath';
import { ddamp, ddampAngle } from '../core/exact';
import type { Vec2 } from '../core/exact';
import { climbOut, newBodyScratch, pushBody, stepBody } from './bodies';
import type { BodyScratch } from './bodies';
import { throwBomb } from './bombs';
import { castCircle, pushOut } from './cast';
import { HURT_GUARDED, damagePlayer, standing, stunEnemy } from './combat';
import type { ActionSpec, EnemyDef, MoveSpec } from './defs';
import { navFor, navStep } from './nav';
import { spawnProjectile } from './projectiles';
import { newStatus, slowOf, stepStatus } from './status';
import { addTelegraph, findTelegraph, laneAngle, telegraphCovers } from './telegraphs';
import { RIPOSTE, SCALING } from './tuning';
import type { Enemy, Player, World } from './types';

export const SPAWN_TIME = 0.75;

function setState(e: Enemy, s: Enemy['state'], dur = 0): void {
  e.state = s;
  e.stateTime = 0;
  e.stateDur = dur;
}

/** The standing player nearest a point: lowest slot on a tie. Null when everyone is down. */
export function nearestPlayer(w: World, x: number, y: number): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of w.players) {
    if (!standing(p)) continue;
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

const playerBySlot = (w: World, slot: number): Player | null => {
  for (const p of w.players) if (p.slot === slot) return p;
  return null;
};

/** A blow that landed in a Riposte comes back on whoever struck it: thrown clear, and dazed. */
function answerRiposte(w: World, e: Enemy, p: Player): void {
  let dx = e.x - p.x;
  let dy = e.y - p.y;
  const d = dhypot(dx, dy);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = dcos(p.aim);
    dy = dsin(p.aim);
  }
  stunEnemy(w, e, RIPOSTE.stun, true);
  pushBody(w, e, dx, dy, RIPOSTE.impulse, p.slot);
}

/** Keep the current target unless it is down or someone else is clearly closer. */
function chooseTarget(w: World, e: Enemy): Player | null {
  const near = nearestPlayer(w, e.x, e.y);
  if (!near) return null;
  const cur = playerBySlot(w, e.target);
  if (!cur || !standing(cur)) {
    e.target = near.slot;
    return near;
  }
  if (near !== cur) {
    const dn = (near.x - e.x) * (near.x - e.x) + (near.y - e.y) * (near.y - e.y);
    const dc = (cur.x - e.x) * (cur.x - e.x) + (cur.y - e.y) * (cur.y - e.y);
    // someone else must be a fifth closer before the enemy changes its mind
    if (dn < dc * 0.64) {
      e.target = near.slot;
      return near;
    }
  }
  return cur;
}

export function spawnEnemy(
  w: World,
  def: EnemyDef,
  x: number,
  y: number,
  o: { elite?: string | null; hpMul?: number; instant?: boolean } = {},
): Enemy {
  const depth = Math.max(0, w.chamber - 1);
  const crowd = 1 + SCALING.coopHp * Math.max(0, w.players.length - 1);
  const hp = Math.round(def.hp * (1 + SCALING.hpPerChamber * depth) * crowd * (o.hpMul ?? 1));
  const near = nearestPlayer(w, x, y);
  const e: Enemy = {
    id: w.nextId++,
    defId: def.id,
    def,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    lvx: 0,
    lvy: 0,
    launchBy: -1,
    links: 0,
    launchImmune: 0,
    boost: 0,
    caromWith: 0,
    caromLock: 0,
    stagger: 0,
    staggerT: 0,
    staggered: 0,
    radius: def.radius,
    hp,
    maxHp: hp,
    facing: near ? datan2(near.y - y, near.x - x) : 0,
    state: 'spawn',
    stateTime: 0,
    stateDur: SPAWN_TIME,
    move: -1,
    // Stagger first attacks so a wave does not open in unison.
    cooldowns: def.moves.map(() => w.rng.float(0.2, 1.1)),
    thinkT: 0,
    target: near ? near.slot : 0,
    aimX: x,
    aimY: y,
    telegraph: 0,
    hurtT: 9,
    stunImmune: 0,
    damageMul: 1 + SCALING.damagePerChamber * depth,
    speedMul: 1,
    windupMul: 1,
    elite: o.elite ?? null,
    seed: w.rng.next(),
    hitDone: 0,
    lastHitX: 1,
    lastHitY: 0,
    mem: [0, 0, 0, 0],
    armor: 1,
    airborne: false,
    freeze: 0,
    status: newStatus(),
    dead: false,
  };
  if (o.instant) setState(e, 'idle');
  w.enemies.push(e);
  w.events.push({ type: 'enemySpawn', id: e.id, kind: def.id, x, y });
  return e;
}

/** How many enemies may be winding up or attacking at once. Keeps crowds fair and readable. */
function attackTickets(w: World): number {
  return 2 + Math.floor(w.chamber / 4) + Math.max(0, w.players.length - 1);
}

function busyAttackers(w: World): number {
  let n = 0;
  for (const e of w.enemies) if (!e.dead && (e.state === 'windup' || e.state === 'attack')) n++;
  return n;
}

/** How much of the way to the target is open: nothing, a flight over pits only, or a walk. */
const WAY_BLOCKED = 0;
const WAY_FLIGHT = 1;
const WAY_WALK = 2;

/**
 * A move may start if it is off cooldown, the target is in its range, and the way suits it: a
 * charge needs a clear walk, a shot a clear flight, and something lobbed goes over anything.
 */
function usable(e: Enemy, i: number, dist: number, way: number): boolean {
  const m = e.def.moves[i];
  if (e.cooldowns[i] > 0 || dist < m.minRange || dist > m.maxRange) return false;
  if (m.action.kind === 'lob') return true;
  return m.action.kind === 'volley' ? way >= WAY_FLIGHT : way >= WAY_WALK;
}

function chooseMove(w: World, e: Enemy, dist: number, clear: number): number {
  let total = 0;
  const moves = e.def.moves;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!usable(e, i, dist, clear)) continue;
    total += m.weight ?? 1;
  }
  if (total <= 0) return -1;
  let r = w.rng.next() * total;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!usable(e, i, dist, clear)) continue;
    r -= m.weight ?? 1;
    if (r <= 0) return i;
  }
  return -1;
}

function beginWindup(w: World, e: Enemy, index: number, p: Player): void {
  const m = e.def.moves[index];
  e.move = index;
  setState(e, 'windup', m.windup * e.windupMul);
  e.vx = 0;
  e.vy = 0;
  e.aimX = p.x;
  e.aimY = p.y;
  e.facing = datan2(p.y - e.y, p.x - e.x);
  const tg = m.telegraph;
  const track = tg.track * e.windupMul;
  let t;
  if (tg.shape === 'lane') {
    t = addTelegraph(w, 'lane', e.id, e.x, e.y, e.stateDur, { angle: e.facing, length: tg.length, width: tg.width, trackUntil: track, count: tg.count ?? 1, spread: tg.spread ?? 0 });
  } else if (tg.shape === 'cone') {
    t = addTelegraph(w, 'cone', e.id, e.x, e.y, e.stateDur, { angle: e.facing, radius: tg.radius, halfArc: tg.halfArc, trackUntil: track });
  } else {
    const atSelf = tg.at === 'self';
    t = addTelegraph(w, 'circle', e.id, atSelf ? e.x : p.x, atSelf ? e.y : p.y, e.stateDur, { radius: tg.radius, trackUntil: track });
  }
  e.telegraph = t.id;
  w.events.push({ type: 'enemyWindup', id: e.id, kind: e.defId, move: m.id, x: e.x, y: e.y });
}

/** During the wind-up the aim follows the target for a while, then locks; the telegraph shows exactly that. */
function trackWindup(w: World, e: Enemy, m: MoveSpec): void {
  const p = playerBySlot(w, e.target);
  const t = findTelegraph(w, e.telegraph);
  const tracking = t && p && standing(p) ? e.stateTime < t.trackUntil : false;
  if (tracking && p) {
    e.aimX = p.x;
    e.aimY = p.y;
    e.facing = datan2(p.y - e.y, p.x - e.x);
  }
  if (!t) return;
  if (m.telegraph.shape === 'circle') {
    if (m.telegraph.at === 'self') {
      t.x = e.x;
      t.y = e.y;
    } else if (tracking) {
      t.x = e.aimX;
      t.y = e.aimY;
    }
  } else {
    // Lanes and cones stay rooted on the enemy even if it is knocked about.
    t.x = e.x;
    t.y = e.y;
    if (tracking) t.angle = e.facing;
  }
}

function beginAction(w: World, e: Enemy, m: MoveSpec): void {
  const a: ActionSpec = m.action;
  const t = findTelegraph(w, e.telegraph);
  w.events.push({ type: 'enemyAttack', id: e.id, kind: e.defId, move: m.id, x: e.x, y: e.y });
  e.hitDone = 0;
  switch (a.kind) {
    case 'lunge': {
      setState(e, 'attack', a.distance / a.speed);
      e.vx = dcos(e.facing) * a.speed;
      e.vy = dsin(e.facing) * a.speed;
      break;
    }
    case 'strike': {
      // Everyone standing in the warned shape is struck.
      if (t) {
        for (const p of w.players) {
          if (!standing(p) || !telegraphCovers(t, p.x, p.y, p.radius)) continue;
          if (damagePlayer(w, p, a.damage * e.damageMul, e.x, e.y, a.knock) === HURT_GUARDED) answerRiposte(w, e, p);
        }
        w.events.push({ type: 'slam', x: t.x, y: t.y, radius: t.shape === 'lane' ? t.length / 2 : t.radius });
      }
      setState(e, 'attack', 0.14);
      break;
    }
    case 'volley': {
      // The shots fly along the lanes that were drawn: the same angles, from the same arithmetic.
      const fan = { angle: t ? t.angle : datan2(e.aimY - e.y, e.aimX - e.x), count: a.count, spread: a.spread };
      for (let i = 0; i < a.count; i++) {
        const dir = laneAngle(fan, i);
        // A shot leaves from the middle of the body, which is never inside a wall.
        spawnProjectile(w, {
          kind: a.projectile,
          faction: 'enemy',
          owner: e.id,
          x: e.x,
          y: e.y,
          vx: dcos(dir) * a.speed,
          vy: dsin(dir) * a.speed,
          radius: a.radius,
          damage: a.damage * e.damageMul,
          range: a.range,
        });
      }
      setState(e, 'attack', 0.16);
      break;
    }
    case 'lob': {
      throwBomb(w, e, t ? t.x : e.aimX, t ? t.y : e.aimY, { damage: a.damage * e.damageMul, radius: a.radius, flight: a.flight, fuse: a.fuse });
      setState(e, 'attack', 0.2);
      break;
    }
  }
  // The telegraph has done its job; let it flash out.
  if (t) t.t = Math.max(t.t, t.dur);
  e.telegraph = 0;
}

function stepAttack(w: World, e: Enemy, m: MoveSpec): void {
  const a = m.action;
  if (a.kind === 'lunge') {
    for (const p of w.players) {
      const bit = 1 << p.slot;
      if (e.hitDone & bit || !standing(p)) continue;
      const reach = e.radius + p.radius + 0.06;
      if ((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) <= reach * reach) {
        // One chance per player per lunge: a dash through it is a clean dodge.
        e.hitDone |= bit;
        if (damagePlayer(w, p, a.damage * e.damageMul, e.x - dcos(e.facing), e.y - dsin(e.facing), a.knock) === HURT_GUARDED) {
          answerRiposte(w, e, p);
          return;
        }
      }
    }
  }
  if (e.stateTime >= e.stateDur) {
    if (a.kind === 'lunge') {
      // Skid to a stop.
      e.lvx += e.vx * 0.2;
      e.lvy += e.vy * 0.2;
    }
    e.vx = 0;
    e.vy = 0;
    e.cooldowns[e.move] = m.cooldown;
    setState(e, 'recover', m.recovery);
  }
}

function locomote(w: World, e: Enemy, dt: number, s: BodyScratch): void {
  const p = chooseTarget(w, e);
  const loc = e.def.locomotion;
  let dx = 0;
  let dy = 0;
  let dist = 0;
  // Whether a straight walk reaches the target, or only a flight does, or neither.
  let way = WAY_WALK;
  if (p) {
    dx = p.x - e.x;
    dy = p.y - e.y;
    dist = dhypot(dx, dy) || 1e-6;
    if (!e.airborne && castCircle(w.room.geo, true, e.x, e.y, dx, dy, e.radius * 0.9, s.hit)) {
      way = castCircle(w.room.geo, false, e.x, e.y, dx, dy, 0.16, s.hit) ? WAY_BLOCKED : WAY_FLIGHT;
    }
    dx /= dist;
    dy /= dist;
  }
  const clear = way === WAY_WALK;
  const speed = e.def.speed * e.speedMul * (1 - slowOf(e));
  let tx = 0;
  let ty = 0;
  if (p) {
    if (!clear && loc.kind === 'chase') {
      // Something is in the way: follow the walking field of that player round it.
      const field = navFor(w, w.players.indexOf(p));
      if (field && navStep(w.room, field, e.x, e.y, s.v)) {
        tx = s.v.x * speed;
        ty = s.v.y * speed;
      }
    } else if (loc.kind === 'chase') {
      if (dist > loc.range) {
        tx = dx * speed;
        ty = dy * speed;
        if (loc.weave) {
          const s = dsin(w.time * 2.6 + e.seed * 6.283) * loc.weave * speed;
          tx += -dy * s;
          ty += dx * s;
        }
      }
    } else if (loc.kind === 'kite') {
      if (dist < loc.min) {
        tx = -dx * speed;
        ty = -dy * speed;
      } else if (dist > loc.max) {
        tx = dx * speed;
        ty = dy * speed;
      } else {
        // Inside the band: drift sideways so it is not a sitting target.
        const s = (e.seed < 0.5 ? -1 : 1) * speed * 0.4;
        tx = -dy * s;
        ty = dx * s;
      }
    }
  }
  e.vx = ddamp(e.vx, tx, 10, dt);
  e.vy = ddamp(e.vy, ty, 10, dt);
  const moving = e.vx * e.vx + e.vy * e.vy > 0.04;
  if (e.state === 'idle' && moving) setState(e, 'move');
  else if (e.state === 'move' && !moving) setState(e, 'idle');
  if (p) e.facing = ddampAngle(e.facing, datan2(dy, dx), 9, dt);

  // Decide whether to attack.
  if (!p) return;
  e.thinkT -= dt;
  if (e.thinkT > 0) return;
  e.thinkT = 0.1;
  if (busyAttackers(w) >= attackTickets(w)) return;
  const pick = chooseMove(w, e, dist, way);
  if (pick >= 0) beginWindup(w, e, pick, p);
}

/** Standing on the floor and taking up room: not arriving, not in flight, not down a pit. */
const grounded = (e: Enemy): boolean => !e.dead && e.state !== 'spawn' && e.state !== 'launched' && e.state !== 'pit';

/** Keep bodies from overlapping: enemies push each other apart, and are pushed off the players. */
function separate(w: World, tmp: Vec2): void {
  const es = w.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (!grounded(a)) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (!grounded(b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.5;
      const wa = b.def.mass / (a.def.mass + b.def.mass);
      const wb = 1 - wa;
      a.x -= (dx / d) * push * 2 * wa;
      a.y -= (dy / d) * push * 2 * wa;
      b.x += (dx / d) * push * 2 * wb;
      b.y += (dy / d) * push * 2 * wb;
    }
    // Lunging enemies pass through players (that is the hit); everyone else is nudged off.
    if (a.state === 'attack') continue;
    for (const p of w.players) {
      if (!standing(p)) continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const rr = a.radius + p.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        a.x = p.x + (dx / d) * rr;
        a.y = p.y + (dy / d) * rr;
      }
    }
  }
  for (const e of es) {
    if (!grounded(e)) continue;
    tmp.x = e.x;
    tmp.y = e.y;
    if (pushOut(w.room.geo, !e.airborne, tmp, e.radius)) {
      e.x = tmp.x;
      e.y = tmp.y;
    }
  }
}

export function stepEnemies(w: World, dt: number): void {
  const tmp: Vec2 = { x: 0, y: 0 };
  const s = newBodyScratch();
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.dead) continue;
    // Per-body hit-stop: this enemy's own timeline waits.
    if (e.freeze > 0) {
      e.freeze--;
      continue;
    }
    e.stateTime += dt;
    e.hurtT += dt;
    if (e.stunImmune > 0) e.stunImmune -= dt;
    for (let i = 0; i < e.cooldowns.length; i++) if (e.cooldowns[i] > 0) e.cooldowns[i] -= dt;
    if (e.state !== 'spawn') {
      stepStatus(w, e, dt);
      if (e.dead) continue;
    }

    const m = e.move >= 0 ? e.def.moves[e.move] : undefined;
    switch (e.state) {
      case 'spawn':
        if (e.stateTime >= e.stateDur) setState(e, 'idle');
        break;
      case 'idle':
      case 'move':
        locomote(w, e, dt, s);
        break;
      case 'windup':
        if (!m) {
          setState(e, 'idle');
          break;
        }
        trackWindup(w, e, m);
        if (e.stateTime >= e.stateDur) beginAction(w, e, m);
        break;
      case 'attack':
        if (!m) {
          setState(e, 'idle');
          break;
        }
        stepAttack(w, e, m);
        break;
      case 'recover':
        e.vx = ddamp(e.vx, 0, 12, dt);
        e.vy = ddamp(e.vy, 0, 12, dt);
        if (e.stateTime >= e.stateDur) {
          e.move = -1;
          setState(e, 'idle');
        }
        break;
      case 'stun':
        e.vx = 0;
        e.vy = 0;
        if (e.stateTime >= e.stateDur) setState(e, 'idle');
        break;
      case 'pit':
        if (e.stateTime >= e.stateDur) climbOut(w, e, s);
        break;
      case 'launched':
      case 'dead':
        break;
    }
    if (e.state !== 'spawn' && e.state !== 'pit' && !e.dead) stepBody(w, e, dt, s);
  }
  separate(w, tmp);
}

/** Drop enemies that died this tick. Their death events have already been emitted. */
export function sweepDead(w: World): void {
  let any = false;
  for (const e of w.enemies) {
    if (e.dead) {
      any = true;
      break;
    }
  }
  if (any) w.enemies = w.enemies.filter((e) => !e.dead);
}
