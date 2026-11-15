// What the timed conditions on an enemy do, tick by tick: burn, chill, freeze, root, mark. The
// conditions themselves, and the plain ways of applying them, are in conditions.ts.
import { damageEnemy, stunEnemy } from './combat';
import { applyChill } from './conditions';
import type { Enemy, World } from './types';

export { applyBurn, applyChill, applyMark, applyRoot, newStatus, slowOf } from './conditions';

/** Freeze solid: a stun, so it respects stun immunity. Heavy bodies (mass 5 or more) are only chilled. */
export function applyFreeze(w: World, e: Enemy, seconds: number): boolean {
  if (e.dead) return false;
  if (e.def.mass >= 5) {
    applyChill(e, 0.4, seconds * 2);
    return false;
  }
  if (!stunEnemy(w, e, seconds)) return false;
  e.status.frozenT = seconds;
  return true;
}

export function stepStatus(w: World, e: Enemy, dt: number): void {
  const s = e.status;
  if (s.burnT > 0) {
    s.burnT -= dt;
    s.burnAcc += s.burnDps * dt;
    if (s.burnT <= 0) {
      s.burnT = 0;
      s.burnDps = 0;
    }
    // dealt in half-second bites so it reads as ticks, not a blur of numbers
    if (s.burnAcc >= Math.max(1, s.burnDps * 0.5) || (s.burnT === 0 && s.burnAcc >= 1)) {
      const amount = Math.floor(s.burnAcc);
      s.burnAcc -= amount;
      damageEnemy(w, e, amount, { kind: 'burn', by: -1, dx: 0, dy: -1 });
    }
  }
  if (s.chillT > 0) {
    s.chillT -= dt;
    if (s.chillT <= 0) {
      s.chillT = 0;
      s.chillSlow = 0;
    }
  }
  if (s.frozenT > 0) s.frozenT = Math.max(0, s.frozenT - dt);
  if (s.rootT > 0) s.rootT = Math.max(0, s.rootT - dt);
  if (s.rootImmune > 0) s.rootImmune = Math.max(0, s.rootImmune - dt);
  if (s.steamT > 0) s.steamT = Math.max(0, s.steamT - dt);
  if (s.markT > 0) {
    s.markT -= dt;
    if (s.markT <= 0) {
      s.markT = 0;
      s.markBonus = 0;
    }
  }
}
