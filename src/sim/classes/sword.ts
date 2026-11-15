// The Sword, the Edge. A three-swing combo in which every swing sends back the shots in its arc,
// and bats away an Echo caught in its own attack. The special is the Whirlwind: one turn of the
// blade that cuts and throws back everything round the Sword, knocks shields open, and sends
// every shot in the circle home to whoever fired it, with nothing able to hurt the Sword meanwhile.
import { PI, datan2, dcos, dhypot, dsin } from '../../core/dmath';
import { ddamp } from '../../core/exact';
import type { Vec2 } from '../../core/exact';
import { pointInSector } from '../../core/geom';
import { pushBody, relaunch } from '../bodies';
import { BOMB_TOUCH, batBomb } from '../bombs';
import { damageEnemy, freezeBody, hittable, outOfReach, stunEnemy } from '../combat';
import { applyMark } from '../conditions';
import { rest, shift, walk } from '../move';
import { fanOut, restrikeShot, returnOrb, returnShot, spawnProjectile } from '../projectiles';
import { addRally, rallyMul } from '../rally';
import { BOMB, DASH, DUET, EDGE, HITSTOP, PLAYER, RALLY, REFLECT, SIM_HZ, SWORD, WHIRL } from '../tuning';
import type { Enemy, Player, World } from '../types';
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
  // out of a dash: the dash runs on into the cut
  p.dashIn = p.chainT > 0;
  p.chainT = 0;
  // Chorus: enough Rally has been gained, and this swing is a Ring Cut
  p.ringNow = p.ringReady && p.mods.chorusEvery > 0;
  p.ringReady = false;
  // Bladesong: the higher the Rally, the quicker the swing
  p.actHaste = 1 + p.mods.swingHaste * p.rally;
  p.actDur = (SWORD.windup[combo] + SWORD.active[combo] + SWORD.recovery[combo]) / p.actHaste;
  // half the wind-up is already behind it
  if (p.dashIn) p.stateTime = (SWORD.windup[combo] / p.actHaste) * 0.5;
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  w.events.push({ type: 'swing', player: p.slot, n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: reachOf(p), halfArc: halfOf(p) });
}

/** How far the Whirlwind reaches on its first turn, and how many times the blade goes round (Second Spin: twice). */
const whirlReach = (p: Player): number => WHIRL.radius + p.mods.whirlReach;
const whirlTurns = (p: Player): number => (p.mods.secondSpin > 0 ? 2 : 1);
/** The reach of turn `n` (0 is the first): the second goes wider, to catch what the first threw. */
const turnReach = (p: Player, n: number): number => whirlReach(p) * (n > 0 ? WHIRL.second : 1);

function startWhirl(p: Player): void {
  const turns = whirlTurns(p);
  p.state = 'special';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = WHIRL.windup + WHIRL.spin * turns + WHIRL.recovery;
  p.whirlN = 0;
  p.whirled = 0;
  p.specialCd = WHIRL.cooldown;
  p.comboTimer = 0;
  p.dashIn = false;
  p.chainT = 0;
  // nothing reaches the Sword while the blade is going round
  p.iframes = Math.max(p.iframes, WHIRL.windup + WHIRL.spin * turns);
}

/**
 * Alley-oop: a body already in flight is sent on along a unit direction, faster, and hurt more for
 * it. That is a Return, and if someone else launched it, a Duet: it counts for them too.
 */
function sendOn(w: World, p: Player, e: Enemy, dx: number, dy: number, blow: number): void {
  damageEnemy(w, e, blow * DUET.oopDamage * rallyMul(w, p.slot), { kind: 'return', by: p.slot, dx, dy, heavy: true, freeze: HITSTOP.heavy });
  addRally(w, p.slot, RALLY.weight.sent, e.x, e.y);
  if (e.dead) return;
  const first = relaunch(w, e, dx, dy, DUET.oopSwordSpeed, p.slot);
  if (first < 0) return;
  addRally(w, first, RALLY.weight.sent, e.x, e.y);
  w.events.push({ type: 'duet', kind: 'alleyoop', a: first, b: p.slot, x: e.x, y: e.y });
}

