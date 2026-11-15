// The Bow, the String. Arrows that ricochet off the chamber and skip from one Echo to the next;
// the first leaves on the press and more follow while the button is held. The special throws a
// Ringstone. The Bow never roots its player: it only slows them while the string is busy.
import { rest, walk } from '../move';
import { arrowSpec, spawnProjectile } from '../projectiles';
import { throwStone } from '../stones';
import { BOW, RINGSTONE } from '../tuning';
import { BTN } from '../types';
import type { Player, World } from '../types';
import { wantsSpecial } from './kit';
import type { Kit } from './kit';

function loose(w: World, p: Player): void {
  // a run of three: the count goes on while the arrows keep coming, and starts again after a pause
  p.combo = p.comboTimer > 0 ? (p.combo + 1) % 3 : 0;
  p.comboTimer = BOW.comboWindow;
  const arrow = arrowSpec(p, p.aim);
  if (p.combo === 2) arrow.damage *= BOW.third;
  spawnProjectile(w, arrow);
  p.fireT = BOW.interval;
  p.bufAttack = 0;
  p.state = 'attack';
  p.stateTime = 0;
  p.actAngle = p.aim;
  p.actDur = BOW.pose;
  w.events.push({ type: 'loose', player: p.slot, n: p.combo, x: p.x, y: p.y, angle: p.aim });
}

/** Throw the stone or loose an arrow if the buttons ask for it. Returns true if either happened. */
function act(w: World, p: Player): boolean {
  if (wantsSpecial(w, p)) {
    throwStone(w, p);
    p.specialCd = RINGSTONE.cooldown;
    p.state = 'special';
    p.stateTime = 0;
    p.actAngle = p.aim;
    p.actDur = RINGSTONE.recovery;
    return true;
  }
  if (p.fireT <= 0 && (p.bufAttack > 0 || (p.held & BTN.attack) !== 0)) {
    loose(w, p);
    return true;
  }
  return false;
}

export const BOW_KIT: Kit = {
  begin: act,

  step(w, p, move, dt) {
    // The arrow leaves before the feet move, from exactly where the aim preview was drawn.
    act(w, p);
    walk(w, p, move, BOW.moveMul, dt);
    const drawing = p.state === 'attack' && (p.held & BTN.attack) !== 0;
    if (p.stateTime >= p.actDur && !drawing) rest(p, move);
  },

  cancel() {
    // nothing is held between arrows
  },
};
