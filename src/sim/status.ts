// Timed conditions on enemies: burn, chill, freeze, root, mark.
import { damageEnemy, stunEnemy } from './combat';
import { LINES } from './tuning';
import type { Enemy, EnemyStatus, World } from './types';

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
  zoneSlow: 0,
  zoneLineBonus: 0,
  rootImmune: 0,
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

/** Freeze solid: a stun, so it respects stun immunity. Bosses (mass 5 or more) are only chilled. */
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

/** Root: cannot move, can still act. Per-enemy immunity window afterwards. */
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

/** Total movement slow on an enemy, 0..1. Slows do not stack; the strongest applies. */
export function slowOf(e: Enemy): number {
  const s = e.status;
  if (s.rootT > 0 || s.frozenT > 0) return 1;
  return Math.max(e.inPlot ? LINES.plotSlow : 0, s.chillT > 0 ? s.chillSlow : 0, s.zoneSlow);
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
      damageEnemy(w, e, amount, { kind: 'burn', dx: 0, dy: -1 });
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
  if (s.markT > 0) {
    s.markT -= dt;
    if (s.markT <= 0) {
      s.markT = 0;
      s.markBonus = 0;
    }
  }
}
