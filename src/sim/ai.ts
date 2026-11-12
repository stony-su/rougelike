// Enemy behaviour: one small state machine driven entirely by an EnemyDef.
//
//   spawn -> idle/move -> windup (telegraphed) -> attack -> recover -> idle/move ...
//                              \-> stun (cancels the attack)
//
// Locomotion styles, telegraph shapes and action kinds are the shared primitives every enemy is
// assembled from. Nothing in this file names a particular enemy.
import { damp, dampAngle } from '../core/math';
import type { Vec2 } from '../core/math';
import { KNOCK_DECAY, damagePlayer } from './combat';
import type { ActionSpec, EnemyDef, MoveSpec } from './defs';
import { spawnProjectile } from './projectiles';
import { resolveCircle } from './room';
import { newStatus, slowOf, stepStatus } from './status';
import { addTelegraph, findTelegraph, telegraphCovers } from './telegraphs';
import { SCALING } from './tuning';
import type { Enemy, World } from './types';

export const SPAWN_TIME = 0.75;

const tmp: Vec2 = { x: 0, y: 0 };

function setState(e: Enemy, s: Enemy['state'], dur = 0): void {
  e.state = s;
  e.stateTime = 0;
  e.stateDur = dur;
}

export function spawnEnemy(
  w: World,
  def: EnemyDef,
  x: number,
  y: number,
  o: { elite?: string | null; hpMul?: number; instant?: boolean } = {},
): Enemy {
  const depth = Math.max(0, w.sheet - 1);
  const hp = Math.round(def.hp * (1 + SCALING.hpPerSheet * depth) * (o.hpMul ?? 1));
  const e: Enemy = {
    id: w.nextId++,
    def,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    radius: def.radius,
    hp,
    maxHp: hp,
    facing: Math.atan2(w.player.y - y, w.player.x - x),
    state: 'spawn',
    stateTime: 0,
    stateDur: SPAWN_TIME,
    move: -1,
    // Stagger first attacks so a wave does not open in unison.
    cooldowns: def.moves.map(() => w.rng.float(0.2, 1.1)),
    thinkT: 0,
    aimX: x,
    aimY: y,
    telegraph: 0,
    hurtT: 9,
    stunImmune: 0,
    damageMul: 1 + SCALING.damagePerSheet * depth,
    speedMul: 1,
    windupMul: 1,
    elite: o.elite ?? null,
    seed: w.rng.next(),
    hitDone: false,
    lastHitX: 1,
    lastHitY: 0,
    dragT: 0,
    dragVX: 0,
    dragVY: 0,
    mem: [0, 0, 0, 0],
    inPlot: false,
    onLine: false,
    tripUntil: 0,
    burrowed: false,
    airborne: false,
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
  return 2 + Math.floor(w.sheet / 4);
}

function busyAttackers(w: World): number {
  let n = 0;
  for (const e of w.enemies) if (!e.dead && (e.state === 'windup' || e.state === 'attack')) n++;
  return n;
}

function chooseMove(w: World, e: Enemy, dist: number): number {
  let total = 0;
  const moves = e.def.moves;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (e.cooldowns[i] > 0 || dist < m.minRange || dist > m.maxRange) continue;
    total += m.weight ?? 1;
  }
  if (total <= 0) return -1;
  let r = w.rng.next() * total;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (e.cooldowns[i] > 0 || dist < m.minRange || dist > m.maxRange) continue;
    r -= m.weight ?? 1;
    if (r <= 0) return i;
  }
  return -1;
}

function beginWindup(w: World, e: Enemy, index: number): void {
  const m = e.def.moves[index];
  const p = w.player;
  e.move = index;
  setState(e, 'windup', m.windup * e.windupMul);
  e.vx = 0;
  e.vy = 0;
  e.aimX = p.x;
  e.aimY = p.y;
  e.facing = Math.atan2(p.y - e.y, p.x - e.x);
  const tg = m.telegraph;
  const track = tg.track * e.windupMul;
  let t;
  if (tg.shape === 'lane') {
    t = addTelegraph(w, 'lane', e.id, e.x, e.y, e.stateDur, { angle: e.facing, length: tg.length, width: tg.width, trackUntil: track });
  } else if (tg.shape === 'cone') {
    t = addTelegraph(w, 'cone', e.id, e.x, e.y, e.stateDur, { angle: e.facing, radius: tg.radius, halfArc: tg.halfArc, trackUntil: track });
  } else {
    const atSelf = tg.at === 'self';
    t = addTelegraph(w, 'circle', e.id, atSelf ? e.x : p.x, atSelf ? e.y : p.y, e.stateDur, { radius: tg.radius, trackUntil: track });
  }
  e.telegraph = t.id;
  w.events.push({ type: 'enemyWindup', id: e.id, kind: e.def.id, move: m.id, x: e.x, y: e.y });
}

