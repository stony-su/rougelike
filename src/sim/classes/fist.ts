// The Fist, the Hand. Jabs fire on the press. Keep the button held and the hand draws back: let
// go for a Haymaker that sends its target flying. The special is the Break, a ground slam that
// pops everything nearby outward like the first shot of a game of billiards.
import { dcos, dhypot, dsin } from '../../core/dmath';
import { clamp01, ddamp } from '../../core/exact';
import type { Vec2 } from '../../core/exact';
import { pointInSector } from '../../core/geom';
import { addStagger, pushBody } from '../bodies';
import { BOMB_TOUCH, batBomb } from '../bombs';
import { damageEnemy, freezeBody, hittable, outOfReach } from '../combat';
import { rest, shift, walk } from '../move';
import { slapShot } from '../projectiles';
import { addRally, rallyMul } from '../rally';
import { BOMB, BREAK, FIST, HAYMAKER, HITSTOP, PLAYER, RALLY } from '../tuning';
import { BTN } from '../types';
import type { Enemy, Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

/** How far into the recovery of a jab the next jab may begin. */
const CHAIN_AT = 0.4;

const holding = (p: Player): boolean => (p.held & BTN.attack) !== 0;

function startJab(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = FIST.windup[combo] + FIST.active + FIST.recovery[combo];
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  p.charge = 0;
  w.events.push({ type: 'jab', player: p.slot, n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: FIST.reach, halfArc: FIST.halfArc });
}

function startCharge(p: Player): void {
  p.state = 'charge';
  p.stateTime = 0;
  p.comboTimer = 0;
}

function startBreak(p: Player): void {
  p.state = 'special';
  p.stateTime = 0;
  p.actDone = false;
  p.actDur = BREAK.windup + BREAK.recovery;
  p.specialCd = BREAK.cooldown;
  p.charge = 0;
  p.comboTimer = 0;
}

function resolveJab(w: World, p: Player): void {
  const c = p.combo;
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  let hits = 0;
  for (const e of w.enemies.slice()) {
    if (!hittable(e) || outOfReach(e)) continue;
    if (!pointInSector(e.x, e.y, p.x, p.y, p.actAngle, FIST.halfArc, FIST.reach, e.radius)) continue;
    let kx = e.x - p.x;
    let ky = e.y - p.y;
    const kd = dhypot(kx, ky);
    if (kd > 1e-6) {
      kx = (kx / kd) * 0.5 + ax * 0.5;
      ky = (ky / kd) * 0.5 + ay * 0.5;
    } else {
      kx = ax;
      ky = ay;
    }
    const kl = dhypot(kx, ky) || 1;
    damageEnemy(w, e, FIST.damage[c], { kind: 'direct', by: p.slot, dx: kx / kl, dy: ky / kl, heavy: c === 2, freeze: FIST.freeze[c] });
    if (!e.dead) {
      // Stagger first: if this jab tips the body over, the same jab already launches it harder.
      addStagger(w, e, 1);
      pushBody(w, e, kx / kl, ky / kl, FIST.impulse[c], p.slot);
    }
    hits++;
  }
  for (const b of w.bombs) {
    if (b.dead || b.state !== 'fuse') continue;
    if (pointInSector(b.x, b.y, p.x, p.y, p.actAngle, FIST.halfArc, FIST.reach, BOMB_TOUCH)) batBomb(w, b, p.slot, ax, ay, BOMB.fistSpeed);
  }
  if (hits > 0) freezeBody(p, FIST.freeze[c]);
}

function stepJab(w: World, p: Player, move: Vec2, dt: number): void {
  const c = p.combo;
  const t = p.stateTime;
  const hitAt = FIST.windup[c];
  const activeEnd = hitAt + FIST.active;

  if (!p.actDone && t >= hitAt) {
    p.actDone = true;
    resolveJab(w, p);
  }

  const stepSpeed = t < activeEnd ? FIST.step[c] / activeEnd : 0;
  const tx = dcos(p.actAngle) * stepSpeed + move.x * PLAYER.speed * FIST.moveMul;
  const ty = dsin(p.actAngle) * stepSpeed + move.y * PLAYER.speed * FIST.moveMul;
  p.vx = ddamp(p.vx, tx, 30, dt);
  p.vy = ddamp(p.vy, ty, 30, dt);
  shift(w, p, p.vx * dt, p.vy * dt);

  if (t < activeEnd) return;
  // The hold starts to count the moment the jab has landed.
  if (holding(p)) p.charge += dt;
  else p.charge = 0;
  if (wantsSpecial(w, p)) {
    startBreak(p);
    return;
  }
  if (c < 2 && p.bufAttack > 0 && t >= activeEnd + FIST.recovery[c] * CHAIN_AT) {
    startJab(w, p, c + 1);
    return;
  }
  if (t >= p.actDur) {
    if (holding(p)) {
      startCharge(p);
    } else {
      p.comboTimer = c < 2 ? FIST.comboWindow : 0;
      rest(p, move);
    }
  }
}

function stepCharge(w: World, p: Player, move: Vec2, dt: number): void {
  const before = p.charge;
  p.charge = Math.min(HAYMAKER.full, p.charge + dt);
  if (before < HAYMAKER.full && p.charge >= HAYMAKER.full) w.events.push({ type: 'chargeFull', player: p.slot, x: p.x, y: p.y });
  p.actAngle = p.aim;
  walk(w, p, move, HAYMAKER.moveMul, dt);
  if (wantsSpecial(w, p)) {
    startBreak(p);
    return;
  }
  if (holding(p)) return;
  if (p.charge < HAYMAKER.min) {
    // let go too soon: no punch
    p.charge = 0;
    rest(p, move);
    return;
  }
  // From here on `charge` is how full the punch was, 0 to 1.
  p.charge = clamp01((p.charge - HAYMAKER.min) / (HAYMAKER.full - HAYMAKER.min));
  p.state = 'release';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDone = false;
  p.actDur = HAYMAKER.lungeTime + HAYMAKER.recovery;
  w.events.push({ type: 'haymaker', player: p.slot, x: p.x, y: p.y, angle: p.actAngle, charge: p.charge });
}

/** The nearest Echo in the cone of the punch, or null. */
function inReach(w: World, p: Player): Enemy | null {
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of w.enemies) {
    if (!hittable(e) || outOfReach(e)) continue;
    if (!pointInSector(e.x, e.y, p.x, p.y, p.actAngle, HAYMAKER.halfArc, HAYMAKER.reach, e.radius)) continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bd || (d === bd && best !== null && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Land the Haymaker on the first Echo in the cone, if there is one. Bombs in the way are punched on. */
function tryPunch(w: World, p: Player): boolean {
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  for (const b of w.bombs) {
    if (b.dead || b.state !== 'fuse') continue;
    if (pointInSector(b.x, b.y, p.x, p.y, p.actAngle, HAYMAKER.halfArc, HAYMAKER.reach, BOMB_TOUCH)) batBomb(w, b, p.slot, ax, ay, BOMB.fistSpeed);
  }
  const e = inReach(w, p);
  if (!e) return false;
  const f = p.charge;
  // A full one counts as a Return: it uses the Rally, and adds to it.
  const full = f >= 1;
  let amount = HAYMAKER.damage + HAYMAKER.damagePerCharge * f;
  if (full) amount *= rallyMul(w, p.slot);
  // a full one is heavy enough to open a shield
  damageEnemy(w, e, amount, { kind: full ? 'return' : 'direct', by: p.slot, dx: ax, dy: ay, heavy: true, crit: full, freeze: full ? HITSTOP.perfect : HITSTOP.heavy, breaks: full });
  if (full) addRally(w, p.slot, RALLY.weight.perfect, e.x, e.y);
  if (!e.dead) pushBody(w, e, ax, ay, HAYMAKER.impulse + HAYMAKER.impulsePerCharge * f, p.slot);
  freezeBody(p, HITSTOP.heavy);
  return true;
}

function stepRelease(w: World, p: Player, move: Vec2, dt: number): void {
  const t = p.stateTime;
  if (!p.actDone) {
    if (t <= HAYMAKER.lungeTime) {
      const speed = HAYMAKER.lunge / HAYMAKER.lungeTime;
      p.vx = dcos(p.actAngle) * speed;
      p.vy = dsin(p.actAngle) * speed;
      shift(w, p, p.vx * dt, p.vy * dt);
      if (tryPunch(w, p)) p.actDone = true;
    } else {
      // the end of the lunge: one last reach
      tryPunch(w, p);
      p.actDone = true;
    }
    if (p.actDone) {
      p.vx = 0;
      p.vy = 0;
    }
  } else {
    walk(w, p, move, 0.25, dt);
  }
  if (t >= p.actDur) {
    p.charge = 0;
    rest(p, move);
  }
}

function resolveBreak(w: World, p: Player): void {
  const ax = dcos(p.aim);
  const ay = dsin(p.aim);
  w.events.push({ type: 'breakSlam', player: p.slot, x: p.x, y: p.y, radius: BREAK.radius });
  let hits = 0;
  for (const e of w.enemies.slice()) {
    if (!hittable(e) || outOfReach(e)) continue;
    let dx = e.x - p.x;
    let dy = e.y - p.y;
    const rr = BREAK.radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = ax;
      dy = ay;
    }
    damageEnemy(w, e, BREAK.damage, { kind: 'direct', by: p.slot, dx, dy, heavy: true, freeze: HITSTOP.heavy });
    if (!e.dead) {
      // heavy bodies stand their ground and lose their footing instead
      if (e.def.mass >= 4) addStagger(w, e, BREAK.stagger);
      else pushBody(w, e, dx, dy, BREAK.impulse, p.slot);
    }
    hits++;
  }
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy') continue;
    let dx = pr.x - p.x;
    let dy = pr.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > BREAK.radius * BREAK.radius) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = ax;
      dy = ay;
    }
    slapShot(w, pr, p, dx, dy);
  }
  for (const b of w.bombs) {
    if (b.dead || b.state !== 'fuse') continue;
    let dx = b.x - p.x;
    let dy = b.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > BREAK.radius * BREAK.radius) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = ax;
      dy = ay;
    }
    batBomb(w, b, p.slot, dx, dy, BOMB.fistSpeed);
  }
  if (hits > 0) freezeBody(p, HITSTOP.light);
}

export const FIST_KIT: Kit = {
  begin(w, p) {
    if (wantsSpecial(w, p)) {
      startBreak(p);
      return true;
    }
    if (p.bufAttack > 0) {
      startJab(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
      return true;
    }
    // still holding after a dash: the hand draws back again
    if (holding(p)) {
      startCharge(p);
      return true;
    }
    return false;
  },

  step(w, p, move, dt) {
    if (p.state === 'attack') {
      stepJab(w, p, move, dt);
    } else if (p.state === 'charge') {
      stepCharge(w, p, move, dt);
    } else if (p.state === 'release') {
      stepRelease(w, p, move, dt);
    } else {
      if (!p.actDone && p.stateTime >= BREAK.windup) {
        p.actDone = true;
        resolveBreak(w, p);
      }
      walk(w, p, move, 0.3, dt);
      if (p.stateTime >= p.actDur) rest(p, move);
    }
  },

  cancel(p) {
    p.charge = 0;
  },
};
