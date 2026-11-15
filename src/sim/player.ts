// A player: reading input, moving, dashing, being knocked about. What the attack and special
// buttons do belongs to the class kits in ./classes.
import { PI, dcos, dexp, dhypot, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { BOW_KIT } from './classes/bow';
import { FIST_KIT } from './classes/fist';
import type { Kit } from './classes/kit';
import { SWORD_KIT } from './classes/sword';
import { aimAngleOf, aimDistOf, moveInto } from './input';
import { rest, shift, walk } from './move';
import { stepRally } from './rally';
import { DASH, KNOCK_DECAY, PLAYER, REVIVE } from './tuning';
import { PRESS, PRESS_COUNT } from './types';
import type { ClassId, InputFrame, Player, World } from './types';

const KITS: Readonly<Record<ClassId, Kit>> = { sword: SWORD_KIT, bow: BOW_KIT, fist: FIST_KIT };

export function createPlayer(slot: number, classId: ClassId, x: number, y: number): Player {
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
    held: 0,
    freeze: 0,
    chimes: 0,
    specialCd: 0,
    rally: 0,
    rallyT: 0,
    charge: 0,
    fireT: 0,
    guardT: 0,
    guardHit: false,
    reviveT: 0,
  };
}

/**
 * Turn changed press counters into buffered presses, and note what is held. Called every tick,
 * including while the player or the chamber is frozen, so a tap made during hit-stop still counts.
 */
export function readPresses(p: Player, inp: InputFrame): void {
  p.held = inp.held;
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

function startDash(w: World, p: Player, move: Vec2): void {
  let dx = move.x;
  let dy = move.y;
  if (dx === 0 && dy === 0) {
    dx = dcos(p.aim);
    dy = dsin(p.aim);
  }
  const l = dhypot(dx, dy) || 1;
  KITS[p.classId].cancel(p);
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
  stepRally(w, p, dt);

  const move: Vec2 = { x: 0, y: 0 };
  moveInto(inp, move);
  if (p.state === 'down') {
    // down, but not out: a slow crawl toward help. Presses made meanwhile are not saved up.
    p.bufAttack = 0;
    p.bufSpecial = 0;
    p.bufDash = 0;
    p.bufInteract = 0;
    p.aim = aimAngleOf(inp);
    walk(w, p, move, REVIVE.crawl, dt);
    return;
  }
  const moving = move.x !== 0 || move.y !== 0;
  const kit = KITS[p.classId];

  // timers
  if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
  if (p.bufAttack > 0) p.bufAttack -= dt;
  if (p.bufSpecial > 0) p.bufSpecial -= dt;
  if (p.bufDash > 0) p.bufDash -= dt;
  if (p.bufInteract > 0) p.bufInteract -= dt;
  if (p.comboTimer > 0) p.comboTimer -= dt;
  if (p.fireT > 0) p.fireT -= dt;
  if (p.specialCd > 0) {
    p.specialCd -= dt;
    if (p.specialCd <= 0) {
      p.specialCd = 0;
      w.events.push({ type: 'specialReady', player: p.slot });
    }
  }
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
    shift(w, p, p.kx * dt, p.ky * dt);
    const k = dexp(-KNOCK_DECAY * dt);
    p.kx *= k;
    p.ky *= k;
    if (Math.abs(p.kx) < 0.02) p.kx = 0;
    if (Math.abs(p.ky) < 0.02) p.ky = 0;
  }

  if (p.state === 'dash') {
    // A dash slides along walls and stops at the edge of a pit like any other step.
    const speed = DASH.distance / DASH.time;
    const step = Math.min(dt, p.dashTimeLeft);
    shift(w, p, p.dashDirX * speed * step, p.dashDirY * speed * step);
    p.dashTimeLeft -= dt;
    p.vx = p.dashDirX * speed;
    p.vy = p.dashDirY * speed;
    if (p.dashTimeLeft <= 0) {
      const keep = PLAYER.speed * DASH.exitSpeed;
      p.vx = p.dashDirX * keep;
      p.vy = p.dashDirY * keep;
      rest(p, move);
      w.events.push({ type: 'dashEnd', player: p.slot, x: p.x, y: p.y });
    }
    return;
  }

  // A dash cancels anything else, at any moment.
  if (p.bufDash > 0 && p.dashCharges > 0) {
    startDash(w, p, move);
    return;
  }

  if (p.state !== 'idle' && p.state !== 'run') {
    kit.step(w, p, move, dt);
    return;
  }
  if (kit.begin(w, p, move)) {
    // the first tick of the action happens now, so starting one never costs a tick of movement
    kit.step(w, p, move, dt);
    return;
  }

  walk(w, p, move, 1, dt);
  rest(p, move);
}
