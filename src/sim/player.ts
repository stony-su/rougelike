// The Chainman: movement, dash, the Ranging Rod combo and the Plumb Shot.
import { pointInSector } from '../core/geom';
import { damp } from '../core/math';
import type { Vec2 } from '../core/math';
import { KNOCK_DECAY, damageEnemy, hitStop } from './combat';
import { beginDash, breakHostileNear, dashCrossing, hammerStake, nearestPlanted, pressStake } from './lines';
import { destroyProjectile, spawnProjectile } from './projectiles';
import { resolveCircle } from './room';
import { DASH, PLAYER, PLUMB, ROD } from './tuning';
import type { InputFrame, Player, World } from './types';

const tmp: Vec2 = { x: 0, y: 0 };

/** How far into a swing's recovery the next swing may begin. */
const CHAIN_AT = 0.45;

export function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    radius: PLAYER.radius,
    aim: -Math.PI / 2,
    aimX: x,
    aimY: y - 1,
    moveDirX: 0,
    moveDirY: -1,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    state: 'idle',
    stateTime: 0,
    dashCharges: DASH.charges,
    dashMaxCharges: DASH.charges,
    dashRecharge: 0,
    dashTimeLeft: 0,
    dashDirX: 0,
    dashDirY: -1,
    iframes: 0,
    hurtT: 9,
    stride: 0,
    combo: 0,
    comboTimer: 0,
    actAngle: 0,
    actDur: 0,
    actDone: false,
    plumbCooldown: 0,
    bufAttack: 0,
    bufSpecial: 0,
    bufDash: 0,
    bufStake: 0,
  };
}

/** Record fresh presses into the buffers. Called every tick, including during hit-stop. */
export function bufferInput(p: Player, inp: InputFrame): void {
  if (inp.attackPressed) p.bufAttack = PLAYER.buffer;
  if (inp.specialPressed) p.bufSpecial = PLAYER.buffer;
  if (inp.dashPressed) p.bufDash = PLAYER.buffer;
  if (inp.stakePressed) p.bufStake = PLAYER.stakeBuffer;
}

function setState(p: Player, s: Player['state']): void {
  if (p.state !== s) {
    p.state = s;
    p.stateTime = 0;
  }
}

function moveWithCollision(w: World, p: Player, dx: number, dy: number, substeps: number): void {
  for (let i = 0; i < substeps; i++) {
    tmp.x = p.x + dx / substeps;
    tmp.y = p.y + dy / substeps;
    resolveCircle(w.room, tmp, p.radius);
    p.x = tmp.x;
    p.y = tmp.y;
  }
}

function startDash(w: World, p: Player, inp: InputFrame): void {
  let dx = inp.moveX;
  let dy = inp.moveY;
  if (dx === 0 && dy === 0) {
    dx = Math.cos(p.aim);
    dy = Math.sin(p.aim);
  }
  const l = Math.hypot(dx, dy) || 1;
  p.dashDirX = dx / l;
  p.dashDirY = dy / l;
  p.dashTimeLeft = DASH.time;
  p.dashCharges -= 1;
  p.iframes = Math.max(p.iframes, DASH.iframes);
  p.bufDash = 0;
  p.kx = 0;
  p.ky = 0;
  p.state = 'dash';
  p.stateTime = 0;
  beginDash(w);
  w.events.push({ type: 'dash', x: p.x, y: p.y, dx: p.dashDirX, dy: p.dashDirY });
}

// ---------------------------------------------------------------- Ranging Rod

function startSwing(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'swing';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = ROD.windup[combo] + ROD.active[combo] + ROD.recovery[combo];
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  w.events.push({ type: 'swing', n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: ROD.reach[combo], halfArc: ROD.halfArc[combo] });
}

