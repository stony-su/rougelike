// The Chainman: movement and dash. Attacks are layered on in combat.ts.
import { damp } from '../core/math';
import type { Vec2 } from '../core/math';
import { resolveCircle } from './room';
import { DASH, PLAYER } from './tuning';
import type { InputFrame, Player, World } from './types';

const tmp: Vec2 = { x: 0, y: 0 };

export function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    aim: -Math.PI / 2,
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
    stride: 0,
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
  setState(p, 'dash');
  w.events.push({ type: 'dash', x: p.x, y: p.y, dx: p.dashDirX, dy: p.dashDirY });
}

export function stepPlayer(w: World, inp: InputFrame, dt: number): void {
  const p = w.player;
  p.px = p.x;
  p.py = p.y;
  p.stateTime += dt;
  if (p.state === 'dead') return;

  // timers
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.bufAttack > 0) p.bufAttack -= dt;
  if (p.bufSpecial > 0) p.bufSpecial -= dt;
  if (p.bufDash > 0) p.bufDash -= dt;
  if (p.bufStake > 0) p.bufStake -= dt;
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
  const ax = inp.aimX - p.x;
  const ay = inp.aimY - p.y;
  if (ax * ax + ay * ay > 0.01) p.aim = Math.atan2(ay, ax);
  if (inp.moveX !== 0 || inp.moveY !== 0) {
    p.moveDirX = inp.moveX;
    p.moveDirY = inp.moveY;
  }

  if (p.state === 'dash') {
    const speed = DASH.distance / DASH.time;
    const step = Math.min(dt, p.dashTimeLeft);
    moveWithCollision(w, p, p.dashDirX * speed * step, p.dashDirY * speed * step, 3);
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

  if (p.bufDash > 0 && p.dashCharges > 0) {
    startDash(w, p, inp);
    return;
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
