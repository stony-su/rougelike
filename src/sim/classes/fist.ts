// The Fist, the Hand. Jabs fire on the press. Keep the button held and the hand draws back: let
// go for a Haymaker that sends its target flying. The special is the Break, a ground slam that
// pops everything nearby outward like the first shot of a game of billiards.
import { datan2, dcos, dhypot, dsin } from '../../core/dmath';
import { clamp01, ddamp } from '../../core/exact';
import type { Vec2 } from '../../core/exact';
import { pointInSector } from '../../core/geom';
import { addStagger, pushBody, relaunch, thunderclap } from '../bodies';
import { BOMB_TOUCH, batBomb } from '../bombs';
import { damageEnemy, freezeBody, hittable, outOfReach, stunEnemy } from '../combat';
import { rest, shift, walk } from '../move';
import { returnOrb, slapShot } from '../projectiles';
import { addRally, rallyMul } from '../rally';
import { BOMB, BREAK, DASH, FIST, HAND, HAYMAKER, HITSTOP, PLAYER, RALLY } from '../tuning';
import { BTN } from '../types';
import type { Enemy, Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

/** How far into the recovery of a jab the next jab may begin. */
const CHAIN_AT = 0.4;

const holding = (p: Player): boolean => (p.held & BTN.attack) !== 0;

/** The Echo the Fist is flying to, or landing its three blows on, if it is still there to be struck. */
function quarry(w: World, p: Player): Enemy | null {
  if (p.chase === 0) return null;
  for (const e of w.enemies) if (e.id === p.chase && hittable(e)) return e;
  return null;
}

function startJab(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  // out of a dash: the dash runs on into the punch (the three blows after a stomp are their own thing)
  p.dashIn = p.chainT > 0 && p.flurry === 0;
  p.chainT = 0;
  if (p.dashIn) p.stateTime = FIST.windup[combo] * 0.5;
  const target = p.flurry > 0 ? quarry(w, p) : null;
  if (target) {
    // one of the three blows: it is thrown at the Echo, wherever the aim is, and the Fist keeps up with it
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = dhypot(dx, dy);
    if (d > 1e-6) {
      p.actAngle = datan2(dy, dx);
      const gap = d - (FIST.reach * 0.6 + target.radius);
      if (gap > 0) shift(w, p, (dx / d) * Math.min(gap, BREAK.keepUp), (dy / d) * Math.min(gap, BREAK.keepUp));
    }
  }
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
  p.flurry = 0;
  p.chase = 0;
  // nothing hurts the Fist through the slam, or for a moment after it
  p.iframes = Math.max(p.iframes, p.actDur + BREAK.safe);
}

/**
 * Which of the Echoes the last stomp struck an attack goes after: the one nearest the line of the
 * aim, among those still standing within reach of the flight. Null if there is none.
 */
function stompTarget(w: World, p: Player): Enemy | null {
  const ax = dcos(p.aim);
  const ay = dsin(p.aim);
  let best: Enemy | null = null;
  let score = -Infinity;
  for (const e of w.enemies) {
    if (!hittable(e) || outOfReach(e) || !p.stomped.includes(e.id)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = dhypot(dx, dy);
    if (d > BREAK.chaseRange) continue;
    // along the aim counts for most, and nearness breaks ties
    const s = (d > 1e-6 ? (dx * ax + dy * ay) / d : 1) - d * 0.02;
    if (s > score || (s === score && best !== null && e.id < best.id)) {
      score = s;
      best = e;
    }
  }
  return best;
}

/** The follow-up to a stomp: fly to one of the Echoes it struck, untouchable on the way, and land three blows on arriving. */
function startChase(w: World, p: Player, e: Enemy): void {
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = dhypot(dx, dy) || 1;
  p.chase = e.id;
  p.flurry = BREAK.flurry.length;
  p.stompT = 0;
  p.stomped.length = 0;
  p.bufAttack = 0;
  p.charge = 0;
  p.comboTimer = 0;
  p.dashDirX = dx / d;
  p.dashDirY = dy / d;
  p.dashTimeLeft = BREAK.chaseMost;
  p.dodged = false;
  p.dashHit.length = 0;
  p.iframes = Math.max(p.iframes, BREAK.chaseMost + 0.1);
  p.kx = 0;
  p.ky = 0;
  // the flight is a dash in every way but one: it costs no charge (the player step steers it, player.ts)
  p.state = 'dash';
  p.stateTime = 0;
  w.events.push({ type: 'dash', player: p.slot, x: p.x, y: p.y, dx: p.dashDirX, dy: p.dashDirY });
}

function resolveJab(w: World, p: Player): void {
  const c = p.combo;
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  let hits = 0;
  // An orb within reach is punched home. Anything lighter is knocked aside: it flies off along the
  // punch as the player's, at a share of its damage, which is less than a blade makes of it.
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy') continue;
    if (!pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, FIST.halfArc, FIST.reach, pr.radius)) continue;
    if (pr.kind === 'orb') returnOrb(w, pr, p, ax, ay, false);
    else slapShot(w, pr, p, ax, ay);
  }
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
    if (p.flurry > 0 && e.id === p.chase) {
      // One of the three blows after a stomp. The first two hold the Echo where it is; the third
      // throws it along the punch, and is a Return.
      const last = p.flurry === 1;
      const blow = BREAK.flurry[BREAK.flurry.length - p.flurry] * (e.def.anchored ? FIST.anchored : 1);
      if (last) {
        damageEnemy(w, e, blow * rallyMul(w, p.slot), { kind: 'return', by: p.slot, dx: ax, dy: ay, heavy: true, freeze: HITSTOP.heavy });
        addRally(w, p.slot, RALLY.weight.sent, e.x, e.y);
        if (!e.dead) {
          // it was held a moment ago: nothing stops this one from sending it
          e.launchImmune = 0;
          pushBody(w, e, ax, ay, BREAK.finish, p.slot);
        }
      } else {
        damageEnemy(w, e, blow, { kind: 'direct', by: p.slot, dx: ax, dy: ay, freeze: FIST.freeze[c] });
        if (!e.dead) {
          addStagger(w, e, 1);
          if (e.state === 'launched') {
            // caught in the air: it drops where it is, and is dazed as it lands
            e.lvx = 0;
            e.lvy = 0;
            e.slamStun = Math.max(e.slamStun, BREAK.pin);
          } else stunEnemy(w, e, BREAK.pin, true);
        }
      }
      hits++;
      continue;
    }
    if (e.state === 'launched' && p.mods.reJab > 0 && e.rejabs < HAND.rejabMost) {
      // Rebound Jab: a body in flight is sent on again along the aim, harder and faster. It is a Return.
      const again = e.rejabs + 1;
      damageEnemy(w, e, FIST.damage[c] * (1 + p.mods.reJab) * rallyMul(w, p.slot), { kind: 'return', by: p.slot, dx: ax, dy: ay, heavy: true, freeze: HITSTOP.heavy });
      addRally(w, p.slot, RALLY.weight.sent, e.x, e.y);
      if (!e.dead) {
        const sp = dhypot(e.lvx, e.lvy) || 1;
        relaunch(w, e, ax, ay, (sp + HAND.rejabSpeed) / sp, p.slot);
        e.rejabs = again;
      }
      hits++;
      continue;
    }
    // what cannot be shoved takes the whole of the jab
    damageEnemy(w, e, FIST.damage[c] * (e.def.anchored ? FIST.anchored : 1) * (p.dashIn ? DASH.strike : 1), {
      kind: 'direct',
      by: p.slot,
      dx: kx / kl,
      dy: ky / kl,
      heavy: c === 2,
      freeze: FIST.freeze[c],
    });
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

  const stepSpeed = t < activeEnd ? (FIST.step[c] * (p.dashIn ? DASH.lunge : 1)) / activeEnd : 0;
  const tx = dcos(p.actAngle) * stepSpeed + move.x * PLAYER.speed * FIST.moveMul;
  const ty = dsin(p.actAngle) * stepSpeed + move.y * PLAYER.speed * FIST.moveMul;
  p.vx = ddamp(p.vx, tx, 30, dt);
  p.vy = ddamp(p.vy, ty, 30, dt);
  shift(w, p, p.vx * dt, p.vy * dt);

  if (t < activeEnd) return;
  if (p.flurry > 0) {
    // the three blows after a stomp follow one another without a press
    if (t < activeEnd + FIST.recovery[c] * CHAIN_AT) return;
    p.flurry--;
    if (p.flurry > 0 && quarry(w, p)) {
      startJab(w, p, Math.min(2, c + 1));
      return;
    }
    p.flurry = 0;
    p.chase = 0;
  }
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
  // Iron Stance at its last rank: the hand draws back faster
  p.charge = Math.min(HAYMAKER.full, p.charge + dt * p.mods.chargeHaste);
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
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy' || pr.kind !== 'orb') continue;
    if (pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, HAYMAKER.halfArc, HAYMAKER.reach, pr.radius)) returnOrb(w, pr, p, ax, ay, p.charge >= 1);
  }
  const e = inReach(w, p);
  if (!e) return false;
  const f = p.charge;
  // A full one counts as a Return: it uses the Rally, and adds to it.
  const full = f >= 1;
  let amount = HAYMAKER.damage + HAYMAKER.damagePerCharge * f;
  if (full) amount *= rallyMul(w, p.slot);
  // what cannot be thrown takes the whole of the blow
  if (full && e.def.anchored) amount *= HAYMAKER.anchored;
  // a full one is heavy enough to open a shield
  damageEnemy(w, e, amount, { kind: full ? 'return' : 'direct', by: p.slot, dx: ax, dy: ay, heavy: true, crit: full, freeze: full ? HITSTOP.perfect : HITSTOP.heavy, breaks: full });
  if (full) addRally(w, p.slot, RALLY.weight.perfect, e.x, e.y);
  if (!e.dead) pushBody(w, e, ax, ay, HAYMAKER.impulse + HAYMAKER.impulsePerCharge * f, p.slot);
  // Thunderclap: a full one bursts where it lands
  if (full && p.mods.thunderclap > 0) thunderclap(w, e.x, e.y, p.mods.thunderclap, p.slot, e.id);
  freezeBody(p, HITSTOP.heavy);
  return true;
}

