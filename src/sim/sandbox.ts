// A training yard: keeps sending small waves at spawn marks so combat can be exercised on its
// own. Used by tests, by the stress scene and by the ?yard debug mode.
import { spawnEnemy } from './ai';
import type { EnemyDef } from './defs';
import type { World } from './types';

export interface Yard {
  wave: number;
  timer: number;
  /** Stop after this many waves (0 = endless). */
  maxWaves: number;
  done: boolean;
}

export function createYard(maxWaves = 0): Yard {
  return { wave: 0, timer: 0.8, maxWaves, done: false };
}

/** Spawn `count` enemies on the marks farthest from the player. */
export function spawnWave(w: World, def: EnemyDef, count: number): void {
  const p = w.player;
  const marks = w.room.spawnMarks.slice().sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
  for (let i = 0; i < count; i++) {
    const m = marks[i % Math.max(1, marks.length)] ?? { x: w.room.cx, y: w.room.cy };
    const jitter = i >= marks.length ? 0.7 : 0.25;
    spawnEnemy(w, def, m.x + w.rng.float(-jitter, jitter), m.y + w.rng.float(-jitter, jitter));
  }
}

export function stepYard(w: World, yard: Yard, def: EnemyDef, dt: number): void {
  if (yard.done || w.player.state === 'dead') return;
  if (w.enemies.length > 0) return;
  yard.timer -= dt;
  if (yard.timer > 0) return;
  if (yard.maxWaves > 0 && yard.wave >= yard.maxWaves) {
    yard.done = true;
    return;
  }
  yard.wave++;
  yard.timer = 1.4;
  spawnWave(w, def, Math.min(2 + yard.wave, 6));
  w.events.push({ type: 'waveStart', wave: yard.wave });
}