/** Resolve one swing's hit: every enemy in the arc, and any light projectile it sweeps. */
function resolveSwing(w: World, p: Player): void {
  const c = p.combo;
  const reach = ROD.reach[c];
  const half = ROD.halfArc[c];
  const dx = Math.cos(p.actAngle);
  const dy = Math.sin(p.actAngle);
  let hits = 0;
  // Iterate over a snapshot: a kill mutates nothing here, but effects triggered by hits may add enemies later.
  const targets = w.enemies.slice();
  for (const e of targets) {
    if (e.dead || e.state === 'spawn') continue;
    if (!pointInSector(e.x, e.y, p.x, p.y, p.actAngle, half, reach, e.radius)) continue;
    // Push away from the player rather than along the aim, so a wide swing fans a crowd outward.
    let kx = e.x - p.x;
    let ky = e.y - p.y;
    const kd = Math.hypot(kx, ky);
    if (kd > 1e-6) {
      kx = (kx / kd) * 0.6 + dx * 0.4;
      ky = (ky / kd) * 0.6 + dy * 0.4;
    } else {
      kx = dx;
      ky = dy;
    }
    const kl = Math.hypot(kx, ky) || 1;
    // Surveyed land favours the surveyor: more damage to anything in the Plot or on a line.
    const surveyed = e.inPlot || e.onLine;
    const amount = ROD.damage[c] * (surveyed ? 1 + ROD.surveyedBonus : 1) * (1 + (e.status.markT > 0 ? e.status.markBonus : 0));
    damageEnemy(w, e, amount, { kind: 'rod', dx: kx / kl, dy: ky / kl, knock: ROD.knockback[c], heavy: c === 2, crit: surveyed });
    hits++;
  }
  // The third swing hammers any of your stakes in its arc: their lines turn ripe.
  if (c === 2) {
    for (const st of w.lines.stakes) {
      if (st.state !== 'planted') continue;
      if (pointInSector(st.x, st.y, p.x, p.y, p.actAngle, half, ROD.hammerReach, 0.3)) hammerStake(w, st.id);
    }
  }
  // Any swing knocks out hostile stakes it reaches.
  for (const g of w.lines.hostile) {
    if (g.kind !== 'claim') continue;
    for (const hs of g.stakes.slice()) {
      if (pointInSector(hs.x, hs.y, p.x, p.y, p.actAngle, half, reach, 0.25)) breakHostileNear(w, hs.x, hs.y, 0.05);
    }
  }
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy' || !pr.light) continue;
    if (pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, half, reach, pr.radius)) {
      destroyProjectile(w, pr);
      w.events.push({ type: 'deflect', x: pr.x, y: pr.y });
    }
  }
  if (hits > 0) hitStop(w, ROD.hitstop[c]);
}

function stepSwing(w: World, p: Player, inp: InputFrame, dt: number): void {
  const c = p.combo;
  const t = p.stateTime;
  const hitAt = ROD.windup[c];
  const activeEnd = hitAt + ROD.active[c];

  if (!p.actDone && t >= hitAt) {
    p.actDone = true;
    resolveSwing(w, p);
  }

  // A small committed step into the swing, plus a little steering.
  const stepSpeed = t < activeEnd ? ROD.step[c] / activeEnd : 0;
  const tx = Math.cos(p.actAngle) * stepSpeed + inp.moveX * PLAYER.speed * ROD.moveMul;
  const ty = Math.sin(p.actAngle) * stepSpeed + inp.moveY * PLAYER.speed * ROD.moveMul;
  p.vx = damp(p.vx, tx, 30, dt);
  p.vy = damp(p.vy, ty, 30, dt);
  moveWithCollision(w, p, p.vx * dt, p.vy * dt, 1);

  // Chain into the next swing partway through recovery. The third swing must finish.
  if (c < 2 && p.bufAttack > 0 && t >= activeEnd + ROD.recovery[c] * CHAIN_AT) {
    startSwing(w, p, c + 1);
    return;
  }
  if (t >= p.actDur) {
    p.comboTimer = c < 2 ? ROD.comboWindow : 0;
    setState(p, inp.moveX !== 0 || inp.moveY !== 0 ? 'run' : 'idle');
  }
}

// ---------------------------------------------------------------- Plumb Shot

function startShot(w: World, p: Player): void {
  p.state = 'shot';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = PLUMB.castTime + PLUMB.recovery;
  p.actDone = false;
  p.bufSpecial = 0;
  p.plumbCooldown = PLUMB.cooldown;
  p.comboTimer = 0;
  w.events.push({ type: 'plumbFire', x: p.x, y: p.y, angle: p.actAngle });
}

function stepShot(w: World, p: Player, inp: InputFrame, dt: number): void {
  if (!p.actDone && p.stateTime >= PLUMB.castTime) {
    p.actDone = true;
    const dx = Math.cos(p.actAngle);
    const dy = Math.sin(p.actAngle);
    // Cast at one of your own stakes (cursor close to it) to yank that stake home.
    const target = nearestPlanted(w.lines, p.aimX, p.aimY, PLUMB.stakeCursorRadius);
    spawnProjectile(w, {
      kind: 'plumb',
      faction: 'player',
      x: p.x + dx * 0.4,
      y: p.y + dy * 0.4,
      vx: dx * PLUMB.speed,
      vy: dy * PLUMB.speed,
      radius: PLUMB.radius,
      damage: PLUMB.damage,
      range: target ? Math.max(PLUMB.range, Math.hypot(target.x - p.x, target.y - p.y) + 0.5) : PLUMB.range,
      targetStake: target ? target.id : -1,
    });
  }
  p.vx = damp(p.vx, inp.moveX * PLAYER.speed * 0.45, 30, dt);
  p.vy = damp(p.vy, inp.moveY * PLAYER.speed * 0.45, 30, dt);
  moveWithCollision(w, p, p.vx * dt, p.vy * dt, 1);
  if (p.stateTime >= p.actDur) setState(p, inp.moveX !== 0 || inp.moveY !== 0 ? 'run' : 'idle');
}