function stepRelease(w: World, p: Player, move: Vec2, dt: number): void {
  const t = p.stateTime;
  // a jab asked for at any moment of the punch waits for the punch to land
  const chainAt = HAYMAKER.lungeTime + HAYMAKER.recovery * CHAIN_AT;
  if (p.bufAttack > 0 && t < chainAt) p.bufAttack = Math.max(p.bufAttack, chainAt - t + PLAYER.buffer);
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
    // The punch has landed: a jab asked for now cuts the rest of the recovery short.
    if (p.bufAttack > 0 && t >= chainAt) {
      p.charge = 0;
      startJab(w, p, 0);
      return;
    }
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
  p.stomped.length = 0;
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
      else pushBody(w, e, dx, dy, BREAK.impulse * p.mods.breakImpulse, p.slot);
      // an attack in the next moment goes after one of these
      p.stomped.push(e.id);
    }
    hits++;
  }
  p.stompT = p.stomped.length > 0 ? BREAK.follow : 0;
  // Break Shot: a good break is ready again sooner
  if (hits >= 3 && p.mods.breakRefund > 0) p.specialCd = Math.max(0, p.specialCd - p.mods.breakRefund);
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
    // an orb is heavy: the slam sends it home like any other blow; anything lighter is slapped away
    if (pr.kind === 'orb') returnOrb(w, pr, p, dx, dy, false);
    else slapShot(w, pr, p, dx, dy);
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
    // arrived at the Echo it flew to after a stomp: the three blows begin
    if (p.flurry > 0) {
      if (quarry(w, p)) {
        startJab(w, p, 0);
        return true;
      }
      p.flurry = 0;
      p.chase = 0;
    }
    // an attack right after a stomp goes after one of the Echoes it struck
    if (p.bufAttack > 0 && p.stompT > 0) {
      const e = stompTarget(w, p);
      if (e) {
        startChase(w, p, e);
        return true;
      }
    }
    // The button held through a dash: the hand came back on the way, and is part drawn already.
    if (p.chainT > 0 && holding(p)) {
      p.bufAttack = 0;
      p.chainT = 0;
      startCharge(p);
      p.charge = HAYMAKER.dashCharge;
      return true;
    }
    if (p.bufAttack > 0) {
      startJab(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
      return true;
    }
    // still holding: the hand draws back again
    if (holding(p)) {
      startCharge(p);
      return true;
    }
    return false;
  },

  step(w, p, move, dt) {
    // the flight after a stomp is the player step's business (player.ts): it begins next tick
    if (p.state === 'dash') return;
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
      // the slam has landed: an attack now does not wait for the Fist to straighten up
      if (p.actDone && p.bufAttack > 0 && p.stompT > 0) {
        const e = stompTarget(w, p);
        if (e) {
          startChase(w, p, e);
          return;
        }
      }
      walk(w, p, move, 0.3, dt);
      if (p.stateTime >= p.actDur) rest(p, move);
    }
  },

  cancel(p) {
    p.charge = 0;
    p.flurry = 0;
    p.chase = 0;
  },
};
