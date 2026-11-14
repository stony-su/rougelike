// Rally: the meter that Returns build. Every hit delivered by something sent back adds to the
// Rally of the player who sent it, and every point makes that player's Returns hit harder.
import { RALLY } from './tuning';
import type { Player, World } from './types';

export const playerBySlot = (w: World, slot: number): Player | null => {
  for (const p of w.players) if (p.slot === slot) return p;
  return null;
};

/** What a Return by this player is multiplied by right now. A hit nobody sent (slot -1) is not multiplied. */
export function rallyMul(w: World, slot: number): number {
  const p = playerBySlot(w, slot);
  return p ? 1 + RALLY.perPoint * p.rally : 1;
}

/** Count a Return of the given weight for a player. Call it after the hit, so the hit used the Rally before it. */
export function addRally(w: World, slot: number, weight: number, x: number, y: number): void {
  const p = playerBySlot(w, slot);
  if (!p) return;
  p.rally = Math.min(RALLY.cap, p.rally + weight);
  p.rallyT = 0;
  w.stats.returns++;
  if (p.rally > w.stats.bestRally) w.stats.bestRally = p.rally;
  w.events.push({ type: 'rally', player: slot, value: p.rally, weight, x, y });
}

/** Rally falls to nothing after a while without a Return. */
export function stepRally(w: World, p: Player, dt: number): void {
  if (p.rally <= 0) return;
  p.rallyT += dt;
  if (p.rallyT >= RALLY.hold) {
    w.events.push({ type: 'rallyBreak', player: p.slot, value: p.rally });
    p.rally = 0;
  }
}
