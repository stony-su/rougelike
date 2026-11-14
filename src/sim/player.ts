// A player: movement, dash and the three-swing combo. Class kits build on this.
import { PI, dcos, dexp, dhypot, dsin } from '../core/dmath';
import { ddamp } from '../core/exact';
import type { Vec2 } from '../core/exact';
import { pointInSector } from '../core/geom';
import { damageEnemy, freezeBody } from './combat';
import { aimAngleOf, aimDistOf, moveInto } from './input';
import { destroyProjectile } from './projectiles';
import { resolveCircle } from './room';
import { DASH, KNOCK_DECAY, PLAYER, SWORD } from './tuning';
import { PRESS, PRESS_COUNT } from './types';
import type { InputFrame, Player, World } from './types';

/** How far into a swing's recovery the next swing may begin. */
const CHAIN_AT = 0.45;

export function createPlayer(slot: number, classId: string, x: number, y: number): Player {
  return {
    slot,
    classId,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    radius: PLAYER.radius,
    aim: -PI / 2,
    aimDist: 1,
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
    bufAttack: 0,
    bufSpecial: 0,
    bufDash: 0,
    bufInteract: 0,
    lastPresses: [-1, -1, -1, -1],
    freeze: 0,
    chimes: 0,
  };
}

/**
 * Turn changed press counters into buffered presses. Called every tick, including while the
 * player or the chamber is frozen, so a tap made during hit-stop still counts.
 */
export function readPresses(p: Player, inp: InputFrame): void {
  for (let i = 0; i < PRESS_COUNT; i++) {
    if (inp.presses[i] === p.lastPresses[i]) continue;
    // A character who has just walked in has seen no input yet: whatever the counters hold is old news.
    const first = p.lastPresses[i] < 0;
    p.lastPresses[i] = inp.presses[i];
    if (first) continue;
    if (i === PRESS.attack) p.bufAttack = PLAYER.buffer;
    else if (i === PRESS.special) p.bufSpecial = PLAYER.buffer;
    else if (i === PRESS.dash) p.bufDash = PLAYER.buffer;
    else if (i === PRESS.interact) p.bufInteract = PLAYER.buffer;
  }
}

function setState(p: Player, s: Player['state']): void {
  if (p.state !== s) {
    p.state = s;
    p.stateTime = 0;
  }
}

function moveWithCollision(w: World, p: Player, dx: number, dy: number, substeps: number, tmp: Vec2): void {
  for (let i = 0; i < substeps; i++) {
    tmp.x = p.x + dx / substeps;
    tmp.y = p.y + dy / substeps;
    resolveCircle(w.room, tmp, p.radius);
    p.x = tmp.x;
    p.y = tmp.y;
  }
}

function startDash(w: World, p: Player, move: Vec2): void {
  let dx = move.x;
  let dy = move.y;
  if (dx === 0 && dy === 0) {
    dx = dcos(p.aim);
    dy = dsin(p.aim);
  }
  const l = dhypot(dx, dy) || 1;
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
  w.events.push({ type: 'dash', player: p.slot, x: p.x, y: p.y, dx: p.dashDirX, dy: p.dashDirY });
}

// ---------------------------------------------------------------- the swing combo

function startSwing(w: World, p: Player, combo: number): void {
  p.combo = combo;
  p.state = 'swing';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = SWORD.windup[combo] + SWORD.active[combo] + SWORD.recovery[combo];
  p.actDone = false;
  p.bufAttack = 0;
  p.comboTimer = 0;
  w.events.push({ type: 'swing', player: p.slot, n: combo, x: p.x, y: p.y, angle: p.actAngle, reach: SWORD.reach[combo], halfArc: SWORD.halfArc[combo] });
}

/** Resolve one swing's hit: every enemy in the arc, and any light projectile it sweeps. */
function resolveSwing(w: World, p: Player): void {
  const c = p.combo;
  const reach = SWORD.reach[c];
  const half = SWORD.halfArc[c];
  const dx = dcos(p.actAngle);
  const dy = dsin(p.actAngle);
  let hits = 0;
  // Iterate over a snapshot: effects triggered by hits may add enemies later.
  const targets = w.enemies.slice();
  for (const e of targets) {
    if (e.dead || e.state === 'spawn' || e.airborne) continue;
    if (!pointInSector(e.x, e.y, p.x, p.y, p.actAngle, half, reach, e.radius)) continue;
    // Push away from the player rather than along the aim, so a wide swing fans a crowd outward.
    let kx = e.x - p.x;
    let ky = e.y - p.y;
    const kd = dhypot(kx, ky);
    if (kd > 1e-6) {
      kx = (kx / kd) * 0.6 + dx * 0.4;
      ky = (ky / kd) * 0.6 + dy * 0.4;
    } else {
      kx = dx;
      ky = dy;
    }
    const kl = dhypot(kx, ky) || 1;
    damageEnemy(w, e, SWORD.damage[c], { kind: 'direct', by: p.slot, dx: kx / kl, dy: ky / kl, knock: SWORD.knockback[c], heavy: c === 2, freeze: SWORD.freeze[c] });
    hits++;
  }
  for (const pr of w.projectiles) {
    if (pr.dead || pr.faction !== 'enemy' || !pr.light) continue;
    if (pointInSector(pr.x, pr.y, p.x, p.y, p.actAngle, half, reach, pr.radius)) {
      destroyProjectile(w, pr);
      w.events.push({ type: 'deflect', player: p.slot, x: pr.x, y: pr.y });
    }
  }
  if (hits > 0) freezeBody(p, SWORD.freeze[c]);
}

