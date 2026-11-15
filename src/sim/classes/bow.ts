// The Bow, the String. Arrows that ricochet off the chamber and skip from one Echo to the next;
// the first leaves on the press and more follow while the button is held. The special is the
// Hook Shot: a line fired where the Bow aims, along which the Bow is pulled, over pits and through
// Echoes, with nothing able to hurt it on the way; what it passes is knocked aside, and the arrows
// that follow its landing leave one on the heels of another. But for that pull the Bow never
// roots its player: it only slows them while the string is busy.
import { dcos, dhypot, dsin } from '../../core/dmath';
import type { Vec2 } from '../../core/exact';
import { pushBody } from '../bodies';
import { SKIN, castCircle, newHit } from '../cast';
import { damageEnemy, hittable, outOfReach } from '../combat';
import { rest, walk } from '../move';
import { arrowSpec, spawnProjectile } from '../projectiles';
import { isClear } from '../room';
import { BOW, DASH, HITSTOP, HOOK, PLAYER, STRING } from '../tuning';
import { BTN } from '../types';
import type { Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

function loose(w: World, p: Player): void {
  // a run of three: the count goes on while the arrows keep coming, and starts again after a pause
  p.combo = p.comboTimer > 0 ? (p.combo + 1) % 3 : 0;
  // and the volley is counted the same way, for as long as the string does not rest
  p.volley = p.comboTimer > 0 ? p.volley + 1 : 1;
  p.comboTimer = BOW.comboWindow;
  const arrow = arrowSpec(p, p.aim);
  if (p.combo === 2) arrow.damage *= BOW.third;
  // out of a dash: the arrow is loosed on the run, harder and faster
  p.dashIn = p.chainT > 0;
  p.chainT = 0;
  if (p.dashIn) {
    arrow.damage *= DASH.strike;
    arrow.vx *= DASH.strike;
    arrow.vy *= DASH.strike;
  }
  if (p.mods.heavyMul > 0 && p.volley % STRING.heavyEvery === 0) {
    // Heavy Fourth: every fourth arrow of the volley is a heavy one
    arrow.damage *= p.mods.heavyMul;
    arrow.pierce = (arrow.pierce ?? 0) + p.mods.heavyPierce;
    arrow.bounces = (arrow.bounces ?? 0) + STRING.heavyBounces;
  }
  p.fireT = BOW.interval;
  if (p.quiver > 0) {
    // after a Hook Shot: the arrows that were ready leave at once, the next on the heels of this one
    p.quiver--;
    arrow.bounces = (arrow.bounces ?? 0) + p.mods.quiverBounces;
    if (p.quiver > 0) p.fireT = HOOK.quick;
    else p.quiverT = 0;
  }
  spawnProjectile(w, arrow);
  p.bufAttack = 0;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = BOW.pose;
  w.events.push({ type: 'loose', player: p.slot, n: p.combo, x: p.x, y: p.y, angle: p.aim });
}

/**
 * How far a line fired along `angle` at a point `want` tiles off would pull the Bow: to that
 * point, no further than the line reaches, short of the first wall, post or bumper, and back from
 * there to the last place on the line where there is floor to stand on. 0 if there is nowhere to go.
 */
export function hookReach(w: World, p: Player, angle: number, want: number): number {
  const most = Math.max(HOOK.least, Math.min(want, HOOK.range + p.mods.hookRange));
  const ux = dcos(angle);
  const uy = dsin(angle);
  // pits are nothing to a line, or to whoever is pulled along it
  const hit = newHit();
  let far = most;
  if (castCircle(w.room.geo, false, p.x, p.y, ux * most, uy * most, p.radius, hit)) far = hit.t * most - SKIN * 4;
  for (let d = far; d >= HOOK.least; d -= HOOK.probe) if (isClear(w.room, p.x + ux * d, p.y + uy * d, p.radius)) return d;
  return 0;
}

/** Fire the line. False, and nothing spent, if there is nowhere for it to pull the Bow to. */
function startHook(w: World, p: Player, spare: boolean): boolean {
  const far = hookReach(w, p, p.aim, p.aimDist);
  if (far <= 0) {
    w.events.push({ type: 'refused', player: p.slot, what: 'special' });
    return false;
  }
  // Slingshot: a line fired again within a moment of landing costs nothing
  p.hookSpare = spare;
  p.hookFree = 0;
  if (!spare) p.specialCd = HOOK.cooldown * (1 - p.mods.hookCd);
  p.hookX = p.x + dcos(p.aim) * far;
  p.hookY = p.y + dsin(p.aim) * far;
  p.state = 'special';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = HOOK.windup + far / HOOK.speed;
  p.dashHit.length = 0;
  p.dashIn = false;
  p.chainT = 0;
  p.vx = 0;
  p.vy = 0;
  p.kx = 0;
  p.ky = 0;
  // nothing reaches the Bow on the line, or for a moment after it lets go
  p.iframes = Math.max(p.iframes, p.actDur + HOOK.safe);
  w.events.push({ type: 'hook', player: p.slot, x: p.x, y: p.y, toX: p.hookX, toY: p.hookY });
  return true;
}

/** Everything the pull passes is struck once and knocked aside, off the line and a little onward. */
function knockAside(w: World, p: Player, ux: number, uy: number): void {
  for (const e of w.enemies) {
    if (!hittable(e) || outOfReach(e) || p.dashHit.includes(e.id)) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const reach = p.radius + e.radius + HOOK.width;
    if (ex * ex + ey * ey > reach * reach) continue;
    p.dashHit.push(e.id);
    // to whichever side of the line it stands on
    const side = ey * ux - ex * uy >= 0 ? 1 : -1;
    const ax = -uy * side * HOOK.aside + ux * HOOK.onward;
    const ay = ux * side * HOOK.aside + uy * HOOK.onward;
    damageEnemy(w, e, HOOK.damage + p.mods.hookDamage, { kind: 'direct', by: p.slot, dx: ax, dy: ay, heavy: true, freeze: HITSTOP.light });
    if (!e.dead) pushBody(w, e, ax, ay, HOOK.impulse * p.mods.hookImpulse, p.slot);
  }
}

/** The pull is over: the arrows that follow are ready, and with Slingshot so is one more line. */
function land(w: World, p: Player, move: Vec2): void {
  p.x = p.hookX;
  p.y = p.hookY;
  p.vx = 0;
  p.vy = 0;
  p.quiver = HOOK.quiver + p.mods.quiver;
  p.quiverT = HOOK.quiverTime;
  p.fireT = 0;
  // a line that was itself for nothing gives no other
  p.hookFree = p.mods.slingshot > 0 && !p.hookSpare ? HOOK.again : 0;
  p.hookSpare = false;
  rest(p, move);
  w.events.push({ type: 'hookLand', player: p.slot, x: p.x, y: p.y });
}

function stepHook(w: World, p: Player, move: Vec2, dt: number): void {
  // an arrow asked for on the way is kept until the Bow has landed, and leaves then
  if (p.bufAttack > 0) p.bufAttack = Math.max(p.bufAttack, p.actDur - p.stateTime + PLAYER.buffer);
  // while the line flies the Bow stands braced; then it goes, straight, whatever lies under it
  if (p.stateTime < HOOK.windup) return;
  const dx = p.hookX - p.x;
  const dy = p.hookY - p.y;
  const d = dhypot(dx, dy);
  const step = HOOK.speed * dt;
  if (d <= step) {
    land(w, p, move);
    // what was asked for meanwhile begins on this same tick
    act(w, p);
    return;
  }
  const ux = dx / d;
  const uy = dy / d;
  p.x += ux * step;
  p.y += uy * step;
  p.vx = ux * HOOK.speed;
  p.vy = uy * HOOK.speed;
  p.stride += step;
  knockAside(w, p, ux, uy);
}

/** True while the Bow is on its line: from the moment the line is fired until it has been pulled to the end of it. */
const onLine = (p: Player): boolean => p.state === 'special';

/** Fire the line or loose an arrow if the buttons ask for it. Returns true if either happened. */
function act(w: World, p: Player): boolean {
  // Slingshot: for a moment after landing the line may be fired again whatever the wait says
  const spare = p.hookFree > 0 && p.bufSpecial > 0;
  if (spare) p.bufSpecial = 0;
  if ((spare || wantsSpecial(w, p)) && startHook(w, p, spare)) return true;
  // (the string does not wait for its own rest after a dash: the shot comes out of the dash)
  if ((p.fireT <= 0 || p.chainT > 0) && (p.bufAttack > 0 || (p.held & BTN.attack) !== 0)) {
    loose(w, p);
    return true;
  }
  return false;
}

export const BOW_KIT: Kit = {
  begin: act,

  step(w, p, move, dt) {
    if (onLine(p)) {
      stepHook(w, p, move, dt);
      return;
    }
    // The arrow leaves before the feet move, from exactly where the aim preview was drawn.
    if (act(w, p) && onLine(p)) return;
    walk(w, p, move, BOW.moveMul, dt);
    const drawing = p.state === 'attack' && (p.held & BTN.attack) !== 0;
    if (p.stateTime >= p.actDur && !drawing) rest(p, move);
  },

  cancel() {
    // nothing is held between arrows
  },

  // on the line, with perhaps a pit under it, the Bow cannot be cut loose by a dash
  locked: onLine,
};