/** Count what the Whirlwind in hand has cut or sent back, and pay what the Sword's Tunings give for it. */
function tally(w: World, p: Player, n: number): void {
  if (n <= 0) return;
  const before = p.whirled;
  p.whirled += n;
  const m = p.mods;
  // Tempered Spin: the swings that follow a Whirlwind that met anything are doubled
  if (before === 0 && m.whirlBuff > 0) p.buffSwings = m.whirlBuff;
  // Encore: enough at once and it is ready again, with a dash charge and a little health
  if (m.encoreRefund <= 0 || before >= WHIRL.encoreAt || p.whirled < WHIRL.encoreAt) return;
  p.specialCd *= 1 - m.encoreRefund;
  if (p.specialCd <= 0) {
    p.specialCd = 0;
    w.events.push({ type: 'specialReady', player: p.slot });
  }
  if (m.encoreDash > 0) p.dashCharges = Math.min(p.dashMaxCharges, p.dashCharges + m.encoreDash);
  if (m.encoreHeal > 0 && p.hp < p.maxHp) {
    const was = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + m.encoreHeal);
    w.events.push({ type: 'heal', player: p.slot, amount: p.hp - was, x: p.x, y: p.y });
  }
}

/** The blow of one turn of the Whirlwind: every Echo in the circle is cut and thrown outward, and a shield in the way is knocked open. */
function resolveWhirl(w: World, p: Player): void {
  const reach = turnReach(p, p.whirlN);
  const m = p.mods;
  let hits = 0;
  // Iterate over a snapshot: effects triggered by hits may add enemies later.
  for (const e of w.enemies.slice()) {
    if (!hittable(e) || outOfReach(e)) continue;
    let dx = e.x - p.x;
    let dy = e.y - p.y;
    const d = dhypot(dx, dy);
    if (d > reach + e.radius) continue;
    if (d > 1e-6) {
      dx /= d;
      dy /= d;
    } else {
      dx = dcos(p.actAngle);
      dy = dsin(p.actAngle);
    }
    hits++;
    if (e.state === 'launched') {
      sendOn(w, p, e, dx, dy, WHIRL.damage);
      continue;
    }
    // heavy enough to open a shield and land anyway
    damageEnemy(w, e, WHIRL.damage, { kind: 'direct', by: p.slot, dx, dy, heavy: true, freeze: HITSTOP.heavy, breaks: true });
    if (e.dead) continue;
    const flying = pushBody(w, e, dx, dy, WHIRL.impulse, p.slot);
    if (m.counterStun > 0) {
      // Counterweight: it is dazed where it comes down (or where it stands, if it was too heavy to throw), and marked for everyone
      if (flying) e.slamStun = Math.max(e.slamStun, m.counterStun);
      else stunEnemy(w, e, m.counterStun);
      applyMark(e, m.counterMark, EDGE.markTime);
    }
  }
  w.events.push({ type: 'whirl', player: p.slot, x: p.x, y: p.y, radius: reach, n: p.whirlN });
  if (hits > 0) freezeBody(p, HITSTOP.heavy);
  tally(w, p, hits);
}