function stepSwing(w: World, p: Player, move: Vec2, dt: number, tmp: Vec2): void {
  const c = p.combo;
  const t = p.stateTime;
  const hitAt = SWORD.windup[c];
  const activeEnd = hitAt + SWORD.active[c];

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
  moveWithCollision(w, p, p.vx * dt, p.vy * dt, 1, tmp);

  // Chain into the next swing partway through recovery. The third swing must finish.
  if (c < 2 && p.bufAttack > 0 && t >= activeEnd + SWORD.recovery[c] * CHAIN_AT) {
    startSwing(w, p, c + 1);
    return;
  }
  if (t >= p.actDur) {
    p.comboTimer = c < 2 ? SWORD.comboWindow : 0;
    setState(p, move.x !== 0 || move.y !== 0 ? 'run' : 'idle');
  }
}

// ---------------------------------------------------------------- step

export function stepPlayer(w: World, p: Player, inp: InputFrame, dt: number): void {
  p.px = p.x;
  p.py = p.y;
  readPresses(p, inp);
  // Per-body hit-stop: this player's own timeline waits; presses made meanwhile were just buffered.
  if (p.freeze > 0) {
    p.freeze--;
    return;
  }
  p.stateTime += dt;
  p.hurtT += dt;
  if (p.state === 'down') return;

  const move: Vec2 = { x: 0, y: 0 };
  const tmp: Vec2 = { x: 0, y: 0 };
  moveInto(inp, move);
  const moving = move.x !== 0 || move.y !== 0;

  // timers
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.bufAttack > 0) p.bufAttack -= dt;
  if (p.bufSpecial > 0) p.bufSpecial -= dt;
  if (p.bufDash > 0) p.bufDash -= dt;
  if (p.bufInteract > 0) p.bufInteract -= dt;
  if (p.comboTimer > 0) p.comboTimer -= dt;
  if (p.dashCharges < p.dashMaxCharges) {
    p.dashRecharge += dt;
    if (p.dashRecharge >= DASH.recharge) {
      p.dashRecharge = 0;
      p.dashCharges += 1;
      w.events.push({ type: 'dashCharge', player: p.slot, charges: p.dashCharges });
    }
  } else {
    p.dashRecharge = 0;
  }

  // aim
  p.aim = aimAngleOf(inp);
  p.aimDist = aimDistOf(inp);
  if (moving) {
    const l = dhypot(move.x, move.y);
    p.moveDirX = move.x / l;
    p.moveDirY = move.y / l;
  }

  // Knockback rides on top of whatever the player is doing, except a dash.
  if (p.state !== 'dash' && (p.kx !== 0 || p.ky !== 0)) {
    moveWithCollision(w, p, p.kx * dt, p.ky * dt, 1, tmp);
    const k = dexp(-KNOCK_DECAY * dt);
    p.kx *= k;
    p.ky *= k;
    if (Math.abs(p.kx) < 0.02) p.kx = 0;
    if (Math.abs(p.ky) < 0.02) p.ky = 0;
  }

  if (p.state === 'dash') {
    const speed = DASH.distance / DASH.time;
    const step = Math.min(dt, p.dashTimeLeft);
    moveWithCollision(w, p, p.dashDirX * speed * step, p.dashDirY * speed * step, 3, tmp);
    p.dashTimeLeft -= dt;
    p.vx = p.dashDirX * speed;
    p.vy = p.dashDirY * speed;
    if (p.dashTimeLeft <= 0) {
      const keep = PLAYER.speed * DASH.exitSpeed;
      p.vx = p.dashDirX * keep;
      p.vy = p.dashDirY * keep;
      setState(p, moving ? 'run' : 'idle');
      w.events.push({ type: 'dashEnd', player: p.slot, x: p.x, y: p.y });
    }
    return;
  }

  // A dash cancels anything else, at any moment.
  if (p.bufDash > 0 && p.dashCharges > 0) {
    startDash(w, p, move);
    return;
  }

  if (p.state === 'swing') {
    stepSwing(w, p, move, dt, tmp);
    return;
  }

  if (p.bufAttack > 0) {
    startSwing(w, p, p.comboTimer > 0 && p.combo < 2 ? p.combo + 1 : 0);
    return;
  }

  // walking
  const tx = move.x * PLAYER.speed;
  const ty = move.y * PLAYER.speed;
  const rate = moving ? PLAYER.accel : PLAYER.decel;
  p.vx = ddamp(p.vx, tx, rate, dt);
  p.vy = ddamp(p.vy, ty, rate, dt);
  if (!moving && p.vx * p.vx + p.vy * p.vy < 0.0004) {
    p.vx = 0;
    p.vy = 0;
  }
  const bx = p.x;
  const by = p.y;
  moveWithCollision(w, p, p.vx * dt, p.vy * dt, 1, tmp);
  p.stride += dhypot(p.x - bx, p.y - by);
  setState(p, moving ? 'run' : 'idle');
}