/** During the wind-up the aim follows the player for a while, then locks; the telegraph shows exactly that. */
function trackWindup(w: World, e: Enemy, m: MoveSpec): void {
  const p = w.player;
  const t = findTelegraph(w, e.telegraph);
  const tracking = t ? e.stateTime < t.trackUntil : false;
  if (tracking) {
    e.aimX = p.x;
    e.aimY = p.y;
    e.facing = Math.atan2(p.y - e.y, p.x - e.x);
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
  const p = w.player;
  const t = findTelegraph(w, e.telegraph);
  w.events.push({ type: 'enemyAttack', id: e.id, kind: e.def.id, move: m.id, x: e.x, y: e.y });
  e.hitDone = false;
  switch (a.kind) {
    case 'lunge': {
      setState(e, 'attack', a.distance / a.speed);
      e.vx = Math.cos(e.facing) * a.speed;
      e.vy = Math.sin(e.facing) * a.speed;
      break;
    }
    case 'strike': {
      if (t && telegraphCovers(t, p.x, p.y, p.radius)) {
        damagePlayer(w, a.damage * e.damageMul, e.x, e.y, a.knock);
      }
      if (t) w.events.push({ type: 'slam', x: t.x, y: t.y, radius: t.shape === 'lane' ? t.length / 2 : t.radius });
      setState(e, 'attack', 0.14);
      break;
    }
    case 'volley': {
      const base = Math.atan2(e.aimY - e.y, e.aimX - e.x);
      for (let i = 0; i < a.count; i++) {
        const off = a.count === 1 ? 0 : (i / (a.count - 1) - 0.5) * a.spread;
        const ang = base + off;
        spawnProjectile(w, {
          kind: a.projectile,
          faction: 'enemy',
          owner: e.id,
          x: e.x + Math.cos(ang) * (e.radius + 0.1),
          y: e.y + Math.sin(ang) * (e.radius + 0.1),
          vx: Math.cos(ang) * a.speed,
          vy: Math.sin(ang) * a.speed,
          radius: a.radius,
          damage: a.damage * e.damageMul,
          range: a.range,
          light: true,
        });
      }
      setState(e, 'attack', 0.16);
      break;
    }
  }
  // The telegraph has done its job; let it flash out.
  if (t) t.t = Math.max(t.t, t.dur);
  e.telegraph = 0;
}

function stepAttack(w: World, e: Enemy, m: MoveSpec): void {
  const a = m.action;
  const p = w.player;
  if (a.kind === 'lunge' && !e.hitDone && p.state !== 'dead') {
    const reach = e.radius + p.radius + 0.06;
    if ((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) <= reach * reach) {
      // One chance per lunge: a dash through it is a clean dodge.
      e.hitDone = true;
      damagePlayer(w, a.damage * e.damageMul, e.x - Math.cos(e.facing), e.y - Math.sin(e.facing), a.knock);
    }
  }
  if (e.stateTime >= e.stateDur) {
    if (a.kind === 'lunge') {
      // Skid to a stop.
      e.kx += e.vx * 0.3;
      e.ky += e.vy * 0.3;
    }
    e.vx = 0;
    e.vy = 0;
    e.cooldowns[e.move] = m.cooldown;
    setState(e, 'recover', m.recovery);
  }
}

function locomote(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const loc = e.def.locomotion;
  let dx = p.x - e.x;
  let dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1e-6;
  dx /= dist;
  dy /= dist;
  const speed = e.def.speed * e.speedMul * (1 - slowOf(e));
  let tx = 0;
  let ty = 0;
  if (p.state !== 'dead') {
    if (loc.kind === 'chase') {
      if (dist > loc.range) {
        tx = dx * speed;
        ty = dy * speed;
        if (loc.weave) {
          const s = Math.sin(w.time * 2.6 + e.seed * 6.283) * loc.weave * speed;
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
  e.vx = damp(e.vx, tx, 10, dt);
  e.vy = damp(e.vy, ty, 10, dt);
  const moving = e.vx * e.vx + e.vy * e.vy > 0.04;
  if (e.state === 'idle' && moving) setState(e, 'move');
  else if (e.state === 'move' && !moving) setState(e, 'idle');
  e.facing = dampAngle(e.facing, Math.atan2(dy, dx), 9, dt);

  // Decide whether to attack.
  if (p.state === 'dead') return;
  e.thinkT -= dt;
  if (e.thinkT > 0) return;
  e.thinkT = 0.1;
  if (busyAttackers(w) >= attackTickets(w)) return;
  const pick = chooseMove(w, e, dist);
  if (pick >= 0) beginWindup(w, e, pick);
}

function integrate(w: World, e: Enemy, dt: number): void {
  // Rooted or frozen: its own legs do nothing, but blows still move it.
  const held = e.status.rootT > 0 || e.status.frozenT > 0;
  let mx = (held ? 0 : e.vx) + e.kx;
  let my = (held ? 0 : e.vy) + e.ky;
  if (e.dragT > 0) {
    e.dragT -= dt;
    mx += e.dragVX;
    my += e.dragVY;
  }
  tmp.x = e.x + mx * dt;
  tmp.y = e.y + my * dt;
  resolveCircle(w.room, tmp, e.radius);
  e.x = tmp.x;
  e.y = tmp.y;
  const k = Math.exp(-KNOCK_DECAY * dt);
  e.kx *= k;
  e.ky *= k;
  if (Math.abs(e.kx) < 0.01) e.kx = 0;
  if (Math.abs(e.ky) < 0.01) e.ky = 0;
}

/** Keep bodies from overlapping: enemies push each other apart, and are pushed off the player. */
function separate(w: World): void {
  const es = w.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.state === 'spawn') continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.state === 'spawn') continue;
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
    // Lunging enemies pass through the player (that is the hit); everyone else is nudged off.
    const p = w.player;
    if (a.state === 'attack' || p.state === 'dead') continue;
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
  for (const e of es) {
    if (e.dead) continue;
    tmp.x = e.x;
    tmp.y = e.y;
    if (resolveCircle(w.room, tmp, e.radius)) {
      e.x = tmp.x;
      e.y = tmp.y;
    }
  }
}

export function stepEnemies(w: World, dt: number): void {
  for (const e of w.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (e.dead) continue;
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
        locomote(w, e, dt);
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
        e.vx = damp(e.vx, 0, 12, dt);
        e.vy = damp(e.vy, 0, 12, dt);
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
      case 'dead':
        break;
    }
    if (e.state !== 'spawn') integrate(w, e, dt);
  }
  separate(w);
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