// ---------------------------------------------------------------- step

export function stepPlayer(w: World, inp: InputFrame, dt: number): void {
  const p = w.player;
  p.px = p.x;
  p.py = p.y;
  p.stateTime += dt;
  p.hurtT += dt;
  if (p.state === 'dead') return;

  // timers
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.bufAttack > 0) p.bufAttack -= dt;
  if (p.bufSpecial > 0) p.bufSpecial -= dt;
  if (p.bufDash > 0) p.bufDash -= dt;
  if (p.bufStake > 0) p.bufStake -= dt;
  if (p.comboTimer > 0) p.comboTimer -= dt;
  if (p.plumbCooldown > 0) p.plumbCooldown = Math.max(0, p.plumbCooldown - dt);
  if (p.dashCharges < p.dashMaxCharges) {
    p.dashRecharge += dt;
    if (p.dashRecharge >= DASH.recharge) {
      p.dashRecharge = 0;
      p.dashCharges += 1;
      w.events.push({ type: 'dashCharge', charges: p.dashCharges });
    }
  } else {
    p.dashRecharge = 0;
  }

  // aim
  p.aimX = inp.aimX;
  p.aimY = inp.aimY;
  const ax = inp.aimX - p.x;
  const ay = inp.aimY - p.y;
  if (ax * ax + ay * ay > 0.01) p.aim = Math.atan2(ay, ax);

  // The stake key works in every state: mid-swing, mid-dash, mid-anything.
  if (p.bufStake > 0) {
    const r = pressStake(w);
    if (r === 'wait') {
      // A stake is in flight or the whip lock is running: hold this one press until it can act.
      p.bufStake = Math.max(p.bufStake, dt * 2);
    } else {
      p.bufStake = 0;
      if (r === 'refused') w.events.push({ type: 'refused', what: 'stake' });
    }
  }
  if (inp.moveX !== 0 || inp.moveY !== 0) {
    p.moveDirX = inp.moveX;
    p.moveDirY = inp.moveY;
  }

  // Knockback rides on top of whatever the player is doing, except a dash.
  if (p.state !== 'dash' && (p.kx !== 0 || p.ky !== 0)) {
    moveWithCollision(w, p, p.kx * dt, p.ky * dt, 1);
    const k = Math.exp(-KNOCK_DECAY * dt);
    p.kx *= k;
    p.ky *= k;
    if (Math.abs(p.kx) < 0.02) p.kx = 0;
    if (Math.abs(p.ky) < 0.02) p.ky = 0;
  }

  if (p.state === 'dash') {
    const speed = DASH.distance / DASH.time;
    const step = Math.min(dt, p.dashTimeLeft);
    const fromX = p.x;
    const fromY = p.y;
    moveWithCollision(w, p, p.dashDirX * speed * step, p.dashDirY * speed * step, 3);
    dashCrossing(w, fromX, fromY, p.x, p.y);
    p.dashTimeLeft -= dt;
    p.vx = p.dashDirX * speed;
    p.vy = p.dashDirY * speed;
    if (p.dashTimeLeft <= 0) {
      const keep = PLAYER.speed * DASH.exitSpeed;
      p.vx = p.dashDirX * keep;
      p.vy = p.dashDirY * keep;
      setState(p, inp.moveX !== 0 || inp.moveY !== 0 ? 'run' : 'idle');
      w.events.push({ type: 'dashEnd', x: p.x, y: p.y });
    }
    return;
  }

  // A dash cancels anything else, at any moment.
  if (p.bufDash > 0 && p.dashCharges > 0) {
    startDash(w, p, inp);
    return;
  }

  if (p.state === 'swing') {
    stepSwing(w, p, inp, dt);
    return;
  }
  if (p.state === 'shot') {
    stepShot(w, p, inp, dt);
    return;
  }

  if (p.bufAttack > 0) {
    startSwing(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
    return;
  }
  if (p.bufSpecial > 0) {
    if (p.plumbCooldown <= 0) {
      startShot(w, p);
      return;
    }
    p.bufSpecial = 0;
    w.events.push({ type: 'refused', what: 'plumb' });
  }

  // walking
  const moving = inp.moveX !== 0 || inp.moveY !== 0;
  const tx = inp.moveX * PLAYER.speed;
  const ty = inp.moveY * PLAYER.speed;
  const rate = moving ? PLAYER.accel : PLAYER.decel;
  p.vx = damp(p.vx, tx, rate, dt);
  p.vy = damp(p.vy, ty, rate, dt);
  if (!moving && p.vx * p.vx + p.vy * p.vy < 0.0004) {
    p.vx = 0;
    p.vy = 0;
  }
  const bx = p.x;
  const by = p.y;
  moveWithCollision(w, p, p.vx * dt, p.vy * dt, 1);
  p.stride += Math.hypot(p.x - bx, p.y - by);
  setState(p, moving ? 'run' : 'idle');
}