/** Every tick the blade is going round: enemy shots in the circle go back at whoever fired them, and bombs on the floor are batted back. */
function whirlSweep(w: World, p: Player): void {
  const reach = turnReach(p, p.whirlN - 1);
  let turned = 0;
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy') continue;
    const dx = pr.x - p.x;
    const dy = pr.y - p.y;
    const r = reach + pr.radius;
    if (dx * dx + dy * dy > r * r) continue;
    // whoever fired it, if they are still there to be struck; with nobody to go back to, it goes back the way it came
    let sender: Enemy | null = null;
    for (const e of w.enemies) if (e.id === pr.owner && hittable(e)) sender = e;
    let ax = sender ? sender.x - pr.x : -pr.vx;
    let ay = sender ? sender.y - pr.y : -pr.vy;
    if (ax === 0 && ay === 0) {
      ax = dx;
      ay = dy;
    }
    turned++;
    if (pr.kind === 'orb') {
      // an orb is heavy, and flies home by itself
      returnOrb(w, pr, p, ax, ay, false);
      continue;
    }
    returnShot(w, pr, p, datan2(ay, ax), false, sender ? sender.id : 0);
    // it comes round on its sender wherever they go; Second Voice: it splits into a fan first
    if (sender) pr.turn = Math.max(WHIRL.turn, p.mods.returnHoming);
    fanOut(w, pr, p);
  }
  for (const b of w.bombs) {
    if (b.dead || b.state !== 'fuse') continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const r = reach + BOMB_TOUCH;
    if (dx * dx + dy * dy > r * r) continue;
    let thrower: Enemy | null = null;
    for (const e of w.enemies) if (e.id === b.owner && hittable(e)) thrower = e;
    let ax = thrower ? thrower.x - b.x : dx;
    let ay = thrower ? thrower.y - b.y : dy;
    const al = dhypot(ax, ay);
    if (al > 1e-6) {
      ax /= al;
      ay /= al;
    } else {
      ax = dcos(p.actAngle);
      ay = dsin(p.actAngle);
    }
    batBomb(w, b, p.slot, ax, ay, BOMB.swordSpeed);
    turned++;
  }
  tally(w, p, turned);
}

function stepWhirl(w: World, p: Player, move: Vec2, dt: number): void {
  const turns = whirlTurns(p);
  const t = p.stateTime;
  const spinEnd = WHIRL.windup + WHIRL.spin * turns;
  // each turn lands its blow as it begins
  if (p.whirlN < turns && t >= WHIRL.windup + WHIRL.spin * p.whirlN) {
    resolveWhirl(w, p);
    p.whirlN++;
  }
  if (p.whirlN > 0 && t < spinEnd) whirlSweep(w, p);
  walk(w, p, move, WHIRL.moveMul, dt);
  if (t < spinEnd) return;
  // the blade has come round: a cut asked for meanwhile follows without waiting for the Sword to straighten up
  if (p.bufAttack > 0) {
    startSwing(w, p, 0);
    return;
  }
  if (t >= p.actDur) rest(p, move);
}

/** The blow of a swing, once, as its active frames begin: every Echo in the arc. */
function resolveSwing(w: World, p: Player): void {
  const c = p.combo;
  const reach = reachOf(p);
  const half = halfOf(p);
  const ax = dcos(p.actAngle);
  const ay = dsin(p.actAngle);
  // a Ring Cut has its own weight; Tempered Spin doubles the swings that follow a Whirlwind that met anything
  const blow = (p.ringNow ? EDGE.ringDamage : SWORD.damage[c]) * (p.buffSwings > 0 ? 2 : 1) * (p.dashIn ? DASH.strike : 1);
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
      // a body already in flight goes on along the aim
      sendOn(w, p, e, ax, ay, blow);
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
  const stepSpeed = t < activeEnd ? (SWORD.step[c] * (p.dashIn ? DASH.lunge : 1)) / activeEnd : 0;
  const tx = dcos(p.actAngle) * stepSpeed + move.x * PLAYER.speed * SWORD.moveMul;
  const ty = dsin(p.actAngle) * stepSpeed + move.y * PLAYER.speed * SWORD.moveMul;
  p.vx = ddamp(p.vx, tx, 30, dt);
  p.vy = ddamp(p.vy, ty, 30, dt);
  shift(w, p, p.vx * dt, p.vy * dt);

  if (t < activeEnd) return;
  // Once the blade has passed, the Whirlwind may cut the recovery short.
  if (wantsSpecial(w, p)) {
    startWhirl(p);
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
      startWhirl(p);
      return true;
    }
    if (p.bufAttack > 0) {
      startSwing(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
      return true;
    }
    return false;
  },

  step(w, p, move, dt) {
    if (p.state === 'attack') stepSwing(w, p, move, dt);
    else stepWhirl(w, p, move, dt);
  },

  // the Sword holds nothing between ticks that a dash would have to drop
  cancel() {},
};
