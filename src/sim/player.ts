// A player: reading input, moving, dashing, being knocked about. What the attack and special
// buttons do belongs to the class kits in ./classes.
import { noBoons } from './boons';
import { PI, dcos, dexp, dhypot, dsin } from '../core/dmath';
import type { Vec2 } from '../core/exact';
import { pushBody } from './bodies';
import { BOW_KIT } from './classes/bow';
import { FIST_KIT } from './classes/fist';
import type { Kit } from './classes/kit';
import { SWORD_KIT } from './classes/sword';
import { damageEnemy, hittable, outOfReach } from './combat';
import type { ContentRegistry } from './defs';
import { aimAngleOf, aimDistOf, moveInto } from './input';
import { baseMods, computeMods } from './mods';
import { rest, shift, walk } from './move';
import { stepRally } from './rally';
import { BREAK, CLASS_HP, DASH, FIST, KNOCK_DECAY, PLAYER, REVIVE, TUNE } from './tuning';
import { PRESS, PRESS_COUNT } from './types';
import type { ClassId, Enemy, InputFrame, Player, World } from './types';

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
    hp: CLASS_HP[classId],
    maxHp: CLASS_HP[classId],
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
    boons: noBoons(),
    lastPresses: [-1, -1, -1, -1],
    held: 0,
    freeze: 0,
    chimes: 0,
    specialCd: 0,
    rally: 0,
    rallyT: 0,
    charge: 0,
    fireT: 0,
    volley: 0,
    whirlN: 0,
    whirled: 0,
    reviveT: 0,
    tunings: {},
    mods: baseMods(),
    afterT: 0,
    dodged: false,
    dashHit: [],
    chainT: 0,
    dashIn: false,
    stompT: 0,
    stomped: [],
    chase: 0,
    flurry: 0,
    opening: true,
    overtoneAcc: 0,
    stormAcc: 0,
    chorusAcc: 0,
    ringReady: false,
    ringNow: false,
    buffSwings: 0,
    actHaste: 1,
    sustainT: 0,
    wardLeft: 0,
    purseFrac: 0,
  };
}

/** Work out what a player's Tunings add up to, and the limits that follow from them. Health is left alone. */
export function equip(p: Player, content: ContentRegistry): void {
  p.mods = computeMods(p.tunings, content.tunings, content.harmonies);
  // what the Attunement gives rides on top of whatever the Tunings add up to
  p.mods.dashRecharge *= 1 - p.boons.dash;
  p.mods.chimeMul *= 1 + p.boons.fortune;
  p.dashMaxCharges = DASH.charges + p.mods.dashCharges;
}

/** Give a player one more rank of a Tuning, now. Health gained is healed at once. */
export function grantTuning(w: World, p: Player, id: string): void {
  const def = w.content.tunings[id];
  if (!def) return;
  const rank = Math.min(def.maxRank, (p.tunings[id] ?? 0) + 1);
  p.tunings[id] = rank;
  const health = p.mods.maxHp;
  const ward = p.mods.ward;
  equip(p, w.content);
  const gained = p.mods.maxHp - health;
  if (gained !== 0) {
    p.maxHp += gained;
    p.hp = Math.max(1, Math.min(p.maxHp, p.hp + gained));
  }
  // a ward taken in the middle of a chamber is ready at once
  if (p.mods.ward > ward) p.wardLeft += p.mods.ward - ward;
  w.events.push({ type: 'tuning', player: p.slot, id, rank, x: p.x, y: p.y });
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
  p.dodged = false;
  p.dashHit.length = 0;
  p.dashCharges -= 1;
  p.iframes = Math.max(p.iframes, DASH.iframes);
  p.bufDash = 0;
  p.kx = 0;
  p.ky = 0;
  p.state = 'dash';
  p.stateTime = 0;
  w.events.push({ type: 'dash', player: p.slot, x: p.x, y: p.y, dx: p.dashDirX, dy: p.dashDirY });
}

/** Ram: a dash knocks aside every Echo it passes, once each. */
function ram(w: World, p: Player): void {
  for (const e of w.enemies) {
    if (!hittable(e) || outOfReach(e) || p.dashHit.includes(e.id)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const reach = p.radius + e.radius + TUNE.ramReach;
    if (dx * dx + dy * dy > reach * reach) continue;
    p.dashHit.push(e.id);
    const d = dhypot(dx, dy);
    // aside: away from the line of the dash; an Echo dead ahead goes the way the dash is going
    const ax = d > 1e-6 ? dx / d : p.dashDirX;
    const ay = d > 1e-6 ? dy / d : p.dashDirY;
    damageEnemy(w, e, p.mods.ramDamage, { kind: 'direct', by: p.slot, dx: ax, dy: ay });
    if (!e.dead) pushBody(w, e, ax, ay, p.mods.ram, p.slot);
  }
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
  if (p.afterT > 0) p.afterT = Math.max(0, p.afterT - dt);
  if (p.chainT > 0) p.chainT = Math.max(0, p.chainT - dt);
  if (p.stompT > 0) p.stompT = Math.max(0, p.stompT - dt);
  if (p.specialCd > 0) {
    p.specialCd -= dt;
    if (p.specialCd <= 0) {
      p.specialCd = 0;
      w.events.push({ type: 'specialReady', player: p.slot });
    }
  }
  if (p.dashCharges < p.dashMaxCharges) {
    p.dashRecharge += dt;
    if (p.dashRecharge >= DASH.recharge * p.mods.dashRecharge) {
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
    // An attack asked for during a dash is kept until the dash is over, and comes out of it.
    if (p.bufAttack > 0) p.bufAttack = Math.max(p.bufAttack, p.dashTimeLeft + PLAYER.buffer);
    // A dash slides along walls and stops at the edge of a pit like any other step.
    let speed = DASH.distance / DASH.time;
    let reach = Infinity;
    if (p.chase !== 0) {
      // The Fist after a stomp: it flies to an Echo the stomp struck, wherever that has got to.
      let e: Enemy | null = null;
      for (const o of w.enemies) if (o.id === p.chase && hittable(o)) e = o;
      if (!e) {
        p.chase = 0;
        p.flurry = 0;
        p.dashTimeLeft = 0;
      } else {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = dhypot(dx, dy);
        speed = BREAK.chaseSpeed;
        // it pulls up at arm's length
        reach = Math.max(0, d - (FIST.reach * 0.6 + e.radius));
        if (d > 1e-6) {
          p.dashDirX = dx / d;
          p.dashDirY = dy / d;
        }
        if (reach <= 0.02) p.dashTimeLeft = 0;
      }
    }
    const step = Math.min(dt, Math.max(0, p.dashTimeLeft), reach / speed);
    shift(w, p, p.dashDirX * speed * step, p.dashDirY * speed * step);
    if (p.mods.ram > 0) ram(w, p);
    p.dashTimeLeft -= dt;
    p.vx = p.dashDirX * speed;
    p.vy = p.dashDirY * speed;
    if (p.dashTimeLeft <= 0) {
      const keep = PLAYER.speed * DASH.exitSpeed;
      p.vx = p.dashDirX * keep;
      p.vy = p.dashDirY * keep;
      rest(p, move);
      w.events.push({ type: 'dashEnd', player: p.slot, x: p.x, y: p.y });
      // Whatever was asked for meanwhile begins on this same tick, and knows it comes out of a dash:
      // the dash runs on into the blow instead of stopping for it.
      p.chainT = DASH.chain;
      if (kit.begin(w, p, move)) kit.step(w, p, move, dt);
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
