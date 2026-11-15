// The Sword, the Edge. A three-swing combo in which every swing sends back the shots in its arc,
// and bats away an Echo caught in its own attack. The special is the Riposte: a short guard that
// returns whatever lands in it.
import { PI, dcos, dhypot, dsin } from '../../core/dmath';
import { ddamp } from '../../core/exact';
import type { Vec2 } from '../../core/exact';
import { pointInSector } from '../../core/geom';
import { pushBody, relaunch } from '../bodies';
import { BOMB_TOUCH, batBomb } from '../bombs';
import { damageEnemy, freezeBody, hittable, outOfReach } from '../combat';
import { rest, shift, walk } from '../move';
import { fanOut, restrikeShot, returnShot, spawnProjectile } from '../projectiles';
import { addRally, rallyMul } from '../rally';
import { BOMB, DT, DUET, EDGE, HITSTOP, PLAYER, RALLY, REFLECT, RIPOSTE, SIM_HZ, SWORD } from '../tuning';
import type { Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

/** How far into the recovery of a swing the next swing may begin. */
const CHAIN_AT = 0.45;

/** How far the swing in hand reaches, and how wide it is to either side: a Ring Cut goes all the way round. */
const reachOf = (p: Player): number => (p.ringNow ? EDGE.ringReach : SWORD.reach[p.combo]);
const halfOf = (p: Player): number => (p.ringNow ? PI : SWORD.halfArc[p.combo] + p.mods.arc);

function startSwing(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  // Chorus: enough Rally has been gained, and this swing is a Ring Cut
  p.ringNow = p.ringReady && p.mods.chorusEvery > 0;
  p.ringReady = false;
  // Bladesong: the higher the Rally, the quicker the swing
  p.actHaste = 1 + p.mods.swingHaste * p.rally;
  p.actDur = (SWORD.windup[combo] + SWORD.active[combo] + SWORD.recovery[combo]) / p.actHaste;
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  w.events.push({ type: 'swing', player: p.slot, n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: reachOf(p), halfArc: halfOf(p) });
}

function startGuard(w: World, p: Player): void {
  p.state = 'guard';
  p.stateTime = 0;
  // The guard lasts longer by the delay between a press and its effect, so it is as fair in co-op as alone.
  p.guardT = RIPOSTE.guardTime + p.mods.riposteWindow + w.inputDelay * DT;
  p.guardHit = false;
  p.specialCd = RIPOSTE.cooldown;
  p.actAngle = p.aim;
  p.comboTimer = 0;
  w.events.push({ type: 'guard', player: p.slot, x: p.x, y: p.y });
}

/** The blow of a swing, once, as its active frames begin: every Echo in the arc. */
function resolveSwing(w: World, p: Player): void {
  const c = p.combo;
  const reach = reachOf(p);
  const half = halfOf(p);
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  // a Ring Cut has its own weight; Tempered Riposte doubles the swings that follow a landed Riposte
  const blow = (p.ringNow ? EDGE.ringDamage : SWORD.damage[c]) * (p.buffSwings > 0 ? 2 : 1);
  if (p.buffSwings > 0) p.buffSwings--;
  // Ringing Edge: the third swing throws a crescent, which is the Sword's own shot from the start
  if (c === 2 && p.mods.crescent > 0 && !p.ringNow) {
    const wave = spawnProjectile(w, {
      kind: 'crescent',
      faction: 'player',
      owner: p.slot,
      x: p.x,
      y: p.y,
      vx: ax * EDGE.crescentSpeed,
      vy: ay * EDGE.crescentSpeed,
      radius: EDGE.crescentRadius,
      damage: p.mods.crescent,
      range: EDGE.crescentRange,
      bounces: p.mods.crescentBounces,
      pierce: 99,
    });
    wave.struckAt = w.tick;
  }
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
      damageEnemy(w, e, blow * DUET.oopDamage * rallyMul(w, p.slot), { kind: 'return', by: p.slot, dx: ax, dy: ay, heavy: true, freeze: HITSTOP.heavy });
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
    damageEnemy(w, e, blow, { kind: 'direct', by: p.slot, dx: kx / kl, dy: ky / kl, heavy: c === 2 || batted, freeze: batted ? HITSTOP.heavy : SWORD.freeze[c] });
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
  const reach = reachOf(p);
  const half = halfOf(p);
  const perfectAt = REFLECT.perfectDist + REFLECT.perDelayTick * w.inputDelay;
  let perfect = false;
  for (const pr of w.projectiles) {
    if (pr.dead) continue;
    if (pr.faction === 'player' && pr.owner === p.slot) {
      // Tuning Fork: the Sword's own crescents and the shots it has sent back can be struck on again
      const own = pr.kind === 'crescent' || (pr.returned && pr.kind !== 'orb');
      if (!own || p.mods.refork <= 0 || w.tick - pr.struckAt <= EDGE.reforkGap * SIM_HZ) continue;
      if (pr.struck >= EDGE.reforkMost && p.mods.standingWave <= 0) continue;
      if (pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, half, reach, pr.radius)) restrikeShot(w, pr, p, p.aim);
      continue;
    }
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
    const sender = pr.owner;
    const turns = pr.kind !== 'orb' && p.mods.returnHoming > 0;
    returnShot(w, pr, p, p.aim, late, pr.kind === 'orb' || turns ? sender : 0);
    // Wide Guard: it comes round toward whoever sent it; Second Voice: it splits into a fan
    if (turns) pr.turn = p.mods.returnHoming;
    fanOut(w, pr, p);
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
  // a quicker swing (Bladesong) is the same swing in less time
  const hitAt = SWORD.windup[c] / p.actHaste;
  const activeEnd = hitAt + SWORD.active[c] / p.actHaste;

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
  if (c < 2 && p.bufAttack > 0 && t >= activeEnd + (SWORD.recovery[c] / p.actHaste) * CHAIN_AT) {
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
