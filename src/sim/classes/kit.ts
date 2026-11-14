// What a class is, to the player step: three hooks. The step owns movement, the dash and being
// hurt; a kit owns everything the attack and special buttons do.
import type { Vec2 } from '../../core/exact';
import type { Player, World } from '../types';

export interface Kit {
  /**
   * Called every tick the player is free (standing or running). Starts an attack or the special
   * if the buttons ask for one; returns true if it did.
   */
  begin(w: World, p: Player, move: Vec2): boolean;
  /** Advances an action in progress: any state that is not idle, run, dash or down. */
  step(w: World, p: Player, move: Vec2, dt: number): void;
  /** A dash or a fall cut the action short: drop whatever it was holding. */
  cancel(p: Player): void;
}

/** A buffered press of the special. True (and the press is used up) if the special is ready; says so if it is not. */
export function wantsSpecial(w: World, p: Player): boolean {
  if (p.bufSpecial <= 0) return false;
  p.bufSpecial = 0;
  if (p.specialCd > 0) {
    w.events.push({ type: 'refused', player: p.slot, what: 'special' });
    return false;
  }
  return true;
}
