// The Sword, the Edge. A three-swing combo in which every swing sends back the shots in its arc,
// and bats away an Echo caught in its own attack. The special is the Riposte: a short guard that
// returns whatever lands in it.
import { dcos, dhypot, dsin } from '../../core/dmath';
import { ddamp } from '../../core/exact';
import type { Vec2 } from '../../core/exact';
import { pointInSector } from '../../core/geom';
import { pushBody, relaunch } from '../bodies';
import { BOMB_TOUCH, batBomb } from '../bombs';
import { damageEnemy, freezeBody, hittable, outOfReach } from '../combat';
import { rest, shift, walk } from '../move';
import { returnShot } from '../projectiles';
import { addRally, rallyMul } from '../rally';
import { BOMB, DT, DUET, HITSTOP, PLAYER, RALLY, REFLECT, RIPOSTE, SWORD } from '../tuning';
import type { Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

/** How far into the recovery of a swing the next swing may begin. */
const CHAIN_AT = 0.45;

function startSwing(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = SWORD.windup[combo] + SWORD.active[combo] + SWORD.recovery[combo];
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  w.events.push({ type: 'swing', player: p.slot, n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: SWORD.reach[combo], halfArc: SWORD.halfArc[combo] });
}

function startGuard(w: World, p: Player): void {
  p.state = 'guard';
  p.stateTime = 0;
  // The guard lasts longer by the delay between a press and its effect, so it is as fair in co-op as alone.
  p.guardT = RIPOSTE.guardTime + w.inputDelay * DT;
  p.guardHit = false;
  p.specialCd = RIPOSTE.cooldown;
  p.actAngle = p.aim;
  p.comboTimer = 0;
  w.events.push({ type: 'guard', player: p.slot, x: p.x, y: p.y });
}

/** The blow of a swing, once, as its active frames begin: every Echo in the arc. */
function resolveSwing(w: World, p: Player): void {
  const c = p.combo;
  const reach = SWORD.reach[c];
  const half = SWORD.halfArc[c];
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  let hits = 0;
  // Iterate over a snapshot: effects triggered by hits may add enemies later.
  for (const e of w.enemies.slice()) {
    if (!hittable(e) || outOfReach(e)) continue;
    if (!pointInSector(e.x, e.y, p.x, p.y, p.actAngle, half, reach, e.radius)) continue;
    // Push away from the player rather than along the aim, so a wide swing fans a crowd outward.
    let kx = e.x - p.x;
    let ky = e.y - p.y;
    const kd = dhypot(kx, ky);
    if (kd > 1e-6) {
      kx = (kx / kd) * 0.6 + ax * 0.4;
      ky = (ky / kd) * 0.6 + ay * 0.4;
    } else {
      kx = ax;
      ky = ay;
    }
    const kl = dhypot(kx, ky) || 1;
    if (e.state === 'launched') {
      // Alley-oop: a body already in flight is sent on along the aim, faster, and hurt more for it.
      // That is a Return, and if someone else launched it, a Duet: it counts for them too.
      damageEnemy(w, e, SWORD.damage[c] * DUET.oopDamage * rallyMul(w, p.slot), { kind: 'return', by: p.slot, dx: ax, dy: ay, heavy: true, freeze: HITSTOP.heavy });
      addRally(w, p.slot, RALLY.weight.sent, e.x, e.y);
      if (!e.dead) {
        const first = relaunch(w, e, ax, ay, DUET.oopSwordSpeed, p.slot);
        if (first >= 0) {
          addRally(w, first, RALLY.weight.sent, e.x, e.y);
          w.events.push({ type: 'duet', kind: 'alleyoop', a: first, b: p.slot, x: e.x, y: e.y });
        }
      }
      hits++;
      continue;
    }
    // Caught in its own attack, an Echo is batted away exactly where the swing was aimed.
    const batted = e.state === 'attack';
    damageEnemy(w, e, SWORD.damage[c], { kind: 'direct', by: p.slot, dx: kx / kl, dy: ky / kl, heavy: c === 2 || batted, freeze: batted ? HITSTOP.heavy : SWORD.freeze[c] });
    if (!e.dead) {
      if (batted) pushBody(w, e, ax, ay, REFLECT.batImpulse, p.slot);
      else pushBody(w, e, kx / kl, ky / kl, SWORD.impulse[c], p.slot);
    }
    hits++;
  }
  if (hits > 0) freezeBody(p, SWORD.freeze[c]);
}

/** Every tick of the active frames: shots in the arc are sent back, and bombs on the floor are batted. */
function sweep(w: World, p: Player): void {
  const c = p.combo;
  const reach = SWORD.reach[c];
  const half = SWORD.halfArc[c];
  const perfectAt = REFLECT.perfectDist + REFLECT.perDelayTick * w.inputDelay;
  let perfect = false;
  for (const pr of w.projectiles) {
    if (pr.dead) continue;
    if (pr.faction === 'player') {
      // Bank off the blade: an ally's arrow through the swing goes where the blade points, harder.
      if (pr.kind !== 'arrow' || pr.owner === p.slot || pr.assist >= 0) continue;
      if (!pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, half, reach, pr.radius)) continue;
      const sp = dhypot(pr.vx, pr.vy);
      pr.vx = dcos(p.aim) * sp;
      pr.vy = dsin(p.aim) * sp;
      pr.damage *= DUET.bankDamage;
      pr.bounces += DUET.bankBounces;
      pr.pierce += DUET.bankPierce;
      pr.assist = p.slot;
      pr.homing = 0;
      pr.hits.length = 0;
      w.events.push({ type: 'duet', kind: 'bank', a: p.slot, b: pr.owner, x: pr.x, y: pr.y });
      continue;
    }
    if (!pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, half, reach, pr.radius)) continue;
    // Left to the last moment, the return is a perfect one.
    const late = dhypot(pr.x - p.x, pr.y - p.y) <= perfectAt;
    // an orb flies home to whoever served it; anything else flies where the player aims
    returnShot(w, pr, p, p.aim, late, pr.kind === 'orb' ? pr.owner : 0);
    if (late) perfect = true;
  }
  if (perfect) {
    freezeBody(p, HITSTOP.heavy);
    // nothing else gets through while the blade rings
    p.iframes = Math.max(p.iframes, 0.15);
  }
  for (const b of w.bombs) {
    if (b.dead || b.state !== 'fuse') continue;
    if (pointInSector(b.x, b.y, p.x, p.y, p.actAngle, half, reach, BOMB_TOUCH)) batBomb(w, b, p.slot, dcos(p.aim), dsin(p.aim), BOMB.swordSpeed);
  }
}

