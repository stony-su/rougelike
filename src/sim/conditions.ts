// The timed conditions an enemy can be under, and the plain ways of putting them there. Nothing
// here deals damage, so the rules of damage (combat.ts) can use it; what the conditions do each
// tick is in status.ts.
import type { Enemy, EnemyStatus } from './types';

export const newStatus = (): EnemyStatus => ({
  burnDps: 0,
  burnT: 0,
  burnAcc: 0,
  chillSlow: 0,
  chillT: 0,
  frozenT: 0,
  rootT: 0,
  markBonus: 0,
  markT: 0,
  rootImmune: 0,
  steamT: 0,
});

/** Burn does not stack; the stronger burn and the longer time win. */
export function applyBurn(e: Enemy, dps: number, seconds: number): void {
  if (e.dead) return;
  e.status.burnDps = Math.max(e.status.burnDps, dps);
  e.status.burnT = Math.max(e.status.burnT, seconds);
}

export function applyChill(e: Enemy, slow: number, seconds: number): void {
  if (e.dead) return;
  e.status.chillSlow = Math.max(e.status.chillSlow, slow);
  e.status.chillT = Math.max(e.status.chillT, seconds);
}

/** Root: cannot move, can still act. For a while afterwards it cannot be rooted again. */
export function applyRoot(e: Enemy, seconds: number, immunity: number): boolean {
  if (e.dead || e.status.rootImmune > 0 || e.def.mass >= 5) return false;
  e.status.rootT = Math.max(e.status.rootT, seconds);
  e.status.rootImmune = seconds + immunity;
  return true;
}

export function applyMark(e: Enemy, bonus: number, seconds: number): void {
  if (e.dead) return;
  e.status.markBonus = Math.max(e.status.markBonus, bonus);
  e.status.markT = Math.max(e.status.markT, seconds);
}

/** Put out the fire and the frost together (they have just burst into steam). */
export function clearElements(e: Enemy): void {
  const s = e.status;
  s.burnT = 0;
  s.burnDps = 0;
  s.burnAcc = 0;
  s.chillT = 0;
  s.chillSlow = 0;
}

/** Total movement slow on an enemy, 0..1. Slows do not stack; the strongest applies. */
export function slowOf(e: Enemy): number {
  const s = e.status;
  if (s.rootT > 0 || s.frozenT > 0) return 1;
  return s.chillT > 0 ? s.chillSlow : 0;
}
