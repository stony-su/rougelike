// Bosses. An Echo whose definition names a brain is run by that brain instead of the ordinary
// attack cycle: the brain decides where it goes and what it does next, and may still use the
// moves in its definition (telegraph, wind-up, action, recovery) through `startMove` in ai.ts.
// Each brain lives in a file of its own in ./bosses and is listed there.
import { freezeWorld } from './combat';
import { FREEZE } from './tuning';
import type { Enemy, World } from './types';

export interface BossBrain {
  id: string;
  /** Once, when the boss has arrived in the chamber. Set up whatever it remembers in `e.mem`. */
  start(w: World, e: Enemy): void;
  /** Every tick it lives, whatever it is doing: phases, timers, things that go on in the background. */
  always(w: World, e: Enemy, dt: number): void;
  /** Every tick it is free to act (not winding up, attacking or recovering): move, and choose what to do next. */
  decide(w: World, e: Enemy, dt: number): void;
}

/** The share of its health a body has left, 0..1. */
export const healthShare = (e: Enemy): number => (e.maxHp > 0 ? Math.max(0, e.hp) / e.maxHp : 0);

/**
 * The phase a boss should be in for the health it has left: phase 1 begins when its health
 * falls to the first mark, phase 2 at the second, and so on. Marks run from high to low.
 */
export function phaseFor(e: Enemy, marks: readonly number[]): number {
  const h = healthShare(e);
  let n = 0;
  for (const m of marks) if (h <= m) n++;
  return n;
}

/** Move a boss into a phase. The whole party shares the moment: the chamber holds its breath. */
export function setPhase(w: World, e: Enemy, phase: number): void {
  if (e.phase === phase) return;
  e.phase = phase;
  freezeWorld(w, FREEZE.bossPhase);
  w.events.push({ type: 'bossPhase', id: e.id, kind: e.defId, phase, x: e.x, y: e.y });
}