function stepSwing(w: World, p: Player, move: Vec2, dt: number): void {
  const c = p.combo;
  const t = p.stateTime;
  const hitAt = SWORD.windup[c];
  const activeEnd = hitAt + SWORD.active[c];

  if (t >= hitAt && (t < activeEnd || !p.actDone)) sweep(w, p);
  if (!p.actDone && t >= hitAt) {
    p.actDone = true;
    resolveSwing(w, p);
  }

  // A small committed step into the swing, plus a little steering.
  const stepSpeed = t < activeEnd ? SWORD.step[c] / activeEnd : 0;
  const tx = dcos(p.actAngle) * stepSpeed + move.x * PLAYER.speed * SWORD.moveMul;
  const ty = dsin(p.actAngle) * stepSpeed + move.y * PLAYER.speed * SWORD.moveMul;
  p.vx = ddamp(p.vx, tx, 30, dt);
  p.vy = ddamp(p.vy, ty, 30, dt);
  shift(w, p, p.vx * dt, p.vy * dt);

  if (t < activeEnd) return;
  // Once the blade has passed, a Riposte may cut the recovery short.
  if (wantsSpecial(w, p)) {
    startGuard(w, p);
    return;
  }
  // Chain into the next swing partway through recovery. The third swing must finish.
  if (c < 2 && p.bufAttack > 0 && t >= activeEnd + SWORD.recovery[c] * CHAIN_AT) {
    startSwing(w, p, c + 1);
    return;
  }
  if (t >= p.actDur) {
    p.comboTimer = c < 2 ? SWORD.comboWindow : 0;
    rest(p, move);
  }
}

export const SWORD_KIT: Kit = {
  begin(w, p) {
    if (wantsSpecial(w, p)) {
      startGuard(w, p);
      return true;
    }
    if (p.bufAttack > 0) {
      startSwing(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
      return true;
    }
    return false;
  },

  step(w, p, move, dt) {
    if (p.state === 'attack') {
      stepSwing(w, p, move, dt);
    } else if (p.state === 'guard') {
      p.guardT -= dt;
      walk(w, p, move, RIPOSTE.moveMul, dt);
      if (p.guardT > 0) return;
      p.guardT = 0;
      if (p.guardHit) {
        rest(p, move);
      } else {
        // nothing came: a moment of being open
        p.state = 'special';
        p.stateTime = 0;
        p.actDur = RIPOSTE.whiff;
      }
    } else {
      walk(w, p, move, RIPOSTE.moveMul, dt);
      if (p.stateTime >= p.actDur) rest(p, move);
    }
  },

  cancel(p) {
    p.guardT = 0;
  },
};
